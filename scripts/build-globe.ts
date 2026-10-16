// The land dots for the trip hero's globe: points on an even grid that fall on land, from Natural
// Earth's 1:110m land (public domain, via world-atlas). The browser only projects these points, so
// it needs no map library. Run: npx tsx scripts/build-globe.ts (writes web/globe-dots.json).
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { feature } from "topojson-client";
import { geoContains } from "d3-geo";

const root = join(import.meta.dirname, "..");
const topo = JSON.parse(readFileSync(join(root, "node_modules/world-atlas/land-110m.json"), "utf8"));
const land = feature(topo, topo.objects.land);

// Rows every STEP degrees; along a row the spacing widens with latitude so dots stay evenly apart.
// Antarctica is left out: at the bottom of the globe it reads as a white smear, not a continent.
const STEP = 1.6;
const dots: number[] = [];
for (let lat = -58; lat <= 82; lat += STEP) {
  const step = STEP / Math.max(Math.cos((lat * Math.PI) / 180), 0.2);
  for (let lon = -180; lon < 180; lon += step) {
    if (geoContains(land as never, [lon, lat])) dots.push(Math.round(lat * 10), Math.round(lon * 10));
  }
}
writeFileSync(
  join(root, "web/globe-dots.json"),
  JSON.stringify({ source: "Natural Earth 1:110m land via world-atlas 2 (public domain)", step: STEP, scale: 10, dots }) + "\n",
);
console.log(`wrote ${dots.length / 2} land dots`);
