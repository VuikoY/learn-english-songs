// lib/utils/cleanTranscript.ts
// Clean YouTube subtitles in any language.
//
// REMOVE: [Music], [Música], [Singing], {noise}, (Laughter), ♪, and leading ">>" markers.
// DECODE: &amp;, &#39;, &quot;, including double-encoded entities such as &amp;#39;.
// PRESERVE: censored words, punctuation, and diacritics in lyric text.
// Text not covered by the first two rules remains unchanged.

import type { LyricLine } from "@/lib/types";

// ---------------------------------------------------------------------------
// 1. HTML entities.
// ---------------------------------------------------------------------------

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ndash: "–",
  mdash: "—",
  hellip: "…",
  laquo: "«",
  raquo: "»",
  lsquo: "‘",
  rsquo: "’",
  ldquo: "“",
  rdquo: "”",
};

/**
 * Converts "&amp;", "&#39;", "&#x27;", and "&quot;" to their plain characters.
 * Multiple passes handle values that YouTube has encoded more than once.
 */
function decodeHtmlEntities(input: string): string {
  let current = input;

  for (let pass = 0; pass < 3; pass++) {
    const next = current.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, body: string) => {
      if (body.startsWith("#")) {
        const isHex = body[1] === "x" || body[1] === "X";
        const code = parseInt(body.slice(isHex ? 2 : 1), isHex ? 16 : 10);
        return Number.isFinite(code) && code > 0 && code <= 0x10ffff
          ? String.fromCodePoint(code)
          : match;
      }
      return NAMED_ENTITIES[body.toLowerCase()] ?? match;
    });

    if (next === current) break; // Nothing else to decode.
    current = next;
  }

  return current;
}

// ---------------------------------------------------------------------------
// 2. Audio and performance markers.
// ---------------------------------------------------------------------------

// Parentheses can contain actual lyrics, so remove them only when they look like an audio marker:
// at most four words and containing a known marker such as music, laughter, or singing.
const CUE_STEMS = [
  "music", "músic", "muzyk", "музик",
  "laugh", "śmiech", "сміх", "смiх",
  "applau", "aplaus", "oklask", "brawa", "оплеск",
  "singing", "cantand", "śpiew", "співа", "спів",
  "instrumental", "inaudib", "unintell",
  "cheer", "whisper", "susurr", "szept", "шепіт",
  "speaking", "hablando",
];

const CUE_EXACT = new Set([
  "risa", "risas", "sigh", "sighs", "sighing", "suspiro", "suspiros",
  "noise", "ruido", "hałas", "шум",
  "silence", "silencio", "cisza", "тиша",
  "humming", "whistling", "crowd", "coro", "chorus", "intro", "outro",
  "зітхання", "westchnienie", "gasps", "cries", "screams", "coughs", "cough",
]);

function isSoundCue(content: string): boolean {
  // Split on non-letter characters; Unicode property escapes support Cyrillic and diacritics.
  const words = content.toLowerCase().split(/[^\p{L}]+/u).filter(Boolean);

  if (words.length === 0) return true; // "(...)" and "(?)" contain no lyric words.
  if (words.length > 4) return false; // Longer text is more likely to be a lyric.

  return words.some((w) => CUE_EXACT.has(w) || CUE_STEMS.some((stem) => w.startsWith(stem)));
}

// ---------------------------------------------------------------------------
// 3. Main function for one transcript line.
// ---------------------------------------------------------------------------

function cleanTranscriptLine(input: string): string {
  const decoded = decodeHtmlEntities(input).normalize("NFC");

  let text = decoded
    // Markers enclosed in square, curly, or full-width brackets are removed entirely.
    .replace(/\[[^\]]*\]|【[^】]*】|\{[^}]*\}/g, "")
    // Handle a marker split across transcript lines, such as "[Music" or "]".
    .replace(/\[[^\]]*$/, "")
    .replace(/^[^[\]]*\]/, "")
    // Remove parentheses only when they contain an audio marker.
    .replace(/[(（]([^()（）]*)[)）]/g, (match, content: string) => (isSoundCue(content) ? "" : match))
    // Remove music symbols and speaker-change markers.
    .replace(/[♪♫♬♩🎵🎶]+/gu, "")
    .replace(/^\s*>>+\s*/, "");

  // Remove spaces before punctuation after deleting a marker.
  if (text !== decoded) {
    text = text.replace(/\s+([,.!?;:])/g, "$1");
  }

  return text.replace(/\s+/g, " ").trim();
}

// ---------------------------------------------------------------------------
// 4. Clean the full array.
// ---------------------------------------------------------------------------

/** Cleans every line and removes entries that become empty. */
export function cleanTranscript(lines: LyricLine[]): LyricLine[] {
  return lines
    .map((line) => ({ ...line, text: cleanTranscriptLine(line.text) }))
    .filter((line) => line.text !== "");
}
