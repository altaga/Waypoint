import type { Express, Request, Response, NextFunction } from "express";
import { ExpressAdapter } from "ask-sdk-express-adapter";
import { buildSkill } from "./skill.ts";

// Mounts the skill at /alexa. The adapter verifies Amazon's request signature and
// timestamp on every call, so unsigned requests are rejected before any handler runs.
export function mountAlexa(app: Express, path = "/alexa") {
  const skill = buildSkill();
  const adapter = new ExpressAdapter(skill, true, true);
  // Lambda (serverless-http) puts the raw body on req.body before Express runs. The adapter
  // refuses requests whose body is already set, so drop that copy; the stream is still intact.
  const dropPreParsedBody = (req: Request, _res: Response, next: NextFunction) => {
    if ((req as { body?: unknown }).body !== undefined) delete (req as { body?: unknown }).body;
    next();
  };
  app.post(path, dropPreParsedBody, adapter.getRequestHandlers());
}
