import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import { isLanguage, type LanguageSettings } from "@/types/game";

const GUEST_LANGUAGE_KEY = "lingo-clips:language-settings";
const LANGUAGE_PREFIX = "lingo-clips:language-settings:v2:";
const GUEST_FAVORITES_KEY = "lingo-clips:favorites:v1";
const GUEST_CLAIM_KEY = "lingo-clips:language-settings:guest-migrated-to";
const isSongId = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

function parseLanguageSettings(raw: string | null): LanguageSettings | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Record<string, unknown>;
    const uiLanguage = value.uiLanguage === "uk" ? "ru" : value.uiLanguage;
    const targetLanguage = value.targetLanguage === "uk" ? "ru" : value.targetLanguage;
    const sourceLanguage = value.sourceLanguage;
    if (!isLanguage(uiLanguage) || !isLanguage(targetLanguage) || !isLanguage(sourceLanguage)) return null;
    return { uiLanguage, targetLanguage, sourceLanguage };
  } catch { return null; }
}

/** Move guest choices into the signed-in account; keep local copies until every write succeeds. */
export async function migrateGuestData(userId: string, client: SupabaseClient<Database>): Promise<boolean> {
  let guestSettings: LanguageSettings | null;
  let pendingAccountSettings: LanguageSettings | null = null;
  let favorites: string[];
  try {
    guestSettings = parseLanguageSettings(localStorage.getItem(GUEST_LANGUAGE_KEY));
    const accountKey = `${LANGUAGE_PREFIX}user:${userId}`;
    if (localStorage.getItem(`${accountKey}:pending`) === "1") {
      pendingAccountSettings = parseLanguageSettings(localStorage.getItem(accountKey));
    }
    const rawFavorites = localStorage.getItem(GUEST_FAVORITES_KEY);
    const parsed = rawFavorites ? JSON.parse(rawFavorites) as unknown : [];
    favorites = Array.isArray(parsed) ? [...new Set(parsed.filter(isSongId))] : [];
  } catch { return false; }

  const settingsToMigrate = guestSettings ?? pendingAccountSettings;
  const hasGuestData = Boolean(settingsToMigrate || favorites.length);
  if (!hasGuestData) return true;

  if (settingsToMigrate) {
    const { error } = await client.from("user_settings").upsert({
      user_id: userId,
      ui_language: settingsToMigrate.uiLanguage,
      target_language: settingsToMigrate.targetLanguage,
      source_language: settingsToMigrate.sourceLanguage,
      settings_json: settingsToMigrate,
    }, { onConflict: "user_id" });
    if (error) return false;
  }

  if (favorites.length) {
    const { error } = await client.from("user_favorites").upsert(
      favorites.map((songId) => ({ user_id: userId, song_id: songId })),
      { onConflict: "user_id,song_id", ignoreDuplicates: true },
    );
    if (error) return false;
  }

  try {
    localStorage.removeItem(GUEST_LANGUAGE_KEY);
    localStorage.removeItem(GUEST_FAVORITES_KEY);
    localStorage.removeItem(`${LANGUAGE_PREFIX}user:${userId}`);
    localStorage.removeItem(`${LANGUAGE_PREFIX}user:${userId}:pending`);
    localStorage.removeItem(GUEST_CLAIM_KEY);
  } catch { return false; }
  return true;
}
