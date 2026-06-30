/**
 * Catalog of languages used in the app.
 *
 * `heritage` languages are the endangered / lesser-resourced "forgotten"
 * languages this app exists to serve. `mainstream` languages are the
 * high-resource languages a Bridge user wants to operate in (the language of
 * the nearby city, the job market, the hospital).
 *
 * `bcp47` is a best-effort tag for the browser Web Speech API (speech-to-text
 * and text-to-speech). Many endangered languages have no synthetic voice; in
 * those cases `bcp47` is null and the UI falls back gracefully to text only.
 */
export interface Language {
  code: string;
  name: string;
  /** Endonym — the language's name in its own tongue, when commonly written. */
  endonym?: string;
  region: string;
  /** BCP-47 tag for Web Speech, or null when no browser voice exists. */
  bcp47: string | null;
}

export const HERITAGE_LANGUAGES: Language[] = [
  { code: "quc", name: "K'iche' (Maya)", endonym: "Qatzijob'al", region: "Guatemala", bcp47: null },
  { code: "que", name: "Quechua", endonym: "Runa Simi", region: "Andes", bcp47: null },
  { code: "nv", name: "Navajo", endonym: "Diné Bizaad", region: "US Southwest", bcp47: null },
  { code: "haw", name: "Hawaiian", endonym: "ʻŌlelo Hawaiʻi", region: "Hawaiʻi", bcp47: null },
  { code: "chr", name: "Cherokee", endonym: "ᏣᎳᎩ", region: "US Southeast", bcp47: null },
  { code: "ain", name: "Ainu", endonym: "アイヌ・イタㇰ", region: "Japan", bcp47: null },
  { code: "yi", name: "Yiddish", endonym: "ייִדיש", region: "Diaspora", bcp47: "yi" },
  { code: "lad", name: "Ladino", endonym: "Djudeo-espanyol", region: "Mediterranean", bcp47: null },
  { code: "gd", name: "Scottish Gaelic", endonym: "Gàidhlig", region: "Scotland", bcp47: "gd" },
  { code: "cy", name: "Welsh", endonym: "Cymraeg", region: "Wales", bcp47: "cy" },
  { code: "kw", name: "Cornish", endonym: "Kernewek", region: "Cornwall", bcp47: null },
  { code: "mi", name: "Māori", endonym: "Te Reo Māori", region: "New Zealand", bcp47: "mi" },
  { code: "sma", name: "Sámi (Southern)", endonym: "Åarjelsaemien", region: "Sápmi", bcp47: null },
  { code: "gn", name: "Guaraní", endonym: "Avañe'ẽ", region: "Paraguay", bcp47: null },
  { code: "iu", name: "Inuktitut", endonym: "ᐃᓄᒃᑎᑐᑦ", region: "Arctic Canada", bcp47: null },
  { code: "br", name: "Breton", endonym: "Brezhoneg", region: "Brittany", bcp47: null },
];

export const MAINSTREAM_LANGUAGES: Language[] = [
  { code: "en", name: "English", region: "Global", bcp47: "en-US" },
  { code: "zh", name: "Mandarin Chinese", endonym: "中文", region: "China", bcp47: "zh-CN" },
  { code: "hi", name: "Hindi", endonym: "हिन्दी", region: "India", bcp47: "hi-IN" },
  { code: "es", name: "Spanish", endonym: "Español", region: "Global", bcp47: "es-ES" },
  { code: "ar", name: "Arabic", endonym: "العربية", region: "MENA", bcp47: "ar-SA" },
  { code: "fr", name: "French", endonym: "Français", region: "Global", bcp47: "fr-FR" },
  { code: "pt", name: "Portuguese", endonym: "Português", region: "Global", bcp47: "pt-BR" },
];

export function findLanguage(name: string): Language | undefined {
  return [...HERITAGE_LANGUAGES, ...MAINSTREAM_LANGUAGES].find(
    (l) => l.name === name
  );
}

/** Survival phrasebook topics for Bridge mode. Emoji double as low-literacy icons. */
export interface Topic {
  id: string;
  label: string;
  icon: string;
  /** Plain-language description of the situation, fed to the model. */
  situation: string;
}

export const TOPICS: Topic[] = [
  {
    id: "medical",
    label: "Doctor & Hospital",
    icon: "🏥",
    situation:
      "Going to a clinic or hospital: describing pain and symptoms, understanding a doctor, asking for medicine, emergencies.",
  },
  {
    id: "grocery",
    label: "Market & Shopping",
    icon: "🛒",
    situation:
      "Buying food and goods at a grocery store or market: asking prices, quantities, paying, finding items.",
  },
  {
    id: "legal",
    label: "Government & Legal",
    icon: "🏛️",
    situation:
      "Dealing with government offices, paperwork, ID, housing, and basic legal rights.",
  },
  {
    id: "transport",
    label: "Getting Around",
    icon: "🚌",
    situation:
      "Using buses, trains, and directions in a city: buying tickets, asking the way, reading signs.",
  },
  {
    id: "work",
    label: "Work & Jobs",
    icon: "🧰",
    situation:
      "Looking for and doing a job: interviews, instructions, safety, pay, and talking with coworkers.",
  },
  {
    id: "emergency",
    label: "Emergency & Safety",
    icon: "🚨",
    situation:
      "Urgent situations: calling for help, police, fire, accidents, telling someone you are lost or in danger.",
  },
];

/** Heritage (Roots) content categories. */
export interface HeritageCategory {
  id: string;
  label: string;
  icon: string;
  kind: string;
}

export const HERITAGE_CATEGORIES: HeritageCategory[] = [
  {
    id: "recipe",
    label: "Recipes",
    icon: "🍲",
    kind: "a traditional family recipe with a short story about when it is cooked",
  },
  {
    id: "tale",
    label: "Myths & Tales",
    icon: "🐉",
    kind: "a short folk tale, myth, or legend passed down by elders",
  },
  {
    id: "history",
    label: "History",
    icon: "📜",
    kind: "a short, vivid piece of the people's history or an important historical figure",
  },
  {
    id: "proverb",
    label: "Proverbs & Songs",
    icon: "🎶",
    kind: "a traditional proverb or the lyrics of a folk song, with its meaning",
  },
];
