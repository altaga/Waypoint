// Types for the browser module (web/mission.js), used by the tests.
type Place = { id: string; city?: string; area?: string; durationMinutes?: number };
type PlanDay = { day: number; title?: string; stops: string[] };
type Violation = { day: number; code: string; placeId?: string | null };
type Root = {
  querySelector(sel: string): any;
  querySelectorAll(sel: string): { length: number };
  classList: { add(name: string): void };
  removeAttribute(name: string): void;
};
export function isAutopilot(text: string): boolean;
export function noTripLine(lang: string): string;
export function askDatesLine(lang: string): string;
export type TripRequest = { destination: string; startDate: string; endDate: string };
export function tripFromRequest(text: string, currentDestination?: string | null): { use: "current" } | { use: "ask" } | { use: "unknown" } | { use: "create"; trip: TripRequest };
export function makeTrip(
  client: { callTool(name: string, args: Record<string, unknown>): Promise<any> },
  trip: TripRequest,
): Promise<{ answer?: any; brief?: any; plan?: any }>;
export function missionHtml(lang: string, destName: string): string;
export function planFrom(places: Place[], stay: number, pace?: string): PlanDay[];
export function repair(plan: PlanDay[], violations: Violation[]): PlanDay[];
export function runMission(opts: {
  client: { callTool(name: string, args: Record<string, unknown>): Promise<any> };
  lang: string;
  brief: any;
  root: Root;
  minStepMs?: number;
}): Promise<{ voice: string; calls: number; ms: number }>;
