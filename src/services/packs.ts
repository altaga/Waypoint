import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { validatePack } from "../packs/validate.ts";
import type { Pack } from "../packs/schema.ts";
import { MAX_VERIFIED_AGE_DAYS, PACK_REFERENCE_DATE } from "../../scripts/config.ts";

export interface PackRegistry {
  get(iso: string): Pack | undefined;
  list(): Pack[];
}

/**
 * Loads and validates every packs/*.json file at startup. A pack that fails
 * validation is logged and skipped, never served.
 */
export function loadPacks(root: string, referenceDate = PACK_REFERENCE_DATE): PackRegistry {
  const packs = new Map<string, Pack>();
  const dir = join(root, "packs");
  for (const file of readdirSync(dir)) {
    if (!/^[A-Z]{2}\.json$/.test(file)) continue;
    const iso = file.slice(0, 2);
    const raw = JSON.parse(readFileSync(join(dir, file), "utf8"));
    const textFile = join(root, "data/sources-text", `${iso}.json`);
    const sourceTexts = JSON.parse(readFileSync(textFile, "utf8")) as Record<string, string>;
    const result = validatePack(raw, sourceTexts, { referenceDate, maxAgeDays: MAX_VERIFIED_AGE_DAYS });
    if (result.ok && result.pack) {
      packs.set(iso, result.pack);
    } else {
      console.warn(`skipping pack ${iso}: ${result.issues.map((i) => i.message).join("; ")}`);
    }
  }
  return {
    get: (iso) => packs.get(iso),
    list: () => [...packs.values()],
  };
}
