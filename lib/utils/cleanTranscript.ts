// lib/utils/cleanTranscript.ts
// Очищення субтитрів YouTube будь-якою мовою.
//
// ПРИБИРАЄМО:  [Music], [Música], [Singing], {noise}, (Laughter), ♪, ">>" на початку
// ДЕКОДУЄМО:   &amp; &#39; &quot; (і подвійно закодоване &amp;#39;)
// НЕ ЧІПАЄМО:  f*ck, sh*t, f#ck, ! ? ' , . та діакритику: ñ ä é ł ї
//
// Усе, що не входить у перші два пункти, лишається у тексті без змін.

import type { LyricLine } from "@/lib/types";

// ---------------------------------------------------------------------------
// 1. HTML-сутності
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
 * Перетворює "&amp;", "&#39;", "&#x27;", "&quot;" на звичайні символи.
 * Кілька проходів потрібні, бо YouTube іноді віддає "&amp;#39;" (закодовано двічі).
 */
export function decodeHtmlEntities(input: string): string {
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

    if (next === current) break; // більше нічого декодувати
    current = next;
  }

  return current;
}

// ---------------------------------------------------------------------------
// 2. Слухові позначки
// ---------------------------------------------------------------------------

// У ЗВИЧАЙНИХ дужках можуть бути і справжні слова пісні: "(I can't get no) satisfaction".
// Тому круглі дужки видаляємо, тільки якщо вони схожі на звукову позначку:
// коротко (до 4 слів) і є слово-ознака: music, laughter, risas, śmiech, сміх...
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
  // Розбиваємо на слова по будь-чому, що не є літерою (працює для кирилиці та діакритики)
  const words = content.toLowerCase().split(/[^\p{L}]+/u).filter(Boolean);

  if (words.length === 0) return true; // "(...)", "(?)" — просто шум
  if (words.length > 4) return false; // довге — це, найімовірніше, текст пісні

  return words.some((w) => CUE_EXACT.has(w) || CUE_STEMS.some((stem) => w.startsWith(stem)));
}

// ---------------------------------------------------------------------------
// 3. Головна функція для одного рядка
// ---------------------------------------------------------------------------

export function cleanTranscriptLine(input: string): string {
  const decoded = decodeHtmlEntities(input).normalize("NFC");

  let text = decoded
    // [Music] [Música] [Singing] 【...】 {noise} — квадратні, фігурні та повноширинні дужки
    // у субтитрах ВЖЕ є позначками, тому прибираємо їх повністю
    .replace(/\[[^\]]*\]|【[^】]*】|\{[^}]*\}/g, "")
    // Позначка, розрізана між двома рядками: "[Music" без закриття або "]" без відкриття
    .replace(/\[[^\]]*$/, "")
    .replace(/^[^[\]]*\]/, "")
    // Круглі дужки — лише якщо це звукова позначка
    .replace(/[(（]([^()（）]*)[)）]/g, (match, content: string) => (isSoundCue(content) ? "" : match))
    // Музичні символи та маркер зміни мовця
    .replace(/[♪♫♬♩🎵🎶]+/gu, "")
    .replace(/^\s*>>+\s*/, "");

  // Якщо щось вирізали — прибираємо пробіл перед пунктуацією: "Forever , trusting" -> "Forever, trusting"
  if (text !== decoded) {
    text = text.replace(/\s+([,.!?;:])/g, "$1");
  }

  return text.replace(/\s+/g, " ").trim();
}

// ---------------------------------------------------------------------------
// 4. Очищення всього масиву
// ---------------------------------------------------------------------------

/** Очищає кожен рядок і викидає ті, що стали порожніми (там було лише [Music]). */
export function cleanTranscript(lines: LyricLine[]): LyricLine[] {
  return lines
    .map((line) => ({ ...line, text: cleanTranscriptLine(line.text) }))
    .filter((line) => line.text !== "");
}
