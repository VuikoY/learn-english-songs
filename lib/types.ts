// lib/types.ts
// Спільні типи для клієнта й сервера.

import type { Language } from "@/types/game";

/** Один рядок субтитрів. Усі значення часу — в секундах. */
export type LyricLine = {
  text: string;
  start: number; // коли рядок починається
  duration: number; // скільки він триває
};

/** Відповідь AI на кнопку "AI Explain". */
export type Explanation = {
  translation: string; // переклад мовою пояснень
  grammar: string; // коротке пояснення граматики
  slang: string; // пояснення сленгу (порожній рядок, якщо сленгу немає)
};

/** Runtime-перевірка: чи значення справді схоже на Explanation (дані з API чи localStorage можуть бути будь-якими). */
export function isExplanation(value: unknown): value is Explanation {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.translation === "string" && typeof v.grammar === "string" && typeof v.slang === "string"
  );
}

/**
 * Збережена фраза словника. Назви полів збігаються з колонками майбутньої таблиці
 * `vocabulary` у Supabase, тож міграція буде простою.
 */
export type VocabularyItem = {
  id: string;
  original_text: string;
  translation: string;
  grammar: string;
  slang: string;
  song_title: string | null;
  source_language: Language; // мова пісні
  target_language: Language; // мова, якою написано пояснення
  created_at: string; // ISO-дата
};

/** Те, що передаємо при збереженні (id і created_at генеруємо самі). */
export type NewVocabularyItem = Omit<VocabularyItem, "id" | "created_at">;
