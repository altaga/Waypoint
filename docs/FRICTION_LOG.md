# Friction log

Every entry uses the fields the official rules ask for: **task attempted, steps taken, expected vs. actual result, severity, workaround used, and actionable suggestion.**

**Severity:** 1 minor · 2 low · 3 medium · 4 high · 5 blocker.
**Evidence:** "Verified" means we reproduced it or checked the official page on the date shown. Entries we hit while building link to the commit that holds the fix, so each one can be checked in the code. One entry we could not re-check is labelled as such.

## Summary

| # | Product | Task attempted | Sev | Evidence |
|--:|---------|----------------|:---:|----------|
| 1 | Alexa+ developer docs | Install the Alexa+ CLI and Local Inspector | 4 | Verified (FAQ) |
| 2 | Alexa+ | Test a self-hosted MCP server on a real Alexa+ device | 3 | Verified (FAQ) |
| 3 | Alexa+ developer docs | Use the MCP version from the Client Lifecycle example | 2 | Not re-verified |
| 4 | Alexa Skills Kit · SMAPI | Pick a travel category in the skill manifest | 2 | `18f22e1`, `64b9e52` |
| 5 | Alexa Skills Kit · SMAPI | Catch interaction-model errors before deploying | 3 | `075c254`, `3ee74a7` |
| 6 | ASK CLI | Redeploy the same skill from CI | 3 | `d47356c` |
| 7 | ASK CLI | Generate LWA tokens on a fresh machine | 3 | `7d86707` |
| 8 | Alexa runtime · `AMAZON.DATE` | Plan a trip from a spoken date range | 3 | `951e533` |
| 9 | Alexa runtime · SSML | Speak text that contains `&` or `<` | 3 | `3ee74a7` |
| 10 | Alexa developer console | Test intent resolution automatically, not by hand | 2 | `dda6d2a` |
| 11 | AWS Lambda Function URLs + MCP SDK | Serve MCP Streamable HTTP from Lambda | 4 | `51bb462` |
| 12 | AWS Lambda Function URLs | Return binary files (skill icons, Polly audio) | 2 | `af0afde`, `88cb24c` |
| 13 | Alexa Skills Kit + AWS CDK | Point the skill at an MCP endpoint in the same stack | 2 | `93c4cbd` |
| 14 | AWS IAM · GitHub OIDC | Assume an AWS role from GitHub Actions | 3 | `48337c7`, `fc84848` |
| 15 | Amazon Bedrock · Strands Agents | Make the agent answer from MCP tool results | 3 | `5ed510d` |
| 16 | MCP TypeScript SDK | Type tool results | 2 | Verified |
| 17 | Hackathon logistics | Know whether the MCP endpoint must stay hosted | 3 | Verified (FAQ, rules) |
| 18 | Hackathon logistics | Find when judging starts | 2 | Verified (rules, Dates tab) |
| 19 | AWS Promotional Credits | Request credits before the form deadline | 3 | Verified (rules) |
| 20 | REST Countries | Get currency per country | 4 | Verified |
| 21 | GOV.UK Content API | Fetch FCDO entry requirements as JSON | 2 | Verified |
| 22 | US State Dept feed | Extract plain text per country | 2 | Verified |
| 23 | FCDO travel advice pages | Extract prohibited items from list-style pages | 3 | Verified |
| 24 | Rule extraction (ours) | Trust heuristic extraction without review | 3 | Verified |

---

## Alexa+ and the Alexa+ developer docs

### 1. Install the Alexa+ CLI and Local Inspector
- **Steps:** followed the MCP Toolkit Quickstart; ran `npm install @alexa-ai/cli` and `npm install @alexa-ai/addon-local-inspector`.
- **Expected:** both packages install, as the setup pages suggest.
- **Actual:** 404 on npm. The official FAQ confirms these tools are partner-only, and notes the caveat "is sometimes missing from individual setup-guide pages". (Verified 2026-10-11.)
- **Severity:** 4
- **Workaround:** a self-hosted MCP server plus a web page that acts as a real MCP client, the path the FAQ allows.
- **Suggestion:** put the partner-only notice at the top of every setup page, not only on the docs home.

