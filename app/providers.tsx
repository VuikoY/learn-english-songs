"use client";

import type { ReactNode } from "react";
import { LanguageProvider } from "@/context/LanguageContext";
import { AuthProvider } from "@/context/AuthContext";

export default function Providers({ children }: { children: ReactNode }) {
  return <AuthProvider><LanguageProvider>{children}</LanguageProvider></AuthProvider>;
}
