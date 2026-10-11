# Status

Last updated: 2026-10-11 (UTC+7, D0). Repository: branch `claude/elegant-wozniak-qch21g`.

## Done

- **Server:** MCP 2025-11-25 over Streamable HTTP at `/mcp`, origin guard, sessions, 12 tools with `outputSchema`, annotations and the common envelope, friendly errors.
- **Elicitation:** passport country (missing traveler) and `forget_me` confirmation. Falls back to `missingFields` when the client has no elicitation.
- **MCP App:** `plan_trip` links `ui://waypoint/plan-dashboard-<hash>.html` (`text/html;profile=mcp-app`); widget renders the per-traveler dashboard in a sandboxed iframe.
- **Data:** passport matrix vendored (MIT, 2026-02-17); 13 country packs built from FCDO and State Dept with verbatim quotes, validated. Tier B (not human reviewed).
- **Services:** FX (live with snapshot fallback), World Bank PPP, countries-list for currencies (replaces REST Countries), state in a file store with a `StateStore` interface.
- **Simulator:** Echo Show-style frame, real MCP client with protocol log, ES/EN, Web Speech (where available), text fallback, elicitation form, MCP App host, deterministic router, optional Bedrock brain endpoint.
- **Tests:** 28 passing (unit, offline e2e over Streamable HTTP, profile, errors). Browser smoke test passing in Chromium.
- **Eval:** 33/33 cited facts (note: visa facts mirror the vendored CSV; see TESTING.md).
- **Docs:** README, TESTING, FEEDBACK, FRICTION_LOG, DEMO_SCRIPT, AWS, OPEN_SOURCE, DATA_REVIEW, Agent Skill (`skills/waypoint/SKILL.md`), CI workflow.
- **Open source:** `oss/travel-entry-packs/` scaffolded and tested. Public repo not created yet.

## Not done (and why)

- **Human review of packs (tier A):** needs a reviewer, about 3 hours. Checklist in DATA_REVIEW.md.
- **Bedrock pack extraction:** not built yet. The Bedrock brain itself is verified live (aws-smoke workflow).
- **Hosting and deployment:** needs approval and budget alert (AWS.md).
- **Video, Devpost submission, GitHub repo settings:** owner actions.
- **find_events:** no verified event source in the build environment.
- **build_itinerary:** provides low-confidence suggestions only; no verified activity data.
- **Spanish rule summaries:** empty; needs translation.
- **GB and US destinations:** no rule sources yet.
- **OAuth 2.1 / PKCE:** not implemented (nice to have per context doc).
- **Icons, ext-apps package:** the MCP App host is hand-written; `@modelcontextprotocol/ext-apps` not used.

## Next

1. Human review of JP, SG, VN (demo storyline) using DATA_REVIEW.md.
2. Run the Bedrock brain once with approval; record the result in FRICTION_LOG.md.
3. Decide whether to host. Not required: the official FAQ accepts a locally runnable repo plus the video.
4. Publish the OSS repo; record URLs in OPEN_SOURCE.md.
5. Record the demo with DEMO_SCRIPT.md.
