import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const DIFFICULTIES = ["Easy", "Medium", "Hard"] as const;

export async function POST(request: Request) {
  const db = await createSupabaseServerClient();
  if (!db) return NextResponse.json({ error: "SUPABASE_UNAVAILABLE" }, { status: 503 });

  const { data: { user } } = await db.auth.getUser();
  if (!user || user.is_anonymous) {
    return NextResponse.json({ error: "AUTH_REQUIRED" }, { status: 401 });
  }

  const input = await request.json().catch(() => null) as {
    mediaId?: unknown;
    difficulty?: unknown;
    accuracy?: unknown;
    wordsCompleted?: unknown;
    totalWords?: unknown;
    mistakesCount?: unknown;
  } | null;

  if (
    !input ||
    typeof input.mediaId !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.mediaId) ||
    typeof input.difficulty !== "string" ||
    !DIFFICULTIES.includes(input.difficulty as typeof DIFFICULTIES[number]) ||
    typeof input.accuracy !== "number" ||
    !Number.isFinite(input.accuracy) ||
    input.accuracy < 0 ||
    input.accuracy > 100 ||
    !Number.isInteger(input.wordsCompleted) ||
    !Number.isInteger(input.totalWords) ||
    !Number.isInteger(input.mistakesCount) ||
    (input.wordsCompleted as number) < 0 ||
    (input.totalWords as number) < 1 ||
    (input.wordsCompleted as number) > (input.totalWords as number) ||
    (input.mistakesCount as number) < 0
  ) {
    return NextResponse.json({ error: "INVALID_PROGRESS" }, { status: 400 });
  }

  const difficulty = input.difficulty as typeof DIFFICULTIES[number];
  const accuracy = input.accuracy;
  const completed = accuracy >= 80;
  const { data: previous, error: lookupError } = await db
    .from("user_media_progress")
    .select("accuracy,words_completed,total_words,mistakes_count,is_completed,completed_at")
    .eq("user_id", user.id)
    .eq("media_id", input.mediaId)
    .eq("difficulty", difficulty)
    .maybeSingle();
  if (lookupError) {
    console.error("[api/media-progress] Progress lookup failed", lookupError);
    return NextResponse.json({ error: "PROGRESS_SAVE_FAILED" }, { status: 500 });
  }

  const useCurrentAttempt = !previous || accuracy >= previous.accuracy;
  const isCompleted = completed || previous?.is_completed === true;
  const { error: saveError } = await db.from("user_media_progress").upsert({
    user_id: user.id,
    media_id: input.mediaId,
    difficulty,
    accuracy: useCurrentAttempt ? accuracy : previous.accuracy,
    words_completed: useCurrentAttempt ? input.wordsCompleted as number : previous.words_completed,
    total_words: useCurrentAttempt ? input.totalWords as number : previous.total_words,
    mistakes_count: useCurrentAttempt ? input.mistakesCount as number : previous.mistakes_count,
    is_completed: isCompleted,
    completed_at: previous?.completed_at ?? (completed ? new Date().toISOString() : null),
  }, { onConflict: "user_id,media_id,difficulty" });

  if (saveError) {
    console.error("[api/media-progress] Progress save failed", saveError);
    return NextResponse.json({ error: "PROGRESS_SAVE_FAILED" }, { status: 500 });
  }

  return NextResponse.json({ saved: true, isCompleted });
}
