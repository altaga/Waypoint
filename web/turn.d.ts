export function callKey(c: { tool: string; args?: Record<string, unknown> }): string;
export function freshCalls<T extends { tool: string; args?: Record<string, unknown> }>(calls: T[], seen: Set<string>): T[];
