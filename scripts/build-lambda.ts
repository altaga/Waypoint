// Builds lambda-bundle/: one ESM file (index.mjs) plus the data it reads at runtime
// (packs, vendored data, the plan dashboard). Run before `cdk deploy`.
import { build } from "esbuild";
import { cpSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..");
const OUT = join(ROOT, "lambda-bundle");
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

await build({
  entryPoints: [join(ROOT, "src/lambda.ts")],
  outfile: join(OUT, "index.mjs"),
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  sourcemap: false,
  banner: { js: 'import { createRequire as __cr } from "node:module"; const require = __cr(import.meta.url);' },
  logLevel: "warning",
});

cpSync(join(ROOT, "packs"), join(OUT, "packs"), { recursive: true });
cpSync(join(ROOT, "data/vendor"), join(OUT, "data/vendor"), { recursive: true });
cpSync(join(ROOT, "data/sources-text"), join(OUT, "data/sources-text"), { recursive: true });
cpSync(join(ROOT, "src/ui"), join(OUT, "ui"), { recursive: true });
// Destination highlights: curated packs first, then the worldwide catalog (see loadHighlights).
cpSync(join(ROOT, "highlights"), join(OUT, "highlights"), { recursive: true });
cpSync(join(ROOT, "data/world"), join(OUT, "data/world"), { recursive: true });
// The simulated Alexa+ host (served at /) plus the public pages Alexa needs (privacy, terms, icons).
cpSync(join(ROOT, "web"), join(OUT, "web"), { recursive: true });
console.log(`built ${OUT}`);
