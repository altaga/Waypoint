# Testing (for judges)

Run from a clean clone with Node 22:

```bash
npm ci
npm run ci        # typecheck, unit + offline e2e, pack validation, accuracy eval
```

Expected: typecheck clean, 28 tests passing, 13/13 packs valid, eval 33/33.

## What is tested

| Layer | File | What it proves |
|---|---|---|
| Profile model | `test/profile.test.ts` | Passports store country only; medications redacted without consent |
| Errors | `test/errors.test.ts`, `test/unit/services.test.ts` | Friendly messages, no stack, URL or HTTP code leaks |
| Visa matrix | `test/unit/services.test.ts` | Parsing, statuses, dual passports take the most permissive |
| Country resolver | same | English, Spanish, aliases, ISO codes, gentilicios |
| FX | same | Snapshot when offline; snapshot when the live call fails |
| Packs | same | Shipped packs load; invalid quotes and unreviewed tier A are rejected |
| MCP contract | `test/e2e.test.ts` | 12 tools with outputSchema, annotations and MCP App link; resource served |
| Workflow | `test/e2e.test.ts` | profile → elicitation for a missing passport → plan_trip → new session → trip_brief → other user sees nothing |
| Rules | `test/e2e.test.ts` | Local rule answers carry verbatim quotes and sources |
| Security | `test/e2e.test.ts` | Unknown origin gets 403; localhost allowed |
| Health | `test/e2e.test.ts` | `/healthz` reports protocol version and loaded packs |

The e2e suite uses a real MCP client over Streamable HTTP. It runs offline: `WAYPOINT_OFFLINE=1` is set and the memory store is used.

## Accuracy eval

`npm run eval` checks 33 cited facts in `test/eval/golden.json`:

- 30 visa facts (`passport → destination`, status and stay length), taken directly from the vendored passport matrix CSV.
- 3 rule facts (a verbatim quote and category in a built pack), from the FCDO pages.

**Read this honestly:** the visa facts are checked against the same dataset the server reads. The eval proves the lookup and pack pipeline are consistent with their sources. It is not an independent measure of real-world accuracy. Independent accuracy needs human review of tier A packs (see `docs/DATA_REVIEW.md`), which has not happened yet.

## Browser smoke test (optional)

Needs Chromium and Playwright. The build environment has a Playwright install outside the repo:

```bash
npm start &                       # or PORT=3111 npm start
PLAYWRIGHT_MODULE=/path/to/playwright/index.js BASE_URL=http://127.0.0.1:3000 npm run smoke:web
```

It connects, loads the demo group, asks a rule question (checks the vape rule card), asks for a trip (checks the MCP App iframe mounts and a card renders), and fails on any console error.

## Not tested

- The Bedrock brain is not part of `npm test` (it needs AWS). It is tested live by the `aws-smoke` workflow (`npm run smoke:brain`), which fails unless the answer uses the cited rule instead of the model's memory.
- Hosting, load, and latency under 500 ms on a real network.
- Voice input and output. Web Speech is browser-only and was not exercised in the headless run.
