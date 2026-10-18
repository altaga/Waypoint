# Testing (for judges)

Run from a clean clone with Node 22:

```bash
npm ci
npm run ci        # typecheck, every test, pack validation, accuracy eval
```

Expected on `claude/elegant-wozniak-qch21g` (checked 2026-10-17):

- typecheck clean
- 400 tests passing, 0 failing
- 13/13 country packs valid
- eval 33/33 (100%, threshold 95%)

The deployed server is checked after every deploy by `.github/workflows/deploy-aws.yml`: the typecheck and every test run first (the deploy stops on any failure), then the live concierge check (`scripts/concierge-live.mjs`, a multi-tool trip turn through Bedrock) and the live group-tools check (`scripts/tools-live.mjs`). The Alexa skill is checked on the Alexa Skill Simulation API by `alexa-live.yml` and after each skill deploy.

## What is tested

| Layer | File | What it proves |
|---|---|---|
| Itinerary verifier | `test/itinerary.test.ts` | Plans are checked by rule: day range, duplicates, unknown or wrong-country places, pace, avoided interests, daily time |
| Concierge tools | `test/concierge-tools.test.ts` | Packing remembers ticks across sessions; a plan of catalog ids is saved, refused when invented; avoided interests block a plan; the spending limit warns; money is formatted for the locale |
| Group money | `test/concierge-group.test.ts` | Settle-up transfers, expenses without a payer, fairness scores, booking deadlines, ICS and Markdown export |
| Review regressions | `test/concierge-review.test.ts` | Each defect from the code review stays fixed: a place cannot repeat across days; unknown names are refused; duplicate names count once; currencies are ISO codes; dates must exist; trips are at most 365 days; settle-up is exact to the cent; unconvertible expenses are said; countdowns use the traveler's timezone; the grounding note is kept and not duplicated |
| Catalog | `test/unit/curation.test.ts`, `test/unit/world.test.ts` | Every curated place id exists in the Wikidata list it came from; every highlight file validates and cites a known source; worldwide countries and cities resolve in English and Spanish |
| Grounding | `test/unit/grounding.test.ts` | First sentences of Wikipedia articles: abbreviations and initials do not end them; grounded places link to their article; the attribution source is present |
| Climate and autopilot | `test/climate.test.ts`, `test/web-mission.test.ts` | Climate normals cover every country; trips across months are weighted by days; the packing list follows the climate; the autopilot runs every step against the real server, names each step's source, repairs what the plan verifier rejects, keeps a saved plan and raises readiness; a request with a place and dates creates that trip, a place without dates asks for them, and a traveler with no passport gets no trip |
| Payment methods | `test/payments.test.ts`, `test/web-router.test.ts` | Each country cites https sources with a date and has a tier (official or reported); a reported country is said to be not officially confirmed; a country without an entry says so; the router sends payment questions to the trip's country |
| Brand chips | `test/web-brands.test.ts` | Brands are found by name in a card's text, once each and in order; look-alike words are not read as brands; every mark has a path and a box; names are escaped; only the payment, app and transit cards show chips |
| MCP contract | `test/e2e.test.ts` | 24 tools with outputSchema, annotations and the MCP App link over Streamable HTTP; memory across sessions; other users see nothing; origin checks; `/api/brain` errors |
| Alexa skill | `test/alexa*.test.ts`, `test/interaction-model.test.ts`, `test/unit/alexa-dates.test.ts` | Intents and slots in the two interaction models, en-US and es-MX; the robustness sweep runs all four locales (en-US, es-MX, es-US, en-GB); random and scripted conversations; dates as Alexa sends them; SSML escaping; the interaction model rules |
| Profile and errors | `test/profile.test.ts`, `test/errors.test.ts` | Passports store the country only; medications are redacted without consent; friendly messages with no stack, URL or code |
| Countries | `test/unit/countries.test.ts` | English and Spanish names, aliases, demonyms, ISO codes; typos only when one country is clearly nearest |
| Services | `test/unit/services.test.ts`, `test/unit/voice.test.ts` | Visa matrix parsing and statuses; FX snapshot when offline; spoken sentences |
| Infrastructure | `test/infra.test.ts` | Resources use the `waypoint_` prefix; the function URL has no IAM auth so Alexa can reach it; Bedrock permissions are limited to model invocation |

The offline tests set `WAYPOINT_OFFLINE=1` and use the memory store, so they need no network and no AWS.

## Accuracy eval

`npm run eval` checks 33 cited facts in `test/eval/golden.json`:

- 30 visa facts (`passport → destination`, status and stay length), taken directly from the vendored passport matrix CSV.
- 3 rule facts (a verbatim quote and category in a built pack), from the FCDO pages.

**Read this honestly:** the visa facts are checked against the same dataset the server reads. The eval proves the lookup and pack pipeline are consistent with their sources. It is not an independent measure of real-world accuracy. Independent accuracy needs human review of the packs and the highlights (see `docs/DATA_REVIEW.md`), which has not happened yet.

## Browser smoke test (optional)

Needs Chromium and Playwright. The build environment has a Playwright install outside the repo:

```bash
npm start &                       # or PORT=3111 npm start
PLAYWRIGHT_MODULE=/path/to/playwright/index.js BASE_URL=http://127.0.0.1:3000 npm run smoke:web
```

It connects, loads the demo group, asks a rule question (checks the vape rule card), asks for a trip (checks the MCP App iframe mounts and a card renders), and fails on any console error.

## Not tested

- The Bedrock brain is not part of `npm test` (it needs AWS). It is checked live after each deploy by `scripts/concierge-live.mjs`.
- Descriptions of places: the first sentence of each Wikipedia article is shown with its link, and Waypoint's own text is marked `curated`. No person has checked either against the official site.
- Opening hours, prices and closures: not in any source the app reads. The app says so and points to the official source.
- Hosting, load, and latency under 500 ms on a real network.
- Voice input and output. Web Speech is browser-only and was not exercised in the headless run.
