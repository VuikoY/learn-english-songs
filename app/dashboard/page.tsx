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
import { Combine, Loader2, Plus, RefreshCw, Sparkles, Split, Trash2 } from "lucide-react";
import { SONG_DIFFICULTIES, SONG_GENRES, songMetadataLabels, type SongDifficulty, type SongGenre } from "@/lib/songMetadata";
import ExplanationCard, { ExplanationSkeleton, StreamingExplanation } from "@/components/ExplanationCard";
import type { Explanation } from "@/lib/types";
import { CONTENT_TYPES, type ContentType } from "@/components/SongCatalog";
import { useStreamingExplanation } from "@/hooks/useStreamingExplanation";
import SongSearch from "@/components/SongSearch";
import { alignPlainLyrics } from "@/lib/lrclib";
import { AUDIO_END_BUFFER_SECONDS, AUDIO_START_BUFFER_SECONDS } from "@/lib/lyricTiming";

type SongTranscript = { lines_json: LyricLine[] };
type Song = { id: string; youtube_id: string; title: string; artist: string | null; is_public: boolean; genre: SongGenre; difficulty: SongDifficulty; content_type: ContentType; transcripts?: SongTranscript | SongTranscript[] | null };
type LyricsSyncResult = { kind: "synced" } | { kind: "plain"; lines: LyricLine[] } | { kind: "notFound" | "providerError" | "alignmentError" | "saveError" };
const contentTypeLabel = (type: ContentType, t: ReturnType<typeof useLanguage>["t"]) => ({ music_video: t("favorites.music"), movie_clip: t("favorites.movieClips"), interview: t("favorites.interviews"), podcast: t("favorites.podcasts"), shorts: t("favorites.shorts"), other: t("favorites.other") })[type];

