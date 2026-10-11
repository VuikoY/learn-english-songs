// components/LanguageSwitcher.tsx
"use client";

import { Globe } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { LANGUAGE_CODES, LANGUAGES, isLanguage, type Language } from "@/types/game";

type FieldProps = {
  id: string;
  label: string;
  value: Language;
  onChange: (language: Language) => void;
};

function LanguageField({ id, label, value, onChange }: FieldProps) {
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="text-xs font-medium text-muted-foreground">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => {
          if (isLanguage(e.target.value)) onChange(e.target.value);
        }}
        className="h-9 w-full rounded-md border bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {LANGUAGE_CODES.map((code) => (
          <option key={code} value={code}>
            {LANGUAGES[code].label} — {LANGUAGES[code].nativeName}
          </option>
        ))}
      </select>
    </div>
  );
}

export default function LanguageSwitcher() {
  const {
    t,
    uiLanguage,
    targetLanguage,
    sourceLanguage,
    setUiLanguage,
    setTargetLanguage,
    setSourceLanguage,
  } = useLanguage();

  return (
    // <details> — вбудований у браузер випадаючий блок, JS для відкриття не потрібен
    <details className="relative">
      <summary className="flex h-8 cursor-pointer list-none items-center gap-1.5 rounded-md px-2 text-sm hover:bg-muted [&::-webkit-details-marker]:hidden">
        <Globe className="size-4" aria-hidden />
        <span>
          {LANGUAGES[sourceLanguage].label} → {LANGUAGES[targetLanguage].label}
        </span>
        <span className="sr-only">{t("lang.settings")}</span>
      </summary>

      <div className="absolute right-0 z-50 mt-2 w-64 space-y-3 rounded-xl border bg-popover p-3 shadow-lg">
        <LanguageField id="lang-ui" label={t("lang.ui")} value={uiLanguage} onChange={setUiLanguage} />
        <LanguageField
          id="lang-target"
          label={t("lang.target")}
          value={targetLanguage}
          onChange={setTargetLanguage}
        />
        <LanguageField
          id="lang-source"
          label={t("lang.source")}
          value={sourceLanguage}
          onChange={setSourceLanguage}
        />
      </div>
    </details>
  );
}
