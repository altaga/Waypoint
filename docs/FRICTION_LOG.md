# Friction log

Fields follow the official rules: task attempted, steps taken, expected vs. actual, severity, workaround, actionable suggestion. Severity: 1 minor · 2 low · 3 medium · 4 high · 5 blocker.

Only real entries. "Verified" means checked on 2026-10-11 against the official page or by running it. "From context doc" means taken from the research document and not re-run in this build.

### 1. Install the Alexa+ CLI and Local Inspector
- **Steps:** followed the MCP Toolkit Quickstart; tried `@alexa-ai/cli` and `@alexa-ai/addon-local-inspector` from npm.
- **Expected:** packages install, as the setup pages suggest.
- **Actual:** 404 on npm. The official FAQ confirms these tools are partner-only, and notes the caveat "is sometimes missing from individual setup-guide pages". (From context doc; FAQ verified.)
- **Severity:** 4
- **Workaround:** self-hosted MCP server plus a web page that acts as a real MCP client, the path the FAQ allows.
- **Suggestion:** put the partner-only notice on every setup page, not only the docs home.

### 2. Test on a real Alexa+ device
- **Steps:** looked for any way to connect a self-hosted MCP server to Alexa+ or the developer console.
- **Expected:** a sandbox for participants.
- **Actual:** none exists; the FAQ says no participant can connect a self-hosted server to Alexa+. (Verified.)
- **Severity:** 3
- **Workaround:** simulated Echo Show host with voice, cards, elicitation and an MCP App iframe.
- **Suggestion:** a public sandbox, even rate-limited, would let teams test the real voice surface.

### 3. Use the MCP version from the Client Lifecycle example
- **Steps:** read the Client Lifecycle page.
- **Expected:** the example uses 2025-11-25, which the page says is supported.
- **Actual:** the example uses `protocolVersion` 2025-03-26. (From context doc.)
- **Severity:** 2
- **Workaround:** used 2025-11-25 everywhere, matching the SDK and the rules.
- **Suggestion:** update the example.

### 4. Decide whether the MCP endpoint must stay hosted
- **Steps:** read the FAQ and the forum.
- **Expected:** one clear answer.
- **Actual:** the FAQ says the server does not need to stay running and a locally runnable repo plus video is enough (verified). The context doc cites a forum staff reply on 10 October saying it must stay live until judging ends (not re-checked here). The rules also require the project to be available for testing until judging ends.
- **Severity:** 3
- **Workaround:** local run in under five commands, documented in the README; hosting kept optional.
- **Suggestion:** put one answer in the FAQ and have the forum point to it.

### 5. Find when judging starts
- **Steps:** compared the Rules page and the Dates tab.
- **Expected:** the same date.
- **Actual:** Rules say judging is 9–20 November; the Dates tab says it starts 26 October. (Verified.)
- **Severity:** 2
- **Workaround:** plan to the earlier date.
- **Suggestion:** align the pages.

### 6. Request AWS Promotional Credits
- **Steps:** read the rules' credit section.
- **Expected:** credits available until the 21 October form deadline stated in the rules.
- **Actual:** "October 7th Update: We are out of credit codes." (Verified.)
- **Severity:** 3
- **Workaround:** mock Bedrock by default, as the FAQ recommends; no deploy without an approved budget.
- **Suggestion:** announce stock limits earlier.

### 7. Get country currency data
- **Steps:** the original skeleton called REST Countries v3.1.
- **Expected:** currency per country.
- **Actual:** the API is discontinued and the code silently fell back to a 7-currency map. (From context doc.)
- **Severity:** 4
- **Workaround:** `countries-list` (MIT, offline).
- **Suggestion:** fail loudly when a data source disappears.

### 8. Fetch FCDO entry requirements
- **Steps:** `curl https://www.gov.uk/api/content/foreign-travel-advice/singapore/entry-requirements`.
- **Expected:** JSON.
- **Actual:** HTTP 303 without redirect following; `united-states` returns 404 because FCDO does not cover the US. (Verified.)
- **Severity:** 2
- **Workaround:** follow redirects; use the State Dept for US data.
- **Suggestion:** document the redirect in the Content API guide.

### 9. Extract text from the State Dept feed
- **Steps:** downloaded `CountryTravelInformation`.
- **Expected:** plain text per country.
- **Actual:** 5.9 MB with HTML fragments in every field; the US is not a destination in the feed. (Verified.)
- **Severity:** 2
- **Workaround:** HTML-to-text step; US skipped as a destination.
- **Suggestion:** offer a plain-text field.

### 10. Extract prohibited items from list-style pages
- **Steps:** sentence-level extraction over the FCDO Singapore page.
- **Expected:** "chewing gum to sell" extracted as a prohibited item.
- **Actual:** dropped: it is a short list item whose meaning lives in the heading above it. (Verified.)
- **Severity:** 3
- **Workaround:** list items under a prohibition heading are kept, with the heading as context.
- **Suggestion:** structured fields in government travel feeds.

### 11. Trust heuristic rule extraction
- **Steps:** reviewed the built packs.
- **Expected:** clean rules.
- **Actual:** some entries are headings or fragments ("Dress code", "Medication bans"), and some severities are wrong. (Verified.)
- **Severity:** 3
- **Workaround:** packs stay tier B until a human review; the validator refuses tier A without a named reviewer.
- **Suggestion:** Bedrock structured extraction plus a reviewer, planned.

### 12. Type tool results with the MCP SDK
- **Steps:** returned a named `ToolResult` interface from tool callbacks.
- **Expected:** compiles.
- **Actual:** type errors until the interface had an index signature. (Verified.)
- **Severity:** 2
- **Workaround:** `[key: string]: unknown` on the result type.
- **Suggestion:** document the expected shape, or export a result type.

### 13. Validate Bedrock access
- **Steps:** prepared the Strands brain; did not call Bedrock.
- **Expected:** a quick validation call.
- **Actual:** not run, because spend needs approval. The context doc reports forum cases of zero quotas for new accounts. (Not verified.)
- **Severity:** 4
- **Workaround:** the deterministic router keeps the demo working without AWS.
- **Suggestion:** confirm model access in the onboarding checklist.

### 14. Assume an AWS role from GitHub Actions with OIDC
- **Steps:** created an IAM role trusting `token.actions.githubusercontent.com` with `sub` StringLike `repo:altaga/Waypoint:*`, the pattern most guides show; ran `aws-actions/configure-aws-credentials`.
- **Expected:** the role is assumed.
- **Actual:** `Not authorized to perform sts:AssumeRoleWithWebIdentity`. Printing the token claims showed GitHub sends `sub=repo:altaga@16561990/Waypoint@1414257254:ref:refs/heads/<branch>`, a format with immutable owner and repository IDs, which the usual pattern does not match. (Verified 2026-10-11; the IDs were checked against the GitHub API before use.)
- **Severity:** 3
- **Workaround:** trust both patterns: `repo:altaga@16561990/Waypoint@1414257254:*` and `repo:altaga/Waypoint:*`.
- **Suggestion:** the AWS and GitHub OIDC guides should show the ID-qualified `sub` format, and the action's error could print the received `sub`.
