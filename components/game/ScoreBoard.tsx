// components/game/ScoreBoard.tsx
"use client";

import type { ReactNode } from "react";
import { Flame, Star, Trophy, Zap, type LucideIcon } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import type { Multiplier } from "@/types/game";

type Props = {
  score: number;
  streak: number;
  maxStreak: number;
  multiplier: Multiplier;
};

type StatProps = {
  icon: LucideIcon;
  label: string;
  /** Tailwind-класи кольору іконки */
  iconClass: string;
  /** Якщо true — плашка підсвічується (активний комбо-бонус) */
  highlighted?: boolean;
  children: ReactNode;
};

function Stat({ icon: Icon, label, iconClass, highlighted = false, children }: StatProps) {
  return (
    <div
      className={`rounded-xl border p-3 transition-colors ${
        highlighted ? "border-amber-400/60 bg-amber-50 dark:bg-amber-950/30" : "bg-card"
      }`}
    >
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className={`size-3.5 ${iconClass}`} aria-hidden />
        {label}
      </div>
      <div className="mt-1 text-2xl font-semibold tabular-nums leading-none">{children}</div>
    </div>
  );
}

export default function ScoreBoard({ score, streak, maxStreak, multiplier }: Props) {
  const { t } = useLanguage();

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      <Stat icon={Trophy} label={t("score.score")} iconClass="text-primary">
        {/* key={score}: при зміні очок елемент перестворюється й програє коротку анімацію */}
        <span key={score} className="inline-block duration-200 animate-in zoom-in-90">
          {score}
        </span>
      </Stat>

      <Stat
        icon={Flame}
        label={t("score.streak")}
        iconClass={streak >= 3 ? "text-orange-500" : "text-muted-foreground"}
      >
        {streak}
      </Stat>

      <Stat icon={Star} label={t("score.best")} iconClass="text-yellow-500">
        {maxStreak}
      </Stat>

      <Stat
        icon={Zap}
        label={t("score.multiplier")}
        iconClass={multiplier > 1 ? "text-amber-500" : "text-muted-foreground"}
        highlighted={multiplier > 1}
      >
        ×{multiplier}
      </Stat>
    </div>
  );
}
