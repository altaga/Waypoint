// Types for the browser module (web/cards.js), used by the tests.
export function genericCard(card: unknown, sc?: unknown, lang?: string, tool?: string): string;
export function renderTool(tool: string, sc: unknown, lang: string): string;
export function esc(s: unknown): string;
export function dayRanges(days: number[]): string;
