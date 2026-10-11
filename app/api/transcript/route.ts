// app/api/transcript/route.ts
// GET /api/transcript?videoId=XXXXXXXXXXX&lang=en  ->  LyricLine[]
// lang — мова пісні. Субтитри очищаємо (cleanTranscript). Кеш поки що клієнтський (transcriptCache).

import { NextResponse } from "next/server";
import { YoutubeTranscript } from "youtube-transcript";
import { cleanTranscript } from "@/lib/utils/cleanTranscript";
import { isValidVideoId } from "@/lib/youtube";
import type { LyricLine } from "@/lib/types";
import { isLanguage } from "@/types/game";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const videoId = params.get("videoId");
  const lang = params.get("lang") ?? "en";

  if (!videoId || !isValidVideoId(videoId)) {
    return NextResponse.json({ error: "Некоректний videoId" }, { status: 400 });
  }
  if (!isLanguage(lang)) {
    return NextResponse.json({ error: "Непідтримувана мова пісні" }, { status: 400 });
  }

  try {
    const items = await YoutubeTranscript.fetchTranscript(videoId, { lang });

    if (items.length === 0) {
      return NextResponse.json({ error: "У цього відео порожні субтитри" }, { status: 404 });
    }

    // Залежно від версії бібліотеки час приходить у секундах або в мілісекундах.
    // Рядок субтитрів триває 1–10 с, тож якщо медіана > 30 — це мілісекунди.
    const durations = items.map((i) => i.duration).sort((a, b) => a - b);
    const median = durations[Math.floor(durations.length / 2)];
    const divider = median > 30 ? 1000 : 1;

    const rawLines: LyricLine[] = items.map((item) => ({
      text: item.text,
      start: item.offset / divider,
      duration: item.duration / divider,
    }));

    // Декодування сутностей + видалення [Music], (Laughter) тощо (див. lib/utils/cleanTranscript.ts)
    const lines = cleanTranscript(rawLines);

    if (lines.length === 0) {
      return NextResponse.json({ error: "Після очищення субтитрів не лишилось тексту" }, { status: 404 });
    }

    return NextResponse.json(lines);
  } catch (error) {
    console.error("Transcript error:", error);
    return NextResponse.json(
      {
        error:
          "Не вдалося отримати субтитри. Імовірно, у відео немає субтитрів обраною мовою пісні або вони вимкнені.",
      },
      { status: 404 },
    );
  }
}
