// lib/storage/transcriptCache.ts
// Кеш завантажених субтитрів у localStorage: те саме відео + мова пісні не вантажимо вдруге.
// Зберігаємо останні 10 відео. Працює лише в браузері.

import type { LyricLine } from "@/lib/types";

const STORAGE_KEY = "lingo-clips:transcripts";
const MAX_ENTRIES = 10;

type Entry = { key: string; lines: LyricLine[] };

function isLine(value: unknown): value is LyricLine {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.text === "string" && typeof v.start === "number" && typeof v.duration === "number";
}

function readEntries(): Entry[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (e): e is Entry =>
        typeof e === "object" && e !== null && typeof e.key === "string" && Array.isArray(e.lines) && e.lines.every(isLine),
    );
  } catch {
    return [];
  }
}

const makeKey = (videoId: string, lang: string) => `${videoId}:${lang}`;

export function getCachedTranscript(videoId: string, lang: string): LyricLine[] | null {
  const entry = readEntries().find((e) => e.key === makeKey(videoId, lang));
  return entry && entry.lines.length > 0 ? entry.lines : null;
}

export function cacheTranscript(videoId: string, lang: string, lines: LyricLine[]): void {
  const key = makeKey(videoId, lang);
  const entries = [{ key, lines }, ...readEntries().filter((e) => e.key !== key)].slice(0, MAX_ENTRIES);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // сховище заповнене — кеш не критичний
  }
}
