"use client";

import type { ReactNode } from "react";
import { LanguageProvider } from "@/context/LanguageContext";
import { AuthProvider } from "@/context/AuthContext";
import type { Language } from "@/types/game";

export default function Providers({ children, initialUiLanguage }: { children: ReactNode; initialUiLanguage: Language }) {
  return <AuthProvider><LanguageProvider initialUiLanguage={initialUiLanguage}>{children}</LanguageProvider></AuthProvider>;
}
