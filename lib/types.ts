/** Shared types for API responses. */

export interface TranslateResult {
  /** The translated text in the target language. */
  translation: string;
  /** Romanized / phonetic spelling so a non-literate user can sound it out. */
  phonetic: string;
  /** A simple usage note or cultural tip, in the user's stronger language. */
  note?: string;
}

export interface Phrase {
  /** What this phrase is for, in the mainstream language. */
  situation: string;
  /** The phrase in the mainstream language. */
  mainstream: string;
  /** The phrase in the heritage language. */
  heritage: string;
  /** Phonetic spelling of the heritage phrase. */
  phonetic: string;
}

export interface QuizQuestion {
  question: string;
  options: string[];
  /** Index into options. */
  answer: number;
}

export interface VocabItem {
  heritage: string;
  meaning: string;
}

export interface RecipeIngredient {
  heritage: string;
  meaning: string;
  emoji: string;
}

export interface RecipeGameData {
  dish: string;
  completeEmoji: string;
  ingredients: RecipeIngredient[];
  decoys: RecipeIngredient[];
}

export interface HeritageContent {
  title: string;
  /** The main content in the heritage language. */
  heritage: string;
  /** Line-for-line translation in the mainstream language. */
  translation: string;
  vocab: VocabItem[];
  quiz: QuizQuestion[];
  recipeGame?: RecipeGameData;
}

export interface JobMatch {
  title: string;
  /** Why this fits the person, written in their heritage language. */
  whyHeritage: string;
  /** Same explanation in the mainstream language. */
  whyMainstream: string;
  /** One concrete next step, in the heritage language. */
  nextStepHeritage: string;
}

export interface ResourceTip {
  /** Short tip title in the mainstream language. */
  title: string;
  /** Practical advice in the heritage language (2–3 sentences). */
  heritageAdvice: string;
  /** Same advice in the mainstream language. */
  mainstreamAdvice: string;
  /** A key phrase the person may need to say, in the heritage language. */
  phrase: string;
  /** Romanized phonetic spelling of that phrase. */
  phonetic: string;
}
