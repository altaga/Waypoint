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
| `update_traveler_profile` | Save me and my companions, with likes and things to avoid | Upserts travelers; **elicits** a missing passport country |
| `plan_trip` (hero) | "Going to Japan 3–10 December" | Per-traveler entry status, stay-length check, top rules, days left; opens the **MCP App** dashboard |
| `check_entry_requirements` | Do we need a visa? | One row per traveler, using the best of their passports |
| `get_local_rules` | What can't I bring or do? | Verified rules with severity, each with its source quote |
| `get_destination_essentials` | Plugs, emergency numbers, currency | Facts with sources |
| `convert_budget` | How far does my money go? | Live FX (or labelled snapshot) plus World Bank PPP equivalent |
| `get_transit_payment` | Can I tap my bank card on the metro here, and which transit card do locals use? | For each city or network: whether a contactless bank card works at the gates (yes, partly, no, or not confirmed), the local card (Oyster, Octopus, Suica, OV-chipkaart, Navigo, T-money, EasyCard), with the operator's page as official source where it has one |
| `get_local_apps` | Does Uber, Grab, DiDi, Rappi, Mercado Libre, Amazon or Mercari work here? | Each app for the trip's country: on the company's own list, reported by press or guides (not confirmed), not on the list, or no verified data. By country, not city |
| `get_payment_methods` | How do I pay there? | Cash, cards, QR and e-wallets, ATMs and cryptocurrency for 197 countries. 49 come from official sources with dates; 148 come from travel guides and traveler reports and are labelled as not officially confirmed. A country with no entry is said so, never guessed. No cryptocurrency acceptance is claimed anywhere |
| `get_trip_climate` | What will the weather be like? | The usual highs, lows and rain on the trip's own dates (NASA POWER normals for every capital, weighted by days per month); not a forecast |
| `packing_checklist` | What do I pack? | Checklist from trip length, climate, plugs, children, medications and "do not pack" rules; ticks persist |
| `get_highlights` | What is worth seeing here? | Real places from the catalog, each with its id, area, duration and source; Wikipedia-grounded where the article exists |
| `set_trip_constraints` | Avoid nightlife; keep under 1,000 USD | Constraints every plan and expense respects |
| `build_itinerary` | Day plan | Stops must be catalog ids; the plan is **verified** (country, pace, repeats, avoided interests, daily time) and not saved if it fails |
| `trip_brief` | What is left for my trip? | Readiness, pending items, free-cancellation deadlines within 30 days |
| `add_booking` / `confirm_booking` | I booked a flight or hotel | Pasted confirmations wait for the traveler to confirm |
| `log_expense` | I spent money | Expense with payer and who shares it; warns when the spending limit is passed |
| `settle_up` | Who owes whom? | Balances and the fewest transfers that square the group |
| `plan_fairness` | Is the plan fair to everyone? | Share of stops each traveler likes, and what they avoid |
| `export_trip` | Put it in my calendar | A calendar file with the trip and one event per planned day, or the plan as text |
| `forget_me` | Delete my data | **Elicits** confirmation, then deletes profile, trips and expenses |

Every tool declares an `inputSchema`, an `outputSchema`, `annotations` (`readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint`) and returns the same envelope. The server exposes 23 tools over MCP 2025-11-25 Streamable HTTP:

```
{ voice, card, data, sources[], lastVerified, confidence, disclaimer, followUps[], missingFields? }
```

`voice` is also the text content block. Errors are friendly: they name what went wrong in plain words and give the next step. They never include stack traces, URLs, HTTP codes or tool names.

### Autopilot: one sentence, the whole preparation

Say "Get me ready for the trip" (or tap **Get me ready** on the trip) and the host runs the preparation as a visible graph of real `tools/call` requests: the group's profile first; then entry, local rules, climate, essentials and places at once; then a day plan and the packing list; then readiness. Each step shows its tool, its result and its own time, and the sources are listed at the end. The day plan goes through the server's verifier: what it rejects (an avoided interest, a day that runs too long) is dropped and the plan is sent again, so only a verified plan is saved. A plan the traveler already has is kept. The code is `web/mission.js`; `test/web-mission.test.ts` runs it against the real server.

The trip hero also draws the group's routes on a dotted globe (`web/globe.js`, canvas, no libraries; land dots from Natural Earth via `scripts/build-globe.ts`), from each traveler's home country to the destination.

## Architecture

