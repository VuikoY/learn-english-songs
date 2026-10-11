// types/game.ts
// Shared types and constants for languages, the game, and API routes.

// ============================== LANGUAGES ==============================

// Language codes follow ISO 639-1. Buttons display the matching short labels.
export const LANGUAGE_CODES = ["ru", "en", "pl", "es"] as const;
export type Language = (typeof LANGUAGE_CODES)[number];

export type LanguageInfo = {
  code: Language;
  label: string; // Short label displayed in the UI.
  nativeName: string; // Language name in that language.
  englishName: string; // English name used in Gemini prompts.
};

export const LANGUAGES: Record<Language, LanguageInfo> = {
  ru: { code: "ru", label: "RU", nativeName: "Русский", englishName: "Russian" },
  en: { code: "en", label: "EN", nativeName: "English", englishName: "English" },
  pl: { code: "pl", label: "PL", nativeName: "Polski", englishName: "Polish" },
  es: { code: "es", label: "ES", nativeName: "Español", englishName: "Spanish" },
};

/** Type guard that checks whether an arbitrary value is a supported language. */
export function isLanguage(value: unknown): value is Language {
  return typeof value === "string" && (LANGUAGE_CODES as readonly string[]).includes(value);
}

/** The three independent language preferences used by LanguageContext. */
export type LanguageSettings = {
  uiLanguage: Language; // Interface language.
  targetLanguage: Language; // Language used for explanations and translations.
  sourceLanguage: Language; // Language of the song.
};

// ============================== DIFFICULTY ==============================

export type Difficulty = "easy" | "medium" | "hard";
export const DIFFICULTIES: readonly Difficulty[] = ["easy", "medium", "hard"];

/** Proportion of words hidden in a line at each difficulty level. */
export const HIDE_RATIO: Record<Difficulty, number> = {
  easy: 0.15,
  medium: 0.35,
  hard: 1,
};

// ============================== GAME ==============================

export type GameModeId = "fill-blanks" | "first-letter";
export type GamePhase = "setup" | "playing" | "finished";

export type GameSettings = {
  mode: GameModeId;
  difficulty: Difficulty;
};

/** Score multiplier based on the current streak. */
export type Multiplier = 1 | 1.5 | 2;

export interface GameState {
  score: number;
  streak: number; // Consecutive correct answers.
  maxStreak: number;
  multiplier: Multiplier;
  correct: number; // Total correct answers.
  mistakes: number; // Total mistakes.
}

export type GameAction = { type: "correct" } | { type: "wrong" } | { type: "reset" };

/** A line token with punctuation separated from the word itself. */
export interface WordToken {
  id: number;
  raw: string; // Original token, for example "(Don't,".
  leading: string; // Punctuation before the word, for example "(".
  core: string; // Word content; internal apostrophes and censor symbols are preserved.
  trailing: string; // Punctuation after the word, for example ",".
  hidden: boolean; // Whether this token is hidden in the current round.
}

/** A selectable word-bank item. */
export interface BankItem {
  id: string;
  text: string;
  used: boolean; // Whether it has already filled a blank.
  isDistractor: boolean; // Whether it is a distractor.
}

/** One round corresponds to one song line. */
export interface Round {
  lineIndex: number; // Index in the lines array.
  tokens: WordToken[];
  bank: BankItem[]; // Empty in first-letter mode.
  filledIds: number[]; // IDs of words already revealed.
}
