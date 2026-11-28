"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpDown, Globe, Loader2, LockKeyhole, Shuffle, SkipForward } from "lucide-react";
import { Button } from "@/components/ui/button";
import YouTubePlayer, { type PlayerHandle } from "@/components/YouTubePlayer";
import ExplanationCard, { ExplanationSkeleton, StreamingExplanation } from "@/components/ExplanationCard";
import { useAuthState } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { useStreamingExplanation } from "@/hooks/useStreamingExplanation";
import TranscriptTimingModal, { type TranscriptEditContext, type TranscriptEditSave } from "@/components/TranscriptTimingEditor";
import PhraseMixFavoriteButton from "@/components/game/PhraseMixFavoriteButton";
import WordBank from "@/components/game/WordBank";
import { buildRound, buildWordPool, countHideableWords, firstLetterOf, normalizeLetter, sameWord } from "@/lib/game/buildRound";
import { readExplanationCache } from "@/lib/explanations/cache";
import { AUDIO_END_BUFFER_SECONDS, AUDIO_START_BUFFER_SECONDS } from "@/lib/lyricTiming";
import { queueLearningActivitySave, saveLearningActivity } from "@/lib/learningActivity";
import { requestTranslation } from "@/lib/translation";
import { useDailyWordCounter } from "@/context/DailyWordCounterContext";
import type { Explanation } from "@/lib/types";
import type { Round } from "@/types/game";

type Phrase = {
  songId: string;
  canEdit: boolean;
  collectionItemId?: string;
  youtubeId: string;
  text: string;
  lineIndex: number;
  start: number;
  duration: number;
  sourceType: "media" | "collection";
  sourceTitle: string;
  sourceSlug: string;
  isPublic: boolean | null;
  isFavorite: boolean;
  isCollectionCompleted?: boolean;
  activeRecall?: boolean;
  gameMode?: "fill-blanks" | "first-letter";
  previousLine?: { text: string; start: number; duration: number };
  nextLine?: { text: string; start: number; duration: number };
  lines?: { text: string; start: number; duration: number }[];
};

type Records = { dailyBest: number; allTimeBest: number; date: string };

const GUEST_RECORDS_KEY = "lingo-clips:phrase-mix-records:v1";
const ONLY_FAVORITES_KEY = "lingo-clips:phrase-mix-only-favorites:v1";
const FAVORITE_SOURCES_KEY = "lingo-clips:phrase-mix-favorite-sources:v1";

function readGuestRecords(): Records {
  const date = new Date().toISOString().slice(0, 10);
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(GUEST_RECORDS_KEY) ?? "null");
    if (typeof parsed === "object" && parsed !== null) {
      const value = parsed as Partial<Records>;
      return {
        date,
        dailyBest: value.date === date && Number.isInteger(value.dailyBest) ? value.dailyBest! : 0,
        allTimeBest: Number.isInteger(value.allTimeBest) ? value.allTimeBest! : 0,
      };
    }
  } catch {
    // Browser storage may be unavailable.
  }
  return { date, dailyBest: 0, allTimeBest: 0 };
}