function isLyricLines(value: unknown): value is LyricLine[] {
  return Array.isArray(value) && value.every((line) =>
    typeof line === "object" && line !== null &&
    typeof line.text === "string" &&
    typeof line.start === "number" && Number.isFinite(line.start) && line.start >= 0 &&
    typeof line.duration === "number" && Number.isFinite(line.duration) && line.duration >= 0,
  );
}

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
  const [contentType, setContentType] = useState<ContentType>("music_video");
  const [isPublic, setIsPublic] = useState(true);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const previewVideoId = extractVideoId(url);

  const refresh = useCallback(async () => {
    const db = getSupabaseBrowserClient();
    if (!db || !userId) return;
    type DashboardSongRow = { id: string; youtube_id: string; title: string; artist: string | null; is_public: boolean; genre: string; difficulty: string; content_type: ContentType; transcripts: SongTranscript | SongTranscript[] | null };
    const query = await db.from("songs").select("id,youtube_id,title,artist,is_public,genre,difficulty,content_type,transcripts(lines_json)").eq("created_by", userId).order("created_at", { ascending: false });
    let rows: DashboardSongRow[];
    if (query.error) {
      console.error("[dashboard] Could not load song metadata columns; trying legacy schema.", query.error.code);
      const legacy = await db.from("songs").select("id,youtube_id,title,is_public,transcripts(lines_json)").eq("created_by", userId).order("created_at", { ascending: false });
      if (legacy.error) console.error("[dashboard] Legacy song query failed.", legacy.error.code);
      rows = (legacy.data ?? []).map((song) => ({ ...song, artist: null, genre: "other", difficulty: "intermediate", content_type: "music_video" })) as unknown as DashboardSongRow[];
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
  }, [userId]);
  useEffect(() => { void Promise.resolve().then(refresh); }, [refresh]);

  async function fetchPreview() {
    setBusy(true); setMessage("");
    try {
      const videoId = extractVideoId(url);
      if (!videoId) throw new Error(text.invalidYoutube);
      const meta = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`);
      const metadata: unknown = meta.ok ? await meta.json() : {};
      const songTitle = typeof metadata === "object" && metadata !== null && "title" in metadata && typeof metadata.title === "string"
        ? metadata.title
        : "";
      const songArtist = typeof metadata === "object" && metadata !== null && "author_name" in metadata && typeof metadata.author_name === "string"
        ? metadata.author_name
        : "";
      let lyricLines: LyricLine[] | null = null;
      if (songTitle) {
        try {
          const lookup = await fetch(`/api/lrclib?title=${encodeURIComponent(songTitle)}`);
          if (lookup.ok) {
            const result: unknown = await lookup.json();
            if (
              typeof result === "object" && result !== null && "kind" in result &&
              result.kind === "synced" && "lines" in result && isLyricLines(result.lines)
            ) {
              lyricLines = result.lines;
            }
          } else if (lookup.status !== 404) {
            console.error("[dashboard] Lrclib lookup failed; falling back to YouTube subtitles.", lookup.status);
          }
        } catch (error) {
          console.error("[dashboard] Lrclib lookup failed; falling back to YouTube subtitles.", {
            errorType: error instanceof Error ? error.name : "UnknownError",
          });
        }
      }

      if (!lyricLines) {
        const transcript = await fetch(`/api/transcript?videoId=${videoId}&lang=${sourceLanguage}`);
        const lyricData: unknown = await transcript.json();
        if (!transcript.ok || !isLyricLines(lyricData)) throw new Error(text.subtitlesUnavailable);
        lyricLines = lyricData;
      }
      setLines(lyricLines); setTitle(songTitle); setArtist(songArtist);
      setMessage(text.subtitlesReady);
    } catch (error) { setMessage(error instanceof Error ? error.message : text.loadError); }
    finally { setBusy(false); }
  }

  async function save() {
    setBusy(true); setSaving(true);
    try {
      const response = await fetch("/api/songs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ youtubeUrl: url, title, artist, language: sourceLanguage, genre: genre || "other", difficulty: difficulty || "intermediate", contentType: contentType || "music_video", lines, isPublic }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.code === "INVALID_ARTIST" ? t("globalSearch.invalidArtist") : typeof result.error === "string" ? result.error : text.songSaveError);
      setMessage(text.songSaved); setLines([]); setUrl(""); setTitle(""); setArtist(""); await refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : text.songSaveError); }
    finally { setBusy(false); setSaving(false); }
  }

  async function saveSong(song: Song, editedLines: LyricLine[], editedGenre: SongGenre, editedDifficulty: SongDifficulty, editedContentType: ContentType, editedArtist: string): Promise<boolean> {
    const response = await fetch("/api/songs", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: song.id, isPublic: song.is_public, genre: editedGenre, difficulty: editedDifficulty, contentType: editedContentType, artist: editedArtist, lines: editedLines }) });
    const result: unknown = await response.json().catch(() => null);
    if (!response.ok && typeof result === "object" && result !== null && "code" in result && result.code === "INVALID_ARTIST") {
      setMessage(t("globalSearch.invalidArtist"));
      return false;
    }
    setMessage(response.ok ? text.changesSaved : text.songSaveError);
    if (response.ok) await refresh();
    return response.ok;
  }

  async function deleteSong(songId: string): Promise<boolean> {
    const response = await fetch("/api/songs", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: songId }) });
    const result: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const errorMessage = typeof result === "object" && result !== null && "error" in result && typeof result.error === "string"
        ? result.error
        : text.deleteMediaError;
      setMessage(errorMessage);
      return false;
    }
    setSongs((current) => current.filter((song) => song.id !== songId));
    setMessage(text.deleteMediaSuccess);
    return true;
  }

  async function syncSongLyrics(song: Song, currentLines: LyricLine[]): Promise<LyricsSyncResult> {
    try {
      const response = await fetch(`/api/lrclib?title=${encodeURIComponent(song.title)}`);
      if (response.status === 404) return { kind: "notFound" };
      if (!response.ok) return { kind: "providerError" };

      const result: unknown = await response.json();
      if (typeof result !== "object" || result === null || !("kind" in result)) return { kind: "providerError" };
      if (result.kind === "synced" && "lines" in result && isLyricLines(result.lines)) {
        const saved = await saveSong(song, result.lines, song.genre, song.difficulty, song.content_type, song.artist ?? "");
        return saved ? { kind: "synced" } : { kind: "saveError" };
      }
      if (result.kind === "plain" && "plainLyrics" in result && typeof result.plainLyrics === "string") {
        const aligned = alignPlainLyrics(currentLines, result.plainLyrics);
        if (!aligned || aligned.confidence < 0.35) return { kind: "alignmentError" };
        return { kind: "plain", lines: aligned.lines };
      }
      return { kind: "notFound" };
    } catch (error) {
      console.error("[dashboard] Could not update lyrics from Lrclib.", {
        errorType: error instanceof Error ? error.name : "UnknownError",
      });
      return { kind: "providerError" };
    }
  }

  if (loading) return <main className="mx-auto max-w-5xl p-8">{text.loading}</main>;
  if (!userId) return <main className="mx-auto w-full max-w-5xl space-y-10 px-4 py-10"><SongSearch /><section><h1 className="text-2xl font-bold">{text.mySongs}</h1><p className="mt-3">{text.loginPrompt}</p><Link className="mt-3 inline-block text-primary underline" href="/auth">{text.login}</Link></section></main>;

  return <main className="mx-auto w-full max-w-5xl space-y-10 px-4 py-10">
    <SongSearch />
    <section><h1 className="text-3xl font-bold">{text.mySongs}</h1><div className="mt-5 grid gap-3 rounded-xl border p-5">
      <h2 className="text-xl font-semibold">{text.addYoutube}</h2>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center"><input className="min-w-0 flex-1 rounded border bg-background px-3 py-2" placeholder={text.youtubeUrl} value={url} onChange={event => setUrl(stripYoutubeUrlExtras(event.target.value))}/><label className="grid gap-1 text-sm"><span>{t("favorites.category")}</span><select aria-label={t("favorites.category")} className="rounded border bg-background px-3 py-2" value={contentType} onChange={event=>setContentType(event.target.value as ContentType)}>{CONTENT_TYPES.map(type=><option key={type} value={type}>{contentTypeLabel(type,t)}</option>)}</select></label><label className="flex shrink-0 items-center gap-2 text-sm"><input type="checkbox" checked={isPublic} onChange={event=>setIsPublic(event.target.checked)}/> {text.publicSong}</label><button disabled={busy||!url} onClick={fetchPreview} className="shrink-0 rounded border px-4 py-2 disabled:opacity-50">{text.loadSubtitles}</button></div>
      {lines.length > 0 && <div className="grid max-w-xl grid-cols-1 gap-3"><label className="grid gap-1 text-sm"><span>{metadataLabels.genre}</span><select className="block h-10 w-full appearance-none rounded border bg-background px-3" value={genre} onChange={event=>setGenre(event.target.value as SongGenre)}>{SONG_GENRES.map((item)=><option key={item} value={item}>{metadataLabels.genres[item]}</option>)}</select></label><label className="grid gap-1 text-sm"><span>{metadataLabels.difficulty}</span><select className="block h-10 w-full appearance-none rounded border bg-background px-3" value={difficulty} onChange={event=>setDifficulty(event.target.value as SongDifficulty)}>{SONG_DIFFICULTIES.map((item)=><option key={item} value={item}>{metadataLabels.difficulties[item]}</option>)}</select></label></div>}
      {lines.length>0&&<button disabled={saving} onClick={save} className="inline-flex items-center gap-2 rounded bg-primary px-4 py-2 text-primary-foreground disabled:cursor-not-allowed disabled:opacity-60">{saving&&<Loader2 className="size-4 animate-spin" aria-hidden="true"/>}{saving?t("common.saving"):text.save}</button>}
      {previewVideoId && <TranscriptTimingEditor videoId={previewVideoId} lines={lines} onLinesChange={setLines}/>}
      {lines.length>0&&<div className="grid gap-3 sm:grid-cols-2"><label className="grid gap-1 text-sm"><span>{text.songTitle}</span><input className="rounded border bg-background px-3 py-2" value={title} onChange={event=>setTitle(event.target.value)}/></label><label className="grid gap-1 text-sm"><span>{t("search.artist")}</span><input maxLength={200} className="rounded border bg-background px-3 py-2" value={artist} onChange={event=>setArtist(event.target.value)}/></label></div>}
      {message&&<p role="status" className="text-sm text-muted-foreground">{message}</p>}
    </div></section>
    <section><h2 className="mb-4 text-2xl font-semibold">{text.savedSongs}</h2>{songs.length===0?<p className="text-muted-foreground">{text.emptySongs}</p>:<div className="space-y-3">{songs.map(song=><SongEditor key={song.id} song={song} onSave={saveSong} onDelete={deleteSong} onSync={syncSongLyrics} text={text} uiLanguage={uiLanguage}/>)}</div>}</section>
  </main>;
}

function SongEditor({ song, onSave, onDelete, onSync, text, uiLanguage }: { song: Song; onSave: (song: Song, lines: LyricLine[], genre: SongGenre, difficulty: SongDifficulty, contentType: ContentType, artist: string) => Promise<boolean>; onDelete: (songId: string) => Promise<boolean>; onSync: (song: Song, lines: LyricLine[]) => Promise<LyricsSyncResult>; text: (typeof PAGE_TEXT)["ru"]; uiLanguage: keyof typeof PAGE_TEXT }) {
  const { t } = useLanguage();
  const transcript = Array.isArray(song.transcripts) ? song.transcripts[0] : song.transcripts;
  const [lines,setLines]=useState(transcript?.lines_json??[]); const [isPublic,setIsPublic]=useState(song.is_public); const [open,setOpen]=useState(false); const [saving,setSaving]=useState(false);
  const [syncing,setSyncing]=useState(false); const [deleting,setDeleting]=useState(false); const [syncMessage,setSyncMessage]=useState("");
  const [genre,setGenre]=useState(song.genre); const [difficulty,setDifficulty]=useState(song.difficulty); const [contentType,setContentType]=useState(song.content_type); const labels=songMetadataLabels(uiLanguage);
  const [artist,setArtist]=useState(song.artist ?? "");
  useEffect(() => { queueMicrotask(() => setLines(transcript?.lines_json ?? [])); }, [song.id, transcript]);
  useEffect(() => { queueMicrotask(() => { setGenre(song.genre); setDifficulty(song.difficulty); setArtist(song.artist ?? ""); }); }, [song.artist, song.genre, song.difficulty]);
  async function handleSave() {
    if (saving) return;
    setSaving(true);
    try {
      const saved = await onSave({ ...song, is_public: isPublic }, lines, genre, difficulty, contentType, artist);
      if (saved) setSyncMessage("");
    }
    finally { setSaving(false); }
  }
  async function handleDelete() {
    if (saving || syncing || deleting) return;
    const confirmed = window.confirm(text.deleteMediaConfirm.replace("{title}", song.title));
    if (!confirmed) return;
    setDeleting(true); setSyncMessage("");
    try {
      const deleted = await onDelete(song.id);
      if (deleted) setOpen(false);
      else setSyncMessage(text.deleteMediaError);
    } finally {
      setDeleting(false);
    }
  }
  async function handleSync() {
    if (saving || syncing) return;
    setSyncing(true); setSyncMessage("");
    try {
      const result = await onSync(song, lines);
      if (result.kind === "plain") {
        setLines(result.lines);
        setOpen(true);
        setSyncMessage(t("lyrics.syncPreview"));
      } else if (result.kind === "synced") {
        setSyncMessage(t("lyrics.syncSaved"));
      } else if (result.kind === "notFound") {
        setSyncMessage(t("lyrics.syncNotFound"));
      } else if (result.kind === "alignmentError") {
        setSyncMessage(t("lyrics.syncAlignmentError"));
      } else if (result.kind === "saveError") {
        setSyncMessage(t("lyrics.syncSaveError"));
      } else {
        setSyncMessage(t("lyrics.syncProviderError"));
      }
    } finally {
      setSyncing(false);
    }
  }
  return <details open={open} className="rounded-lg border p-4" onToggle={event=>setOpen(event.currentTarget.open)}><summary className="cursor-pointer font-medium">{song.title} <span className="text-sm text-muted-foreground">({isPublic?text.public:text.private})</span></summary><div className="mt-3 space-y-3"><div className="flex flex-wrap items-center gap-3"><Link className="text-sm text-primary underline" href={`/song/${song.youtube_id}`}>{text.openTrainer}</Link><button type="button" disabled={saving||syncing} aria-label={t("lyrics.sync")} title={t("lyrics.sync")} className="inline-flex items-center gap-2 rounded border px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60" onClick={()=>void handleSync()}>{syncing?<Loader2 className="size-4 animate-spin" aria-hidden="true"/>:<RefreshCw className="size-4" aria-hidden="true"/>}{syncing?t("lyrics.syncing"):t("lyrics.sync")}</button><button type="button" disabled={saving||syncing||deleting} aria-label={text.deleteMedia} title={text.deleteMedia} className="inline-flex items-center gap-2 rounded border border-destructive/60 px-3 py-2 text-sm text-destructive disabled:cursor-not-allowed disabled:opacity-60" onClick={()=>void handleDelete()}>{deleting?<Loader2 className="size-4 animate-spin" aria-hidden="true"/>:<Trash2 className="size-4" aria-hidden="true"/>}{deleting?text.deleting:text.deleteMedia}</button><label className="flex items-center gap-2 whitespace-nowrap text-sm"><input type="checkbox" checked={isPublic} onChange={event=>setIsPublic(event.target.checked)}/> {text.publicSong}</label><label className="flex items-center gap-2 whitespace-nowrap text-sm"><span>{t("favorites.category")}</span><select className="h-9 rounded border bg-background px-2" value={contentType} onChange={event=>setContentType(event.target.value as ContentType)}>{CONTENT_TYPES.map(type=><option key={type} value={type}>{contentTypeLabel(type,t)}</option>)}</select></label><label className="flex items-center gap-2 whitespace-nowrap text-sm"><span>{labels.genre}</span><select className="h-9 max-w-52 rounded border bg-background px-2" value={genre} onChange={event=>setGenre(event.target.value as SongGenre)}>{SONG_GENRES.map((item)=><option key={item} value={item}>{labels.genres[item]}</option>)}</select></label><label className="flex items-center gap-2 whitespace-nowrap text-sm"><span>{labels.difficulty}</span><select className="h-9 rounded border bg-background px-2" value={difficulty} onChange={event=>setDifficulty(event.target.value as SongDifficulty)}>{SONG_DIFFICULTIES.map((item)=><option key={item} value={item}>{labels.difficulties[item]}</option>)}</select></label></div><label className="grid max-w-xl gap-1 text-sm"><span>{t("search.artist")}</span><input maxLength={200} className="h-10 rounded border bg-background px-3" value={artist} onChange={event=>setArtist(event.target.value)}/></label>{syncMessage&&<p role="status" className="text-sm text-muted-foreground">{syncMessage}</p>}{open&&<TranscriptTimingEditor videoId={song.youtube_id} lines={lines} onLinesChange={setLines}/>}<button disabled={saving||syncing} className="inline-flex items-center gap-2 rounded bg-primary px-3 py-2 text-primary-foreground disabled:cursor-not-allowed disabled:opacity-60" onClick={()=>void handleSave()}>{saving&&<Loader2 className="size-4 animate-spin" aria-hidden="true"/>}{saving?t("common.saving"):text.saveChanges}</button></div></details>;
}

function TranscriptTimingEditor({ videoId, lines, onLinesChange }: { videoId: string; lines: LyricLine[]; onLinesChange: (lines: LyricLine[]) => void }) {
  const playerRef = useRef<PlayerHandle>(null);
  const isPlayingRef = useRef(false);
  const previousTimeRef = useRef(0);
  const latestTimeRef = useRef(0);
  const autoPausedLineRef = useRef<number | null>(null);
  const { t, sourceLanguage, targetLanguage } = useLanguage();
  const streamExplanation = useStreamingExplanation();
  const [currentTime, setCurrentTime] = useState(0);
  const [explanations, setExplanations] = useState<Record<string, { loading: boolean; explanation?: Explanation; partial?: Partial<Explanation>; error?: string }>>({});
  const [emptyLineInputs, setEmptyLineInputs] = useState<Record<number, { start?: boolean; duration?: boolean }>>({});
  const handleTimeUpdate = useCallback((seconds: number) => {
    const previousTime = previousTimeRef.current;
    latestTimeRef.current = seconds;
    previousTimeRef.current = seconds;
    setCurrentTime(seconds);
    if (!isPlayingRef.current) return;

    const endedLineIndex = lines.findIndex((line) => {
      const end = line.start + line.duration + AUDIO_END_BUFFER_SECONDS;
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

  async function explainLine(index: number) {
    const line = lines[index];
    const key = `${index}:${line.start}:${line.text}`;
    if (explanations[key]?.explanation) {
      setExplanations((current) => { const next = { ...current }; delete next[key]; return next; });
      return;
    }
    playerRef.current?.pause();
    setExplanations((current) => ({ ...current, [key]: { loading: true } }));
    try {
    const context = lines.slice(Math.max(0, index - 1), index + 2).filter((_, i) => i !== index - Math.max(0, index - 1)).map((item) => item.text).join(" ");
    const explanation = await streamExplanation(
      { text: line.text, youtubeId: videoId, lineIndex: index, context, sourceLanguage, targetLanguage },
      (partial) => setExplanations((current) => ({ ...current, [key]: { loading: true, partial } })),
    );
    setExplanations((current) => ({ ...current, [key]: { loading: false, explanation } }));
    } catch (error) {
      setExplanations((current) => ({ ...current, [key]: { loading: false, error: error instanceof Error ? error.message : t("explain.unknownError") } }));
    }
  }

  return <div className="grid gap-4">
    <section className="space-y-2"><h3 className="font-medium">{t("dashboard.player")}</h3><YouTubePlayer ref={playerRef} videoId={videoId} onTimeUpdate={handleTimeUpdate} onPlayingChange={handlePlaybackChange}/><p className="text-sm text-muted-foreground">{t("dashboard.reviewTiming")}</p><p className="text-xs tabular-nums text-muted-foreground">{formatTimestamp(currentTime)}</p></section>
    <section className="space-y-2">
      <div className="grid grid-cols-[5.5rem_minmax(0,1fr)_8rem] items-center gap-2">
        <span />
        <span />
        <div className="flex items-center justify-center gap-1">
          <button type="button" disabled={lines.length < 2} className="flex items-center justify-center rounded border p-1.5 hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50" aria-label={t("dashboard.mergeShortLines")} title={t("dashboard.mergeShortLines")} onClick={() => {
            setEmptyLineInputs({});
            onLinesChange(mergeShortLines(lines));
          }}><Combine aria-hidden="true" size={16} /></button>
          <button type="button" disabled={!lines.some((line) => countWords(line.text) > 7)} className="flex items-center justify-center rounded border p-1.5 hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50" aria-label={t("dashboard.splitLongLines")} title={t("dashboard.splitLongLines")} onClick={() => {
            setEmptyLineInputs({});
            onLinesChange(splitLongLines(lines));
          }}><Split aria-hidden="true" size={16} /></button>
          <button type="button" disabled={lines.length < 2} className="flex items-center justify-center rounded border p-1.5 hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50" aria-label={t("dashboard.recalculateDurations")} title={t("dashboard.recalculateDurations")} onClick={() => {
            setEmptyLineInputs({});
            onLinesChange(recalculateLineTimings(lines));
          }}><RefreshCw aria-hidden="true" size={16} /></button>
        </div>
      </div>
      {lines.length ? (
        <div className="max-h-[26rem] space-y-2 overflow-auto">
          {lines.map((line, index) => {
            const key = `${index}:${line.start}:${line.text}`;
            const state = explanations[key];
            return (
              <div key={index} className="min-w-0 space-y-1">
                <div className="flex min-w-0 items-center gap-1">
                  <div className="flex w-fit shrink-0 items-center gap-1">
                    <button type="button" className="flex h-8 shrink-0 items-center justify-center rounded border px-0 text-xs hover:bg-muted" style={{ width: "2rem", minWidth: "2rem", maxWidth: "2rem" }} aria-label={`${t("dashboard.seekToLine")} ${index + 1}`} onClick={() => { autoPausedLineRef.current = null; playerRef.current?.seekTo(Math.max(0, line.start - AUDIO_START_BUFFER_SECONDS)); playerRef.current?.play(); }}>▶</button>
                    <input aria-label={t("dashboard.start")} className="h-8 shrink-0 rounded border bg-background px-1 text-xs" style={{ width: "4rem", minWidth: "4rem", maxWidth: "4rem" }} type="number" min="0" step="0.1" value={emptyLineInputs[index]?.start ? "" : line.start} onChange={event => {
                      setEmptyLineInputs((current) => ({ ...current, [index]: { ...current[index], start: false } }));
                      onLinesChange(updateLineStart(lines, index, Number(event.target.value)));
                    }} />
                  </div>
                  <input aria-label={`${t("dashboard.lyrics")} ${index + 1}`} className="h-8 min-w-0 flex-1 rounded border bg-background px-2" value={line.text} onChange={event => onLinesChange(lines.map((item, i) => i === index ? { ...item, text: event.target.value } : item))} />
                  <div className="flex w-fit shrink-0 flex-nowrap gap-1">
                    <input aria-label={t("dashboard.duration")} className="h-8 shrink-0 rounded border bg-background px-1 text-xs" style={{ width: "4rem", minWidth: "4rem", maxWidth: "4rem" }} type="number" min="0" step="0.1" value={emptyLineInputs[index]?.duration ? "" : line.duration} onChange={event => {
                      setEmptyLineInputs((current) => ({ ...current, [index]: { ...current[index], duration: false } }));
                      onLinesChange(lines.map((item, i) => i === index ? { ...item, duration: Number(event.target.value) } : item));
                    }} />
                    <button type="button" className="flex h-8 shrink-0 items-center justify-center rounded border px-0 hover:bg-muted" style={{ width: "2rem", minWidth: "2rem", maxWidth: "2rem" }} aria-label={t("dashboard.addLine")} title={t("dashboard.addLine")} onClick={() => {
                      setEmptyLineInputs((current) => ({
                        ...Object.fromEntries(Object.entries(current).map(([lineIndex, fields]) => {
                          const numericIndex = Number(lineIndex);
                          return [numericIndex > index ? numericIndex + 1 : numericIndex, fields];
                        })),
                        [index + 1]: { start: true, duration: true },
                      }));
                      onLinesChange([
                        ...lines.slice(0, index + 1),
                        { text: "", start: 0, duration: 0 },
                        ...lines.slice(index + 1),
                      ]);
                    }}><Plus aria-hidden="true" size={16} /></button>
                    <button type="button" className="flex h-8 shrink-0 items-center justify-center rounded border px-0 text-destructive hover:bg-muted" style={{ width: "2rem", minWidth: "2rem", maxWidth: "2rem" }} aria-label={`${t("vocab.delete")} ${index + 1}`} title={t("vocab.delete")} onClick={() => {
                      setEmptyLineInputs((current) => Object.fromEntries(Object.entries(current).flatMap(([lineIndex, fields]) => {
                        const numericIndex = Number(lineIndex);
                        if (numericIndex === index) return [];
                        return [[numericIndex > index ? numericIndex - 1 : numericIndex, fields]];
                      })));
                      onLinesChange(lines.filter((_, i) => i !== index));
                    }}><Trash2 aria-hidden="true" size={16} /></button>
                    <button type="button" disabled={state?.loading} className="flex h-8 shrink-0 items-center gap-1 rounded border px-2 text-xs hover:bg-muted disabled:opacity-50" onClick={() => void explainLine(index)}>{state?.loading ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Sparkles className="size-4" aria-hidden="true" />}{state?.explanation ? t("explain.hide") : t("explain.button")}</button>
                  </div>
                </div>
                {state?.loading && (state.partial ? <StreamingExplanation data={state.partial} /> : <ExplanationSkeleton />)}
                {state?.error && <p role="alert" className="text-sm text-destructive">{state.error}</p>}
                {state?.explanation && <ExplanationCard data={state.explanation} />}
              </div>
            );
          })}
        </div>
      ) : <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">{t("dashboard.loadTranscriptHint")}</p>}
    </section>
  </div>;
}

function formatTimestamp(seconds: number) {
  const safeSeconds = Number.isFinite(seconds) ? Math.max(seconds, 0) : 0;
  const minutes = Math.floor(safeSeconds / 60);
  const remainder = (safeSeconds % 60).toFixed(1).padStart(4, "0");
  return `${minutes}:${remainder}`;
}

function recalculateLineTimings(lines: LyricLine[]): LyricLine[] {
  const roundedLines = lines.map((line) => ({
    ...line,
    start: Number(line.start.toFixed(1)),
    duration: Number(line.duration.toFixed(1)),
  }));

  return roundedLines.map((line, index) => index < roundedLines.length - 1
    ? {
      ...line,
      duration: Math.max(0, Number((roundedLines[index + 1].start - line.start - 0.1).toFixed(1))),
    }
    : line);
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

function splitLongLines(lines: LyricLine[]): LyricLine[] {
  return lines.flatMap((line) => {
    const words = line.text.trim().split(/\s+/u).filter(Boolean);
    if (words.length <= 7) return [line];

    const chunks: string[] = [];
    let remainingWords = words;
    let remainingChunks = Math.ceil(words.length / 7);

    while (remainingChunks > 1) {
      const minimumWords = Math.max(1, remainingWords.length - (remainingChunks - 1) * 7);
      const maximumWords = Math.min(7, remainingWords.length - (remainingChunks - 1));
      const targetWords = Math.min(maximumWords, Math.max(minimumWords, Math.round(remainingWords.length / remainingChunks)));
      const punctuationCandidates = Array.from(
        { length: maximumWords - minimumWords + 1 },
        (_, index) => minimumWords + index,
      )
        .filter((wordCount) => Math.abs(wordCount - targetWords) <= 2)
        .map((wordCount) => {
          const ending = remainingWords[wordCount - 1].replace(/["'’”»)\]}]+$/u, "");
          const punctuationRank = /[.!?…]+$/u.test(ending) ? 2 : /\p{P}$/u.test(ending) ? 1 : 0;
          return { wordCount, punctuationRank };
        })
        .filter((candidate) => candidate.punctuationRank > 0)
        .sort((a, b) => b.punctuationRank - a.punctuationRank || Math.abs(a.wordCount - targetWords) - Math.abs(b.wordCount - targetWords));
      const splitAt = punctuationCandidates[0]?.wordCount ?? targetWords;

      chunks.push(remainingWords.slice(0, splitAt).join(" "));
      remainingWords = remainingWords.slice(splitAt);
      remainingChunks -= 1;
    }
    chunks.push(remainingWords.join(" "));

    const totalCharacters = chunks.reduce((total, chunk) => total + chunk.length, 0);
    const lineEnd = line.start + line.duration;
    const lineWithoutTranslations = { ...line };
    delete lineWithoutTranslations.translations;
    let elapsedCharacters = 0;
    let previousBoundary = line.start;

    return chunks.map((text, index) => {
      const start = index === 0 ? line.start : previousBoundary;
      elapsedCharacters += text.length;
      const end = index === chunks.length - 1
        ? lineEnd
        : Number((line.start + line.duration * elapsedCharacters / totalCharacters).toFixed(2));
      previousBoundary = end;

      return {
        ...lineWithoutTranslations,
        text,
        start,
        duration: Number(Math.max(0, end - start).toFixed(2)),
      };
    });
  });
}

function updateLineStart(lines: LyricLine[], index: number, start: number): LyricLine[] {
  const updated = lines.map((line, lineIndex) => lineIndex === index ? { ...line, start } : line);
  const durationBefore = index - 1;
  const durationAfter = index;

  for (const lineIndex of [durationBefore, durationAfter]) {
    if (lineIndex < 0 || lineIndex >= updated.length - 1) continue;
    updated[lineIndex] = {
      ...updated[lineIndex],
      duration: Math.max(0, Number((updated[lineIndex + 1].start - updated[lineIndex].start - 0.1).toFixed(2))),
    };
  }

  return updated;
}
