import { NextRequest, NextResponse } from "next/server";
import { generateJSON } from "@/lib/gemini";
import type { HeritageContent, RecipeIngredient } from "@/lib/types";
import cultureSeed from "@/data/heritage_culture_full_content_seed.json";

export const runtime = "nodejs";

type CategoryId = "recipe" | "tale" | "history" | "proverb";

type CultureSeed = (typeof cultureSeed.cultures)[number];
type SeedRecipe = CultureSeed["recipes"][number];
type SeedEntry =
  | SeedRecipe
  | CultureSeed["myths_tales"][number]
  | CultureSeed["histories"][number]
  | CultureSeed["songs_proverbs"][number];

const HERITAGE_TO_CULTURE_ID: Record<string, string> = {
  "kiche maya": "kiche_maya",
  "quechua": "quechua",
  "navajo": "navajo_dine",
  "hawaiian": "hawaiian",
  "cherokee": "cherokee",
  "ainu": "ainu",
  "yiddish": "yiddish",
  "ladino": "ladino_sephardic",
  "scottish gaelic": "scottish_gaelic",
  "welsh": "welsh",
  "cornish": "cornish",
  "maori": "maori",
  "sami southern": "southern_sami",
  "guarani": "guarani",
  "inuktitut": "inuktitut",
  "breton": "breton",
};

/**
 * Generates Roots lessons only from the checked-in culture seed JSON. Gemini is
 * used to translate/adapt the selected source card into the UI shape, not to
 * invent cultural content.
 */
