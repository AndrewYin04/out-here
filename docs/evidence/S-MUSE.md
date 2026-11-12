# S-MUSE: Muse smoke test

Run at 2026-11-12T10:13:26.946Z by `npm run eval:muse` (`scripts/muse-smoke.mjs`). Base URL from `MUSE_BASE_URL`; no key is recorded.

| Call | Model | HTTP | OK | Latency (ms) | Tokens in / out (reasoning) |
|---|---|---|---|---|---|
| Ember parse | muse-ember-1.0 | 200 | true | 1493 | 97 / 182 (153) |
| Spark rank | muse-spark-1.3 | 200 | true | 2917 | 146 / 168 (125) |
| Image 1024x1024 webp | muse-image-1.0 | 200 | true | 8725 | {"input_tokens":10129,"output_tokens":1011,"total_tokens":11140} |

## Ember parse (muse-ember-1.0)

Parsed JSON:

```json
{
  "activity": "eat",
  "budgetUsd": 15,
  "minutes": 40
}
```

## Spark rank (muse-spark-1.3)

Parsed JSON:

```json
{
  "questId": "q1",
  "reason": "Matches hunger and dumpling preference, under $15 and short 9-min walk within 40 min."
}
```

## Image (muse-image-1.0)

Saved .verify/muse-smoke.webp (393520 bytes, from b64_json). The file is gitignored.
