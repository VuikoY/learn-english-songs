"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useAuthState } from "@/context/AuthContext";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { useLanguage } from "@/context/LanguageContext";
import { PAGE_TEXT } from "@/lib/i18n/pages";
import type { LyricLine } from "@/lib/types";
import { TranscriptTimingEditor } from "@/components/TranscriptTimingEditor";
import { extractVideoId, stripYoutubeUrlExtras } from "@/lib/youtube";
import { Loader2, Trash2 } from "lucide-react";
import { SONG_DIFFICULTIES, SONG_GENRES, songMetadataLabels, type SongDifficulty, type SongGenre } from "@/lib/songMetadata";
import { CONTENT_TYPES, type ContentType } from "@/components/SongCatalog";
import SongSearch from "@/components/SongSearch";

type SongTranscript = { lines_json: LyricLine[] };
type Song = { id: string; youtube_id: string; title: string; artist: string | null; is_public: boolean; genre: SongGenre; difficulty: SongDifficulty; content_type: ContentType; transcripts?: SongTranscript | SongTranscript[] | null };
const contentTypeLabel = (type: ContentType, t: ReturnType<typeof useLanguage>["t"]) => ({ music_video: t("favorites.music"), movie_clip: t("favorites.movieClips"), interview: t("favorites.interviews"), podcast: t("favorites.podcasts"), shorts: t("favorites.shorts"), other: t("favorites.other") })[type];
const videoEditorText = {
  ru: { label: "ID видео YouTube или ссылка", apply: "Применить видео", invalid: "Введите корректный ID из 11 символов или ссылку YouTube." },
  uk: { label: "YouTube Video ID або посилання", apply: "Застосувати відео", invalid: "Введіть коректний ID з 11 символів або посилання YouTube." },
  en: { label: "YouTube Video ID or URL", apply: "Apply video", invalid: "Enter a valid 11-character ID or YouTube URL." },
  pl: { label: "ID filmu YouTube lub link", apply: "Zastosuj film", invalid: "Wpisz prawidłowy 11-znakowy identyfikator lub link YouTube." },
  es: { label: "ID de video de YouTube o enlace", apply: "Aplicar video", invalid: "Introduce un ID válido de 11 caracteres o un enlace de YouTube." },
} as const;

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
  const urlInputRef = useRef<HTMLInputElement>(null);
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

  function selectVideoUrl(videoUrl: string) {
    setUrl(videoUrl);
    setLines([]);
    setTitle("");
    setArtist("");
    setMessage("");
    urlInputRef.current?.focus();
    void fetchPreview(videoUrl);
  }

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

  async function fetchPreview(videoUrl: string) {
    setBusy(true); setMessage("");
    try {
      const videoId = extractVideoId(videoUrl);
      if (!videoId) throw new Error(text.invalidYoutube);
      const meta = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`);
      const metadata: unknown = meta.ok ? await meta.json() : {};
      const songTitle = typeof metadata === "object" && metadata !== null && "title" in metadata && typeof metadata.title === "string"
        ? metadata.title
        : "";
      const songArtist = typeof metadata === "object" && metadata !== null && "author_name" in metadata && typeof metadata.author_name === "string"
        ? metadata.author_name
        : "";
      const transcript = await fetch(`/api/transcript?videoId=${videoId}&lang=${sourceLanguage}`);
      const lyricData: unknown = await transcript.json();
      if (!transcript.ok || !isLyricLines(lyricData)) throw new Error(text.subtitlesUnavailable);
      const lyricLines = lyricData;
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

  async function saveSong(song: Song, editedLines: LyricLine[], editedGenre: SongGenre, editedDifficulty: SongDifficulty, editedContentType: ContentType, editedArtist: string, editedVideoId: string): Promise<boolean> {
    const response = await fetch("/api/songs", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: song.id, isPublic: song.is_public, genre: editedGenre, difficulty: editedDifficulty, contentType: editedContentType, artist: editedArtist, videoId: editedVideoId, lines: editedLines }) });
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

  if (loading) return <main className="mx-auto max-w-5xl p-8">{text.loading}</main>;
  if (!userId) return <main className="mx-auto w-full max-w-5xl space-y-10 px-4 py-10"><SongSearch onSelectVideoUrl={selectVideoUrl} /><section><h1 className="text-2xl font-bold">{text.mySongs}</h1><p className="mt-3">{text.loginPrompt}</p><Link className="mt-3 inline-block text-primary underline" href="/auth">{text.login}</Link></section></main>;

  return <main className="mx-auto w-full max-w-5xl space-y-10 px-4 py-10">
    <SongSearch onSelectVideoUrl={selectVideoUrl} />
    <section><h1 className="text-3xl font-bold">{text.mySongs}</h1><div className="mt-5 grid gap-3 rounded-xl border p-5">
      <h2 className="text-xl font-semibold">{text.addYoutube}</h2>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center"><input ref={urlInputRef} aria-label={text.youtubeUrl} className="min-w-0 flex-1 rounded border bg-background px-3 py-2" placeholder={text.youtubeUrl} value={url} onChange={event => setUrl(stripYoutubeUrlExtras(event.target.value))}/><label className="grid gap-1 text-sm"><span>{t("favorites.category")}</span><select aria-label={t("favorites.category")} className="rounded border bg-background px-3 py-2" value={contentType} onChange={event=>setContentType(event.target.value as ContentType)}>{CONTENT_TYPES.map(type=><option key={type} value={type}>{contentTypeLabel(type,t)}</option>)}</select></label><label className="flex shrink-0 items-center gap-2 text-sm"><input type="checkbox" checked={isPublic} onChange={event=>setIsPublic(event.target.checked)}/> {text.publicSong}</label><button disabled={busy||!url} onClick={() => void fetchPreview(url)} className="shrink-0 rounded border px-4 py-2 disabled:opacity-50">{text.loadSubtitles}</button></div>
      {lines.length > 0 && <div className="grid max-w-xl grid-cols-1 gap-3"><label className="grid gap-1 text-sm"><span>{metadataLabels.genre}</span><select className="block h-10 w-full appearance-none rounded border bg-background px-3" value={genre} onChange={event=>setGenre(event.target.value as SongGenre)}>{SONG_GENRES.map((item)=><option key={item} value={item}>{metadataLabels.genres[item]}</option>)}</select></label><label className="grid gap-1 text-sm"><span>{metadataLabels.difficulty}</span><select className="block h-10 w-full appearance-none rounded border bg-background px-3" value={difficulty} onChange={event=>setDifficulty(event.target.value as SongDifficulty)}>{SONG_DIFFICULTIES.map((item)=><option key={item} value={item}>{metadataLabels.difficulties[item]}</option>)}</select></label></div>}
      {lines.length>0&&<button disabled={saving} onClick={save} className="inline-flex items-center gap-2 rounded bg-primary px-4 py-2 text-primary-foreground disabled:cursor-not-allowed disabled:opacity-60">{saving&&<Loader2 className="size-4 animate-spin" aria-hidden="true"/>}{saving?t("common.saving"):text.save}</button>}
      {previewVideoId && <TranscriptTimingEditor videoId={previewVideoId} lines={lines} onLinesChange={setLines}/>}
      {lines.length>0&&<div className="grid gap-3 sm:grid-cols-2"><label className="grid gap-1 text-sm"><span>{text.songTitle}</span><input className="rounded border bg-background px-3 py-2" value={title} onChange={event=>setTitle(event.target.value)}/></label><label className="grid gap-1 text-sm"><span>{t("search.artist")}</span><input maxLength={200} className="rounded border bg-background px-3 py-2" value={artist} onChange={event=>setArtist(event.target.value)}/></label></div>}
      {message&&<p role="status" className="text-sm text-muted-foreground">{message}</p>}
    </div></section>
    <section><h2 className="mb-4 text-2xl font-semibold">{text.savedSongs}</h2>{songs.length===0?<p className="text-muted-foreground">{text.emptySongs}</p>:<div className="space-y-3">{songs.map(song=><SongEditor key={song.id} song={song} onSave={saveSong} onDelete={deleteSong} text={text} uiLanguage={uiLanguage}/>)}</div>}</section>
  </main>;
}

function SongEditor({ song, onSave, onDelete, text, uiLanguage }: { song: Song; onSave: (song: Song, lines: LyricLine[], genre: SongGenre, difficulty: SongDifficulty, contentType: ContentType, artist: string, videoId: string) => Promise<boolean>; onDelete: (songId: string) => Promise<boolean>; text: (typeof PAGE_TEXT)["ru"]; uiLanguage: keyof typeof PAGE_TEXT }) {
  const { t } = useLanguage();
  const transcript = Array.isArray(song.transcripts) ? song.transcripts[0] : song.transcripts;
  const [lines,setLines]=useState(transcript?.lines_json??[]); const [isPublic,setIsPublic]=useState(song.is_public); const [open,setOpen]=useState(false); const [saving,setSaving]=useState(false);
  const [deleting,setDeleting]=useState(false); const [editorMessage,setEditorMessage]=useState("");
  const [genre,setGenre]=useState(song.genre); const [difficulty,setDifficulty]=useState(song.difficulty); const [contentType,setContentType]=useState(song.content_type); const labels=songMetadataLabels(uiLanguage);
  const [artist,setArtist]=useState(song.artist ?? "");
  const [videoId,setVideoId]=useState(song.youtube_id); const [videoInput,setVideoInput]=useState(song.youtube_id); const [videoError,setVideoError]=useState(""); const videoText=videoEditorText[uiLanguage];
  useEffect(() => { queueMicrotask(() => setLines(transcript?.lines_json ?? [])); }, [song.id, transcript]);
  useEffect(() => { queueMicrotask(() => { setGenre(song.genre); setDifficulty(song.difficulty); setArtist(song.artist ?? ""); }); }, [song.artist, song.genre, song.difficulty]);
  async function handleSave() {
    if (saving) return;
    setSaving(true);
    try {
      const saved = await onSave({ ...song, is_public: isPublic }, lines, genre, difficulty, contentType, artist, videoId);
      if (saved) setEditorMessage("");
    }
    finally { setSaving(false); }
  }
  async function handleDelete() {
    if (saving || deleting) return;
    const confirmed = window.confirm(text.deleteMediaConfirm.replace("{title}", song.title));
    if (!confirmed) return;
    setDeleting(true); setEditorMessage("");
    try {
      const deleted = await onDelete(song.id);
      if (deleted) setOpen(false);
      else setEditorMessage(text.deleteMediaError);
    } finally {
      setDeleting(false);
    }
  }
  return <details open={open} className="rounded-lg border p-4" onToggle={event=>setOpen(event.currentTarget.open)}><summary className="cursor-pointer font-medium">{song.title} <span className="text-sm text-muted-foreground">({isPublic?text.public:text.private})</span></summary><div className="mt-3 space-y-3"><div className="flex flex-wrap items-center gap-3"><Link className="text-sm text-primary underline" href={`/song/${videoId}`}>{text.openTrainer}</Link><button type="button" disabled={saving||deleting} aria-label={text.deleteMedia} title={text.deleteMedia} className="inline-flex items-center gap-2 rounded border border-destructive/60 px-3 py-2 text-sm text-destructive disabled:cursor-not-allowed disabled:opacity-60" onClick={()=>void handleDelete()}>{deleting?<Loader2 className="size-4 animate-spin" aria-hidden="true"/>:<Trash2 className="size-4" aria-hidden="true"/>}{deleting?text.deleting:text.deleteMedia}</button><label className="flex items-center gap-2 whitespace-nowrap text-sm"><input type="checkbox" checked={isPublic} onChange={event=>setIsPublic(event.target.checked)}/> {text.publicSong}</label><label className="flex items-center gap-2 whitespace-nowrap text-sm"><span>{t("favorites.category")}</span><select className="h-9 rounded border bg-background px-2" value={contentType} onChange={event=>setContentType(event.target.value as ContentType)}>{CONTENT_TYPES.map(type=><option key={type} value={type}>{contentTypeLabel(type,t)}</option>)}</select></label><label className="flex items-center gap-2 whitespace-nowrap text-sm"><span>{labels.genre}</span><select className="h-9 max-w-52 rounded border bg-background px-2" value={genre} onChange={event=>setGenre(event.target.value as SongGenre)}>{SONG_GENRES.map((item)=><option key={item} value={item}>{labels.genres[item]}</option>)}</select></label><label className="flex items-center gap-2 whitespace-nowrap text-sm"><span>{labels.difficulty}</span><select className="h-9 rounded border bg-background px-2" value={difficulty} onChange={event=>setDifficulty(event.target.value as SongDifficulty)}>{SONG_DIFFICULTIES.map((item)=><option key={item} value={item}>{labels.difficulties[item]}</option>)}</select></label></div><label className="grid max-w-xl gap-1 text-sm"><span>{t("search.artist")}</span><input maxLength={200} className="h-10 rounded border bg-background px-3" value={artist} onChange={event=>setArtist(event.target.value)}/></label><div className="flex flex-col gap-2 sm:flex-row"><label className="grid flex-1 gap-1 text-sm"><span>{videoText.label}</span><input className="h-10 rounded border bg-background px-3" value={videoInput} onChange={event=>{setVideoInput(event.target.value);setVideoError("");}} aria-invalid={Boolean(videoError)} aria-describedby={videoError?`video-id-error-${song.id}`:undefined}/></label><button type="button" className="self-end rounded border px-3 py-2" onClick={()=>{const nextVideoId=extractVideoId(videoInput);if(!nextVideoId){setVideoError(videoText.invalid);return;}setVideoId(nextVideoId);setVideoInput(nextVideoId);setVideoError("");}}>{videoText.apply}</button></div>{videoError&&<p id={`video-id-error-${song.id}`} role="alert" className="text-sm text-destructive">{videoError}</p>}{editorMessage&&<p role="status" className="text-sm text-muted-foreground">{editorMessage}</p>}{open&&<TranscriptTimingEditor videoId={videoId} lines={lines} onLinesChange={setLines}/>}<button disabled={saving} className="inline-flex items-center gap-2 rounded bg-primary px-3 py-2 text-primary-foreground disabled:cursor-not-allowed disabled:opacity-60" onClick={()=>void handleSave()}>{saving&&<Loader2 className="size-4 animate-spin" aria-hidden="true"/>}{saving?t("common.saving"):text.saveChanges}</button></div></details>;
}
