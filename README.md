# Waypoint

**Your travel-readiness concierge for Alexa+.** Tell Waypoint who is travelling and where. It answers, with cited official sources, dated and with a confidence flag: can each traveler enter, what must they arrange in advance, what must they not bring or do, what it will cost, what to pack, and what the day plan looks like. It remembers the trip between sessions.

Built for the Amazon Developer "Build, Ship, Shape" hackathon, Alexa+ track (AWS Builder and Open Source mini challenges). Written in TypeScript on the official `@modelcontextprotocol/sdk`.

> Rules change; verify with the official source before you travel.
>
> Waypoint is a simulated Alexa+ host. It is not affiliated with Amazon and does not integrate with Alexa+. Alexa+ partner tooling is not publicly available, so the server is self-hosted and the client is a real MCP client.

## Quick start (under five commands)

```bash
npm install
npm test                 # unit, end-to-end over Streamable HTTP, offline
npm start                # MCP server on http://127.0.0.1:3000/mcp and the simulator at /
open http://127.0.0.1:3000   # click "Demo group", then ask: "Can I bring vapes to Singapore?"
```

Offline mode (`WAYPOINT_OFFLINE=1`) needs no network: FX uses a labelled snapshot and nothing else calls out. Everything the server answers from is vendored under `data/vendor` and `packs/`.

## What it does

| Tool | Question it answers | Output |
|---|---|---|
| `get_traveler_profile` | What do you know about me and my group? | Profile card, sensitive fields redacted unless consented |
| `update_traveler_profile` | Save me and my companions | Upserts travelers; **elicits** a missing passport country |
| `plan_trip` (hero) | "Going to Japan 3–10 December" | Per-traveler entry status, stay-length check, top rules, days left; opens the **MCP App** dashboard |
| `check_entry_requirements` | Do we need a visa? | One row per traveler, using the best of their passports |
| `get_local_rules` | What can't I bring or do? | Verified rules with severity, each with its source quote |
| `get_destination_essentials` | Plugs, emergency numbers, currency | Facts with sources |
| `convert_budget` | How far does my money go? | Live FX (or labelled snapshot) plus World Bank PPP equivalent |
| `packing_checklist` | What do I pack? | Checklist from trip length, plugs, children, medications and "do not pack" rules |
| `build_itinerary` | Day plan | Slots by pace and interests; suggestions are marked low confidence |
| `trip_brief` | What is left for my trip? | Works across sessions: open visa checks, packing, spending |
| `log_expense` | I spent money | Stores the expense, trip total |
| `forget_me` | Delete my data | **Elicits** confirmation, then deletes profile, trips and expenses |

Every tool declares an `inputSchema`, an `outputSchema`, `annotations` (`readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint`) and returns the same envelope:

```
{ voice, card, data, sources[], lastVerified, confidence, disclaimer, followUps[], missingFields? }
```

`voice` is also the text content block. Errors are friendly: they name what went wrong in plain words and give the next step. They never include stack traces, URLs, HTTP codes or tool names.

## Architecture

```
┌──────────── Simulated Alexa+ host (web/) ───────────────┐
│ Echo Show frame · voice (Web Speech) · text fallback    │
│ ES/EN · elicitation forms · MCP Apps iframe host        │
│ protocol log · real MCP client (fetch, Streamable HTTP) │
│ brain: local router, or Bedrock via Strands (optional)  │
└───────────────┬─────────────────────────────────────────┘
                │ MCP 2025-11-25 · Streamable HTTP · POST/GET/DELETE /mcp
┌───────────────▼─────────────────────────────────────────┐
│ Waypoint MCP server (src/, Node 22, Express 5)          │
│  tools (12) · ui:// MCP App resource · elicitation      │
│  origin guard (403) · friendly errors · envelopes       │
│  services: visa matrix · packs · FX (+snapshot) · PPP   │
│  state: StateStore → file (local) | DynamoDB (designed) │
└───────────────┬─────────────────────────────────────────┘
                │ built offline: scripts/ (fetch → build → validate)
        packs/*.json + data/sources-text/*.json (committed, checked)
```

### Protocol and security

- MCP **2025-11-25** over Streamable HTTP at `/mcp`. Sessions are `Mcp-Session-Id`; `MCP-Protocol-Version` is sent by the client.
- Origin validation: browser requests from unknown origins get `403`.
- Elicitation (form mode) for missing passports and for `forget_me` confirmation. When the client does not support it, the answer carries `missingFields` instead.
- MCP Apps (extension 2026-01-26): `plan_trip` links `_meta.ui.resourceUri` to `ui://waypoint/plan-dashboard-<hash>.html`, served as `text/html;profile=mcp-app`. The widget runs in a sandboxed iframe with no `localStorage` and no parent access.
- No passport numbers are stored, only the country and an optional expiry. Medications need explicit consent and are never sent to third-party APIs.
- OAuth 2.1 / PKCE is not implemented. Identity is the `x-waypoint-user` header, which is a demo convenience (see `docs/FEEDBACK.md`).

