import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { TravelerProfile } from "./profile.ts";

// Cross-session memory. Everything a user has told Waypoint lives here, keyed by
// user id. The file store is for local runs; the StateStore interface is what a
// DynamoDB implementation would satisfy (docs/AWS.md).

export interface Trip {
  tripId: string;
  destination: string; // ISO 3166-1 alpha-2
  startDate: string;
  endDate: string;
  travelerIds: string[];
  createdAt: string;
  packingDone: string[];
  /** Day plan. Stops are place ids from the highlights catalog; the verifier checks them. */
  itinerary?: ItineraryDay[];
  /** Things the traveler told us to respect for every plan and every expense. */
  constraints?: TripConstraints;
  bookings?: Booking[];
}

export interface ItineraryDay {
  day: number;
  date?: string;
  title?: string;
  stops: string[];
}

export interface TripConstraints {
  /** Interests to keep out of the plan, e.g. "nightlife". */
  avoid: string[];
  /** A spending cap for the whole trip, in one currency. */
  maxBudget?: { amount: number; currency: string };
}

export interface Expense {
  id: string;
  tripId: string | null;
  amount: number;
  currency: string;
  category: string;
  note?: string;
  createdAt: string;
  /** Traveler who paid (travelerId). Without it the expense cannot be settled. */
  payer?: string;
  /** Travelers who share the cost (travelerIds). Empty or missing means the whole group. */
  splitAmong?: string[];
}

export interface Booking {
  id: string;
  kind: "flight" | "hotel" | "car" | "activity" | "other";
  title: string;
  date?: string; // ISO date of the service
  /** Last day to cancel without a penalty, as the booking states it. */
  cancelBy?: string;
  reference?: string; // confirmation code, as written in the booking
  status: "to_confirm" | "confirmed";
  createdAt: string;
}

export interface UserState {
  profile: TravelerProfile | null;
  trips: Trip[];
  expenses: Expense[];
}

export const emptyState = (): UserState => ({ profile: null, trips: [], expenses: [] });

export interface StateStore {
  load(userId: string): Promise<UserState>;
  save(userId: string, state: UserState): Promise<void>;
  remove(userId: string): Promise<void>;
}

export function createMemoryStore(): StateStore {
  const data = new Map<string, UserState>();
  return {
    async load(userId) {
      return structuredClone(data.get(userId) ?? emptyState());
    },
    async save(userId, state) {
      data.set(userId, structuredClone(state));
    },
    async remove(userId) {
      data.delete(userId);
    },
  };
}

export function createFileStore(path: string): StateStore {
  async function readAll(): Promise<Record<string, UserState>> {
    try {
      return JSON.parse(await readFile(path, "utf8"));
    } catch {
      return {};
    }
  }
  async function writeAll(all: Record<string, UserState>) {
    await mkdir(dirname(path), { recursive: true });
    const tmp = `${path}.tmp`;
    await writeFile(tmp, JSON.stringify(all, null, 2));
    await rename(tmp, path); // atomic replace
  }
  return {
    async load(userId) {
      return (await readAll())[userId] ?? emptyState();
    },
    async save(userId, state) {
      const all = await readAll();
      all[userId] = state;
      await writeAll(all);
    },
    async remove(userId) {
      const all = await readAll();
      delete all[userId];
      await writeAll(all);
    },
  };
}
