"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import { isLanguage } from "@/types/game";
import type { NewVocabularyItem, VocabularyItem } from "@/lib/types";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { useAuthState } from "@/context/AuthContext";

const LEGACY_KEY = "lingo-clips:vocabulary";
const KEY_PREFIX = "lingo-clips:vocabulary:v2:";
const GUEST_CLAIM_KEY = "lingo-clips:vocabulary:guest-migrated-to";
const CHANGE_EVENT = "lingo-clips:vocabulary-changed";
const EMPTY: VocabularyItem[] = [];
const parsedCache = new Map<string, { raw: string | null; items: VocabularyItem[] }>();

const storageKey = (userId: string | null) => `${KEY_PREFIX}${userId ? `user:${userId}` : "guest"}`;
const normalize = (text: string) => text.trim().toLowerCase();

function isVocabularyItem(value: unknown): value is VocabularyItem {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.id === "string" && typeof v.original_text === "string" &&
    typeof v.translation === "string" && typeof v.grammar === "string" && typeof v.slang === "string" &&
    (v.song_title === null || typeof v.song_title === "string") && isLanguage(v.source_language) &&
    isLanguage(v.target_language) && typeof v.created_at === "string";
}

function normalizeItem(value: unknown): VocabularyItem | null {
  if (typeof value !== "object" || value === null) return null;
  const item = value as Record<string, unknown>;
  const normalized = { ...item };
  return isVocabularyItem(normalized) ? normalized : null;
}

function readKey(key: string): VocabularyItem[] {
  let raw: string | null;
  try { raw = localStorage.getItem(key); } catch { return EMPTY; }
  const cached = parsedCache.get(key);
  if (cached?.raw === raw) return cached.items;
  let items: VocabularyItem[] = EMPTY;
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (Array.isArray(parsed)) items = parsed.map(normalizeItem).filter((item): item is VocabularyItem => item !== null);
  } catch { /* Ignore malformed local data without overwriting it. */ }
  parsedCache.set(key, { raw, items });
  return items;
}

function ensureLegacyGuestData() {
  try {
    const guestKey = storageKey(null);
    const legacy = localStorage.getItem(LEGACY_KEY);
    if (!legacy) return;
    let legacyItems: VocabularyItem[];
    try {
      const parsed: unknown = JSON.parse(legacy);
      if (!Array.isArray(parsed)) return;
      legacyItems = parsed.map(normalizeItem).filter((item): item is VocabularyItem => item !== null);
    } catch { return; }
    const combined = mergeById(readKey(guestKey), legacyItems);
    localStorage.setItem(guestKey, JSON.stringify(combined));
    // Keep the legacy copy until the merged copy has been committed.
    if (localStorage.getItem(guestKey) === JSON.stringify(combined)) localStorage.removeItem(LEGACY_KEY);
    parsedCache.delete(guestKey);
  } catch { /* Keep the legacy key intact if localStorage is unavailable/full. */ }
}

function getItems(userId: string | null): VocabularyItem[] {
  if (!userId) ensureLegacyGuestData();
  return readKey(storageKey(userId));
}

function writeLocal(userId: string | null, items: VocabularyItem[]): boolean {
  const key = storageKey(userId);
  try { localStorage.setItem(key, JSON.stringify(items)); } catch { return false; }
  parsedCache.delete(key);
  window.dispatchEvent(new Event(CHANGE_EVENT));
  return true;
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => { window.removeEventListener(CHANGE_EVENT, onChange); window.removeEventListener("storage", onChange); };
}

function mergeById(...groups: VocabularyItem[][]): VocabularyItem[] {
  const map = new Map<string, VocabularyItem>();
  // Earlier groups win: callers pass cloud rows before device rows.
  for (const group of groups) for (const item of group) if (!map.has(item.id)) map.set(item.id, item);
  return [...map.values()];
}

async function currentUserMatches(userId: string): Promise<boolean> {
  const client = getSupabaseBrowserClient();
  if (!client) return false;
  const { data: { user }, error } = await client.auth.getUser();
  return !error && user?.id === userId && !user.is_anonymous;
}

