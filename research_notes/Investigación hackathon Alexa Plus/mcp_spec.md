# MCP Specification 2025-11-25 (and later) — Remote Server Compliance Checklist

> Research date: 2026-10-13. **Critical context:** 2025-11-25 is no longer the latest revision. A **2026-07-28** revision shipped on July 28, 2026 with breaking transport/lifecycle changes (stateless core, no sessions, no `initialize`, no GET stream). A server that targets "2025-11-25 only" is now one version behind. The checklist below covers 2025-11-25 (what most deployed clients still speak) and flags 2026-07-28 deltas. — [MCP blog: The 2026-07-28 Specification](https://blog.modelcontextprotocol.io/posts/2026-07-28/); [2026-07-28 changelog](https://modelcontextprotocol.io/specification/2026-07-28/changelog)

## Streamable HTTP transport requirements (POST/GET, SSE, Mcp-Session-Id, MCP-Protocol-Version, Origin/DNS rebinding, statelessness)

### Takeaway
Under 2025-11-25 a remote server needs one MCP endpoint handling POST (and GET, or 405), must validate `Origin` (403 on invalid), must 400 on invalid/unsupported `MCP-Protocol-Version`, and may optionally be stateful via `MCP-Session-Id`. Under 2026-07-28 sessions, GET streams, `initialize`, and SSE resumability are all gone; new required headers (`Mcp-Method`, `Mcp-Name`) and `server/discover` appear.

### Cited Findings
**2025-11-25 (server MUSTs)**
- Server MUST provide a single MCP endpoint path supporting both POST and GET (e.g. `https://example.com/mcp`). — [2025-11-25 Transports](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports)
- Servers MUST validate the `Origin` header on all incoming connections to prevent DNS rebinding; if `Origin` is present and invalid, MUST respond HTTP 403 Forbidden (body MAY be a JSON-RPC error with no `id`). Local servers SHOULD bind to 127.0.0.1 not 0.0.0.0; servers SHOULD implement proper authentication. (The explicit 403 was a 2025-11-25 clarification, PR #1439.) — [Transports](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports); [2025-11-25 changelog](https://modelcontextprotocol.io/specification/2025-11-25/changelog)
- Client MUST send `Accept: application/json, text/event-stream`. POST body is a single JSON-RPC request, notification, or response. — [Transports](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports)
- For a POSTed notification/response: if accepted, server MUST return **202 Accepted with no body**; otherwise an HTTP error (e.g. 400). — same
- For a POSTed request: server MUST return either `Content-Type: text/event-stream` (SSE) or `application/json` (single object); clients MUST support both. — same
- If SSE: server SHOULD immediately send an event with an event ID and empty `data` (to prime reconnection); MAY close the connection at any time after sending an event ID ("polling", SEP-1699) and SHOULD send a `retry` field before closing; SSE stream SHOULD eventually include the JSON-RPC response and SHOULD terminate after it; MAY send related requests/notifications before the response. Disconnection SHOULD NOT be interpreted as cancellation. — same; [changelog](https://modelcontextprotocol.io/specification/2025-11-25/changelog)
- GET: server MUST either return `text/event-stream` or **405 Method Not Allowed**. On the GET stream, server MUST NOT send a JSON-RPC response unless resuming. — [Transports](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports)
- Multiple streams: server MUST send each message on only one stream (no broadcast). — same
- Resumability (optional): SSE event IDs, if present, MUST be globally unique across all streams within the session; SHOULD encode the originating stream; resumption is always via GET + `Last-Event-ID`; server MUST NOT replay messages from a different stream. — same
- Sessions (optional): server MAY assign `MCP-Session-Id` on the HTTP response carrying `InitializeResult`; SHOULD be globally unique & cryptographically secure; MUST contain only visible ASCII 0x21–0x7E. Servers requiring a session SHOULD return 400 for non-initialize requests lacking it; after terminating a session the server MUST return **404** for that ID; client then re-initializes. Clients SHOULD send HTTP DELETE to end a session; server MAY answer 405. — same
- `MCP-Protocol-Version` header: client MUST send it on all subsequent requests (e.g. `MCP-Protocol-Version: 2025-11-25`). If absent and version not otherwise known, server SHOULD assume `2025-03-26`. Invalid/unsupported value → server MUST respond **400 Bad Request**. — same
- Backward compat with deprecated HTTP+SSE (2024-11-05): servers wanting old clients can keep the old SSE+POST endpoints alongside. — same
- Statelessness in 2025-11-25: session IDs are a MAY, so a stateless server (no `MCP-Session-Id`, JSON responses, GET → 405) is compliant. However, elicitation state "MUST NOT be associated with session IDs alone" and must be bound to user identity. — [Transports](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports); [Elicitation](https://modelcontextprotocol.io/specification/2025-11-25/client/elicitation)

**2026-07-28 deltas (current latest)**
- Protocol-level sessions and `Mcp-Session-Id` removed; cross-call state uses server-minted handles passed as tool args (SEP-2567). — [2026-07-28 changelog](https://modelcontextprotocol.io/specification/2026-07-28/changelog)
- `initialize`/`notifications/initialized` removed; each request carries `_meta` keys `io.modelcontextprotocol/protocolVersion`, `.../clientCapabilities`, (SHOULD) `.../clientInfo`; servers SHOULD put `io.modelcontextprotocol/serverInfo` in results' `_meta`. New required RPC `server/discover` (servers MUST implement). Version mismatch → `UnsupportedProtocolVersionError` (-32022) (SEP-2575). — same
- GET endpoint and `resources/subscribe` replaced by `subscriptions/listen` (long-lived POST-response SSE). `ping`, `logging/setLevel` removed. SSE resumability/`Last-Event-ID` removed. — same
- Server-initiated requests (sampling/elicitation/roots) replaced by Multi Round-Trip Requests: server returns `InputRequiredResult` (`resultType: "input_required"`, `inputRequests`); client retries with `inputResponses`. All results carry `resultType` (SEP-2322). — same
- Every POST MUST carry `MCP-Protocol-Version` matching the body `_meta` (else 400 + `HeaderMismatch` -32020), plus required `Mcp-Method` (all requests) and `Mcp-Name` (`tools/call`, `resources/read`, `prompts/get`); Base64 sentinel `=?base64?…?=` for non-ASCII. Unknown method → **404** + JSON-RPC -32601. Optional `x-mcp-header` in tool inputSchema mirrors params to `Mcp-Param-{Name}` (SEP-2243). Origin/403 rules unchanged. Servers SHOULD send `X-Accel-Buffering: no` on SSE. Closing the SSE response stream = cancellation. — [2026-07-28 Streamable HTTP](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http)
- A 2026-07-28-only server receiving old-client traffic SHOULD: 405 for GET/DELETE; ignore `Mcp-Session-Id` (don't mint/echo); ignore `Last-Event-ID`. Dual-era servers implement both revisions; clients probe modern first and fall back to `initialize` on a 400 whose body isn't a modern JSON-RPC error. — same
- List results (`tools/list`, `prompts/list`, `resources/list`, `resources/read`, `resources/templates/list`) require `ttlMs` and `cacheScope` (SEP-2549); servers SHOULD return tools in deterministic order; resource-not-found code changes -32002 → -32602. — [2026-07-28 changelog](https://modelcontextprotocol.io/specification/2026-07-28/changelog)

### Inferences
- For an audit "impressive" bar: implement 2025-11-25 Streamable HTTP correctly (since that's what Claude/ChatGPT/Inspector clients widely deployed speak) AND either support 2026-07-28 dual-era or at least make the server effectively stateless (no reliance on session IDs, GET → 405, JSON responses) so migration is trivial. Supporting both eras and passing `conformance --requirements 2026-07-28` would be a strong differentiator.
- Quick probes a judge can run with curl: POST without/with bad `Origin` → 403; bad `MCP-Protocol-Version` → 400; notification POST → 202 empty; GET → SSE or 405; expired session → 404.

### Gaps
- Which protocol versions Claude.ai connectors and ChatGPT developer mode currently negotiate (2025-11-25 vs 2026-07-28) was not found in official docs.

## Authorization spec (OAuth 2.1, protected resource metadata, CIMD, when auth is optional)

### Takeaway
Auth is OPTIONAL; if implemented over HTTP, the MCP server is an OAuth 2.1 resource server that MUST publish RFC 9728 Protected Resource Metadata (with `authorization_servers`), return 401 + `WWW-Authenticate` (or well-known fallback), validate token audience, and never pass tokens through. CIMD is the recommended client registration (DCR is MAY in 2025-11-25 and **deprecated** in 2026-07-28).

### Cited Findings
- "Authorization is OPTIONAL for MCP implementations." HTTP implementations that support it SHOULD conform; stdio SHOULD NOT (use env credentials). — [2025-11-25 Authorization](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization)
- Based on OAuth 2.1 draft-13, RFC 8414, RFC 7591, RFC 9728, and draft-ietf-oauth-client-id-metadata-document-00. — same
- MCP servers MUST implement RFC 9728 Protected Resource Metadata; the document MUST include `authorization_servers` with at least one AS. — same
- PRM discovery: server MUST implement either (1) `WWW-Authenticate` with `resource_metadata` on 401, or (2) well-known URI — path-specific `/.well-known/oauth-protected-resource/<mcp-path>` or root `/.well-known/oauth-protected-resource`. Making the header optional with fallback came from SEP-985. — same; [changelog](https://modelcontextprotocol.io/specification/2025-11-25/changelog)
- Servers SHOULD include `scope` in `WWW-Authenticate` (RFC 6750 §3); `scopes_supported` should be the minimal basic set, with step-up for more (SEP-835). — [Authorization](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization)
- Insufficient scope at runtime: server SHOULD return **403** with `WWW-Authenticate: Bearer error="insufficient_scope", scope="…", resource_metadata="…"`. Status codes: 401 (missing/invalid token — invalid/expired tokens MUST get 401), 403 (insufficient scope), 400 (malformed). — same
- AS MUST offer RFC 8414 or OIDC Discovery metadata (OIDC discovery support added PR #797); OIDC ASs MUST include `code_challenge_methods_supported` (clients refuse without PKCE S256). — same; [changelog](https://modelcontextprotocol.io/specification/2025-11-25/changelog)
- Client registration priority: pre-registered → Client ID Metadata Documents (if AS advertises `client_id_metadata_document_supported: true`) → DCR (`registration_endpoint`) → manual. CIMD: `client_id` is an HTTPS URL with a path; doc MUST include `client_id`, `client_name`, `redirect_uris`; AS MUST verify `client_id` matches URL and validate redirect URIs; SHOULD consider SSRF. CIMD added in SEP-991. — [Authorization](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization); [changelog](https://modelcontextprotocol.io/specification/2025-11-25/changelog)
- Clients MUST send RFC 8707 `resource` (canonical server URI, e.g. `https://mcp.example.com/mcp`, no fragment, prefer no trailing slash) in authorization & token requests. — [Authorization](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization)
- Server MUST validate tokens per OAuth 2.1 §5.2 and MUST validate audience (issued specifically for it); MUST NOT accept or transit other tokens; MUST NOT pass through the client's token to upstream APIs (use a separate upstream token). Tokens MUST be in `Authorization: Bearer` on every request, never in query string. — same
- AS endpoints MUST be HTTPS; redirect URIs MUST be localhost or HTTPS; public-client refresh tokens MUST rotate; PKCE S256 required. — same
- Proxy servers using static client IDs MUST obtain user consent for each dynamically registered client (confused deputy). — same
- Auth extensions are listed in [ext-auth repo](https://github.com/modelcontextprotocol/ext-auth). — [Authorization](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization)
- 2026-07-28: AS SHOULD include `iss` in authorization responses (RFC 9207), clients MUST validate it (SEP-2468); DCR requires `application_type` (SEP-837); client creds bound to issuer (SEP-2352); **DCR deprecated in favor of CIMD** (PR #2858). — [2026-07-28 changelog](https://modelcontextprotocol.io/specification/2026-07-28/changelog)
- TS SDK 2.3.1 (Oct 5) added an optional `expectedResource` to `requireBearerAuth` in `server-legacy` — i.e. SDK helper for audience validation. — [typescript-sdk releases](https://github.com/modelcontextprotocol/typescript-sdk/releases)

### Inferences
- For a hackathon server: no-auth is spec-compliant; but if the server touches user data, a "impressive" implementation serves PRM at both header and well-known paths, returns proper 401/403 challenges with `scope`, validates `aud`, and uses an AS that supports CIMD (and DCR for older clients such as those predating 2025-11-25).
- Third-party (e.g., Amazon/Alexa) credentials should be obtained via URL-mode elicitation / server-side OAuth client, never by passing through the MCP bearer token.

### Gaps
- Exact current Claude.ai / ChatGPT client registration behaviour (CIMD vs DCR) not verified from official docs in this session.

## New/notable features in 2025-11-25 (tasks, elicitation form+URL, sampling with tools, structuredContent/outputSchema, annotations, icons, resource links)

### Takeaway
2025-11-25 added icons, tool-name guidance, URL-mode elicitation, standards-based enum schemas, sampling with tools, CIMD, and experimental tasks; tool results support `structuredContent` + `outputSchema`, `resource_link`, and execution errors via `isError` (including input validation). Several of these were reshaped in 2026-07-28 (tasks → extension; sampling deprecated; elicitation completion notification removed).

### Cited Findings
**Change list (2025-11-25)** — [changelog](https://modelcontextprotocol.io/specification/2025-11-25/changelog)
- Icons for tools/resources/resource templates/prompts (SEP-973); incremental scope consent (SEP-835); tool-name guidance (SEP-986); ElicitResult/EnumSchema standardization incl. titled/multi-select enums (SEP-1330); URL mode elicitation (SEP-1036); sampling `tools` + `toolChoice` (SEP-1577); CIMD (SEP-991); experimental tasks (SEP-1686); optional `description` on `Implementation`; input validation errors as Tool Execution Errors (SEP-1303); SSE polling (SEP-1699); default values in elicitation schemas (SEP-1034); JSON Schema 2020-12 as default dialect (SEP-1613).

**Tools** — [2025-11-25 Tools](https://modelcontextprotocol.io/specification/2025-11-25/server/tools)
- Server MUST declare `tools` capability (`listChanged` optional; if declared SHOULD send `notifications/tools/list_changed`). `tools/list` supports pagination.
- Tool fields: `name`, optional `title`, `description`, optional `icons` (`src`, `mimeType`, `sizes`), `inputSchema` (MUST be a valid JSON Schema object, not null; defaults to 2020-12; no-param recommended form `{"type":"object","additionalProperties":false}`), optional `outputSchema`, optional `annotations`, optional `execution.taskSupport` (`forbidden` default / `optional` / `required`).
- Tool names SHOULD be 1–128 chars, case-sensitive, only `A-Z a-z 0-9 _ - .`, unique per server.
- Content types: `text`, `image` (base64+mimeType), `audio`, `resource_link` (uri/name/description/mimeType; not guaranteed to appear in `resources/list`), embedded `resource` (servers using it SHOULD implement `resources` capability). All support annotations (`audience`, `priority`, `lastModified`).
- `structuredContent`: tools returning it SHOULD also return serialized JSON in a TextContent block. If `outputSchema` provided, servers MUST return structured results conforming to it; clients SHOULD validate.
- Errors: protocol errors (unknown tool → -32602, malformed request) vs Tool Execution Errors with `isError: true` for API failures, **input validation errors**, business logic errors.
- Clients MUST treat annotations as untrusted unless from trusted servers. Servers MUST validate inputs, implement access controls, rate limit invocations, sanitize outputs.
- 2026-07-28: input/outputSchema may use any 2020-12 keywords and `structuredContent` may be any JSON value (SEP-2106). — [2026-07-28 changelog](https://modelcontextprotocol.io/specification/2026-07-28/changelog)

**Tasks (experimental in 2025-11-25)** — [2025-11-25 Tasks](https://modelcontextprotocol.io/specification/2025-11-25/basic/utilities/tasks)
- Server capability: `tasks: { list: {}, cancel: {}, requests: { tools: { call: {} } } }`. Clients MUST NOT task-augment tools unless capability present; per-tool `execution.taskSupport`; `required` without task → server MUST return -32601.
- Request param `task: { ttl }`; server returns `CreateTaskResult` (`taskId`, `status: working`, `createdAt`, `lastUpdatedAt`, `ttl`, `pollInterval`). Methods: `tasks/get`, `tasks/result` (blocks until terminal; returns exactly the underlying result/error; MUST include `_meta["io.modelcontextprotocol/related-task"]`), `tasks/list`, `tasks/cancel` (terminal → -32602). Optional `notifications/tasks/status`. Statuses: working, input_required, completed, failed, cancelled. Optional `_meta["io.modelcontextprotocol/model-immediate-response"]`.
- Security: when auth context exists, tasks MUST be bound to it; otherwise task IDs MUST be cryptographically secure and servers SHOULD NOT declare `tasks.list`.
- 2026-07-28: tasks moved to extension `io.modelcontextprotocol/tasks` — `tasks/result` replaced by polling `tasks/get` + new `tasks/update`, `tasks/list` removed, unsolicited task handles allowed (SEP-2663). — [2026-07-28 changelog](https://modelcontextprotocol.io/specification/2026-07-28/changelog)

**Elicitation** — [2025-11-25 Elicitation](https://modelcontextprotocol.io/specification/2025-11-25/client/elicitation)
- Client capability `elicitation: { form: {}, url: {} }` (empty object = form only). Servers MUST NOT send modes the client didn't declare.
- Form mode: flat object of primitives (string w/ formats email/uri/date/date-time, number/integer, boolean, enums single/multi, titled via `oneOf`/`anyOf` `const`+`title`), defaults allowed. Servers MUST NOT request passwords/API keys/tokens/payment credentials via form mode.
- URL mode (new, may change): `mode:"url"`, `url`, `elicitationId`, `message`; `accept` means consent only; server MAY send `notifications/elicitation/complete`; server MAY return `URLElicitationRequiredError` code **-32042** with `data.elicitations`. URL mode is NOT for authorizing the client to the MCP server itself.
- Server MUSTs: bind elicitation state to user identity (not session ID alone; derive from auth `sub`); verify the user opening the URL is the same user (anti-phishing); no PII/credentials in URL; no pre-authenticated URLs; SHOULD use HTTPS; MUST NOT forward third-party creds to client.
- 2026-07-28: elicitation delivered via MRTR `InputRequiredResult`; `notifications/elicitation/complete` and `elicitationId` removed. — [2026-07-28 changelog](https://modelcontextprotocol.io/specification/2026-07-28/changelog)

**Sampling with tools**
- Sampling requests gain `tools` and `toolChoice` (SEP-1577). — [2025-11-25 changelog](https://modelcontextprotocol.io/specification/2025-11-25/changelog)
- 2026-07-28 **deprecates Roots, Sampling, and Logging** (SEP-2577), suggested migration: call LLM provider APIs directly; `includeContext` `thisServer`/`allServers` deprecated. — [2026-07-28 changelog](https://modelcontextprotocol.io/specification/2026-07-28/changelog)

### Inferences
- "Impressive" server features for a judge: `title` + `icons` on tools, `outputSchema` + `structuredContent` (with text fallback), sensible annotations, `resource_link` outputs, input-validation errors returned as `isError` results, URL-mode elicitation for third-party OAuth (account linking) — but avoid investing in sampling (deprecated) and treat tasks as experimental/changing.

### Gaps
- Exact annotation field definitions (`readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint`, `title`) were not re-fetched from the 2025-11-25 schema page in this session; these names are from the ToolAnnotations schema since 2025-03-26 — verify at https://modelcontextprotocol.io/specification/2025-11-25/schema#toolannotations.
- Sampling page with tools (`sampling/createMessage` `tools`, `toolChoice`, client capability `sampling.tools`) not fetched in detail.

## MCP Apps extension (UI resources, ui://, text/html;profile=mcp-app, host support, status)

### Takeaway
MCP Apps (SEP-1865, extension ID `io.modelcontextprotocol/ui`) is stable as of spec 2026-01-26 and was the first official MCP extension; it's supported by Claude (web/desktop/mobile), ChatGPT, VS Code, Goose, and several dev tools. Servers declare `ui://` resources with MIME `text/html;profile=mcp-app` and link tools via `_meta.ui.resourceUri`, always with a text fallback.

### Cited Findings
- Stable spec version 2026-01-26 (`specification/2026-01-26/apps.mdx`), draft in progress; npm `@modelcontextprotocol/ext-apps` with `/react`, `/app-bridge`, `/server` subpaths; install guidance uses `@modelcontextprotocol/server@^2.0.0`/`client@^2.0.0`, Node 20+; wire protocol unchanged between 1.x and 2.x. — [ext-apps repo](https://github.com/modelcontextprotocol/ext-apps)
- Repo lists supported clients: ChatGPT, Claude, VS Code, Goose, Postman, MCPJam, mcp-use Inspector, Alpic Playground ("host support varies"). — [ext-apps repo](https://github.com/modelcontextprotocol/ext-apps)
- Extension ID `io.modelcontextprotocol/ui`; hosts advertise under `capabilities.extensions` with required `mimeTypes`. Servers SHOULD check client capability before registering UI tools, SHOULD provide text-only fallback, and tools MUST return meaningful `content` even with UI. — [MCP Apps spec 2026-01-26](https://raw.githubusercontent.com/modelcontextprotocol/ext-apps/main/specification/2026-01-26/apps.mdx)
- UI resource URI MUST use `ui://`; `mimeType` MUST be `text/html;profile=mcp-app`; content MUST be valid HTML5 via `text` or base64 `blob`. `_meta.ui.csp` {`connectDomains`, `resourceDomains`, `frameDomains`, `baseUriDomains`} (omitted = no external origins; hosts MUST apply restrictive default incl. `default-src 'none'`); `_meta.ui.permissions` (camera, microphone, geolocation, clipboardWrite); `_meta.ui.domain` (host-specific); `_meta.ui.prefersBorder`. — same
- Tools link via `_meta.ui.resourceUri`; `_meta.ui.visibility` defaults `["model","app"]` (app-only tools hidden from model); flat `_meta["ui/resourceUri"]` is deprecated. Hosts fetch via `resources/read`; servers MAY omit UI resources from `resources/list`. — same
- Host↔view: JSON-RPC over `postMessage`; `ui/initialize` → `ui/notifications/initialized`; host sends `ui/notifications/tool-input` (+ optional `tool-input-partial`), `tool-result`, `tool-cancelled`, `host-context-changed`, `ui/resource-teardown`; view may call `tools/call`, `resources/read`, `ui/open-link`, `ui/message`, `ui/request-display-mode`, `ui/update-model-context`, `ui/notifications/size-changed`. Web hosts use a sandbox proxy on a different origin. — same
- Claude launched interactive MCP Apps on Jan 26, 2026 (Slack, Asana, Figma, Amplitude, Box, Canva, Clay, Hex, Monday.com), on web, desktop, mobile across Free/Pro/Max/Team/Enterprise, and in Cowork. — [Claude blog: interactive tools in Claude](https://claude.com/resources/articles/interactive-tools-in-claude)
- Per Alpic: Claude, VS Code Insiders, and Goose shipped Jan 26, 2026; ChatGPT followed that week (without tool calling from UI, `useFiles`, `useCheckout` at the time); Claude requires domain signing (subdomain hash tied to server URL); VS Code lacked fullscreen/PiP display modes. — [Alpic blog (secondary, dated Jan 29 2026)](https://alpic.ai/blog/mcp-apps-goes-official-claude-chatgpt-support)
- The 2026-07-28 release frames MCP Apps (and Tasks) as official extensions under the new `extensions` capability field. — [2026-07-28 RC post](https://blog.modelcontextprotocol.io/posts/2026-07-28-release-candidate/); [2026-07-28 changelog](https://modelcontextprotocol.io/specification/2026-07-28/changelog)

### Inferences
- An MCP App (e.g., an inline card/dashboard rendered in Claude/ChatGPT) is likely the single most visually "impressive" addition for a judge; keep strict CSP declarations and a text fallback so it degrades in non-UI clients (Inspector CLI, Claude Code).
- Alpic's ChatGPT gap list is ~9 months old; current ChatGPT parity is unverified.

### Gaps
- OpenAI help center (developer mode article) returned 403; ChatGPT's current MCP Apps feature parity and plan availability not verified from primary source. Search snippets indicated developer mode is beta for paid workspaces (Business/Enterprise/Edu on web). — [OpenAI help (snippet only)](https://help.openai.com/en/articles/12584461-developer-mode-and-full-mcp-connectors-in-chatgpt)
- Format of Claude's `_meta.ui.domain` requirement not fetched.

## Official TypeScript SDK version; Inspector / conformance tools

### Takeaway
The TS SDK is now split into 2.x packages (`@modelcontextprotocol/server`, `client`, `core`, `server-legacy`, plus `node`/`express`/`hono`/`fastify` adapters), latest 2.3.1 (Oct 5, 2026); the 1.x line (`@modelcontextprotocol/sdk`, latest 1.32.1) is still maintained. Validate with `npx @modelcontextprotocol/conformance server --url …` and `npx @modelcontextprotocol/inspector` (web/CLI/TUI).

### Cited Findings
- Latest releases: 2.3.1 (05 Oct) and 1.32.1 (05 Oct); 2.3.0 / 1.32.0 (02 Oct). 2.x packages: `@modelcontextprotocol/server`, `client`, `core`, `server-legacy`, `codemod`; adapters `node` (2.1.1), `express`/`hono` (2.0.2), `fastify` (2.0.1). 1.x package is `@modelcontextprotocol/sdk`. 2.3.0 notes mention serving `tasks/get`/`tasks/cancel` on a 2026-07-28 connection. — [typescript-sdk releases](https://github.com/modelcontextprotocol/typescript-sdk/releases)
- Tier 1 SDKs (TypeScript, Python, Go, C#) "speak 2026-07-28" as of the release day; Rust in beta. — [MCP blog 2026-07-28](https://blog.modelcontextprotocol.io/posts/2026-07-28/)
- Conformance framework: `npx @modelcontextprotocol/conformance server --url http://localhost:3000/mcp` (all active scenarios), `--scenario server-initialize`, `list --server`, `--requirements 2026-07-28`; scenarios include `server-initialize`, `tools-list`, `tools-call-*`, `resources-*`, `prompts-*`, plus wire-schema checks; results in `results/server-<scenario>-<timestamp>/checks.json`; GitHub Action at `v0.1.11`; `tier-check` scores against 2025-11-25 and 2026-07-28 (SEP-1730). — [conformance repo](https://github.com/modelcontextprotocol/conformance)
- Inspector: `npx @modelcontextprotocol/inspector` (web UI), `--cli` (scriptable, JSON output, exit codes for CI smoke tests), `--tui`; experimental `mcpdo` CLI; `main` = v2 on npm `latest`; stores OAuth tokens in OS keychain; has a guide for reviewing MCP Apps. — [inspector repo](https://github.com/modelcontextprotocol/inspector)

### Inferences
- Pin `@modelcontextprotocol/server@^2.3` (or `@modelcontextprotocol/sdk@^1.32` if on 1.x) and run conformance in CI against both `--requirements 2025-11-25` and `2026-07-28`; include the passing `checks.json` in the submission as evidence.

### Gaps
- Exact SDK release in which 2025-11-25 support landed was not found (older release pages not paged through).
- Inspector's explicit support for streamable HTTP/OAuth debugging and tasks/URL elicitation was not stated on the README page fetched.

## Real MCP web clients a judge could use

### Takeaway
Judges can connect a public HTTPS MCP URL via MCP Inspector (local web UI), Claude.ai custom connectors (all plans; Free limited to one), ChatGPT developer mode (beta, paid workspaces), VS Code, Goose, Postman, MCPJam, mcp-use Inspector, Alpic Playground.

### Cited Findings
- MCP Apps-capable hosts listed: ChatGPT, Claude, VS Code, Goose, Postman, MCPJam, mcp-use Inspector, Alpic Playground. — [ext-apps repo](https://github.com/modelcontextprotocol/ext-apps)
- Claude remote connectors are reached from Anthropic's cloud (even from Desktop), so servers must be publicly reachable (Anthropic publishes IP ranges for allowlisting); added via Customize → Connectors; custom connectors available on all plans, Free limited to one. — [third-party guide (calmara.app)](https://calmara.app/blog/how-to-install-mcp-server-claude-desktop) (secondary; verify at [claude.com/docs/connectors](https://claude.com/docs/connectors))
- ChatGPT developer mode / full MCP connectors: beta, Business and Enterprise/Edu on web per search snippet; Apps SDK in preview and built on MCP. — [OpenAI help (snippet)](https://help.openai.com/en/articles/12584461-developer-mode-and-full-mcp-connectors-in-chatgpt); [Build with the Apps SDK](https://help-lb.openai.com/en/articles/12515353-build-with-the-apps-sdk)
- MCP Inspector web UI via `npx @modelcontextprotocol/inspector`. — [inspector repo](https://github.com/modelcontextprotocol/inspector)

### Inferences
- Safest judge path: (1) Inspector against the public URL; (2) Claude.ai custom connector (free tier works, one connector); (3) ChatGPT developer mode only if the judge has a paid workspace. Ensure the server is internet-reachable over HTTPS with valid TLS and that Origin validation allows those clients' origins (or absent Origin).

### Gaps
- Primary Anthropic and OpenAI docs on connector plan limits and supported protocol versions could not be retrieved (OpenAI 403; Anthropic docs not fetched); details above rely partly on secondary sources and search snippets.
