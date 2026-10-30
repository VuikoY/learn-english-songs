import Link from "next/link";
import Image from "next/image";
import { Crown } from "lucide-react";
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
  const highAccuracy = typeof song.averageAccuracy === "number" && song.averageAccuracy > 80;

  return <article className="overflow-hidden rounded-xl border bg-card shadow-sm">
    <Link href={`/song/${song.youtube_id}`}>
      <div className="relative aspect-video overflow-hidden rounded-t-lg">
        <Image src={song.thumbnail_url || `https://i.ytimg.com/vi/${song.youtube_id}/hqdefault.jpg`} alt="" width={480} height={360} unoptimized className="h-full w-full object-cover" />
        {(song.isCompleted || song.averageAccuracy !== undefined && song.averageAccuracy !== null) && (
          <div className="absolute right-2.5 top-2.5 z-10 flex flex-col items-end gap-1.5">
            {song.isCompleted && (
              <div className="flex items-center gap-1.5 rounded-full bg-black/30 px-2.5 py-1 drop-shadow-md backdrop-blur-sm">
                <span className="text-xs font-bold text-emerald-400" aria-label={t("catalog.completedBadge")}>✓</span>
                {song.completedDifficulty === "Hard" && (
                  <span className={`flex items-center gap-1 text-xs font-bold ${highAccuracy ? "text-emerald-400" : "text-amber-400"}`}>
                    <Crown className="size-3.5" aria-hidden="true" /> {difficultyLabel}
                  </span>
                )}
                {song.completedDifficulty === "Medium" && <span className={`text-xs font-semibold ${highAccuracy ? "text-emerald-400" : "text-blue-400"}`}>⚡ {difficultyLabel}</span>}
                {song.completedDifficulty === "Easy" && <span className="text-xs font-semibold text-emerald-400">{difficultyLabel}</span>}
              </div>
            )}
            {song.averageAccuracy !== undefined && song.averageAccuracy !== null && (
              <span
                aria-label={t("catalog.averageAccuracy", { percent: song.averageAccuracy })}
                className={`rounded-full bg-black/30 px-2.5 py-1 text-xs font-bold drop-shadow-md backdrop-blur-sm ${
                  song.averageAccuracy >= 80 ? "text-emerald-400" : "text-amber-300"
                }`}
              >
                🎯 {song.averageAccuracy}%
              </span>
            )}
          </div>
        )}
        {song.wordCount !== undefined && (
          <span className="absolute bottom-2.5 right-2.5 rounded-full bg-black/30 px-2.5 py-1 text-xs font-semibold text-white drop-shadow-md backdrop-blur-sm">
            {t("catalog.transcriptStats", { words: song.wordCount })}
          </span>
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
