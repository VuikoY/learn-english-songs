export type LearningActivitySource = "media" | "collection" | "phrase-mix";

type LearningActivity = {
  sessionId: string;
  source: LearningActivitySource;
  wordsCovered: number;
};

export async function saveLearningActivity(activity: LearningActivity): Promise<void> {
  const response = await fetch("/api/learning-activity", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(activity),
  });
  if (!response.ok) {
    const result = await response.json().catch(() => null) as { error?: string } | null;
    throw new Error(result?.error ?? "ACTIVITY_SAVE_FAILED");
  }
}

export function queueLearningActivitySave(activity: LearningActivity): void {
  if (activity.wordsCovered < 1) return;

  const body = new Blob([JSON.stringify(activity)], { type: "application/json" });
  if (navigator.sendBeacon("/api/learning-activity", body)) return;

  void fetch("/api/learning-activity", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(activity),
    keepalive: true,
  }).then((response) => {
    if (!response.ok) console.error("[learning-activity] Could not save activity before page exit.", response.status);
  }).catch((error: unknown) => {
    console.error("[learning-activity] Could not save activity before page exit.", error);
  });
}
