// Types for the build-time map libraries used by scripts/build-globe.ts (they ship none).
declare module "topojson-client" {
  export function feature(topology: unknown, object: unknown): unknown;
}
declare module "d3-geo" {
  export function geoContains(object: unknown, point: [number, number]): boolean;
}
