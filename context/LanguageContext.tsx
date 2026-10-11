"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { DICTIONARY, type TranslationKey } from "@/lib/i18n/dictionary";
import { isLanguage, type Language, type LanguageSettings } from "@/types/game";
import { getSupabaseUserClient } from "@/lib/supabase/client";

const STORAGE_KEY = "lingo-clips:language-settings";

const DEFAULT_SETTINGS: LanguageSettings = {
  uiLanguage: "ru",
  targetLanguage: "ru",
  sourceLanguage: "en",
};

type TranslateVars = Record<string, string | number>;

type LanguageContextValue = LanguageSettings & {
  setUiLanguage: (language: Language) => void;
  setTargetLanguage: (language: Language) => void;
  setSourceLanguage: (language: Language) => void;
  t: (key: TranslationKey, vars?: TranslateVars) => string;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<LanguageSettings>(DEFAULT_SETTINGS);
  const [hydrated, setHydrated] = useState(false);
  const [cloudReady, setCloudReady] = useState(false);

  useEffect(() => {
    let active = true;
    async function loadSettings() {
      let localSettings = DEFAULT_SETTINGS;
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed: Partial<Record<keyof LanguageSettings, unknown>> = JSON.parse(raw);
          localSettings = {
            uiLanguage: isLanguage(parsed.uiLanguage) ? parsed.uiLanguage : DEFAULT_SETTINGS.uiLanguage,
            targetLanguage: isLanguage(parsed.targetLanguage) ? parsed.targetLanguage : DEFAULT_SETTINGS.targetLanguage,
            sourceLanguage: isLanguage(parsed.sourceLanguage) ? parsed.sourceLanguage : DEFAULT_SETTINGS.sourceLanguage,
          };
        }
      } catch { /* Keep defaults when local storage is unavailable. */ }
      if (active) {
        setSettings(localSettings);
        setHydrated(true);
      }

      try {
        const client = await getSupabaseUserClient();
        if (client) {
          const { data: { user } } = await client.auth.getUser();
          if (user) {
            const { data } = await client.from("user_settings").select("ui_language,source_language,target_language").eq("user_id", user.id).maybeSingle();
            if (data && isLanguage(data.ui_language) && isLanguage(data.source_language) && isLanguage(data.target_language)) {
              localSettings = { uiLanguage: data.ui_language, sourceLanguage: data.source_language, targetLanguage: data.target_language };
              if (active) setSettings(localSettings);
            } else {
              await client.from("user_settings").upsert({
                user_id: user.id,
                ui_language: localSettings.uiLanguage,
                source_language: localSettings.sourceLanguage,
                target_language: localSettings.targetLanguage,
                settings_json: localSettings,
              }, { onConflict: "user_id" });
            }
          }
        }
      } catch { /* Keep local settings if Supabase is unavailable. */ }

      if (active) {
        setSettings(localSettings);
        setCloudReady(true);
      }
    }
    void loadSettings();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
      /* ignore */
    }
  }, [settings, hydrated]);

  useEffect(() => {
    if (!hydrated || !cloudReady) return;
    void (async () => {
      try {
        const client = await getSupabaseUserClient();
        if (!client) return;
        const { data: { user } } = await client.auth.getUser();
        if (!user) return;
        await client.from("user_settings").upsert({
          user_id: user.id,
          ui_language: settings.uiLanguage,
          source_language: settings.sourceLanguage,
          target_language: settings.targetLanguage,
          settings_json: settings,
        }, { onConflict: "user_id" });
      } catch { /* Keep local settings when the cloud is offline. */ }
    })();
  }, [settings, hydrated, cloudReady]);

  useEffect(() => {
    document.documentElement.lang = settings.uiLanguage;
  }, [settings.uiLanguage]);

  const setUiLanguage = useCallback(
    (uiLanguage: Language) => setSettings((prev) => ({ ...prev, uiLanguage })),
    [],
  );
  const setTargetLanguage = useCallback(
    (targetLanguage: Language) => setSettings((prev) => ({ ...prev, targetLanguage })),
    [],
  );
  const setSourceLanguage = useCallback(
    (sourceLanguage: Language) => setSettings((prev) => ({ ...prev, sourceLanguage })),
    [],
  );

  const value = useMemo<LanguageContextValue>(() => {
    const dictionary = DICTIONARY[settings.uiLanguage];

    const t = (key: TranslationKey, vars?: TranslateVars): string => {
      let text: string = dictionary[key] ?? DICTIONARY.en[key];
      if (vars) {
        for (const [name, replacement] of Object.entries(vars)) {
          text = text.replaceAll(`{${name}}`, String(replacement));
        }
      }
      return text;
    };

    return { ...settings, setUiLanguage, setTargetLanguage, setSourceLanguage, t };
  }, [settings, setUiLanguage, setTargetLanguage, setSourceLanguage]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage(): LanguageContextValue {
  const context = useContext(LanguageContext);
  
  if (!context) {
    const fallbackLang = DEFAULT_SETTINGS.uiLanguage;
    const dictionary = DICTIONARY[fallbackLang] ?? DICTIONARY.en;

    return {
      ...DEFAULT_SETTINGS,
      setUiLanguage: () => {},
      setTargetLanguage: () => {},
      setSourceLanguage: () => {},
      t: (key: TranslationKey, vars?: TranslateVars) => {
        let text: string = dictionary[key] ?? DICTIONARY.en[key] ?? String(key);
        if (vars) {
          for (const [name, replacement] of Object.entries(vars)) {
            text = text.replaceAll(`{${name}}`, String(replacement));
          }
        }
        return text;
      },
    };
  }

  return context;
}
