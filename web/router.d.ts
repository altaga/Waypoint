// Types for the browser module (web/router.js), used by the tests.
export function routeUtterance(text: string, context?: { destination?: string }): { tool: string; args: Record<string, unknown> } | null;
