// Generates every image referenced by supabase/seed-content.json that is missing
// under public/seed/, with Meta Muse Image (muse-image-1.0). Raw outputs are cached
// in .cache/images/<sha256(prompt)>.webp so re-runs never re-bill. Hard cap: 200
// generated images per run. A policy block falls back to a local SVG placeholder.
// Run: npm run gen:images   (node --env-file=.env.local scripts/gen-images.mjs)
// Regenerate specific files: npm run gen:images -- --regen=/seed/people/alex.webp,/seed/posts/p006.webp
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import sharp from "sharp";
import { ROOT, byHandle, groupBySlug, EVENTS, LISTINGS, STORIES, writeSection } from "./gen-content.mjs";

const MODEL = process.env.MUSE_MODEL_IMAGE || "muse-image-1.0";
const CAP = 200;
const CONCURRENCY = 4;
const PRICE = 0.01;
const CACHE = join(ROOT, ".cache", "images");
const PUB = join(ROOT, "public");
const NO_TEXT = "No text overlays, no captions, no logos, no brand names, no readable signs, no recognizable real storefronts or landmarks.";

const data = JSON.parse(readFileSync(join(ROOT, "supabase", "seed-content.json"), "utf8"));
const eventHint = Object.fromEntries(EVENTS.map((e) => [e[0], e[9]]));
const listingHint = { ...Object.fromEntries(LISTINGS.map((l) => [l[0], l[5]])),
  // "45 Minutes to Thrift" pop-up items (src/features/data/seed-build.ts POPUP_SALE)
  p01: "navy zip-up track jacket with white stripes down the sleeves, on a hanger", p02: "small Y2K denim shoulder purse with a silver clasp",
  p03: "brown corduroy bucket hat", p04: "faded black graphic band t-shirt, folded" };

// ---------- jobs: [path, prompt, kind] ----------
const jobs = [];
for (const p of data.people) {
  const o = byHandle[p.handle];
  const desc = `${o.look}, who is a ${o.role.split(",")[0]} and likes ${o.interests.slice(0, 2).join(" and ")}`;
  jobs.push({ path: p.avatar, kind: "portrait", label: p.name, prompt: `Casual smartphone photo of a fictional ${p.age}-year-old ${desc}, head and shoulders, looking at the camera, natural light, everyday setting in a California suburb, not a celebrity, not a real person, no text.` });
}
for (const g of data.groups) jobs.push({ path: g.cover, kind: "cover", label: g.name, prompt: `Realistic wide photo, ${groupBySlug[g.slug].coverHint}. Natural light, candid, ordinary fictional people if any. ${NO_TEXT}` });
for (const p of data.posts.filter((x) => x.image)) {
  const where = p.target.type === "group" ? ` posted in a group called "${groupBySlug[p.target.slug].name}"` : "";
  jobs.push({ path: p.image, kind: "post", label: p.id, prompt: `Realistic casual smartphone photo attached to this Facebook post${where}: "${p.text.slice(0, 280)}". Show the scene, food, objects or place the post describes, set around Menlo Park and Palo Alto, California. Any people are ordinary fictional young adults, shown candidly. ${NO_TEXT}` });
}
data.stories.forEach((s, i) => jobs.push({ path: s.image, kind: "story", label: `story ${i + 1}`, prompt: `Vertical casual phone photo for a social media story: ${STORIES[i][2]}. Natural light, everyday, candid. ${NO_TEXT}` }));
for (const e of data.events) jobs.push({ path: e.cover, kind: "event", label: e.slug, prompt: `Realistic photo for a local event cover: ${eventHint[e.slug]} (${e.title}), a ${e.category} meetup for young adults at a small neighborhood spot. Warm, inviting, candid, ordinary fictional people. ${NO_TEXT}` });
for (const l of data.listings) jobs.push({ path: l.image, kind: "listing", label: l.id, prompt: `Realistic Facebook Marketplace phone photo of a used ${listingHint[l.id]} for sale, sitting on a wood floor or table in an apartment, daylight, plain background. ${NO_TEXT}` });

