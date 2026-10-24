// lib/game/buildRound.ts
// Converts a song line into a game round: tokenizes it, chooses hidden words,
// and builds a word bank with distractors for fill-in-the-blanks mode.
// This uses Math.random, so call it in event handlers rather than during render
// to keep server and browser output consistent.

import {
  HIDE_RATIO,
  type BankItem,
  type Difficulty,
  type GameSettings,
  type Round,
  type WordToken,
} from "@/types/game";

// ---------------------------------------------------------------------------
// Tokenization.
// ---------------------------------------------------------------------------

// Splits "(Don't," into leading punctuation, the word itself, and trailing punctuation.
// Apostrophes and censor symbols inside words are preserved: f*ck, sh*t, f#ck.
// Tokens are split on whitespace above, so dotAll is unnecessary here.
const WORD_PARTS = /^([^\p{L}\p{N}]*)(.*?)([^\p{L}\p{N}]*)$/u;

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

/** Only hide words that start with a letter, not tokens such as "***" or "2am". */
export function isHideable(token: WordToken): boolean {
  return /^\p{L}/u.test(token.core);
}

export function countHideableWords(text: string): number {
  return tokenizeLine(text).filter(isHideable).length;
}

// ---------------------------------------------------------------------------
// Comparisons.
// ---------------------------------------------------------------------------

/**
 * Normalizes a letter for comparison. Latin diacritics are removed (é -> e, ñ -> n, ą -> a),
 * so a player can enter "e" instead of "é". Cyrillic letters remain distinct.
 */
export function normalizeLetter(letter: string): string {
  const lower = letter.toLowerCase();
  if (/\p{Script=Latin}/u.test(lower)) {
    return lower.normalize("NFD").replace(/\p{M}/gu, "");
  }
  return lower;
}

/** Checks whether two words match, ignoring case. */
export function sameWord(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

/** Returns the first letter the player must enter. */
export function firstLetterOf(token: WordToken): string {
  return Array.from(token.core)[0] ?? "";
}

// ---------------------------------------------------------------------------
// Choosing hidden words.
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
 * Selects the word IDs to hide.
 * - hard: all words
 * - easy: 15%, prioritizing the longest words
 * - medium: 35%, chosen at random
 * At least one word is always hidden.
 */
export function pickHiddenIds(tokens: WordToken[], difficulty: Difficulty): Set<number> {
  const candidates = tokens.filter(isHideable);
  const ratio = HIDE_RATIO[difficulty];

  if (ratio >= 1) return new Set(candidates.map((t) => t.id));

  const count = Math.min(candidates.length, Math.max(1, Math.round(candidates.length * ratio)));

  const ordered =
    difficulty === "easy"
      ? shuffle(candidates).sort((a, b) => b.core.length - a.core.length) // Shuffle so ties are selected randomly.
      : shuffle(candidates);

  return new Set(ordered.slice(0, count).map((t) => t.id));
}

// ---------------------------------------------------------------------------
// Word bank and distractors.
// ---------------------------------------------------------------------------

/** Collects unique words from all lines to use as distractors. */
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
  // Avoid distractors that already appear in the line to prevent ambiguity.
  const inLine = new Set(tokenizeLine(lineText).map((t) => t.core.toLowerCase()));
  return shuffle(pool.filter((word) => !inLine.has(word.toLowerCase()))).slice(0, count);
}

// ---------------------------------------------------------------------------
// Building a round.
// ---------------------------------------------------------------------------

export function buildRound(
  lineIndex: number,
  lineText: string,
  settings: GameSettings,
  wordPool: string[],
): Round {
  const baseTokens = tokenizeLine(lineText);

  // Difficulty applies to both modes. Hard hides every word.
  const hiddenIds = pickHiddenIds(baseTokens, settings.difficulty);

  const tokens = baseTokens.map((t) => ({ ...t, hidden: hiddenIds.has(t.id) }));

  let bank: BankItem[] = [];
  if (settings.mode === "fill-blanks") {
    const real: BankItem[] = tokens
      .filter((t) => t.hidden)
      .map((t) => ({ id: `word-${t.id}`, text: t.core, used: false, isDistractor: false }));

    const distractorCount = 2 + Math.floor(Math.random() * 2); // Two or three distractors.
    const fake: BankItem[] = pickDistractors(wordPool, lineText, distractorCount).map(
      (text, i) => ({ id: `fake-${i}`, text, used: false, isDistractor: true }),
    );

    bank = shuffle([...real, ...fake]);
  }

  return { lineIndex, tokens, bank, filledIds: [], revealedIds: [] };
}
