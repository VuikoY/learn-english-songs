// components/ExplanationCard.tsx
// Три розділи з відповіддю AI, картка для чату та скелетон завантаження.
// Заголовки розділів беруться з мови інтерфейсу (useLanguage), тому це клієнтський компонент.
"use client";

import type { ReactNode } from "react";
import { BookOpen, Languages, Zap, type LucideIcon } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import type { Explanation } from "@/lib/types";

// ---------- Один розділ: кольорова іконка + заголовок + текст ----------

type SectionProps = {
  icon: LucideIcon;
  title: string;
  /** Tailwind-класи для кольору "плашки" під іконкою */
  accent: string;
  children: ReactNode;
};

function Section({ icon: Icon, title, accent, children }: SectionProps) {
  return (
    <div className="flex gap-3">
      <div className={`mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg ${accent}`}>
        <Icon className="size-4" aria-hidden />
      </div>
      <div className="min-w-0">
        <h4 className="text-sm font-medium">{title}</h4>
        <p className="text-sm leading-relaxed text-muted-foreground">{children}</p>
      </div>
    </div>
  );
}

// ---------- Лише три розділи (без рамки): у чаті й у словнику ----------

export function ExplanationSections({ data }: { data: Explanation }) {
  const { t } = useLanguage();
  const hasSlang = data.slang.trim() !== "";

  return (
    <div className="space-y-4">
      <Section
        icon={Languages}
        title={t("explain.translation")}
        accent="bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300"
      >
        {data.translation}
      </Section>

      <Section
        icon={BookOpen}
        title={t("explain.grammar")}
        accent="bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300"
      >
        {data.grammar}
      </Section>

      <Section
        icon={Zap}
        title={t("explain.slang")}
        accent="bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
      >
        {hasSlang ? data.slang : t("explain.noSlang")}
      </Section>
    </div>
  );
}

// ---------- Картка під рядком пісні: рамка + анімація + місце для кнопок ----------

type CardProps = {
  data: Explanation;
  /** Кнопки внизу картки (наприклад, "Зберегти в словник"). */
  actions?: ReactNode;
};

export default function ExplanationCard({ data, actions }: CardProps) {
  return (
    // animate-in / fade-in / slide-in-from-top-2 надає tw-animate-css (ставиться разом із shadcn).
    <div className="mt-3 space-y-4 rounded-xl border bg-muted/40 p-4 duration-300 animate-in fade-in slide-in-from-top-2 motion-reduce:animate-none">
      <ExplanationSections data={data} />
      {actions && <div className="flex flex-wrap items-center gap-3 border-t pt-3">{actions}</div>}
    </div>
  );
}

// ---------- Скелетон: сіра "заглушка" тієї ж форми, що й картка ----------

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
      className="mt-3 space-y-4 rounded-xl border bg-muted/40 p-4 animate-pulse motion-reduce:animate-none"
    >
      <span className="sr-only">{t("explain.loading")}</span>
      <SkeletonRow lastWidth="w-2/3" />
      <SkeletonRow lastWidth="w-1/2" />
      <SkeletonRow lastWidth="w-3/4" />
    </div>
  );
}
