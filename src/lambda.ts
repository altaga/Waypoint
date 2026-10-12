import serverless from "serverless-http";
import { createApp } from "./server.ts";
import { createContext } from "./context.ts";

// Lambda entry point. The bundle directory holds packs/, data/ and ui/ next to index.mjs,
// so the server reads them from there (WAYPOINT_ROOT). The app is built once per container.
process.env.WAYPOINT_ROOT ??= import.meta.dirname;
const ctx = createContext();
// Binary responses (icons) must be base64 for a Function URL, or the bytes get mangled.
const handler = serverless(createApp(ctx), { binary: ["image/*"] });
export { handler };
