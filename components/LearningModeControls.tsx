"use client";

import { Keyboard, Puzzle, ScrollText } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import type { GameSettings } from "@/types/game";

type Props = {
  view: "read" | "play";
  gameMode: GameSettings["mode"];
  progress: { current: number; total: number };
  readProgress: number;
  onRead: () => void;
  onGameMode: (mode: GameSettings["mode"]) => void;
};

export default function LearningModeControls({ view, gameMode, progress, readProgress, onRead, onGameMode }: Props) {
  const { t } = useLanguage();

  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap gap-1.5" role="group" aria-label={t("game.mode.label")}>
            <button
              type="button"
              aria-pressed={view === "read"}
              onClick={onRead}
              className={`flex h-9 items-center gap-2 rounded border px-3 text-xs text-left transition-all duration-200 ${view === "read" ? "scale-[1.03] border-primary bg-primary font-bold text-primary-foreground shadow-lg ring-2 ring-primary/50" : "border-border bg-card font-medium text-muted-foreground hover:border-primary/60 hover:bg-muted"}`}
            >
              <ScrollText className="size-4" />
              {t("nav.read")}
            </button>
            <button
              type="button"
              aria-pressed={view === "play" && gameMode === "fill-blanks"}
              onClick={() => onGameMode("fill-blanks")}
              className={`flex h-9 items-center gap-2 rounded border px-3 text-xs text-left transition-all duration-200 ${view === "play" && gameMode === "fill-blanks" ? "scale-[1.03] border-primary bg-primary font-bold text-primary-foreground shadow-lg ring-2 ring-primary/50" : "border-border bg-card font-medium text-muted-foreground hover:border-primary/60 hover:bg-muted"}`}
            >
              <Puzzle className="size-4" />
              {t("game.mode.fillBlanks")}
            </button>
            <button
              type="button"
              aria-pressed={view === "play" && gameMode === "first-letter"}
              onClick={() => onGameMode("first-letter")}
              className={`flex h-9 items-center gap-2 rounded border px-3 text-xs text-left transition-all duration-200 ${view === "play" && gameMode === "first-letter" ? "scale-[1.03] border-primary bg-primary font-bold text-primary-foreground shadow-lg ring-2 ring-primary/50" : "border-border bg-card font-medium text-muted-foreground hover:border-primary/60 hover:bg-muted"}`}
            >
              <Keyboard className="size-4" />
              {t("game.mode.firstLetter")}
            </button>
          </div>
        </div>
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {t("game.line", { ...progress, current: view === "read" ? readProgress : progress.current })}
        </p>
      </div>
    </div>
  );
}
