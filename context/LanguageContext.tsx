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

const STORAGE_KEY = "lingo-clips:language-settings";

const DEFAULT_SETTINGS: LanguageSettings = {
  uiLanguage: "uk",
  targetLanguage: "uk",
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

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed: Partial<Record<keyof LanguageSettings, unknown>> = JSON.parse(raw);
        setSettings({
          uiLanguage: isLanguage(parsed.uiLanguage) ? parsed.uiLanguage : DEFAULT_SETTINGS.uiLanguage,
          targetLanguage: isLanguage(parsed.targetLanguage)
            ? parsed.targetLanguage
            : DEFAULT_SETTINGS.targetLanguage,
          sourceLanguage: isLanguage(parsed.sourceLanguage)
            ? parsed.sourceLanguage
            : DEFAULT_SETTINGS.sourceLanguage,
        });
      }
    } catch {
      /* ignore */
    }
    setHydrated(true);
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