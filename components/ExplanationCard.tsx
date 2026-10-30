// components/ExplanationCard.tsx
// Three AI explanation sections, the inline card, and its loading skeleton.
// Section headings use the active interface language, so this is a client component.
"use client";

import type { ReactNode } from "react";
import { BookOpen, Languages, Zap, type LucideIcon } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import type { Explanation } from "@/lib/types";

// ---------- One section: tinted icon, heading, and text ----------

type SectionProps = {
  icon: LucideIcon;
  title: string;
  /** Tailwind classes for the icon badge. */
  accent: string;
  streaming?: boolean;
  children: ReactNode;
};

function Section({ icon: Icon, title, accent, streaming = false, children }: SectionProps) {
  return (
    <div className="flex gap-3">
      <div className={`mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg ${accent}`}>
        <Icon className="size-4" aria-hidden />
      </div>
      <div className="min-w-0">
        <h4 className="text-sm font-medium">{title}</h4>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {children}
          {streaming && <span aria-hidden="true" className="ml-0.5 inline-block animate-pulse text-primary">▍</span>}
        </p>
      </div>
    </div>
  );
}

// ---------- Three sections without a surrounding card, used in chat and vocabulary ----------

function ExplanationSections({ data, streaming = false }: { data: Partial<Explanation>; streaming?: boolean }) {
  const { t } = useLanguage();
  const activeField = streaming
    ? data.slang !== undefined
      ? "slang"
      : data.grammar !== undefined
        ? "grammar"
        : data.translation !== undefined
          ? "translation"
          : undefined
    : undefined;

  return (
    <div className="space-y-4">
      <Section
        icon={Languages}
        title={t("explain.translation")}
        accent="bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
        streaming={activeField === "translation"}
      >
        {data.translation ?? ""}
      </Section>

      <Section
        icon={BookOpen}
        title={t("explain.grammar")}
        accent="bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300"
        streaming={activeField === "grammar"}
      >
        {data.grammar ?? ""}
      </Section>

      <Section
        icon={Zap}
        title={t("explain.slang")}
        accent="bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
        streaming={activeField === "slang"}
      >
        {data.slang === undefined || data.slang === ""
          ? streaming ? "" : t("explain.noSlang")
          : data.slang}
      </Section>
    </div>
  );
}

// ---------- Inline card below a song line, with animation and an action area ----------

type CardProps = {
  data: Partial<Explanation>;
  streaming?: boolean;
  /** Optional actions displayed at the bottom of the card. */
  actions?: ReactNode;
};

export default function ExplanationCard({ data, streaming = false, actions }: CardProps) {
  return (
    // The tw-animate-css package provides these animation utilities.
    <div aria-busy={streaming} className="mt-3 space-y-4 rounded-xl border bg-muted p-4 duration-300 animate-in fade-in slide-in-from-top-2 motion-reduce:animate-none">
      <ExplanationSections data={data} streaming={streaming} />
      {actions && <div className="flex flex-wrap items-center gap-3 border-t pt-3">{actions}</div>}
    </div>
  );
}

export function StreamingExplanation({ data }: { data: Partial<Explanation> }) {
  const hasContent = Object.values(data).some((value) => typeof value === "string");
  return hasContent
    ? <ExplanationCard data={data} streaming />
    : <ExplanationSkeleton />;
}

// ---------- Loading skeleton matching the card layout ----------

function SkeletonRow({ lastWidth }: { lastWidth: string }) {
  return (
    <div className="flex gap-3">
      <div className="size-8 shrink-0 rounded-lg bg-muted-foreground/15" />
      <div className="flex-1 space-y-2 pt-1">
        <div className="h-3 w-20 rounded bg-muted-foreground/15" />
        <div className="h-3 w-full rounded bg-muted-foreground/15" />
        <div className={`h-3 rounded bg-muted-foreground/15 ${lastWidth}`} />
      </div>
    </div>
  );
}

export function ExplanationSkeleton() {
  const { t } = useLanguage();

  return (
    <div
      role="status"
      aria-busy="true"
      className="mt-3 space-y-4 rounded-xl border bg-muted p-4 animate-pulse motion-reduce:animate-none"
    >
      <span className="sr-only">{t("explain.loading")}</span>
      <SkeletonRow lastWidth="w-2/3" />
      <SkeletonRow lastWidth="w-1/2" />
      <SkeletonRow lastWidth="w-3/4" />
    </div>
  );
}
