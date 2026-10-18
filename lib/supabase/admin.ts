import "server-only";

import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";

/** Server-only client for writes that must not be available through the public Data API. */
export function createSupabaseAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient<Database>(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
