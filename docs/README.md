# Docs — what each file is for

Start here if you are a **judge**, a **Devpost reviewer**, or an **agent**. Product story: [../README.md](../README.md). Machine brief: [../llms.txt](../llms.txt) · [../AGENTS.md](../AGENTS.md).

## Fast links

| Need | Open |
|------|------|
| Phone demo (no install) | [../README.md#for-judges--open-it-on-your-phone](../README.md#for-judges--open-it-on-your-phone) |
| **Knowledge scale + all 26 tools** | [../README.md#knowledge-scale--what-we-actually-built](../README.md#knowledge-scale--what-we-actually-built) · [full tool catalog](../README.md#mcp-tools-26--full-catalog) |
| Agent / LLM brief (also at `/llms.txt` when the server runs) | [../llms.txt](../llms.txt) · [../llm.txt](../llm.txt) |
| Full agent playbook | [../AGENTS.md](../AGENTS.md) |
| Record the ≤3 min video | [DEMO_SCRIPT.md](DEMO_SCRIPT.md) · [DEMO_NARRATION.md](DEMO_NARRATION.md) |
| Paste into Devpost “product feedback” | [FEEDBACK.md](FEEDBACK.md) |
| Paste friction log (bonus) | [FRICTION_LOG.md](FRICTION_LOG.md) |
| Official submission checklist | [SUBMISSION.md](SUBMISSION.md) |
| AWS Builder evidence | [AWS.md](AWS.md) |
| Open Source mini-challenge | [OPEN_SOURCE.md](OPEN_SOURCE.md) |
| How tests prove the claims | [TESTING.md](TESTING.md) |
| Screenshots | [screens/](screens/) |

## For judges — phone first

1. Open **[the live demo](https://hwbs7pqoqtsbcgb72stpikb5gy0scxmv.lambda-url.us-east-1.on.aws/)** on your phone
2. Switch to **EN**, then tap **Example group** (☰ if the controls are collapsed)
3. Ask *"Can I bring vapes to Singapore?"* then *"Going to Japan 3–10 December"*
4. Optional: *"Get me ready for the trip"*

No clone. The page only calls same-origin `/mcp` and `/api/*` — no secrets in the browser.
All judge-facing docs in this folder are written in English.

Local fallback: `npm install && npm start` → http://127.0.0.1:3000

## Maintainer / honesty (optional)

| File | Role |
|------|------|
| [STATUS.md](STATUS.md) | Done / not-done snapshot (may lag `main`) |
| [DATA_REVIEW.md](DATA_REVIEW.md) | Human review checklist for packs (still tier B) |

## Screenshots in this folder

Captured from the live public deployment (English UI, Example group loaded).

| File | Shows |
|------|--------|
| `screens/01-home-desktop.png` | Home screen, MCP connected, suggestion chips |
| `screens/02-rules-singapore.png` | "Can I bring vapes to Singapore?" — rule card with source and date |
| `screens/03-trip-japan.png` | Japan trip: entry per passport, readiness ring, globe |
| `screens/04-autopilot.png` | Autopilot graph of live `tools/call`s (desktop) |
| `screens/05-protocol-log.png` | MCP protocol log (JSON-RPC proof) |
| `screens/06-phone-trip.png` | Phone layout of the Japan trip |
| `screens/07-phone-autopilot.png` | Autopilot on a phone |
| `screens/08-dashboard.png` | `plan_trip` MCP App dashboard |
