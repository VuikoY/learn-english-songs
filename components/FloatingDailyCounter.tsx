"use client";

import { useCallback, useEffect, useRef, useState, type MouseEvent, type PointerEvent } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Flame } from "lucide-react";
import { useAuthState } from "@/context/AuthContext";
import { useDailyWordCounter } from "@/context/DailyWordCounterContext";
import { useLanguage } from "@/context/LanguageContext";

type Position = { right: number; bottom: number };
type DragState = Position & {
  pointerId: number;
  startX: number;
  startY: number;
  moved: boolean;
};

const POSITION_KEY = "lingo-clips:floating-daily-counter-position:v1";
const EDGE_GAP = 16;

export default function FloatingDailyCounter() {
  const { userId, loading: authLoading } = useAuthState();
  const { wordsToday, loadError, increaseId } = useDailyWordCounter();
  const { t, uiLanguage } = useLanguage();
  const pathname = usePathname();
  const badgeRef = useRef<HTMLAnchorElement>(null);
  const positionRef = useRef<Position>({ right: EDGE_GAP, bottom: EDGE_GAP });
  const dragRef = useRef<DragState | null>(null);
  const suppressClickRef = useRef(false);
  const [position, setPosition] = useState<Position>({ right: EDGE_GAP, bottom: EDGE_GAP });

  const updatePosition = useCallback((value: Position) => {
    positionRef.current = value;
    setPosition(value);
  }, []);

  const isStatsPage = pathname === "/stats" || pathname === "/learning-stats" || pathname === "/dashboard/stats";

  useEffect(() => {
    if (authLoading || !userId || isStatsPage) return;
    const frame = window.requestAnimationFrame(() => {
      try {
        const saved = localStorage.getItem(POSITION_KEY);
        if (saved) {
          const parsed: unknown = JSON.parse(saved);
          if (
            typeof parsed !== "object" ||
            parsed === null ||
            !("right" in parsed) ||
            !("bottom" in parsed) ||
            typeof parsed.right !== "number" ||
            typeof parsed.bottom !== "number" ||
            !Number.isFinite(parsed.right) ||
            !Number.isFinite(parsed.bottom)
          ) {
            throw new Error("Saved floating counter position is invalid.");
          }
          updatePosition({ right: parsed.right, bottom: parsed.bottom });
        }
      } catch (error) {
        console.warn("[daily-word-counter] Could not read the saved position.", error);
      }
    });

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [authLoading, isStatsPage, updatePosition, userId]);

  function handlePointerDown(event: PointerEvent<HTMLAnchorElement>) {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      ...positionRef.current,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
    };
  }

  function handlePointerMove(event: PointerEvent<HTMLAnchorElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    const deltaX = event.clientX - drag.startX;
    const deltaY = event.clientY - drag.startY;
    if (!drag.moved && Math.hypot(deltaX, deltaY) < 5) return;

    drag.moved = true;
    event.preventDefault();
    updatePosition({ right: drag.right - deltaX, bottom: drag.bottom - deltaY });
  }

  function finishDrag(event: PointerEvent<HTMLAnchorElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    if (!drag.moved) return;

    suppressClickRef.current = true;
    try {
      localStorage.setItem(POSITION_KEY, JSON.stringify(positionRef.current));
    } catch (error) {
      console.error("[daily-word-counter] Could not save the position.", error);
    }
    window.setTimeout(() => {
      suppressClickRef.current = false;
    }, 0);
  }

  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    if (!suppressClickRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    suppressClickRef.current = false;
  }

  if (
    authLoading ||
    !userId ||
    isStatsPage
  ) {
    return null;
  }

  const formattedCount = wordsToday === null ? "—" : new Intl.NumberFormat(uiLanguage).format(wordsToday);
  const accessibleName = `${t("dashboard.learningStats")}: ${t("game.phraseMix.wordsToday")} ${formattedCount}`;

  return (
    <Link
      ref={badgeRef}
      href="/learning-stats"
      draggable={false}
      aria-label={accessibleName}
      title={loadError ? t("game.phraseMix.activityLookupError") : t("dashboard.learningStats")}
      className="fixed z-[60] flex touch-none select-none items-center gap-2 rounded-full border border-orange-400/60 bg-background/95 px-3 py-2 text-sm font-semibold text-foreground shadow-lg backdrop-blur-sm cursor-grab active:cursor-grabbing focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400"
      style={{ right: position.right, bottom: position.bottom }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={finishDrag}
      onPointerCancel={finishDrag}
      onClick={handleClick}
      onDragStart={(event) => event.preventDefault()}
    >
      <Flame
        key={increaseId}
        aria-hidden="true"
        className={`size-5 fill-yellow-400 text-yellow-500${increaseId ? " daily-counter-flash" : ""}`}
      />
      <span className="tabular-nums" aria-live="polite">{formattedCount}</span>
    </Link>
  );
}
