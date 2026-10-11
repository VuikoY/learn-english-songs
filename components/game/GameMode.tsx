// components/game/GameMode.tsx
// Головний модуль гри: вибір режиму й складності -> раунди по рядках пісні -> підсумок.
"use client";

import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import {
  ArrowLeft,
  Check,
  Flag,
  Eye,
  EyeOff,
  Keyboard,
  LogOut,
  Puzzle,
  RotateCcw,
  Loader2,
  Sparkles,
  ChevronUp,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import ScoreBoard from "@/components/game/ScoreBoard";
import WordBank from "@/components/game/WordBank";
import LetterKeyboard from "@/components/game/LetterKeyboard";
import ExplanationCard, { ExplanationSkeleton } from "@/components/ExplanationCard";
import SaveToVocabularyButton from "@/components/SaveToVocabularyButton";
import { useLanguage } from "@/context/LanguageContext";
import type { TranslationKey } from "@/lib/i18n/dictionary";
import {
  ALPHABETS,
  buildRound,
  buildWordPool,
  countHideableWords,
  firstLetterOf,
  normalizeLetter,
  sameWord,
} from "@/lib/game/buildRound";
import { gameReducer, initialGameState } from "@/lib/game/gameState";
import { isExplanation, type Explanation, type LyricLine } from "@/lib/types";
import { capEntries, usePersistentState } from "@/lib/storage/usePersistentState";
import {
  DIFFICULTIES,
  type BankItem,
  type Difficulty,
  type GameModeId,
  type GamePhase,
  type GameSettings,
  type Round,
} from "@/types/game";

type Props = {
  lines: LyricLine[];
  currentTime: number;
  /** Перемотати відео на початок рядка й увімкнути його (кнопка "Послухати рядок"). */
  onPlayLine?: (startSeconds: number) => void;
  onPause?: () => void;
  songTitle?: string | null;
};

// Скільки слів мінімум має бути в рядку, щоб він потрапив у гру
const MIN_WORDS_PER_LINE = 3;

const MODE_OPTIONS: {
  id: GameModeId;
  icon: LucideIcon;
  title: TranslationKey;
  description: TranslationKey;
}[] = [
  {
    id: "fill-blanks",
    icon: Puzzle,
    title: "game.mode.fillBlanks",
    description: "game.mode.fillBlanks.desc",
  },
  {
    id: "first-letter",
    icon: Keyboard,
    title: "game.mode.firstLetter",
    description: "game.mode.firstLetter.desc",
  },
];

const DIFFICULTY_TEXT: Record<Difficulty, { title: TranslationKey; description: TranslationKey }> = {
  easy: { title: "game.difficulty.easy", description: "game.difficulty.easy.desc" },
  medium: { title: "game.difficulty.medium", description: "game.difficulty.medium.desc" },
  hard: { title: "game.difficulty.hard", description: "game.difficulty.hard.desc" },
};

export default function GameMode({ lines, currentTime, onPlayLine, onPause, songTitle = null }: Props) {
  const { t, sourceLanguage, targetLanguage } = useLanguage();
  const [explanationCache, setExplanationCache] = usePersistentState<Record<string, Explanation>>(
    "lingo-clips:explanations",
    {},
    (value): value is Record<string, Explanation> => typeof value === "object" && value !== null && !Array.isArray(value) && Object.values(value).every(isExplanation),
  );
  const [explanationStatus, setExplanationStatus] = useState<"closed" | "loading" | "open" | "error">("closed");
  const [explanationError, setExplanationError] = useState("");

  // ---------- Стан ----------
  const [phase, setPhase] = useState<GamePhase>("setup");
  const [settings, setSettings] = usePersistentState<GameSettings>(
    "lingo-clips:game-settings",
    { mode: "fill-blanks", difficulty: "easy" },
    (value): value is GameSettings =>
      typeof value === "object" && value !== null &&
      (value as GameSettings).mode !== undefined &&
      ["fill-blanks", "first-letter"].includes((value as GameSettings).mode) &&
      ["easy", "medium", "hard"].includes((value as GameSettings).difficulty),
  );
  const [game, dispatch] = useReducer(gameReducer, initialGameState); // очки, серія, множник
  const [round, setRound] = useState<Round | null>(null); // поточний рядок
  const [position, setPosition] = useState(0); // номер раунду серед "ігрових" рядків
  const [shakeKey, setShakeKey] = useState(0); // збільшуємо при помилці -> запускає тряску

  const lineRef = useRef<HTMLDivElement>(null);
  const timedOutRef = useRef(false);
  const [keyboardHidden, setKeyboardHidden] = usePersistentState<boolean>(
    "lingo-clips:game-keyboard-hidden",
    false,
    (value): value is boolean => typeof value === "boolean",
  );

  // Рядки, придатні для гри (достатньо слів). Зберігаємо оригінальний індекс.
  const playable = useMemo(
    () =>
      lines
        .map((line, index) => ({ line, index }))
        .filter(({ line }) => countHideableWords(line.text) >= MIN_WORDS_PER_LINE),
    [lines],
  );

  // Слова з усієї пісні — з них беруться хибні слова-манки
  const wordPool = useMemo(() => buildWordPool(lines.map((l) => l.text)), [lines]);

  // Похідні значення (рахуємо при рендері, у state не зберігаємо)
  const nextBlank = round?.tokens.find((tok) => tok.hidden && !round.filledIds.includes(tok.id));
  const isRoundComplete = round !== null && nextBlank === undefined;
  const currentLine = round ? lines[round.lineIndex] : null;
  const explainKey = currentLine ? `${sourceLanguage}>${targetLanguage}::${currentLine.text.trim().toLowerCase()}` : "";
  const cachedExplanation = explainKey ? explanationCache[explainKey] : undefined;
  const explanationLineRef = useRef(explainKey);
  useEffect(() => {
    if (explanationLineRef.current === explainKey) return;
    explanationLineRef.current = explainKey;
    setExplanationStatus("closed");
    setExplanationError("");
  }, [explainKey]);

  async function toggleExplanation() {
    if (!currentLine || !explainKey) return;
    if (explanationStatus === "open") {
      setExplanationStatus("closed");
      return;
    }
    onPause?.();
    if (cachedExplanation) {
      setExplanationStatus("open");
      return;
    }
    setExplanationStatus("loading");
    setExplanationError("");
    try {
      const response = await fetch("/api/explain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: currentLine.text, sourceLanguage, targetLanguage }),
      });
      const raw = await response.text();
      let result: Record<string, unknown>;
      try { result = JSON.parse(raw); } catch { throw new Error(`Server returned invalid JSON (${response.status}).`); }
      if (!response.ok) throw new Error(typeof result.error === "string" ? result.error : "Could not get an explanation.");
      if (!isExplanation(result)) throw new Error("The explanation response has an invalid format.");
      setExplanationCache((previous) => capEntries({ ...previous, [explainKey]: result }, 500));
      setExplanationStatus("open");
    } catch (error) {
      setExplanationError(error instanceof Error ? error.message : "Unknown error");
      setExplanationStatus("error");
    }
  }

  useEffect(() => {
    if (phase !== "playing" || isRoundComplete || !currentLine) return;
    if (currentTime >= currentLine.start + currentLine.duration + 1) {
      timedOutRef.current = true;
      onPause?.();
    }
  }, [currentTime, currentLine, isRoundComplete, onPause, phase]);

  // ---------- Керування раундами ----------

  function startRound(nextPosition: number, activeSettings: GameSettings = settings) {
    const entry = playable[nextPosition];
    if (!entry) return;
    setPosition(nextPosition);
    setRound(buildRound(entry.index, entry.line.text, activeSettings, wordPool));
  }

  function startGame() {
    if (playable.length === 0) return;
    timedOutRef.current = false;
    dispatch({ type: "reset" });
    startRound(0);
    setPhase("playing");
    onPause?.();
  }

  function goNext() {
    const shouldReplayNext = timedOutRef.current;
    timedOutRef.current = false;
    if (position + 1 >= playable.length) {
      setPhase("finished");
      return;
    }

    const nextPosition = position + 1;
    startRound(nextPosition);
    const nextLine = playable[nextPosition]?.line;
    if (shouldReplayNext && nextLine) onPlayLine?.(nextLine.start);
  }
  function replayCurrentLine() {
    if (!currentLine || !onPlayLine) return;
    timedOutRef.current = false;
    onPlayLine(currentLine.start);
  }

  function quitToSetup() {
    setRound(null);
    setPhase("setup");
  }

  // ---------- Результат кожної відповіді ----------

  function registerCorrect(tokenId: number, bankItemId?: string) {
    dispatch({ type: "correct" });
    const completesRound = round !== null && round.filledIds.length + 1 === round.tokens.filter((token) => token.hidden).length;
    setRound((prev) =>
      prev
        ? {
            ...prev,
            filledIds: [...prev.filledIds, tokenId],
            bank: bankItemId
              ? prev.bank.map((item) => (item.id === bankItemId ? { ...item, used: true } : item))
              : prev.bank,
          }
        : prev,
    );
    if (completesRound) {
      window.setTimeout(goNext, 500);
    }

  }

  function registerWrong() {
    dispatch({ type: "wrong" }); // серія -> 0
    setShakeKey((key) => key + 1); // запускає анімацію трясіння
  }

  /** Режим А: клік по слову з банку. Слово має збігатися з наступним пропуском. */
  function handlePickWord(item: BankItem) {
    if (!nextBlank || item.used) return;
    if (sameWord(item.text, nextBlank.core)) {
      registerCorrect(nextBlank.id, item.id);
    } else {
      registerWrong();
    }
  }

  /** Режим Б: натиснута літера. Має збігатися з першою літерою наступного закритого слова. */
  function handleLetter(letter: string) {
    if (!nextBlank) return;
    if (normalizeLetter(letter) === normalizeLetter(firstLetterOf(nextBlank))) {
      registerCorrect(nextBlank.id);
    } else {
      registerWrong();
    }
  }

  // ---------- Фізична клавіатура (режим Б) ----------

  // Слухач підписується один раз, а актуальну версію handleLetter бере з ref
  const letterHandlerRef = useRef(handleLetter);
  useEffect(() => {
    letterHandlerRef.current = handleLetter;
  });

  const isGamePlaying = phase === "playing";
  useEffect(() => {
    if (!isGamePlaying) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.ctrlKey || event.metaKey || event.altKey) return; // не заважаємо Ctrl+R тощо
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) {
        return; // користувач друкує в полі — це не відповідь у грі
      }
      if (event.key === "ArrowLeft") {
        if (!currentLine || !onPlayLine) return;
        event.preventDefault();
        replayCurrentLine();
        return;
      }
      if (settings.mode !== "first-letter") return;
      if (event.key.length !== 1 || !/\p{L}/u.test(event.key)) return;

      event.preventDefault();
      letterHandlerRef.current(event.key);
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [currentLine, isGamePlaying, onPlayLine, settings.mode]);

  // ---------- Анімація трясіння при помилці ----------
  // Web Animations API: CSS-keyframes у globals.css не потрібні.
  useEffect(() => {
    if (shakeKey === 0) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    lineRef.current?.animate(
      [
        { transform: "translateX(0)" },
        { transform: "translateX(-8px)" },
        { transform: "translateX(8px)" },
        { transform: "translateX(-6px)" },
        { transform: "translateX(6px)" },
        { transform: "translateX(-3px)" },
        { transform: "translateX(3px)" },
        { transform: "translateX(0)" },
      ],
      { duration: 400, easing: "ease-in-out" },
    );
  }, [shakeKey]);

  // =====================================================================
  // ЕКРАН 1: налаштування
  // =====================================================================
  if (phase === "setup") {
    return (
      <section className="space-y-6 rounded-xl border bg-card p-5">
        <fieldset className="space-y-2">
          <legend className="mb-2 text-sm font-medium">{t("game.mode.label")}</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {MODE_OPTIONS.map(({ id, icon: Icon, title, description }) => {
              const selected = settings.mode === id;
              return (
                <button
                  key={id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setSettings((s) => ({ ...s, mode: id }))}
                  className={`flex flex-col items-start gap-1 rounded-xl border p-3 text-left transition ${
                    selected ? "border-primary bg-primary/10 ring-2 ring-primary font-semibold shadow-sm" : "border-slate-300 hover:bg-muted/60 dark:border-slate-700"
                  }`}
                >
                  <span className="flex items-center gap-2 font-medium">
                    <Icon className="size-4" aria-hidden />
                    {t(title)}
                  </span>
                  <span className="text-sm text-muted-foreground">{t(description)}</span>
                </button>
              );
            })}
          </div>
        </fieldset>

        <fieldset className="space-y-2">
          <legend className="mb-2 text-sm font-medium">{t("game.difficulty.label")}</legend>
          <div className="grid gap-2 sm:grid-cols-3">
            {DIFFICULTIES.map((level) => {
              const selected = settings.difficulty === level;
              return (
                <button
                  key={level}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setSettings((s) => ({ ...s, difficulty: level }))}
                  className={`flex flex-col items-start gap-0.5 rounded-xl border p-3 text-left transition ${
                    selected ? "border-primary bg-primary/10 ring-2 ring-primary font-semibold shadow-sm" : "border-slate-300 hover:bg-muted/60 dark:border-slate-700"
                  }`}
                >
                  <span className="font-medium">{t(DIFFICULTY_TEXT[level].title)}</span>
                  <span className="text-sm text-muted-foreground">
                    {t(DIFFICULTY_TEXT[level].description)}
                  </span>
                </button>
              );
            })}
          </div>
        </fieldset>

        {playable.length === 0 && (
          <p role="alert" className="text-sm text-destructive">
            {t("game.noLines")}
          </p>
        )}

        <Button type="button" className="w-full" disabled={playable.length === 0} onClick={startGame}>
          {t("game.start")}
        </Button>
      </section>
    );
  }

  // =====================================================================
  // ЕКРАН 3: підсумок
  // =====================================================================
  if (phase === "finished") {
    const answers = game.correct + game.mistakes;
    const accuracy = answers === 0 ? 0 : Math.round((game.correct / answers) * 100);

    return (
      <section className="space-y-5 rounded-xl border bg-card p-5">
        <h2 className="text-lg font-semibold">{t("game.results")}</h2>
        <ScoreBoard
          score={game.score}
          streak={game.streak}
          maxStreak={game.maxStreak}
          multiplier={game.multiplier}
        />
        <p className="text-sm text-muted-foreground">
          {t("game.accuracy")}: <span className="font-medium text-foreground">{accuracy}%</span>
        </p>
        <div className="flex gap-2">
          <Button type="button" onClick={startGame}>
            <RotateCcw className="size-4" />
            {t("game.playAgain")}
          </Button>
          <Button type="button" variant="outline" onClick={quitToSetup}>
            {t("game.quit")}
          </Button>
        </div>
      </section>
    );
  }

  // =====================================================================
  // ЕКРАН 2: гра
  // =====================================================================
  if (!round || !currentLine) return null;

  return (
    <section className="space-y-4">
      <ScoreBoard
        score={game.score}
        streak={game.streak}
        maxStreak={game.maxStreak}
        multiplier={game.multiplier}
      />

      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {t("game.line", { current: position + 1, total: playable.length })}
        </p>
        <div className="flex gap-2">
          {onPlayLine && (
            <Button type="button" variant="outline" size="sm" onClick={replayCurrentLine}>
              <ArrowLeft className="size-4" />
              {t("game.replay")}
            </Button>
          )}
          <Button type="button" variant="ghost" size="sm" onClick={quitToSetup}>
            <LogOut className="size-4" />
            {t("game.quit")}
          </Button>
        </div>
      </div>

      {/* Рядок пісні. ref потрібен для анімації трясіння. */}
      <div ref={lineRef} className="rounded-xl border bg-card p-5">
        <p className="flex flex-wrap items-baseline gap-x-2 gap-y-3 text-xl leading-snug">
          {round.tokens.map((token) => {
            // 1) Слово не ховали -> показуємо як є
            if (!token.hidden) {
              return <span key={token.id}>{token.raw}</span>;
            }

            // 2) Слово вгадане -> показуємо зеленим (разом із пунктуацією)
            if (round.filledIds.includes(token.id)) {
              return (
                <span
                  key={token.id}
                  className="font-semibold text-emerald-600 duration-200 animate-in zoom-in-90 dark:text-emerald-400"
                >
                  {token.raw}
                </span>
              );
            }

            // 3) Слово сховане -> пропуск. Ширина залежить від довжини слова.
            return (
              <span key={token.id}>
                {token.leading}
                <span
                  role="img"
                  aria-label={t("game.hiddenWord")}
                  style={{ width: `${Math.min(Math.max(token.core.length, 2), 14)}ch` }}
                  className="inline-flex min-w-8 items-center justify-center px-1 text-center leading-none text-foreground"
                >
                  {settings.mode === "first-letter" ? "\u2022".repeat(token.core.length) : "___"}
                </span>
                {token.trailing}
              </span>
            );
          })}
        </p>
      </div>

      {/* Нижня плаваюча панель: керування AI, банк слів або клавіатура */}
      <div className="sticky bottom-3 z-10 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <Button type="button" size="sm" variant="outline" disabled={!currentLine || explanationStatus === "loading"} onClick={toggleExplanation}>
            {explanationStatus === "loading" ? <Loader2 className="size-4 animate-spin" /> : explanationStatus === "open" ? <ChevronUp className="size-4" /> : <Sparkles className="size-4" />}
            {explanationStatus === "open" ? t("explain.hide") : t("explain.button")}
          </Button>
          {settings.mode === "first-letter" && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              aria-expanded={!keyboardHidden}
              onClick={() => setKeyboardHidden((hidden) => !hidden)}
            >
              {keyboardHidden ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
              {keyboardHidden ? t("game.keyboard.show") : t("game.keyboard.hide")}
            </Button>
          )}
        </div>
        {explanationStatus === "loading" && <ExplanationSkeleton />}
        {explanationStatus === "error" && <p role="alert" className="text-sm text-destructive">{explanationError}</p>}
        {explanationStatus === "open" && cachedExplanation && currentLine && (
          <ExplanationCard
            data={cachedExplanation}
            actions={<SaveToVocabularyButton original={currentLine.text} explanation={cachedExplanation} songTitle={songTitle} />}
          />
        )}
        {settings.mode === "fill-blanks" ? (
          <WordBank items={round.bank} onPick={handlePickWord} disabled={isRoundComplete} />
        ) : (
          !keyboardHidden && (
            <LetterKeyboard
              letters={ALPHABETS[sourceLanguage]}
              onPress={handleLetter}
              disabled={isRoundComplete}
            />
          )
        )}
      </div>
    </section>
  );
}
