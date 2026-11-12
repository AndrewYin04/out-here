// Muse smoke test: one Ember call, one Spark call (strict JSON schema, minimal
// reasoning) and one image. Writes docs/evidence/S-MUSE.md (no key) and saves the
// image to .verify/muse-smoke.webp. Run with: npm run eval:muse
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import OpenAI from "openai";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const { MUSE_API_KEY, MUSE_BASE_URL } = process.env;
if (!MUSE_API_KEY || !MUSE_BASE_URL) {
  console.error(`MUSE_API_KEY: ${MUSE_API_KEY ? "SET" : "MISSING"}`);
  console.error(`MUSE_BASE_URL: ${MUSE_BASE_URL ? "SET" : "MISSING"}`);
  process.exit(2);
}
const muse = new OpenAI({ apiKey: MUSE_API_KEY, baseURL: MUSE_BASE_URL, maxRetries: 0, timeout: 60_000 });

const intentSchema = {
  name: "intent",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      activity: { type: "string" },
      minutes: { type: ["integer", "null"] },
      budgetUsd: { type: ["number", "null"] },
    },
    required: ["activity", "minutes", "budgetUsd"],
  },
};

const pickSchema = {
  name: "pick",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      questId: { type: "string" },
      reason: { type: "string" },
    },
    required: ["questId", "reason"],
  },
};

const calls = [
  {
    label: "Ember parse",
    model: "muse-ember-1.0",
    schema: intentSchema,
    messages: [
      { role: "system", content: "Extract the user's plan intent as JSON." },
      { role: "user", content: "hungry, got like 40 min, under $15" },
    ],
  },
  {
    label: "Spark rank",
    model: "muse-spark-1.3",
    schema: pickSchema,
    messages: [
      {
        role: "system",
        content: "Pick the one candidate quest that best fits the user. Use only an id from the list. Reply as JSON.",
      },
      {
        role: "user",
        content:
          'User: hungry, 40 min, under $15, likes dumplings.\nCandidates: [{"id":"q1","title":"Dumpling Den hangout","price":12,"walkMin":9},{"id":"q2","title":"Pickup volleyball","price":0,"walkMin":14}]',
      },
    ],
  },
];

const results = [];
const errText = (err) => String(err?.message ?? err).replace(MUSE_API_KEY, "[redacted]");

for (const c of calls) {
  const t0 = Date.now();
  try {
    const { data, response } = await muse.chat.completions
      .create({
        model: c.model,
        messages: c.messages,
        reasoning_effort: "minimal",
        response_format: { type: "json_schema", json_schema: c.schema },
      })
      .withResponse();
    const ms = Date.now() - t0;
    const content = data.choices?.[0]?.message?.content ?? "";
    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch {
      parsed = { unparsed: content.slice(0, 500) };
    }
    results.push({ ...c, status: response.status, ok: response.ok, ms, usage: data.usage ?? null, parsed });
  } catch (err) {
    results.push({ ...c, status: err?.status ?? "error", ok: false, ms: Date.now() - t0, usage: null, parsed: null, error: errText(err) });
  }
}

let image;
{
  const t0 = Date.now();
  try {
    const { data, response } = await muse.images
      .generate({
        model: "muse-image-1.0",
        prompt: "A friendly fictional young adult holding a paper bowl of dumplings outdoors at golden hour, candid phone photo",
        size: "1024x1024",
        output_format: "webp",
      })
      .withResponse();
    const ms = Date.now() - t0;
    const item = data.data?.[0] ?? {};
    let buf;
    if (item.b64_json) buf = Buffer.from(item.b64_json, "base64");
    else if (item.url) buf = Buffer.from(await (await fetch(item.url)).arrayBuffer());
    let saved = null;
    if (buf) {
      mkdirSync(join(root, ".verify"), { recursive: true });
      writeFileSync(join(root, ".verify", "muse-smoke.webp"), buf);
      saved = { path: ".verify/muse-smoke.webp", bytes: buf.length, source: item.b64_json ? "b64_json" : "url" };
    }
    image = { status: response.status, ok: response.ok, ms, usage: data.usage ?? null, saved };
  } catch (err) {
    image = { status: err?.status ?? "error", ok: false, ms: Date.now() - t0, usage: null, saved: null, error: errText(err) };
  }
}

const now = new Date().toISOString();
const lines = [
  "# S-MUSE: Muse smoke test",
  "",
  `Run at ${now} by \`npm run eval:muse\` (\`scripts/muse-smoke.mjs\`). Base URL from \`MUSE_BASE_URL\`; no key is recorded.`,
  "",
  "| Call | Model | HTTP | OK | Latency (ms) | Tokens in / out (reasoning) |",
  "|---|---|---|---|---|---|",
];
for (const r of results) {
  const u = r.usage;
  const tok = u
    ? `${u.prompt_tokens} / ${u.completion_tokens} (${u.completion_tokens_details?.reasoning_tokens ?? "n/a"})`
    : "n/a";
  lines.push(`| ${r.label} | ${r.model} | ${r.status} | ${r.ok} | ${r.ms} | ${tok} |`);
}
lines.push(
  `| Image 1024x1024 webp | muse-image-1.0 | ${image.status} | ${image.ok} | ${image.ms} | ${image.usage ? JSON.stringify(image.usage) : "n/a"} |`,
  "",
);
for (const r of results) {
  lines.push(`## ${r.label} (${r.model})`, "", "Parsed JSON:", "", "```json", JSON.stringify(r.parsed, null, 2), "```", "");
  if (r.error) lines.push(`Error: ${r.error}`, "");
}
lines.push("## Image (muse-image-1.0)", "");
lines.push(image.saved ? `Saved ${image.saved.path} (${image.saved.bytes} bytes, from ${image.saved.source}). The file is gitignored.` : "No image saved.");
if (image.error) lines.push("", `Error: ${image.error}`);
lines.push("");

mkdirSync(join(root, "docs", "evidence"), { recursive: true });
writeFileSync(join(root, "docs", "evidence", "S-MUSE.md"), lines.join("\n"));

for (const r of results) console.log(`${r.model}: HTTP ${r.status} ok=${r.ok} ${r.ms} ms`);
console.log(`muse-image-1.0: HTTP ${image.status} ok=${image.ok} ${image.ms} ms${image.saved ? ` saved ${image.saved.bytes} bytes` : ""}`);
console.log("wrote docs/evidence/S-MUSE.md");
if (!results.every((r) => r.ok) || !image.ok) process.exitCode = 1;
