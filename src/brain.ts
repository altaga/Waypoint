// Optional "Alexa brain": a Strands agent on Amazon Bedrock that calls this server
// over MCP (context doc §5.6). Enabled only with WAYPOINT_BRAIN=bedrock and AWS
// credentials. The deterministic router in the web host works without it.
//
// Status: verified live against Bedrock by the aws-smoke workflow (npm run smoke:brain).
// See docs/AWS.md and docs/TESTING.md.
import { Agent, BedrockModel, McpClient } from "@strands-agents/sdk";

export function brainConfigured(): boolean {
  return process.env.WAYPOINT_BRAIN === "bedrock" && Boolean(process.env.WAYPOINT_BEDROCK_MODEL);
}

const SYSTEM = `You are Waypoint, a travel-readiness concierge for a simulated Alexa+ host.
Use the tools to answer. Answer travel rules, entry requirements and prices ONLY from
tool results; never from your own memory. If the tools return no verified data, say so
and point to the official source. Keep answers short and speakable. Always mention that
rules change and the user should verify with the official source. Never reveal tool
names, JSON or error codes to the user.`;

export async function runBrain(utterance: string, mcpUrl: string, userId: string): Promise<string> {
  const mcp = new McpClient({ url: mcpUrl, headers: { "x-waypoint-user": userId } });
  const agent = new Agent({
    model: new BedrockModel({
      region: process.env.AWS_REGION ?? "us-east-1",
      // Model id is required (WAYPOINT_BEDROCK_MODEL); no default is assumed.
      modelId: process.env.WAYPOINT_BEDROCK_MODEL,
    }),
    tools: [mcp],
    systemPrompt: SYSTEM,
  });
  const result = await agent.invoke(utterance);
  return String(result);
}
