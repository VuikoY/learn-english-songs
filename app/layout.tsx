import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { cookies, headers } from "next/headers";
import "./globals.css";
import Header from "@/components/Header";
import Providers from "./providers";
import { LANGUAGE_SETTINGS_COOKIE, UI_LANGUAGE_COOKIE } from "@/lib/i18n/settings";
import { getInitialLanguages } from "@/lib/i18n/initial-languages";

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
  title: "LingoMix — language learning with phrases and media",
  description: "Practice languages with phrases from songs, videos, and collections.",
  robots: {
    index: false,
    follow: false,
    googleBot: {
      index: false,
      follow: false,
    },
  },
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const cookieStore = await cookies();
  const requestHeaders = await headers();
  const initialSettings = getInitialLanguages({
    settingsCookie: cookieStore.get(LANGUAGE_SETTINGS_COOKIE)?.value,
    uiLanguageCookie: cookieStore.get(UI_LANGUAGE_COOKIE)?.value,
    acceptLanguage: requestHeaders.get("accept-language") ?? undefined,
  });
  const initialUiLanguage = initialSettings.uiLanguage;

  return (
    <html
      lang={initialUiLanguage}
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <Providers initialSettings={initialSettings}>
          <Header />
          {children}
        </Providers>
      </body>
    </html>
  );
}
