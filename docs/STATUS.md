# Status

Last updated: 2026-10-21. Place counts below were counted from `data/highlights/` that day. Test totals drift: trust `npm run ci` on current `main`.

## Done and checked

- **Server:** MCP 2025-11-25 over Streamable HTTP at `/mcp`, stateless (state in DynamoDB), origin guard, 26 tools with `outputSchema`, annotations and the common envelope, friendly errors.
- **Concierge:** a Bedrock/Strands agent calls several tools in one turn. It runs in the same process as the server (no local port), records every tool call, and answers in 1 to 3 spoken sentences. The live check runs after every deploy.
- **Day plans:** the agent may only use place ids from `get_highlights`. `build_itinerary` checks the plan by rule (day range, repeats across days, unknown or wrong-country places, pace, avoided interests, daily time) and saves only a plan that passes.
- **Worldwide catalog:** 194 countries have curated places: 14,115 in total. English descriptions: 13,911 from the first sentence of a Wikipedia article, with a link (CC BY-SA 4.0), and 204 written by Waypoint (`curated`). Spanish: 8,874 from Wikipedia, 4,818 machine translations of the English Wikipedia sentence, and 423 written by Waypoint.
- **Worldwide reference:** 197 countries and 1,698 cities resolve by name in English and Spanish (`data/world/`, Wikidata CC0).
- **Ranked lists:** 182 countries have a ranked list from Wikidata and Wikipedia popularity (`data/world/highlights/`). They are noisy: some entries are not destinations. The curated list wins for every country that has one.
- **Group money:** expenses with a payer and the people who share them, settle-up with the fewest transfers (exact to the cent), a spending limit with conversion, fairness per traveler, bookings with free-cancellation deadlines, and export to calendar (ICS) or Markdown.
- **Packs:** 13 country packs, 13 of 13 valid. Curated overlays for CN, JP, KR, SG, TH and VN.
- **Alexa skill:** deployed; live conversations run against the Alexa Skill Simulation API after each skill deploy.
- **Tests:** 448 passing offline (`npm test`, 2026-10-21). Typecheck clean. Accuracy eval 33 of 33 (`npm run eval`).
- **Review of 2026-10-13:** a review of the concierge tools, the web host, the data and the scripts produced 55 findings; 32 were confirmed by two independent refutation attempts each, and 23 were refuted. Every confirmed high and medium finding is fixed, with a regression test in `test/concierge-review.test.ts`. Fixed: a place could repeat across days; a saved plan was not re-checked when the pace or the avoided interests changed; unknown payers, split names and trip ids were dropped silently; currencies were not ISO codes; dates were not checked against the calendar, and a non-numeric trip length passed every day; settle-up was not exact to the cent, and expenses with no exchange rate were skipped in silence; the spending limit gave no warning when a rate was missing; a booking accepted a free-cancellation date after the booking or the trip; `confirm_booking` only searched the latest trip; a booking without a status was saved as confirmed; trip and deadline dates used UTC, not the traveler's timezone; overlapping saves could overwrite each other (saves are now versioned and retried); calendar export was not escaped, folded or ended with CRLF; Markdown export was not escaped and did not mark pending bookings; the grounding script had erased the provenance notes of all 194 packs (restored; the script now adds to them); Denmark was missing from the countries list; a historical city code was present; the Chilean museum's English text linked to a palace article; `get_highlights` did not return the Wikipedia link; the local router drew every result with the generic card; the trip hero and the cards were not refreshed after each action; a failed tick, a failed share or a failed connection gave no feedback; requests could overlap; the protocol log grew without limit. Still open, low severity, not fixed: the mic click writes into the connection status and does not restore it; the world-city build script does not restrict cities to sovereign states, uses an arbitrary candidate limit, keys duplicate landmarks on the raw city label, labels sitelinks as language editions, and its merge never removes stale places; the grounding script does not check article titles, and an empty resume entry stays empty; the elicitation form does not enforce required fields; two MCP App panels opened at the same moment can leave one listener behind. Also not verified by a person: whether each grounded article is the right one. A check comparing place names with article titles cannot tell a translation from a wrong article; it found one clear wrong match, now fixed.

## Not done, and why

- **Human review (tier A):** no person has checked the packs or the highlights against the sources. Checklist in `docs/DATA_REVIEW.md`. Until then the app says that rules and descriptions are not checked by a person.
- **Descriptions without an article:** 204 places have no English Wikipedia sentence. 5,241 have no Spanish Wikipedia sentence: 4,818 of those show a translation of the English sentence, and 423 keep Waypoint's own Spanish text. No person has checked them.
- **Monuments:** the Wikidata query takes tourist attractions and museums with at least 5 sitelinks, so landmarks such as Brandenburg Gate are missing for many countries. Germany, France, the US and the UK have monuments added by hand; the others do not.
- **Opening hours and prices:** 289 places include opening hours (271 labelled `osm`, the rest a cited page such as the Louvre or Teotihuacan). `src/hours.ts` understands only common OpenStreetMap forms; anything else is treated as unknown and never reported as open or closed. Suggested times are not a promise the place is open. Prices are not in the catalog. No person has checked the hours.
- **Spanish rule summaries:** curated only for the six packs above.
- **find_events:** no verified event source.
- **Hosting:** runs on AWS Lambda with a public URL; load and latency under real traffic are not measured.
- **Video and the Devpost form:** owner actions. The GitHub About description and homepage are set on `altaga/Waypoint`.
- **OAuth 2.1 / PKCE:** not implemented.

## Next

1. Human review of the demo destinations (JP, SG, VN and the Alexa flows) with `docs/DATA_REVIEW.md`.
2. Read the first deploy's live check output in the Actions run after each deploy (`tools-live.mjs` and `concierge-live.mjs`).
3. Record the demo with `docs/DEMO_SCRIPT.md`.
4. Open-source package: published at https://github.com/altaga/travel-entry-packs and recorded in `docs/OPEN_SOURCE.md`.
