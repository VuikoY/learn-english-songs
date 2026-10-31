"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Loader2, Trash2 } from "lucide-react";
import SnippetPlayer, { type SnippetPlayerHandle } from "@/components/SnippetPlayer";
import WordBank from "@/components/game/WordBank";
import { useAuthState } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { buildRound, buildWordPool, firstLetterOf, normalizeLetter, sameWord } from "@/lib/game/buildRound";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { Difficulty, GameSettings, Round, WordToken } from "@/types/game";

type Collection = { id: string; title: string; isPublic: boolean; isOwner: boolean };
type CollectionItem = {
  id: string;
  songId: string;
  youtubeId: string;
  songTitle: string;
  lineText: string;
  startTime: number;
  endTime: number;
};
type CollectionMode = "text" | GameSettings["mode"];

function maskWordPreservingApostrophes(word: string): string {
  return Array.from(word, (character) => /['’]/u.test(character) ? character : "\u2022").join("");
}

function isCollectionList(value: unknown): value is { collections: Collection[] } {
  if (typeof value !== "object" || value === null || !("collections" in value) || !Array.isArray(value.collections)) return false;
  return value.collections.every((item) =>
    typeof item === "object" && item !== null &&
    "id" in item && typeof item.id === "string" &&
    "title" in item && typeof item.title === "string" &&
    "isPublic" in item && typeof item.isPublic === "boolean" &&
    "isOwner" in item && typeof item.isOwner === "boolean",
  );
}

export default function WordCollectionPage() {
  return (
    <Suspense fallback={<main className="mx-auto w-full max-w-6xl px-4 py-8" aria-busy="true" />}>
      <WordCollectionContent />
    </Suspense>
  );
}

function WordCollectionContent() {
  const params = useParams<{ collectionId: string }>();
  const collectionId = params.collectionId;
  const { loading: authLoading } = useAuthState();
  const { t } = useLanguage();
  const [mode, setMode] = useState<CollectionMode>("text");
  const [difficulty, setDifficulty] = useState<Difficulty>("hard");
  const [collection, setCollection] = useState<Collection | null>(null);
  const [items, setItems] = useState<CollectionItem[]>([]);
  const [position, setPosition] = useState(0);
  const [clipEnded, setClipEnded] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [answerChecked, setAnswerChecked] = useState(false);
  const [consecutiveMistakes, setConsecutiveMistakes] = useState(0);
  const [round, setRound] = useState<Round | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [playerError, setPlayerError] = useState(false);
  const [removeError, setRemoveError] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [visibilitySaving, setVisibilitySaving] = useState(false);
  const [visibilityError, setVisibilityError] = useState(false);
  const [linkCopyStatus, setLinkCopyStatus] = useState<"idle" | "copied" | "error">("idle");
  const playerRef = useRef<SnippetPlayerHandle>(null);
  const currentItem = items[position] ?? null;
  const wordPool = useMemo(() => buildWordPool(items.map((item) => item.lineText)), [items]);
  const nextBlank = round?.tokens.find((token) => token.hidden && !round.filledIds.includes(token.id));
  const isRoundComplete = round !== null && nextBlank === undefined;
  const hiddenWordCount = round?.tokens.filter((token) => token.hidden).length ?? 0;
  const completedWordCount = round?.filledIds.length ?? 0;
  const wordProgress = hiddenWordCount > 0 ? Math.round((completedWordCount / hiddenWordCount) * 100) : 0;
  const collectionProgress = items.length > 0
    ? Math.round(((completed ? items.length : position + 1) / items.length) * 100)
    : 0;

  const buildCollectionRound = useCallback((index: number, activeMode: GameSettings["mode"], activeDifficulty = difficulty) => {
    const item = items[index];
    return item ? buildRound(index, item.lineText, { mode: activeMode, difficulty: activeDifficulty }, wordPool) : null;
  }, [difficulty, items, wordPool]);

  const loadCollection = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const response = await fetch("/api/word-collections");
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok || !isCollectionList(payload)) throw new Error("COLLECTIONS_FAILED");
      const selected = payload.collections.find((item) => item.id === collectionId);
      if (!selected) throw new Error("COLLECTION_NOT_FOUND");
      const db = getSupabaseBrowserClient();
      if (!db) throw new Error("SERVICE_UNAVAILABLE");
      const { data: itemRows, error: itemError } = await db
        .from("collection_items")
        .select("id,song_id,line_text,start_time,end_time")
        .eq("collection_id", collectionId)
        .order("created_at", { ascending: true });
      if (itemError) throw itemError;

      const songIds = [...new Set((itemRows ?? []).map((item) => item.song_id))];
      const { data: songRows, error: songError } = songIds.length > 0
        ? await db.from("songs").select("id,youtube_id,title").in("id", songIds)
        : { data: [], error: null };
      if (songError) throw songError;
      const songsById = new Map((songRows ?? []).map((song) => [song.id, song]));
      const loadedItems = (itemRows ?? []).flatMap((item): CollectionItem[] => {
        const song = songsById.get(item.song_id);
        if (!song) return [];
        return [{
          id: item.id,
          songId: item.song_id,
          youtubeId: song.youtube_id,
          songTitle: song.title,
          lineText: item.line_text,
          startTime: Number(item.start_time),
          endTime: Number(item.end_time),
        }];
      });
      setCollection(selected);
      setItems(loadedItems);
      setPosition(0);
      setRound(null);
      setClipEnded(false);
      setCompleted(false);
      setAnswerChecked(false);
      setConsecutiveMistakes(0);
      setPlayerError(false);
    } catch (loadError) {
      console.error("[collections] Could not load collection.", {
        errorType: loadError instanceof Error ? loadError.name : "UnknownError",
      });
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [collectionId]);

  useEffect(() => {
    if (authLoading) return;
    let active = true;
    void Promise.resolve().then(() => active ? loadCollection() : undefined);
    return () => { active = false; };
  }, [authLoading, loadCollection]);

  async function changeVisibility() {
    if (!collection?.isOwner || visibilitySaving) return;
    setVisibilitySaving(true);
    setVisibilityError(false);
    try {
      const response = await fetch(`/api/word-collections/${encodeURIComponent(collectionId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isPublic: !collection.isPublic }),
      });
      const payload: unknown = await response.json().catch(() => null);
      if (
        !response.ok ||
        typeof payload !== "object" ||
        payload === null ||
        !("isPublic" in payload) ||
        typeof payload.isPublic !== "boolean"
      ) throw new Error("VISIBILITY_UPDATE_FAILED");
      setCollection({ ...collection, isPublic: payload.isPublic });
      setLinkCopyStatus("idle");
    } catch {
      setVisibilityError(true);
    } finally {
      setVisibilitySaving(false);
    }
  }

  async function copyCollectionLink() {
    setLinkCopyStatus("idle");
    try {
      await navigator.clipboard.writeText(window.location.href);
      setLinkCopyStatus("copied");
    } catch {
      setLinkCopyStatus("error");
    }
  }

  async function removeItem(itemId: string) {
    if (removingId) return;
    setRemovingId(itemId);
    setRemoveError(false);
    try {
      const response = await fetch(`/api/word-collections/${encodeURIComponent(collectionId)}/items`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId }),
      });
      if (!response.ok) throw new Error("ITEM_DELETE_FAILED");
      const remaining = items.filter((item) => item.id !== itemId);
      const removedPosition = items.findIndex((item) => item.id === itemId);
      const removedCurrentItem = removedPosition === position;
      const nextPosition = Math.min(
        position > removedPosition ? position - 1 : position,
        Math.max(remaining.length - 1, 0),
      );
      setItems(remaining);
      setPosition(nextPosition);
      if (removedCurrentItem) {
        setRound(mode === "text" ? null : buildRound(nextPosition, remaining[nextPosition]?.lineText ?? "", {
          mode,
          difficulty,
        }, buildWordPool(remaining.map((item) => item.lineText))));
        setClipEnded(false);
        setCompleted(false);
        setAnswerChecked(false);
        setConsecutiveMistakes(0);
        setPlayerError(false);
      }
    } catch {
      setRemoveError(true);
    } finally {
      setRemovingId(null);
    }
  }

  const goToItem = useCallback((nextPosition: number) => {
    if (nextPosition < 0 || nextPosition >= items.length) return;
    setCompleted(false);
    setPosition(nextPosition);
    setRound(mode === "text" ? null : buildCollectionRound(nextPosition, mode));
    setClipEnded(false);
    setAnswerChecked(false);
    setConsecutiveMistakes(0);
    setPlayerError(false);
  }, [buildCollectionRound, items.length, mode]);

  const advanceToNextItem = useCallback(() => {
    if (position + 1 >= items.length) {
      setCompleted(true);
      return;
    }
    goToItem(position + 1);
  }, [goToItem, items.length, position]);

  function chooseMode(nextMode: CollectionMode) {
    if (nextMode === mode) return;
    setMode(nextMode);
    setPosition(0);
    setCompleted(false);
    setClipEnded(false);
    setAnswerChecked(false);
    setConsecutiveMistakes(0);
    setPlayerError(false);
    setRound(nextMode === "text" ? null : buildCollectionRound(0, nextMode));
    playerRef.current?.replay();
  }

  function changeDifficulty(nextDifficulty: Difficulty) {
    setDifficulty(nextDifficulty);
    setConsecutiveMistakes(0);
    setAnswerChecked(false);
    if (mode !== "text") setRound(buildCollectionRound(position, mode, nextDifficulty));
  }

  const registerCorrect = useCallback((token: WordToken, bankItemId?: string) => {
    setAnswerChecked(false);
    setConsecutiveMistakes(0);
    setRound((previous) => previous ? {
      ...previous,
      filledIds: [...previous.filledIds, token.id],
      bank: bankItemId
        ? previous.bank.map((item) => item.id === bankItemId ? { ...item, used: true } : item)
        : previous.bank,
    } : previous);
  }, []);

  const registerWrong = useCallback((token: WordToken) => {
    setAnswerChecked(true);
    const mistakes = consecutiveMistakes + 1;
    setConsecutiveMistakes(mistakes);
    if (mistakes < 3) return;
    setAnswerChecked(false);
    setConsecutiveMistakes(0);
    setRound((previous) => previous ? {
      ...previous,
      filledIds: [...previous.filledIds, token.id],
      revealedIds: [...previous.revealedIds, token.id],
    } : previous);
  }, [consecutiveMistakes]);

  function pickWord(word: string, bankItemId?: string) {
    if (!clipEnded || !nextBlank) return;
    if (sameWord(word, nextBlank.core)) registerCorrect(nextBlank, bankItemId);
    else registerWrong(nextBlank);
  }

  const handleLetter = useCallback((letter: string) => {
    if (!clipEnded || mode !== "first-letter" || !nextBlank) return;
    if (normalizeLetter(letter) === normalizeLetter(firstLetterOf(nextBlank))) registerCorrect(nextBlank);
    else registerWrong(nextBlank);
  }, [clipEnded, mode, nextBlank, registerCorrect, registerWrong]);

  const letterHandlerRef = useRef(handleLetter);
  useEffect(() => {
    letterHandlerRef.current = handleLetter;
  });

  useEffect(() => {
    if (!clipEnded || mode !== "first-letter" || !nextBlank || completed) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.ctrlKey || event.metaKey || event.altKey || event.key.length !== 1 || !/\p{L}/u.test(event.key)) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      event.preventDefault();
      letterHandlerRef.current(event.key);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [clipEnded, completed, mode, nextBlank]);

  useEffect(() => {
    if (!clipEnded || mode === "text" || !isRoundComplete || completed) return;
    const timeoutId = window.setTimeout(advanceToNextItem, 700);
    return () => window.clearTimeout(timeoutId);
  }, [advanceToNextItem, clipEnded, completed, isRoundComplete, mode]);

  function restartCollection() {
    setPosition(0);
    setCompleted(false);
    setClipEnded(false);
    setAnswerChecked(false);
    setConsecutiveMistakes(0);
    setPlayerError(false);
    setRound(mode === "text" ? null : buildCollectionRound(0, mode));
    playerRef.current?.replay();
  }

  function replayClip() {
    setClipEnded(false);
    setAnswerChecked(false);
    playerRef.current?.replay();
  }

  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 px-4 py-8">
      <Link href="/collections" className="inline-flex items-center gap-2 text-sm text-primary underline-offset-4 hover:underline">
        <ArrowLeft className="size-4" aria-hidden="true" />
        {t("nav.collections")}
      </Link>

      {authLoading ? (
        <p role="status" className="flex items-center gap-2 text-muted-foreground"><Loader2 className="size-4 animate-spin" />{t("collections.loading")}</p>
      ) : loading ? (
        <p role="status" className="flex items-center gap-2 text-muted-foreground"><Loader2 className="size-4 animate-spin" />{t("collections.loading")}</p>
      ) : error ? (
        <p role="alert" className="text-destructive">{t("collections.loadError")}</p>
      ) : collection ? (
        <>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <h1 className="text-3xl font-bold">{collection.title}</h1>
            <span className="rounded-full border px-3 py-1 text-sm text-muted-foreground">
              {collection.isPublic ? t("collections.publicBadge") : t("collections.privateBadge")}
            </span>
          </div>
          {collection.isOwner && (
            <section className="flex flex-wrap items-center justify-between gap-4 rounded-xl border bg-card p-4">
              <div>
                <p className="font-medium">
                  {collection.isPublic ? t("collections.visibilityPublic") : t("collections.visibilityPrivate")}
                </p>
                {visibilityError && <p role="alert" className="mt-1 text-sm text-destructive">{t("collections.visibilityError")}</p>}
                {linkCopyStatus === "copied" && <p role="status" className="mt-1 text-sm text-emerald-700 dark:text-emerald-300">{t("collections.linkCopied")}</p>}
                {linkCopyStatus === "error" && <p role="alert" className="mt-1 text-sm text-destructive">{t("collections.linkCopyError")}</p>}
              </div>
              <div className="flex flex-wrap gap-2">
                {collection.isPublic && (
                  <button type="button" onClick={() => void copyCollectionLink()} className="rounded-md border px-3 py-2 text-sm">
                    {t("collections.copyLink")}
                  </button>
                )}
                <button
                  type="button"
                  disabled={visibilitySaving}
                  onClick={() => void changeVisibility()}
                  className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
                >
                  {visibilitySaving ? t("globalSearch.saving") : t(collection.isPublic ? "collections.makePrivate" : "collections.makePublic")}
                </button>
              </div>
            </section>
          )}
          {removeError && <p role="alert" className="text-sm text-destructive">{t("collections.removeError")}</p>}
          {items.length === 0 ? (
            <p className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">{t("collections.noItems")}</p>
          ) : completed ? (
            <section className="rounded-xl border bg-card p-8 text-center">
              <p role="status" className="text-xl font-semibold">{t("collections.complete")}</p>
              <button type="button" onClick={restartCollection} className="mt-4 rounded-md border px-4 py-2 text-sm">
                {t("game.playAgain")}
              </button>
            </section>
          ) : (
            <section className="space-y-5 rounded-xl border bg-card p-4 sm:p-6">
              <div className="flex flex-wrap gap-2" role="group" aria-label={t("game.mode.label")}>
                {(["text", "fill-blanks", "first-letter"] as const).map((collectionMode) => (
                  <button
                    key={collectionMode}
                    type="button"
                    aria-pressed={mode === collectionMode}
                    onClick={() => chooseMode(collectionMode)}
                    className={`rounded-full border px-4 py-2 text-sm transition-colors ${mode === collectionMode ? "border-primary bg-primary font-semibold text-primary-foreground" : "hover:bg-muted"}`}
                  >
                    {t(collectionMode === "text" ? "nav.read" : collectionMode === "fill-blanks" ? "game.mode.fillBlanks" : "game.mode.firstLetter")}
                  </button>
                ))}
              </div>
              {mode !== "text" && (
                <label className="flex flex-wrap items-center gap-2 text-sm">
                  <span>{t("game.difficulty.label")}</span>
                  <select
                    value={difficulty}
                    onChange={(event) => {
                      const value = event.target.value;
                      if (value === "easy" || value === "medium" || value === "hard") changeDifficulty(value);
                    }}
                    className="h-9 rounded-md border bg-background px-2"
                  >
                    {(["easy", "medium", "hard"] as const).map((level) => (
                      <option key={level} value={level}>{t(`game.difficulty.${level}`)}</option>
                    ))}
                  </select>
                </label>
              )}
              {currentItem && (
                <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium">
                  {t("collections.itemProgress", { current: position + 1, total: items.length })}
                </p>
                <p className="text-sm text-muted-foreground">{currentItem.songTitle}</p>
              </div>
              <div
                role="progressbar"
                aria-label={t("collections.itemProgress", { current: position + 1, total: items.length })}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={collectionProgress}
                className="h-2 overflow-hidden rounded-full bg-muted"
              >
                <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${collectionProgress}%` }} />
              </div>
              <SnippetPlayer
                key={currentItem.id}
                ref={playerRef}
                videoId={currentItem.youtubeId}
                startTime={currentItem.startTime}
                endTime={currentItem.endTime}
                onEnded={() => { setClipEnded(true); setPlayerError(false); }}
                onError={() => setPlayerError(true)}
              />
              {playerError && <p role="alert" className="text-sm text-destructive">{t("collections.playerError")}</p>}
              <p className="text-sm text-muted-foreground">
                {t(mode === "text" ? "collections.textInstruction" : "collections.instruction")}
              </p>
              {!clipEnded && <p className="text-xs text-muted-foreground">{t("collections.waitForEnd")}</p>}
              {mode === "text" && (
                <>
                  <p className="rounded-xl border bg-background p-4 text-lg leading-relaxed">{currentItem.lineText}</p>
                  {clipEnded && (
                    <button type="button" onClick={advanceToNextItem} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
                      {t("collections.nextPhrase")}
                    </button>
                  )}
                </>
              )}
              {mode !== "text" && round && (
                <>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm text-muted-foreground">
                      <span>{t("game.words")}</span>
                      <span>{completedWordCount} / {hiddenWordCount}</span>
                    </div>
                    <div
                      role="progressbar"
                      aria-label={t("game.wordProgress")}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={wordProgress}
                      className="h-2 overflow-hidden rounded-full bg-muted"
                    >
                      <div className="h-full rounded-full bg-emerald-500 transition-[width]" style={{ width: `${wordProgress}%` }} />
                    </div>
                  </div>
                  <div className="rounded-xl border bg-background p-4">
                    <p className="flex flex-wrap gap-x-2 gap-y-3 text-lg leading-relaxed">
                      {round.tokens.map((token) => {
                        if (!token.hidden || round.filledIds.includes(token.id)) {
                          const revealed = round.revealedIds.includes(token.id);
                          return <span key={token.id} className={revealed ? "text-amber-700 dark:text-amber-300" : ""}>{token.raw}</span>;
                        }
                        return (
                          <span key={token.id}>
                            {token.leading}
                            <span
                              role="img"
                              aria-label={t("game.hiddenWord")}
                              className="inline-flex min-w-8 items-center justify-center px-1 text-center leading-none"
                            >
                              {mode === "first-letter" ? maskWordPreservingApostrophes(token.core) : "___"}
                            </span>
                            {token.trailing}
                          </span>
                        );
                      })}
                    </p>
                  </div>
                  {answerChecked && <p role="alert" className="text-sm text-destructive">{t("collections.incorrect")}</p>}
                  {isRoundComplete && <p role="status" className="text-sm font-medium text-emerald-700 dark:text-emerald-300">{t("collections.phraseComplete")}</p>}
                  {mode === "fill-blanks" && (
                    <WordBank items={round.bank} onPick={(item) => pickWord(item.text, item.id)} disabled={!clipEnded || isRoundComplete} />
                  )}
                  {mode === "first-letter" && nextBlank && (
                    <label className="flex items-center gap-3 text-sm">
                      <span>{t("collections.firstLetterInput")}</span>
                      <input
                        aria-label={t("collections.firstLetterInput")}
                        autoComplete="off"
                        autoCapitalize="off"
                        maxLength={1}
                        disabled={!clipEnded}
                        onChange={(event) => {
                          const letter = event.target.value;
                          if (letter) handleLetter(letter);
                          event.target.value = "";
                        }}
                        className="size-11 rounded-md border bg-background text-center text-lg disabled:opacity-60"
                      />
                    </label>
                  )}
                </>
              )}
              <div className="flex flex-wrap gap-2 border-t pt-4">
                <button type="button" disabled={position === 0} onClick={() => goToItem(position - 1)} className="rounded-md border px-3 py-2 text-sm disabled:opacity-50">
                  {t("game.previous")}
                </button>
                <button type="button" onClick={replayClip} className="rounded-md border px-3 py-2 text-sm">
                  {t(clipEnded ? "collections.replay" : "collections.playSnippet")}
                </button>
                <Link href="/collections" className="rounded-md border px-3 py-2 text-sm">
                  {t("game.quit")}
                </Link>
              </div>
                </>
              )}
              <div className="border-t pt-4">
                <h2 className="mb-2 text-sm font-semibold">{t("collections.title")}</h2>
                <ul className="space-y-2">
                  {items.map((item, index) => (
                    <li key={item.id} className={`flex items-center justify-between gap-3 rounded-md px-2 py-2 text-sm ${index === position ? "bg-muted" : ""}`}>
                      <button type="button" onClick={() => goToItem(index)} className="min-w-0 flex-1 truncate text-left">
                        {t("collections.itemProgress", { current: index + 1, total: items.length })} · {item.songTitle}
                      </button>
                      {collection.isOwner && <button
                        type="button"
                        disabled={removingId !== null}
                        onClick={() => void removeItem(item.id)}
                        aria-label={t("collections.removeItem")}
                        title={t("collections.removeItem")}
                        className="rounded p-2 text-muted-foreground hover:text-destructive disabled:opacity-50"
                      >
                        {removingId === item.id ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
                      </button>}
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          )}
        </>
      ) : null}
    </main>
  );
}
