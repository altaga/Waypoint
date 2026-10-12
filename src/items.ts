// Maps the words a traveler uses (Spanish or English) to terms that appear in the
// English rule text of the packs. Used to answer "can I bring X" with the matching rule.
const GROUPS: Record<string, { words: string[]; terms: string[] }> = {
  gum: { words: ["chicle", "chicles", "gum", "chewing gum"], terms: ["chewing gum", "gum"] },
  vape: { words: ["vape", "vapes", "vapeador", "vapeadores", "cigarro electronico", "cigarros electronicos", "e-cigarette", "e-cigarettes", "vaporizer", "vaporisers"], terms: ["vape", "e-cigarette", "vaporis", "vaporiz"] },
  meat: { words: ["carne", "carnes", "meat", "salchicha", "tocino", "jamon", "sausage", "ham", "bacon"], terms: ["meat", "sausage", "ham", "bacon"] },
  medicine: { words: ["medicina", "medicinas", "medicamento", "medicamentos", "medicine", "medicines", "medication", "pastillas", "pills"], terms: ["medicin", "medication", "medicine", "prescription"] },
  drugs: { words: ["droga", "drogas", "drug", "drugs", "marihuana", "mariguana", "cannabis"], terms: ["drug", "cannabis", "narcotic"] },
  alcohol: { words: ["alcohol", "licor", "vino", "cerveza", "beer", "wine"], terms: ["alcohol", "liquor"] },
  weapon: { words: ["arma", "armas", "weapon", "weapons", "cuchillo", "knife"], terms: ["weapon", "firearm", "knife"] },
  plants: { words: ["planta", "plantas", "plant", "plants", "flor", "flores", "flower", "flowers"], terms: ["plant", "flower", "wild animal"] },
  fruit: { words: ["fruta", "frutas", "fruit", "fruits"], terms: ["fruit"] },
};

/** English search terms for a free-text item, or the item itself when nothing is known. */
export function itemTerms(item: string): string[] {
  const q = item.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
  for (const g of Object.values(GROUPS)) {
    if (g.words.some((w) => w.normalize("NFD").replace(/[̀-ͯ]/g, "") === q)) return g.terms;
  }
  return q ? [q] : [];
}
