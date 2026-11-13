import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const PERIODS = ["7d", "30d", "all"] as const;

export async function GET(request: Request) {
  const periodParam = new URL(request.url).searchParams.get("period") ?? "7d";
  const period = PERIODS.find((value) => value === periodParam);
  if (!period) {
    return NextResponse.json({ error: "INVALID_PERIOD" }, { status: 400 });
  }

  const db = await createSupabaseServerClient();
  if (!db) return NextResponse.json({ error: "SERVICE_UNAVAILABLE" }, { status: 503 });

  const { data: { user } } = await db.auth.getUser();
  if (!user || user.is_anonymous) return NextResponse.json({ error: "AUTH_REQUIRED" }, { status: 401 });

  const { data, error } = await db.rpc("get_learning_daily_stats", { p_period: period });
  if (error) {
    console.error("[api/stats/daily] Daily activity lookup failed", { code: error.code });
    return NextResponse.json({ error: "ACTIVITY_LOOKUP_FAILED" }, { status: 500 });
  }

  return NextResponse.json({
    data: (data ?? []).map((row) => ({ date: row.activity_date, wordsCount: row.words_count })),
  }, { headers: { "Cache-Control": "private, no-store" } });
}