```
┌──────────── Simulated Alexa+ host (web/) ───────────────┐
│ Echo Show frame · Polly neural voice · text fallback    │
│ ES/EN · elicitation forms · MCP Apps iframe host        │
│ protocol log · real MCP client (fetch, Streamable HTTP) │
│ brain: local router, or Bedrock via Strands (optional)  │
└───────────────┬─────────────────────────────────────────┘
                │ MCP 2025-11-25 · Streamable HTTP · POST/GET/DELETE /mcp
┌───────────────▼─────────────────────────────────────────┐
│ Waypoint MCP server (src/, Node 22, Express 5)          │
│  tools (20) · ui:// MCP App resource · elicitation      │
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
| Countries, cities (population 300,000+ and capitals) | [Wikidata](https://www.wikidata.org/) via `scripts/build-world.ts` | CC0 | `data/world/countries.json`, `data/world/cities.json` |
| Transit payment by city (Oyster, Octopus, Suica, OV-chipkaart, Navigo, T-money, EasyCard, Istanbulkart, OMNY) | Operator pages (TfL, MTA) are official; press and guides are labelled as not confirmed | Public information; see `data/world/transit.json` for each source and date | `data/world/transit.json` via `scripts/build-transit.ts` |
| Payment methods by country (cash, cards, QR and e-wallets, ATMs, cryptocurrency) | Each section cites its source; official tier only for official publishers and regulators; see `data/world/payments.json` for each source and date | Public information; travel guides and traveler reports labelled as not official | `data/world/payments.json`, compiled from the TravelPay payment database (`data/payment_data.json` in that project) |
| Transit payment by country, for countries with no city entry (one status per country, from press and guides; bilingual notes) | Each entry cites its article or page; see `data/world/transit-countries.json` for each source and date | Public information; press and guides, not official | `data/world/transit-countries.json` (compiled from a per-country sweep, 17 Oct 2026) |
| Travel apps by country (Uber, Grab, Mercado Libre, Amazon from their own pages or SEC filing; DiDi, Rappi, Mercari from press and travel guides) | Company pages and reports; see `data/world/apps.json` for each source and date | Public information; press and guides labelled as not official | `data/world/apps.json` via `scripts/build-apps.ts` |
| Places to visit, 194 countries with places | Curated by Waypoint from the Wikidata list (ids must exist there; a test enforces it) and ranked by Wikipedia popularity for the rest | CC0 (ids); descriptions are Waypoint's or Wikipedia's | `highlights/*.json` (curated), `data/world/highlights/*.json` (ranked) |
| Place descriptions | First sentence of each place's Wikipedia article, linked from the place | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) (attribution and link kept) | `data/grounding/places.json`, applied to `highlights/*.json` |

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
| `npm run build-world` | Rebuilds the worldwide catalogs from Wikidata (needs network; retries on 504; `ONLY=DE,FR` retries some countries) |
| `node scripts/build-grounding.mjs` | Links each curated Wikidata place to its English and Spanish Wikipedia articles (about 40 minutes) |
| `npx tsx scripts/apply-grounding.ts` | Applies the article sentences as descriptions and records where each came from |
| `node scripts/concierge-live.mjs <url>` | Live check of the deployed concierge: a multi-tool conversation with a real Bedrock model |
| `node scripts/tools-live.mjs <url>` | Live check of the deterministic tools: group money, catalog plans, bookings, calendar export |

## Repository map

- `src/` server, tools, services, state, packs (schema, validator), MCP App resource
- `web/` simulated Alexa+ host (plain ES modules, no build step)
- `scripts/` data pipeline and checks
- `packs/` built country packs · `data/sources-text/` source text for quote checks · `data/vendor/` vendored snapshots
- `src/brain.ts` the concierge: a Strands agent on Bedrock that calls the MCP tools in memory (verified live by the `aws-smoke` workflow and by `concierge-live`)
- `src/itinerary.ts` the plan verifier, a pure function with unit tests
- `highlights/` curated places · `data/world/` worldwide catalogs · `data/grounding/` Wikipedia links
- `skills/waypoint/SKILL.md` Agent Skill with voice and routing rules
- `oss/travel-entry-packs/` open-source schema, validator and sample packs (separate MIT package)
- `docs/` SUBMISSION (official checklist), STATUS, TESTING, FEEDBACK, FRICTION_LOG, DEMO_SCRIPT, AWS, OPEN_SOURCE, DATA_REVIEW

## Limits

- Packs are machine-extracted and not yet human-reviewed. Treat rules as leads to verify, not as legal advice.
- Place descriptions come from the first sentence of Wikipedia articles where one exists, and from Waypoint's own short text otherwise (`descBy` says which). Neither has been checked by a person against the official tourism site.
- Opening hours, prices and closures are not in any source we have. The itinerary says so and points to the official site.
- The places catalog is a starting list, not a complete guide. Worldwide ranking is by Wikipedia popularity and can include things that are not travel destinations; the curated lists are what the concierge uses first.
- The visa matrix is a dataset snapshot (2026-02-17), not a live feed.
- Rules are English only for now (source language). Spanish summaries need a translation pass.
- `find_events` is not implemented (no verified event source in the build environment).
- Deadlines are checked when the traveler asks (`trip_brief`); nothing pushes a reminder yet.
- The hosted endpoint is deployed on AWS Lambda through the `deploy-aws` workflow, which also runs the live checks.
- Travel apps answer by country, not city, and say only whether the app is on its company's list. They do not yet say what an app needs from a visitor (a local phone number, a local card, a local account). DiDi, Rappi and Mercari come from press and travel guides; Mercari's own site could not be read.