export async function POST(req: NextRequest) {
  try {
    const { kind, categoryId, heritage, mainstream, seed } = await req.json();
    if (!kind || !categoryId || !heritage || !mainstream) {
      return NextResponse.json(
        { error: "kind, categoryId, heritage, and mainstream are required." },
        { status: 400 }
      );
    }

    const category = normalizeCategory(categoryId);
    const culture = findCulture(heritage);
    if (!category || !culture) {
      return NextResponse.json(
        { error: "No seed culture data is available for this Roots request." },
        { status: 404 }
      );
    }

    const source = chooseSourceCard(culture, category, seed || "");
    if (!source) {
      return NextResponse.json(
        { error: "No seed content card is available for this Roots category." },
        { status: 404 }
      );
    }

    const content = await generateJSON<HeritageContent>({
      system:
        "You transform a provided cultural seed card into a beginner language-learning lesson. " +
        "Use only SOURCE_CARD for cultural facts, names, ingredients, plot points, historical claims, and notes. " +
        "Do not invent new cultural content. You may translate, simplify wording, create short quizzes, and create learner-friendly phrasing from the source.",
      prompt:
        `Language: ${heritage}\n` +
        `Learner language: ${mainstream}\n` +
        `Category: ${category}\n` +
        `Requested lesson kind: ${kind}\n` +
        (seed ? `Learner request: ${seed}\n` : "") +
        `Culture sensitivity notes: ${JSON.stringify(culture.sensitivity_notes ?? [])}\n` +
        `SOURCE_CARD:\n${JSON.stringify(source, null, 2)}\n\n` +
        `Respond as JSON:\n` +
        `{\n` +
        `  "title": "a short title in ${mainstream} based on SOURCE_CARD",\n` +
        `  "heritage": "4-8 short beginner lines in ${heritage}, translated/adapted only from SOURCE_CARD",\n` +
        `  "translation": "line-for-line translation in ${mainstream}, same number of lines",\n` +
        `  "vocab": [ { "heritage": "a word from the lesson in ${heritage}", "meaning": "meaning in ${mainstream}" } ],\n` +
        `  "quiz": [ { "question": "question answerable only from SOURCE_CARD", "options": ["a","b","c"], "answer": 0 } ],\n` +
        `  "recipeGame": {\n` +
        `    "dish": "recipe name in ${mainstream}",\n` +
        `    "completeEmoji": "one food emoji for the finished dish",\n` +
        `    "ingredients": [ { "heritage": "ingredient word in ${heritage}", "meaning": "ingredient from SOURCE_CARD in ${mainstream}", "emoji": "ingredient emoji" } ],\n` +
        `    "decoys": [ { "heritage": "decoy ingredient word in ${heritage}", "meaning": "decoy ingredient from seed data in ${mainstream}", "emoji": "ingredient emoji" } ]\n` +
        `  }\n` +
        `}\n` +
        `If category is not recipe, omit recipeGame. Include 5 vocab items and 3 quiz questions. ` +
        `For recipes, use only SOURCE_CARD ingredients for correct recipeGame ingredients.`,
      temperature: 0.35,
      maxOutputTokens: 2048,
    });

    if (category === "recipe") {
      content.recipeGame = buildRecipeGame(
        source as SeedRecipe,
        culture,
        content.recipeGame
      );
    } else {
      delete content.recipeGame;
    }

    return NextResponse.json(content);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error.";
    console.error("[/api/heritage]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function normalizeCategory(value: unknown): CategoryId | null {
  if (value === "recipe" || value === "tale" || value === "history" || value === "proverb") {
    return value;
  }
  return null;
}

function findCulture(heritage: string): CultureSeed | undefined {
  const key = normalizeName(heritage);
  const cultureId = HERITAGE_TO_CULTURE_ID[key];
  if (cultureId) return cultureSeed.cultures.find((culture) => culture.id === cultureId);

  return cultureSeed.cultures.find((culture) => {
    const english = normalizeName(culture.language.english);
    const autonym = normalizeName(culture.language.autonym || "");
    return english.includes(key) || key.includes(english) || Boolean(autonym && key.includes(autonym));
  });
}

function normalizeName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function chooseSourceCard(
  culture: CultureSeed,
  category: CategoryId,
  seed: string
): SeedEntry | undefined {
  const entries = entriesForCategory(culture, category);
  if (entries.length === 0) return undefined;

  const seedWords = normalizeName(seed)
    .split(" ")
    .filter((word) => word.length > 2);

  if (seedWords.length > 0) {
    const scored = entries
      .map((entry) => ({
        entry,
        score: seedWords.reduce((total, word) => {
          const haystack = normalizeName(JSON.stringify(entry));
          return total + (haystack.includes(word) ? 1 : 0);
        }, 0),
      }))
      .sort((a, b) => b.score - a.score);

    if (scored[0]?.score > 0) return scored[0].entry;
  }

  return entries[hash(`${culture.id}:${category}:${seed}`) % entries.length];
}

function entriesForCategory(culture: CultureSeed, category: CategoryId): SeedEntry[] {
  if (category === "recipe") return culture.recipes;
  if (category === "tale") return culture.myths_tales;
  if (category === "history") return culture.histories;
  return culture.songs_proverbs;
}

function hash(value: string) {
  let result = 0;
  for (let i = 0; i < value.length; i += 1) {
    result = (result * 31 + value.charCodeAt(i)) >>> 0;
  }
  return result;
}

function buildRecipeGame(
  source: SeedRecipe,
  culture: CultureSeed,
  generated?: HeritageContent["recipeGame"]
): HeritageContent["recipeGame"] {
  const ingredients = source.ingredients.slice(0, 4).map((meaning, index) => ({
    heritage: generated?.ingredients?.[index]?.heritage || meaning,
    meaning,
    emoji: generated?.ingredients?.[index]?.emoji || emojiForIngredient(meaning),
  }));

  const sourceIngredientSet = new Set(source.ingredients.map((item) => item.toLowerCase()));
  const decoyMeanings = culture.recipes
    .flatMap((recipe) => recipe.ingredients)
    .filter((ingredient, index, all) => {
      const lower = ingredient.toLowerCase();
      return !sourceIngredientSet.has(lower) && all.findIndex((item) => item.toLowerCase() === lower) === index;
    })
    .slice(0, 3);

  const decoys: RecipeIngredient[] = decoyMeanings.map((meaning, index) => ({
    heritage: generated?.decoys?.[index]?.heritage || meaning,
    meaning,
    emoji: generated?.decoys?.[index]?.emoji || emojiForIngredient(meaning),
  }));

  return {
    dish: source.name,
    completeEmoji: generated?.completeEmoji || "🍲",
    ingredients,
    decoys,
  };
}

function emojiForIngredient(meaning: string) {
  const lower = meaning.toLowerCase();
  if (lower.includes("potato")) return "🥔";
  if (lower.includes("carrot")) return "🥕";
  if (lower.includes("onion")) return "🧅";
  if (lower.includes("meat") || lower.includes("beef") || lower.includes("lamb") || lower.includes("chicken") || lower.includes("turkey")) return "🥩";
  if (lower.includes("corn") || lower.includes("maize")) return "🌽";
  if (lower.includes("bean")) return "🫘";
  if (lower.includes("tomato") || lower.includes("tomatillo")) return "🍅";
  if (lower.includes("rice")) return "🍚";
  if (lower.includes("water") || lower.includes("milk")) return "💧";
  if (lower.includes("seed")) return "🌰";
  if (lower.includes("chili") || lower.includes("chile")) return "🌶️";
  if (lower.includes("leaf") || lower.includes("herb") || lower.includes("cilantro")) return "🌿";
  return "🥣";
}
