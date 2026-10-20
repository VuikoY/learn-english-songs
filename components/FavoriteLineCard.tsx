"use client";

import { useEffect, useRef, useState } from "react";
import YouTube, { type YouTubeProps } from "react-youtube";
import Link from "next/link";
import Image from "next/image";
import { BookOpen, Loader2, Play, Sparkles, X } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import ExplanationCard from "@/components/ExplanationCard";
import { ExplanationSkeleton } from "@/components/ExplanationCard";
import type { Explanation } from "@/lib/types";

type Player = { getPlayerState: () => number; getCurrentTime: () => number; pauseVideo: () => void; seekTo: (seconds: number, allowSeekAhead: boolean) => void; playVideo: () => void };
type Props = { line: { id: string; line_index: number; line_text: string; start_time: number; end_time: number; songs: { youtube_id: string; title: string; thumbnail_url: string | null } } };

export default function FavoriteLineCard({ line }: Props) {
  const { t, sourceLanguage, targetLanguage } = useLanguage();
  const player = useRef<Player | null>(null);
  const [playing, setPlaying] = useState(false);
  const [explainOpen, setExplainOpen] = useState(false);
  const [explanation, setExplanation] = useState<Explanation | null>(null);
  const [explainError, setExplainError] = useState("");
  const [explainLoading, setExplainLoading] = useState(false);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (playing && player.current?.getPlayerState() === 1 && player.current.getCurrentTime() >= Number(line.end_time)) {
        player.current.pauseVideo();
        player.current.seekTo(Number(line.start_time), true);
        setPlaying(false);
      }
    }, 100);
    return () => window.clearInterval(timer);
  }, [line.end_time, line.start_time, playing]);

  async function explainLine() {
    setExplainOpen(true);
    setExplainError("");
    if (explanation) return;
    setExplainLoading(true);
    try {
      const response = await fetch("/api/explain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: line.line_text, youtubeId: line.songs.youtube_id, lineIndex: line.line_index, sourceLanguage, targetLanguage }),
      });
      const result: unknown = await response.json();
      if (!response.ok || !result || typeof result !== "object" || !("translation" in result) || !("grammar" in result) || !("slang" in result)) throw new Error(t("explain.requestError"));
      setExplanation(result as Explanation);
    } catch (error) { setExplainError(error instanceof Error ? error.message : t("explain.unknownError")); }
    finally { setExplainLoading(false); }
  }

  const opts: YouTubeProps["opts"] = { width: "100%", height: "100%", playerVars: { autoplay: 1, controls: 0, disablekb: 1, start: Math.floor(Number(line.start_time)), end: Math.ceil(Number(line.end_time)), rel: 0 } };
  return <>
    <div className="mx-auto w-full max-w-sm min-w-0 overflow-hidden">
    <article className="grid w-full min-w-0 grid-cols-1 gap-3 rounded-xl border p-3">
      <div className="relative aspect-video w-full overflow-hidden rounded-lg">
        {playing ? <YouTube className="absolute inset-0 h-full w-full overflow-hidden" iframeClassName="!absolute !inset-0 !block !h-full !w-full" videoId={line.songs.youtube_id} opts={opts} onReady={event => { player.current = event.target as unknown as Player; player.current.seekTo(Number(line.start_time), true); player.current.playVideo(); }} /> : <button type="button" aria-label={t("favorites.playSnippet")} className="absolute inset-0 h-full w-full" onClick={() => setPlaying(true)}><Image src={line.songs.thumbnail_url ?? `https://i.ytimg.com/vi/${line.songs.youtube_id}/hqdefault.jpg`} alt="" width={640} height={360} unoptimized className="h-full w-full object-cover"/><span className="absolute inset-0 grid place-items-center bg-black/25 text-white"><Play className="size-10 fill-current"/></span></button>}
      </div>
      <div className="min-w-0"><blockquote className="break-words whitespace-pre-wrap text-sm font-semibold leading-relaxed md:text-base">{line.line_text}</blockquote><p className="mt-1.5 break-words text-xs text-muted-foreground">{line.songs.title}</p></div>
      <div className="grid grid-cols-3 gap-1.5">
        <button type="button" className="inline-flex min-h-11 min-w-0 items-center justify-center gap-1 rounded-md bg-primary px-2 py-2 text-center text-xs leading-tight text-primary-foreground sm:text-sm" onClick={() => { if (playing) { player.current?.pauseVideo(); setPlaying(false); } else setPlaying(true); }}><Play className="size-4 shrink-0"/>{t(playing ? "favorites.stopSnippet" : "favorites.playSnippet")}</button>
        <button type="button" className="inline-flex min-h-11 min-w-0 items-center justify-center gap-1 rounded-md border px-2 py-2 text-center text-xs leading-tight hover:bg-muted sm:text-sm" onClick={() => void explainLine()}><Sparkles className="size-4 shrink-0"/>{t("explain.button")}</button>
        <Link href={`/song/${line.songs.youtube_id}`} className="inline-flex min-h-11 min-w-0 items-center justify-center gap-1 rounded-md px-2 py-2 text-center text-xs leading-tight text-muted-foreground hover:bg-muted sm:text-sm"><BookOpen className="size-4 shrink-0"/>{t("favorites.fullVideo")}</Link>
      </div>
    </article>
    </div>
    {explainOpen && <div role="dialog" aria-modal="true" aria-label={t("explain.button")} className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4" onClick={() => setExplainOpen(false)}><section className="max-h-[85vh] w-full max-w-xl overflow-y-auto rounded-xl border bg-background p-5" onClick={event => event.stopPropagation()}><div className="mb-4 flex justify-end"><button type="button" aria-label={t("favorites.close")} onClick={() => setExplainOpen(false)}><X className="size-5"/></button></div><blockquote className="mb-4 text-lg font-medium">{line.line_text}</blockquote>{explainLoading ? <ExplanationSkeleton/> : explainError ? <p role="alert" className="text-sm text-destructive">{explainError}</p> : explanation ? <ExplanationCard data={explanation}/> : <Loader2 className="size-5 animate-spin"/>}</section></div>}
  </>;
}
