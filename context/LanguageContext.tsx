"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { DICTIONARY, type TranslationKey } from "@/lib/i18n/dictionary";
import { LANGUAGE_SETTINGS_COOKIE, UI_LANGUAGE_COOKIE } from "@/lib/i18n/settings";
import { getInitialLanguages } from "@/lib/i18n/initial-languages";
import { isLanguage, isLearningLanguage, type Language, type LanguageSettings, type LearningLanguage } from "@/types/game";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { useAuthState } from "@/context/AuthContext";

const GUEST_KEY = "lingo-clips:language-settings";
const ACCOUNT_PREFIX = "lingo-clips:language-settings:v2:user:";
const DEFAULT_SETTINGS = getInitialLanguages();
type TranslateVars = Record<string, string | number>;

type LanguageContextValue = LanguageSettings & {
  setUiLanguage: (language: Language) => void;
  setTargetLanguage: (language: Language) => void;
  setSourceLanguage: (language: LearningLanguage) => void;
  t: (key: TranslationKey, vars?: TranslateVars) => string;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

function parseSettings(raw: string | null): LanguageSettings | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<LanguageSettings>;
    return getInitialLanguages({ savedSettings: value });
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

function persistUiLanguage(language: Language) {
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${UI_LANGUAGE_COOKIE}=${language}; Path=/; Max-Age=31536000; SameSite=Lax${secure}`;
}

function persistLanguageSettings(settings: LanguageSettings) {
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${LANGUAGE_SETTINGS_COOKIE}=${encodeURIComponent(JSON.stringify(settings))}; Path=/; Max-Age=31536000; SameSite=Lax${secure}`;
}

export function LanguageProvider({ children, initialSettings }: { children: ReactNode; initialSettings: LanguageSettings }) {
  const { userId, loading: authLoading } = useAuthState();
  const [settings, setSettings] = useState<LanguageSettings>(() => getInitialLanguages({ savedSettings: initialSettings }));
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const [hydratedUserId, setHydratedUserId] = useState<string | null | undefined>(undefined);
  const [cloudWritableUserId, setCloudWritableUserId] = useState<string | null>(null);
  const hydrated = !authLoading && hydratedUserId === userId;
  const visibleSettings = hydrated || hydratedUserId === undefined || (!userId && hydratedUserId !== null)
    ? settings
    : DEFAULT_SETTINGS;

  useEffect(() => {
    if (authLoading) return;
    let active = true;
    queueMicrotask(() => {
      if (active) setCloudWritableUserId(null);
    });
    const hydrate = async () => {
      if (!userId) {
        let guest = initialSettings;
        try {
          if (hydratedUserId) {
            guest = getInitialLanguages({ savedSettings: settingsRef.current });
            localStorage.setItem(GUEST_KEY, JSON.stringify(guest));
          } else {
            const savedGuest = readGuestSettings();
            guest = savedGuest ?? initialSettings;
          }
        } catch { /* Storage may be unavailable. */ }
        if (active) { setSettings(guest); setHydratedUserId(null); }
        return;
      }

      const client = getSupabaseBrowserClient();
      if (!client) {
        if (active) { setSettings(initialSettings); setHydratedUserId(userId); }
        return;
      }
      const { data: { user }, error: authError } = await client.auth.getUser();
      if (authError || user?.id !== userId || user.is_anonymous) return;
      const { data: row, error } = await client.from("user_settings")
        .select("ui_language,source_language,target_language")
        .eq("user_id", userId).maybeSingle();
      if (!active) return;

      let next: LanguageSettings;
      if (!error && row) {
        next = getInitialLanguages({ savedSettings: {
          uiLanguage: isLanguage(row.ui_language) ? row.ui_language : initialSettings.uiLanguage,
          sourceLanguage: isLearningLanguage(row.source_language) ? row.source_language : initialSettings.sourceLanguage,
          targetLanguage: isLanguage(row.target_language) ? row.target_language : initialSettings.targetLanguage,
        } });
        clearLegacyAccountSettings(userId);
        setCloudWritableUserId(userId);
      } else if (!error && !row) {
        next = readLegacyAccountSettings(userId) ?? initialSettings;
        const { error: saveError } = await client.from("user_settings").upsert({
          user_id: userId, ui_language: next.uiLanguage, source_language: next.sourceLanguage,
          target_language: next.targetLanguage, settings_json: next,
        }, { onConflict: "user_id" });
        if (!saveError) {
          clearLegacyAccountSettings(userId);
          setCloudWritableUserId(userId);
        }
      } else {
        next = initialSettings;
      }
      if (active) { setSettings(next); setHydratedUserId(userId); }
    };
    void hydrate();
    return () => { active = false; };
  }, [authLoading, hydratedUserId, initialSettings, userId]);

  // Guest preferences live only in localStorage. Signed-in preferences live only in Supabase.
  useEffect(() => {
    if (!hydrated || userId) return;
    try { localStorage.setItem(GUEST_KEY, JSON.stringify(settings)); } catch { /* Keep in-memory settings. */ }
  }, [settings, hydrated, userId]);

  useEffect(() => {
    if (!hydrated) return;
    persistUiLanguage(visibleSettings.uiLanguage);
    persistLanguageSettings(visibleSettings);
  }, [visibleSettings, hydrated]);

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

  const setUiLanguage = useCallback((uiLanguage: Language) => {
    persistUiLanguage(uiLanguage);
    setSettings((prev) => ({ ...prev, uiLanguage }));
  }, []);
  const setTargetLanguage = useCallback((targetLanguage: Language) => setSettings((prev) => {
    const sourceLanguage = prev.sourceLanguage === targetLanguage
      ? targetLanguage === "en" ? "pl" : "en"
      : prev.sourceLanguage;
    return { ...prev, targetLanguage, sourceLanguage };
  }), []);
  const setSourceLanguage = useCallback((sourceLanguage: LearningLanguage) => setSettings((prev) => {
    if (sourceLanguage !== prev.targetLanguage) return { ...prev, sourceLanguage };
    const targetLanguage = sourceLanguage === "en" ? "pl" : "en";
    return { ...prev, sourceLanguage, targetLanguage };
  }), []);

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
