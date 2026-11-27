"use client";

import { useEffect, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuthState } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";

export default function CollectionCompletionButton({ collectionId }: { collectionId: string }) {
  const { userId, loading: authLoading } = useAuthState();
  const { t } = useLanguage();
  const [completed, setCompleted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (authLoading || !userId) return;
    let active = true;
    void fetch(`/api/word-collections/completion?collectionId=${encodeURIComponent(collectionId)}`, { cache: "no-store" })
      .then(async (response) => {
        const result = await response.json().catch(() => null) as { completed?: unknown } | null;
        if (!response.ok || typeof result?.completed !== "boolean") throw new Error("COMPLETION_LOOKUP_FAILED");
        if (active) setCompleted(result.completed);
      })
      .catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [authLoading, collectionId, userId]);

  async function toggle() {
    if (busy || authLoading || !userId) return;
    setBusy(true);
    setError(false);
    try {
      const nextCompleted = !completed;
      const response = await fetch("/api/word-collections/completion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ collectionId, completed: nextCompleted }),
      });
      const result = await response.json().catch(() => null) as { completed?: unknown } | null;
      if (!response.ok || typeof result?.completed !== "boolean") throw new Error("COMPLETION_SAVE_FAILED");
      setCompleted(result.completed);
      window.dispatchEvent(new CustomEvent("collection-completion-changed", { detail: { collectionId } }));
    } catch (reason) {
      console.error("[collection-completion] Could not update collection status.", {
        errorType: reason instanceof Error ? reason.name : "UnknownError",
      });
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex flex-col items-start">
      <Button
        type="button"
        size="sm"
        variant={completed ? "default" : "outline"}
        disabled={busy || authLoading || !userId}
        aria-pressed={completed}
        title={completed ? t("collections.completedStatus") : t("collections.markCompleted")}
        onClick={() => void toggle()}
        className={`gap-2 ${completed ? "bg-emerald-600 text-white hover:bg-emerald-700" : ""}`}
      >
        {busy ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Check className="size-4" aria-hidden="true" />}
        {completed ? t("collections.completedStatus") : t("collections.markCompleted")}
      </Button>
      {error && <span role="alert" className="text-xs text-destructive">{t("collections.completionUpdateError")}</span>}
    </span>
  );
}
