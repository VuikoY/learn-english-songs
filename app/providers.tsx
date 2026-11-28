"use client";

import { Suspense, type ReactNode } from "react";
import { LanguageProvider } from "@/context/LanguageContext";
import { AuthProvider } from "@/context/AuthContext";
import { DailyWordCounterProvider } from "@/context/DailyWordCounterContext";
import FloatingDailyCounter from "@/components/FloatingDailyCounter";
import type { LanguageSettings } from "@/types/game";

export default function Providers({ children, initialSettings }: { children: ReactNode; initialSettings: LanguageSettings }) {
  return (
    <AuthProvider>
      <LanguageProvider initialSettings={initialSettings}>
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
