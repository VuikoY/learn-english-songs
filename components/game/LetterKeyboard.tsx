// components/game/LetterKeyboard.tsx
// On-screen keyboard for first-letter mode, useful on phones and for mouse users.
"use client";

import { useLanguage } from "@/context/LanguageContext";

type Props = {
  letters: string[];
  onPress: (letter: string) => void;
  disabled?: boolean;
};

export default function LetterKeyboard({ letters, onPress, disabled = false }: Props) {
  const { t } = useLanguage();

  return (
    <div className="rounded-xl border bg-card/95 p-3 shadow-lg backdrop-blur">
      <p className="mb-2 text-xs font-medium text-muted-foreground">{t("game.pressLetter")}</p>

      <div className="flex flex-wrap justify-center gap-1.5">
        {letters.map((letter) => (
          <button
            key={letter}
            type="button"
            disabled={disabled}
            onClick={() => onPress(letter)}
            className="size-9 rounded-md border bg-background text-sm font-semibold uppercase transition hover:shadow-sm active:scale-95 disabled:opacity-50"
          >
            {letter}
          </button>
        ))}
      </div>
    </div>
  );
}
