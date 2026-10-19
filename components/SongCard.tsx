import Link from "next/link";
import FavoriteButton from "@/components/FavoriteButton";
import type { CatalogSong } from "@/components/SongCatalog";
import type { songMetadataLabels } from "@/lib/songMetadata";

type MetadataLabels = ReturnType<typeof songMetadataLabels>;

export default function SongCard({ song, labels }: { song: CatalogSong; labels: MetadataLabels }) {
  return <article className="overflow-hidden rounded-xl border bg-card shadow-sm">
    <Link href={`/song/${song.youtube_id}`}>
      <img src={song.thumbnail_url || `https://i.ytimg.com/vi/${song.youtube_id}/hqdefault.jpg`} alt="" className="aspect-video w-full object-cover" />
      <div className="p-4">
        <h2 className="font-semibold">{song.title}</h2>
        <span className="sr-only">{labels.genres[song.genre]}, {labels.difficulties[song.difficulty]}</span>
      </div>
    </Link>
    <div className="flex items-center gap-2 px-4 pb-4">
      <span className="rounded-full border px-2 py-1 text-xs text-muted-foreground">{labels.genres[song.genre]}</span>
      <span className="rounded-full border px-2 py-1 text-xs text-muted-foreground">{labels.difficulties[song.difficulty]}</span>
      <FavoriteButton songId={song.id} compact />
    </div>
  </article>;
}
