"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { DICTIONARY, type TranslationKey } from "@/lib/i18n/dictionary";
import { isLanguage, type Language, type LanguageSettings } from "@/types/game";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { useAuthState } from "@/context/AuthContext";

const LEGACY_KEY = "lingo-clips:language-settings";
const KEY_PREFIX = "lingo-clips:language-settings:v2:";
const GUEST_CLAIM_KEY = "lingo-clips:language-settings:guest-migrated-to";
const DEFAULT_SETTINGS: LanguageSettings = { uiLanguage: "ru", targetLanguage: "ru", sourceLanguage: "en" };
type TranslateVars = Record<string, string | number>;

type LanguageContextValue = LanguageSettings & {
  setUiLanguage: (language: Language) => void;
  setTargetLanguage: (language: Language) => void;
  setSourceLanguage: (language: Language) => void;
  t: (key: TranslationKey, vars?: TranslateVars) => string;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);
const scopeKey = (userId: string | null) => userId ? `${KEY_PREFIX}user:${userId}` : LEGACY_KEY;
const dirtyKey = (userId: string) => `${KEY_PREFIX}user:${userId}:pending`;

function parseSettings(raw: string | null): LanguageSettings | null {
  if (!raw) return null;
  try {
    const parsed: Partial<Record<keyof LanguageSettings, unknown>> = JSON.parse(raw);
    return {
      uiLanguage: isLanguage(parsed.uiLanguage) ? parsed.uiLanguage : DEFAULT_SETTINGS.uiLanguage,
      targetLanguage: isLanguage(parsed.targetLanguage) ? parsed.targetLanguage : DEFAULT_SETTINGS.targetLanguage,
      sourceLanguage: isLanguage(parsed.sourceLanguage) ? parsed.sourceLanguage : DEFAULT_SETTINGS.sourceLanguage,
    };
  } catch { return null; }
}

function readScopedSettings(userId: string | null): LanguageSettings | null {
  try { return parseSettings(localStorage.getItem(scopeKey(userId))); } catch { return null; }
}

