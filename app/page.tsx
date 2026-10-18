import { createSupabaseServerClient } from "@/lib/supabase/server";
import SongCatalog, { type CatalogSong } from "@/components/SongCatalog";

export default async function CatalogPage() {
  const supabase = await createSupabaseServerClient();
  let songs: CatalogSong[] = [];
  if (supabase) {
    const { data, error } = await supabase.from("songs").select("id,youtube_id,title,artist,thumbnail_url,language,genre,difficulty").eq("is_public", true).order("created_at", { ascending: false });
    if (error) {
      console.error("[catalog] Could not load songs with metadata columns; trying legacy schema.", error.code);
      const legacy = await supabase.from("songs").select("id,youtube_id,title,artist,thumbnail_url,language").eq("is_public", true).order("created_at", { ascending: false });
      if (legacy.error) console.error("[catalog] Legacy song query failed.", legacy.error.code);
      songs = (legacy.data ?? []).map((song) => ({ ...song, genre: "other" as const, difficulty: "intermediate" as const }));
    } else {
      songs = (data ?? []) as unknown as CatalogSong[];
    }
  }
  return <SongCatalog songs={songs} />;
}
