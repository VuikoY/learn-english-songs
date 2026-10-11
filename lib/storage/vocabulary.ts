// lib/storage/vocabulary.ts
// The vocabulary is stored in localStorage. Components share the same store through
// useSyncExternalStore, so changes appear immediately and sync across browser tabs.
//
// Keep this public API stable if the storage implementation changes to Supabase.
"use client";

import { useEffect, useSyncExternalStore } from "react";
import { isLanguage } from "@/types/game";
import type { NewVocabularyItem, VocabularyItem } from "@/lib/types";
import { getSupabaseUserClient } from "@/lib/supabase/client";

const STORAGE_KEY = "lingo-clips:vocabulary";
const CHANGE_EVENT = "lingo-clips:vocabulary-changed";

// useSyncExternalStore requires a stable reference for the empty snapshot.
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

function normalizeStoredVocabularyItem(value: unknown): VocabularyItem | null {
  if (typeof value !== "object" || value === null) return null;
  const item = value as Record<string, unknown>;
  const normalized = {
    ...item,
    source_language: item.source_language === "uk" ? "ru" : item.source_language,
    target_language: item.target_language === "uk" ? "ru" : item.target_language,
  };
  return isVocabularyItem(normalized) ? normalized : null;
}

// Reuse the last parsed array while localStorage is unchanged to avoid rerender loops.
let lastRaw: string | null = null;
let lastItems: VocabularyItem[] = EMPTY;

function getSnapshot(): VocabularyItem[] {
  let raw: string | null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch {
    return EMPTY; // localStorage is unavailable.
  }

  if (raw === lastRaw) return lastItems;
  lastRaw = raw;

  try {
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    lastItems = Array.isArray(parsed)
      ? parsed.map(normalizeStoredVocabularyItem).filter((item): item is VocabularyItem => item !== null)
      : EMPTY;
  } catch {
    lastItems = EMPTY;
  }
  return lastItems;
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener(CHANGE_EVENT, onChange); // Changes in this tab.
  window.addEventListener("storage", onChange); // Changes in other tabs.
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

function writeItems(items: VocabularyItem[]): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    return false; // Storage is full or unavailable.
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

/** A phrase with the same explanation language is a duplicate. */
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
  return writeItems([item, ...items]) ? "added" : "error"; // Add new entries at the start.
}

export function removeWord(id: string): void {
  writeItems(getSnapshot().filter((item) => item.id !== id));
}

/** Hook exposing the current vocabulary and add/remove actions. */
export function useVocabulary() {
  // The third argument is the server snapshot, where localStorage is unavailable.
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

        const remoteItems = data
          .map(normalizeStoredVocabularyItem)
          .filter((item): item is VocabularyItem => item !== null);
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
