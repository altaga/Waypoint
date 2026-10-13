# Official and reliable data sources and APIs for a travel-readiness concierge (as of 13 Oct 2026)

Method note: a "Live check" entry means the researcher fetched the endpoint on 2026-10-13 from this sandbox and recorded the HTTP status and payload shape. Facts marked "(prior knowledge, unverified)" came from model knowledge and were not confirmed with a fetch this session. Treat them as leads, not citations.

## 1. Visa and entry requirements (Timatic, Sherpa, VisaDB, Passport Index, Travel Buddy, government sources)

### Takeaway
No official, free, machine-readable global visa-rules API exists. IATA Timatic is the industry standard, but it is commercial or B2B. For a hackathon, the realistic stack is:
- the MIT-licensed Passport Index CSV as a baseline matrix;
- live entry-requirements text from GOV.UK and Canada's advisory JSON for each country;
- hard-coded official rules for the few corridors that matter to Mexican and US travellers (US ESTA/visa, Canada eTA/visa, UK ETA, Schengen, Korea);
- optionally, Travel Buddy on RapidAPI as a paid or freemium API.

### Cited Findings
- **IATA Timatic AutoCheck REST API.** It is listed on IATA's developer portal, and the German and Japanese versions of the listing label it "free" (KOSTENLOS / 無料). The listing appears roughly two years old, and the English pricing was not retrieved. — [IATA developer portal (DE)](https://api.developer.iata.org/de/iata-iata-timatic/api/timatic-autocheck-rest-api); [JA](https://api.developer.iata.org/ja/iata-iata-timatic/api/timatic-autocheck-rest-api)
  - Timatic is sold to airlines through partners. Amadeus, for example, integrates it with Altéa and publishes no public price. — [Amadeus Timatic](https://amadeus.com/es/aerolineas/productos/timatic)
  - Inference: "free" most likely means the portal listing is free to view, while production access still needs a commercial contract with IATA. Not suitable for a hackathon unless access is already in hand.
- **Sherpa (joinsherpa).** It is a B2B travel-rules platform: "travel companies can provide travelers with up-to-date information about travel restrictions" through its API. — [PhocusWire](https://www.phocuswire.com/sherpa-raises-8-5-million-to-meet-demand-for-its-travel-rules-platform)
  - It is also reachable as a Pipedream Connect app (apply.joinsherpa.com) using an API key. — [Pipedream](https://pipedream.com/apps/sherpa)
  - No public self-serve developer docs or pricing were found.
- **Passport Index dataset (GitHub ilyankou/passport-index-dataset).**
  - Licence: MIT ("feel free to use the dataset under the MIT license"). — [GitHub repo](https://github.com/ilyankou/passport-index-dataset)
  - Format: six CSVs, in matrix and tidy layouts, each keyed by ISO-2, ISO-3 or country name. Example: `passport-index-tidy-iso2.csv` with columns passport, destination, requirement. — [GitHub repo](https://github.com/ilyankou/passport-index-dataset)
  - Value codes: a number of visa-free days (7–360), `visa free`, `visa on arrival`, `eta` (added Jan 2025), `e-visa`, `visa required`, `no admission`, and `-1` for the traveller's own country. — [GitHub repo](https://github.com/ilyankou/passport-index-dataset)
  - Freshness: last updated 12 Jan 2025, and the repo is now archived. The README links to a newer repository for data from Feb 2026 onward, whose URL and licence were not retrieved. — [GitHub repo](https://github.com/ilyankou/passport-index-dataset)
  - The upstream source is passportindex.org, built from "publicly available information and with content contributed by fans and government agencies". — [GitHub repo](https://github.com/ilyankou/passport-index-dataset)
- **Travel Buddy visa API.** It is sold on RapidAPI at `rapidapi.com/TravelBuddyAI/api/visa-requirement` and covers 200 passports and 210 destinations, according to the vendor's WordPress plugin listing. — [WordPress plugin "Travel Buddy"](https://wordpress.org/plugins/travel-buddy)
  - RapidAPI pricing tiers were not retrieved. Third-party marketplaces (Zyla) advertise a free trial. — [Zyla Labs](https://www.zylalabs.com/api-marketplace/top-search/Visa%20Requirements)
- **Government source: Canada for Mexican citizens (official).**
  - Since 11:30 p.m. ET on 29 Feb 2024, Mexican nationals need a visitor visa unless they qualify for an eTA. Earlier eTAs on Mexican passports were cancelled. — [IRCC: Changes to eTA and visitor visa requirements for Mexican citizens](https://www.canada.ca/en/immigration-refugees-citizenship/campaigns/eta-work-visa-mexico.html); [KPMG flash alert](https://kpmg.com/xx/en/our-insights/gms-flash-alert/flash-alert-2024-045.html)
  - To qualify for an eTA, a Mexican citizen must fly in or transit by air on a Mexican passport, and must either hold a valid US non-immigrant visa or have held a Canadian visitor visa in the past 10 years. Land and sea entry needs a visa. — [IRCC](https://www.canada.ca/en/immigration-refugees-citizenship/campaigns/eta-work-visa-mexico.html)
  - Conflict: one Mexican media report (TV Azteca) suggests a 2026 relaxation, with "sin visa en julio 2026" and a 26 May 2026 date. Other 2026 guides say the 2024 rules remain. — [TV Azteca](https://www.tvazteca.com/aztecanoticias/los-mexicanos-podran-entrar-a-canada-sin-visa-en-julio-2026-al-cumplir/); [HolaSIM guide](https://holasim.com/en/blog/do-you-need-a-visa-for-canada-in-2026-current-guide-for-mexicans/)
  - No official IRCC confirmation of a change was found, and the IRCC page fetched returned the 2024 criteria. Verify before demoing.
- **Government source: entry requirements into Mexico.** SRE consulates publish visitor entry requirements for foreigners entering Mexico (valid passport, etc.). — [Consulmex La Habana](https://consulmex.sre.gob.mx/la-habana/index.php/servicios-consulares/requisitos-de-entrada-a-mexico)
  - INM/SRE's "Guía del viajero" PDF covers visas for entering Mexico, not outbound travel by Mexicans. — [gob.mx 2023 Guía del Viajero (Visa)](https://www.gob.mx/cms/uploads/attachment/file/793746/2023_GUIA_DEL_VIAJERO_Visa.pdf)
- **VisaDB.** No authoritative information on access, terms or licence was found.

### Inferences
- For a demo focused on Mexican and US travellers, use Passport Index (MIT) for breadth. Then overlay a small hand-curated JSON of the corridors above, each citing its official URL, because the archived dataset predates the 2026 changes.
- Avoid presenting Passport Index or Travel Buddy output as authoritative. Every answer should link back to the official government page.

### Gaps
- Exact Timatic API commercial terms, and whether a developer or sandbox tier exists.
- Travel Buddy RapidAPI free-tier quota.
- VisaDB API existence and terms.
- URL and licence of the successor Passport Index repo (Feb 2026 onward); GitHub API access was blocked in this session.
- Whether Canada changed the eTA rules for Mexican citizens in mid-2026 (the reports conflict).

## 2. Travel advisories (US State Dept, UK FCDO / GOV.UK Content API, Canada, Mexico SRE, Australia Smartraveller)

### Takeaway
Three governments expose machine-readable, free, no-key advisory data that works today:
- **US State Department:** an RSS/XML feed of 223 items, each with Threat-Level, Country-Tag and Keyword categories.
- **UK FCDO:** the GOV.UK Content API (JSON), with sections including "Entry requirements" and alert_status.
- **Canada:** travel.gc.ca open-data JSON, either as one index or one file per country.

Mexico's SRE "Guía del Viajero" and Australia's Smartraveller were not reachable from the sandbox, so treat them as optional or scrape-only.

### Cited Findings
- **US State Department.** The RSS page advertises feeds for readers and aggregators, and no official JSON API was found. — [travel.state.gov RSS page](https://travel.state.gov/content/travel/en/rss.html)
  - Live check: `https://travel.state.gov/_res/rss/TAsTWs.xml` returned HTTP 200, RSS 2.0, about 615 KB. It had 223 `<item>`s, each with `<category domain="Threat-Level">`, `domain="Country-Tag"` and `domain="Keyword"`, plus a full HTML advisory in `<description>`. pubDate was 13 Oct 2026. — [State Dept Travel Advisories RSS](https://travel.state.gov/_res/rss/TAsTWs.xml)
  - Example: "Mexico Travel Advisory - Level 2: Exercise Increased Caution", pubDate 29 May 2026, with state-by-state restrictions in the HTML body. — [State Dept RSS](https://travel.state.gov/_res/rss/TAsTWs.xml)
  - Caveat: Country-Tag values are two-letter FIPS-style codes, not ISO (e.g. `AJ`, `AS`, `BA`), so they need mapping to ISO codes. — [State Dept RSS](https://travel.state.gov/_res/rss/TAsTWs.xml)
  - Caveat: HTML pages on travel.state.gov returned Cloudflare 403 blocks to the sandbox, though the XML feed itself was reachable. — [travel.state.gov](https://travel.state.gov/content/travel/en/copyright-disclaimer.html)
  - Third-party JSON wrappers exist on top of the official feed: 2s.io at about $0.001 per call, and Apify scrapers. — [2s.io](https://2s.io/travel/advisory); [Apify](https://apify.com/maximedupre/us-travel-advisories-scraper)
  - data.gov also lists a "travel alerts" dataset. — [catalog.data.gov](https://catalog.data.gov/dataset/travel-alerts-3417f)
- **UK FCDO (GOV.UK Content API).** Prefix any GOV.UK path with `/api/content`, e.g. `/api/content/foreign-travel-advice/thailand`, which returns a JSON ContentItem. No key is needed. — [GOV.UK Content API reference](https://content-api.publishing.service.gov.uk/reference.html); [Getting started](https://content-api.publishing.service.gov.uk/getting-started.html)
  - Live check: `https://www.gov.uk/api/content/foreign-travel-advice/mexico` returned HTTP 200 JSON. — [GOV.UK API Mexico](https://www.gov.uk/api/content/foreign-travel-advice/mexico)
    - `details` keys: alert_status, change_description, change_history, country, document, parts, reviewed_at, updated_at.
    - `parts`: Warnings and insurance, Entry requirements, Safety and security, Regional risks, Health, Getting help.
    - alert_status was `avoid_all_but_essential_travel_to_parts`.
    - Latest change was "Latest information on Hurricane Simon" (2026-10-09).
  - Caveat: entry requirements in FCDO advice are written for British passport holders.
  - A country index is available at `/api/content/foreign-travel-advice` (third-party docs, not checked against official docs). — [MCP Bundles doc](https://www.mcpbundles.com/skills/gov-uk-worldwide)
  - Apify's wrapper says it covers 226 countries with no auth. — [Apify OpenAPI](https://api.apify.com/v2/acts/XVKqZWuv1sHlbtaTx/builds/GU7sIecm6kDCHcgfK/openapi.json)
- **Canada (travel.gc.ca open data).**
  - Live check: `https://data.international.gc.ca/travel-voyage/index-updated.json` returned HTTP 200 JSON, generated "2026-10-12 10:40:17". Each ISO-2 country has `advisory-state` (0–3), `advisory-text`, `has-regional-advisory`, `date-published` and `recent-updates`, in English and French. — [Canada advisory index JSON](https://data.international.gc.ca/travel-voyage/index-updated.json)
  - Live check: the per-country file `https://data.international.gc.ca/travel-voyage/cta-cap-mx.json` returned HTTP 200. Mexico is `advisory-state` 1, "Exercise a high degree of caution (with regional advisories)", with Hurricane Simon regional updates on 12 Oct 2026. — [Canada Mexico JSON](https://data.international.gc.ca/travel-voyage/cta-cap-mx.json)
  - Inference: this is the cleanest machine-readable advisory source, because it is ISO-keyed, bilingual and updated daily.
- **Mexico SRE "Guía del Viajero".**
  - The `guiadelviajero.sre.gob.mx` host failed (proxy 502) from the sandbox, so no API or feed was found.
  - Searches returned SRE pages about entry into Mexico, not outbound per-country advice for Mexicans. — [Consulmex](https://consulmex.sre.gob.mx/la-habana/index.php/servicios-consulares/requisitos-de-entrada-a-mexico)
- **Australia Smartraveller.** Both `smartraveller.gov.au/countries/documents/index.rss` and `/destinations-export` returned an empty reply or HTTP/2 error from the sandbox, so neither could be verified.

### Inferences
- Recommended advisory stack for the demo: Canada JSON (ISO, bilingual) plus the US State Dept RSS (most relevant to US travellers) plus GOV.UK JSON (rich sectioned text, including Health and Entry requirements).
- No official Mexican government advisory feed was verified, so for Mexican travellers the demo should show the US/Canada/UK levels as reference and link to SRE consular pages.

### Gaps
- Current URL and format of SRE's Guía del Viajero, and whether it has any feed.
- Smartraveller RSS/export availability and licence (believed CC BY 4.0, prior knowledge, unverified).
- Official State Dept terms of reuse; the page was blocked by Cloudflare. US federal works are generally public domain under 17 U.S.C. §105 (prior knowledge, unverified here).

## 3. Electronic travel authorizations (EU ETIAS/EES, UK ETA, US ESTA, Canada eTA, Korea K-ETA): status as of Oct 2026

### Takeaway
- **EES:** fully live since 10 Apr 2026.
- **ETIAS:** no confirmed start date. The EU dropped its "Q4 2026" target in July 2026, and press points to 2027. The fee will be €20.
- **UK ETA:** £20, required for visa-exempt visitors such as US and Mexican citizens.
- **US ESTA:** $40.27 in 2026, with a reported rise to $40.62 on 16 Oct 2026.
- **Canada eTA:** CAD 7. Mexicans qualify only under conditions.
- **Korea K-ETA:** US citizens are exempt until 31 Dec 2026.

### Cited Findings
- **EES** began a progressive rollout on 12 Oct 2025 and "became fully operational at the external borders of all 29 Schengen countries on April 10, 2026". — [Navan (2 Oct 2026)](https://navan.com/blog/when-does-etias-go-into-effect); [Business Travel News Europe](https://www.businesstravelnewseurope.com/Management/EU-names-date-for-launch-of-much-delayed-Entry-Exit-System)
  - Airports reported peak waits of 2–3 hours or more (ACI Europe via Politico, cited by Navan).
  - A flexibility mechanism for biometric checks expired on 6 Sep 2026 without extension. — [Navan](https://navan.com/blog/when-does-etias-go-into-effect)
- **ETIAS** has "no confirmed date". The EU removed the "last quarter of 2026" target from its portal in July 2026. FT reporting says "2027 as the earliest realistic window". — [Navan](https://navan.com/blog/when-does-etias-go-into-effect); [Afar](https://www.afar.com/magazine/europes-etias-travel-entry-requirement-delayed-until-2026)
  - Fee and terms: €20 under Delegated Regulation (EU) 2025/1411, valid three years or until the passport expires. The launch is followed by a six-month transitional period and then a six-month grace period. — [Navan](https://navan.com/blog/when-does-etias-go-into-effect)
  - Caveat: Navan is a commercial blog, and the official portal (travel-europe.europa.eu/etias_en) returned an error page from the sandbox.
- **UK ETA:** "Apply for an ETA to come to the UK if you're a tourist, visiting family or for certain other reasons for up to 6 months. It costs £20." — [GOV.UK ETA guidance](https://www.gov.uk/guidance/apply-for-an-electronic-travel-authorisation-eta)
  - US and Mexican nationals have needed an ETA since 8 Jan 2025 (prior knowledge, unverified this session).
- **US ESTA:** the fee became $40.27 from 1 Jan 2026 (up from $40), an inflation adjustment under the H.R.1 reconciliation law. EVUS became $30.75. — [ImmPolicyTracking](https://immpolicytracking.org/policies/cbp-implements-immigration-fees-required-by-hr-1-reconciliation-bill/)
  - One report says the fee rises to $40.62 on 16 Oct 2026, citing a Federal Register notice of 1 Oct 2026. This is unconfirmed against the Federal Register. — [VisasNews](https://visasnews.com/?p=40452)
  - Mexico is not a Visa Waiver Program country, so Mexicans need a B1/B2 visa, not an ESTA (prior knowledge).
- **Canada eTA:** CAD 7, valid five years or until the passport expires. Mexican eligibility is conditional, as described in section 1. — [IRCC Mexico page](https://www.canada.ca/en/immigration-refugees-citizenship/campaigns/eta-work-visa-mexico.html); [Global66 blog (fee)](https://www.global66.com/blog/visa-canada-mexicano)
  - US citizens need no eTA (prior knowledge).
- **Korea K-ETA:** Korea's Ministry of Justice extended the temporary exemption, covering the US among others, "until December 31, 2026 (KST)". Voluntary applicants still pay the fee. — [Korean Consulate Dallas notice, 24 Dec 2025](https://overseas.mofa.go.kr/us-dallas-en/brd/m_26375/view.do?seq=761099)
  - A third-party blog says the exemption ends 1 Jan 2027 for Americans. — [TripProf](https://tripprof.com/en/blog/korea-k-eta-exemption-ends-americans-2027/)
  - Mexico's K-ETA exemption status was not verified.

### Inferences
- No ETA system exposes a public status API. The concierge should hold a curated `eta_rules.json` (system, fee, validity, applies-to nationalities, official apply URL, last-verified date) and warn users about reseller sites.

### Gaps
- An official EU statement on any revised ETIAS timeline (September 2026).
- Whether Korea extended the K-ETA exemption beyond 2026, and whether Mexico is on the exempt list.
- Official CBP confirmation of the $40.62 ESTA fee.

## 4. Health (CDC travel notices, WHO)

### Takeaway
CDC publishes a live RSS of travel health notices (Levels 1–4), and WHO exposes a public OData JSON API for Disease Outbreak News. Both are free and need no key.

### Cited Findings
- **CDC.** Live check: `https://wwwnc.cdc.gov/travel/rss/notices.xml` returned HTTP 200, RSS 2.0. — [CDC Travel Notices RSS](https://wwwnc.cdc.gov/travel/rss/notices.xml)
  - Current items include "Level 2 - Yellow Fever in Colombia", "Level 2 - Chikungunya in Nicaragua", "Level 1 - Hepatitis A in Costa Rica" and "Level 4 - Ebola Bundibugyo Virus Disease in Ituri and Nord-Kivu Provinces of the DRC".
  - Destination-level vaccine pages exist at wwwnc.cdc.gov/travel/destinations, which would need scraping (prior knowledge).
- **WHO.** Live check: `https://www.who.int/api/news/diseaseoutbreaknews?$top=2&$orderby=PublicationDateAndTime desc` returned HTTP 200 OData JSON. — [WHO DON API](https://www.who.int/api/news/diseaseoutbreaknews)
  - Fields include Title, Summary, Advice, Assessment, Epidemiology, PublicationDate and UrlName.
  - The latest item was 2026-DON620 (10 Oct 2026).
- **Health sections in advisory sources.** GOV.UK travel advice has a "Health" part per country, and Canada's JSON includes PHAC health updates. — [GOV.UK API Mexico](https://www.gov.uk/api/content/foreign-travel-advice/mexico); [Canada index JSON](https://data.international.gc.ca/travel-voyage/index-updated.json)

### Inferences
- The CDC RSS is enough for a "health alert" card. The WHO DON feed adds global outbreak context, but its titles must be matched to countries.

### Gaps
- Official reuse terms. Assumed, not verified: CDC content is US public domain, and WHO content is CC BY-NC-SA 3.0 IGO (prior knowledge). WHO's non-commercial clause could matter.
- Yellow-fever certificate entry requirements per country are not in a free API; they sit in WHO's International Travel and Health country list (PDF).

## 5. FX rates (ECB, Frankfurter) and PPP (World Bank)

### Takeaway
All three are free, keyless and live:
- **Frankfurter v2:** JSON, 223 currencies including MXN. USD→MXN was 18.3112 on 13 Oct 2026.
- **ECB:** daily XML reference rates.
- **World Bank:** API for PPP, with Mexico at 10.33 LCU per international dollar in 2025.

### Cited Findings
- **Frankfurter.**
  - Base URL `https://api.frankfurter.dev` (v2; v1 deprecated). No API key. Data comes from 104 central banks and official sources, with the ECB as the original source. 223 currencies, history back to 1948, daily updates, rate-limited only to prevent abuse. — [frankfurter.dev](https://frankfurter.dev/)
  - Endpoints: `/v2/rates`, `/v2/rate/{base}/{quote}`, `/v2/currencies`, and time series via `from`/`to`. — [frankfurter.dev](https://frankfurter.dev/)
  - Live check: `/v2/rate/usd/mxn` returned `{"date":"2026-10-13","base":"USD","quote":"MXN","rate":18.3112}`. — [Frankfurter USD/MXN](https://api.frankfurter.dev/v2/rate/usd/mxn)
  - Licence: the code is MIT. Rates are public data that Frankfurter "doesn't own", so provider terms apply. Blended rates are "Frankfurter's own calculation, not an official rate", and come "as is, with no warranty". — [Frankfurter License & Terms](https://www.frankfurter.dev/license/)
- **ECB.** Live check: `https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml` returned HTTP 200 XML, with Cube time 2026-10-12 and EUR/USD 1.1181. These are euro reference rates for about 30 currencies, published on working days. — [ECB eurofxref daily](https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml)
  - ECB reference rates are "for information purposes only" (prior knowledge, unverified).
- **World Bank.** Live check: `https://api.worldbank.org/v2/country/MX/indicator/PA.NUS.PPP?format=json&mrv=2` returned Mexico's PPP conversion factor (GDP, LCU per international $) of 10.328951 for 2025 and 9.916562 for 2024, last updated 2026-10-08. — [World Bank API](https://api.worldbank.org/v2/country/MX/indicator/PA.NUS.PPP?format=json&mrv=2)
  - Comparing 18.31 MXN/USD market against 10.33 PPP suggests prices in Mexico are about 56% of US levels on a GDP basis.
  - World Bank data is CC BY 4.0 (prior knowledge, unverified).

### Inferences
- Use Frankfurter for conversion, because it is JSON, includes MXN and needs no key. Use World Bank PPP for "how expensive is it there" comparisons, with the attribution "Source: World Bank".

### Gaps
- Banxico's FIX rate API (SIE API; needs a free token) was not researched, but it would be the official MXN source.

## 6. Local laws, plus licensing caveats for an open-source project

### Takeaway
"Local laws" content is best taken from GOV.UK's "Safety and security" part, which includes local laws and customs, and from the Canada and US advisory text. No free official structured local-laws API exists. On licensing, government data is generally reusable with attribution, while commercial APIs (Timatic, Sherpa, Travel Buddy) forbid redistribution. Keep their keys server-side and do not commit their responses to the repo.

### Cited Findings
- GOV.UK travel advice parts include "Safety and security", which covers local laws, and "Entry requirements". — [GOV.UK API Mexico](https://www.gov.uk/api/content/foreign-travel-advice/mexico)
- Sub-page paths (e.g. local laws) 303-redirect to the single canonical content item. — [GOV.UK Content API getting started](https://content-api.publishing.service.gov.uk/getting-started.html)
- Licences:

| Source | Licence | Status |
|---|---|---|
| Passport Index dataset | MIT | Verified ([GitHub](https://github.com/ilyankou/passport-index-dataset)) |
| Frankfurter code | MIT | Verified ([license](https://www.frankfurter.dev/license/)) |
| Frankfurter rate data | Provider terms apply | Verified ([license](https://www.frankfurter.dev/license/)) |
| GOV.UK content | Open Government Licence v3.0 | Prior knowledge, unverified |
| Canada travel.gc.ca data | Open Government Licence – Canada | Prior knowledge, unverified |
| US State Dept / CDC | Federal works, public domain (17 U.S.C. §105) | Prior knowledge, unverified |
| WHO | CC BY-NC-SA 3.0 IGO | Prior knowledge, unverified |
| World Bank | CC BY 4.0 | Prior knowledge, unverified |

### Inferences
- For an open-source repo: commit only the MIT Passport Index CSV and hand-curated rule JSON that cites official URLs. Fetch government feeds at runtime with attribution. Add a "not legal advice — verify with official source" disclaimer, especially for visa answers.
- Watch for these licence caveats:
  - WHO's NC clause.
  - Frankfurter's blended rates are not official rates.
  - State Dept uses FIPS country codes rather than ISO.
  - FCDO entry requirements are written from a UK-passport perspective.

### Gaps
- None of the government licence or terms pages were fetched successfully this session (state.gov was Cloudflare-blocked). Verify the OGL and public-domain claims before relying on them.
