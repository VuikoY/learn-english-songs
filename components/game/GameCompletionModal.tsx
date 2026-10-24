"use client";

import { useLanguage } from "@/context/LanguageContext";
import { Button } from "@/components/ui/button";

type Props = {
  accuracy: number;
  wordsCompleted: number;
  totalWords: number;
  mistakesCount: number;
  isCompleted: boolean;
  progressStatus: "idle" | "saving" | "saved" | "error" | "sign-in";
  onPlayAgain: () => void;
  onExit: () => void;
};

export default function GameCompletionModal({
  accuracy,
  wordsCompleted,
  totalWords,
  mistakesCount,
  isCompleted,
  progressStatus,
  onPlayAgain,
  onExit,
}: Props) {
  const { t } = useLanguage();

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="game-completion-title"
        className="w-full max-w-md space-y-5 rounded-xl border bg-card p-6 shadow-xl"
      >
        <div>
          <h2 id="game-completion-title" className="text-2xl font-semibold">
            {t("game.completed")}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {isCompleted ? t("game.completionQualified") : t("game.completionNotQualified")}
          </p>
        </div>
        <dl className="grid grid-cols-3 gap-3 text-center">
          <div className="rounded-lg border p-3">
            <dt className="text-xs text-muted-foreground">{t("game.accuracy")}</dt>
            <dd className="mt-1 text-xl font-semibold tabular-nums">{accuracy}%</dd>
          </div>
          <div className="rounded-lg border p-3">
            <dt className="text-xs text-muted-foreground">{t("game.wordsFilled")}</dt>
            <dd className="mt-1 text-xl font-semibold tabular-nums">{wordsCompleted}/{totalWords}</dd>
          </div>
          <div className="rounded-lg border p-3">
            <dt className="text-xs text-muted-foreground">{t("game.mistakes")}</dt>
            <dd className="mt-1 text-xl font-semibold tabular-nums">{mistakesCount}</dd>
          </div>
        </dl>
        {progressStatus === "saving" && (
          <p role="status" className="text-sm text-muted-foreground">{t("game.progressSaving")}</p>
        )}
        {progressStatus === "saved" && (
          <p role="status" className="text-sm text-muted-foreground">{t("game.progressSaved")}</p>
        )}
        {progressStatus === "error" && (
          <p role="alert" className="text-sm text-destructive">{t("game.progressSaveError")}</p>
        )}
        {progressStatus === "sign-in" && (
          <p role="status" className="text-sm text-muted-foreground">{t("game.progressSignInRequired")}</p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={onPlayAgain}>{t("game.playAgain")}</Button>
          <Button type="button" variant="outline" onClick={onExit}>{t("game.quit")}</Button>
        </div>
      </section>
    </div>
  );
}
