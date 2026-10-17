// Builds data/world/transit.json: how a visitor pays for city transit. For each system it records whether a
// contactless bank card (or phone) works at the gates directly, and the physical card a local uses.
// bankCard: "yes" | "partial" | "no" | "unverified". A system's tier is "oficial" only when the operator's own
// page supports the claim; press, guides and forums are "reportado". A country with no system here has no
// verified transit data. Each system is for a city or a national network, as its source describes it.
//   npx tsx scripts/build-transit.ts
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..");
const OUT = join(ROOT, "data/world/transit.json");
const DATE = "2026-10-17";

type BankCard = "yes" | "partial" | "no" | "unverified";
type Tier = "oficial" | "reportado";
type Text = { en: string; es: string };
type System = {
  country: string;
  city: Text;
  system: Text;
  physicalCard: Text;
  bankCard: BankCard;
  bankCardNote: Text;
  note: Text;
  tier: Tier;
  source: { title: string; url: string };
};

const SYSTEMS: Record<string, System> = {
  london: {
    country: "GB",
    city: { en: "London", es: "Londres" },
    system: { en: "TfL: Tube, bus, DLR, Overground, Elizabeth line, most National Rail", es: "TfL: metro, bus, DLR, Overground, Elizabeth line, la mayoría de trenes nacionales" },
    physicalCard: { en: "Oyster card, or a Visitor Oyster card bought before the trip", es: "Tarjeta Oyster, o Visitor Oyster comprada antes del viaje" },
    bankCard: "yes",
    bankCardNote: {
      en: "Contactless bank cards (and phones) pay for travel on the Tube, bus, tram and most rail; daily caps apply. Each group member aged 11 and over needs their own card. The bank may add overseas fees.",
      es: "Las tarjetas bancarias contactless (y los teléfonos) pagan el viaje en metro, bus, tranvía y la mayoría de trenes; hay tope diario. Cada persona del grupo de 11 años o más necesita su propia tarjeta. El banco puede cobrar comisiones por el extranjero.",
    },
    note: {
      en: "Cash is no longer accepted on buses. Only the Visitor Oyster card qualifies for the 50 % Young Visitor discount.",
      es: "Ya no se acepta efectivo en los buses. Solo la Visitor Oyster da el 50 % de descuento para jóvenes visitantes.",
    },
    tier: "oficial",
    source: { title: "TfL visitor support: Visitor Oyster card vs contactless", url: "https://support.visitorshop.tfl.gov.uk/hc/en-gb/articles/28090529777554-Visitor-Oyster-card-vs-Contactless" },
  },
  new_york: {
    country: "US",
    city: { en: "New York City", es: "Nueva York" },
    system: { en: "MTA subway and buses (OMNY)", es: "Metro y buses de la MTA (OMNY)" },
    physicalCard: { en: "OMNY card (optional); no app or sign-up needed", es: "Tarjeta OMNY (opcional); no hace falta app ni registro" },
    bankCard: "yes",
    bankCardNote: {
      en: "Tap a contactless credit or debit card, phone or wearable at the turnstile or bus reader. Using the same card for both legs of a trip gives a free transfer.",
      es: "Se toca una tarjeta de crédito o débito contactless, un teléfono o un reloj en el torniquete o el lector del bus. Usar la misma tarjeta en ambos tramos da un transbordo gratis.",
    },
    note: {
      en: "The MTA's fare caps and single-ride prices differ between its pages; check mta.info before travelling.",
      es: "Los topes de tarifa y los precios de viaje sencillo difieren entre páginas de la MTA; revisar mta.info antes de viajar.",
    },
    tier: "oficial",
    source: { title: "MTA: OMNY, tap to pay", url: "https://new.mta.info/omny" },
  },
  singapore: {
    country: "SG",
    city: { en: "Singapore", es: "Singapur" },
    system: { en: "SimplyGo: MRT and public buses", es: "SimplyGo: MRT y buses públicos" },
    physicalCard: { en: "Not needed for a bank card; EZ-Link cards still work", es: "No hace falta con tarjeta bancaria; las EZ-Link siguen funcionando" },
    bankCard: "yes",
    bankCardNote: {
      en: "Tap a contactless Visa or Mastercard credit or debit card, or a phone, at the MRT and bus readers. The card must be registered with SimplyGo. Visitor rules for foreign-issued cards were not confirmed in the sources.",
      es: "Se toca una tarjeta de crédito o débito contactless Visa o Mastercard, o un teléfono, en los lectores del MRT y los buses. La tarjeta debe registrarse en SimplyGo. Las reglas para tarjetas emitidas en el extranjero no están confirmadas por las fuentes.",
    },
    note: {
      en: "With several cards in the wallet, remove the ones you do not want to use before tapping, so the wrong card is not charged.",
      es: "Si hay varias tarjetas en la billetera, quitar las que no se quieren usar antes de tocar, para no cobrar la equivocada.",
    },
    tier: "reportado",
    source: { title: "3E CPA: contactless card payments (SimplyGo) for trains and buses", url: "https://www.3ecpa.com.sg/regulatory-and-business/contactless-card-payments-available-in-singapore-simplygo/" },
  },
  netherlands: {
    country: "NL",
    city: { en: "Netherlands (nationwide)", es: "Países Bajos (todo el país)" },
    system: { en: "OV-pay on national public transport (trains, metro, tram, bus)", es: "OV-pay en el transporte público nacional (trenes, metro, tranvía, bus)" },
    physicalCard: { en: "OV-chipkaart still exists; not needed for bank-card travel", es: "La OV-chipkaart sigue existiendo; no hace falta para viajar con tarjeta bancaria" },
    bankCard: "yes",
    bankCardNote: {
      en: "Check in and out with a contactless bank card, phone or watch on the validators, anywhere in the country; the back office bills the linked card. Reported in 2022–2023 press; the current rules were not confirmed.",
      es: "Se valida al entrar y al salir con tarjeta bancaria contactless, teléfono o reloj, en cualquier punto del país; el sistema central cobra a la tarjeta vinculada. Reportado en prensa de 2022–2023; las reglas actuales no están confirmadas.",
    },
    note: {
      en: "Subscriptions and discounts do not apply to card payment. Business trips still need the NS Business Card for invoicing. Sources disagree on the future of the OV-chipkaart.",
      es: "Las suscripciones y descuentos no aplican al pago con tarjeta. Los viajes de negocios siguen necesitando la NS Business Card para facturar. Las fuentes no coinciden sobre el futuro de la OV-chipkaart.",
    },
    tier: "reportado",
    source: { title: "DutchReview: check in with your phone or bank card on Dutch public transport", url: "https://dutchreview.com/news/as-of-today-you-can-check-into-dutch-public-transport-with-your-phone-or-bank-card" },
  },
  paris: {
    country: "FR",
    city: { en: "Paris", es: "París" },
    system: { en: "RATP and Île-de-France Mobilités: metro and buses", es: "RATP e Île-de-France Mobilités: metro y buses" },
    physicalCard: { en: "Navigo Easy card, or the IDFM and Bonjour RATP apps", es: "Tarjeta Navigo Easy, o las apps IDFM y Bonjour RATP" },
    bankCard: "partial",
    bankCardNote: {
      en: "Buses: since November 2025 a bank card buys a single €2.50 ticket at bus-door terminals, valid only for that journey; coverage was still growing. Metro: a bank-card entry is starting line by line (Orly line 14 from 30 June 2026, Montmartre funicular from 8 July 2026), with the whole network planned by 2030. Card fares cost about €0.80 more.",
      es: "Buses: desde noviembre de 2025 una tarjeta bancaria compra un boleto sencillo de 2,50 € en las terminales de la puerta del bus, válido solo para ese trayecto; la cobertura seguía creciendo. Metro: la entrada con tarjeta bancaria empieza línea por línea (línea 14 en Orly desde el 30 de junio de 2026 y el funicular de Montmartre desde el 8 de julio de 2026), con toda la red prevista para 2030. El pago con tarjeta cuesta unos 0,80 € más.",
    },
    note: {
      en: "Reports conflict on trams and the RER; no announcement was found for them. Check the IDFM site before travelling.",
      es: "Las fuentes no coinciden sobre tranvías y RER; no se encontró anuncio para ellos. Revisar el sitio de IDFM antes de viajar.",
    },
    tier: "reportado",
    source: { title: "The Local France: Paris metro to begin using bank card entry payments (June 2026)", url: "https://www.thelocal.fr/20260612/paris-metro-to-begin-using-bank-card-entry-payments" },
  },
  istanbul: {
    country: "TR",
    city: { en: "Istanbul", es: "Estambul" },
    system: { en: "Metro, tram, bus, ferries (Istanbulkart network)", es: "Metro, tranvía, bus y ferries (red Istanbulkart)" },
    physicalCard: { en: "Istanbulkart (reloadable, anonymous version for visitors), or the Istanbulkart app", es: "Istanbulkart (recargable; versión anónima para visitantes), o la app Istanbulkart" },
    bankCard: "partial",
    bankCardNote: {
      en: "Some guides say contactless bank cards work at most turnstiles, possibly at a higher fare; a 2023 agreement with Mastercard was meant to let foreign cards pay. A forum reports that Marmaray does not accept cards. Coverage is inconsistent.",
      es: "Algunas guías dicen que las tarjetas bancarias contactless funcionan en la mayoría de torniquetes, posiblemente con una tarifa mayor; un acuerdo de 2023 con Mastercard buscaba que las tarjetas extranjeras paguen. Un foro dice que Marmaray no acepta tarjetas. La cobertura es irregular.",
    },
    note: {
      en: "Each traveller should carry their own card. The Istanbulkart works with the phone app too. Dolmuş minibuses are outside the card.",
      es: "Cada viajero debe llevar su propia tarjeta. La Istanbulkart también funciona con la app del teléfono. Los dolmuş quedan fuera de la tarjeta.",
    },
    tier: "reportado",
    source: { title: "Hispanatolia: Istanbul to accept credit cards for public transport (2023)", url: "https://hispanatolia.com/en/istanbul-to-accept-credit-cards-to-pay-for-public-transport/" },
  },
  hong_kong: {
    // Hong Kong is not a country in the catalogue; it is filed under China with the city named.
    country: "CN",
    city: { en: "Hong Kong (Special Administrative Region)", es: "Hong Kong (Región Administrativa Especial)" },
    system: { en: "MTR and most buses, minibuses and shops", es: "MTR y la mayoría de buses, minibuses y tiendas" },
    physicalCard: { en: "Octopus card (visitor card or the Octopus in a phone wallet)", es: "Tarjeta Octopus (de visitante o la Octopus en la billetera del teléfono)" },
    bankCard: "partial",
    bankCardNote: {
      en: "A travel comparison says contactless bank cards work at MTR gates, but Octopus is still needed on minibuses and at many food stalls. Official confirmation was not found.",
      es: "Una comparación de viajes dice que las tarjetas bancarias contactless funcionan en los torniquetes del MTR, pero la Octopus sigue siendo necesaria en minibuses y en muchos puestos de comida. No se encontró confirmación oficial.",
    },
    note: {
      en: "The Octopus can be added to Apple Wallet or Google Wallet. Sources disagree on which cards can top it up; check on arrival. The tourist app is iPhone-only.",
      es: "La Octopus se puede agregar a Apple Wallet o Google Wallet. Las fuentes no coinciden sobre qué tarjetas la recargan; revisar al llegar. La app para turistas es solo para iPhone.",
    },
    tier: "reportado",
    source: { title: "Bento Travel: Octopus for tourists vs Alipay HK", url: "https://www.bento.travel/compare/hong-kong/octopus-for-tourists-hk-vs-alipayhk-hk" },
  },
  tokyo: {
    country: "JP",
    city: { en: "Tokyo", es: "Tokio" },
    system: { en: "JR East, Tokyo Metro, private rail and buses", es: "JR East, Tokyo Metro, ferrocarriles privados y buses" },
    physicalCard: { en: "Suica or PASMO IC card, bought at station machines", es: "Tarjeta IC Suica o PASMO, comprada en las máquinas de la estación" },
    bankCard: "unverified",
    bankCardNote: {
      en: "The sources conflict. A May 2026 guide says contactless credit cards do not work at train gates; a 2023 article reports rail companies rolling out gates that accept cards. Check with the operator before relying on a card.",
      es: "Las fuentes no coinciden. Una guía de mayo de 2026 dice que las tarjetas de crédito contactless no funcionan en los torniquetes; un artículo de 2023 reporta que las empresas de tren instalan torniquetes que sí aceptan tarjetas. Confirmar con el operador antes de depender de una tarjeta.",
    },
    note: {
      en: "Suica and PASMO work interchangeably across Japan. Tourist versions and chip supply were reported in 2023; check current availability. Apple Pay for transit was not covered.",
      es: "Suica y PASMO funcionan indistintamente en todo Japón. Las versiones para turistas y el suministro de chips se reportaron en 2023; revisar la disponibilidad actual. Apple Pay para transporte no quedó cubierto.",
    },
    tier: "reportado",
    source: { title: "Japan Travel: how to get a Suica card", url: "https://en.japantravel.com/guide/how-to-get-a-suica-card/22316" },
  },
  seoul: {
    country: "KR",
    city: { en: "Seoul", es: "Seúl" },
    system: { en: "Seoul subway and buses (T-money network)", es: "Metro y buses de Seúl (red T-money)" },
    physicalCard: { en: "T-money card, or WOWPASS (a visitor card with a Visa prepaid card)", es: "Tarjeta T-money, o WOWPASS (tarjeta para visitantes con tarjeta prepagada Visa)" },
    bankCard: "no",
    bankCardNote: {
      en: "Travel blogs say foreign Visa and Amex cards do not work on subways or buses; only Korean-issued contactless cards do. Official confirmation was not found.",
      es: "Blogs de viaje dicen que las Visa y Amex extranjeras no funcionan en metro ni buses; solo las tarjetas contactless emitidas en Corea. No se encontró confirmación oficial.",
    },
    note: {
      en: "T-money needs no Korean ID or phone number. Android users can add it to Samsung Wallet; iPhone support was reported as limited. Top-up methods conflict between sources.",
      es: "La T-money no pide identificación ni número coreano. Los usuarios de Android pueden agregarla a Samsung Wallet; el soporte en iPhone se reporta limitado. Los métodos de recarga difieren entre fuentes.",
    },
    tier: "reportado",
    source: { title: "Seoul Tourism Organization: T-money card guide", url: "https://www.seoultourism.org/t-money-card-guide/" },
  },
  taipei: {
    country: "TW",
    city: { en: "Taipei", es: "Taipéi" },
    system: { en: "Taipei MRT", es: "MRT de Taipéi" },
    physicalCard: { en: "EasyCard still available; not needed for bank-card entry", es: "La EasyCard sigue disponible; no hace falta para entrar con tarjeta bancaria" },
    bankCard: "yes",
    bankCardNote: {
      en: "Station gates accept contactless credit cards (domestic and foreign: Visa, Mastercard, JCB, Discover, Diners Club) and mobile wallets, per the operator as reported in June 2026. iPhone users can enable Express Mode in Wallet.",
      es: "Los torniquetes de las estaciones aceptan tarjetas de crédito contactless (nacionales y extranjeras: Visa, Mastercard, JCB, Discover, Diners Club) y billeteras móviles, según el operador, reportado en junio de 2026. Los usuarios de iPhone pueden activar el Modo Express en Wallet.",
    },
    note: {
      en: "One recent source; confirm with Taipei Rapid Transit before travelling. The Taoyuan airport line is run by another operator.",
      es: "Una sola fuente reciente; confirmar con Taipei Rapid Transit antes de viajar. La línea del aeropuerto de Taoyuan la opera otra empresa.",
    },
    tier: "reportado",
    source: { title: "Taipei Times: Taipei MRT gates accept tap payment without EasyCard (June 2026)", url: "https://www.taipeitimes.com/News/taiwan/archives/2026/06/30/2003860007" },
  },
  dubai: {
    country: "AE",
    city: { en: "Dubai", es: "Dubái" },
    system: { en: "RTA: metro, tram, buses, water buses", es: "RTA: metro, tranvía, buses, lanchas" },
    physicalCard: { en: "Nol card (also in the nolPay app on a phone)", es: "Tarjeta Nol (también en la app nolPay en el teléfono)" },
    bankCard: "unverified",
    bankCardNote: {
      en: "No open-loop tap-to-ride launch was confirmed. A 2021 RTA–Visa agreement was a plan, and the co-branded Nol bank cards are a different product. Check RTA before travelling.",
      es: "No se confirmó un lanzamiento de pago abierto con tarjeta bancaria. Un acuerdo de 2021 entre RTA y Visa fue un plan, y las tarjetas Nol co-marcadas son otro producto. Revisar RTA antes de viajar.",
    },
    note: {
      en: "Sources are from 2010–2012 and 2021 plus one 2025 blog. Nol cards work on the metro, buses, tram and water buses.",
      es: "Las fuentes son de 2010–2012 y 2021, más un blog de 2025. Las tarjetas Nol funcionan en metro, buses, tranvía y lanchas.",
    },
    tier: "reportado",
    source: { title: "Gulf News: Dubai RTA and Visa collaborate on digital transport payments", url: "https://gulfnews.com/uae/transport/dubais-rta-and-visa-collaborate-to-improve-digital-payments-for-public-transport-1.78822383" },
  },
};

function main() {
  const countries = (JSON.parse(readFileSync(join(ROOT, "data/world/countries.json"), "utf8")) as { countries: { iso: string }[] }).countries;
  const known = new Set(countries.map((c) => c.iso));
  for (const [id, s] of Object.entries(SYSTEMS)) {
    if (!known.has(s.country)) throw new Error(`${id}: ${s.country} is not in countries.json`);
    if (!s.source.url.startsWith("https://")) throw new Error(`${id}: source is not https`);
  }
  writeFileSync(OUT, JSON.stringify({
    source: {
      retrieved: DATE,
      method:
        "One entry per transit system or national network, for visitors. 'oficial' only when the operator's own page supports the claim; press, guides and forums are 'reportado'. " +
        "bankCard says whether a contactless bank card works at the gates: yes, partial, no, or unverified. A country without an entry has no verified transit data.",
    },
    systems: SYSTEMS,
  }, null, 2) + "\n");
  const byBank: Record<string, number> = {};
  for (const s of Object.values(SYSTEMS)) byBank[s.bankCard] = (byBank[s.bankCard] ?? 0) + 1;
  console.log(`systems: ${Object.keys(SYSTEMS).length}`, byBank);
}

main();
