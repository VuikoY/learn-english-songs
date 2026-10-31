import { NextResponse } from "next/server";
import { findLrclibTrack, LrclibProviderError, parseLrcLyrics } from "@/lib/lrclib";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const title = params.get("title")?.trim();
  const artist = params.get("artist")?.trim() ?? "";
  if (!title || title.length > 200 || artist.length > 200) {
    return NextResponse.json({ error: "invalid_title" }, { status: 400 });
  }

  try {
    const track = await findLrclibTrack(title, artist);
    if (!track) return NextResponse.json({ error: "lyrics_not_found" }, { status: 404 });

    const syncedLines = track.syncedLyrics ? parseLrcLyrics(track.syncedLyrics) : [];
    if (syncedLines.length > 0) {
      return NextResponse.json({ kind: "synced", lines: syncedLines });
    }

    const plainLyrics = track.plainLyrics?.trim();
    if (plainLyrics) return NextResponse.json({ kind: "plain", plainLyrics: plainLyrics.slice(0, 30_000) });

    return NextResponse.json({ error: "lyrics_not_found" }, { status: 404 });
  } catch (error) {
    console.error("[lrclib] Lyrics lookup failed", {
      errorType: error instanceof Error ? error.name : "UnknownError",
      upstreamStatus: error instanceof LrclibProviderError ? error.status : null,
    });
    const status = error instanceof LrclibProviderError && error.status < 500 ? 502 : 503;
    return NextResponse.json({ error: "provider_unavailable" }, { status });
  }
}
