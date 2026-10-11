// components/VideoUrlForm.tsx
"use client";

import { useState } from "react";
import { Link2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/context/LanguageContext";
import { extractVideoId } from "@/lib/youtube";

type Props = {
  /** Called with a valid videoId when the user submits the form. */
  onSubmit: (videoId: string) => void;
  /** Disables the submit button and shows a spinner while true. */
  isLoading?: boolean;
  /** Optional error returned by the parent component. */
  error?: string | null;
};

export default function VideoUrlForm({ onSubmit, isLoading = false, error = null }: Props) {
  const { t } = useLanguage();
  const [value, setValue] = useState("");
  const [invalid, setInvalid] = useState(false);

  // Detect the videoId during render; no separate state is needed.
  const detectedId = value.trim() ? extractVideoId(value) : null;

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); // Keep the form submission on the current page.

    const id = extractVideoId(value);
    if (!id) {
      setInvalid(true);
      return;
    }

    setInvalid(false);
    onSubmit(id);
  }

  const shownError = invalid ? t("form.invalid") : error;

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Link2
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <input
            type="text"
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setInvalid(false); // Clear the previous error as the user edits.
            }}
            placeholder={t("form.placeholder")}
            aria-label={t("form.placeholder")}
            aria-invalid={shownError ? true : undefined}
            className="h-10 w-full rounded-md border bg-background pl-9 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>

        <Button type="submit" disabled={isLoading || value.trim() === ""}>
          {isLoading && <Loader2 className="size-4 animate-spin" />}
          {t("form.load")}
        </Button>
      </div>

      {shownError ? (
        <p role="alert" className="text-sm text-destructive">
          {shownError}
        </p>
      ) : detectedId ? (
        <p className="text-sm text-muted-foreground">{t("form.detected", { id: detectedId })}</p>
      ) : null}
    </form>
  );
}
