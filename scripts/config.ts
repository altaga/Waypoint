// Tier A demo set (context doc §4.6): destinations with human-review packs, and
// the ten passports used for the visa matrix. Source slugs point at GOV.UK
// (FCDO) pages where they exist; the US is not covered by FCDO, so it uses the
// US State Dept data only.

export const TIER_A_DESTINATIONS = [
  { iso: "JP", govuk: "japan" },
  { iso: "SG", govuk: "singapore" },
  { iso: "TH", govuk: "thailand" },
  { iso: "VN", govuk: "vietnam" },
  { iso: "KR", govuk: "south-korea" },
  { iso: "CN", govuk: "china" },
  { iso: "AE", govuk: "united-arab-emirates" },
  { iso: "TR", govuk: "turkey" },
  { iso: "ES", govuk: "spain" },
  { iso: "FR", govuk: "france" },
  { iso: "IT", govuk: "italy" },
  { iso: "CA", govuk: "canada" },
  { iso: "MX", govuk: "mexico" },
] as const;
// US is in the demo set as a destination in the doc, but the State Dept
// CountryTravelInformation feed does not cover the United States (it is the
// issuing country), and FCDO does not publish it. Tracked in docs/DATA_REVIEW.md.

export const TIER_A_PASSPORTS = ["MX", "US", "CA", "GB", "ES", "DE", "IN", "CN", "JP", "BR"] as const;

export const PACK_REFERENCE_DATE = "2026-10-11";
export const MAX_VERIFIED_AGE_DAYS = 90;
