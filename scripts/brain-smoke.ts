// Live smoke test of the Bedrock concierge brain, through the same in-memory MCP path that
// Lambda uses. Two turns for a fresh user:
//   1. a grounded rules question (must cite the Singapore rule, not general knowledge);
//   2. a full trip request (must save the passport and chain several tools in one turn).
// Needs AWS credentials, WAYPOINT_BRAIN=bedrock and WAYPOINT_BEDROCK_MODEL.
// Run: npm run smoke:brain
import { createContext } from "../src/context.ts";
import { createMemoryStore } from "../src/state.ts";
import { brainConfigured, runBrain, type BrainTurn } from "../src/brain.ts";

async function main() {
  if (!brainConfigured()) {
    console.error("Set WAYPOINT_BRAIN=bedrock and WAYPOINT_BEDROCK_MODEL first.");
    process.exit(2);
  }
  const ctx = createContext({ offline: true, store: createMemoryStore() });
  const userId = `brain-smoke-${Date.now()}`;

  const q1 = process.env.BRAIN_QUESTION ?? "Can I bring vapes to Singapore?";
  const r1 = await runBrain({ ctx, userId, utterance: q1, locale: "en-US" });
  console.log(`Q1: ${q1}\nA1 (${r1.ms} ms, tools: ${r1.calls.map((c) => c.tool).join(", ")}):\n${r1.text}\n`);
  const usesRule = /confiscat|fined|vaporiser|vape/i.test(r1.text) && r1.calls.some((c) => c.tool === "get_local_rules");
  const fellBack = /general knowledge|didn.t return|did not return|as far as i know/i.test(r1.text);
  if (!usesRule || fellBack) throw new Error("answer 1 is not grounded in the cited rule");

  const history: BrainTurn[] = [
    { role: "user", text: q1 },
    { role: "assistant", text: r1.text },
  ];
  const q2 = "Tengo pasaporte mexicano. Quiero ir a Japón del 3 al 10 de diciembre.";
  const r2 = await runBrain({ ctx, userId, utterance: q2, history, locale: "es-MX" });
  const tools = r2.calls.map((c) => c.tool);
  console.log(`Q2: ${q2}\nA2 (${r2.ms} ms, tools: ${tools.join(", ")}):\n${r2.text}\n`);
  for (const needed of ["update_traveler_profile", "plan_trip", "check_entry_requirements"]) {
    if (!tools.includes(needed)) throw new Error(`turn 2 did not call ${needed}`);
  }
  if (!/[áéíóúñ¿]|\b(tu|tus|viaje|visa)\b/i.test(r2.text)) throw new Error("turn 2 did not answer in Spanish");
  if (r2.calls.some((c) => c.isError && c.tool === "plan_trip")) throw new Error("plan_trip failed");
  console.log("BRAIN SMOKE PASSED");
}

main().catch((e) => {
  console.error(`brain smoke failed: ${(e as Error).name}: ${(e as Error).message}`);
  process.exit(1);
});
