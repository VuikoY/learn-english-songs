// components/game/WordBank.tsx
"use client";

import { useLanguage } from "@/context/LanguageContext";
import type { BankItem } from "@/types/game";

type Props = {
  items: BankItem[];
  /** Called when a word is selected; the parent validates the answer. */
  onPick: (item: BankItem) => void;
  disabled?: boolean;
};

export default function WordBank({ items, onPick, disabled = false }: Props) {
  const { t } = useLanguage();

  return (
    <div className="rounded-xl border bg-card/95 p-3 shadow-lg backdrop-blur">
      <p className="mb-2 text-xs font-medium text-muted-foreground">{t("game.wordBank")}</p>

      <div className="flex flex-wrap gap-2">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            disabled={disabled || item.used}
            onClick={() => onPick(item)}
            className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition ${
              item.used
                ? "cursor-default bg-muted text-muted-foreground/50 line-through"
                : "bg-background hover:-translate-y-0.5 hover:shadow-sm active:translate-y-0"
            }`}
          >
            {item.text}
          </button>
        ))}
      </div>
    </div>
  );
}
