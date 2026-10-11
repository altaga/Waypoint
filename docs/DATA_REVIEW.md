# Data review checklist (human, tier A)

Packs in `packs/` are **tier B, machine-extracted**. They are not reviewed. Before any pack becomes tier A, a named reviewer must go through this list and record `review.reviewedBy` and `review.reviewedAt`. The validator refuses tier A without them.

## Status today

| Pack | Rules | Tier | Review |
|---|---|---|---|
| JP, SG, TH, VN, CN, AE, TR, ES, FR, IT, CA, MX | 6–16 each | B | machine_extracted |
| KR | 6 | B | machine_extracted |

Coverage gaps:

- **United States as destination:** not in the State Dept destination feed, and FCDO does not publish it. No rules. The US still works as a passport.
- **United Kingdom as destination:** not in the sources built here. The demo set (context doc §4.6) lists GB; it needs its own source pass.
- Visa data covers all ten demo passports via the vendored matrix.

## For each pack

1. **Quote check.** Open the cited source URL. Confirm each `quote` appears on the live page (it should, by construction, but pages change). Note any rule whose source has moved.
2. **Drop weak rules.** Heuristic extraction keeps some headings and fragments. Known examples in the current packs:
   - Headings with no rule content: "Dress code", "LGBT+ travellers", "Medication bans", "Customs rules", "Illegal drugs and prison sentences".
   - Fragments that need context: "Outrage of modesty", "Filming an illegal gathering is forbidden.", "Drink-driving is a serious offence in Vietnam."
   - Remove them, or rewrite the summary so it stands alone and keep the verbatim quote.
3. **Check severity.** The heuristic sets `severity` from keywords. Set it by hand: `severe` for death penalty, `arrest` for arrest or imprisonment, `fine` for fines, `info` otherwise.
4. **Check the category.** Items may be in the wrong category (for example a drug sentence tagged as `alcohol`).
5. **Add Spanish summaries.** `summary.es` is empty everywhere. Write it by hand and keep it short. The English quote stays as the source of truth.
6. **Check lastVerified.** It must be within 90 days of the day you review. Update `retrieved` on each source after you check it.
7. **Sign off.** Set `tier` to `A`, `review.status` to `human_reviewed`, and `review.reviewedBy` to the reviewer's name.

## Estimated effort

About 3 hours for the demo set, per the context doc. Start with JP, SG and VN: they carry the demo storyline.

## Known heuristic risks

- Sentences with "illegal" that are about other countries may leak into a pack. Review the quote's context on the live page.
- A prohibition under a heading in a long list may still be dropped. Spot-check against the page, not just the pack.
- Numbers, fines and stay lengths are not parsed from text. Do not treat them as verified until a reviewer has read them.
