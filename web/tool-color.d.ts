export const TOOL_COLOR: Record<string, string>;

export function toolColor(name: string): string;
export function inkOn(hex: string): string;

export type LogEntry = {
  kind: string;
  key: string;
  name: string;
  tool: string | null;
};

export function describeEntry(
  dir: string,
  msg: Record<string, unknown>,
  pending: Map<string, { tool: string | null; key: string }>,
): LogEntry;

export function colorFor(entry: { kind: string; key: string; tool: string | null }): string;
