// app/api/transcript/route.ts
// GET /api/transcript?videoId=XXXXXXXXXXX  ->  LyricLine[]
// Бере англійські субтитри YouTube-відео і перетворює їх на наш формат LyricLine.

import { NextResponse } from "next/server";
import { YoutubeTranscript } from "youtube-transcript";
import type { LyricLine } from "@/lib/types";

// Субтитри часто приходять з HTML-сутностями (&#39; замість ') — виправляємо
function decodeEntities(text: string): string {
  return text
    .replace(/&amp;#39;|&#39;/g, "'")
    .replace(/&amp;quot;|&quot;/g, '"')
    .replace(/&amp;amp;|&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

// Прибирає службові позначки в квадратних дужках: [music], [Applause] тощо,
// де б вони не стояли в рядку. Зайві пробіли після вирізання теж чистимо.
// "Forever [music] trusting in who we are" -> "Forever trusting in who we are"
function stripTags(text: string): string {
  return text
    .replace(/\[[^\]]*\]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export async function GET(request: Request) {
  const videoId = new URL(request.url).searchParams.get("videoId");

  if (!videoId || !/^[\w-]{11}$/.test(videoId)) {
    return NextResponse.json({ error: "Некоректний videoId" }, { status: 400 });
  }

  try {
    const items = await YoutubeTranscript.fetchTranscript(videoId, { lang: "en" });

    if (items.length === 0) {
      return NextResponse.json({ error: "У цього відео порожні субтитри" }, { status: 404 });
    }

    // Залежно від версії бібліотеки час приходить у секундах або в мілісекундах.
    // Рядок субтитрів триває 1–10 с, тож якщо медіана > 30 — це мілісекунди.
    const durations = items.map((i) => i.duration).sort((a, b) => a - b);
    const median = durations[Math.floor(durations.length / 2)];
    const divider = median > 30 ? 1000 : 1;

    const lines: LyricLine[] = items
      .map((item) => ({
        text: stripTags(decodeEntities(item.text)),
        start: item.offset / divider,
        duration: item.duration / divider,
      }))
      // Якщо після очищення рядок порожній (там було лише [music]) — викидаємо його
      .filter((line) => line.text !== "");

    return NextResponse.json(lines);
  } catch (error) {
    console.error("Transcript error:", error);
    return NextResponse.json(
      {
        error:
          "Не вдалося отримати субтитри. Імовірно, у відео немає англійських субтитрів або вони вимкнені.",
      },
      { status: 404 },
    );
  }
}
