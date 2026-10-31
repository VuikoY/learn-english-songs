import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Context = { params: Promise<{ collectionId: string }> };
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

async function getAccountClient() {
  const db = await createSupabaseServerClient();
  if (!db) return { error: NextResponse.json({ code: "SERVICE_UNAVAILABLE" }, { status: 503 }) };
  const { data: { user }, error } = await db.auth.getUser();
  if (error || !user || user.is_anonymous) {
    return { error: NextResponse.json({ code: "AUTH_REQUIRED" }, { status: 401 }) };
  }
  return { db, user };
}

export async function POST(request: Request, { params }: Context) {
  const auth = await getAccountClient();
  if ("error" in auth) return auth.error;
  const { collectionId } = await params;
  if (!UUID_PATTERN.test(collectionId)) return NextResponse.json({ code: "INVALID_COLLECTION" }, { status: 400 });

  const body: unknown = await request.json().catch(() => null);
  const record = typeof body === "object" && body !== null ? body as Record<string, unknown> : null;
  if (
    !record ||
    typeof record.songId !== "string" ||
    !UUID_PATTERN.test(record.songId) ||
    typeof record.lineText !== "string" ||
    !record.lineText.trim() ||
    record.lineText.length > 2000 ||
    typeof record.startTime !== "number" ||
    !Number.isFinite(record.startTime) ||
    record.startTime < 0 ||
    typeof record.endTime !== "number" ||
    !Number.isFinite(record.endTime) ||
    record.endTime <= record.startTime
  ) {
    return NextResponse.json({ code: "INVALID_ITEM" }, { status: 400 });
  }

  const { data, error } = await auth.db
    .from("collection_items")
    .insert({
      collection_id: collectionId,
      user_id: auth.user.id,
      song_id: record.songId,
      line_text: record.lineText.trim(),
      start_time: record.startTime,
      end_time: record.endTime,
    })
    .select("id")
    .single();
  if (error || !data) {
    console.error("[api/word-collections] Could not save collection item", { code: error?.code });
    return NextResponse.json({ code: "ITEM_SAVE_FAILED" }, { status: 500 });
  }
  return NextResponse.json({ id: data.id }, { status: 201 });
}

export async function DELETE(request: Request, { params }: Context) {
  const auth = await getAccountClient();
  if ("error" in auth) return auth.error;
  const { collectionId } = await params;
  if (!UUID_PATTERN.test(collectionId)) return NextResponse.json({ code: "INVALID_COLLECTION" }, { status: 400 });
  const body: unknown = await request.json().catch(() => null);
  const itemId = typeof body === "object" && body !== null && "itemId" in body && typeof body.itemId === "string"
    ? body.itemId
    : "";
  if (!UUID_PATTERN.test(itemId)) return NextResponse.json({ code: "INVALID_ITEM" }, { status: 400 });

  const { data, error } = await auth.db
    .from("collection_items")
    .delete()
    .eq("id", itemId)
    .eq("collection_id", collectionId)
    .eq("user_id", auth.user.id)
    .select("id")
    .maybeSingle();
  if (error || !data) {
    if (error) console.error("[api/word-collections] Could not delete collection item", { code: error.code });
    return NextResponse.json({ code: "ITEM_DELETE_FAILED" }, { status: error ? 500 : 404 });
  }
  return NextResponse.json({ deleted: true });
}