### 2. Test a self-hosted MCP server on a real Alexa+ device
- **Steps:** looked for any way to connect a self-hosted MCP server to Alexa+ or to the developer console.
- **Expected:** a sandbox for hackathon participants.
- **Actual:** none exists; the FAQ says no participant can connect a self-hosted server to Alexa+. (Verified 2026-10-11.)
- **Severity:** 3
- **Workaround:** a simulated Echo Show host with voice, cards, elicitation, and an MCP App iframe; plus a classic Alexa custom skill backed by the same MCP tools, tested on real Alexa (see #10).
- **Suggestion:** a public Alexa+ sandbox, even rate-limited, would let teams test the real voice surface.

### 3. Use the MCP version from the Client Lifecycle example
- **Steps:** read the Client Lifecycle page.
- **Expected:** the example uses 2025-11-25, which the page says is supported.
- **Actual:** the example sends `protocolVersion` 2025-03-26. (Noted during early research; not re-checked, because the page is behind partner access.)
- **Severity:** 2
- **Workaround:** used 2025-11-25 everywhere, matching the SDK and the rules.
- **Suggestion:** update the example to the version the page recommends.

---

## Alexa Skills Kit (SMAPI, ASK CLI, runtime, console)

### 4. Pick a travel category in the skill manifest
- **Steps:** set `"category": "TRAVEL_AND_TRANSPORTATION_AND_LOCAL"` in `skill/skill.json`; deployed with the ASK CLI.
- **Expected:** a travel category exists, since the Alexa Skills Store has a Travel & Transportation section.
- **Actual:** SMAPI rejected the value as an invalid enum. The category enum has no plain travel value. (Verified 2026-10-12.)
- **Severity:** 2
- **Workaround:** `NAVIGATION_AND_TRIP_PLANNER`, the closest value in the Skill Manifest reference.
- **Suggestion:** list the valid enum values in the SMAPI error, and map the store's section names to enum values in the manifest reference.

### 5. Catch interaction-model errors before deploying
- **Steps:** wrote the en-US and es-MX interaction models by hand; deployed.
- **Expected:** the ASK CLI flags invalid models locally.
- **Actual:** errors appeared only on the first remote build: a slot name was rejected because slot names allow letters only, and samples that put a phrase slot next to another slot were rejected. (Verified 2026-10-12.)
- **Severity:** 3
- **Workaround:** renamed the slot (`secondCountry`), split the samples, and wrote `test/interaction-model.test.ts`, which checks the SMAPI rules offline (slot names, declared slots, phrase-slot mixing, sample characters, duplicates, locale parity). Deploys now run it first.
- **Suggestion:** a local `ask` lint command for interaction models that applies the same rules as the remote build.

### 6. Redeploy the same skill from CI
- **Steps:** committed `ask-resources.json` and the `skill/` package; ran `ask deploy` in GitHub Actions on a fresh runner, with the existing skill id available as an input.
- **Expected:** the deploy updates the existing skill.
- **Actual:** it created a second, stray skill. The ASK CLI reads the skill id from `.ask/ask-states.json`, which is not committed, not from `ask-resources.json`. (Verified 2026-10-12.)
- **Severity:** 3
- **Workaround:** the workflow writes `.ask/ask-states.json` from the `SKILL_ID` input before deploying.
- **Suggestion:** let `ask deploy` take the skill id from a flag or an environment variable, and document the CI case.

### 7. Generate LWA tokens on a fresh machine
- **Steps:** on a machine that had never run `ask configure`, ran `ask util generate-lwa-tokens` to get a refresh token for CI.
- **Expected:** the browser login opens and tokens are returned.
- **Actual:** `File ~/.ask/cli_config not exists`, even though this command does not need a profile. (Verified 2026-10-12.)
- **Severity:** 3
- **Workaround:** our helper (`ops/get-alexa-credentials.mjs`) writes an empty profiles config when the file is missing. It also saves the refresh token to a private file instead of printing it, so it never lands in scrollback or a shared screen.
- **Suggestion:** create the config on demand, and offer an option to write tokens to a file instead of stdout.

### 8. Plan a trip from a spoken date range
- **Steps:** in the console, said *"quiero ir a Japón del uno al veinticinco de diciembre"* ("I want to go to Japan from the first to the twenty-fifth of December").
- **Expected:** two full dates.
- **Actual:** the start date came in as a day with no month (only the end date had one). Our tool rejected it, and the first version read the raw validation error aloud. Other `AMAZON.DATE` shapes (no year, a week, a weekend) needed the same handling. (Verified 2026-10-12.)
- **Severity:** 3
- **Workaround:** `resolveTripDates` turns every `AMAZON.DATE` shape into two calendar dates (a bare day takes the end date's month; a missing year means the next time that date comes) and asks again with an example when it cannot. Tool errors are logged, never spoken.
- **Suggestion:** a date-range slot type, or a documented table of the partial values `AMAZON.DATE` returns, with examples per locale.

### 9. Speak text that contains `&` or `<`
- **Steps:** returned speech built from official sources, for example a sentence with "&".
- **Expected:** Alexa says the text, or the response is rejected with a clear error.
- **Actual:** Alexa said "There was a problem with the requested skill's response", with no hint that the SSML was invalid. (Found by our robustness sweep, 2026-10-12.)
- **Severity:** 3
- **Workaround:** every response's SSML is escaped in one place (`escapeSsml` in `src/alexa/skill.ts`), and the sweep checks that every answer is valid SSML.
- **Suggestion:** escape plain-text speech in the ASK SDK by default, and name SSML parse errors in the device log and the console.

### 10. Test intent resolution automatically, not by hand
- **Steps:** wrote offline tests for every handler, then used the console's Test tab.
- **Expected:** offline tests catch most failures.
- **Actual:** only real Alexa shows which intent a phrase maps to and how slots are filled; the console is manual. (Verified 2026-10-12.)
- **Severity:** 2
- **Workaround:** `scripts/alexa-live.mjs` drives the Skill Simulation API after every deploy: 10 conversations, 35 turns, Spanish and English, checking the intent Alexa chose and the answer. Any "problem with the skill's response" fails the run.
- **Suggestion:** document the Simulation API as the CI path for skills, with a GitHub Actions sample.

---

## AWS (Lambda, IAM, Bedrock, Strands)

### 11. Serve MCP Streamable HTTP from a Lambda Function URL
- **Steps:** wrapped the Express app that hosts `/mcp` with `serverless-http`; deployed behind a Function URL; sent `initialize`.
- **Expected:** the same behaviour as the local server.
- **Actual:** `initialize` failed. `serverless-http` sets only `req.headers` and a parsed body copy, while the MCP SDK rebuilds the request from `req.rawHeaders` and reads the body stream. (Verified 2026-10-12.)
- **Severity:** 4
- **Workaround:** before the MCP app runs, copy `headers` into `rawHeaders` and drop the body copy (`src/server.ts`). Verified with a Function URL event on the built bundle: `initialize` returns protocol 2025-11-25.
- **Suggestion:** an official recipe for hosting an MCP Streamable HTTP server on Lambda (Function URL or API Gateway), since that is the natural AWS home for a self-hosted Alexa+ MCP server.

### 12. Return binary files from a Lambda Function URL
- **Steps:** served the skill icons (PNG) from the server for the skill manifest.
- **Expected:** Alexa fetches the icons.
- **Actual:** the PNG bytes were turned into UTF-8 text, and Alexa rejected the icons as an invalid content type, without saying the bytes were corrupted. (Verified 2026-10-12.)
- **Severity:** 2
- **Workaround:** return binary bodies as base64 with `isBase64Encoded: true`. For Polly speech we return base64 MP3 inside JSON, so the Function URL needs no binary setup.
- **Suggestion:** a warning in the Function URL docs, and an Alexa error that says "image could not be decoded" instead of "invalid content type".

### 13. Point the skill at an MCP endpoint in the same stack
- **Steps:** the skill handler called `/mcp` over HTTPS on the Function URL.
- **Expected:** one CDK deploy brings up both.
- **Actual:** the Function URL does not exist until the stack is deployed, so the skill had no address to call on the first deploy. (Verified 2026-10-12.)
- **Severity:** 2
- **Workaround:** when no `WAYPOINT_MCP_URL` is set, the skill opens an in-memory MCP connection to the server in the same Lambda process. Same tools, no network hop.
- **Suggestion:** an Alexa sample of a custom skill backed by an MCP server in the same Lambda; it is a common shape for Alexa+ builders who also ship a classic skill.

### 14. Assume an AWS role from GitHub Actions with OIDC
- **Steps:** created an IAM role trusting `token.actions.githubusercontent.com` with `sub` StringLike `repo:altaga/Waypoint:*`, the pattern most guides show; ran `aws-actions/configure-aws-credentials`.
- **Expected:** the role is assumed.
- **Actual:** `Not authorized to perform sts:AssumeRoleWithWebIdentity`. Printing the token claims showed GitHub sends `sub=repo:altaga@16561990/Waypoint@1414257254:ref:refs/heads/<branch>`, a format with immutable owner and repository ids, which the usual pattern does not match. (Verified 2026-10-11; the ids were checked against the GitHub API.)
- **Severity:** 3
- **Workaround:** trust both patterns: `repo:altaga@16561990/Waypoint@1414257254:*` and `repo:altaga/Waypoint:*`.
- **Suggestion:** the AWS and GitHub OIDC guides should show the id-qualified `sub` format, and the action's error could print the `sub` it received.

### 15. Make a Bedrock + Strands agent answer from MCP tool results
- **Steps:** connected a Strands agent on Bedrock to our MCP tools; asked a local-rules question from the live smoke workflow.
- **Expected:** the model answers from the rule the tool returned.
- **Actual:** Strands called `get_local_rules` correctly, but the model answered from memory. The tool's only text block was a short voice summary, and the rules list in `structuredContent` never reached the model. Our smoke test passed anyway: a false positive. (Verified 2026-10-11, first live run.)
- **Severity:** 3
- **Workaround:** every tool result also carries the serialized structured result as a second text block (as the MCP spec recommends for text-only clients); the system prompt forbids answering rules, entry, or prices from memory; the smoke test fails unless the answer uses the cited rule.
- **Suggestion:** have the Strands MCP client pass `structuredContent` to the model, or document that only text content is forwarded.

### 16. Type tool results with the MCP TypeScript SDK
- **Steps:** returned a named `ToolResult` interface from tool callbacks.
- **Expected:** compiles.
- **Actual:** type errors until the interface had an index signature. (Verified 2026-10-11.)
- **Severity:** 2
- **Workaround:** `[key: string]: unknown` on the result type.
- **Suggestion:** export a result type from the SDK, or document the expected shape.

---

## Hackathon logistics

### 17. Know whether the MCP endpoint must stay hosted
- **Steps:** read the FAQ, the rules, and the forum.
- **Expected:** one clear answer.
- **Actual:** the FAQ says the server does not need to stay running and a locally runnable repo plus video is enough. The rules say the project must be available for testing until the judging period ends, and a forum staff reply on 10 October said the same. (FAQ and rules verified 2026-10-11; the forum reply was not re-checked.)
- **Severity:** 3
- **Workaround:** both: a public Function URL kept up until judging ends on 20 November, and a local run in a few commands.
- **Suggestion:** one answer in the FAQ, with the forum pointing to it.

### 18. Find when judging starts
- **Steps:** compared the Rules page and the Dates tab.
- **Expected:** the same date.
- **Actual:** the rules say the judging period is 9–20 November 2026; the Dates tab said it starts 26 October. (Verified 2026-10-11.)
- **Severity:** 2
- **Workaround:** planned to the earlier date.
- **Suggestion:** align the pages.

### 19. Request AWS Promotional Credits
- **Steps:** read the rules' credit section, which gives a form deadline of 21 October.
- **Expected:** credits available until that deadline.
- **Actual:** "October 7th Update: We are out of credit codes." (Verified 2026-10-11.)
- **Severity:** 3
- **Workaround:** a deterministic tool router keeps the demo working with no AWS spend. Bedrock and Polly were turned on once spend was approved, with a 600-character limit and a 200-reply cache on speech so one visitor cannot run up the bill (cost notes in `docs/AWS.md`).
- **Suggestion:** announce stock limits on the overview page, and update the rules when codes run out.

---

## Third-party data sources

### 20. Get currency per country from REST Countries
- **Steps:** the original skeleton called REST Countries v3.1.
- **Expected:** a currency per country.
- **Actual:** the API is discontinued, and the code silently fell back to a 7-currency map.
- **Severity:** 4
- **Workaround:** `countries-list` (MIT, offline).
- **Suggestion:** announce the shutdown on the old endpoint with a clear error, so clients fail loudly instead of falling back in silence.

### 21. Fetch FCDO entry requirements from the GOV.UK Content API
- **Steps:** `curl https://www.gov.uk/api/content/foreign-travel-advice/singapore/entry-requirements`.
- **Expected:** JSON.
- **Actual:** HTTP 303 without redirect following; `united-states` returns 404 because FCDO does not cover the US. (Verified 2026-10-11.)
- **Severity:** 2
- **Workaround:** follow redirects; use the US State Dept for US data.
- **Suggestion:** document the redirect in the Content API guide.

### 22. Extract text from the US State Dept feed
- **Steps:** downloaded `CountryTravelInformation`.
- **Expected:** plain text per country.
- **Actual:** 5.9 MB with HTML fragments in every field; the US is not a destination in the feed. (Verified 2026-10-11.)
- **Severity:** 2
- **Workaround:** an HTML-to-text step; the US is skipped as a destination.
- **Suggestion:** offer a plain-text field.

### 23. Extract prohibited items from list-style pages
- **Steps:** sentence-level extraction over the FCDO Singapore page.
- **Expected:** "chewing gum to sell" extracted as a prohibited item.
- **Actual:** dropped: it is a short list item whose meaning lives in the heading above it. (Verified 2026-10-11.)
- **Severity:** 3
- **Workaround:** list items under a prohibition heading are kept, with the heading as context.
- **Suggestion:** structured fields in government travel feeds.

### 24. Trust heuristic rule extraction without review
- **Steps:** reviewed the built packs.
- **Expected:** clean rules.
- **Actual:** some entries were headings or fragments ("Dress code", "Medication bans"), and some severities were wrong. (Verified 2026-10-11.)
- **Severity:** 3
- **Workaround:** packs stay tier B until a human review; the validator refuses tier A without a named reviewer, and every card says "not yet reviewed by a person".
- **Suggestion:** Bedrock structured extraction with a human reviewer in the loop.
