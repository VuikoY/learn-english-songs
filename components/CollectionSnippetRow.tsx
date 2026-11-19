"use client";

import Image from "next/image";
import { useState } from "react";
import { Globe, Loader2, Play, Trash2 } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";

export type EditableCollectionSnippet = {
  id: string;
  videoId: string;
  title: string;
  start: number;
  duration: number;
  text: string;
};

type Props = {
  snippet: EditableCollectionSnippet;
  onChange: (snippet: EditableCollectionSnippet) => void;
  onPlay: (snippet: EditableCollectionSnippet) => void;
  onRemove?: () => void;
  onCommit?: (snippet: EditableCollectionSnippet) => Promise<void> | void;
  removeBusy?: boolean;
  disabled?: boolean;
};

function roundToTenth(value: number): number {
  return Number(value.toFixed(1));
}

function roundDuration(value: number): number {
  return Math.max(0.1, roundToTenth(value));
}

export default function CollectionSnippetRow({
  snippet,
  onChange,
  onPlay,
  onRemove,
  onCommit,
  removeBusy = false,
  disabled = false,
}: Props) {
  const { sourceLanguage, targetLanguage, t } = useLanguage();
  const [translation, setTranslation] = useState<{ expanded: boolean; loading: boolean; text?: string; error?: string }>({ expanded: false, loading: false });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);

  async function commit(updated: EditableCollectionSnippet) {
    const rounded = { ...updated, start: roundToTenth(updated.start), duration: roundDuration(updated.duration) };
    onChange(rounded);
    if (!onCommit) return;
    if (!rounded.text.trim() || !Number.isFinite(rounded.start) || rounded.start < 0 ||
      !Number.isFinite(rounded.duration) || rounded.duration <= 0) {
      setSaveError(true);
      return;
    }
    setSaving(true);
    setSaveError(false);
    try {
      await onCommit(rounded);
      setTranslation({ expanded: false, loading: false });
    } catch {
      setSaveError(true);
    } finally {
      setSaving(false);
    }
  }

  async function toggleTranslation() {
    if (translation.expanded) {
      setTranslation((current) => ({ ...current, expanded: false }));
      return;
    }
    if (translation.text) {
      setTranslation((current) => ({ ...current, expanded: true }));
      return;
    }
    setTranslation({ expanded: true, loading: true });
    try {
      const response = await fetch("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: snippet.text, sourceLang: sourceLanguage, targetLang: targetLanguage }),
      });
      const result: unknown = await response.json().catch(() => null);
      const payload = typeof result === "object" && result !== null
        ? result as { translation?: unknown; error?: unknown }
        : null;
      if (!response.ok || typeof payload?.translation !== "string" || !payload.translation.trim()) {
        const code = typeof payload?.error === "string" ? payload.error : "";
        const error = code === "unsupported_language"
          ? t("lyrics.translationUnsupported")
          : code === "invalid_request" ? t("lyrics.translationInvalid") : t("lyrics.translationError");
        setTranslation({ expanded: true, loading: false, error });
        return;
      }
      setTranslation({ expanded: true, loading: false, text: payload.translation as string });
    } catch {
      setTranslation({ expanded: true, loading: false, error: t("lyrics.translationError") });
    }
  }

  return (
    <div className="min-w-[392px] rounded-md border bg-background p-1">
      <div className="grid grid-cols-[32px_64px_60px_minmax(80px,1fr)_60px_32px_32px] items-center gap-1.5">
        <button
          type="button"
          onClick={() => onPlay(snippet)}
          aria-label={t("collections.snippetPlay")}
          title={t("collections.snippetPlay")}
          disabled={disabled}
          className="flex size-8 items-center justify-center rounded-md border hover:bg-muted"
        >
          <Play className="size-4" aria-hidden="true" />
        </button>
        <Image
          src={`https://i.ytimg.com/vi/${snippet.videoId}/hqdefault.jpg`}
          alt={snippet.title}
          width={64}
          height={36}
          unoptimized
          className="h-9 w-16 rounded object-cover"
        />
        <label className="sr-only" htmlFor={`snippet-start-${snippet.id}`}>{t("collections.snippetStart")}</label>
        <input
          id={`snippet-start-${snippet.id}`}
          type="number"
          min="0"
          step="0.1"
          value={Number.isFinite(snippet.start) ? snippet.start : ""}
          onChange={(event) => onChange({ ...snippet, start: event.target.value ? Number(event.target.value) : Number.NaN })}
          onBlur={() => void commit(snippet)}
          disabled={saving || disabled}
          className="h-8 w-full min-w-0 rounded border bg-background px-1.5 text-sm"
        />
        <label className="sr-only" htmlFor={`snippet-text-${snippet.id}`}>{t("collections.snippetText")}</label>
        <input
          id={`snippet-text-${snippet.id}`}
          type="text"
          value={snippet.text}
          maxLength={2000}
          onChange={(event) => {
            onChange({ ...snippet, text: event.target.value });
            setTranslation({ expanded: false, loading: false });
          }}
          onBlur={() => void commit(snippet)}
          disabled={saving || disabled}
          className="h-8 w-full min-w-0 rounded border bg-background px-2 text-sm"
        />
        <label className="sr-only" htmlFor={`snippet-duration-${snippet.id}`}>{t("collections.snippetDuration")}</label>
        <input
          id={`snippet-duration-${snippet.id}`}
          type="number"
          min="0.1"
          step="0.1"
          value={Number.isFinite(snippet.duration) ? snippet.duration : ""}
          onChange={(event) => onChange({ ...snippet, duration: event.target.value ? Number(event.target.value) : Number.NaN })}
          onBlur={() => void commit(snippet)}
          disabled={saving || disabled}
          className="h-8 w-full min-w-0 rounded border bg-background px-1.5 text-sm"
        />
        {onRemove ? (
          <button
            type="button"
            onClick={onRemove}
            disabled={removeBusy || saving || disabled}
            aria-label={t("collections.snippetRemove")}
            title={t("collections.snippetRemove")}
            className="flex size-8 items-center justify-center rounded-md border text-muted-foreground hover:text-destructive disabled:opacity-50"
          >
            {removeBusy ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Trash2 className="size-4" aria-hidden="true" />}
          </button>
        ) : <span />}
        <button
          type="button"
          onClick={() => void toggleTranslation()}
          aria-label={translation.loading ? t("lyrics.translationLoading") : translation.expanded ? t("lyrics.translationHide") : t("lyrics.translateLine")}
          title={translation.loading ? t("lyrics.translationLoading") : translation.expanded ? t("lyrics.translationHide") : t("lyrics.translateLine")}
          aria-expanded={translation.expanded}
          disabled={translation.loading || disabled}
          className="flex size-8 items-center justify-center rounded-md border hover:bg-muted disabled:opacity-50"
        >
          {translation.loading ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Globe className="size-4" aria-hidden="true" />}
        </button>
      </div>
      {translation.expanded && (
        <div className="mt-1 rounded bg-muted/50 px-2 py-1.5 text-sm text-muted-foreground" aria-live="polite">
          {translation.error && <p role="alert" className="text-destructive">{translation.error}</p>}
          {translation.text}
        </div>
      )}
      {saveError && <p role="alert" className="mt-1 text-xs text-destructive">{t("collections.snippetUpdateError")}</p>}
    </div>
  );
}