// Watch video posters (src/shared/seed/videos.json): fictional creators, no text.
const VIDEOS = JSON.parse(readFileSync(join(ROOT, "src", "shared", "seed", "videos.json"), "utf8"));
for (const v of VIDEOS) jobs.push({ path: `/seed/videos/${v.key}.webp`, kind: v.format === "reel" ? "reelposter" : "video", label: v.key, prompt: `Realistic still frame from a casual phone video posted on social media: ${v.poster}. Natural light, candid, ordinary fictional people if any. ${NO_TEXT}` });
// Keyframes for the AI clips (scripts/gen-clips.mjs turns them into short MP4s): one scene per video.
for (const v of VIDEOS) (v.frames ?? []).forEach((fr, i) => jobs.push({ path: `/seed/videos/frames/${v.key}-${i + 1}.webp`, kind: v.format === "reel" ? "reelframe" : "clip", label: `${v.key} ${i + 1}`, prompt: `Realistic still frame from a casual phone video posted on social media, same scene as "${v.title}": ${fr}. Natural light, candid, ordinary fictional people if any. ${NO_TEXT}` }));

const SIZE = { reelframe: [720, 1280, 80], reelposter: [450, 800, 78], clip: [1280, 720, 80], video: [800, 450, 78], portrait: [256, 256, 80], cover: [1200, 450, 78], post: [800, 600, 78], event: [800, 600, 78], story: [800, 1422, 78], listing: [600, 600, 78] };
const sha = (s) => createHash("sha256").update(s).digest("hex");
const abs = (p) => join(PUB, ...p.split("/").filter(Boolean));

// ---------- --regen ----------
const regenArg = process.argv.find((a) => a.startsWith("--regen="));
if (regenArg) {
  for (const p of regenArg.slice(8).split(",").filter(Boolean)) {
    const j = jobs.find((x) => x.path === p);
    if (!j) { console.error(`--regen: unknown path ${p}`); continue; }
    const c = join(CACHE, `${sha(MODEL + "\n" + j.prompt)}.webp`);
    for (const f of [c, abs(p)]) if (existsSync(f)) unlinkSync(f);
    console.log(`regen: cleared ${p}`);
  }
}

// ---------- plan ----------
const todo = jobs.filter((j) => !existsSync(abs(j.path)));
const needCalls = todo.filter((j) => !existsSync(join(CACHE, `${sha(MODEL + "\n" + j.prompt)}.webp`))).length;
console.log(`images referenced=${jobs.length} missing=${todo.length} needApiCalls=${needCalls} cap=${CAP}`);
if (needCalls > CAP) {
  console.error(`STOP: ${needCalls} generations needed, over the hard cap of ${CAP}. Nothing generated.`);
  process.exit(1);
}

let muse = null;
async function client() {
  if (muse) return muse;
  if (!process.env.MUSE_API_KEY || !process.env.MUSE_BASE_URL) throw new Error("MUSE_API_KEY / MUSE_BASE_URL missing");
  const { default: OpenAI } = await import("openai");
  muse = new OpenAI({ apiKey: process.env.MUSE_API_KEY, baseURL: process.env.MUSE_BASE_URL, maxRetries: 0, timeout: 120_000 });
  return muse;
}

