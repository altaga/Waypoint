# Status

Last updated: 2026-10-11 (D0, UTC+7).

## Done

- Project baseline: `package.json` (MCP SDK 1.32.1, express 5.3.0, zod 4.6.5), `tsconfig.json`, `.gitignore` covers `data/state.json` and `data/raw/`.
- Traveler profile model with zod (`src/profile.ts`): multi-traveler groups, passports stored as country + optional expiry only, sensitive medications redacted unless consent is given.
- Customer-facing error mapper (`src/errors.ts`): never exposes raw error text, always gives a next step.
- Unit tests (`test/`): 8 passing. `npm run typecheck` clean.

## Gaps versus the context doc

- The skeleton described in the doc (`/workspace/amazon-alexa-mcp`: MCP server, tools, web client, Strands agent) is **not present** in this environment. Only the initial commit (LICENSE, README, .gitignore) existed. The server, tools and web host still need to be built.
- REST Countries bug and currency mapping: not applicable until the old skeleton is restored. Plan is to use `countries-list`.
- Not started: visa matrix, country packs and validator, `check_entry_requirements`, `get_local_rules`, `plan_trip`, elicitation, MCP Apps, web simulator, Bedrock pipeline, Agent Skill.

## Next

1. MCP server on Streamable HTTP (`/mcp`, 2025-11-25) with `outputSchema` and annotations on every tool.
2. Profile tools (`get_traveler_profile`, `update_traveler_profile`, `forget_me`).
3. Visa matrix (vendored from imorte/passport-index-data, MIT) and `check_entry_requirements`.
