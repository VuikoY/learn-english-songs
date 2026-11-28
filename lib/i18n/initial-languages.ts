import { isLanguage, isLearningLanguage, type Language, type LanguageSettings } from "@/types/game";

type InitialLanguageOptions = {
  settingsCookie?: string;
  uiLanguageCookie?: string;
  acceptLanguage?: string;
  savedSettings?: Partial<LanguageSettings> | null;
};

const FALLBACK_LANGUAGE: Language = "en";

function parseSettingsCookie(value?: string): Partial<LanguageSettings> | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as Partial<LanguageSettings>;
  } catch {
    try {
      return JSON.parse(decodeURIComponent(value)) as Partial<LanguageSettings>;
    } catch {
      return null;
    }
  }
}

function languageFromAcceptLanguage(header?: string): Language {
  const candidates = (header ?? "")
    .split(",")
    .map((part, index) => {
      const [rawTag, ...parameters] = part.trim().split(";");
      const quality = parameters
        .map((parameter) => /^\s*q\s*=\s*(0(?:\.\d+)?|1(?:\.0+)?)\s*$/iu.exec(parameter)?.[1])
        .find(Boolean);
      return {
        language: rawTag?.split("-")[0]?.toLowerCase(),
        quality: quality === undefined ? 1 : Number(quality),
        index,
      };
    })
    .filter((candidate) => candidate.quality > 0)
    .sort((left, right) => right.quality - left.quality || left.index - right.index);

  const supported = candidates.find((candidate) => isLanguage(candidate.language));
  return supported && isLanguage(supported.language) ? supported.language : FALLBACK_LANGUAGE;
}

/** Resolves a single initial language tuple for both SSR and client initialization. */
export function getInitialLanguages(options: InitialLanguageOptions = {}): LanguageSettings {
  const saved = options.savedSettings ?? parseSettingsCookie(options.settingsCookie) ?? {};
  const nativeLanguage = isLanguage(saved.targetLanguage)
    ? saved.targetLanguage
    : languageFromAcceptLanguage(options.acceptLanguage);
  const defaultLearningLanguage = nativeLanguage === "en" ? "pl" : "en";
  const learningLanguage = isLearningLanguage(saved.sourceLanguage) && saved.sourceLanguage !== nativeLanguage
    ? saved.sourceLanguage
    : defaultLearningLanguage;

  return {
    uiLanguage: isLanguage(saved.uiLanguage)
      ? saved.uiLanguage
      : isLanguage(options.uiLanguageCookie)
        ? options.uiLanguageCookie
        : nativeLanguage,
    targetLanguage: nativeLanguage,
    sourceLanguage: learningLanguage,
  };
}