function fallbackSvg(job) {
  const h = parseInt(sha(job.path).slice(0, 6), 16);
  const hue = h % 360, hue2 = (hue + 40) % 360;
  const [w, ht] = SIZE[job.kind];
  if (job.kind === "portrait") {
    const initials = job.label.split(" ").map((s) => s[0]).join("").slice(0, 2).toUpperCase();
    return `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="hsl(${hue},55%,78%)"/><circle cx="128" cy="104" r="48" fill="hsl(${hue},35%,45%)"/><rect x="56" y="164" width="144" height="110" rx="70" fill="hsl(${hue},35%,45%)"/><text x="128" y="118" font-family="Arial" font-size="40" font-weight="700" fill="#fff" text-anchor="middle">${initials}</text></svg>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${ht}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${hue},60%,70%)"/><stop offset="1" stop-color="hsl(${hue2},60%,50%)"/></linearGradient></defs><rect width="${w}" height="${ht}" fill="url(#g)"/></svg>`;
}

async function writeOut(job, buf) {
  const [w, h, q] = SIZE[job.kind];
  const out = abs(job.path);
  mkdirSync(dirname(out), { recursive: true });
  const pos = job.kind === "portrait" ? sharp.strategy.attention : "centre";
  await sharp(buf).resize(w, h, { fit: "cover", position: pos }).webp({ quality: q }).toFile(out);
  return statSync(out).size;
}

const log = [];
let generated = 0, cachedHits = 0, fallbacks = 0, failures = 0;

async function run(job) {
  const key = sha(MODEL + "\n" + job.prompt);
  const cfile = join(CACHE, `${key}.webp`);
  const t0 = Date.now();
  if (existsSync(cfile)) {
    const bytes = await writeOut(job, readFileSync(cfile));
    cachedHits++;
    log.push({ path: job.path, ms: Date.now() - t0, ok: true, how: "cache", bytes });
    return;
  }
  if (generated >= CAP) { failures++; log.push({ path: job.path, ms: 0, ok: false, how: "cap reached" }); return; }
  generated++;
  const m = await client();
  for (let tries = 0; ; tries++) {
    try {
      const res = await m.images.generate({ model: MODEL, prompt: job.prompt, size: "1024x1024", output_format: "webp" });
      const item = res.data?.[0] ?? {};
      const buf = item.b64_json ? Buffer.from(item.b64_json, "base64") : item.url ? Buffer.from(await (await fetch(item.url)).arrayBuffer()) : null;
      if (!buf) throw Object.assign(new Error("empty image response"), { status: 502 });
      mkdirSync(CACHE, { recursive: true });
      writeFileSync(cfile, buf);
      const bytes = await writeOut(job, buf);
      log.push({ path: job.path, ms: Date.now() - t0, ok: true, how: "generated", bytes });
      return;
    } catch (err) {
      const st = err?.status;
      const msg = String(err?.message ?? err);
      if ((st === 429 || st >= 500 || st === undefined) && tries < 5) { await new Promise((r) => setTimeout(r, 2000 * 2 ** tries)); continue; }
      const policy = st === 400 && /content_policy/i.test(msg + JSON.stringify(err?.error ?? {}));
      const bytes = await writeOut(job, Buffer.from(fallbackSvg(job)));
      fallbacks++;
      if (!policy) failures++;
      log.push({ path: job.path, ms: Date.now() - t0, ok: false, how: `fallback svg (HTTP ${st ?? "error"}${policy ? " content_policy_violation" : ""}: ${msg.slice(0, 80).replace(/\|/g, "/")})`, bytes });
      console.warn(`  fallback ${job.path}: HTTP ${st} ${msg.slice(0, 120)}`);
      return;
    }
  }
}

const t0 = Date.now();
let i = 0, done = 0;
await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
  while (i < todo.length) {
    const job = todo[i++];
    await run(job);
    if (++done % 20 === 0) console.log(`  ${done}/${todo.length}`);
  }
}));

function dirSize(d) {
  if (!existsSync(d)) return 0;
  return readdirSync(d, { withFileTypes: true }).reduce((a, e) => a + (e.isDirectory() ? dirSize(join(d, e.name)) : statSync(join(d, e.name)).size), 0);
}
const seedBytes = dirSize(join(PUB, "seed"));
const byKind = {};
for (const j of jobs) {
  const f = abs(j.path);
  if (!existsSync(f)) continue;
  byKind[j.kind] ??= { n: 0, bytes: 0 };
  byKind[j.kind].n++;
  byKind[j.kind].bytes += statSync(f).size;
}
const missing = jobs.filter((j) => !existsSync(abs(j.path))).length;
const spend = generated * PRICE;
const summary = `referenced=${jobs.length} processed=${todo.length} generated=${generated} cacheHits=${cachedHits} fallbacks=${fallbacks} failures=${failures} stillMissing=${missing} spendUsd=${spend.toFixed(2)} publicSeedMB=${(seedBytes / 1048576).toFixed(2)} seconds=${Math.round((Date.now() - t0) / 1000)}`;

const prev = existsSync(join(ROOT, "docs", "evidence", "M1-content.md")) ? readFileSync(join(ROOT, "docs", "evidence", "M1-content.md"), "utf8") : "";
const prevRuns = (prev.match(/<!-- images:start -->([\s\S]*?)<!-- images:end -->/)?.[1] ?? "").split("\n### Run ").slice(1).map((s) => "### Run " + s.trim());
const run_ = [
  `### Run ${new Date().toISOString()}`,
  "",
  `\`${summary}\``,
  "",
  "| Kind | Files | Avg KB |",
  "|---|---|---|",
  ...Object.entries(byKind).map(([k, v]) => `| ${k} | ${v.n} | ${(v.bytes / v.n / 1024).toFixed(1)} |`),
  "",
  ...(log.length ? ["| Path | ms | ok | how | KB |", "|---|---|---|---|---|", ...log.sort((a, b) => a.path.localeCompare(b.path)).map((l) => `| ${l.path} | ${l.ms} | ${l.ok} | ${l.how} | ${l.bytes ? (l.bytes / 1024).toFixed(1) : ""} |`)] : ["Nothing to generate; every referenced file exists."]),
];
writeSection("images", [`## Images (npm run gen:images)`, "", `Model ${MODEL}, $${PRICE}/image, cache .cache/images/, cap ${CAP}/run.`, "", ...prevRuns, run_.join("\n")].join("\n\n"));
console.log(summary);
if (missing || failures) process.exitCode = 1;
