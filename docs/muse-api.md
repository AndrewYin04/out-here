# Muse API reference

Source: https://dev.meta.ai/docs, checked 2026-11-12, plus real calls made from this laptop that night (marked "measured"). Use only what this file says; do not guess endpoints, model ids, or parameters.

## Connection
- **Base URL:** `https://api.meta.ai/v1` (env `MUSE_BASE_URL`).
- **Auth:** `Authorization: Bearer <key>`. The key lives only in `.env.local` as `MUSE_API_KEY` and in Vercel project env.
- **OpenAI-compatible.** Use the `openai` npm package with an explicit `baseURL` and `apiKey`; never rely on the package's default URL or its `OPENAI_API_KEY` lookup:
  ```ts
  import OpenAI from "openai";
  const muse = new OpenAI({ baseURL: process.env.MUSE_BASE_URL, apiKey: process.env.MUSE_API_KEY });
  ```
- All calls go through the one adapter, `src/features/muse/client.ts`, server-side only.

## Models
`GET /v1/models` returned 200 (measured) and listed: muse-ember-1.0, muse-wonder-1.0, sam-3.1, muse-spark-1.3-contributor, muse-voice-transcribe-1.0, muse-spark-1.3, muse-image-1.0, muse-spark-1.2-contributor, muse-spark-1.2, muse-spark-1.1.

| Env var | Model | Role in Out Here | Price per 1M tokens |
|---|---|---|---|
| `MUSE_MODEL_FAST` | `muse-ember-1.0` | `parseIntent`, captions, seed content generation | $0.10 in / $0.50 out |
| `MUSE_MODEL_SMART` | `muse-spark-1.3` | `rankAndExplain`, regroup, create-quest, Wrapped | $1.25 in / $4.25 out |
| `MUSE_MODEL_VISION` | `muse-spark-1.3` | Daily Quest photo check | same as Spark |
| `MUSE_MODEL_IMAGE` | `muse-image-1.0` | seed portraits and content images (`npm run gen:images`) | $0.01 per image |

`muse-wonder-1.0` ($4 in / $20 out) is not used. Billing is pay-as-you-go and goes to whoever owns the key.

## Reasoning effort
- `reasoning_effort` accepts effort levels such as `"minimal"` and `"low"`. `"none"` returns HTTP 400.
- Parse with Ember at `"minimal"`. Rank and explain with Spark at `"minimal"`; measure it during M1 and record the number in `docs/DECISIONS.md`.
- Spark at `"low"` spent 490 of 586 output tokens on reasoning (measured), so higher effort costs latency and money with little gain for ranking 2–3 candidates.

## Structured output
```json
"response_format": {
  "type": "json_schema",
  "json_schema": { "name": "plan", "strict": true, "schema": { ... } }
}
```
Strict mode requires:
- a root `object`;
- `additionalProperties: false` on every object;
- every key listed in `required` (for an optional value, the usual OpenAI-style pattern is a `["string","null"]` type union; not yet checked against Muse);
- no `oneOf` / `allOf`.

Still validate the parsed result with zod, with one retry on invalid JSON.

## Tools
`tool_choice` accepts only `"auto"`. Do not pass `"required"`, `"none"`, or a named tool.

## Unsupported parameters (each returns HTTP 400)
`stop`, `n` greater than 1, `logit_bias`, `logprobs`, `modalities`, `reasoning_effort: "none"`.

## Timeouts
Long non-streaming calls can return **504**. Stream long calls (`stream: true`), keep prompts small (candidate ids and facts only), and back off and retry on 504 and 429.

## Vision
Send `image_url` content parts with either an https URL or a data URL:
```json
{ "role": "user", "content": [
  { "type": "text", "text": "Does this photo show two people eating something new?" },
  { "type": "image_url", "image_url": { "url": "https://..." } }
]}
```
This is what makes the Daily Quest photo check possible.

## Image generation
- `POST /v1/images/generations` with `model: "muse-image-1.0"` (the `openai` package's `muse.images.generate({ model, prompt })` targets this path).
- Price: $0.01 per image. Rate limit: 150 requests per minute.
- A policy block returns HTTP 400 with `content_policy_violation`; fall back to DiceBear CC0 `notionists` for that face.
- Output (measured): a 1600x1600 WebP of about 504 KB. Resize with `sharp`: portraits to 256 px WebP (about 30 KB), content images to 800 px WebP (about 80 KB).
- `scripts/gen-images.ts` caches by a hash of the prompt and never regenerates existing files. Hard cap: 150 images (about $1.50).

## Measured latencies (2026-11-12, about 01:20 PT, from this laptop)
| Call | Result |
|---|---|
| `GET /v1/models` | 200 |
| `muse-ember-1.0`, `reasoning_effort: "minimal"`, strict JSON schema | 200 in **1.2 s**; parsed "hungry, got like 40 min, under $15" to `{activity:"eat", minutes:40, budgetUsd:15}` |
| `muse-spark-1.3`, `reasoning_effort: "low"`, strict JSON schema | 200 in **6.4 s**; correct pick; 490 of 586 output tokens were reasoning |
| `muse-image-1.0` | 200 in **8.3 s**; realistic fictional portrait, 1600x1600 WebP, 504 KB |

The kit's "< 4 s total" plan target is not met by Spark at `low`. Stream the UI and show the "Muse is checking who's free…" skeleton. If it feels slow, try Spark `minimal`, then Ember for ranking, and log each result in `docs/DECISIONS.md`.

## Environment variables
`MUSE_API_KEY`, `MUSE_BASE_URL` (`https://api.meta.ai/v1`), `MUSE_MODEL_FAST` (`muse-ember-1.0`), `MUSE_MODEL_SMART` (`muse-spark-1.3`), `MUSE_MODEL_VISION` (`muse-spark-1.3`), `MUSE_MODEL_IMAGE` (`muse-image-1.0`), `MUSE_MOCK` (`1` forces the deterministic mock; builders always use it; the demo and the deployed preview must run on real Muse).

## Hackathon rule
"A Muse Model (Spark/Wonder/Ember) must power the core AI experience." Every Muse output in the UI carries the "✨ Muse" label, and every call is logged to `muse_runs`.
