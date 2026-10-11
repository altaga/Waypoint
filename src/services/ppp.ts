// World Bank PPP conversion factors (PA.NUS.PRVT.PP: local currency units per
// international dollar, private consumption), vendored snapshot, CC BY 4.0.

export interface PppRow {
  iso2: string;
  year: number;
  value: number;
}

export interface PppTable {
  get(iso2: string): PppRow | undefined;
}

export function createPppTable(rows: PppRow[]): PppTable {
  const map = new Map(rows.map((r) => [r.iso2, r]));
  return { get: (iso2) => map.get(iso2) };
}

/**
 * Purchasing-power equivalent: how much of the destination currency buys what
 * `amountHome` buys at home. Uses PPP factors for both countries.
 */
export function pppEquivalent(amountHome: number, home: PppRow, dest: PppRow): number {
  const intlDollars = amountHome / home.value;
  return intlDollars * dest.value;
}
