import Link from "next/link";
import Image from "next/image";
import FavoriteButton from "@/components/FavoriteButton";
import type { CatalogSong } from "@/components/SongCatalog";
import type { songMetadataLabels } from "@/lib/songMetadata";
import { useLanguage } from "@/context/LanguageContext";

type MetadataLabels = ReturnType<typeof songMetadataLabels>;

export default function SongCard({ song, labels }: { song: CatalogSong; labels: MetadataLabels }) {
  const { t } = useLanguage();
  const difficultyLabel = song.completedDifficulty
    ? t(`game.difficulty.${song.completedDifficulty.toLowerCase() as "easy" | "medium" | "hard"}`)
    : null;

  return <article className="overflow-hidden rounded-xl border bg-card shadow-sm">
    <Link href={`/song/${song.youtube_id}`}>
      <div className="relative aspect-video overflow-hidden rounded-t-lg">
        <Image src={song.thumbnail_url || `https://i.ytimg.com/vi/${song.youtube_id}/hqdefault.jpg`} alt="" width={480} height={360} unoptimized className="h-full w-full object-cover" />
        {song.isCompleted && (
          <div
            className="absolute right-2.5 top-2.5 z-10 flex items-center gap-1.5 rounded-full border border-neutral-700/60 bg-black/70 px-2.5 py-1 shadow-lg backdrop-blur-md"
            style={{ position: "absolute", top: "0.625rem", right: "0.625rem", zIndex: 10 }}
          >
            <span className="text-xs font-bold text-emerald-400" aria-label={t("catalog.completedBadge")}>✓</span>
            {song.completedDifficulty === "Hard" && <span className="flex items-center gap-1 text-xs font-bold text-amber-400">👑 {difficultyLabel}</span>}
            {song.completedDifficulty === "Medium" && <span className="text-xs font-semibold text-blue-400">⚡ {difficultyLabel}</span>}
            {song.completedDifficulty === "Easy" && <span className="text-xs font-semibold text-emerald-400">{difficultyLabel}</span>}
          </div>
        )}
      </div>
      <div className="p-4">
        <h2 className="break-words font-semibold">{song.title}</h2>
        <span className="sr-only">{labels.genres[song.genre]}, {labels.difficulties[song.difficulty]}</span>
      </div>
    </Link>
    <div className="flex flex-wrap items-center gap-2 px-4 pb-4">
      <span className="rounded-full border px-2 py-1 text-xs text-muted-foreground">{labels.genres[song.genre]}</span>
      <span className="rounded-full border px-2 py-1 text-xs text-muted-foreground">{labels.difficulties[song.difficulty]}</span>
      <span className="ml-auto"><FavoriteButton songId={song.id} compact /></span>
    </div>
  </article>;
}
