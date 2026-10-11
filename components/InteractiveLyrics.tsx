// components/InteractiveLyrics.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronUp, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import ExplanationCard, { ExplanationSkeleton } from "@/components/ExplanationCard";
import SaveToVocabularyButton from "@/components/SaveToVocabularyButton";
import { useLanguage } from "@/context/LanguageContext";
import { capEntries, usePersistentState } from "@/lib/storage/usePersistentState";
import { isExplanation, type Explanation, type LyricLine } from "@/lib/types";

type Props = {
  lines: LyricLine[];
  /** Поточний час плеєра в секундах. */
  currentTime: number;
  /** Клік по тексту рядка перемотує відео на його початок. */
  onSeek: (seconds: number) => void;
  /** Викликається, коли користувач натиснув AI Explain (щоб поставити відео на паузу). */
  onExplainStart?: () => void;
  /** Назва відео — зберігається разом із фразою у словнику (необов'язково). */
  songTitle?: string | null;
};

// Стан панелі пояснення для ОДНОГО рядка.
// Саму відповідь тут не зберігаємо — вона лежить у кеші (explanationCache).
type LineState =
  | { kind: "loading" } // чекаємо відповідь -> показуємо скелетон
  | { kind: "error"; message: string }
  | { kind: "open" }; // картка розгорнута

// Ключ кешу = текст рядка. toLowerCase/trim — щоб "Hello " і "hello" вважались тим самим.
// langKey ("en>pl") входить у ключ: те саме речення з іншою мовою пояснення — це інший запис кешу.
// Скільки пояснень максимум тримаємо в localStorage
const MAX_CACHED_EXPLANATIONS = 500;

// Перевірка даних із localStorage: усі значення мають бути Explanation
function isExplanationRecord(value: unknown): value is Record<string, Explanation> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.values(value).every(isExplanation)
  );
}

const cacheKey = (text: string, langKey: string) => `${langKey}::${text.trim().toLowerCase()}`;

// Ключ стану рядка. У ньому є індекс і текст, тож коли завантажується інше відео,
// старі стани просто "не знаходяться" — скидати їх вручну не треба.
const lineId = (line: LyricLine, index: number, langKey: string) =>
  `${langKey}:${index}:${line.start}:${line.text}`;

