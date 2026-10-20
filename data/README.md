# Data layout

All knowledge Waypoint answers from lives under this folder (plus `packs/` at the repo root for entry-rule packs).

| Path | What it is |
|------|------------|
| `highlights/` | Curated places per country (preferred at runtime) |
| `world/` | Worldwide catalogs: cities, payments, transit, apps, ranked `world/highlights/`, climate, … |
| `guide/` | Country travel-guide facts (quoted sources) |
| `sources-text/` | Cached official text used to validate pack quotes |
| `vendor/` | Vendored snapshots (passport index, PPP, FX fallback, plugs, …) |
| `curation/` | Curation overlays / review inputs |
| `grounding/` | Wikipedia grounding links for places |

Rebuild scripts live in `../scripts/`. Runtime loaders are in `../src/services/`.
