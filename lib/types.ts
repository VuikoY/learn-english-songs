// lib/types.ts
// Спільні типи, які використовують і компоненти (клієнт), і Route Handler (сервер).

/** Один рядок субтитрів. Усі значення часу — в секундах. */
export type LyricLine = {
  text: string;
  start: number; // коли рядок починається
  duration: number; // скільки він триває
};

/** Відповідь AI на кнопку "AI Explain". */
export type Explanation = {
  translation: string; // переклад українською
  grammar: string; // коротке пояснення граматики
  slang: string; // пояснення сленгу (порожній рядок, якщо сленгу немає)
};
