// components/Header.tsx
// Site header with the logo, language selector, and vocabulary link.

import Link from "next/link";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import VocabularyNavLink from "@/components/VocabularyNavLink";
import AuthLink from "@/components/AuthLink";

export default function Header() {
  return (
    <header className="relative z-50 border-b border-border bg-card/85 shadow-sm backdrop-blur-sm">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-4 px-4">
        <Link href="/" className="font-semibold tracking-tight">
          LingoClips
        </Link>

        <nav className="flex items-center gap-2">
          <LanguageSwitcher />
          <VocabularyNavLink />
          <AuthLink />
        </nav>
      </div>
    </header>
  );
}
