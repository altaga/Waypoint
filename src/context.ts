import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseVisaCsv, type VisaMatrix } from "./services/visa.ts";
import { loadPacks, type PackRegistry } from "./services/packs.ts";
import { loadHighlights, type HighlightRegistry } from "./services/highlights.ts";
import { loadWorld, type WorldRegistry } from "./services/world.ts";
import { createFxService, type FxService } from "./services/fx.ts";
import { createPppTable, type PppTable } from "./services/ppp.ts";
import { createFileStore, createMemoryStore, type StateStore } from "./state.ts";
import { createDynamoStore } from "./state-dynamo.ts";

export interface AppContext {
  root: string;
  store: StateStore;
  visa: VisaMatrix;
  packs: PackRegistry;
  highlights: HighlightRegistry;
  world: WorldRegistry;
  fx: FxService;
  ppp: PppTable;
  clock: () => Date;
  offline: boolean;
  visaSource: { id: string; title: string; url: string; license: string; retrieved: string };
}

export interface ContextOptions {
  root?: string;
  store?: StateStore;
  offline?: boolean;
  clock?: () => Date;
}

/** Loads all vendored data. Nothing here performs network I/O unless the app is online. */
export function createContext(opts: ContextOptions = {}): AppContext {
  const root = opts.root ?? process.env.WAYPOINT_ROOT ?? join(import.meta.dirname, "..");
  const offline = opts.offline ?? process.env.WAYPOINT_OFFLINE === "1";
  const visaCsv = readFileSync(join(root, "data/vendor/passport-index/passport-index-tidy-iso2.csv"), "utf8");
  const fxSnapshot = JSON.parse(readFileSync(join(root, "data/vendor/fx-fallback.json"), "utf8"));
  const pppFile = JSON.parse(readFileSync(join(root, "data/vendor/ppp.json"), "utf8"));
  const dataDir = process.env.WAYPOINT_DATA_DIR ?? join(root, "data");
  return {
    root,
    offline,
    clock: opts.clock ?? (() => new Date()),
    store: opts.store ?? (process.env.WAYPOINT_TABLE_NAME ? createDynamoStore(process.env.WAYPOINT_TABLE_NAME) : createFileStore(join(dataDir, "state.json"))),
    visa: parseVisaCsv(visaCsv),
    packs: loadPacks(root),
    highlights: loadHighlights(root),
    world: loadWorld(root),
    fx: createFxService({ offline, snapshot: fxSnapshot }),
    ppp: createPppTable(pppFile.rows),
    visaSource: {
      id: "src:passport-index",
      title: "imorte/passport-index-data (passport visa matrix, snapshot 2026-02-17)",
      url: "https://github.com/imorte/passport-index-data",
      license: "MIT",
      retrieved: "2026-02-17",
    },
  };
}

export { createMemoryStore };
