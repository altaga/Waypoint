// Live conversations against the deployed skill, through Amazon's Skill Simulation API: the same
// path as the console's Test tab. The text goes through Alexa's own speech understanding, reaches
// the Lambda, and comes back as Alexa's answer. This checks what offline tests cannot: which intent
// Alexa picks for a phrase and how it fills the slots.
//
// Needs the ASK CLI and ASK_REFRESH_TOKEN, ASK_VENDOR_ID, SKILL_ID in the environment.
// Run: node scripts/alexa-live.mjs [conversations.json]
// Writes a transcript to stdout and live-transcript.txt; exits 1 when an answer is not as expected.

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const SKILL_ID = process.env.SKILL_ID;
if (!SKILL_ID) throw new Error("SKILL_ID is required");
const file = process.argv[2] ?? "test/alexa-live/conversations.json";
const conversations = JSON.parse(readFileSync(file, "utf8"));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function smapi(args) {
  const out = execFileSync("ask", ["smapi", ...args, "-p", "__ENVIRONMENT_ASK_PROFILE__"], { encoding: "utf8", env: process.env, stdio: ["ignore", "pipe", "pipe"] });
  return JSON.parse(out);
}

// Alexa's own messages when a skill answer is broken, and text that must never be spoken.
const BROKEN = /problem with the requested skill's response|problema con la respuesta de la skill|MCP error|Input validation|Invalid arguments|-32\d{3}|\bundefined\b|\[object|NaN|YYYY/i;

async function simulate(text, locale, newSession) {
  // One simulation at a time per account; retry briefly if the previous one is still finishing.
  let started;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      started = smapi(["simulate-skill", "-s", SKILL_ID, "-g", "development", "--input-content", text, "--device-locale", locale, "--session-mode", newSession ? "FORCE_NEW_SESSION" : "DEFAULT"]);
      break;
    } catch (e) {
      if (attempt === 4) throw e;
      await sleep(2000);
    }
  }
  for (let i = 0; i < 40; i++) {
    const sim = smapi(["get-skill-simulation", "-s", SKILL_ID, "-g", "development", "-i", started.id]);
    if (sim.status && sim.status !== "IN_PROGRESS") return sim;
    await sleep(1000);
  }
  throw new Error(`simulation ${started.id} did not finish`);
}

function read(sim) {
  const result = sim.result ?? {};
  const caption = (result.alexaExecutionInfo?.alexaResponses ?? []).map((r) => r.content?.caption).filter(Boolean).join(" ");
  const inv = result.skillExecutionInfo?.invocations?.[0];
  const req = inv?.invocationRequest?.body?.request;
  const intent = req ? (req.type === "IntentRequest" ? req.intent?.name : req.type) : "(skill not invoked)";
  const slots = Object.values(req?.intent?.slots ?? {}).filter((s) => s.value).map((s) => `${s.name}=${s.value}`).join(", ");
  const speech = (inv?.invocationResponse?.body?.response?.outputSpeech?.ssml ?? "").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&quot;/g, '"');
  return { status: sim.status, caption: caption || speech, intent, slots, error: result.error?.message };
}

const lines = [];
const failures = [];
const log = (s) => {
  console.log(s);
  lines.push(s);
};

for (const c of conversations) {
  log(`\n=== ${c.name} [${c.locale}] ===`);
  let first = true;
  for (const t of c.turns) {
    let r;
    try {
      r = read(await simulate(t.say, c.locale, first || t.newSession));
    } catch (e) {
      r = { status: "ERROR", caption: "", intent: "", slots: "", error: String(e.message ?? e).slice(0, 200) };
    }
    first = false;
    log(`> ${t.say}\n  [${r.intent}${r.slots ? `: ${r.slots}` : ""}]\n  < ${r.caption || "(no answer)"}${r.error ? `\n  ! ${r.error}` : ""}`);
    const problems = [];
    if (r.status !== "SUCCESSFUL") problems.push(`simulation ${r.status}`);
    if (BROKEN.test(r.caption)) problems.push("broken or technical answer");
    if (t.intent && r.intent !== t.intent) problems.push(`intent ${r.intent}, expected ${t.intent}`);
    if (t.expect && !new RegExp(t.expect, "i").test(r.caption)) problems.push(`answer does not match /${t.expect}/`);
    if (t.notExpect && new RegExp(t.notExpect, "i").test(r.caption)) problems.push(`answer matches /${t.notExpect}/`);
    if (problems.length) {
      log(`  ✗ ${problems.join("; ")}`);
      failures.push(`${c.name} > "${t.say}": ${problems.join("; ")}`);
    }
    await sleep(500);
  }
}

log(`\n${failures.length ? `FAILED ${failures.length}:\n- ${failures.join("\n- ")}` : "ALL LIVE CONVERSATIONS PASSED"}`);
writeFileSync("live-transcript.txt", lines.join("\n") + "\n");
process.exit(failures.length ? 1 : 0);
