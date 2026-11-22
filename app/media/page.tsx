import { Suspense } from "react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import SongCatalog, { type CatalogSong } from "@/components/SongCatalog";
import { fetchMediaCompletion } from "@/lib/mediaProgress";
import { fetchSongTranscriptStats } from "@/lib/songTranscriptStats";

export default function CatalogPage() {
  return (
    <Suspense fallback={<main className="mx-auto w-full max-w-6xl py-8" aria-busy="true" />}>
      <CatalogPageContent />
    </Suspense>
  );
}

async function CatalogPageContent() {
  const supabase = await createSupabaseServerClient();
  let songs: CatalogSong[] = [];
  if (supabase) {
    const { data, error } = await supabase.from("songs").select("id,youtube_id,title,thumbnail_url,language,genre,difficulty,content_type").eq("is_public", true).order("created_at", { ascending: false });
    if (error) {
      console.error("[catalog] Could not load songs with metadata columns; trying legacy schema.", error.code);
      const legacy = await supabase.from("songs").select("id,youtube_id,title,thumbnail_url,language").eq("is_public", true).order("created_at", { ascending: false });
      if (legacy.error) console.error("[catalog] Legacy song query failed.", legacy.error.code);
      songs = (legacy.data ?? []).map((song) => ({ ...song, genre: "other" as const, difficulty: "intermediate" as const, content_type: "music_video" as const }));
    } else {
      songs = (data ?? []) as unknown as CatalogSong[];
    }

    try {
      const transcriptStats = await fetchSongTranscriptStats(supabase, songs.map((song) => song.id));
      songs = songs.map((song) => ({ ...song, ...transcriptStats[song.id] }));
    } catch (statsError) {
      console.error("[catalog] Could not load transcript counts.", statsError);
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError) {
      console.error("[catalog] Could not identify current user for completion badges.", authError);
    } else if (user && !user.is_anonymous && songs.length) {
      try {
        const completion = await fetchMediaCompletion(supabase, user.id, songs.map((song) => song.id));
        songs = songs.map((song) => ({
          ...song,
          isCompleted: completion[song.id]?.isCompleted ?? false,
          completedDifficulty: completion[song.id]?.completedDifficulty ?? null,
          averageAccuracy: completion[song.id]?.averageAccuracy ?? null,
        }));
      } catch (progressError) {
        console.error("[catalog] Could not load server-rendered completion badges.", progressError);
      }
    }
  }
  return <SongCatalog songs={songs} />;
}
