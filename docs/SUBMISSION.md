# Submission checklist

Checked against the official Rules, FAQ, Dates tab and Overview on 2026-10-11.

## Key dates

| Milestone | Official time | UTC+7 |
|---|---|---|
| Submission period | 31 Aug 2026 10:15 PT – **23 Oct 2026 12:00 PT** | closes **Sat 24 Oct 02:00** |
| Judging (Rules) | 9 Nov 12:00 PT – 20 Nov 12:00 PT | |
| Judging (Dates tab) | starts 26 Oct 12:00 PT | the pages disagree; plan for the earlier date |
| Winners | about 3 Dec 2026 12:00 PT | |

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
| Public with an open-source licence visible in the About section, **or** private shared with the reviewers | **Owner action** | MIT `LICENSE` is at the root. Make the repo public, or add the reviewers near submission time (invites expire after 7 days) |
| Clear setup and run instructions | Done | README |

## Submission form

| Item | Status | Owner |
|---|---|---|
| Text description of features | To write | Owner (can be drafted from README) |
| Repo URL | Ready | |
| Video under 3 minutes, **YouTube or Vimeo**, public, English, showing the project working, no third-party trademarks or copyrighted music | **To record** | Owner, using `docs/DEMO_SCRIPT.md` |
| Product feedback for every tool, API or SDK: what for, what worked, what needs work, onboarding, would you build again | Drafted | `docs/FEEDBACK.md` (Bedrock section pending a live run) |
| Primary track: Alexa+ | To select | Owner |
| Mini challenges: AWS Builder, Open Source | To select | Owner |
| AWS Builder: which AWS services and how, in the feedback answer | Drafted | `docs/FEEDBACK.md`, `docs/AWS.md` |
| Open Source: contribution URL, repo URL, GitHub username, description | **Blocked** until the public repo exists | `docs/OPEN_SOURCE.md` |
| Optional friction log (up to 10% bonus) | Drafted | `docs/FRICTION_LOG.md` |
| Optional feature requests (description, why it matters, priority) | Not started | |
| English for all materials | Done for docs | |

## Prizes (for reference, not confirmed)

From an aggregator (tierones.io) on 2026-10-17. The official rules page could not be read by the tools, so check the amounts and the AWS credit figures on the rules page before submitting. The $15,000 Alexa+ credit figure was not found in any source.

- Alexa+: 1st $25,000 + $15,000 AWS credits; 2nd $15,000 + $5,000; 3rd $4,000 + $1,000.
- AWS Builder and Open Source: $5,000 + $5,000 AWS credits each.
- One project can win at most one track prize and one mini-challenge prize.

## Judging

- Stage one: pass/fail on fitting the theme and applying the required APIs/SDKs.
- Stage two: four equally weighted criteria: Tech Implementation, Design, Potential Impact, Quality of the Idea.
- For Alexa+, the rules call "single-turn Q&A bot" and "basic MCP wrapper around an existing API" obvious; they call out as creative: agentic workflows across services, state across sessions, purchasing, media support (cards, carousels), MCP Apps, Agent Skills. Waypoint covers state across sessions, cards and carousels, an MCP App and an Agent Skill.
- For AWS Builder, "single Bedrock call" is called obvious; "multi-service pipeline (Bedrock + AgentCore + Strands)" is called creative. Today Waypoint has Strands + Bedrock wired but not run, so this mini challenge is the weakest part of the entry.

## Eligibility

Excluded: residents of Brazil, Quebec, Russia, Crimea, Cuba, Iran, North Korea and OFAC-sanctioned countries; sponsor and administrator staff and families; judges. Mexico is eligible. The owner must confirm they are not an Amazon or Devpost employee or family member.
