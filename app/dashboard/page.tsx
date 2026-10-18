"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useAuthState } from "@/context/AuthContext";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { useLanguage } from "@/context/LanguageContext";
import { PAGE_TEXT } from "@/lib/i18n/pages";
import type { LyricLine } from "@/lib/types";
import { extractVideoId, stripYoutubeUrlExtras } from "@/lib/youtube";
import YouTubePlayer, { type PlayerHandle } from "@/components/YouTubePlayer";
import { Combine, RefreshCw } from "lucide-react";

type SongTranscript = { lines_json: LyricLine[] };
type Song = { id: string; youtube_id: string; title: string; is_public: boolean; transcripts?: SongTranscript | SongTranscript[] | null };
export default function DashboardPage() {
  const { userId, loading } = useAuthState();
  const { sourceLanguage, uiLanguage, t } = useLanguage();
  const text = PAGE_TEXT[uiLanguage];
  const [songs, setSongs] = useState<Song[]>([]);
  const [url, setUrl] = useState("");
  const [lines, setLines] = useState<LyricLine[]>([]);
  const [title, setTitle] = useState("");
  const [isPublic, setIsPublic] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const previewVideoId = extractVideoId(url);

  async function refresh() {
    const db = getSupabaseBrowserClient();
    if (!db || !userId) return;
    const { data } = await db.from("songs").select("id,youtube_id,title,is_public,transcripts(lines_json)").eq("created_by", userId).order("created_at", { ascending: false });
    setSongs((data ?? []).map((song) => {
      const transcript = Array.isArray(song.transcripts) ? song.transcripts[0] : song.transcripts;
      return {
        ...song,
        transcripts: transcript ? { lines_json: transcript.lines_json as unknown as LyricLine[] } : null,
      };
    }));
  }
  useEffect(() => { void refresh(); }, [userId]);

  async function fetchPreview() {
    setBusy(true); setMessage("");
    try {
      const videoId = extractVideoId(url);
      if (!videoId) throw new Error(text.invalidYoutube);
      const [tr, meta] = await Promise.all([
        fetch(`/api/transcript?videoId=${videoId}&lang=${sourceLanguage}`),
        fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`),
      ]);
      const lyricData = await tr.json();
      if (!tr.ok) throw new Error(text.subtitlesUnavailable);
      const metadata = meta.ok ? await meta.json() : {};
      setLines(lyricData); setTitle(metadata.title || "");
      setMessage(text.subtitlesReady);
    } catch (error) { setMessage(error instanceof Error ? error.message : text.loadError); }
    finally { setBusy(false); }
  }

  async function save() {
    setBusy(true);
    try {
      const response = await fetch("/api/songs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ youtubeUrl: url, title, language: sourceLanguage, lines, isPublic }) });
      const result = await response.json();
      if (!response.ok) throw new Error(typeof result.error === "string" ? result.error : text.songSaveError);
      setMessage(text.songSaved); setLines([]); setUrl(""); await refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : text.songSaveError); }
    finally { setBusy(false); }
  }

  async function saveSong(song: Song, editedLines: LyricLine[]) {
    const response = await fetch("/api/songs", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: song.id, isPublic: song.is_public, lines: editedLines }) });
    await response.json(); setMessage(response.ok ? text.changesSaved : text.songSaveError); if (response.ok) await refresh();
  }

  if (loading) return <main className="mx-auto max-w-5xl p-8">{text.loading}</main>;
  if (!userId) return <main className="mx-auto max-w-5xl p-8"><h1 className="text-2xl font-bold">{text.mySongs}</h1><p className="mt-3">{text.loginPrompt}</p><Link className="mt-3 inline-block text-primary underline" href="/auth">{text.login}</Link></main>;

  return <main className="mx-auto w-full max-w-5xl space-y-10 px-4 py-10">
    <section><h1 className="text-3xl font-bold">{text.mySongs}</h1><div className="mt-5 grid gap-3 rounded-xl border p-5">
      <h2 className="text-xl font-semibold">{text.addYoutube}</h2>
      <input className="rounded border bg-background px-3 py-2" placeholder={text.youtubeUrl} value={url} onChange={event => setUrl(stripYoutubeUrlExtras(event.target.value))}/>
      <div className="flex gap-3"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={isPublic} onChange={event=>setIsPublic(event.target.checked)}/> {text.publicSong}</label></div>
      <div className="flex gap-2"><button disabled={busy||!url} onClick={fetchPreview} className="rounded border px-4 py-2">{text.loadSubtitles}</button>{lines.length>0&&<button disabled={busy} onClick={save} className="rounded bg-primary px-4 py-2 text-primary-foreground">{text.save}</button>}</div>
      {previewVideoId && <TranscriptTimingEditor videoId={previewVideoId} lines={lines} onLinesChange={setLines}/>}
      {lines.length>0&&<input className="rounded border bg-background px-3 py-2" placeholder={text.songTitle} value={title} onChange={event=>setTitle(event.target.value)}/>}
      {message&&<p role="status" className="text-sm text-muted-foreground">{message}</p>}
    </div></section>
    <section><h2 className="mb-4 text-2xl font-semibold">{text.savedSongs}</h2>{songs.length===0?<p className="text-muted-foreground">{text.emptySongs}</p>:<div className="space-y-3">{songs.map(song=><SongEditor key={song.id} song={song} onSave={saveSong} text={text}/>)}</div>}</section>
  </main>;
}

function SongEditor({ song, onSave, text }: { song: Song; onSave: (song: Song, lines: LyricLine[]) => void; text: (typeof PAGE_TEXT)["ru"] }) {
  const [lines,setLines]=useState(song.transcripts?.lines_json??[]); const [isPublic,setIsPublic]=useState(song.is_public); const [open,setOpen]=useState(false);
  useEffect(() => { setLines(song.transcripts?.lines_json ?? []); }, [song.id, song.transcripts]);
  return <details className="rounded-lg border p-4" onToggle={event=>setOpen(event.currentTarget.open)}><summary className="cursor-pointer font-medium">{song.title} <span className="text-sm text-muted-foreground">({isPublic?text.public:text.private})</span></summary><div className="mt-3 space-y-2"><Link className="text-primary underline" href={`/song/${song.youtube_id}`}>{text.openTrainer}</Link><label className="ml-4 text-sm"><input type="checkbox" checked={isPublic} onChange={event=>setIsPublic(event.target.checked)}/> {text.publicSong}</label>{open&&<TranscriptTimingEditor videoId={song.youtube_id} lines={lines} onLinesChange={setLines}/>}<button className="rounded bg-primary px-3 py-2 text-primary-foreground" onClick={()=>onSave({...song,is_public:isPublic},lines)}>{text.saveChanges}</button></div></details>;
}

function TranscriptTimingEditor({ videoId, lines, onLinesChange }: { videoId: string; lines: LyricLine[]; onLinesChange: (lines: LyricLine[]) => void }) {
  const playerRef = useRef<PlayerHandle>(null);
  const isPlayingRef = useRef(false);
  const previousTimeRef = useRef(0);
  const latestTimeRef = useRef(0);
  const autoPausedLineRef = useRef<number | null>(null);
  const { t } = useLanguage();
  const [currentTime, setCurrentTime] = useState(0);
  const handleTimeUpdate = useCallback((seconds: number) => {
    const previousTime = previousTimeRef.current;
    latestTimeRef.current = seconds;
    previousTimeRef.current = seconds;
    setCurrentTime(seconds);
    if (!isPlayingRef.current) return;

    const endedLineIndex = lines.findIndex((line) => {
      const end = line.start + line.duration;
      return previousTime < end && seconds >= end && seconds - previousTime <= 1;
    });
    if (endedLineIndex >= 0 && autoPausedLineRef.current !== endedLineIndex) {
      autoPausedLineRef.current = endedLineIndex;
      playerRef.current?.pause();
    }
  }, [lines]);
  const handlePlaybackChange = useCallback((playing: boolean) => {
    isPlayingRef.current = playing;
    if (playing) {
      previousTimeRef.current = latestTimeRef.current;
      autoPausedLineRef.current = null;
    }
  }, []);

  return <div className="grid gap-4 md:grid-cols-2">
    <section className="space-y-2"><h3 className="font-medium">{t("dashboard.player")}</h3><YouTubePlayer ref={playerRef} videoId={videoId} onTimeUpdate={handleTimeUpdate} onPlayingChange={handlePlaybackChange}/><p className="text-sm text-muted-foreground">{t("dashboard.reviewTiming")}</p><p className="text-xs tabular-nums text-muted-foreground">{formatTimestamp(currentTime)}</p></section>
    <section className="space-y-2"><div className="grid grid-cols-[5.5rem_1fr_5rem] items-center gap-2"><span/><span/><div className="flex items-center justify-center gap-1"><button type="button" disabled={lines.length < 2} className="flex items-center justify-center rounded border p-1.5 hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50" aria-label={t("dashboard.mergeShortLines")} title={t("dashboard.mergeShortLines")} onClick={()=>onLinesChange(mergeShortLines(lines))}><Combine aria-hidden="true" size={16}/></button><button type="button" disabled={lines.length < 2} className="flex items-center justify-center rounded border p-1.5 hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50" aria-label={t("dashboard.recalculateDurations")} title={t("dashboard.recalculateDurations")} onClick={()=>onLinesChange(lines.map((line,index)=>index < lines.length - 1 ? {...line,duration:Math.max(0,Number((lines[index+1].start-line.start).toFixed(2)))} : line))}><RefreshCw aria-hidden="true" size={16}/></button></div></div>{lines.length ? <div className="max-h-[26rem] space-y-2 overflow-auto">{lines.map((line,index)=><div key={index} className="grid grid-cols-[5.5rem_1fr_5rem] gap-2"><div className="flex min-w-0 items-center gap-1"><button type="button" className="rounded border px-1.5 text-xs hover:bg-muted" aria-label={`${t("dashboard.seekToLine")} ${index+1}`} onClick={()=>{autoPausedLineRef.current=null;playerRef.current?.seekTo(line.start);playerRef.current?.play();}}>▶</button><input aria-label={t("dashboard.start")} className="w-full min-w-0 rounded border bg-background px-1.5 text-sm" type="number" min="0" step="0.1" value={line.start} onChange={event=>onLinesChange(lines.map((item,i)=>i===index?{...item,start:Number(event.target.value)}:item))}/></div><input aria-label={`${t("dashboard.lyrics")} ${index+1}`} className="min-w-0 rounded border bg-background px-2" value={line.text} onChange={event=>onLinesChange(lines.map((item,i)=>i===index?{...item,text:event.target.value}:item))}/><input aria-label={t("dashboard.duration")} className="rounded border bg-background px-2" type="number" min="0" step="0.1" value={line.duration} onChange={event=>onLinesChange(lines.map((item,i)=>i===index?{...item,duration:Number(event.target.value)}:item))}/></div>)}</div> : <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">{t("dashboard.loadTranscriptHint")}</p>}</section>
  </div>;
}

function formatTimestamp(seconds: number) {
  const safeSeconds = Number.isFinite(seconds) ? Math.max(seconds, 0) : 0;
  const minutes = Math.floor(safeSeconds / 60);
  const remainder = (safeSeconds % 60).toFixed(1).padStart(4, "0");
  return `${minutes}:${remainder}`;
}

function mergeShortLines(lines: LyricLine[]): LyricLine[] {
  const mergedLines: LyricLine[] = [];
  let index = 0;

  while (index < lines.length) {
    let current = { ...lines[index] };
    let mergedCount = 0;

    while (countWords(current.text) < 3 && index + mergedCount + 1 < lines.length) {
      const next = lines[index + mergedCount + 1];
      if (countWords(next.text) >= 8) break;

      const mergedEnd = Math.max(
        current.start + current.duration,
        next.start + next.duration,
      );
      current = {
        ...current,
        text: `${current.text.trim()} ${next.text.trim()}`.trim(),
        duration: Number(Math.max(0, mergedEnd - current.start).toFixed(2)),
      };
      mergedCount += 1;
    }

    mergedLines.push(current);
    index += mergedCount + 1;
  }

  return mergedLines;
}

function countWords(text: string) {
  return text.trim().split(/\s+/u).filter(Boolean).length;
}
