import { createSupabaseServerClient } from "@/lib/supabase/server";
import SongCatalog, { type CatalogSong } from "@/components/SongCatalog";

export default async function CatalogPage() {
  const supabase = await createSupabaseServerClient();
  let songs: CatalogSong[] = [];
  if (supabase) {
    const { data } = await supabase.from("songs").select("id,youtube_id,title,artist,thumbnail_url,language").eq("is_public", true).order("created_at", { ascending: false });
    songs = (data ?? []) as CatalogSong[];
  }
  return <SongCatalog songs={songs} />;
}
