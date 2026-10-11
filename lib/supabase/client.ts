"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

let browserClient: SupabaseClient | null = null;
let anonymousUserPromise: Promise<SupabaseClient | null> | null = null;

export function getSupabaseBrowserClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;

  browserClient ??= createBrowserClient(url, key);
  return browserClient;
}

/** Returns a persisted anonymous account, or null when Supabase/Auth is unavailable. */
export async function getSupabaseUserClient(): Promise<SupabaseClient | null> {
  if (anonymousUserPromise) return anonymousUserPromise;
  anonymousUserPromise = (async () => {
    try {
      const client = getSupabaseBrowserClient();
      if (!client) return null;
      const { data: { session }, error: sessionError } = await client.auth.getSession();
      if (session && !sessionError) return client;
      const { data, error } = await client.auth.signInAnonymously();
      return error || !data.session ? null : client;
    } catch {
      return null;
    }
  })();
  const result = await anonymousUserPromise;
  if (!result) anonymousUserPromise = null;
  return result;
}
