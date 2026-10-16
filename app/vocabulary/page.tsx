// app/vocabulary/page.tsx
// Vocabulary page backed by localStorage, so this is a client component.
"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { BookMarked, Download, Search } from "lucide-react";
import VocabularyCard from "@/components/VocabularyCard";
import { Button, buttonVariants } from "@/components/ui/button";
import { useLanguage } from "@/context/LanguageContext";
import { useVocabulary } from "@/lib/storage/vocabulary";
import type { VocabularyItem } from "@/lib/types";

/** Downloads the vocabulary as vocabulary.json for backup or migration. */
function exportJson(items: VocabularyItem[]) {
  const blob = new Blob([JSON.stringify(items, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "vocabulary.json";
  link.click();
  URL.revokeObjectURL(url);
}

export default function VocabularyPage() {
  const { t } = useLanguage();
  const { items, removeWord } = useVocabulary();
  const [query, setQuery] = useState("");

  // Search original phrases, translations, and song titles.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) =>
      [item.original_text, item.translation, item.song_title ?? ""].some((field) =>
        field.toLowerCase().includes(q),
      ),
    );
  }, [items, query]);

  return (
    <main className="mx-auto w-full max-w-6xl py-8">
      <h1 className="mb-1 text-2xl font-semibold tracking-tight">{t("vocab.title")}</h1>
      <p className="mb-6 text-muted-foreground">
        {t("vocab.subtitle", { count: items.length })} · {t("vocab.localNote")}
      </p>

      {items.length === 0 ? (
        // Explain what the user can do when the vocabulary is empty.
        <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed py-16 text-center">
          <BookMarked className="size-8 text-muted-foreground" aria-hidden />
          <p className="font-medium">{t("vocab.empty")}</p>
          <p className="max-w-xs text-sm text-muted-foreground">{t("vocab.emptyHint")}</p>
          <Link href="/" className={buttonVariants({ variant: "outline", size: "sm" })}>
            {t("vocab.toLyrics")}
          </Link>
        </div>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <div className="relative min-w-56 flex-1">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("vocab.search")}
                aria-label={t("vocab.search")}
                className="h-9 w-full rounded-md border bg-background pl-9 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
            <Button type="button" variant="outline" size="sm" onClick={() => exportJson(items)}>
              <Download className="size-4" />
              {t("vocab.export")}
            </Button>
          </div>

          {filtered.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">{t("vocab.noResults")}</p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map((item) => (
                <VocabularyCard key={item.id} item={item} onRemove={removeWord} />
              ))}
            </div>
          )}
        </>
      )}
    </main>
  );
}
