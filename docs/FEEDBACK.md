# Product feedback

The official rules ask, for each tool, API or SDK used: which tools and what for, what worked well, what needs work, how onboarding felt, and whether we would build with it again. For AWS Builder, they ask which AWS services were used and how. This file answers in that order.

Status is honest as of 2026-10-11: anything not yet run is marked so.

## Model Context Protocol TypeScript SDK (`@modelcontextprotocol/sdk` 1.32.1)

- **Used for:** the Waypoint MCP server (Streamable HTTP, protocol 2025-11-25), tool registration with `outputSchema` and annotations, form elicitation, the MCP App resource, and the MCP client in the end-to-end tests.
- **Worked well:** `registerTool` with `outputSchema`, `annotations` and `_meta` behaves as documented. `server.server.elicitInput` gives form elicitation with a JSON Schema. `StreamableHTTPServerTransport` with `onsessioninitialized` is simple to wire into Express. `LATEST_PROTOCOL_VERSION` is already `2025-11-25`.
- **Needs work:** the tool callback's return type needs an index signature, so a named result interface needs `[key: string]: unknown` (a round of type errors). The MCP Apps `_meta.ui` shape is untyped in the core SDK.
- **Onboarding:** zero to a working tool call in under an hour, with the SDK's own examples.
- **Build again:** Yes. It is the standard path for Alexa+ and other MCP hosts, and the server and client in one package made end-to-end testing easy.

## MCP Apps extension (spec 2026-01-26)

- **Used for:** the `plan_trip` readiness dashboard (`ui://` resource, `text/html;profile=mcp-app`) and the iframe host in the simulator.
- **Worked well:** the postMessage protocol (`ui/initialize`, `ui/notifications/initialized`, `ui/notifications/tool-result`) is small enough to implement by hand.
- **Needs work:** we did not use `@modelcontextprotocol/ext-apps`; a host-side reference smaller than the full package would help simulator authors.
- **Onboarding:** reading the spec was enough; about two hours to a working widget.
- **Build again:** Yes. Cards alone cannot show a per-traveler dashboard.

## Strands Agents TypeScript SDK (`@strands-agents/sdk` 1.20.0)

- **Used for:** the optional "Alexa brain" (`src/brain.ts`): a Strands `Agent` with `BedrockModel` and an `McpClient` pointed at our own server.
- **Worked well:** `McpClient` accepts `url` and `headers` directly, which is the simplest way to pass the user header through.
- **Needs work:** a documented way to pass per-request user identity through the MCP client would help multi-user agents.
- **Onboarding:** typed and compiling in about 30 minutes. **Not yet run against Bedrock** (no spend approved yet).
- **Build again:** Yes, pending the first live run.

## Amazon Bedrock (AWS Builder)

- **Which service and how:** Bedrock is the model provider for the Strands brain at runtime (`WAYPOINT_BRAIN=bedrock`, `WAYPOINT_BEDROCK_MODEL`). The design also uses Bedrock for structured extraction of country rules (context doc §4.7), not built yet.
- **Status:** wired and type-checked; **not run**. Following the official FAQ's advice, the app mocks the brain by default (a deterministic router) and the live API is to be hit only to validate the integration.
- **Worked well / needs work / onboarding / build again:** to be filled after the first approved run. No claims until then.

## Alexa+ MCP Toolkit and `@alexa-ai/cli` (research only)

- **Used for:** nothing at runtime; partner-only.
- **Needs work:** the docs present the CLI and Local Inspector as available, but both are partner-only (the official FAQ confirms) and `@alexa-ai/cli` returned 404 on npm. The Design Guide and tool-schema guidance were useful anyway.
- **Build again:** Yes, if access opens.

## Data APIs

| Tool | Used for | Worked well | Needs work | Build again |
|---|---|---|---|---|
| GOV.UK Content API (FCDO) | Local rules and entry notes, 13 countries | Stable JSON, `parts` by slug | Answers 303 redirects; no page for the United States | Yes |
| US State Dept `cadataapi` | Local laws and entry text | Whole country set in one call | 5.9 MB of HTML-in-JSON; the US is not a destination | Yes |
| passport-index-data (imorte, MIT) | Passport → destination matrix | One CSV, ISO codes | LICENSE says 2019 while data is 2026; mixed value types | Yes |
| countries-list (npm, MIT) | Currencies, languages | Offline, small | No Spanish names | Yes |
| World Bank API | PPP factors | `mrv=1` gives the latest year | Some countries lag a year | Yes |
| Wikidata SPARQL | Plug types, emergency numbers | CC0, one query for all countries | Labels need a language filter | Yes |
| open.er-api.com | Live FX | Keyless, wide coverage | Attribution required; we keep a snapshot for offline | Yes |

Onboarding for all of them was minutes: public JSON with no keys.

## Development tools

- **Claude Code:** used to write and test the code in this repository.