## Data sources and licences

| Data | Source | Licence | Where it lives |
|---|---|---|---|
| Passport → destination entry status (ten passports × all destinations) | [imorte/passport-index-data](https://github.com/imorte/passport-index-data), snapshot 2026-02-17 | MIT | `data/vendor/passport-index/` (with LICENSE) |
| Local rules and entry notes (13 destinations) | [GOV.UK Content API, FCDO travel advice](https://www.gov.uk/foreign-travel-advice) | Open Government Licence v3.0 | quotes in `packs/*.json`, source text in `data/sources-text/` |
| Local rules, US destinations info | [US State Dept CountryTravelInformation / TravelAdvisories](https://travel.state.gov/) | US Government work (public domain) | same |
| Currency and language per country | [countries-list](https://www.npmjs.com/package/countries-list) (npm, MIT) | MIT | runtime dependency; replaces REST Countries v3.1, which was discontinued |
| Live FX | [open.er-api.com](https://open.er-api.com) | Attribution required | runtime; snapshot in `data/vendor/fx-fallback.json` |
| Purchasing power | [World Bank PA.NUS.PRVT.PP](https://data.worldbank.org/indicator/PA.NUS.PRVT.PP) | CC BY 4.0 | `data/vendor/ppp.json` |
| Plug types and emergency numbers | [Wikidata P2853 / P2852](https://www.wikidata.org/) | CC0 | `data/vendor/wikidata-plugs-emergency.json` |

Not used: `Frankfurter` (no VND), REST Countries (discontinued), mledoze/countries (ODbL), the Mexican SRE guide (anti-bot challenge; link only).

Licence of this project: MIT (see `LICENSE`).

## Country packs

Packs are built by `npm run fetch-sources` then `npm run build-packs`. The build writes a rule only if its quote appears verbatim in the cached source text, and writes nothing that fails validation. `npm run validate-packs` re-checks the committed packs with no network, and CI runs it.

Pack status is **tier B, machine-extracted** until a human reviewer signs off. Tier A (human-reviewed) requires a named reviewer in the pack; the validator rejects a tier A pack without one. See `docs/DATA_REVIEW.md` for the review checklist and the known weak rules.

## Scripts

| Command | What it does |
|---|---|
| `npm run typecheck` | TypeScript, strict |
| `npm test` | Unit tests and the offline end-to-end suite |
| `npm run eval` | Accuracy over `test/eval/golden.json` (33 cited facts) |
| `npm run validate-packs` | Validates committed packs against committed sources |
| `npm run fetch-sources` | Downloads official sources (needs network) |
| `npm run build-packs` | Rebuilds packs from raw sources (needs `fetch-sources` first) |
| `npm start` | Runs the server and simulator on port 3000 (`PORT` to change) |
| `npm run smoke:web` | Browser smoke test (optional, needs Chromium and Playwright, see `docs/TESTING.md`) |
| `npm run ci` | Typecheck, test, validate packs and eval |

## Repository map

- `src/` server, tools, services, state, packs (schema, validator), MCP App resource
- `web/` simulated Alexa+ host (plain ES modules, no build step)
- `scripts/` data pipeline and checks
- `packs/` built country packs · `data/sources-text/` source text for quote checks · `data/vendor/` vendored snapshots
- `src/brain.ts` Strands brain (optional, untested against Bedrock; see `docs/AWS.md`)
- `skills/waypoint/SKILL.md` Agent Skill with voice and routing rules
- `oss/travel-entry-packs/` open-source schema, validator and sample packs (separate MIT package)
- `docs/` SUBMISSION (official checklist), STATUS, TESTING, FEEDBACK, FRICTION_LOG, DEMO_SCRIPT, AWS, OPEN_SOURCE, DATA_REVIEW

## Limits

- Packs are machine-extracted and not yet human-reviewed. Treat rules as leads to verify, not as legal advice.
- The visa matrix is a dataset snapshot (2026-02-17), not a live feed.
- Rules are English only for now (source language). Spanish summaries need a translation pass.
- `find_events` is not implemented (no verified event source in the build environment).
- The Bedrock brain is verified live by the `aws-smoke` workflow; the simulator still defaults to the local router.
- Hosting is not deployed. The official FAQ says a locally runnable public repo plus the demo video is enough for the Alexa+ track, and that the MCP server does not need to stay running after submission. Lambda is the planned option if a hosted endpoint is added.
