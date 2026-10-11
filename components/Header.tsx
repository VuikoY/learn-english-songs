// components/Header.tsx
// Шапка сайту. Без акаунтів: логотип, вибір мов і посилання на словник.

import Link from "next/link";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import VocabularyNavLink from "@/components/VocabularyNavLink";

export default function Header() {
  return (
    <header className="border-b">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4">
        <Link href="/" className="font-semibold tracking-tight">
          LingoClips
        </Link>

        <nav className="flex items-center gap-2">
          <LanguageSwitcher />
          <VocabularyNavLink />
        </nav>
      </div>
    </header>
  );
}
