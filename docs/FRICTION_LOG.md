# Friction log

Real entries only. Each has a date, area, what was tried, what happened, impact (1 = minor, 5 = blocker), workaround and suggestion. Items marked (forum/doc) come from the hackathon documentation and forums, verified on 2026-10-11 during research, not reproduced in this build.

| # | Date | Area | Impact | What happened | Workaround | Suggestion |
|---|---|---|---|---|---|---|
| 1 | 2026-10-11 | Alexa+ tooling | 5 | `@alexa-ai/cli` and `@alexa-ai/addon-local-inspector` return 404 on npm, while the docs present them as available (doc, verified) | Self-hosted MCP server and a real MCP web client | Mark partner-only packages clearly in the docs |
| 2 | 2026-10-11 | Alexa+ MCP Toolkit | 5 | Toolkit and Category SDK are partner-only and US-only; no way to test on a real Alexa+ device (doc) | Simulated host with a real MCP client, as the FAQ allows | Publish a sandbox for participants |
| 3 | 2026-10-11 | MCP spec docs | 2 | Client lifecycle example uses `protocolVersion` 2025-03-26 while it claims 2025-11-25 (doc) | Used 2025-11-25 everywhere | Fix the example |
| 4 | 2026-10-11 | Rules | 4 | FAQ says the endpoint need not stay live after submission; a forum staff reply on 10-oct says it must stay live until judging ends (doc) | Plan to keep the endpoint up; ask at Office Hours | One authoritative answer |
| 5 | 2026-10-11 | Dates | 2 | Rules and the Dates tab disagree on when judging starts (doc) | Use the stricter date | Align the pages |
| 6 | 2026-10-07 | AWS credits | 4 | Hackathon credit codes ran out on 7 October (rules) | Budget-capped, no deploy without approval | Announce earlier |
| 7 | 2026-10-11 | Gallery | 1 | The project gallery is not published, so no official examples to compare against (observed) | Searched Devpost directly | Publish it |
| 8 | 2026-10-11 | Country data | 4 | REST Countries v3.1 is discontinued; the old skeleton silently fell back to a 7-currency map (doc, observed in the old code) | Replaced with countries-list | Fail loudly on missing data |
| 9 | 2026-10-11 | FCDO API | 2 | The `entry-requirements` endpoint answers 303 without redirect following; the United States has no page (observed) | Client follows redirects; US uses State Dept | Document the redirect |
| 10 | 2026-10-11 | State Dept feed | 2 | 5.9 MB JSON with HTML fragments in each field; the United States is not a destination in the feed (observed) | Strip HTML, skip the US as a destination | Ship a slimmer feed |
| 11 | 2026-10-11 | Rule extraction | 3 | A list item under a prohibition heading ("chewing gum to sell") was dropped by sentence-level extraction (observed) | Added list-item handling with the heading as context | Structured sources would avoid this |
| 12 | 2026-10-11 | Rule extraction | 3 | Heuristic extraction picks weak sentences ("Dress code", "Medication bans") and misclassifies some severities (observed) | Packs stay tier B until human review | Bedrock structured extraction with a reviewer |
| 13 | 2026-10-11 | MCP SDK typing | 2 | Tool results need an index signature to satisfy the callback type (observed) | Added `[key: string]: unknown` to the result type | Document the type shape |
| 14 | 2026-10-11 | Passport data | 1 | The LICENSE says copyright 2019; the dataset is dated 2026 (observed) | Record the snapshot date; keep the MIT notice | Clarify the copyright year |
| 15 | 2026-10-11 | Bedrock | 4 | Access is unverified. The build environment has AWS credentials, but Bedrock was not called because the plan requires explicit approval before any spend. Forum reports mention zero quotas for new accounts (doc) | Brain is optional; the local router works without AWS | Confirm model access before the build starts |
