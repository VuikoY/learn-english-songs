// app/api/transcript/route.ts
// GET /api/transcript?videoId=XXXXXXXXXXX&lang=en -> LyricLine[]
// lang is the song language. Transcript lines are cleaned before being returned.

import { NextResponse } from "next/server";
import { YoutubeTranscript } from "youtube-transcript";
import { cleanTranscript } from "@/lib/utils/cleanTranscript";
import { isValidVideoId } from "@/lib/youtube";
import type { LyricLine } from "@/lib/types";
import { isLanguage } from "@/types/game";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const videoId = params.get("videoId");
  const lang = params.get("lang") ?? "en";

  if (!videoId || !isValidVideoId(videoId)) {
    return NextResponse.json({ error: "Некорректный videoId." }, { status: 400 });
  }
  if (!isLanguage(lang)) {
    return NextResponse.json({ error: "Неподдерживаемый язык песни." }, { status: 400 });
  }

  try {
    let supabase: Awaited<ReturnType<typeof createSupabaseServerClient>> = null;
    try { supabase = await createSupabaseServerClient(); } catch { /* Fall through to YouTube. */ }
    if (supabase) {
      try {
        const { data } = await supabase
          .from("transcripts")
          .select("lines_json")
          .eq("video_id", videoId)
          .eq("language", lang)
          .maybeSingle();
        if (data && Array.isArray(data.lines_json)) return NextResponse.json(data.lines_json);
      } catch { /* Cache miss or database unavailable: retrieve from YouTube. */ }
    }

    const items = await YoutubeTranscript.fetchTranscript(videoId, { lang });

    if (items.length === 0) {
      return NextResponse.json({ error: "В этом видео нет субтитров." }, { status: 404 });
    }

    // Depending on the library version, timestamps may be in seconds or milliseconds.
    // Subtitle lines usually last 1–10 seconds, so a median above 30 indicates milliseconds.
    const durations = items.map((i) => i.duration).sort((a, b) => a - b);
    const median = durations[Math.floor(durations.length / 2)];
    const divider = median > 30 ? 1000 : 1;

    const rawLines: LyricLine[] = items.map((item) => ({
      text: item.text,
      start: item.offset / divider,
      duration: item.duration / divider,
    }));

    // Decode entities and remove markers such as [Music] and (Laughter).
    const lines = cleanTranscript(rawLines);

    if (lines.length === 0) {
      return NextResponse.json({ error: "После очистки субтитров не осталось текста." }, { status: 404 });
    }

    if (supabase) {
      try {
        await supabase.from("transcripts").upsert(
          { video_id: videoId, language: lang, lines_json: lines },
          { onConflict: "video_id,language" },
        );
      } catch { /* Do not fail transcript delivery when cache writes fail. */ }
    }
    return NextResponse.json(lines);
  } catch (error) {
    console.error("Transcript error:", error);
    return NextResponse.json(
      {
        error:
          "Не удалось получить субтитры. Возможно, в видео нет субтитров на выбранном языке или они отключены.",
      },
      { status: 404 },
    );
  }
}
