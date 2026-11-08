import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

async function getAccountClient() {
  const db = await createSupabaseServerClient();
  if (!db) return { error: NextResponse.json({ code: "SERVICE_UNAVAILABLE" }, { status: 503 }) };
  const { data: { user }, error } = await db.auth.getUser();
  if (error || !user || user.is_anonymous) {
    return { error: NextResponse.json({ code: "AUTH_REQUIRED" }, { status: 401 }) };
  }
  return { db, user };
}

export async function GET(request: Request) {
  const db = await createSupabaseServerClient();
  if (!db) return NextResponse.json({ code: "SERVICE_UNAVAILABLE" }, { status: 503 });
  const { data: { user }, error: authError } = await db.auth.getUser();
  if (authError && authError.name !== "AuthSessionMissingError") {
    console.error("[api/word-collections] Could not verify session", { code: authError.code });
    return NextResponse.json({ code: "COLLECTIONS_FAILED" }, { status: 500 });
  }
  const account = user && !user.is_anonymous ? user : null;
  const scope = new URL(request.url).searchParams.get("scope");
  if (scope !== null && scope !== "public" && scope !== "mine") {
    return NextResponse.json({ code: "INVALID_SCOPE" }, { status: 400 });
  }
  let query = db
    .from("word_collections")
    .select("id,title,is_public,user_id,created_at");
  if (scope === "public") {
    query = query.eq("is_public", true);
  } else if (scope === "mine") {
    if (!account) return NextResponse.json({ code: "AUTH_REQUIRED" }, { status: 401 });
    query = query.eq("user_id", account.id);
  } else if (account) {
    query = query.or(`is_public.eq.true,user_id.eq.${account.id}`);
  } else {
    query = query.eq("is_public", true);
  }
  const { data, error: queryError } = await query.order("created_at", { ascending: false });
  if (queryError) {
    console.error("[api/word-collections] Could not list collections", { code: queryError.code });
    return NextResponse.json({ code: "COLLECTIONS_FAILED" }, { status: 500 });
  }

  const collections = (data ?? []).map(({ id, title, is_public: isPublic, user_id: ownerId }) => ({
    id,
    title,
    isPublic,
    isOwner: account?.id === ownerId,
  }));
  return NextResponse.json({ collections }, {
    headers: { "Cache-Control": "private, no-store" },
  });
}

export async function POST(request: Request) {
  const auth = await getAccountClient();
  if ("error" in auth) return auth.error;

  const body: unknown = await request.json().catch(() => null);
  const title = typeof body === "object" && body !== null && "title" in body && typeof body.title === "string"
    ? body.title.trim()
    : "";
  if (!title || title.length > 80) {
    return NextResponse.json({ code: "INVALID_TITLE" }, { status: 400 });
  }

  const { data, error } = await auth.db
    .from("word_collections")
    .insert({ user_id: auth.user.id, title })
    .select("id,title,is_public")
    .single();
  if (error || !data) {
    console.error("[api/word-collections] Could not create collection", { code: error?.code });
    return NextResponse.json({ code: "COLLECTION_CREATE_FAILED" }, { status: 500 });
  }

  return NextResponse.json({
    collection: { id: data.id, title: data.title, isPublic: data.is_public, isOwner: true },
  }, { status: 201 });
}
