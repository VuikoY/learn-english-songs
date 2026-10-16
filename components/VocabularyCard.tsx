// components/VocabularyCard.tsx
// Card displaying one saved vocabulary phrase.
"use client";

import { Music2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ExplanationSections } from "@/components/ExplanationCard";
import { useLanguage } from "@/context/LanguageContext";
import type { VocabularyItem } from "@/lib/types";
import { LANGUAGES } from "@/types/game";

export default function VocabularyCard({ item, onRemove }: { item: VocabularyItem; onRemove: (id: string) => void }) {
  const { t, uiLanguage } = useLanguage();

  const date = new Intl.DateTimeFormat(uiLanguage, { dateStyle: "medium" }).format(new Date(item.created_at));

  return (
    <article className="flex flex-col gap-4 rounded-xl border bg-card p-5 duration-300 animate-in fade-in zoom-in-95 motion-reduce:animate-none">
      <header className="space-y-1">
        <h2 className="text-lg font-semibold leading-snug">{item.original_text}</h2>
        <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Music2 className="size-3.5 shrink-0" aria-hidden />
          <span className="truncate">{item.song_title ?? "—"}</span>
          <span className="ml-auto shrink-0 rounded bg-muted px-1.5 py-0.5 text-xs">
            {LANGUAGES[item.source_language].label} → {LANGUAGES[item.target_language].label}
          </span>
        </p>
      </header>

      <ExplanationSections
        data={{ translation: item.translation, grammar: item.grammar, slang: item.slang }}
      />

      {/* Keep the footer aligned at the bottom of each card in the grid. */}
      <footer className="mt-auto flex items-center justify-between border-t pt-3">
        <time dateTime={item.created_at} className="text-xs text-muted-foreground">
          {date}
        </time>
        <Button type="button" variant="ghost" size="sm" onClick={() => onRemove(item.id)}>
          <Trash2 className="size-4" />
          {t("vocab.delete")}
        </Button>
      </footer>
    </article>
  );
}
