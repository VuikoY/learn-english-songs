"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { ExternalLink } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { useLanguage } from "@/context/LanguageContext";

type SearchVideo = {
  videoId: string;
  title: string;
  channelTitle: string;
  thumbnailUrl: string | null;
  transcriptAvailable: boolean | null;
};

type SearchResponse = { videos: SearchVideo[] } | { code: string };

function isSearchVideo(value: unknown): value is SearchVideo {
  if (typeof value !== "object" || value === null) return false;
  const video = value as Record<string, unknown>;
  return typeof video.videoId === "string" &&
    typeof video.title === "string" &&
    typeof video.channelTitle === "string" &&
    (video.thumbnailUrl === null || typeof video.thumbnailUrl === "string") &&
    (video.transcriptAvailable === true ||
      video.transcriptAvailable === false ||
      video.transcriptAvailable === null);
}

function isSearchResponse(value: unknown): value is SearchResponse {
  if (typeof value !== "object" || value === null) return false;
  const payload = value as Record<string, unknown>;
  if (typeof payload.code === "string") return true;
  return Array.isArray(payload.videos) && payload.videos.every(isSearchVideo);
}

export default function SongSearch() {
  const { sourceLanguage, t } = useLanguage();
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [videos, setVideos] = useState<SearchVideo[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [searchLanguage, setSearchLanguage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const requestController = useRef<AbortController | null>(null);
  const searchMatchesLanguage = searchLanguage === sourceLanguage;

  useEffect(() => {
    return () => requestController.current?.abort();
  }, [sourceLanguage]);

  async function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!title.trim()) {
      setError(t("search.error.invalid"));
      setSearchLanguage(sourceLanguage);
      return;
    }
    setError(null);
    setVideos([]);
    setHasSearched(false);
    setLoading(true);
    setSearchLanguage(sourceLanguage);
    const controller = new AbortController();
    requestController.current = controller;

    try {
      const response = await fetch("/api/youtube-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          artist: artist.trim(),
          language: sourceLanguage,
        }),
        signal: controller.signal,
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!isSearchResponse(payload)) throw new Error(t("search.error.failed"));
      if (!response.ok) {
        const code = "code" in payload ? payload.code : "";
        const errorKey = code === "CONFIGURATION_ERROR"
          ? "search.error.configuration"
          : code === "QUOTA_EXCEEDED"
            ? "search.error.quota"
            : code === "SEARCH_TIMEOUT"
              ? "search.error.timeout"
              : code === "INVALID_INPUT"
                ? "search.error.invalid"
                : "search.error.failed";
        throw new Error(t(errorKey));
      }
      if ("code" in payload) throw new Error(t("search.error.failed"));
      setVideos(payload.videos.filter((video) => video.transcriptAvailable !== null));
      setHasSearched(true);
    } catch (searchError) {
      if (searchError instanceof Error && searchError.name === "AbortError") return;
      setError(searchError instanceof Error ? searchError.message : t("search.error.failed"));
    } finally {
      if (requestController.current === controller) {
        requestController.current = null;
        setLoading(false);
      }
    }
  }

  return (
    <section aria-labelledby="song-search-heading">
      <div className="mb-4">
        <h2 id="song-search-heading" className="text-2xl font-semibold">{t("search.title")}</h2>
        <p className="mt-2 text-muted-foreground">{t("search.subtitle")}</p>
      </div>

      <form onSubmit={handleSearch} className="grid gap-4 rounded-xl border bg-card p-5 sm:grid-cols-2">
        <label className="grid gap-1.5 text-sm">
          <span>{t("search.songTitle")}</span>
          <input
            required
            maxLength={100}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder={t("search.songPlaceholder")}
            className="h-10 rounded-md border bg-background px-3"
          />
        </label>
        <label className="grid gap-1.5 text-sm">
          <span>{t("search.artist")}</span>
          <input
            maxLength={100}
            value={artist}
            onChange={(event) => setArtist(event.target.value)}
            placeholder={t("search.artistPlaceholder")}
            className="h-10 rounded-md border bg-background px-3"
          />
        </label>
        <button type="submit" disabled={loading} className={`${buttonVariants({ size: "default" })} sm:col-span-2 sm:justify-self-start`}>
          {loading ? t("search.loading") : t("search.submit")}
        </button>
      </form>

      {error && searchMatchesLanguage && <p role="alert" className="mt-4 text-sm text-destructive">{error}</p>}
      {(!searchMatchesLanguage || (!hasSearched && !loading && !error)) && <p className="mt-6 text-sm text-muted-foreground">{t("search.initial")}</p>}
      {hasSearched && searchMatchesLanguage && videos.length === 0 && <p className="mt-6 rounded-xl border border-dashed p-8 text-center text-muted-foreground">{t("search.noResults")}</p>}

      {searchMatchesLanguage && videos.length > 0 && (
        <div aria-label={t("search.results")} className="mt-8 grid gap-4">
          {videos.map((video) => (
            <article key={video.videoId} className="flex flex-col gap-4 rounded-xl border bg-card p-4 sm:flex-row">
              <div className="relative aspect-video w-full shrink-0 overflow-hidden rounded-lg bg-muted sm:w-52">
                {video.thumbnailUrl && (
                  <Image src={video.thumbnailUrl} alt="" fill unoptimized sizes="(max-width: 640px) 100vw, 208px" className="object-cover" />
                )}
              </div>
              <div className="flex min-w-0 flex-1 flex-col items-start">
                <h3 className="font-semibold">{video.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{video.channelTitle}</p>
                <p className={`mt-3 text-sm ${video.transcriptAvailable === true ? "text-green-700 dark:text-green-400" : "text-muted-foreground"}`}>
                  {video.transcriptAvailable === true
                    ? t("search.transcriptAvailable")
                    : video.transcriptAvailable === false
                      ? t("search.transcriptUnavailable")
                      : t("search.transcriptUnknown")}
                </p>
                <div className="mt-auto flex flex-wrap gap-3 pt-4">
                  <Link href={`/song/${video.videoId}`} className={buttonVariants({ size: "sm" })}>{t("search.study")}</Link>
                  <a
                    href={`https://www.youtube.com/watch?v=${video.videoId}`}
                    target="_blank"
                    rel="noreferrer"
                    className={buttonVariants({ variant: "outline", size: "sm", className: "gap-1.5" })}
                  >
                    {t("search.watch")} <ExternalLink className="size-3.5" aria-hidden="true" />
                  </a>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
