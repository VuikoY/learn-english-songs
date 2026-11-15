"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useAuthState } from "@/context/AuthContext";

type DailyWordCounterValue = {
  wordsToday: number | null;
  loadError: boolean;
  increaseId: number;
  incrementWordsToday: () => void;
};

const DailyWordCounterContext = createContext<DailyWordCounterValue | null>(null);

export function DailyWordCounterProvider({ children }: { children: ReactNode }) {
  const { userId, loading: authLoading } = useAuthState();
  const [dailyCount, setDailyCount] = useState<{ userId: string; wordsToday: number | null; loadError: boolean } | null>(null);
  const [increaseId, setIncreaseId] = useState(0);
  const pendingWordsRef = useRef(0);
  const activeUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!userId) {
      activeUserIdRef.current = null;
      pendingWordsRef.current = 0;
      return;
    }

    if (activeUserIdRef.current !== userId) {
      activeUserIdRef.current = userId;
      pendingWordsRef.current = 0;
    }

    const controller = new AbortController();
    let active = true;

    void (async () => {
      try {
        const response = await fetch("/api/learning-activity", {
          cache: "no-store",
          signal: controller.signal,
        });
        const result: unknown = await response.json().catch(() => null);
        const payload = typeof result === "object" && result !== null
          ? result as { wordsToday?: unknown; error?: unknown }
          : null;
        if (
          !response.ok ||
          typeof payload?.wordsToday !== "number" ||
          !Number.isInteger(payload.wordsToday) ||
          payload.wordsToday < 0
        ) {
          throw new Error(typeof payload?.error === "string" ? payload.error : "ACTIVITY_LOOKUP_FAILED");
        }
        if (active) {
          setDailyCount({
            userId,
            wordsToday: payload.wordsToday + pendingWordsRef.current,
            loadError: false,
          });
          pendingWordsRef.current = 0;
        }
      } catch (error) {
        if (active && !controller.signal.aborted) {
          console.error("[daily-word-counter] Could not load today's word count.", error);
          setDailyCount({ userId, wordsToday: null, loadError: true });
        }
      }
    })();

    return () => {
      active = false;
      controller.abort();
    };
  }, [authLoading, userId]);

  const incrementWordsToday = useCallback(() => {
    if (!userId) return;
    pendingWordsRef.current += 1;
    setIncreaseId((current) => current + 1);
    setDailyCount((current) => current?.userId === userId && current.wordsToday !== null
      ? { ...current, wordsToday: current.wordsToday + 1 }
      : current);
  }, [userId]);

  const currentCount = dailyCount?.userId === userId ? dailyCount : null;
  return (
    <DailyWordCounterContext.Provider value={{
      wordsToday: currentCount?.wordsToday ?? null,
      loadError: currentCount?.loadError ?? false,
      increaseId,
      incrementWordsToday,
    }}>
      {children}
    </DailyWordCounterContext.Provider>
  );
}

export function useDailyWordCounter() {
  const context = useContext(DailyWordCounterContext);
  if (!context) throw new Error("useDailyWordCounter must be used within DailyWordCounterProvider.");
  return context;
}
