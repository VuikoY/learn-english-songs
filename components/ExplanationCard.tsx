// components/ExplanationCard.tsx
// Картка з відповіддю AI (3 розділи) і скелетон, який показуємо, поки чекаємо відповідь.

import type { ReactNode } from "react";
import { BookOpen, Languages, Zap, type LucideIcon } from "lucide-react";
import type { Explanation } from "@/lib/types";

// ---------- Один розділ картки: кольорова іконка + заголовок + текст ----------

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

// ---------- Картка з готовою відповіддю ----------

export default function ExplanationCard({ data }: { data: Explanation }) {
  const hasSlang = data.slang.trim() !== "";

  return (
    // animate-in / fade-in / slide-in-from-top-2 надає tw-animate-css (ставиться разом із shadcn).
    // motion-reduce — поважаємо налаштування "зменшити анімацію" в системі.
    <div className="mt-3 space-y-4 rounded-xl border bg-muted/40 p-4 duration-300 animate-in fade-in slide-in-from-top-2 motion-reduce:animate-none">
      <Section
        icon={Languages}
        title="Переклад"
        accent="bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300"
      >
        {data.translation}
      </Section>

      <Section
        icon={BookOpen}
        title="Граматика"
        accent="bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300"
      >
        {data.grammar}
      </Section>

      <Section
        icon={Zap}
        title="Сленг"
        accent="bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
      >
        {hasSlang ? data.slang : "У цьому рядку сленгу немає."}
      </Section>
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
  return (
    // role="status" + sr-only текст — щоб скрінрідер озвучив, що йде завантаження
    <div
      role="status"
      aria-busy="true"
      className="mt-3 space-y-4 rounded-xl border bg-muted/40 p-4 animate-pulse motion-reduce:animate-none"
    >
      <span className="sr-only">AI готує пояснення…</span>
      <SkeletonRow lastWidth="w-2/3" />
      <SkeletonRow lastWidth="w-1/2" />
      <SkeletonRow lastWidth="w-3/4" />
    </div>
  );
}
