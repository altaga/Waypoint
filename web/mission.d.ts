// Types for the browser module (web/mission.js), used by the tests.
type Place = { id: string; city?: string; stayCity?: string; area?: string; zone?: string; lat?: number; lon?: number; durationMinutes?: number };
type CityStay = { city: string; minDays: { express: number; classic: number; slow: number } };
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
export type PaceId = "packed" | "balanced" | "relaxed";
export function paceFromText(text: string): PaceId | null;
export function askedPace(text: string): PaceId | null;
export const PACE_NAMES: Record<PaceId, { en: string; es: string }>;
export function paceKey(pace?: string): "express" | "classic" | "slow";
export function tripFromRequest(text: string, currentDestination?: string | null): { use: "current"; pace?: PaceId } | { use: "ask" } | { use: "unknown" } | { use: "create"; trip: TripRequest; pace?: PaceId };
export function makeTrip(
  client: { callTool(name: string, args: Record<string, unknown>): Promise<any> },
  trip: TripRequest,
  pace?: PaceId,
): Promise<{ answer?: any; brief?: any; plan?: any }>;
export function missionHtml(lang: string, destName: string): string;
export function planFrom(places: Place[], stay: number, pace?: string, cities?: CityStay[]): PlanDay[];
export function repair(plan: PlanDay[], violations: Violation[]): PlanDay[];
export function runMission(opts: {
  client: { callTool(name: string, args: Record<string, unknown>): Promise<any> };
  lang: string;
  brief: any;
  root: Root;
  minStepMs?: number;
  replan?: boolean;
}): Promise<{ voice: string; calls: number; ms: number }>;
