// components/VocabularyNavLink.tsx
// Header link to the vocabulary with a saved-phrase count.
"use client";

import Link from "next/link";
import { BookMarked } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { useLanguage } from "@/context/LanguageContext";
import { useVocabulary } from "@/lib/storage/vocabulary";

export default function VocabularyNavLink() {
  const { t } = useLanguage();
  const { items } = useVocabulary();

  return (
    <Link href="/vocabulary" className={buttonVariants({ variant: "ghost", size: "sm" })}>
      <BookMarked className="size-4" />
      {t("nav.vocabulary")}
      {items.length > 0 && (
        <span className="rounded bg-primary px-1.5 text-xs text-primary-foreground">{items.length}</span>
      )}
    </Link>
  );
}
