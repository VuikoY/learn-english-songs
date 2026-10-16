"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

let browserClient: SupabaseClient | null = null;

export function getSupabaseBrowserClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;

  browserClient ??= createBrowserClient(url, key);
  return browserClient;
}

/** Returns the configured browser client. Personal rows require a real signed-in user. */
export async function getSupabaseUserClient(): Promise<SupabaseClient | null> {
  return getSupabaseBrowserClient();
}
