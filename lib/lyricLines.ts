import type { LyricLine } from "@/lib/types";

const SHORT_LINE_WORD_LIMIT = 4;
const PREFERRED_MERGED_WORD_LIMIT = 7;
const INCOMPLETE_ENDINGS = new Set([
  "a", "an", "the", "my", "your", "his", "her", "its", "our", "their",
  "this", "that", "these", "those",
  "to", "of", "in", "on", "at", "for", "with", "from", "by", "about",
  "into", "through", "under", "over", "after", "before", "without", "between", "around",
  "and", "or", "but", "because", "if", "when", "while", "although", "as", "like",
  "can", "could", "will", "would", "should", "must", "might", "may",
]);

function countWords(text: string) {
  return text.trim().split(/\s+/u).filter(Boolean).length;
}

function hasSentenceEnding(text: string) {
  const ending = text.trim().replace(/["'’”»)\]}]+$/u, "");
  return /[.!?…]+$/u.test(ending);
}

function hasContinuationEnding(text: string) {
  const ending = text.trim().replace(/["'’”»)\]}]+$/u, "");
  return /[,;:—–-]$/u.test(ending);
}

function startsIndependentThought(text: string) {
  return /^[\s"'“‘([{]*(?:I|we|you|he|she|they|it|there|here|now|then|but|so|what|who|when|where|why|how)\b/iu.test(text);
}

function endsWithIncompletePhrase(text: string) {
  const lastWord = text.trim().split(/\s+/u).pop();
  const normalizedLastWord = lastWord
    ?.replace(/^[\p{P}\p{S}]+|[\p{P}\p{S}]+$/gu, "")
    .toLowerCase();
  return normalizedLastWord !== undefined && INCOMPLETE_ENDINGS.has(normalizedLastWord);
}

function combineLines(first: LyricLine, second: LyricLine): LyricLine {
  const mergedEnd = Math.max(
    first.start + first.duration,
    second.start + second.duration,
  );
  return {
    ...first,
    text: `${first.text.trim()} ${second.text.trim()}`.trim(),
    duration: Number(Math.max(0, mergedEnd - first.start).toFixed(2)),
  };
}

export function mergeShortLines(lines: LyricLine[]): LyricLine[] {
  const punctuationMerged: LyricLine[] = [];

  for (const line of lines) {
    const current = { ...line };
    const previous = punctuationMerged[punctuationMerged.length - 1];
    const mergedWordCount = previous
      ? countWords(previous.text) + countWords(current.text)
      : Number.POSITIVE_INFINITY;

    if (
      previous &&
      countWords(current.text) < SHORT_LINE_WORD_LIMIT &&
      hasContinuationEnding(previous.text) &&
      mergedWordCount <= PREFERRED_MERGED_WORD_LIMIT
    ) {
      punctuationMerged[punctuationMerged.length - 1] = combineLines(previous, current);
    } else {
      punctuationMerged.push(current);
    }
  }

  const mergedLines: LyricLine[] = [];
  let index = 0;

  while (index < punctuationMerged.length) {
    let current = punctuationMerged[index];

    while (
      (countWords(current.text) < SHORT_LINE_WORD_LIMIT || endsWithIncompletePhrase(current.text)) &&
      index + 1 < punctuationMerged.length
    ) {
      const next = punctuationMerged[index + 1];
      const mergedWordCount = countWords(current.text) + countWords(next.text);

      if (
        hasSentenceEnding(current.text) ||
        hasContinuationEnding(current.text) ||
        startsIndependentThought(next.text) ||
        mergedWordCount > PREFERRED_MERGED_WORD_LIMIT
      ) {
        break;
      }

      current = combineLines(current, next);
      index += 1;
    }

    mergedLines.push(current);
    index += 1;
  }

  return mergedLines;
}
