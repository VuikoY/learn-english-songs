// lib/types.ts
// Shared types for client and server code.

/** One subtitle line. All time values are in seconds. */
export type LyricLine = {
  text: string;
  start: number; // Line start time.
  duration: number; // Line duration.
};

/** AI response shown by the AI Explain action. */
export type Explanation = {
  translation: string; // Translation in the selected explanation language.
  grammar: string; // Brief grammar explanation.
  slang: string; // Slang explanation, or an empty string when there is none.
};

/** Runtime check for values read from an API or localStorage. */
export function isExplanation(value: unknown): value is Explanation {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.translation === "string" && typeof v.grammar === "string" && typeof v.slang === "string"
  );
}
