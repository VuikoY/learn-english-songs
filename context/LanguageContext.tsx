"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { DICTIONARY, type TranslationKey } from "@/lib/i18n/dictionary";
import { isLanguage, type Language, type LanguageSettings } from "@/types/game";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { useAuthState } from "@/context/AuthContext";

const GUEST_KEY = "lingo-clips:language-settings";
const ACCOUNT_PREFIX = "lingo-clips:language-settings:v2:user:";
const DEFAULT_SETTINGS: LanguageSettings = { uiLanguage: "ru", targetLanguage: "ru", sourceLanguage: "en" };
type TranslateVars = Record<string, string | number>;

type LanguageContextValue = LanguageSettings & {
  setUiLanguage: (language: Language) => void;
  setTargetLanguage: (language: Language) => void;
  setSourceLanguage: (language: Language) => void;
  t: (key: TranslationKey, vars?: TranslateVars) => string;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

function parseSettings(raw: string | null): LanguageSettings | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Record<string, unknown>;
    const normalize = (item: unknown, fallback: Language) => item === "uk" ? "ru" : isLanguage(item) ? item : fallback;
    return {
      uiLanguage: normalize(value.uiLanguage, DEFAULT_SETTINGS.uiLanguage),
      targetLanguage: normalize(value.targetLanguage, DEFAULT_SETTINGS.targetLanguage),
      sourceLanguage: normalize(value.sourceLanguage, DEFAULT_SETTINGS.sourceLanguage),
    };
  } catch { return null; }
}

function readGuestSettings(): LanguageSettings | null {
  try { return parseSettings(localStorage.getItem(GUEST_KEY)); } catch { return null; }
}

function readLegacyAccountSettings(userId: string): LanguageSettings | null {
  try { return parseSettings(localStorage.getItem(`${ACCOUNT_PREFIX}${userId}`)); } catch { return null; }
}

function clearLegacyAccountSettings(userId: string) {
  try {
    localStorage.removeItem(`${ACCOUNT_PREFIX}${userId}`);
    localStorage.removeItem(`${ACCOUNT_PREFIX}${userId}:pending`);
  } catch { /* Database remains the source of truth. */ }
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const { userId, loading: authLoading } = useAuthState();
  const [settings, setSettings] = useState<LanguageSettings>(DEFAULT_SETTINGS);
  const [hydratedUserId, setHydratedUserId] = useState<string | null | undefined>(undefined);
  const [cloudWritableUserId, setCloudWritableUserId] = useState<string | null>(null);
  const hydrated = !authLoading && hydratedUserId === userId;
  const visibleSettings = hydrated ? settings : DEFAULT_SETTINGS;

  useEffect(() => {
    if (authLoading) return;
    let active = true;
    setCloudWritableUserId(null);
    const hydrate = async () => {
      if (!userId) {
        let guest = DEFAULT_SETTINGS;
        try { guest = readGuestSettings() ?? DEFAULT_SETTINGS; } catch { /* Storage may be unavailable. */ }
        if (active) { setSettings(guest); setHydratedUserId(null); }
        return;
      }

      const client = getSupabaseBrowserClient();
      if (!client) {
        if (active) { setSettings(DEFAULT_SETTINGS); setHydratedUserId(userId); }
        return;
      }
      const { data: { user }, error: authError } = await client.auth.getUser();
      if (authError || user?.id !== userId || user.is_anonymous) return;
      const { data: row, error } = await client.from("user_settings")
        .select("ui_language,source_language,target_language")
        .eq("user_id", userId).maybeSingle();
      if (!active) return;

      let next: LanguageSettings;
      if (!error && row && (row.ui_language === "uk" || isLanguage(row.ui_language)) && isLanguage(row.source_language)) {
        next = {
          uiLanguage: row.ui_language === "uk" ? "ru" : row.ui_language,
          sourceLanguage: row.source_language,
          targetLanguage: row.target_language === "uk" ? "ru" : isLanguage(row.target_language) ? row.target_language : DEFAULT_SETTINGS.targetLanguage,
        };
        clearLegacyAccountSettings(userId);
        setCloudWritableUserId(userId);
      } else if (!error && !row) {
        next = readLegacyAccountSettings(userId) ?? DEFAULT_SETTINGS;
        const { error: saveError } = await client.from("user_settings").upsert({
          user_id: userId, ui_language: next.uiLanguage, source_language: next.sourceLanguage,
          target_language: next.targetLanguage, settings_json: next,
        }, { onConflict: "user_id" });
        if (!saveError) {
          clearLegacyAccountSettings(userId);
          setCloudWritableUserId(userId);
        }
      } else {
        next = DEFAULT_SETTINGS;
      }
      if (active) { setSettings(next); setHydratedUserId(userId); }
    };
    void hydrate();
    return () => { active = false; };
  }, [authLoading, userId]);

  // Guest preferences live only in localStorage. Signed-in preferences live only in Supabase.
  useEffect(() => {
    if (!hydrated || userId) return;
    try { localStorage.setItem(GUEST_KEY, JSON.stringify(settings)); } catch { /* Keep in-memory settings. */ }
  }, [settings, hydrated, userId]);

  useEffect(() => {
    if (!hydrated || !userId || cloudWritableUserId !== userId) return;
    let active = true;
    void (async () => {
      const client = getSupabaseBrowserClient();
      if (!client) return;
      const { data: { user } } = await client.auth.getUser();
      if (!active || user?.id !== userId || user.is_anonymous) return;
      await client.from("user_settings").upsert({
        user_id: userId, ui_language: settings.uiLanguage, source_language: settings.sourceLanguage,
        target_language: settings.targetLanguage, settings_json: settings,
      }, { onConflict: "user_id" });
    })();
    return () => { active = false; };
  }, [settings, hydrated, userId, cloudWritableUserId]);

  useEffect(() => { if (hydrated) document.documentElement.lang = visibleSettings.uiLanguage; }, [visibleSettings.uiLanguage, hydrated]);

  const setUiLanguage = useCallback((uiLanguage: Language) => setSettings((prev) => ({ ...prev, uiLanguage })), []);
  const setTargetLanguage = useCallback((targetLanguage: Language) => setSettings((prev) => ({ ...prev, targetLanguage })), []);
  const setSourceLanguage = useCallback((sourceLanguage: Language) => setSettings((prev) => ({ ...prev, sourceLanguage })), []);

  const value = useMemo<LanguageContextValue>(() => {
    const dictionary = DICTIONARY[visibleSettings.uiLanguage];
    const t = (key: TranslationKey, vars?: TranslateVars): string => {
      let text: string = dictionary[key] ?? DICTIONARY.en[key] ?? String(key);
      if (vars) for (const [name, replacement] of Object.entries(vars)) text = text.replaceAll(`{${name}}`, String(replacement));
      return text;
    };
    return { ...visibleSettings, setUiLanguage, setTargetLanguage, setSourceLanguage, t };
  }, [visibleSettings, setUiLanguage, setTargetLanguage, setSourceLanguage]);
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage(): LanguageContextValue {
  const context = useContext(LanguageContext);
  if (context) return context;
  const dictionary = DICTIONARY[DEFAULT_SETTINGS.uiLanguage] ?? DICTIONARY.en;
  return { ...DEFAULT_SETTINGS, setUiLanguage: () => {}, setTargetLanguage: () => {}, setSourceLanguage: () => {},
    t: (key, vars) => {
      let text: string = dictionary[key] ?? DICTIONARY.en[key] ?? String(key);
      if (vars) for (const [name, replacement] of Object.entries(vars)) text = text.replaceAll(`{${name}}`, String(replacement));
      return text;
    },
  };
}
