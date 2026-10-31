import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Context = { params: Promise<{ collectionId: string }> };
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export async function PATCH(request: Request, { params }: Context) {
  const db = await createSupabaseServerClient();
  if (!db) return NextResponse.json({ code: "SERVICE_UNAVAILABLE" }, { status: 503 });

  const { data: { user }, error: authError } = await db.auth.getUser();
  if (authError || !user || user.is_anonymous) {
    return NextResponse.json({ code: "AUTH_REQUIRED" }, { status: 401 });
  }

  const { collectionId } = await params;
  if (!UUID_PATTERN.test(collectionId)) {
    return NextResponse.json({ code: "INVALID_COLLECTION" }, { status: 400 });
  }

  const body: unknown = await request.json().catch(() => null);
  if (typeof body !== "object" || body === null || !("isPublic" in body) || typeof body.isPublic !== "boolean") {
    return NextResponse.json({ code: "INVALID_VISIBILITY" }, { status: 400 });
  }

  const { data, error } = await db
    .from("word_collections")
    .update({ is_public: body.isPublic })
    .eq("id", collectionId)
    .eq("user_id", user.id)
    .select("id,is_public")
    .maybeSingle();

  if (error || !data) {
    if (error) console.error("[api/word-collections] Could not update collection visibility", { code: error.code });
    return NextResponse.json(
      { code: error ? "VISIBILITY_UPDATE_FAILED" : "COLLECTION_NOT_FOUND" },
      { status: error ? 500 : 404 },
    );
  }

  return NextResponse.json({ isPublic: data.is_public });
}
