# Feedback per tool

Required by the hackathon for every tool used. Honest notes from building Waypoint in this repo.

## Model Context Protocol TypeScript SDK (`@modelcontextprotocol/sdk` 1.32.1)

- Good: `registerTool` with `outputSchema`, `annotations` and `_meta` works as documented. `server.server.elicitInput` gives form elicitation with a JSON Schema. `StreamableHTTPServerTransport` with `onsessioninitialized` is simple.
- Friction: the type of a tool callback's return value must satisfy an index signature, so a named interface for tool results needs `[key: string]: unknown`. This cost a round of type errors.
- Friction: `LATEST_PROTOCOL_VERSION` is `2025-11-25`, which matches the hackathon. The SDK does not warn about the MCP Apps extension; the `_meta.ui` shape is untyped.
- Suggestion: a typed helper for `structuredContent` plus `outputSchema` validation in tests would catch drift.

## Strands Agents TypeScript SDK (`@strands-agents/sdk` 1.20.0)

- Good: `McpClient` accepts `url` and `headers` directly, which is the simplest path to pass the user header through.
- Not verified: `BedrockModel` has not been run against Bedrock in this repo (no approved spend).
- Suggestion: a documented way to pass a per-request user identity through the MCP client would help multi-user agents.

## Amazon Bedrock

- Not used at runtime yet. The brain is wired but not run. Access is an open question in `docs/FRICTION_LOG.md`.

## Alexa+ MCP Toolkit and `@alexa-ai/cli` (research only)

- Blocked for participants: the toolkit and CLI are partner-only. `@alexa-ai/cli` returned 404 on npm. See `docs/FRICTION_LOG.md`.

## GOV.UK Content API (FCDO)

- Good: stable JSON per country, with `parts` by slug (`entry-requirements`, `safety-and-security`, `health`).
- Friction: the URL answers `303` redirects; the client must follow them. There is no page for the United States, so US destinations have no FCDO data.

## US State Dept `cadataapi`

- Good: complete country set in one JSON response with `local_laws_and_special_circumstances` and `entry_exit_requirements`.
- Friction: the feed is about 5.9 MB, and fields are HTML fragments with inline markup, so text needs cleaning before matching. The United States is not a destination in the feed.

## passport-index-data (imorte)

- Good: a single CSV with ISO codes and clear status values, MIT licence.
- Friction: the LICENSE file says copyright 2019 while the data is updated in 2026. The status values mix numbers (stay days) with text; the parser handles both.

## countries-list (npm)

- Good: names, currencies, languages and ISO codes, MIT, offline.
- Friction: no Spanish names, so Waypoint keeps its own map for the destinations it supports.

## World Bank API, Wikidata SPARQL, open.er-api.com

- World Bank: good; `mrv=1` gives the latest year per country.
- Wikidata: good for plug types (P2853) and emergency numbers (P2852); the labels need English-language filtering.
- open.er-api: good and keyless; attribution is required, and the snapshot is what keeps the app working offline.
