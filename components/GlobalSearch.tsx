"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Loader2, Search } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import SaveLineToCollectionButton from "@/components/SaveLineToCollectionButton";

type SongResult = {
  id: string;
  youtubeId: string;
  title: string;
  artist: string | null;
  thumbnailUrl: string | null;
};

type LineResult = SongResult & {
  lineText: string;
  context: string;
  lineIndex: number;
  startTime: number;
  endTime: number;
};

type SearchResults = { songs: SongResult[]; lines: LineResult[] };

function isSearchResults(value: unknown): value is SearchResults {
  if (typeof value !== "object" || value === null) return false;
  const result = value as Record<string, unknown>;
  const isSong = (item: unknown): item is SongResult =>
    typeof item === "object" && item !== null &&
    "id" in item && typeof item.id === "string" &&
    "youtubeId" in item && typeof item.youtubeId === "string" &&
    "title" in item && typeof item.title === "string" &&
    "artist" in item && (typeof item.artist === "string" || item.artist === null) &&
    "thumbnailUrl" in item && (typeof item.thumbnailUrl === "string" || item.thumbnailUrl === null);
  const isLine = (item: unknown): item is LineResult =>
    isSong(item) &&
    "lineText" in item && typeof item.lineText === "string" &&
    "context" in item && typeof item.context === "string" &&
    "lineIndex" in item && typeof item.lineIndex === "number" &&
    "startTime" in item && typeof item.startTime === "number" &&
    "endTime" in item && typeof item.endTime === "number";
  return Array.isArray(result.songs) && result.songs.every(isSong) &&
    Array.isArray(result.lines) && result.lines.every(isLine);
}

export default function GlobalSearch() {
  const { sourceLanguage, t } = useLanguage();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResults>({ songs: [], lines: [] });
  const [resultsKey, setResultsKey] = useState("");
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const trimmedQuery = query.trim();
    if (trimmedQuery.length < 2) return;

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => {
      setLoading(true);
      setError(false);
      void fetch(`/api/global-search?q=${encodeURIComponent(trimmedQuery)}&language=${sourceLanguage}`, {
        signal: controller.signal,
      })
        .then(async (response) => {
          const payload: unknown = await response.json().catch(() => null);
          if (!response.ok || !isSearchResults(payload)) throw new Error("SEARCH_FAILED");
          if (controller.signal.aborted) return;
          setResults(payload);
          setResultsKey(`${sourceLanguage}:${trimmedQuery}`);
        })
        .catch((cause: unknown) => {
          if (cause instanceof Error && cause.name === "AbortError") return;
          setResults({ songs: [], lines: [] });
          setResultsKey(`${sourceLanguage}:${trimmedQuery}`);
          setError(true);
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 300);

    return () => {
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [query, sourceLanguage]);

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  const resultIsCurrent = resultsKey === `${sourceLanguage}:${query.trim()}`;
  const visibleResults = resultIsCurrent ? results : { songs: [], lines: [] };
  const hasResults = visibleResults.songs.length > 0 || visibleResults.lines.length > 0;
  const pending = loading || (query.trim().length >= 2 && !resultIsCurrent);
  const studyHref = (result: SongResult) =>
    `/song/${encodeURIComponent(result.youtubeId)}?${new URLSearchParams({
      title: result.title,
      artist: result.artist ?? "",
    }).toString()}`;

  return (
    <div ref={containerRef} className="relative w-full max-w-md">
      <label className="flex h-9 items-center gap-2 rounded-md border bg-background px-3">
        <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="sr-only">{t("globalSearch.placeholder")}</span>
        <input
          type="search"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setResults({ songs: [], lines: [] });
            setResultsKey("");
            setLoading(false);
            setError(false);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder={t("globalSearch.placeholder")}
          className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
        {loading && <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label={t("globalSearch.loading")} />}
      </label>

      {open && query.trim().length >= 2 && (
        <div
          id="global-search-results"
          role="region"
          aria-label={t("globalSearch.results")}
          className="absolute left-0 right-0 top-full z-[60] mt-2 max-h-[min(70vh,32rem)] overflow-y-auto rounded-lg border bg-popover text-popover-foreground shadow-xl"
        >
          {pending && !hasResults && <p className="p-4 text-sm text-muted-foreground">{t("globalSearch.loading")}</p>}
          {resultIsCurrent && error && <p role="alert" className="p-4 text-sm text-destructive">{t("globalSearch.error")}</p>}
          {!pending && resultIsCurrent && !error && !hasResults && <p className="p-4 text-sm text-muted-foreground">{t("globalSearch.empty")}</p>}

          {visibleResults.songs.length > 0 && (
            <section aria-labelledby="global-search-songs">
              <h2 id="global-search-songs" className="sticky top-0 border-b bg-muted/95 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {t("globalSearch.songs")}
              </h2>
              {visibleResults.songs.map((song) => (
                <Link
                  key={song.id}
                  href={studyHref(song)}
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-3 border-b px-3 py-3 last:border-0 hover:bg-accent"
                >
                  {song.thumbnailUrl && (
                    <Image src={song.thumbnailUrl} alt="" width={64} height={36} unoptimized className="h-9 w-16 shrink-0 rounded object-cover" />
                  )}
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{song.title}</span>
                    {song.artist && <span className="block truncate text-xs text-muted-foreground">{song.artist}</span>}
                  </span>
                </Link>
              ))}
            </section>
          )}

          {visibleResults.lines.length > 0 && (
            <section aria-labelledby="global-search-lines">
              <h2 id="global-search-lines" className="sticky top-0 border-b bg-muted/95 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {t("globalSearch.lines")}
              </h2>
              {visibleResults.lines.map((line) => (
                <article key={`${line.id}:${line.lineIndex}`} className="border-b p-3 last:border-0">
                  <p className="text-sm font-medium">{line.lineText}</p>
                  {line.context && line.context !== line.lineText && (
                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{line.context}</p>
                  )}
                  <div className="mt-2 flex items-center justify-between gap-3">
                    <span className="min-w-0 truncate text-xs text-muted-foreground">
                      {[line.title, line.artist].filter(Boolean).join(" · ")}
                    </span>
                    <div className="flex shrink-0 items-center gap-3">
                      <Link
                        href={`${studyHref(line)}&t=${Math.floor(line.startTime)}`}
                        onClick={() => setOpen(false)}
                        className="text-xs font-medium text-primary underline-offset-4 hover:underline"
                      >
                        {t("globalSearch.study")}
                      </Link>
                      <SaveLineToCollectionButton
                        songId={line.id}
                        lineText={line.lineText}
                        startTime={line.startTime}
                        endTime={line.endTime}
                      />
                    </div>
                  </div>
                </article>
              ))}
            </section>
          )}
        </div>
      )}
    </div>
  );
}
