// Live smoke test of the Bedrock brain: starts the Waypoint MCP server in-process,
// then asks the Strands agent (Bedrock model) one question that needs a tool call.
// Needs AWS credentials, WAYPOINT_BRAIN=bedrock and WAYPOINT_BEDROCK_MODEL.
// Run: npm run smoke:brain
import type { AddressInfo } from "node:net";
import { createApp } from "../src/server.ts";
import { createContext } from "../src/context.ts";
import { createMemoryStore } from "../src/state.ts";
import { brainConfigured, runBrain } from "../src/brain.ts";

async function main() {
  if (!brainConfigured()) {
    console.error("Set WAYPOINT_BRAIN=bedrock and WAYPOINT_BEDROCK_MODEL first.");
    process.exit(2);
  }
  const ctx = createContext({ offline: true, store: createMemoryStore() });
  const server = createApp(ctx).listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/mcp`;

  const question = process.env.BRAIN_QUESTION ?? "Can I bring vapes to Singapore?";
  const started = Date.now();
  try {
    const answer = await runBrain(question, url, "brain-smoke");
    const ms = Date.now() - started;
    console.log(`QUESTION: ${question}`);
    console.log(`ANSWER (${ms} ms):\n${answer}`);
    if (!answer.trim()) throw new Error("empty answer");
    // Grounded = the answer uses the cited rule and does not fall back to the model's memory.
    const usesRule = /confiscat|fined|vaporiser/i.test(answer);
    const fellBack = /general knowledge|didn.t return|did not return|as far as i know/i.test(answer);
    const grounded = usesRule && !fellBack;
    console.log(`GROUNDED IN THE CITED SINGAPORE RULE: ${grounded ? "yes" : "no"}`);
    if (!grounded) throw new Error("answer is not grounded in the cited rule");
  } finally {
    server.closeAllConnections();
    server.close();
  }
}

main().catch((e) => {
  console.error(`brain smoke failed: ${(e as Error).name}: ${(e as Error).message}`);
  process.exit(1);
});