function maskWord(word: string): string {
  return Array.from(word, (character) => /['’]/u.test(character) ? character : "\u2022").join("");
}

function createSessionId(): string {
  const cryptoApi = typeof globalThis.crypto === "undefined" ? undefined : globalThis.crypto;
  if (typeof cryptoApi?.randomUUID === "function") return cryptoApi.randomUUID();

  const bytes = new Uint8Array(16);
  if (typeof cryptoApi?.getRandomValues === "function") {
    cryptoApi.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) bytes[index] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export default function PhraseMixGame() {
  const { t, sourceLanguage, targetLanguage, uiLanguage } = useLanguage();
  const { incrementWordsToday } = useDailyWordCounter();
  const streamExplanation = useStreamingExplanation();
  const router = useRouter();
  const { userId, loading: authLoading } = useAuthState();
  const [favoriteMedia, setFavoriteMedia] = useState(false);
  const [favoriteCollections, setFavoriteCollections] = useState(false);
  const [favoritesPreferenceLoaded, setFavoritesPreferenceLoaded] = useState(false);
  const [phrase, setPhrase] = useState<Phrase | null>(null);
  const [round, setRound] = useState<Round | null>(null);
  const [currentStreak, setCurrentStreak] = useState(0);
  const [consecutiveMistakes, setConsecutiveMistakes] = useState(0);
  const [records, setRecords] = useState<Records>({ date: "", dailyBest: 0, allTimeBest: 0 });
  const [recordsLoading, setRecordsLoading] = useState(true);
  const [loadingPhrase, setLoadingPhrase] = useState(true);
  const [error, setError] = useState<"none" | "empty" | "load" | "save" | "activity-save">("none");
  const [shakeKey, setShakeKey] = useState(0);
  const [recordFlash, setRecordFlash] = useState(false);
  const [explanationStatus, setExplanationStatus] = useState<"closed" | "loading" | "open" | "error">("closed");
  const [explanationError, setExplanationError] = useState("");
  const [remoteExplanation, setRemoteExplanation] = useState<Explanation | null>(null);
  const [partialExplanation, setPartialExplanation] = useState<Partial<Explanation> | null>(null);
  const [lineTranslation, setLineTranslation] = useState<string | null>(null);
  const [lineTranslationStatus, setLineTranslationStatus] = useState<"idle" | "loading" | "error">("idle");
  const [lineTranslationError, setLineTranslationError] = useState("");
  const [translationExpanded, setTranslationExpanded] = useState(false);
  const [transcriptEditOpen, setTranscriptEditOpen] = useState(false);
  const [playerReady, setPlayerReady] = useState(false);
  const [phraseInstanceId, setPhraseInstanceId] = useState(0);
  const [rewardRevealed, setRewardRevealed] = useState(false);
  const [rewardReady, setRewardReady] = useState(false);
  const playerRef = useRef<PlayerHandle>(null);
  const pausedAtBoundaryRef = useRef(false);
  const phraseRequestIdRef = useRef(0);
  const lineTranslationRequestIdRef = useRef(0);
  const phraseRef = useRef<HTMLDivElement>(null);
  const autoStartRef = useRef(false);
  const favoriteFilterKeyRef = useRef<string | null>(null);
  const nextSourceTypeRef = useRef<"media" | "collection">("media");
  const nextCollectionRecallRef = useRef(false);
  const activitySessionIdRef = useRef<string | null>(null);
  const activityWordsCoveredRef = useRef(0);
  const activitySavedRef = useRef(false);
  const autoPlayedPhraseRef = useRef<string | null>(null);
  const nextBlank = round?.tokens.find((token) => token.hidden && !round.filledIds.includes(token.id));

  useEffect(() => {
    nextSourceTypeRef.current = "media";
    nextCollectionRecallRef.current = false;
  }, [favoriteMedia, favoriteCollections, sourceLanguage]);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      try {
        const savedSources: unknown = JSON.parse(localStorage.getItem(FAVORITE_SOURCES_KEY) ?? "null");
        if (active && typeof savedSources === "object" && savedSources !== null) {
          const value = savedSources as { favoriteMedia?: unknown; favoriteCollections?: unknown };
          setFavoriteMedia(value.favoriteMedia === true);
          setFavoriteCollections(value.favoriteCollections === true);
        } else {
          const legacyPreference = localStorage.getItem(ONLY_FAVORITES_KEY);
          if (active && legacyPreference === "true") {
            setFavoriteMedia(true);
            setFavoriteCollections(true);
          }
        }
      } catch {
        // Keep the default when browser storage is unavailable.
      }
      if (active) setFavoritesPreferenceLoaded(true);
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!favoritesPreferenceLoaded) return;
    try {
      localStorage.setItem(FAVORITE_SOURCES_KEY, JSON.stringify({ favoriteMedia, favoriteCollections }));
    } catch {
      // Skip persistence when browser storage is unavailable.
    }
  }, [favoritesPreferenceLoaded, favoriteMedia, favoriteCollections]);

  useEffect(() => {
    if (authLoading) return;
    let active = true;
    void (async () => {
      if (!userId) {
        const guestRecords = readGuestRecords();
        queueMicrotask(() => {
          if (!active) return;
          setRecords(guestRecords);
          setRecordsLoading(false);
        });
        return;
      }
      try {
        const recordsResponse = await fetch("/api/phrase-mix?action=records", { cache: "no-store" });
        const recordsResult = await recordsResponse.json().catch(() => null) as { records?: Records } | null;
        if (!recordsResponse.ok || !recordsResult?.records) throw new Error("Record lookup failed");
        if (active) setRecords(recordsResult.records);
      } catch {
        if (active) setError("save");
      } finally {
        if (active) setRecordsLoading(false);
      }
    })();
    return () => { active = false; };
  }, [authLoading, userId]);

  useEffect(() => {
    const saveBeforeExit = () => {
      if (!userId || !activitySessionIdRef.current || activityWordsCoveredRef.current < 1 || activitySavedRef.current) return;
      queueLearningActivitySave({
        sessionId: activitySessionIdRef.current,
        source: "phrase-mix",
        wordsCovered: activityWordsCoveredRef.current,
      });
    };
    window.addEventListener("pagehide", saveBeforeExit);
    return () => {
      window.removeEventListener("pagehide", saveBeforeExit);
      saveBeforeExit();
    };
  }, [userId]);

  const loadNextPhrase = useCallback(async (excludedVideoId?: string): Promise<Phrase | null> => {
    const requestId = ++phraseRequestIdRef.current;
    lineTranslationRequestIdRef.current += 1;
    setLoadingPhrase(true);
    setConsecutiveMistakes(0);
    playerRef.current?.pause();
    pausedAtBoundaryRef.current = false;
    setExplanationStatus("closed");
    setExplanationError("");
    setRemoteExplanation(null);
    setPartialExplanation(null);
    setLineTranslation(null);
    setLineTranslationStatus("idle");
    setLineTranslationError("");
    setTranslationExpanded(false);
    setRewardRevealed(false);
    setRewardReady(false);
    setError("none");
    try {
      const useFavoriteMedia = favoriteMedia && Boolean(userId);
      const useFavoriteCollections = favoriteCollections && Boolean(userId);
      const alternatingSources = useFavoriteMedia === useFavoriteCollections;
      const requestedSource = alternatingSources
        ? nextSourceTypeRef.current
        : useFavoriteCollections ? "collection" : "media";
      const sourceOrder: Array<"media" | "collection"> = alternatingSources
        ? [requestedSource, requestedSource === "media" ? "collection" : "media"]
        : [requestedSource];
      let response: Response | null = null;
      let result: { phrase?: Phrase; error?: string } = {};
      for (const sourceType of sourceOrder) {
        for (const excludeId of excludedVideoId ? [excludedVideoId, ""] : [""]) {
          const params = new URLSearchParams({
            action: "next",
            language: sourceLanguage,
            favoriteMedia: String(useFavoriteMedia),
            favoriteCollections: String(useFavoriteCollections),
            sourceType,
          });
          if (excludeId) params.set("excludeVideoId", excludeId);
          response = await fetch(`/api/phrase-mix?${params.toString()}`, { cache: "no-store" });
          result = await response.json() as { phrase?: Phrase; error?: string };
          if (response.ok && result.phrase) break;
          if (response.status !== 404) break;
        }
        if (response?.ok && result.phrase) break;
        if (response && response.status !== 404) break;
      }
      if (requestId !== phraseRequestIdRef.current) return null;
      if (!response?.ok || !result.phrase) {
        setError(result.error === "NO_PHRASES" ? "empty" : "load");
        return null;
      }
      if (countHideableWords(result.phrase.text) < 3) {
        setError("load");
        return null;
      }
      const selectedSource = result.phrase.sourceType;
      if (alternatingSources) nextSourceTypeRef.current = selectedSource === "media" ? "collection" : "media";
      const activeRecall = selectedSource === "collection" && nextCollectionRecallRef.current;
      if (selectedSource === "collection") nextCollectionRecallRef.current = !nextCollectionRecallRef.current;
      const wordCount = result.phrase.text.trim().split(/\s+/u).filter((word) => /[\p{L}\p{N}]/u.test(word)).length;
      const useActiveRecall = activeRecall && wordCount <= 10;
      const gameMode: NonNullable<Phrase["gameMode"]> = useActiveRecall
        ? result.phrase.isCollectionCompleted ? "first-letter" : "fill-blanks"
        : "first-letter";
      const nextPhrase = { ...result.phrase, activeRecall: useActiveRecall, gameMode };
      setPhraseInstanceId(requestId);
      setPlayerReady(false);
      setPhrase(nextPhrase);
      setTranslationExpanded(useActiveRecall);
      setRound(buildRound(0, nextPhrase.text, { mode: gameMode, difficulty: "hard" }, buildWordPool([nextPhrase.text])));
      return nextPhrase;
    } catch {
      if (requestId === phraseRequestIdRef.current) setError("load");
      return null;
    } finally {
      if (requestId === phraseRequestIdRef.current) setLoadingPhrase(false);
    }
  }, [favoriteMedia, favoriteCollections, sourceLanguage, userId]);

  useEffect(() => {
    if (authLoading || recordsLoading || !favoritesPreferenceLoaded || autoStartRef.current) return;
    autoStartRef.current = true;
    activitySessionIdRef.current = createSessionId();
    activityWordsCoveredRef.current = 0;
    activitySavedRef.current = false;
    void loadNextPhrase();
  }, [authLoading, favoritesPreferenceLoaded, loadNextPhrase, recordsLoading]);

  useEffect(() => {
    if (authLoading || !favoritesPreferenceLoaded) return;
    const filterKey = `${userId ?? "guest"}:${sourceLanguage}:${favoriteMedia}:${favoriteCollections}`;
    if (favoriteFilterKeyRef.current === null) {
      favoriteFilterKeyRef.current = filterKey;
      return;
    }
    if (favoriteFilterKeyRef.current === filterKey) return;
    favoriteFilterKeyRef.current = filterKey;
    setCurrentStreak(0);
    void loadNextPhrase();
  }, [authLoading, favoriteCollections, favoriteMedia, favoritesPreferenceLoaded, loadNextPhrase, sourceLanguage, userId]);

  async function saveRecord(score: number) {
    const date = new Date().toISOString().slice(0, 10);
    if (!userId) {
      const updated = {
        date,
        dailyBest: Math.max(records.date === date ? records.dailyBest : 0, score),
        allTimeBest: Math.max(records.allTimeBest, score),
      };
      const brokeRecord = updated.dailyBest > (records.date === date ? records.dailyBest : 0) || updated.allTimeBest > records.allTimeBest;
      setRecords(updated);
      try {
        localStorage.setItem(GUEST_RECORDS_KEY, JSON.stringify(updated));
      } catch {
        setError("save");
      }
      if (brokeRecord) setRecordFlash(true);
      return;
    }

    try {
      const response = await fetch("/api/phrase-mix", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ streak: score }),
      });
      const result = await response.json() as { records?: Records; error?: string };
      if (!response.ok || !result.records) throw new Error("Record save failed");
      const brokeRecord = result.records.dailyBest > (records.date === date ? records.dailyBest : 0) || result.records.allTimeBest > records.allTimeBest;
      setRecords(result.records);
      if (brokeRecord) setRecordFlash(true);
    } catch {
      setError("save");
    }
  }

  async function quitGame() {
    const sessionId = activitySessionIdRef.current;
    const wordsCovered = activityWordsCoveredRef.current;
    if (userId && sessionId && wordsCovered > 0 && !activitySavedRef.current) {
      try {
        await saveLearningActivity({ sessionId, source: "phrase-mix", wordsCovered });
        activitySavedRef.current = true;
      } catch (reason) {
        console.error("[phrase-mix] Could not save learning activity on quit.", reason);
        setError("activity-save");
        return;
      }
    }
    router.push("/");
  }

  function skipPhrase() {
    setCurrentStreak(0);
    void loadNextPhrase(phrase?.youtubeId);
  }

  function registerWrongAnswer() {
    setShakeKey((value) => value + 1);
    setCurrentStreak(0);
    if (!nextBlank || !round) return;

    const mistakeCount = consecutiveMistakes + 1;
    setConsecutiveMistakes(mistakeCount);
    if (mistakeCount === 1) {
      void showLineTranslation();
    } else if (mistakeCount === 2 && !phrase?.activeRecall) {
      replayPhrase();
    }
    if (mistakeCount < 2) return;

    setConsecutiveMistakes(0);
    const filledIds = [...round.filledIds, nextBlank.id];
    setRound({
      ...round,
      filledIds,
      revealedIds: [...round.revealedIds, nextBlank.id],
    });
    if (!round.tokens.some((token) => token.hidden && !filledIds.includes(token.id))) {
      finishPhrase(false);
    }
  }

  const replayPhrase = useCallback(() => {
    if (!phrase || !playerReady) return;
    pausedAtBoundaryRef.current = false;
    if (phrase.activeRecall) {
      if (!rewardReady) return;
      playerRef.current?.playTimedRange(phrase.start, phrase.start + phrase.duration);
      return;
    }
    playerRef.current?.seekTo(Math.max(0, phrase.start - AUDIO_START_BUFFER_SECONDS));
    playerRef.current?.play();
  }, [phrase, playerReady, rewardReady]);

  useEffect(() => {
    if (!phrase || phrase.activeRecall || !playerReady || loadingPhrase || transcriptEditOpen || explanationStatus !== "closed") return;
    const phraseKey = String(phraseInstanceId);
    if (autoPlayedPhraseRef.current === phraseKey) return;
    autoPlayedPhraseRef.current = phraseKey;
    replayPhrase();
  }, [explanationStatus, loadingPhrase, phrase, phraseInstanceId, playerReady, replayPhrase, transcriptEditOpen]);

  const finishPhrase = useCallback((answeredCorrectly: boolean) => {
    if (!phrase) return;
    if (phrase.activeRecall && answeredCorrectly) {
      setRewardRevealed(true);
      playerRef.current?.playTimedRange(phrase.start, phrase.start + phrase.duration, () => {
        setRewardReady(true);
        void loadNextPhrase(phrase.youtubeId);
      });
      return;
    }
    void loadNextPhrase(phrase.youtubeId);
  }, [loadNextPhrase, phrase]);

  const handleTimeUpdate = useCallback((seconds: number) => {
    if (
      phrase && !loadingPhrase && !transcriptEditOpen &&
      seconds >= phrase.start + phrase.duration + AUDIO_END_BUFFER_SECONDS &&
      !pausedAtBoundaryRef.current
    ) {
      pausedAtBoundaryRef.current = true;
      playerRef.current?.pause();
    }
  }, [loadingPhrase, phrase, transcriptEditOpen]);

  async function toggleExplanation() {
    if (!phrase) return;
    if (explanationStatus === "open") {
      setExplanationStatus("closed");
      return;
    }
    if (explanationStatus === "loading") return;
    playerRef.current?.pause();
    setExplanationStatus("loading");
    setExplanationError("");
    setPartialExplanation(null);
    try {
      const cached = await readExplanationCache({
        youtubeId: phrase.youtubeId,
        lineIndex: phrase.lineIndex,
        text: phrase.text,
        sourceLanguage,
        targetLanguage,
        context: "",
      });
      const result = cached ?? await streamExplanation({
        text: phrase.text,
        youtubeId: phrase.youtubeId,
        lineIndex: phrase.lineIndex,
        sourceLanguage,
        targetLanguage,
      }, setPartialExplanation);
      setRemoteExplanation(result);
      setExplanationStatus("open");
    } catch (reason) {
      setExplanationError(reason instanceof Error ? reason.message : t("explain.requestError"));
      setExplanationStatus("error");
    }
  }

  const showLineTranslation = useCallback(async () => {
    if (!phrase) return;
    setTranslationExpanded(true);
    if (lineTranslation || lineTranslationStatus === "loading") return;

    const requestId = ++lineTranslationRequestIdRef.current;
    setLineTranslationStatus("loading");
    setLineTranslationError("");
    try {
      const translation = await requestTranslation({
        text: phrase.text,
        sourceLang: sourceLanguage,
        targetLang: targetLanguage,
        videoId: phrase.youtubeId,
        lineIndex: phrase.lineIndex,
      });
      if (requestId !== lineTranslationRequestIdRef.current) return;
      setLineTranslation(translation);
      setLineTranslationStatus("idle");
    } catch (reason) {
      if (requestId !== lineTranslationRequestIdRef.current) return;
      const code = reason instanceof Error ? reason.message : "translation_unavailable";
      setLineTranslationError(code === "invalid_request"
        ? t("lyrics.translationInvalid")
        : code === "unsupported_language"
          ? t("lyrics.translationUnsupported")
          : t("lyrics.translationError"));
      setLineTranslationStatus("error");
    }
  }, [lineTranslation, lineTranslationStatus, phrase, sourceLanguage, t, targetLanguage]);

  useEffect(() => {
    if (!phrase?.activeRecall || loadingPhrase || lineTranslation || lineTranslationStatus !== "idle") return;
    const timeoutId = window.setTimeout(() => void showLineTranslation(), 0);
    return () => window.clearTimeout(timeoutId);
  }, [lineTranslation, lineTranslationStatus, loadingPhrase, phrase, showLineTranslation]);

  function toggleTranslation() {
    if (translationExpanded) {
      setTranslationExpanded(false);
      return;
    }
    void showLineTranslation();
  }

  function registerCorrectAnswer(bankItemId?: string) {
    if (!nextBlank || !round || loadingPhrase) return;
    setConsecutiveMistakes(0);
    const nextStreak = currentStreak + 1;
    setCurrentStreak(nextStreak);
    activityWordsCoveredRef.current += 1;
    incrementWordsToday();
    void saveRecord(nextStreak);
    const filledIds = [...round.filledIds, nextBlank.id];
    setRound({
      ...round,
      filledIds,
      bank: bankItemId ? round.bank.map((item) => item.id === bankItemId ? { ...item, used: true } : item) : round.bank,
    });
    if (!round.tokens.some((token) => token.hidden && !filledIds.includes(token.id))) finishPhrase(true);
  }

  function handleLetter(letter: string) {
    if (!nextBlank || !round || loadingPhrase || (phrase?.activeRecall && !playerReady)) return;
    if (normalizeLetter(letter) !== normalizeLetter(firstLetterOf(nextBlank))) {
      registerWrongAnswer();
      return;
    }
    registerCorrectAnswer();
  }

  function handlePickWord(item: { id: string; text: string; used: boolean }) {
    if (!nextBlank || !round || loadingPhrase || (phrase?.activeRecall && !playerReady) || item.used) return;
    if (!sameWord(item.text, nextBlank.core)) {
      registerWrongAnswer();
      return;
    }
    registerCorrectAnswer(item.id);
  }

  const letterHandlerRef = useRef(handleLetter);
  useEffect(() => {
    letterHandlerRef.current = handleLetter;
  });

  useEffect(() => {
    if (loadingPhrase || !round || transcriptEditOpen) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      if (event.key === "ArrowUp" || event.key === "ArrowDown") {
        if (!phrase || !playerReady) return;
        event.preventDefault();
        replayPhrase();
        return;
      }
      if (phrase?.gameMode === "fill-blanks") return;
      if (event.key.length !== 1 || !/\p{L}/u.test(event.key)) return;
      event.preventDefault();
      letterHandlerRef.current(event.key);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [loadingPhrase, nextBlank, phrase, playerReady, transcriptEditOpen, replayPhrase, round]);

  useEffect(() => {
    if (recordFlash) {
      const timer = window.setTimeout(() => setRecordFlash(false), 1200);
      return () => window.clearTimeout(timer);
    }
  }, [recordFlash]);

  useEffect(() => {
    if (shakeKey === 0 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    phraseRef.current?.animate(
      [{ transform: "translateX(0)" }, { transform: "translateX(-8px)" }, { transform: "translateX(8px)" }, { transform: "translateX(0)" }],
      { duration: 250, easing: "ease-in-out" },
    );
  }, [shakeKey]);

  const videoPlayer = phrase ? (
    <YouTubePlayer
      key={`${phraseInstanceId}:${phrase.youtubeId}`}
      ref={playerRef}
      videoId={phrase.youtubeId}
      onReady={() => setPlayerReady(true)}
      onTimeUpdate={handleTimeUpdate}
    />
  ) : (
    <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-black" aria-busy={loadingPhrase}>
      {loadingPhrase && <span className="absolute inset-0 flex items-center justify-center gap-2 text-sm text-neutral-300" role="status"><Loader2 className="size-4 animate-spin" aria-hidden="true" />{t("game.phraseMix.next")}</span>}
    </div>
  );
  const lineEditContext: TranscriptEditContext | undefined = phrase ? {
    songId: phrase.songId,
    lines: phrase.lines,
    canEdit: phrase.canEdit,
    ...(phrase.sourceType === "collection" ? { collectionId: phrase.sourceSlug, collectionItemId: phrase.collectionItemId } : {}),
    lineIndex: phrase.lineIndex,
    line: { text: phrase.text, start: phrase.start, duration: phrase.duration },
    previousLineIndex: phrase.previousLine ? phrase.lineIndex - 1 : undefined,
    previousLine: phrase.previousLine,
    nextLineIndex: phrase.nextLine ? phrase.lineIndex + 1 : undefined,
    nextLine: phrase.nextLine,
  } : undefined;

  return (
    <section className="space-y-4" aria-busy={loadingPhrase}>
      <h1 className="text-center text-xl font-bold sm:text-2xl">{uiLanguage === "uk" ? "Мікс фраз — тренування аудіювання за відео та колекціями" : uiLanguage === "ru" ? "Микс фраз — тренировка аудирования по видео и коллекциям" : uiLanguage === "pl" ? "Miks fraz — ćwiczenie słuchania z filmów i kolekcji" : uiLanguage === "es" ? "Mezcla de frases — practica la comprensión auditiva con vídeos y colecciones" : "Phrase Mix — listening practice with videos and collections"}</h1>
      <div className="flex h-10 min-w-0 items-center justify-between gap-3 overflow-hidden rounded-xl border border-neutral-800 bg-zinc-700 px-3 text-sm text-zinc-100" aria-live="polite">
        {phrase ? <>
          <div className="flex min-w-0 items-center gap-2">
            <span className="shrink-0 rounded bg-white/10 px-1.5 py-0.5 text-xs font-medium text-zinc-200">{phrase.sourceType === "collection" ? (uiLanguage === "uk" ? "Колекція" : uiLanguage === "ru" ? "Коллекция" : uiLanguage === "pl" ? "Kolekcja" : uiLanguage === "es" ? "Colección" : "Collection") : (uiLanguage === "uk" ? "Медіа" : uiLanguage === "ru" ? "Медиа" : uiLanguage === "pl" ? "Media" : uiLanguage === "es" ? "Medio" : "Media")}</span>
            {phrase.isPublic === true && phrase.sourceSlug
              ? <a className="min-w-0 truncate text-zinc-100 underline-offset-4 hover:underline" href={phrase.sourceType === "collection" ? `/collections/${encodeURIComponent(phrase.sourceSlug)}` : `/song/${encodeURIComponent(phrase.sourceSlug)}`} target="_blank" rel="noopener">{phrase.sourceTitle}</a>
              : <span className="min-w-0 truncate text-zinc-100">{phrase.sourceTitle}</span>}
          </div>
          <PhraseMixFavoriteButton key={`${phrase.sourceType}:${phrase.sourceType === "media" ? phrase.songId : phrase.sourceSlug}:${phrase.isFavorite}`} sourceType={phrase.sourceType} sourceId={phrase.sourceType === "media" ? phrase.songId : phrase.sourceSlug} initialFavorite={phrase.isFavorite} />
        </> : <span className="text-muted-foreground">&nbsp;</span>}
      </div>
      <div className="relative">
        {videoPlayer}
        {phrase?.activeRecall && (
          <div className={`absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 rounded-xl bg-zinc-950/75 px-6 text-center text-white backdrop-blur-sm transition-opacity duration-500 ${rewardRevealed ? "pointer-events-none opacity-0" : "opacity-100"}`} role="status" aria-hidden={rewardRevealed}>
            <LockKeyhole className="size-9 text-primary" aria-hidden="true" />
            <p className="max-w-md text-lg font-semibold sm:text-xl">{t("collections.activeRecallOverlay")}</p>
          </div>
        )}
      </div>

      <div className="grid w-full grid-cols-2 gap-1 rounded-xl border border-neutral-800 bg-neutral-900/80 p-2.5 text-center text-xs text-neutral-100 sm:grid-cols-3 sm:gap-3 sm:px-4 sm:text-sm">
        <div className="min-w-0">
          <p className="truncate text-neutral-300">{t("game.phraseMix.currentStreak")}</p>
          <p className="font-semibold tabular-nums" aria-live="polite">{currentStreak}</p>
        </div>
        <div className={`min-w-0 ${recordFlash ? "animate-pulse text-amber-300" : ""}`}>
          <p className="truncate text-neutral-300">{t("game.phraseMix.dailyBest")}</p>
          <p className="font-semibold tabular-nums">{records.dailyBest}</p>
        </div>
        <div className={`min-w-0 ${recordFlash ? "animate-pulse text-amber-300" : ""}`}>
          <p className="truncate text-neutral-300">{t("game.phraseMix.allTimeBest")}</p>
          <p className="font-semibold tabular-nums">{records.allTimeBest}</p>
        </div>
      </div>

      <div className="flex w-full flex-nowrap items-center gap-1.5">
        <Button className="w-auto shrink-0 whitespace-nowrap px-2" type="button" variant="outline" size="sm" disabled={loadingPhrase} onClick={skipPhrase}>
          {phrase ? <SkipForward className="size-4 shrink-0" /> : <Shuffle className="size-4 shrink-0" />}{t(phrase ? "game.phraseMix.skip" : "game.phraseMix.start")}
        </Button>
        {phrase && (!phrase.activeRecall || rewardReady) && <Button className="w-auto shrink-0 whitespace-nowrap px-2" type="button" variant="outline" size="sm" disabled={!playerReady || loadingPhrase} onClick={replayPhrase}>
          <ArrowUpDown className="size-4 shrink-0" />{t("game.replay")}
        </Button>}
        <div className="flex min-w-0 flex-1 flex-nowrap items-center justify-center gap-1.5">
          {!phrase?.activeRecall && <Button className="size-8 min-w-8 shrink-0 p-0 text-muted-foreground hover:text-foreground" type="button" size="sm" variant="ghost" title={lineTranslationStatus === "loading" ? t("lyrics.translationLoading") : translationExpanded ? t("lyrics.translationHide") : t("lyrics.translateLine")} aria-label={lineTranslationStatus === "loading" ? t("lyrics.translationLoading") : translationExpanded ? t("lyrics.translationHide") : t("lyrics.translateLine")} aria-expanded={translationExpanded} disabled={!phrase} onClick={() => void toggleTranslation()}>
            {lineTranslationStatus === "loading" ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Globe className="size-4" aria-hidden="true" />}
          </Button>}
          <label className="flex items-center gap-1 whitespace-nowrap text-xs">
            <input type="checkbox" checked={favoriteMedia && Boolean(userId)} onChange={(event) => setFavoriteMedia(event.target.checked)} disabled={authLoading || !userId || !favoritesPreferenceLoaded || loadingPhrase} className="size-4 accent-primary" />
            {t("game.phraseMix.favoriteMedia")}
          </label>
          <label className="flex items-center gap-1 whitespace-nowrap text-xs">
            <input type="checkbox" checked={favoriteCollections && Boolean(userId)} onChange={(event) => setFavoriteCollections(event.target.checked)} disabled={authLoading || !userId || !favoritesPreferenceLoaded || loadingPhrase} className="size-4 accent-primary" />
            {t("game.phraseMix.favoriteCollections")}
          </label>
        </div>
      </div>
      {!authLoading && !userId && <p className="text-center text-xs text-neutral-300">{t("game.phraseMix.signInFavorites")}</p>}

      {phrase?.activeRecall && (
        <div className="rounded-xl border border-primary/40 bg-primary/10 px-5 py-4 text-center" aria-live="polite">
          {lineTranslationStatus === "loading" && <p className="text-sm text-muted-foreground">{t("lyrics.translationLoading")}</p>}
          {lineTranslationStatus === "error" && <div className="space-y-2"><p role="alert" className="text-sm text-destructive">{lineTranslationError}</p><Button type="button" size="sm" variant="outline" onClick={() => void showLineTranslation()}>{t("game.tryAgain")}</Button></div>}
          {lineTranslation && <p className="text-xl font-semibold leading-snug text-foreground sm:text-2xl">{lineTranslation}</p>}
        </div>
      )}

      {phrase && (
        <div ref={phraseRef} className="rounded-xl border bg-card p-5">
          <div className="flex items-start gap-3">
            <TranscriptTimingModal
              context={lineEditContext}
              onPause={() => playerRef.current?.pause()}
              onOpenChange={setTranscriptEditOpen}
              onPlayLine={(seconds, _lineIndex, duration) => {
                if (!phrase) return;
                playerRef.current?.playRange(seconds, seconds + duration);
              }}
              onSaved={(save: TranscriptEditSave) => {
                if (!phrase) return;
                const currentLineIndex = save.editedLineIndex ?? (save.insert && save.insert.afterIndex < phrase.lineIndex
                  ? phrase.lineIndex + 1
                  : save.deleteLineIndex !== undefined && save.deleteLineIndex < phrase.lineIndex
                    ? phrase.lineIndex - 1
                    : phrase.lineIndex);
                const updatedLine = save.lines?.[currentLineIndex]
                  ?? save.updates.find(({ lineIndex }) => lineIndex === phrase.lineIndex)?.line;
                const previousLine = save.lines?.[currentLineIndex - 1]
                  ?? save.updates.find(({ lineIndex }) => lineIndex === phrase.lineIndex - 1)?.line;
                const nextLine = save.lines?.[currentLineIndex + 1]
                  ?? save.updates.find(({ lineIndex }) => lineIndex === phrase.lineIndex + 1)?.line;
                if (!updatedLine) return;
                setPhrase({ ...phrase, ...(save.lines ? { lines: save.lines } : {}), lineIndex: currentLineIndex, text: updatedLine.text, start: updatedLine.start, duration: updatedLine.duration });
                setRound(buildRound(0, updatedLine.text, { mode: phrase.gameMode ?? "first-letter", difficulty: "hard" }, buildWordPool([updatedLine.text])));
                if (updatedLine.text !== phrase.text) {
                  lineTranslationRequestIdRef.current += 1;
                  setLineTranslation(null);
                  setLineTranslationStatus("idle");
                  setLineTranslationError("");
                  setTranslationExpanded(false);
                  setExplanationStatus("closed");
                  setRemoteExplanation(null);
                }
                if (previousLine || nextLine) {
                  setPhrase((current) => current ? {
                    ...current,
                    ...(previousLine ? { previousLine } : {}),
                    ...(nextLine ? { nextLine } : {}),
                  } : current);
                }
              }}
            />
            <p className="min-w-0 flex-1 flex flex-wrap items-baseline gap-x-2 gap-y-3 text-xl leading-snug">
              {round && round.tokens.map((token) => {
                if (!token.hidden) return <span key={token.id}>{token.raw}</span>;
                if (round.revealedIds.includes(token.id)) return <span key={token.id} className="font-semibold text-amber-700 dark:text-amber-300">{token.raw}</span>;
                if (round.filledIds.includes(token.id)) return <span key={token.id} className="font-semibold text-emerald-700 dark:text-emerald-300">{token.raw}</span>;
                return <span key={token.id}>{token.leading}<span role="img" aria-label={t("game.hiddenWord")} className="inline-flex min-w-8 items-center justify-center px-1 text-center leading-none text-foreground" style={{ width: `${Math.min(Math.max(token.core.length, 2), 14)}ch` }}>{phrase.gameMode === "first-letter" ? maskWord(token.core) : "___"}</span>{token.trailing}</span>;
              })}
            </p>
          </div>
          {translationExpanded && !phrase.activeRecall && (
            <div className="mt-3 rounded bg-muted/50 px-3 py-2 text-sm text-muted-foreground" aria-live="polite">
              {lineTranslationStatus === "loading" && t("lyrics.translationLoading")}
              {lineTranslationStatus === "error" && <p role="alert" className="text-destructive">{lineTranslationError}</p>}
              {lineTranslation && <p>{lineTranslation}</p>}
            </div>
          )}
        </div>
      )}

      {phrase?.gameMode === "fill-blanks" && round && (
        <WordBank items={round.bank} onPick={handlePickWord} disabled={loadingPhrase || (phrase.activeRecall && !playerReady)} />
      )}

      {!phrase && loadingPhrase && <p className="flex items-center justify-center gap-2 rounded-xl border bg-card p-5 text-sm text-muted-foreground" role="status"><Loader2 className="size-4 animate-spin" aria-hidden="true" />{t("game.phraseMix.next")}</p>}
      {phrase && loadingPhrase && <span className="sr-only" role="status">{t("game.phraseMix.next")}</span>}
      {error === "empty" && <p role="status" className="text-sm text-muted-foreground">{t("game.phraseMix.noPhrases")}</p>}
      {error === "load" && <p role="alert" className="text-sm text-destructive">{t("game.phraseMix.loadError")}</p>}
      {error === "save" && <p role="alert" className="text-sm text-destructive">{t("game.phraseMix.saveError")}</p>}
      {error === "activity-save" && <p role="alert" className="text-sm text-destructive">{t("game.phraseMix.activitySaveError")}</p>}
      <div className="sticky bottom-3 z-10 space-y-2">
        {explanationStatus === "loading" && (partialExplanation ? <StreamingExplanation data={partialExplanation} /> : <ExplanationSkeleton />)}
        {explanationStatus === "error" && <p role="alert" className="text-sm text-destructive">{explanationError}</p>}
        {explanationStatus === "open" && remoteExplanation && <ExplanationCard data={remoteExplanation} />}
      </div>
    </section>
  );
}
