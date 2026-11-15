export type TranslationRequest = {
  text: string;
  sourceLang: string;
  targetLang: string;
  videoId?: string;
  lineIndex?: number;
};

export async function requestTranslation(input: TranslationRequest): Promise<string> {
  const response = await fetch("/api/translate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const result: unknown = await response.json().catch(() => null);
  const payload = typeof result === "object" && result !== null
    ? result as { translation?: unknown; error?: unknown }
    : null;
  if (!response.ok) {
    throw new Error(typeof payload?.error === "string" ? payload.error : "translation_unavailable");
  }
  if (typeof payload?.translation !== "string" || !payload.translation.trim()) {
    throw new Error("translation_unavailable");
  }
  return payload.translation;
}