async function syncVocabulary(userId: string, localItems: VocabularyItem[]) {
  const client = getSupabaseBrowserClient();
  if (!client || !(await currentUserMatches(userId))) return;
  const { data: remote, error } = await client.from("vocabulary").select("*").eq("user_id", userId);
  if (error || !(await currentUserMatches(userId))) return;

  const tombstoneKey = `${storageKey(userId)}:deleted`;
  let tombstones: string[] = [];
  try { tombstones = JSON.parse(localStorage.getItem(tombstoneKey) ?? "[]") as string[]; } catch { /* Ignore corrupt tombstones. */ }
  if (tombstones.length) {
    const { error: deleteError } = await client.from("vocabulary").delete().eq("user_id", userId).in("id", tombstones);
    if (!deleteError) {
      try { localStorage.removeItem(tombstoneKey); } catch { /* Retry on next sync. */ }
    }
  }

  const remoteItems = (remote ?? []).map(normalizeItem).filter((item): item is VocabularyItem => item !== null);
  const ids = new Set(remoteItems.map((item) => item.id));
  const phrases = new Set(remoteItems.map((item) => `${normalize(item.original_text)}::${item.target_language}`));
  const pending = localItems.filter((item) => {
    const phrase = `${normalize(item.original_text)}::${item.target_language}`;
    if (ids.has(item.id) || phrases.has(phrase)) return false;
    ids.add(item.id); phrases.add(phrase);
    return true;
  });
  if (pending.length && await currentUserMatches(userId)) {
    // Insert only missing phrases/IDs. Never overwrite an existing cloud row from a stale device cache.
    await client.from("vocabulary").insert(pending.map((item) => ({ user_id: userId, ...item })));
  }
}

function readDeletedIds(userId: string): string[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(`${storageKey(userId)}:deleted`) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
  } catch { return []; }
}

async function loadAccount(userId: string) {
  const client = getSupabaseBrowserClient();
  if (!client || !(await currentUserMatches(userId))) return;
  const { data, error } = await client.from("vocabulary").select("*").eq("user_id", userId);
  if (error || !(await currentUserMatches(userId))) return;
  const deletedIds = new Set(readDeletedIds(userId));
  const cloudItems = (data ?? []).map(normalizeItem)
    .filter((item): item is VocabularyItem => item !== null && !deletedIds.has(item.id));
  let localItems = readKey(storageKey(userId));
  const mergedCloudAndDevice = mergeById(cloudItems, localItems);

  // Claim guest data for the first account only. Keep the guest copy intact and
  // scope its migrated copy to that account; other accounts never read this key.
  const claimAndStage = () => {
    try {
      let claim = localStorage.getItem(GUEST_CLAIM_KEY);
      if (!claim) {
        // Claim first: failed copies are retried for this same account.
        localStorage.setItem(GUEST_CLAIM_KEY, userId);
        claim = localStorage.getItem(GUEST_CLAIM_KEY);
      }
      if (claim !== userId) return;
      const guestItems = getItems(null);
      const staged = mergeById(mergedCloudAndDevice, guestItems);
      if (writeLocal(userId, staged)) {
        localItems = staged;
        // Once claimed, the guest copy lives in this account's scope. Clear the
        // active guest list so older unscoped data cannot reappear after logout.
        writeLocal(null, []);
      }
    } catch { /* Keep guest/account copies intact and retry on the next session. */ }
  };
  if (typeof navigator !== "undefined" && navigator.locks) {
    await navigator.locks.request(GUEST_CLAIM_KEY, claimAndStage);
  } else claimAndStage();

  const finalItems = mergeById(cloudItems, localItems);
  if (writeLocal(userId, finalItems)) void syncVocabulary(userId, finalItems);
}

function createId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** A phrase with the same explanation language is a duplicate within its current scope. */
export function isSameWord(item: VocabularyItem, originalText: string, targetLanguage: string): boolean {
  return normalize(item.original_text) === normalize(originalText) && item.target_language === targetLanguage;
}

export type AddResult = "added" | "duplicate" | "error";

export function useVocabulary() {
  const { userId, loading } = useAuthState();
  const key = storageKey(userId);
  const getScopedSnapshot = useCallback(() => loading ? EMPTY : getItems(userId), [key, loading, userId]);
  const items = useSyncExternalStore(subscribe, getScopedSnapshot, () => EMPTY);

  useEffect(() => {
    if (loading) return;
    if (userId) void loadAccount(userId);
    else ensureLegacyGuestData();
  }, [loading, userId]);

  const addWord = useCallback((input: NewVocabularyItem): AddResult => {
    if (loading) return "error";
    const current = getItems(userId);
    if (current.some((item) => isSameWord(item, input.original_text, input.target_language))) return "duplicate";
    const item: VocabularyItem = { ...input, id: createId(), created_at: new Date().toISOString() };
    const next = [item, ...current];
    if (!writeLocal(userId, next)) return "error";
    if (userId) void syncVocabulary(userId, next);
    return "added";
  }, [loading, userId]);

  const removeWord = useCallback((id: string) => {
    if (loading) return;
    const next = getItems(userId).filter((item) => item.id !== id);
    if (!writeLocal(userId, next) || !userId) return;
    try {
      const tombstoneKey = `${storageKey(userId)}:deleted`;
      const tombstones = JSON.parse(localStorage.getItem(tombstoneKey) ?? "[]") as string[];
      if (!tombstones.includes(id)) localStorage.setItem(tombstoneKey, JSON.stringify([...tombstones, id]));
    } catch { return; }
    void syncVocabulary(userId, next);
  }, [loading, userId]);

  return { items, addWord, removeWord };
}
