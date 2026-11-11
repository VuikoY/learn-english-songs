"use client";

import { useState, type FormEvent } from "react";
import { Edit, Globe, Loader2, Play, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/context/LanguageContext";
import type { LyricLine } from "@/lib/types";

export type QuickEditContext = {
  songId: string;
  lineIndex: number;
  line: LyricLine;
  previousLineIndex?: number;
  previousLine?: LyricLine;
  nextLineIndex?: number;
  nextLine?: LyricLine;
  canEdit: boolean;
};
type QuickEditLineUpdate = { lineIndex: number; line: LyricLine };
export type QuickEditLineSave = {
  songId: string;
  currentLineIndex: number;
  updates: QuickEditLineUpdate[];
  lines?: LyricLine[];
  insert?: { afterIndex: number; line: LyricLine };
  deleteLineIndex?: number;
};

type Props = {
  context?: QuickEditContext;
  onPause: () => void;
  onPlayLine: (seconds: number, lineIndex: number, duration: number) => void;
  onOpenChange?: (open: boolean) => void;
  onSaved?: (save: QuickEditLineSave) => void;
};

type Status = "idle" | "saving" | "saved" | "invalid" | "sign-in" | "not-found" | "error";
type EditableLine = { key: string; lineIndex: number | null; line: LyricLine };
type StructuralChange = { kind: "insert"; afterIndex: number; key: string } | { kind: "delete"; lineIndex: number };
type TranslationState = { loading: boolean; translation?: string; error?: string; expanded: boolean };

function recalculateStart(lines: EditableLine[], lineIndex: number, start: number): EditableLine[] {
  const updated = lines.map((entry) => entry.lineIndex === lineIndex
    ? { ...entry, line: { ...entry.line, start } }
    : entry);

  for (const index of [lineIndex - 1, lineIndex]) {
    const current = updated.find((entry) => entry.lineIndex === index);
    const next = updated.find((entry) => entry.lineIndex === index + 1);
    if (!current || !next) continue;
    const duration = Math.max(0, Number((next.line.start - current.line.start - 0.1).toFixed(2)));
    const currentIndex = updated.indexOf(current);
    updated[currentIndex] = { ...current, line: { ...current.line, duration } };
  }
  return updated;
}

export default function QuickEditLine({ context, onPause, onPlayLine, onOpenChange, onSaved }: Props) {
  const { t, sourceLanguage, targetLanguage } = useLanguage();
  const [open, setOpen] = useState(false);
  const [openedContext, setOpenedContext] = useState<QuickEditContext>();
  const [editableLines, setEditableLines] = useState<EditableLine[]>([]);
  const [structuralChange, setStructuralChange] = useState<StructuralChange | null>(null);
  const [translations, setTranslations] = useState<Record<string, TranslationState>>({});
  const [status, setStatus] = useState<Status>("idle");

  const editContext = open ? openedContext ?? context : context;
  if (!editContext?.canEdit) return null;

  function closeEditor() {
    setOpen(false);
    setOpenedContext(undefined);
    onOpenChange?.(false);
  }

  async function toggleTranslation(key: string) {
    const row = editableLines.find((entry) => entry.key === key);
    if (!row) return;
    const current = translations[key];
    if (current?.expanded) {
      setTranslations((previous) => ({ ...previous, [key]: { ...current, expanded: false } }));
      return;
    }
    if (current?.translation) {
      setTranslations((previous) => ({ ...previous, [key]: { ...current, expanded: true } }));
      return;
    }
    setTranslations((previous) => ({ ...previous, [key]: { loading: true, expanded: true } }));
    try {
      const response = await fetch("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: row.line.text, sourceLang: sourceLanguage, targetLang: targetLanguage }),
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
        setTranslations((previous) => ({ ...previous, [key]: { loading: false, expanded: true, error } }));
        return;
      }
      setTranslations((previous) => ({ ...previous, [key]: { loading: false, expanded: true, translation: payload.translation as string } }));
    } catch (error) {
      console.error("[quick-edit] Could not translate a subtitle line.", {
        errorType: error instanceof Error ? error.name : "UnknownError",
      });
      setTranslations((previous) => ({ ...previous, [key]: { loading: false, expanded: true, error: t("lyrics.translationError") } }));
    }
  }

  async function saveLine(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editContext || status === "saving") return;
    if (editableLines.some(({ line }) =>
      !line.text.trim() || !Number.isFinite(line.start) || line.start < 0 ||
      !Number.isFinite(line.duration) || line.duration < 0,
    ) || editableLines.filter(({ lineIndex }) => lineIndex !== null).length === 0) {
      setStatus("invalid");
      return;
    }

    setStatus("saving");
    try {
      const response = await fetch("/api/songs", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          intent: "line",
          id: editContext.songId,
          currentLineIndex: editContext.lineIndex,
          lineUpdates: editableLines.flatMap(({ lineIndex, line }) => lineIndex === null ? [] : [{
            lineIndex,
            line: { text: line.text.trim(), start: line.start, duration: line.duration },
          }]),
          ...(structuralChange?.kind === "insert" ? {
            insertLine: {
              afterIndex: structuralChange.afterIndex,
              line: editableLines.find(({ key }) => key === structuralChange.key)?.line,
            },
          } : {}),
          ...(structuralChange?.kind === "delete" ? { deleteLineIndex: structuralChange.lineIndex } : {}),
        }),
      });
      const result: unknown = await response.json().catch(() => null);
      const code = typeof result === "object" && result !== null && "code" in result && typeof result.code === "string"
        ? result.code
        : "";
      if (!response.ok) {
        setStatus(code === "SIGN_IN_REQUIRED" ? "sign-in" : code === "LINE_NOT_FOUND" || code === "SONG_NOT_FOUND" ? "not-found" : code === "INVALID_LINE" ? "invalid" : "error");
        return;
      }

      const updates = editableLines.flatMap(({ lineIndex, line }) => {
        if (lineIndex === null) return [];
        const original = lineIndex === editContext.lineIndex
          ? editContext.line
          : lineIndex === editContext.previousLineIndex ? editContext.previousLine : editContext.nextLine;
        const updatedLine = { ...line };
        if (original && updatedLine.text !== original.text) delete updatedLine.translations;
        return [{ lineIndex, line: updatedLine }];
      });
      const insertedLine = structuralChange?.kind === "insert"
        ? editableLines.find(({ key }) => key === structuralChange.key)?.line
        : undefined;
      const savedLines = typeof result === "object" && result !== null && "lines" in result && Array.isArray(result.lines)
        ? result.lines as LyricLine[]
        : undefined;
      onSaved?.({
        songId: editContext.songId,
        currentLineIndex: editContext.lineIndex,
        updates: savedLines
          ? savedLines.map((line, lineIndex) => ({ lineIndex, line }))
          : updates,
        ...(savedLines ? { lines: savedLines } : {}),
        ...(structuralChange?.kind === "insert" && insertedLine
          ? { insert: { afterIndex: structuralChange.afterIndex, line: insertedLine } }
          : {}),
        ...(structuralChange?.kind === "delete" ? { deleteLineIndex: structuralChange.lineIndex } : {}),
      });
      setStatus("saved");
      closeEditor();
    } catch {
      setStatus("error");
    }
  }

  const message = {
    invalid: t("lineEdit.invalid"),
    "sign-in": t("lineEdit.signIn"),
    "not-found": t("lineEdit.notFound"),
    error: t("lineEdit.error"),
    saved: t("lineEdit.saved"),
  }[status === "saving" || status === "idle" ? "error" : status];
  const originalLines: EditableLine[] = [
    ...(editContext.previousLine && editContext.previousLineIndex !== undefined
      ? [{ key: String(editContext.previousLineIndex), lineIndex: editContext.previousLineIndex, line: editContext.previousLine }]
      : []),
    { key: String(editContext.lineIndex), lineIndex: editContext.lineIndex, line: editContext.line },
    ...(editContext.nextLine && editContext.nextLineIndex !== undefined
      ? [{ key: String(editContext.nextLineIndex), lineIndex: editContext.nextLineIndex, line: editContext.nextLine }]
      : []),
  ];

  function updateLine(key: string, field: "text" | "start" | "duration", value: string) {
    const target = editableLines.find((entry) => entry.key === key);
    if (!target) return;
    if (field === "start") {
      const start = value.trim() ? Number(value) : Number.NaN;
      if (!Number.isFinite(start) || start < 0) {
        setEditableLines((current) => current.map((entry) => entry.key === key
          ? { ...entry, line: { ...entry.line, start: Number.NaN } }
          : entry));
        return;
      }
      setEditableLines((current) => target.lineIndex === null
        ? current.map((entry) => entry.key === key ? { ...entry, line: { ...entry.line, start } } : entry)
        : recalculateStart(current, target.lineIndex, start));
      return;
    }

    if (field === "text") {
      setTranslations((previous) => {
        const next = { ...previous };
        delete next[key];
        return next;
      });
    }
    setEditableLines((current) => current.map((entry) => {
      if (entry.key !== key) return entry;
      if (field === "text") return { ...entry, line: { ...entry.line, text: value } };
      const duration = value.trim() ? Number(value) : Number.NaN;
      return { ...entry, line: { ...entry.line, duration: Number.isFinite(duration) && duration >= 0 ? duration : Number.NaN } };
    }));
  }

  function addLineAfter(entry: EditableLine) {
    if (entry.lineIndex === null || structuralChange) return;
    const key = `new:${entry.lineIndex}`;
    setEditableLines((current) => {
      const position = current.findIndex(({ key: currentKey }) => currentKey === entry.key);
      if (position < 0) return current;
      const added: EditableLine = {
        key,
        lineIndex: null,
        line: { text: "", start: Number((entry.line.start + entry.line.duration).toFixed(2)), duration: 0 },
      };
      return [...current.slice(0, position + 1), added, ...current.slice(position + 1)];
    });
    setStructuralChange({ kind: "insert", afterIndex: entry.lineIndex, key });
  }

  function removeLine(entry: EditableLine) {
    if (
      !editContext ||
      entry.lineIndex === null ||
      entry.lineIndex === editContext.lineIndex ||
      structuralChange ||
      editableLines.filter(({ lineIndex }) => lineIndex !== null).length <= 1
    ) return;
    setEditableLines((current) => current.filter(({ key }) => key !== entry.key));
    setStructuralChange({ kind: "delete", lineIndex: entry.lineIndex });
  }

  return (
    <div className="min-w-0">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        title={t("lineEdit.edit")}
        aria-label={t("lineEdit.edit")}
        aria-expanded={open}
        className="size-8 min-w-8 p-0 text-muted-foreground hover:text-foreground"
        onClick={() => {
          if (open) {
            closeEditor();
            return;
          }
          onPause();
          setOpenedContext(context);
          setEditableLines(originalLines.map(({ lineIndex, line }) => ({ key: String(lineIndex), lineIndex, line: { ...line } })));
          setStructuralChange(null);
          setTranslations({});
          setStatus("idle");
          setOpen(true);
          onOpenChange?.(true);
        }}
      >
        {status === "saving" ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Edit className="size-4" aria-hidden="true" />}
      </Button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onKeyDown={(event) => {
          if (event.key === "Escape" && status !== "saving") closeEditor();
        }}>
          <div role="dialog" aria-modal="true" aria-label={t("lineEdit.edit")} className="w-full max-w-6xl overflow-x-auto rounded-xl border bg-card p-5 shadow-xl">
            <form className="grid min-w-[52rem] gap-3 text-left" onSubmit={(event) => void saveLine(event)}>
              {editableLines.map(({ lineIndex, line }) => {
                const key = lineIndex === null ? `new:${structuralChange?.kind === "insert" ? structuralChange.afterIndex : "line"}` : String(lineIndex);
                const label = lineIndex === null ? t("dashboard.addLine") : lineIndex === editContext.lineIndex
                  ? t("lineEdit.current")
                  : lineIndex < editContext.lineIndex ? t("lineEdit.previous") : t("lineEdit.next");
                const translation = translations[key];
                return (
                  <div key={key} className="grid gap-1">
                    <p className="text-xs font-medium text-muted-foreground">{label}</p>
                    <div className="flex min-w-0 items-center gap-1">
                      <Button type="button" variant="outline" aria-label={t("lyrics.playLine")} title={t("lyrics.playLine")} className="h-8 min-h-8 w-8 min-w-8 rounded border px-0" onClick={() => onPlayLine(line.start, lineIndex ?? (structuralChange?.kind === "insert" ? structuralChange.afterIndex + 1 : editContext.lineIndex), line.duration)}><Play className="size-4 fill-current" aria-hidden="true" /></Button>
                      <label className="sr-only" htmlFor={`line-start-${key}`}>{t("lineEdit.start")}</label>
                      <input id={`line-start-${key}`} type="number" min="0" step="0.1" className="h-8 w-16 min-w-16 shrink-0 rounded border bg-background px-1 text-xs" value={Number.isFinite(line.start) ? line.start : ""} onChange={(event) => updateLine(key, "start", event.target.value)} />
                      <label className="sr-only" htmlFor={`line-text-${key}`}>{t("lineEdit.text")}</label>
                      <input id={`line-text-${key}`} autoFocus={lineIndex === editContext.lineIndex} className="h-8 min-w-0 flex-1 rounded border bg-background px-2" value={line.text} onChange={(event) => {
                        if (lineIndex === null) setEditableLines((current) => current.map((entry) => entry.key === key ? { ...entry, line: { ...entry.line, text: event.target.value } } : entry));
                        else updateLine(key, "text", event.target.value);
                      }} />
                      <label className="sr-only" htmlFor={`line-duration-${key}`}>{t("lineEdit.duration")}</label>
                      <input id={`line-duration-${key}`} type="number" min="0" step="0.1" className="h-8 w-16 min-w-16 shrink-0 rounded border bg-background px-1 text-xs" value={Number.isFinite(line.duration) ? line.duration : ""} onChange={(event) => {
                        if (lineIndex === null) setEditableLines((current) => current.map((entry) => entry.key === key ? { ...entry, line: { ...entry.line, duration: event.target.value.trim() ? Number(event.target.value) : Number.NaN } } : entry));
                        else updateLine(key, "duration", event.target.value);
                      }} />
                      <Button type="button" variant="outline" aria-label={t("dashboard.addLine")} title={t("dashboard.addLine")} className="h-8 min-h-8 w-8 min-w-8 rounded border px-0" disabled={structuralChange !== null || lineIndex === null} onClick={() => addLineAfter({ key, lineIndex, line })}><Plus className="size-4" aria-hidden="true" /></Button>
                      <Button type="button" variant="outline" aria-label={t("vocab.delete")} title={t("vocab.delete")} className="h-8 min-h-8 w-8 min-w-8 rounded border px-0 text-destructive" disabled={structuralChange !== null || lineIndex === null || lineIndex === editContext.lineIndex} onClick={() => removeLine({ key, lineIndex, line })}><Trash2 className="size-4" aria-hidden="true" /></Button>
                      <Button type="button" variant="outline" aria-label={translation?.loading ? t("lyrics.translationLoading") : translation?.expanded ? t("lyrics.translationHide") : t("lyrics.translateLine")} title={translation?.loading ? t("lyrics.translationLoading") : translation?.expanded ? t("lyrics.translationHide") : t("lyrics.translateLine")} aria-expanded={Boolean(translation?.expanded)} className="h-8 min-h-8 w-8 min-w-8 rounded border px-0" disabled={translation?.loading} onClick={() => void toggleTranslation(key)}>{translation?.loading ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Globe className="size-4" aria-hidden="true" />}</Button>
                    </div>
                    {translation?.expanded && <div className="ml-[5.5rem] rounded bg-muted/50 px-3 py-2 text-sm text-muted-foreground" aria-live="polite">{translation.loading && t("lyrics.translationLoading")}{translation.error && <p role="alert" className="text-destructive">{translation.error}</p>}{translation.translation && <p>{translation.translation}</p>}</div>}
                  </div>
                );
              })}
              {status !== "idle" && status !== "saving" && <p role="alert" className="text-sm text-destructive">{message}</p>}
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" size="sm" onClick={closeEditor}>{t("lineEdit.cancel")}</Button>
                <Button type="submit" size="sm" disabled={status === "saving"}>
                  {status === "saving" && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
                  {status === "saving" ? t("lineEdit.saving") : t("lineEdit.save")}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
      {!open && status === "saved" && <span className="sr-only" role="status">{t("lineEdit.saved")}</span>}
    </div>
  );
}
