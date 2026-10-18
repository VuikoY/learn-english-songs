"use client";

import Link from "next/link";
import FavoriteButton from "@/components/FavoriteButton";
import { useLanguage } from "@/context/LanguageContext";
import { PAGE_TEXT } from "@/lib/i18n/pages";

export type CatalogSong = { id: string; youtube_id: string; title: string; artist: string | null; thumbnail_url: string | null; language: string };

export default function SongCatalog({ songs }: { songs: CatalogSong[] }) {
  const { sourceLanguage, uiLanguage } = useLanguage();
  const text = PAGE_TEXT[uiLanguage];
  const filteredSongs = songs.filter((song) => song.language === sourceLanguage);
  return <main className="mx-auto w-full max-w-6xl px-4 py-10">
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4"><div><h1 className="text-3xl font-bold">{text.catalogTitle}</h1><p className="mt-2 text-muted-foreground">{text.catalogSubtitle}</p></div><Link href="/dashboard" className="rounded-md bg-primary px-4 py-2 text-primary-foreground">{text.addSong}</Link></div>
    {filteredSongs.length ? <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{filteredSongs.map(song => <article key={song.id} className="overflow-hidden rounded-xl border bg-card shadow-sm"><Link href={`/song/${song.youtube_id}`}><img src={song.thumbnail_url || `https://i.ytimg.com/vi/${song.youtube_id}/hqdefault.jpg`} alt="" className="aspect-video w-full object-cover"/><div className="p-4"><h2 className="font-semibold">{song.title}</h2><p className="text-sm text-muted-foreground">{song.artist || text.youtube}</p></div></Link><div className="px-4 pb-4"><FavoriteButton songId={song.id}/></div></article>)}</div> : <div className="rounded-xl border border-dashed p-10 text-center text-muted-foreground">{text.emptyCatalog} <Link className="text-primary underline" href="/dashboard">{text.addFirst}</Link>.</div>}
  </main>;
}
