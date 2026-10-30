import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isValidVideoId } from "@/lib/youtube";
import type { Json } from "@/types/supabase";
import { isLanguage, isLearningLanguage, type Language, type LearningLanguage } from "@/types/game";

const MAX_TEXT_LENGTH = 500;

function isJsonObject(value: Json | undefined): value is { [key: string]: Json | undefined } {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cachedTranslation(line: Json | undefined, targetLang: Language): string | null {
  if (!isJsonObject(line) || !isJsonObject(line.translations)) return null;
  const translation = line.translations[targetLang];
  return typeof translation === "string" && translation.trim() ? translation : null;
}

function logDatabaseError(operation: string, error: { code?: string; status?: number }) {
  console.error("[translate] Supabase request failed", {
    operation,
    code: error.code ?? "unknown",
    status: error.status ?? null,
  });
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const input = (body ?? {}) as {
    text?: unknown;
    targetLang?: unknown;
    sourceLang?: unknown;
    videoId?: unknown;
    lineIndex?: unknown;
  };
  const text = typeof input.text === "string" ? input.text.trim() : "";
  if (!text || text.length > MAX_TEXT_LENGTH) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  if (!isLanguage(input.targetLang)) {
    return NextResponse.json({ error: "unsupported_language" }, { status: 400 });
  }
  if (input.sourceLang !== undefined && !isLearningLanguage(input.sourceLang)) {
    return NextResponse.json({ error: "unsupported_language" }, { status: 400 });
  }

  const targetLang = input.targetLang;
  let sourceLang: LearningLanguage = input.sourceLang ?? "en";
  const hasVideoId = input.videoId !== undefined;
  const hasLineIndex = input.lineIndex !== undefined;
  if (
    hasVideoId !== hasLineIndex ||
    (hasVideoId && (typeof input.videoId !== "string" || !isValidVideoId(input.videoId))) ||
    (hasLineIndex && (!Number.isInteger(input.lineIndex) || (input.lineIndex as number) < 0))
  ) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const videoId = hasVideoId ? input.videoId as string : null;
  const lineIndex = hasLineIndex ? input.lineIndex as number : null;
  let songId: string | null = null;
  let server = null;

  try {
    server = await createSupabaseServerClient();
  } catch (error) {
    console.error("[translate] Supabase client initialization failed", {
      errorType: error instanceof Error ? error.name : "UnknownError",
    });
  }

  if (server && videoId && lineIndex !== null) {
    try {
      const { data: song, error: songError } = await server
        .from("songs")
        .select("id,language")
        .eq("youtube_id", videoId)
        .maybeSingle();
      if (songError) {
        logDatabaseError("song_lookup", songError);
      } else if (song) {
        songId = song.id;
        if (isLearningLanguage(song.language)) sourceLang = song.language;

        const { data: transcript, error: transcriptError } = await server
          .from("transcripts")
          .select("lines_json")
          .eq("song_id", song.id)
          .maybeSingle();
        if (transcriptError) {
          logDatabaseError("transcript_lookup", transcriptError);
        } else if (transcript && Array.isArray(transcript.lines_json)) {
          const line = transcript.lines_json[lineIndex];
          if (isJsonObject(line) && line.text === text) {
            const cached = cachedTranslation(line, targetLang);
            if (cached) return NextResponse.json({ translation: cached, cached: true });
          }
        }
      }
    } catch (error) {
      console.error("[translate] Transcript cache lookup threw", {
        errorType: error instanceof Error ? error.name : "UnknownError",
      });
    }
  }

  let translation: string;
  if (sourceLang === targetLang) {
    translation = text;
  } else {
    const url = new URL("https://api.mymemory.translated.net/get");
    url.searchParams.set("q", text);
    url.searchParams.set("langpair", `${sourceLang}|${targetLang}`);

    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(8_000), cache: "no-store" });
      const result: unknown = await response.json();
      const providerResult = typeof result === "object" && result !== null
        ? result as { responseData?: unknown; responseStatus?: unknown }
        : null;
      const responseData = providerResult?.responseData;
      const translatedText = typeof responseData === "object" && responseData !== null
        ? (responseData as { translatedText?: unknown }).translatedText
        : null;
      if (!response.ok || providerResult?.responseStatus !== 200 || typeof translatedText !== "string" || !translatedText.trim()) {
        console.error("[translate] Provider returned an invalid response", { status: response.status });
        return NextResponse.json({ error: "translation_unavailable" }, { status: 502 });
      }
      translation = translatedText.trim();
    } catch (error) {
      console.error("[translate] Provider request failed", {
        errorType: error instanceof Error ? error.name : "UnknownError",
      });
      return NextResponse.json({ error: "translation_unavailable" }, { status: 502 });
    }
  }

  if (songId && lineIndex !== null) {
    try {
      const admin = createSupabaseAdminClient();
      if (!admin) {
        console.warn("[translate] Transcript cache write is unavailable because Supabase admin access is not configured");
      } else {
        const { data: transcript, error } = await admin
          .from("transcripts")
          .select("id,lines_json")
          .eq("song_id", songId)
          .maybeSingle();
        if (error) {
          logDatabaseError("transcript_save_lookup", error);
        } else if (transcript && Array.isArray(transcript.lines_json)) {
          const lines = [...transcript.lines_json];
          const line = lines[lineIndex];
          if (isJsonObject(line) && line.text === text) {
            const cached = cachedTranslation(line, targetLang);
            if (cached) return NextResponse.json({ translation: cached, cached: true });
            const translations = isJsonObject(line.translations) ? line.translations : {};
            lines[lineIndex] = { ...line, translations: { ...translations, [targetLang]: translation } };
            const { error: saveError } = await admin
              .from("transcripts")
              .update({ lines_json: lines })
              .eq("id", transcript.id);
            if (saveError) logDatabaseError("transcript_translation_save", saveError);
          }
        }
      }
    } catch (error) {
      console.error("[translate] Transcript cache save threw", {
        errorType: error instanceof Error ? error.name : "UnknownError",
      });
    }
  }

  return NextResponse.json({ translation, cached: false });
}
