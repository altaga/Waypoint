// Exports the pack JSON Schema for the open-source validator package.
// Run: npm run export-schema
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { Pack } from "../src/packs/schema.ts";

const ROOT = join(import.meta.dirname, "..");
const out = join(ROOT, "oss/travel-entry-packs/schema");
mkdirSync(out, { recursive: true });
const schema = z.toJSONSchema(Pack, { target: "draft-2020-12" });
writeFileSync(join(out, "pack.schema.json"), JSON.stringify({ $id: "https://github.com/altaga/travel-entry-packs/schema/pack.schema.json", ...schema }, null, 2) + "\n");
console.log("wrote oss/travel-entry-packs/schema/pack.schema.json");
