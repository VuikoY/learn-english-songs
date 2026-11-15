"use client";

import { Suspense, type ReactNode } from "react";
import { LanguageProvider } from "@/context/LanguageContext";
import { AuthProvider } from "@/context/AuthContext";
import { DailyWordCounterProvider } from "@/context/DailyWordCounterContext";
import FloatingDailyCounter from "@/components/FloatingDailyCounter";
import type { Language } from "@/types/game";

export default function Providers({ children, initialUiLanguage }: { children: ReactNode; initialUiLanguage: Language }) {
  return (
    <AuthProvider>
      <LanguageProvider initialUiLanguage={initialUiLanguage}>
        <DailyWordCounterProvider>
          {children}
          <Suspense fallback={null}>
            <FloatingDailyCounter />
          </Suspense>
        </DailyWordCounterProvider>
      </LanguageProvider>
    </AuthProvider>
  );
}
