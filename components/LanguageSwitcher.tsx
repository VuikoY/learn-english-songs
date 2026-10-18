// components/LanguageSwitcher.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { LANGUAGE_CODES, LEARNING_LANGUAGE_CODES, LANGUAGES, isLanguage, type Language } from "@/types/game";
import LanguageFlag from "@/components/LanguageFlag";

type FieldProps = {
  id: string;
  label: string;
  value: Language;
  onChange: (language: Language) => void;
  options?: readonly Language[];
};

function LanguageField({ id, label, value, onChange, options = LANGUAGE_CODES }: FieldProps) {
  const fieldRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function closeOutside(event: PointerEvent) {
      if (event.target instanceof Node && !fieldRef.current?.contains(event.target)) setOpen(false);
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  return (
    <div ref={fieldRef} className="relative space-y-1">
      <span id={`${id}-label`} className="text-xs font-medium text-muted-foreground">
        {label}
      </span>
      <div id={id}>
        <button type="button" aria-labelledby={`${id}-label`} aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((current) => !current)} className="flex h-9 w-full items-center justify-between gap-2 rounded-md border bg-background px-2 text-left text-sm outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring">
          <span className="flex items-center gap-2"><LanguageFlag code={value} />{LANGUAGES[value].nativeName}</span>
          <ChevronDown className={`size-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />
        </button>
      </div>
      {open && (
        <div role="listbox" aria-label={label} className="mt-1 max-h-56 w-full overflow-y-auto rounded-md border bg-background p-1 shadow-lg">
          {options.map((code) => (
            <button key={code} type="button" role="option" aria-selected={code === value} onClick={() => {
              if (isLanguage(code)) onChange(code);
              setOpen(false);
            }} className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-muted aria-selected:bg-muted">
              <LanguageFlag code={code} />{LANGUAGES[code].nativeName}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function LanguageSwitcher() {
  const menuRef = useRef<HTMLDetailsElement>(null);
  const {
    t,
    uiLanguage,
    targetLanguage,
    sourceLanguage,
    setUiLanguage,
    setTargetLanguage,
    setSourceLanguage,
  } = useLanguage();

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      if (event.target instanceof Node && !menuRef.current?.contains(event.target)) {
        menuRef.current?.removeAttribute("open");
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") menuRef.current?.removeAttribute("open");
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  return (
    // The native details element provides disclosure behavior without JavaScript.
    <details ref={menuRef} className="relative shrink-0">
      <summary className="flex h-8 cursor-pointer list-none items-center rounded-md px-1.5 text-sm hover:bg-muted [&::-webkit-details-marker]:hidden">
        <span className="inline-flex items-center gap-1 whitespace-nowrap">
          <LanguageFlag code={targetLanguage} />
          <span aria-hidden="true">→</span>
          <LanguageFlag code={sourceLanguage} />
        </span>
        <span className="sr-only">{t("lang.settings")}: {LANGUAGES[targetLanguage].nativeName} → {LANGUAGES[sourceLanguage].nativeName}</span>
      </summary>

      <div className="absolute right-0 z-50 mt-2 w-64 space-y-3 rounded-xl border bg-background p-3 shadow-lg">
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
          onChange={(language) => { if (language === "en" || language === "pl") setSourceLanguage(language); }}
          options={LEARNING_LANGUAGE_CODES}
        />
        <LanguageField id="lang-ui" label={t("lang.ui")} value={uiLanguage} onChange={setUiLanguage} />
      </div>
    </details>
  );
}
