import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const SOURCES = ["media", "collection", "phrase-mix"] as const;
const MAX_WORDS_PER_SESSION = 100_000;

export async function GET() {
  const db = await createSupabaseServerClient();
  if (!db) return NextResponse.json({ error: "SERVICE_UNAVAILABLE" }, { status: 503 });

  const { data: { user } } = await db.auth.getUser();
  if (!user || user.is_anonymous) return NextResponse.json({ error: "AUTH_REQUIRED" }, { status: 401 });

  const { data, error } = await db.rpc("get_learning_word_totals");
  if (error || !data?.[0]) {
    console.error("[api/learning-activity] Word totals lookup failed", { code: error?.code });
    return NextResponse.json({ error: "ACTIVITY_LOOKUP_FAILED" }, { status: 500 });
  }

  return NextResponse.json({
    wordsCovered: data[0].words_covered,
    wordsToday: data[0].words_today,
  }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request: Request) {
  const db = await createSupabaseServerClient();
  if (!db) return NextResponse.json({ error: "SERVICE_UNAVAILABLE" }, { status: 503 });

  const { data: { user } } = await db.auth.getUser();
  if (!user || user.is_anonymous) return NextResponse.json({ error: "AUTH_REQUIRED" }, { status: 401 });

  const input = await request.json().catch(() => null) as {
    sessionId?: unknown;
    source?: unknown;
    wordsCovered?: unknown;
  } | null;

  if (
    !input ||
    typeof input.sessionId !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.sessionId) ||
    typeof input.source !== "string" ||
    !SOURCES.includes(input.source as typeof SOURCES[number]) ||
    !Number.isInteger(input.wordsCovered) ||
    (input.wordsCovered as number) < 0 ||
    (input.wordsCovered as number) > MAX_WORDS_PER_SESSION
  ) {
    return NextResponse.json({ error: "INVALID_ACTIVITY" }, { status: 400 });
  }

  const { error } = await db.rpc("save_learning_activity", {
    p_session_id: input.sessionId,
    p_source: input.source,
    p_words_covered: input.wordsCovered as number,
  });
  if (error) {
    console.error("[api/learning-activity] Activity save failed", { code: error.code });
    return NextResponse.json({ error: "ACTIVITY_SAVE_FAILED" }, { status: 500 });
  }

  return NextResponse.json({ saved: true }, { headers: { "Cache-Control": "private, no-store" } });
}
