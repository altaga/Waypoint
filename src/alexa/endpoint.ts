import type { Express } from "express";
import { ExpressAdapter } from "ask-sdk-express-adapter";
import { buildSkill } from "./skill.ts";

// Mounts the skill at /alexa. The adapter verifies Amazon's request signature and
// timestamp on every call, so unsigned requests are rejected before any handler runs.
export function mountAlexa(app: Express, path = "/alexa") {
  const skill = buildSkill();
  const adapter = new ExpressAdapter(skill, true, true);
  app.post(path, adapter.getRequestHandlers());
}
