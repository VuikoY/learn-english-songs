// components/SaveToVocabularyButton.tsx
// Saves a phrase to the local vocabulary; account sign-in is not required.
"use client";

import { useState } from "react";
import { Bookmark, BookmarkCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/context/LanguageContext";
import { isSameWord, useVocabulary } from "@/lib/storage/vocabulary";
import type { Explanation } from "@/lib/types";

type Props = {
  /** Original song line. */
  original: string;
  explanation: Explanation;
  /** Optional video title. */
  songTitle?: string | null;
};

export default function SaveToVocabularyButton({ original, explanation, songTitle = null }: Props) {
  const { t, sourceLanguage, targetLanguage } = useLanguage();
  const { items, addWord } = useVocabulary();
  const [failed, setFailed] = useState(false);

  // Derive the saved state from storage so it persists when the card is reopened.
  const isSaved = items.some((item) => isSameWord(item, original, targetLanguage));

  function handleSave() {
    const result = addWord({
      original_text: original,
      translation: explanation.translation,
      grammar: explanation.grammar,
      slang: explanation.slang,
      song_title: songTitle,
      source_language: sourceLanguage,
      target_language: targetLanguage,
    });
    setFailed(result === "error");
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button
        type="button"
        size="sm"
        variant={isSaved ? "default" : "outline"}
        disabled={isSaved}
        onClick={handleSave}
      >
        {isSaved ? <BookmarkCheck className="size-4" /> : <Bookmark className="size-4" />}
        {isSaved ? t("vocab.saved") : t("vocab.save")}
      </Button>

      {failed && (
        <p role="alert" className="text-sm text-destructive">
          {t("vocab.error")}
        </p>
      )}
    </div>
  );
}
