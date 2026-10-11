// lib/storage/usePersistentState.ts
// useState, значення якого зберігається в localStorage.
"use client";

import { useEffect, useState, type Dispatch, type SetStateAction } from "react";

/**
 * @param validate необов'язкова перевірка прочитаного значення: якщо в localStorage лежить
 *                 сміття (стара версія, ручна правка), ми його ігноруємо замість того, щоб зламати рендер.
 */
export function usePersistentState<T>(
  key: string,
  initialValue: T,
  validate?: (value: unknown) => value is T,
): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(initialValue);
  // Поки не прочитали localStorage, нічого в нього не пишемо (щоб не затерти збережене початковим значенням)
  const [hydrated, setHydrated] = useState(false);

  // Читаємо ПІСЛЯ монтування: на сервері localStorage немає, а перший рендер має збігатися з серверним HTML
  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw !== null) {
        const parsed: unknown = JSON.parse(raw);
        if (!validate || validate(parsed)) setValue(parsed as T);
      }
    } catch {
      // пошкоджений JSON або заблокований localStorage — лишаємо початкове значення
    }
    setHydrated(true);
    // validate навмисно не в залежностях: це стабільна функція, а перечитувати сховище при її зміні не треба
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // сховище заповнене або недоступне — просто не зберігаємо
    }
  }, [key, value, hydrated]);

  return [value, setValue];
}

/** Лишає в об'єкті не більше max останніх записів (щоб кеш не розростався безмежно). */
export function capEntries<V>(record: Record<string, V>, max: number): Record<string, V> {
  const keys = Object.keys(record);
  if (keys.length <= max) return record;

  const trimmed: Record<string, V> = {};
  for (const k of keys.slice(keys.length - max)) trimmed[k] = record[k];
  return trimmed;
}
