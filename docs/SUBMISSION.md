# Submission checklist

Checked against the official Rules, FAQ and Dates tab on 2026-10-18. The Rules state that they prevail over any other hackathon material.

## Key dates

| Milestone | Official time | UTC+7 |
|---|---|---|
| Submission period | 31 Aug 2026 10:15 PT – **23 Oct 2026 12:00 PT** | closes **Sat 24 Oct 02:00** |
| Judging period (Rules) | 9 Nov 2026 12:00 PT – 20 Nov 2026 12:00 PT | |
| Dates tab | shows 26 Oct 12:00 PT | the Rules prevail; judging follows the Rules |
| Winners (Rules) | on or around 3 Dec 2026 12:00 PT | |

## Alexa+ track requirements

| Requirement (official wording, shortened) | Status | Evidence |
|---|---|---|
| Self-hosted MCP server, spec 2025-11-25 or later, over Streamable HTTP | Done | `src/server.ts`, `/healthz` reports `2025-11-25` |
| Required technology imported and actually called at runtime, not just named in the README | Done | `@modelcontextprotocol/sdk` in `src/mcp-server.ts`, `src/server.ts` |
| Simulation, if used: source code in the repo, and the video must clearly show it | Done (code) | `web/` |
| Web page acting as an actual MCP client (initialize, tools/list, tools/call over Streamable HTTP) satisfies the requirement (FAQ) | Done | `web/mcp-client.js`, protocol log in the UI |
| Hosting not required: a locally runnable public repo plus the video is enough (FAQ) | Done | README quick start |

## Repository

| Requirement | Status | Evidence / action |
|---|---|---|
| GitHub (not GitLab) | Done | `altaga/Waypoint` |
| All source, assets and instructions to run | Done | `npm ci && npm test && npm start` from a clean clone |
| Public with an open-source licence visible in the About section, **or** private shared with the reviewers | Done | Public MIT repository: https://github.com/altaga/Waypoint |
| Clear setup and run instructions | Done | README |

## Submission form

| Item | Status | Owner |
|---|---|---|
| Text description of features | To write | Owner (can be drafted from README) |
| Repo URL | Ready | |
| Video under 3 minutes, **YouTube or Vimeo**, public, English, showing the project working, no third-party trademarks or copyrighted music | **To record** | Owner, using `docs/DEMO_SCRIPT.md` |
| Product feedback for every tool, API or SDK: what for, what worked, what needs work, onboarding, would you build again | Drafted | `docs/FEEDBACK.md` (Bedrock live run recorded for 2026-10-11; each successful deploy re-checks the concierge) |
| Primary track: Alexa+ | To select | Owner |
| Mini challenges: AWS Builder, Open Source | To select | Owner |
| AWS Builder: which AWS services and how, in the feedback answer | Drafted | `docs/FEEDBACK.md`, `docs/AWS.md` |
| Open Source: contribution URL, repo URL, GitHub username, description | Ready | https://github.com/altaga/travel-entry-packs — `docs/OPEN_SOURCE.md` |
| Optional friction log (up to 10% bonus) | Ready: 24 entries, 15 on Amazon products, each with evidence | `docs/FRICTION_LOG.md` |
| Optional feature requests (description, why it matters, priority) | Not started | |
| English for all materials | Done for docs | |

## Prizes (official Rules, read 2026-10-18)

- Alexa+: 1st $25,000 cash + $15,000 AWS credits + a meeting with the Amazon Developer team; 2nd $15,000 cash + $5,000 AWS credits; 3rd $4,000 cash + $1,000 AWS credits.
- AWS Builder (mini challenge): $5,000 cash + $5,000 AWS credits + a meeting. Eligible: any primary-track project that uses AWS services with documented integrations.
- Open Source (mini challenge): $5,000 cash + $5,000 AWS credits + a meeting. Eligible: a new open-source project, or a contribution (branch, fork or PR) to a public repository, made during the submission period, submitted alongside a primary-track entry. Required: contribution URL, repository URL and a description.
- One project can win at most one track prize and one mini-challenge prize.
- The AWS promotional credit requests closed on 7 October; do not plan on them.

## Judging

- Stage one: pass/fail on fitting the theme and applying the required APIs/SDKs.
- Stage two: four equally weighted criteria: Tech Implementation, Design, Potential Impact, Quality of the Idea.
- For Alexa+, the rules call "single-turn Q&A bot" and "basic MCP wrapper around an existing API" obvious; they call out as creative: agentic workflows across services, state across sessions, purchasing, media support (cards, carousels), MCP Apps, Agent Skills. Waypoint covers agentic workflows across services (the Autopilot), state across sessions, cards and carousels (`src/envelope.ts`) and an MCP App. It does not have a purchasing flow. `agent-skills/waypoint/SKILL.md` is a Claude skill file, not an Alexa Agent Skill: do not present it as one.
- For AWS Builder, "single Bedrock call" is called obvious; "multi-service pipeline (Bedrock + AgentCore + Strands)" is called creative. Waypoint runs Strands on Bedrock, on Lambda, with DynamoDB. The concierge check on each successful deploy calls Bedrock. The last green `deploy-aws` run on `main` is 2026-10-20. There is no AgentCore service in the pipeline. A dispatch on 2026-10-21 did not succeed.

## Eligibility

Excluded: residents of Brazil, Quebec, Russia, Crimea, Cuba, Iran, North Korea and OFAC-sanctioned countries; sponsor and administrator staff and families; judges. Mexico is eligible. The owner must confirm they are not an Amazon or Devpost employee or family member.
