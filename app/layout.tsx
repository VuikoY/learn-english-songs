import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { cookies } from "next/headers";
import "./globals.css";
import Header from "@/components/Header";
import Providers from "./providers";
import { DEFAULT_UI_LANGUAGE, UI_LANGUAGE_COOKIE } from "@/lib/i18n/settings";
import { isLanguage } from "@/types/game";

export const instant = false;

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "LingoClips — изучай языки по песням",
  description: "Изучай английский по песням: тексты, объяснения и игра со словами.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const cookieStore = await cookies();
  const cookieLanguage = cookieStore.get(UI_LANGUAGE_COOKIE)?.value;
  const initialUiLanguage = isLanguage(cookieLanguage) ? cookieLanguage : DEFAULT_UI_LANGUAGE;

  return (
    <html
      lang={initialUiLanguage}
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <Providers initialUiLanguage={initialUiLanguage}>
          <Header />
          {children}
        </Providers>
      </body>
    </html>
  );
}
