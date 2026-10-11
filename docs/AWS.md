# AWS Builder notes

## What uses AWS

| Piece | Service | Status |
|---|---|---|
| Agent brain at runtime | Amazon Bedrock via Strands Agents TypeScript (`src/brain.ts`) | Written and type-checked. **Not run against Bedrock.** Enable with `WAYPOINT_BRAIN=bedrock` and `WAYPOINT_BEDROCK_MODEL=<model id>`. |
| Country-pack extraction | Bedrock `Converse` with tool use (design in the context doc §4.7) | **Not built.** The current build uses a deterministic extractor. Tier B packs say so. |
| Hosting | Lambda with Function URL, DynamoDB for `StateStore` | **Not deployed.** Needs the team's approval and a budget alert first. |

## Why nothing has been deployed

The hackathon's AWS credits ran out on 7 October. Any deploy spends the team's money, so the plan requires explicit approval and a budget alert before deploying. Nothing has been created in AWS.

## Model access

The build environment has AWS credentials, but no Bedrock call has been made. Before any run, confirm model access and region. The model id is not hard-coded: `WAYPOINT_BEDROCK_MODEL` must be set.

## How the brain is wired

- Strands `Agent` with `BedrockModel` and an `McpClient` pointed at the server's `/mcp` endpoint.
- The user id travels as the `x-waypoint-user` header, so the agent sees the same memory as the simulator.
- The system prompt forbids tool names and JSON in replies, and requires the disclaimer.

## Costs to watch (once approved)

- Bedrock: per token. Keep the brain on for demo calls only.
- Lambda and DynamoDB: on-demand pricing; small at demo volume.
- Set an AWS Budgets alert before the first deploy.
