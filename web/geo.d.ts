export function distanceKm(aLat: number, aLon: number, bLat: number, bLon: number): number;
export type CityRow = [string, string, string, number, number];
export type Near = { name: { en: string; es: string }; iso: string; km: number };
export function nearestCity(lat: number, lon: number, cities: CityRow[], maxKm?: number): Near | null;
export function whereLine(lang: string, near: Near | null, destName?: string | null): string;
export function fromHereRequest(lang: string, near: Near | null, hasTrip: boolean): string;
