# Status

Last updated: 2026-10-13. Repository: branch `claude/elegant-wozniak-qch21g`.

## Done and checked

- **Server:** MCP 2025-11-25 over Streamable HTTP at `/mcp`, stateless (state in DynamoDB), origin guard, 19 tools with `outputSchema`, annotations and the common envelope, friendly errors.
- **Concierge:** a Bedrock/Strands agent calls several tools in one turn. It runs in the same process as the server (no local port), records every tool call, and answers in 1 to 3 spoken sentences. The live check runs after every deploy.
- **Day plans:** the agent may only use place ids from `get_highlights`. `build_itinerary` checks the plan by rule (day range, repeats across days, unknown or wrong-country places, pace, avoided interests, daily time) and saves only a plan that passes.
- **Worldwide catalog:** 194 countries have curated places: 1,114 in total. Each place has an English description for 948 places and a Spanish one for 728 places, taken from the first sentence of its Wikipedia article with a link (CC BY-SA 4.0). The other places keep Waypoint's own text, marked `curated`.
- **Worldwide reference:** 196 countries and 1,699 cities resolve by name in English and Spanish (`data/world/`, Wikidata CC0).
- **Ranked lists:** 182 countries have a ranked list from Wikidata and Wikipedia popularity (`data/world/highlights/`). They are noisy: some entries are not destinations. The curated list wins for every country that has one.
- **Group money:** expenses with a payer and the people who share them, settle-up with the fewest transfers (exact to the cent), a spending limit with conversion, fairness per traveler, bookings with free-cancellation deadlines, and export to calendar (ICS) or Markdown.
- **Packs:** 13 country packs, 13 of 13 valid. Curated overlays for CN, JP, KR, SG, TH and VN.
- **Alexa skill:** deployed; live conversations run against the Alexa Skill Simulation API after each skill deploy.
- **Tests:** 302 passing offline. Typecheck clean. Accuracy eval 33 of 33 (`npm run ci`).
- **Review of 2026-10-13:** the defects found were fixed and each one has a regression test (`test/concierge-review.test.ts`). The grounding script had erased the original provenance notes of all 194 packs; they are restored, and the script now adds to them.

## Not done, and why

- **Human review (tier A):** no person has checked the packs or the highlights against the sources. Checklist in `docs/DATA_REVIEW.md`. Until then the app says that rules and descriptions are not checked by a person.
- **Descriptions without an article:** 166 places have no English Wikipedia article and 386 have no Spanish one; they keep Waypoint's own text, which no person has checked.
- **Monuments:** the Wikidata query takes tourist attractions and museums with at least 5 sitelinks, so landmarks such as Brandenburg Gate are missing for many countries. Germany, France, the US and the UK have monuments added by hand; the others do not.
- **Opening hours and prices:** not in any source the app reads. The app says so and points to the official source.
- **Spanish rule summaries:** curated only for the six packs above.
- **find_events:** no verified event source.
- **Hosting:** runs on AWS Lambda with a public URL; load and latency under real traffic are not measured.
- **Video, Devpost, repository settings:** owner actions.
- **OAuth 2.1 / PKCE:** not implemented.

## Next

1. Human review of the demo destinations (JP, SG, VN and the Alexa flows) with `docs/DATA_REVIEW.md`.
2. Read the first deploy's live check output in the Actions run after each deploy (`tools-live.mjs` and `concierge-live.mjs`).
3. Record the demo with `docs/DEMO_SCRIPT.md`.
4. Publish the open-source package and record its URL in `docs/OPEN_SOURCE.md`.
