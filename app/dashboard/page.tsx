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
import { Combine, Loader2, RefreshCw } from "lucide-react";
import { SONG_DIFFICULTIES, SONG_GENRES, songMetadataLabels, type SongDifficulty, type SongGenre } from "@/lib/songMetadata";

type SongTranscript = { lines_json: LyricLine[] };
type Song = { id: string; youtube_id: string; title: string; is_public: boolean; genre: SongGenre; difficulty: SongDifficulty; transcripts?: SongTranscript | SongTranscript[] | null };
export default function DashboardPage() {
  const { userId, loading } = useAuthState();
  const { sourceLanguage, uiLanguage, t } = useLanguage();
  const text = PAGE_TEXT[uiLanguage];
  const metadataLabels = songMetadataLabels(uiLanguage);
  const [songs, setSongs] = useState<Song[]>([]);
  const [url, setUrl] = useState("");
  const [lines, setLines] = useState<LyricLine[]>([]);
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [genre, setGenre] = useState<SongGenre>("other");
  const [difficulty, setDifficulty] = useState<SongDifficulty>("intermediate");
  const [isPublic, setIsPublic] = useState(true);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const previewVideoId = extractVideoId(url);

  async function refresh() {
    const db = getSupabaseBrowserClient();
    if (!db || !userId) return;
    type DashboardSongRow = { id: string; youtube_id: string; title: string; is_public: boolean; genre: string; difficulty: string; transcripts: SongTranscript | SongTranscript[] | null };
    const query = await db.from("songs").select("id,youtube_id,title,is_public,genre,difficulty,transcripts(lines_json)").eq("created_by", userId).order("created_at", { ascending: false });
    let rows: DashboardSongRow[];
    if (query.error) {
      console.error("[dashboard] Could not load song metadata columns; trying legacy schema.", query.error.code);
      const legacy = await db.from("songs").select("id,youtube_id,title,is_public,transcripts(lines_json)").eq("created_by", userId).order("created_at", { ascending: false });
      if (legacy.error) console.error("[dashboard] Legacy song query failed.", legacy.error.code);
      rows = (legacy.data ?? []).map((song) => ({ ...song, genre: "other", difficulty: "intermediate" })) as unknown as DashboardSongRow[];
    } else {
      rows = (query.data ?? []) as unknown as DashboardSongRow[];
    }
    setSongs(rows.map((song) => {
      const transcript = Array.isArray(song.transcripts) ? song.transcripts[0] : song.transcripts;
      return {
        ...song,
        genre: song.genre as SongGenre,
        difficulty: song.difficulty as SongDifficulty,
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
      const songTitle = typeof metadata.title === "string" ? metadata.title : "";
      const songArtist = typeof metadata.author_name === "string" ? metadata.author_name : "";
      const lyricLines = lyricData as LyricLine[];
      setLines(lyricLines); setTitle(songTitle); setArtist(songArtist);
      let analysisFailed = false;
      try {
        const response = await fetch("/api/song-metadata", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: songTitle || videoId, artist: songArtist, language: sourceLanguage, lyrics: lyricLines.map((line) => line.text).join("\n") }) });
        const result = await response.json();
        if (!response.ok) throw new Error("AI metadata unavailable");
        setGenre(result.genre as SongGenre); setDifficulty(result.difficulty as SongDifficulty);
      } catch {
        analysisFailed = true;
        setGenre("other"); setDifficulty("intermediate");
      }
      setMessage(analysisFailed ? `${text.subtitlesReady} ${metadataLabels.analyzeError}` : text.subtitlesReady);
    } catch (error) { setMessage(error instanceof Error ? error.message : text.loadError); }
    finally { setBusy(false); }
  }

  async function save() {
    setBusy(true); setSaving(true);
    try {
      const response = await fetch("/api/songs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ youtubeUrl: url, title, artist, language: sourceLanguage, genre, difficulty, lines, isPublic }) });
      const result = await response.json();
      if (!response.ok) throw new Error(typeof result.error === "string" ? result.error : text.songSaveError);
      setMessage(text.songSaved); setLines([]); setUrl(""); setTitle(""); setArtist(""); await refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : text.songSaveError); }
    finally { setBusy(false); setSaving(false); }
  }

  async function saveSong(song: Song, editedLines: LyricLine[], editedGenre: SongGenre, editedDifficulty: SongDifficulty) {
    const response = await fetch("/api/songs", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: song.id, isPublic: song.is_public, genre: editedGenre, difficulty: editedDifficulty, lines: editedLines }) });
    await response.json(); setMessage(response.ok ? text.changesSaved : text.songSaveError); if (response.ok) await refresh();
  }

  if (loading) return <main className="mx-auto max-w-5xl p-8">{text.loading}</main>;
  if (!userId) return <main className="mx-auto max-w-5xl p-8"><h1 className="text-2xl font-bold">{text.mySongs}</h1><p className="mt-3">{text.loginPrompt}</p><Link className="mt-3 inline-block text-primary underline" href="/auth">{text.login}</Link></main>;

  return <main className="mx-auto w-full max-w-5xl space-y-10 px-4 py-10">
    <section><h1 className="text-3xl font-bold">{text.mySongs}</h1><div className="mt-5 grid gap-3 rounded-xl border p-5">
      <h2 className="text-xl font-semibold">{text.addYoutube}</h2>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center"><input className="min-w-0 flex-1 rounded border bg-background px-3 py-2" placeholder={text.youtubeUrl} value={url} onChange={event => setUrl(stripYoutubeUrlExtras(event.target.value))}/><label className="flex shrink-0 items-center gap-2 text-sm"><input type="checkbox" checked={isPublic} onChange={event=>setIsPublic(event.target.checked)}/> {text.publicSong}</label><button disabled={busy||!url} onClick={fetchPreview} className="shrink-0 rounded border px-4 py-2 disabled:opacity-50">{text.loadSubtitles}</button></div>
      {lines.length > 0 && <><p className="text-sm text-muted-foreground">{metadataLabels.aiHint}</p><div className="grid max-w-xl grid-cols-1 gap-3"><label className="grid gap-1 text-sm"><span>{metadataLabels.genre}</span><select className="block h-10 w-full appearance-none rounded border bg-background px-3" value={genre} onChange={event=>setGenre(event.target.value as SongGenre)}>{SONG_GENRES.map((item)=><option key={item} value={item}>{metadataLabels.genres[item]}</option>)}</select></label><label className="grid gap-1 text-sm"><span>{metadataLabels.difficulty}</span><select className="block h-10 w-full appearance-none rounded border bg-background px-3" value={difficulty} onChange={event=>setDifficulty(event.target.value as SongDifficulty)}>{SONG_DIFFICULTIES.map((item)=><option key={item} value={item}>{metadataLabels.difficulties[item]}</option>)}</select></label></div></>}
      {lines.length>0&&<button disabled={busy} onClick={save} className="inline-flex items-center gap-2 rounded bg-primary px-4 py-2 text-primary-foreground disabled:cursor-not-allowed disabled:opacity-60">{saving&&<Loader2 className="size-4 animate-spin" aria-hidden="true"/>}{saving?t("common.saving"):text.save}</button>}
      {previewVideoId && <TranscriptTimingEditor videoId={previewVideoId} lines={lines} onLinesChange={setLines}/>}
      {lines.length>0&&<><input className="rounded border bg-background px-3 py-2" placeholder={text.songTitle} value={title} onChange={event=>setTitle(event.target.value)}/><input className="rounded border bg-background px-3 py-2" placeholder={metadataLabels.artist} value={artist} onChange={event=>setArtist(event.target.value)}/></>}
      {message&&<p role="status" className="text-sm text-muted-foreground">{message}</p>}
    </div></section>
    <section><h2 className="mb-4 text-2xl font-semibold">{text.savedSongs}</h2>{songs.length===0?<p className="text-muted-foreground">{text.emptySongs}</p>:<div className="space-y-3">{songs.map(song=><SongEditor key={song.id} song={song} onSave={saveSong} text={text} uiLanguage={uiLanguage}/>)}</div>}</section>
  </main>;
}

