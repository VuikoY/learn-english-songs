// lib/storage/vocabulary.ts
// Словник у localStorage. Усі компоненти (кнопка збереження, сторінка словника, лічильник
// у шапці) читають одне й те саме сховище через useSyncExternalStore, тому оновлюються разом
// і між вкладками браузера.
//
// ДЛЯ МАЙБУТНЬОГО SUPABASE: публічний інтерфейс — useVocabulary(), addWord(), removeWord(),
// isSameWord(). Коли підключимо базу, змінимо лише внутрішню реалізацію цього файлу.
"use client";

import { useSyncExternalStore } from "react";
import { isLanguage } from "@/types/game";
import type { NewVocabularyItem, VocabularyItem } from "@/lib/types";

const STORAGE_KEY = "lingo-clips:vocabulary";
const CHANGE_EVENT = "lingo-clips:vocabulary-changed";

// Один і той самий порожній масив — useSyncExternalStore вимагає стабільного посилання
const EMPTY: VocabularyItem[] = [];

function isVocabularyItem(value: unknown): value is VocabularyItem {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === "string" &&
    typeof v.original_text === "string" &&
    typeof v.translation === "string" &&
    typeof v.grammar === "string" &&
    typeof v.slang === "string" &&
    (v.song_title === null || typeof v.song_title === "string") &&
    isLanguage(v.source_language) &&
    isLanguage(v.target_language) &&
    typeof v.created_at === "string"
  );
}

// Кеш останнього прочитаного значення: поки текст у localStorage не змінився,
// повертаємо ТОЙ САМИЙ масив (інакше React зациклиться на перерендерах).
let lastRaw: string | null = null;
let lastItems: VocabularyItem[] = EMPTY;

function getSnapshot(): VocabularyItem[] {
  let raw: string | null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch {
    return EMPTY; // localStorage заблокований
  }

  if (raw === lastRaw) return lastItems;
  lastRaw = raw;

  try {
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    lastItems = Array.isArray(parsed) ? parsed.filter(isVocabularyItem) : EMPTY;
  } catch {
    lastItems = EMPTY;
  }
  return lastItems;
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener(CHANGE_EVENT, onChange); // зміни в цій вкладці
  window.addEventListener("storage", onChange); // зміни з інших вкладок
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

function writeItems(items: VocabularyItem[]): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    return false; // сховище заповнене або недоступне
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
  return true;
}

function createId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

const normalize = (text: string) => text.trim().toLowerCase();

/** Та сама фраза з тією самою мовою пояснення = дублікат. */
export function isSameWord(item: VocabularyItem, originalText: string, targetLanguage: string): boolean {
  return normalize(item.original_text) === normalize(originalText) && item.target_language === targetLanguage;
}

export type AddResult = "added" | "duplicate" | "error";

export function addWord(input: NewVocabularyItem): AddResult {
  const items = getSnapshot();
  if (items.some((item) => isSameWord(item, input.original_text, input.target_language))) {
    return "duplicate";
  }

  const item: VocabularyItem = { ...input, id: createId(), created_at: new Date().toISOString() };
  return writeItems([item, ...items]) ? "added" : "error"; // нові — на початку
}

export function removeWord(id: string): void {
  writeItems(getSnapshot().filter((item) => item.id !== id));
}

/** Хук для компонентів: актуальний список слів + функції додавання/видалення. */
export function useVocabulary() {
  // Третій аргумент — значення на сервері (там localStorage немає)
  const items = useSyncExternalStore(subscribe, getSnapshot, () => EMPTY);
  return { items, addWord, removeWord };
}
