// types/game.ts
// Усі типи й константи, спільні для мов, гри та API.

// ============================== МОВИ ==============================

// "uk" — це ISO-код української (на кнопках показуємо "UA")
export const LANGUAGE_CODES = ["uk", "en", "pl", "es"] as const;
export type Language = (typeof LANGUAGE_CODES)[number];

export type LanguageInfo = {
  code: Language;
  label: string; // коротка позначка для UI: UA, EN, PL, ES
  nativeName: string; // як мова називає сама себе
  englishName: string; // англійською — підставляємо в промпт для Gemini
};

export const LANGUAGES: Record<Language, LanguageInfo> = {
  uk: { code: "uk", label: "UA", nativeName: "Українська", englishName: "Ukrainian" },
  en: { code: "en", label: "EN", nativeName: "English", englishName: "English" },
  pl: { code: "pl", label: "PL", nativeName: "Polski", englishName: "Polish" },
  es: { code: "es", label: "ES", nativeName: "Español", englishName: "Spanish" },
};

/** Type guard: перевіряє, що довільне значення (наприклад, із запиту) — підтримувана мова. */
export function isLanguage(value: unknown): value is Language {
  return typeof value === "string" && (LANGUAGE_CODES as readonly string[]).includes(value);
}

/** Три незалежні налаштування мов (див. LanguageContext). */
export type LanguageSettings = {
  uiLanguage: Language; // мова інтерфейсу
  targetLanguage: Language; // мова пояснень і перекладу (їх генерує Gemini)
  sourceLanguage: Language; // мова пісні
};

// ============================== СКЛАДНІСТЬ ==============================

export type Difficulty = "easy" | "medium" | "hard";
export const DIFFICULTIES: readonly Difficulty[] = ["easy", "medium", "hard"];

/** Яку частку слів у рядку ховаємо. */
export const HIDE_RATIO: Record<Difficulty, number> = {
  easy: 0.15,
  medium: 0.35,
  hard: 1,
};

// ============================== ГРА ==============================

export type GameModeId = "fill-blanks" | "first-letter";
export type GamePhase = "setup" | "playing" | "finished";

export type GameSettings = {
  mode: GameModeId;
  difficulty: Difficulty;
};

/** Множник очок: 1x, 1.5x або 2x залежно від серії. */
export type Multiplier = 1 | 1.5 | 2;

export interface GameState {
  score: number;
  streak: number; // правильних відповідей поспіль
  maxStreak: number;
  multiplier: Multiplier;
  correct: number; // усього правильних
  mistakes: number; // усього помилок
}

export type GameAction = { type: "correct" } | { type: "wrong" } | { type: "reset" };

/** Одне слово рядка. Пунктуацію (leading/trailing) відділяємо від самого слова (core). */
export interface WordToken {
  id: number;
  raw: string; // як у тексті: "(Don't,"
  leading: string; // пунктуація перед словом: "("
  core: string; // саме слово: "Don't"  (апострофи й символи цензури всередині лишаються)
  trailing: string; // пунктуація після слова: ","
  hidden: boolean; // чи сховане в цьому раунді
}

/** Кнопка в банку слів. */
export interface BankItem {
  id: string;
  text: string;
  used: boolean; // уже вставлене в пропуск
  isDistractor: boolean; // хибне слово-манок
}

/** Один раунд = один рядок пісні. */
export interface Round {
  lineIndex: number; // індекс у масиві lines
  tokens: WordToken[];
  bank: BankItem[]; // порожній у режимі first-letter
  filledIds: number[]; // id вже відкритих слів
}