export default function InteractiveLyrics({
  lines,
  currentTime,
  onSeek,
  onExplainStart,
  songTitle = null,
}: Props) {
  // 1. КЕШ: текст рядка -> готове пояснення.
  //    Живе, поки відкрита сторінка, і переживає зміну відео.
  // Переживає перезавантаження сторінки: те саме пояснення не просимо в AI вдруге
  const [explanationCache, setExplanationCache] = usePersistentState<Record<string, Explanation>>(
    "lingo-clips:explanations",
    {},
    isExplanationRecord,
  );

  // 2. Стан панелі пояснення для кожного рядка (loading / error / open)
  const [lineStates, setLineStates] = useState<Record<string, LineState>>({});

  // 3. Тоглер автоскролу
  const [autoScroll, setAutoScroll] = useState(true);

  // Мови з контексту: що вибрав користувач — те й іде в запит до AI та в ключі кешу
  const { t, sourceLanguage, targetLanguage } = useLanguage();
  const langKey = `${sourceLanguage}>${targetLanguage}`;

  // Ref на DOM-елемент АКТИВНОГО рядка (прив'язується лише до одного рядка за раз)
  const activeLineRef = useRef<HTMLDivElement | null>(null);

  // Індекс активного рядка: той, чий проміжок [start, start + duration) містить currentTime
  const activeIndex = useMemo(
    () =>
      lines.findIndex((line) => currentTime >= line.start && currentTime < line.start + line.duration),
    [lines, currentTime],
  );

  // АВТОСКРОЛ: коли змінився активний рядок (або автоскрол увімкнули) —
  // плавно ставимо його по центру видимої області.
  useEffect(() => {
    if (!autoScroll) return;
    activeLineRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [activeIndex, autoScroll]);

  // Допоміжна функція: змінити стан одного рядка (undefined = прибрати стан, тобто закрити)
  function setLineState(id: string, state: LineState | undefined) {
    setLineStates((prev) => {
      const next = { ...prev };
      if (state) next[id] = state;
      else delete next[id];
      return next;
    });
  }

  async function handleExplain(index: number) {
    const line = lines[index];
    const id = lineId(line, index, langKey);
    const key = cacheKey(line.text, langKey);

    // Картка вже відкрита -> повторний клік її ховає
    if (lineStates[id]?.kind === "open") {
      setLineState(id, undefined);
      return;
    }

    onExplainStart?.();

    // КЕШ: якщо цей рядок уже пояснювали — показуємо миттєво, БЕЗ fetch
    if (explanationCache[key]) {
      setLineState(id, { kind: "open" });
      return;
    }

    // Кешу немає -> показуємо скелетон і йдемо на сервер
    setLineState(id, { kind: "loading" });

    try {
      const response = await fetch("/api/explain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: line.text, sourceLanguage, targetLanguage }),
      });

      // Читаємо як текст: якщо сервер повернув HTML чи порожню відповідь — покажемо зрозумілу помилку
      const raw = await response.text();
      let json: Record<string, unknown>;
      try {
        json = JSON.parse(raw);
      } catch {
        throw new Error(`Сервер повернув не JSON (статус ${response.status}). Дивись термінал.`);
      }
      if (!response.ok) {
        throw new Error(typeof json.error === "string" ? json.error : "Не вдалося отримати пояснення");
      }

      // Кладемо відповідь у кеш і розгортаємо картку
      setExplanationCache((prev) =>
        capEntries({ ...prev, [key]: json as unknown as Explanation }, MAX_CACHED_EXPLANATIONS),
      );
      setLineState(id, { kind: "open" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Невідома помилка";
      setLineState(id, { kind: "error", message });
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {/* Панель керування над списком */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{t("lyrics.lines", { count: lines.length })}</p>

        <Button
          type="button"
          size="sm"
          variant={autoScroll ? "secondary" : "outline"}
          aria-pressed={autoScroll}
          onClick={() => setAutoScroll((value) => !value)}
        >
          {t("lyrics.autoscroll")}: {autoScroll ? t("common.on") : t("common.off")}
        </Button>
      </div>

      {/* Контейнер зі списком, що прокручується */}
      <div className="h-[28rem] space-y-1 overflow-y-auto rounded-xl border bg-card p-3">
        {lines.map((line, index) => {
          const id = lineId(line, index, langKey);
          const isActive = index === activeIndex;
          const state = lineStates[id];
          const cached = explanationCache[cacheKey(line.text, langKey)];

          return (
            <div
              key={id}
              // ref чіпляємо ТІЛЬКИ до активного рядка — саме його useEffect скролить у центр
              ref={isActive ? activeLineRef : null}
              className={`rounded-lg border-l-4 px-3 py-2 transition-colors ${
                isActive ? "border-primary bg-primary/10" : "border-transparent hover:bg-muted/60"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <button
                  type="button"
                  onClick={() => onSeek(line.start)}
                  className={`text-left text-lg leading-snug ${
                    isActive ? "font-semibold text-foreground" : "text-muted-foreground"
                  }`}
                >
                  {line.text}
                </button>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="shrink-0"
                  disabled={state?.kind === "loading"}
                  onClick={() => handleExplain(index)}
                >
                  {state?.kind === "loading" ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : state?.kind === "open" ? (
                    <ChevronUp className="size-4" />
                  ) : (
                    <Sparkles className="size-4" />
                  )}
                  {state?.kind === "open" ? t("explain.hide") : t("explain.button")}
                </Button>
              </div>

              {/* Що показувати під рядком залежно від стану */}
              {state?.kind === "loading" && <ExplanationSkeleton />}

              {state?.kind === "error" && (
                <p role="alert" className="mt-2 text-sm text-destructive">
                  {state.message}
                </p>
              )}

              {state?.kind === "open" && cached && (
                <ExplanationCard
                  data={cached}
                  // Кнопка "Зберегти в словник" усередині картки пояснення
                  actions={
                    <SaveToVocabularyButton
                      original={line.text}
                      explanation={cached}
                      songTitle={songTitle}
                    />
                  }
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
