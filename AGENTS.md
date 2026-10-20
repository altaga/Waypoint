# AGENTS.md — Waypoint playbook for judges & coding agents

> **Audience:** contest judges, Devpost reviewers, and coding agents (Cursor, Claude Code, etc.) reviewing or extending this repo.  
> **Product:** travel-readiness MCP concierge + simulated Alexa+ host for the [Amazon Developer Hackathon 2026](https://amazonappdev2026.devpost.com/) (Alexa+ track).  
> **Not legal advice.** Rules and entry facts are cited leads — travelers must verify with official sources.

**Judges (phone, no install):** https://hwbs7pqoqtsbcgb72stpikb5gy0scxmv.lambda-url.us-east-1.on.aws/  
**Read first (short):** [`llms.txt`](llms.txt) / [`llm.txt`](llm.txt) — live `/llms.txt` after deploy.  
**Humans:** [`README.md`](README.md) § *For judges — open it on your phone* · [`docs/README.md`](docs/README.md).  
**Devpost checklist:** [`docs/SUBMISSION.md`](docs/SUBMISSION.md).

### Public client — never leak private services

The web UI uses **relative same-origin** URLs only (`/mcp`, `/api/brain`, `/api/speech`).  
**Forbidden:** `NEXT_PUBLIC_*`, `EXPO_PUBLIC_*`, `VITE_*`, or any client-bundled secret / private backend URL.  
Bedrock / Polly / DynamoDB / Alexa tokens = **server or GitHub Actions only**.

---

## 1. Repository map

| Path | Role |
|------|------|
| [`src/server.ts`](src/server.ts) | Express host: `/mcp`, `/`, static `web/`, `/alexa`, health |
| [`src/mcp-server.ts`](src/mcp-server.ts) | MCP server wiring (SDK 2025-11-25 Streamable HTTP) |
| [`src/tools.ts`](src/tools.ts) | **26 tools** — authoritative names and schemas |
| [`src/brain.ts`](src/brain.ts) | Optional Bedrock + Strands agent (calls tools in-process) |
| [`src/itinerary.ts`](src/itinerary.ts) | Pure plan verifier (country, pace, repeats, avoided interests) |
| [`src/envelope.ts`](src/envelope.ts) | Shared tool response envelope |
| [`src/state.ts`](src/state.ts) / [`src/state-dynamo.ts`](src/state-dynamo.ts) | File store (local) · DynamoDB (Lambda) |
| [`src/alexa/`](src/alexa/) | Custom skill handlers → MCP; signature-verified `/alexa` |
| [`web/`](web/) | Simulated Alexa+ host (plain ES modules, **no bundler**) |
| [`web/mcp-client.js`](web/mcp-client.js) | Real MCP client (initialize / tools/list / tools/call) |
| [`web/mission.js`](web/mission.js) | Autopilot multi-tool graph |
| [`packs/`](packs/) | Built country packs (quote must appear in sources-text) |
| [`data/`](data/) | Catalogs — see [`data/README.md`](data/README.md) |
| [`data/highlights/`](data/highlights/) | Curated places (preferred over ranked world lists) |
| [`data/world/`](data/world/) | Payments, transit, apps, cities, ranked highlights, … |
| [`data/sources-text/`](data/sources-text/) | Cached official text for pack validation |
| [`data/vendor/`](data/vendor/) | Vendored snapshots (passport index, PPP, FX fallback, …) |
| [`oss/travel-entry-packs/`](oss/travel-entry-packs/) | Open-source schema + validator + samples (MIT) |
| [`skill/`](skill/) | Alexa custom skill (manifest + `en-US` / `es-MX`) |
| [`agent-skills/`](agent-skills/) | Claude/operator skill — **not** an Alexa Agent Skill |
| [`ops/`](ops/) | Owner-only: Alexa credentials helper, secret-box, demo recorder |
| [`scripts/`](scripts/) | Fetch/build/validate packs, world data, live smoke |
| [`test/`](test/) | Offline unit + Streamable HTTP e2e + eval |
| [`docs/`](docs/) | Submission, feedback, friction, demo, AWS — [`docs/README.md`](docs/README.md) |
| [`.env.example`](.env.example) | Env **names only** — never values |
| [`llms.txt`](llms.txt) / [`llm.txt`](llm.txt) | Short machine-readable brief; mirrored under `web/` → `/llms.txt` |

**Do not revive:** `research_notes/`, `reports/` (removed from the delivery tree; internal scratch).

---

## 2. Hackathon framing (do not mis-claim)

| Claim | Truth |
|-------|--------|
| Alexa+ track | Self-hosted MCP **2025-11-25** + Streamable HTTP + simulated host that is a **real MCP client** |
| Affiliated with Amazon / real Alexa+ | **No.** Simulation path allowed by FAQ |
| `agent-skills/waypoint/SKILL.md` | Operator/Claude skill — **not** an Alexa Agent Skill |
| AWS Builder | Bedrock + Strands brain; Lambda + DynamoDB; Polly in simulator |
| Open Source mini | `oss/travel-entry-packs/` (publish URL still owner action — see `docs/OPEN_SOURCE.md`) |
| Tool count in old screenshots | May say 12 — **code has 26**; trust `src/tools.ts` |

Judging criteria to map evidence against: Tech Implementation · Design · Potential Impact · Quality of the Idea. Friction log bonus: [`docs/FRICTION_LOG.md`](docs/FRICTION_LOG.md).

---

## 3. Runtime architecture

```
Browser (web/) ──Streamable HTTP──► Express /mcp ──► McpServer + 26 tools
     │                                  │
     ├── protocol log (proof)           ├── StateStore (file | DynamoDB)
     ├── Autopilot mission.js           ├── packs / world / highlights
     └── brain: local router            └── optional src/brain.ts (Bedrock)
              or Bedrock via server
```

| Layer | Owns | Never does |
|-------|------|------------|
| `web/` | UX, MCP client, Autopilot orchestration UI | Invent visa/rules facts |
| `src/tools.ts` | Facts via services + packs; envelopes | Trust raw LLM prose as law |
| `src/itinerary.ts` | Accept/reject day plans by rules | Soften limits because the model asked |
| `src/brain.ts` | Multi-tool turns when enabled | Bypass tools for entry/rules |

**Invariant:** cited travel facts come from tools + committed data. The LLM (when on) **calls tools**.

---

## 4. MCP contract (agents must respect)

- Protocol: **2025-11-25**, Streamable HTTP at `/mcp` (`POST` / `GET` / `DELETE`).
- Sessions: `Mcp-Session-Id`; send `MCP-Protocol-Version`.
- Identity (demo): header `x-waypoint-user` (browser visitor id or hashed Alexa user).
- Origin guard: unknown browser origins → **403**.
- Envelope shape (every successful tool):  
  `{ voice, card, data, sources[], lastVerified, confidence, disclaimer, followUps[], missingFields? }`
- Friendly errors: no stacks, raw URLs, HTTP codes, or tool names in traveler-facing `voice`.
- Elicitation: missing passport country; confirm `forget_me`. If unsupported → `missingFields`.
- MCP App: `plan_trip` may set `_meta.ui.resourceUri` → `ui://waypoint/plan-dashboard-*.html` (sandboxed iframe).

Authoritative tool list: search `server.registerTool(` in [`src/tools.ts`](src/tools.ts).

---

## 5. Safety & privacy invariants (never weaken)

1. **No passport numbers** — country (+ optional expiry) only.  
2. **Medications** — require explicit consent; never forwarded to third-party APIs.  
3. **`forget_me`** — elicit confirmation, then wipe profile / trips / expenses for that user id.  
4. **Pack quotes** — a rule ships only if its quote appears verbatim in `data/sources-text/`; `validate-packs` enforces this.  
5. **Itinerary verifier** — `build_itinerary` must not save a plan that fails verification.  
6. **Alexa `/alexa`** — reject unsigned requests (Amazon signature verification).  
7. **Demo auth is weak by design** — `x-waypoint-user` is not OAuth. Do not “fix” by removing the origin guard or logging secrets.

---

## 6. Secrets & push policy

**Never commit:**

- `.env`, AWS access keys, session tokens  
- `ASK_REFRESH_TOKEN`, Alexa LWA tokens, vendor secrets  
- Private keys (`*.pem` except the intentional **public** `ops/secret-box/recipient-public.pem`)  
- Real traveler PII beyond synthetic demo profiles  
- Client env patterns that embed secrets (`NEXT_PUBLIC_*`, `EXPO_PUBLIC_*`, `VITE_*` with keys or private hosts)

**OK to commit:** `.env.example` (names only), public recipient PEM, skill interaction models, vendored public datasets with licences, the **public** demo Function URL (it is intentionally open for judges).

**CI secrets (GitHub):** `ASK_REFRESH_TOKEN`, `ASK_VENDOR_ID`, `AWS_DEPLOY_ROLE_ARN`, `WAYPOINT_BEDROCK_MODEL`, region vars — referenced as `${{ secrets.* }}` only.

Owner-local only:

- `ops/get-alexa-credentials.mjs` — browser login; writes tokens to a **local** file (gitignored), does not print them.  
- `ops/secret-box/` — encrypt payloads to the owner’s public key.

Pre-push scan (agent): `AKIA…`, `BEGIN PRIVATE KEY`, `ghp_`, `sk-`, long JWTs, `Atza|` Alexa tokens.

---

## 7. How to verify quickly

```bash
npm install          # required once (Node ≥22); without it, tests fail with ERR_MODULE_NOT_FOUND for tsx
npm run ci           # typecheck + test + validate-packs + eval
npm start            # http://127.0.0.1:3000
# Offline:
WAYPOINT_OFFLINE=1 npm start
```

In the UI: switch to **EN** → **Example group** → ask *"Can I bring vapes to Singapore?"* → confirm protocol log shows `tools/call`.  
Health: `GET /healthz` should report protocol `2025-11-25`.

Bedrock path (needs AWS creds + model id): `WAYPOINT_BRAIN=bedrock` + `WAYPOINT_BEDROCK_MODEL` — see [`docs/AWS.md`](docs/AWS.md).

---

## 8. Common agent mistakes (avoid)

1. Claiming integration with production Alexa+ or Amazon affiliation.  
2. Presenting `agent-skills/waypoint/SKILL.md` as an Alexa Agent Skill.  
3. Inventing entry/rules facts in the brain prompt instead of calling tools.  
4. Saving itineraries that skip `verifyPlan` / `build_itinerary` checks.  
5. Committing `.env` or rotating secrets into the tree “for the demo”.  
6. Deleting `data/sources-text/` or weakening pack quote checks.  
7. Trusting screenshot tool counts over `src/tools.ts`.  
8. Treating ranked `data/world/highlights/` as higher priority than curated `data/highlights/`.  
9. Adding crypto “accepted here” claims (product rule: never).  
10. Re-adding `research_notes/` / scrap reports to the judge-facing tree.

---

## 9. Docs for Devpost paste

| Doc | Use |
|-----|-----|
| [`docs/SUBMISSION.md`](docs/SUBMISSION.md) | Official checklist + dates |
| [`docs/FEEDBACK.md`](docs/FEEDBACK.md) | Product feedback per SDK/API |
| [`docs/FRICTION_LOG.md`](docs/FRICTION_LOG.md) | Optional 10% bonus friction log |
| [`docs/DEMO_SCRIPT.md`](docs/DEMO_SCRIPT.md) / [`docs/DEMO_NARRATION.md`](docs/DEMO_NARRATION.md) | ≤3 min video script |
| [`docs/AWS.md`](docs/AWS.md) | AWS Builder evidence |
| [`docs/OPEN_SOURCE.md`](docs/OPEN_SOURCE.md) | OSS mini-challenge fields |
| [`docs/TESTING.md`](docs/TESTING.md) | How tests and smokes work |
| [`docs/STATUS.md`](docs/STATUS.md) | Honest done / not-done (may lag HEAD) |

---

## 10. Security review snapshot (delivery)

Scanned working tree + full history for private keys, `AKIA` material, and Alexa refresh token **values**. **No secret values in git** — safe to share on that axis.

| Severity | Finding | Notes |
|----------|---------|--------|
| — | No private keys / AWS secret values / Alexa token values in tracked files | Secrets are CI-only / OIDC |
| INFO | `ops/secret-box/recipient-public.pem` | Public key only; intentional |
| INFO | `ops/get-alexa-credentials.mjs` | Local helper; tokens stay on owner machine |
| INFO | `skill/skill.json` `https://REPLACE/…` | Placeholders; `deploy-skill` fills from `WAYPOINT_PUBLIC_BASE_URL` |
| **HIGH (live URL only)** | Lambda Function URL auth = none | Anyone with the URL can hit `/mcp`, `/api/brain`, `/api/speech` → cost + state abuse |
| **HIGH (live URL only)** | Spoofable `x-waypoint-user` | Impersonate a user id on a public host; missing header → shared `anonymous-demo` |
| MEDIUM | Origin check is browser-only | No `Origin` still allowed (needed for non-browser MCP clients) |

**Judge path:** local `npm start` (+ video) is enough per FAQ. If a Function URL must stay up through judging, disable brain/speech on the public URL, rate-limit, or put a shared demo token in front — do **not** store real traveler PII there.

Unimportant public ids (skill ids in manifests, catalog place ids, ISO country codes) are **not** treated as secrets.

---

*Waypoint — agent-readable specs for the Alexa+ travel concierge.*
