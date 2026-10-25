// lib/storage/usePersistentState.ts
// useState whose value is persisted in localStorage.
"use client";

import { useEffect, useState, type Dispatch, type SetStateAction } from "react";

/**
 * @param validate Optional validator for stored values. Invalid or outdated data is ignored.
 */
export function usePersistentState<T>(
  key: string,
  initialValue: T,
  validate?: (value: unknown) => value is T,
): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(initialValue);
  // Wait for the stored value before writing, so the initial state cannot overwrite it.
  const [hydrated, setHydrated] = useState(false);

  // Read after mount because localStorage is unavailable during server rendering.
  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      try {
        const raw = localStorage.getItem(key);
        if (raw !== null) {
          const parsed: unknown = JSON.parse(raw);
          if (active && (!validate || validate(parsed))) setValue(parsed as T);
        }
      } catch {
        // Keep the initial value if JSON is invalid or localStorage is unavailable.
      }
      if (active) setHydrated(true);
    });
    return () => { active = false; };
    // The validator is stable and does not need to trigger another storage read.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Skip persistence when storage is full or unavailable.
    }
  }, [key, value, hydrated]);

  return [value, setValue];
}
