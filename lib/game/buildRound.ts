// lib/game/buildRound.ts
// Перетворює рядок пісні на раунд гри: розбиває на слова, обирає, які сховати,
// і (для режиму "Вставити слова") збирає банк слів із хибними словами-манками.
// Тут використовується Math.random, тому викликати це треба в обробниках подій,
// а не під час рендера (інакше сервер і браузер "розійдуться").

import {
  HIDE_RATIO,
  type BankItem,
  type Difficulty,
  type GameSettings,
  type Language,
  type Round,
  type WordToken,
} from "@/types/game";

// ---------------------------------------------------------------------------
// Токенізація
// ---------------------------------------------------------------------------

// Розділяє "(Don't," на: пунктуація перед = "(", слово = "Don't", пунктуація після = ",".
// Усередині слова лишаються апострофи та символи цензури: f*ck, sh*t, f#ck.
const WORD_PARTS = /^([^\p{L}\p{N}]*)(.*?)([^\p{L}\p{N}]*)$/su;

export function tokenizeLine(text: string): WordToken[] {
  return text
    .split(/\s+/)
    .filter(Boolean)
    .map((raw, id) => {
      const match = raw.match(WORD_PARTS);
      return {
        id,
        raw,
        leading: match?.[1] ?? "",
        core: match?.[2] ?? raw,
        trailing: match?.[3] ?? "",
        hidden: false,
      };
    });
}

/** Ховати можна лише слова, що починаються з літери (не "***", не "2am"). */
export function isHideable(token: WordToken): boolean {
  return /^\p{L}/u.test(token.core);
}

export function countHideableWords(text: string): number {
  return tokenizeLine(text).filter(isHideable).length;
}

// ---------------------------------------------------------------------------
// Порівняння
// ---------------------------------------------------------------------------

/**
 * Нормалізує літеру для порівняння. Для латиниці прибирає діакритику (é -> e, ñ -> n, ą -> a),
 * тож гравець може натиснути просту "e" замість "é". Кирилицю не чіпаємо: й ≠ и, ї ≠ і.
 */
export function normalizeLetter(letter: string): string {
  const lower = letter.toLowerCase();
  if (/\p{Script=Latin}/u.test(lower)) {
    return lower.normalize("NFD").replace(/\p{M}/gu, "");
  }
  return lower;
}

/** Чи збігаються слова (без урахування регістру). */
export function sameWord(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

/** Перша літера слова — та, яку має натиснути гравець. */
export function firstLetterOf(token: WordToken): string {
  return Array.from(token.core)[0] ?? "";
}

// Літери для екранної клавіатури (режим "Майстер перших літер")
const LATIN = "abcdefghijklmnopqrstuvwxyz".split("");
export const ALPHABETS: Record<Language, string[]> = {
  en: LATIN,
  es: LATIN, // ñ нормалізується до n
  pl: [...LATIN, "ł"], // ł не розкладається на l, тому окрема клавіша
  uk: "абвгґдеєжзиіїйклмнопрстуфхцчшщьюя".split(""),
};

// ---------------------------------------------------------------------------
// Вибір прихованих слів
// ---------------------------------------------------------------------------

function shuffle<T>(items: readonly T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/**
 * Обирає id слів, які будуть сховані.
 *  - hard:   100% слів
 *  - easy:   15% — беремо НАЙДОВШІ слова (їх легше вгадати з контексту)
 *  - medium: 35% — випадкові слова
 * Завжди ховаємо хоча б одне слово.
 */
export function pickHiddenIds(tokens: WordToken[], difficulty: Difficulty): Set<number> {
  const candidates = tokens.filter(isHideable);
  const ratio = HIDE_RATIO[difficulty];

  if (ratio >= 1) return new Set(candidates.map((t) => t.id));

  const count = Math.min(candidates.length, Math.max(1, Math.round(candidates.length * ratio)));

  const ordered =
    difficulty === "easy"
      ? shuffle(candidates).sort((a, b) => b.core.length - a.core.length) // shuffle — щоб рівні за довжиною обиралися випадково
      : shuffle(candidates);

  return new Set(ordered.slice(0, count).map((t) => t.id));
}

// ---------------------------------------------------------------------------
// Банк слів і хибні слова-манки
// ---------------------------------------------------------------------------

/** Унікальні слова з усіх рядків — з них беремо манки. */
export function buildWordPool(texts: string[]): string[] {
  const unique = new Map<string, string>();
  for (const text of texts) {
    for (const token of tokenizeLine(text)) {
      if (isHideable(token) && token.core.length >= 3) {
        unique.set(token.core.toLowerCase(), token.core);
      }
    }
  }
  return [...unique.values()];
}

function pickDistractors(pool: string[], lineText: string, count: number): string[] {
  // Манок не повинен співпадати зі словом, яке вже є в цьому рядку — інакше буде неоднозначність
  const inLine = new Set(tokenizeLine(lineText).map((t) => t.core.toLowerCase()));
  return shuffle(pool.filter((word) => !inLine.has(word.toLowerCase()))).slice(0, count);
}

// ---------------------------------------------------------------------------
// Збірка раунду
// ---------------------------------------------------------------------------

export function buildRound(
  lineIndex: number,
  lineText: string,
  settings: GameSettings,
  wordPool: string[],
): Round {
  const baseTokens = tokenizeLine(lineText);

  // УВАГА (змінюється в одному місці): у режимі "Майстер перших літер" за специфікацією
  // рядок "повністю закритий", а за рівнем складності — ховається лише частина.
  // Тут рівень складності діє в обох режимах (Hard = рядок закритий повністю).
  // Щоб у першому режимі завжди ховати 100% — заміни settings.difficulty на "hard" у рядку нижче.
  const hiddenIds = pickHiddenIds(baseTokens, settings.difficulty);

  const tokens = baseTokens.map((t) => ({ ...t, hidden: hiddenIds.has(t.id) }));

  let bank: BankItem[] = [];
  if (settings.mode === "fill-blanks") {
    const real: BankItem[] = tokens
      .filter((t) => t.hidden)
      .map((t) => ({ id: `word-${t.id}`, text: t.core, used: false, isDistractor: false }));

    const distractorCount = 2 + Math.floor(Math.random() * 2); // 2 або 3
    const fake: BankItem[] = pickDistractors(wordPool, lineText, distractorCount).map(
      (text, i) => ({ id: `fake-${i}`, text, used: false, isDistractor: true }),
    );

    bank = shuffle([...real, ...fake]);
  }

  return { lineIndex, tokens, bank, filledIds: [] };
}
