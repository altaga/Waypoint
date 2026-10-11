import { test } from "node:test";
import assert from "node:assert/strict";
import { TravelerProfile, redactSensitive } from "../src/profile.ts";

const base = {
  profileId: "p1",
  ownerUserId: "u1",
  homeCurrency: "MXN",
  homeTimezone: "America/Mexico_City",
  travelers: [
    {
      travelerId: "t1",
      displayName: "Victor",
      passports: [{ country: "MX" }],
      medications: ["pseudoephedrine"],
    },
  ],
  consent: { sensitiveData: false, updatedAt: "2026-10-11T00:00:00Z" },
  updatedAt: "2026-10-11T00:00:00Z",
};

test("accepts a valid profile and applies defaults", () => {
  const parsed = TravelerProfile.parse(base);
  assert.equal(parsed.locale, "en-US");
  assert.equal(parsed.pace, "balanced");
  assert.deepEqual(parsed.travelers[0].validVisas, []);
});

test("rejects a profile with no travelers", () => {
  assert.throws(() => TravelerProfile.parse({ ...base, travelers: [] }));
});

test("rejects passport countries that are not ISO alpha-2", () => {
  const bad = { ...base, travelers: [{ ...base.travelers[0], passports: [{ country: "MEX" }] }] };
  assert.throws(() => TravelerProfile.parse(bad));
});

test("redacts medications unless the owner opted in to sensitive data", () => {
  const parsed = TravelerProfile.parse(base);
  const redacted = redactSensitive(parsed);
  assert.equal("medications" in redacted.travelers[0], false);

  const optedIn = TravelerProfile.parse({
    ...base,
    consent: { sensitiveData: true, updatedAt: "2026-10-11T00:00:00Z" },
  });
  assert.deepEqual(redactSensitive(optedIn).travelers[0].medications, ["pseudoephedrine"]);
});
