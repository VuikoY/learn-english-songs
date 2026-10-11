// lib/storage/vocabulary.ts
// Словник у localStorage. Усі компоненти (кнопка збереження, сторінка словника, лічильник
// у шапці) читають одне й те саме сховище через useSyncExternalStore, тому оновлюються разом
// і між вкладками браузера.
//
// ДЛЯ МАЙБУТНЬОГО SUPABASE: публічний інтерфейс — useVocabulary(), addWord(), removeWord(),
// isSameWord(). Коли підключимо базу, змінимо лише внутрішню реалізацію цього файлу.
"use client";

import { useEffect, useSyncExternalStore } from "react";
import { isLanguage } from "@/types/game";
import type { NewVocabularyItem, VocabularyItem } from "@/lib/types";
import { getSupabaseUserClient } from "@/lib/supabase/client";

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
  void syncVocabularyToSupabase(items);
  return true;
}

async function syncVocabularyToSupabase(items: VocabularyItem[]) {
  try {
    const client = await getSupabaseUserClient();
    if (!client) return;
    const { data: { user } } = await client.auth.getUser();
    if (!user) return;

    const { data: savedRows } = await client.from("vocabulary").select("id").eq("user_id", user.id);
    const itemIds = new Set(items.map((item) => item.id));
    const removedIds = (savedRows ?? []).map((row) => row.id).filter((id) => !itemIds.has(id));
    if (removedIds.length) {
      await client.from("vocabulary").delete().eq("user_id", user.id).in("id", removedIds);
    }
    if (items.length) {
      await client.from("vocabulary").upsert(
        items.map((item) => ({ user_id: user.id, ...item })),
        { onConflict: "user_id,id" },
      );
    }
  } catch {
    // localStorage remains the source of truth while offline or when Supabase is not configured.
  }
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
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const client = await getSupabaseUserClient();
        if (!client) return;
        const { data: { user } } = await client.auth.getUser();
        if (!user) return;
        const { data, error } = await client.from("vocabulary").select("*").eq("user_id", user.id);
        if (error || !active || !data) return;

        const remoteItems = data.filter(isVocabularyItem);
        const localItems = getSnapshot();
        const ids = new Set(localItems.map((item) => item.id));
        const phrases = new Set(localItems.map((item) => `${normalize(item.original_text)}::${item.target_language}`));
        const merged = [
          ...localItems,
          ...remoteItems.filter((item) => {
            const phrase = `${normalize(item.original_text)}::${item.target_language}`;
            if (ids.has(item.id) || phrases.has(phrase)) return false;
            ids.add(item.id);
            phrases.add(phrase);
            return true;
          }),
        ];
        writeItems(merged);
      } catch {
        // Keep the local vocabulary when remote sync is unavailable.
      }
    })();
    return () => { active = false; };
  }, []);
  return { items, addWord, removeWord };
}
