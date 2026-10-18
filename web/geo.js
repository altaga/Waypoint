// Where the traveler is, in words. The position comes from the browser (only when the traveler asks) and stays in the
// browser: the page names the nearest city of web/world-cities.json and sends that name, never the coordinates.

const D = Math.PI / 180;

export function distanceKm(aLat, aLon, bLat, bLon) {
  const x = Math.sin(((bLat - aLat) * D) / 2) ** 2 + Math.cos(aLat * D) * Math.cos(bLat * D) * Math.sin(((bLon - aLon) * D) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(x));
}

/** The nearest city of the list: { id, name: {en, es}, iso, km }, or null when none lies within maxKm. */
export function nearestCity(lat, lon, cities, maxKm = 150) {
  let best = null;
  for (const [en, es, iso, cLat, cLon, id] of cities) {
    const km = distanceKm(lat, lon, cLat, cLon);
    if (km <= maxKm && (!best || km < best.km)) best = { id, name: { en: en.replace(/^Greater /, ""), es }, iso, km };
  }
  return best;
}

const round = (km) => (km < 10 ? Math.round(km) : Math.round(km / 5) * 5);

/** What Waypoint says once it knows where the traveler is. destName is the trip's destination, when there is a trip. */
export function whereLine(lang, near, destName) {
  const city = near ? near.name[lang === "es" ? "es" : "en"] : null;
  if (lang === "es") {
    if (!city) return `Veo tu ubicación, pero no hay una ciudad de mi lista cerca. ${destName ? `¿Reviso tu plan de ${destName} desde aquí?` : "¿Planeamos un viaje desde aquí?"}`;
    const km = near.km < 3 ? "" : ` (a unos ${round(near.km)} km)`;
    return `Veo que estás cerca de ${city}${km}. ${destName ? `¿Quieres que revise tu plan de ${destName} desde ahí?` : "¿Planeamos un viaje desde ahí?"}`;
  }
  if (!city) return `I can see your location, but no city of my list is near. ${destName ? `Shall I check your ${destName} plan from here?` : "Shall we plan a trip from here?"}`;
  const km = near.km < 3 ? "" : ` (about ${round(near.km)} km away)`;
  return `I see you're near ${city}${km}. ${destName ? `Want me to check your ${destName} plan from there?` : "Shall we plan a trip from there?"}`;
}

/** The request sent when the traveler says yes. It carries the city name only. */
export function fromHereRequest(lang, near, hasTrip) {
  const city = near ? near.name[lang === "es" ? "es" : "en"] : null;
  if (lang === "es") return city ? (hasTrip ? `Estoy en ${city} y saldré desde aquí. Revisa mi plan.` : `Estoy en ${city}. Quiero planear un viaje desde aquí.`) : "Revisa mi plan desde donde estoy.";
  return city ? (hasTrip ? `I'm in ${city} and I'll leave from here. Check my plan.` : `I'm in ${city}. I want to plan a trip from here.`) : "Check my plan from where I am.";
}
