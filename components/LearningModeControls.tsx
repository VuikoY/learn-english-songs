"use client";

import { Keyboard, Puzzle, ScrollText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/context/LanguageContext";
import type { GameSettings } from "@/types/game";

type Props = {
  hideRead?: boolean;
  className?: string;
  view: "read" | "play";
  gameMode: GameSettings["mode"];
  progress: { current: number; total: number };
  readProgress: number;
  onRead: () => void;
  onGameMode: (mode: GameSettings["mode"]) => void;
};

export default function LearningModeControls({ hideRead = false, className, view, gameMode, progress, readProgress, onRead, onGameMode }: Props) {
  const { t } = useLanguage();

  return (
    <div className={`flex flex-col gap-1 ${className ?? ""}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex w-fit flex-wrap items-center gap-1 rounded-lg border bg-muted/40 p-1" role="radiogroup" aria-label={t("game.mode.label")}>
            {!hideRead && <Button type="button" size="sm" className="gap-2" variant={view === "read" ? "default" : "outline"} role="radio" aria-checked={view === "read"} onClick={onRead}>
              <ScrollText className="size-4" aria-hidden="true" />{t("nav.read")}
            </Button>}
            <Button type="button" size="sm" className="gap-2" variant={view === "play" && gameMode === "fill-blanks" ? "default" : "outline"} role="radio" aria-checked={view === "play" && gameMode === "fill-blanks"} onClick={() => onGameMode("fill-blanks")}>
              <Puzzle className="size-4" aria-hidden="true" />{t("game.mode.fillBlanks")}
            </Button>
            <Button type="button" size="sm" className="gap-2" variant={view === "play" && gameMode === "first-letter" ? "default" : "outline"} role="radio" aria-checked={view === "play" && gameMode === "first-letter"} onClick={() => onGameMode("first-letter")}>
              <Keyboard className="size-4" aria-hidden="true" />{t("game.mode.firstLetter")}
            </Button>
          </div>
        </div>
        <p className="text-right text-sm text-muted-foreground" aria-live="polite">
          {t("game.line", { ...progress, current: view === "read" ? readProgress : progress.current })}
        </p>
      </div>
    </div>
  );
}