function SongEditor({ song, onSave, text, uiLanguage }: { song: Song; onSave: (song: Song, lines: LyricLine[], genre: SongGenre, difficulty: SongDifficulty) => Promise<void>; text: (typeof PAGE_TEXT)["ru"]; uiLanguage: keyof typeof PAGE_TEXT }) {
  const { t } = useLanguage();
  const transcript = Array.isArray(song.transcripts) ? song.transcripts[0] : song.transcripts;
  const [lines,setLines]=useState(transcript?.lines_json??[]); const [isPublic,setIsPublic]=useState(song.is_public); const [open,setOpen]=useState(false); const [saving,setSaving]=useState(false);
  const [genre,setGenre]=useState(song.genre); const [difficulty,setDifficulty]=useState(song.difficulty); const labels=songMetadataLabels(uiLanguage);
  useEffect(() => { setLines(transcript?.lines_json ?? []); }, [song.id, transcript]);
  useEffect(() => { setGenre(song.genre); setDifficulty(song.difficulty); }, [song.genre, song.difficulty]);
  async function handleSave() {
    if (saving) return;
    setSaving(true);
    try { await onSave({ ...song, is_public: isPublic }, lines, genre, difficulty); }
    finally { setSaving(false); }
  }
  return <details className="rounded-lg border p-4" onToggle={event=>setOpen(event.currentTarget.open)}><summary className="cursor-pointer font-medium">{song.title} <span className="text-sm text-muted-foreground">({isPublic?text.public:text.private})</span></summary><div className="mt-3 space-y-3"><div className="flex flex-wrap items-center gap-3"><Link className="text-sm text-primary underline" href={`/song/${song.youtube_id}`}>{text.openTrainer}</Link><label className="flex items-center gap-2 whitespace-nowrap text-sm"><input type="checkbox" checked={isPublic} onChange={event=>setIsPublic(event.target.checked)}/> {text.publicSong}</label><label className="flex items-center gap-2 whitespace-nowrap text-sm"><span>{labels.genre}</span><select className="h-9 max-w-52 rounded border bg-background px-2" value={genre} onChange={event=>setGenre(event.target.value as SongGenre)}>{SONG_GENRES.map((item)=><option key={item} value={item}>{labels.genres[item]}</option>)}</select></label><label className="flex items-center gap-2 whitespace-nowrap text-sm"><span>{labels.difficulty}</span><select className="h-9 rounded border bg-background px-2" value={difficulty} onChange={event=>setDifficulty(event.target.value as SongDifficulty)}>{SONG_DIFFICULTIES.map((item)=><option key={item} value={item}>{labels.difficulties[item]}</option>)}</select></label></div>{open&&<TranscriptTimingEditor videoId={song.youtube_id} lines={lines} onLinesChange={setLines}/>}<button disabled={saving} className="inline-flex items-center gap-2 rounded bg-primary px-3 py-2 text-primary-foreground disabled:cursor-not-allowed disabled:opacity-60" onClick={()=>void handleSave()}>{saving&&<Loader2 className="size-4 animate-spin" aria-hidden="true"/>}{saving?t("common.saving"):text.saveChanges}</button></div></details>;
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
