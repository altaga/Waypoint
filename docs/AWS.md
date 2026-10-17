# AWS Builder notes

## What uses AWS

| Piece | Service | Status |
|---|---|---|
| Agent brain at runtime | Amazon Bedrock via Strands Agents TypeScript (`src/brain.ts`) | **Verified live on 2026-10-11** by the `aws-smoke` workflow: GitHub OIDC role → Bedrock → Strands agent calling the Waypoint MCP server. Enable with `WAYPOINT_BRAIN=bedrock` and `WAYPOINT_BEDROCK_MODEL`. |
| Country-pack extraction | Bedrock `Converse` with tool use (design in the context doc §4.7) | **Not built.** The current build uses a deterministic extractor. Tier B packs say so. |
| Hosting | Lambda with Function URL, DynamoDB for `StateStore` | **Deployed** by the `deploy-aws` workflow (manual trigger). Each run completes the CDK deploy and then the live concierge and tools checks. Runs of 2026-10-17 succeeded. |

## Deploying and keeping it up

Every deploy is started by hand from the `deploy-aws` workflow on the working branch, so a push alone deploys nothing. Each deploy spends AWS money. The hackathon rules require the project to stay accessible to judges until the judging period ends on 20 November 2026, so keep the Function URL running until then.

## Model access

Bedrock is called on every deploy by the live concierge check, and the `aws-smoke` workflow verified the path on 2026-10-11. The model id is not hard-coded: `WAYPOINT_BEDROCK_MODEL` must be set.

## How the brain is wired

- Strands `Agent` with `BedrockModel` and an `McpClient` pointed at the server's `/mcp` endpoint.
- The user id travels as the `x-waypoint-user` header, so the agent sees the same memory as the simulator.
- The system prompt forbids tool names and JSON in replies, and requires the disclaimer.

## Costs to watch

- Bedrock: per token. Keep the brain on for demo calls only.
- Lambda and DynamoDB: on-demand pricing; small at demo volume.
- Keep an AWS Budgets alert on for the account. Check it after each deploy during the judging period.
