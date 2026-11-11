"use client";

// components/Header.tsx
// Site header with the logo, language selector, and vocabulary link.

import Link from "next/link";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import FavoritesNavLink from "@/components/FavoritesNavLink";
import AuthLink from "@/components/AuthLink";
import GlobalSearch from "@/components/GlobalSearch";
import { buttonVariants } from "@/components/ui/button";
import { useLanguage } from "@/context/LanguageContext";
import { BookMarked, Shuffle } from "lucide-react";

export default function Header() {
  const { t } = useLanguage();
  return (
    <header className="relative z-50 border-b border-border bg-card/85 shadow-sm backdrop-blur-sm">
      <div className="mx-auto grid max-w-7xl grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-2 px-4 py-3 sm:flex sm:h-14 sm:py-0">
        <Link href="/" className="font-semibold tracking-tight">
          LingoClips
        </Link>

        <nav className="order-2 col-start-2 row-start-1 flex shrink-0 items-center justify-end gap-2 sm:order-2 sm:ml-auto sm:gap-4">
          <LanguageSwitcher />
          <Link href="/collections" aria-label={t("nav.collections")} title={t("nav.collections")} className={buttonVariants({ variant: "ghost", size: "sm", className: "gap-1.5" })}>
            <BookMarked className="size-4" aria-hidden="true" />
            <span className="hidden sm:inline">{t("nav.collections")}</span>
          </Link>
          <Link href="/phrase-mix" aria-label={t("nav.phraseMix")} title={t("nav.phraseMix")} className={buttonVariants({ variant: "ghost", size: "sm", className: "gap-1.5" })}>
            <Shuffle className="size-4" aria-hidden="true" />
            <span className="hidden sm:inline">{t("nav.phraseMix")}</span>
          </Link>
          <FavoritesNavLink />
          <AuthLink />
        </nav>
        <div className="col-span-2 row-start-2 min-w-0 sm:order-1 sm:flex sm:min-w-0 sm:flex-1 sm:justify-center sm:px-4">
          <GlobalSearch />
        </div>
      </div>
    </header>
  );
}
