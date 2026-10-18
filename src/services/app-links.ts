// Where to get each app: its official website and its Google Play and App Store pages (data/world/app-links.json).
// Every link was opened when it was collected, and "verified" is true only when the store page's title matched the
// app; the date is in the file. An app without a link has none we could verify, and the answer says nothing about it.
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

export interface AppLinks {
  site: string | null;
  googlePlay: string | null;
  appStore: string | null;
  verified: boolean;
  note: string;
}
export interface AppLinksRegistry {
  get(name: string): AppLinks | undefined;
  retrieved: string;
}

export function loadAppLinks(root: string): AppLinksRegistry {
  const file = join(root, "data/world/app-links.json");
  const data = existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as { source: { retrieved: string }; apps: Record<string, AppLinks> }) : { source: { retrieved: "" }, apps: {} };
  const byKey = new Map(Object.entries(data.apps).map(([k, v]) => [k.toLowerCase(), v]));
  return { get: (name) => byKey.get(String(name).toLowerCase()), retrieved: data.source.retrieved };
}