function writeScopedSettings(userId: string | null, settings: LanguageSettings, pending: boolean) {
  try {
    localStorage.setItem(scopeKey(userId), JSON.stringify(settings));
    if (userId) {
      if (pending) localStorage.setItem(dirtyKey(userId), "1");
      else localStorage.removeItem(dirtyKey(userId));
    }
  } catch { /* Keep in-memory settings if storage is unavailable. */ }
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const { userId, loading: authLoading } = useAuthState();
  const [settings, setSettings] = useState<LanguageSettings>(DEFAULT_SETTINGS);
  const [hydratedUserId, setHydratedUserId] = useState<string | null | undefined>(undefined);
  const [cloudWritable, setCloudWritable] = useState(false);
  const hydrated = !authLoading && hydratedUserId === userId;
  const visibleSettings = hydrated ? settings : DEFAULT_SETTINGS;

  useEffect(() => {
    if (authLoading) return;
    let active = true;
    const userAtStart = userId;
    // visibleSettings falls back to defaults until this account scope hydrates.
    void (async () => {
      let local = readScopedSettings(userAtStart);
      if (!userAtStart) {
        if (active) { setSettings(local ?? DEFAULT_SETTINGS); setHydratedUserId(null); }
        return;
      }

      const client = getSupabaseBrowserClient();
      if (!client) {
        if (active) { setSettings(local ?? DEFAULT_SETTINGS); setHydratedUserId(userAtStart); }
        return;
      }
      const { data: { user }, error: userError } = await client.auth.getUser();
      if (userError || user?.id !== userAtStart || user.is_anonymous) return;
      const { data: cloud, error } = await client.from("user_settings")
        .select("ui_language,source_language,target_language")
        .eq("user_id", userAtStart).maybeSingle();
      if (error || !active) {
        if (active) { setSettings(local ?? DEFAULT_SETTINGS); setHydratedUserId(userAtStart); }
        return;
      }

      const claimGuest = () => {
        try {
          let owner = localStorage.getItem(GUEST_CLAIM_KEY);
          if (!owner) {
            // Claim guest preferences for the first account only; retain the guest copy.
            localStorage.setItem(GUEST_CLAIM_KEY, userAtStart);
            owner = localStorage.getItem(GUEST_CLAIM_KEY);
          }
          return owner;
        } catch { return null; }
      };
      const guestClaim = typeof navigator !== "undefined" && navigator.locks
        ? await navigator.locks.request(GUEST_CLAIM_KEY, claimGuest)
        : claimGuest();
      const guest = guestClaim === userAtStart ? readScopedSettings(null) : null;
      const cloudSettings = cloud && isLanguage(cloud.ui_language) && isLanguage(cloud.source_language) && isLanguage(cloud.target_language)
        ? { uiLanguage: cloud.ui_language, sourceLanguage: cloud.source_language, targetLanguage: cloud.target_language }
        : null;
      let pending = false;
      try { pending = localStorage.getItem(dirtyKey(userAtStart)) === "1"; } catch { /* ignore */ }
      local = (pending ? local : null) ?? cloudSettings ?? local ?? guest ?? DEFAULT_SETTINGS;
      writeScopedSettings(userAtStart, local, pending || !cloudSettings);
      if (!active) return;
      setSettings(local);
      setCloudWritable(true);
      setHydratedUserId(userAtStart);
    })();

    return () => { active = false; };
  }, [authLoading, userId]);

  // Persist edits in the active scope. User settings are marked pending until
  // that exact value has been acknowledged by the same account's RLS-protected row.
  useEffect(() => {
    if (!hydrated) return;
    const isDirty = userId !== null;
    writeScopedSettings(userId, settings, isDirty);
  }, [settings, hydrated, userId]);

  useEffect(() => {
    if (!hydrated || !userId || !cloudWritable) return;
    let active = true;
    void (async () => {
      const client = getSupabaseBrowserClient();
      if (!client) return;
      let pending = false;
      try { pending = localStorage.getItem(dirtyKey(userId)) === "1"; } catch { return; }
      if (!pending) return;
      const { data: { user } } = await client.auth.getUser();
      if (!active || user?.id !== userId || user.is_anonymous) return;
      const { error } = await client.from("user_settings").upsert({
        user_id: userId,
        ui_language: settings.uiLanguage,
        source_language: settings.sourceLanguage,
        target_language: settings.targetLanguage,
        settings_json: settings,
      }, { onConflict: "user_id" });
      if (error || !active) return;
      const { data: { user: currentUser } } = await client.auth.getUser();
      if (currentUser?.id !== userId || currentUser.is_anonymous) return;
      if (JSON.stringify(readScopedSettings(userId)) === JSON.stringify(settings)) writeScopedSettings(userId, settings, false);
    })();
    return () => { active = false; };
  }, [settings, hydrated, userId, cloudWritable]);

  useEffect(() => { if (hydrated) document.documentElement.lang = visibleSettings.uiLanguage; }, [visibleSettings.uiLanguage, hydrated]);

  const setUiLanguage = useCallback((uiLanguage: Language) => setSettings((prev) => ({ ...prev, uiLanguage })), []);
  const setTargetLanguage = useCallback((targetLanguage: Language) => setSettings((prev) => ({ ...prev, targetLanguage })), []);
  const setSourceLanguage = useCallback((sourceLanguage: Language) => setSettings((prev) => ({ ...prev, sourceLanguage })), []);

  const value = useMemo<LanguageContextValue>(() => {
    const dictionary = DICTIONARY[visibleSettings.uiLanguage];
    const t = (key: TranslationKey, vars?: TranslateVars): string => {
      let text: string = dictionary[key] ?? DICTIONARY.en[key];
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
