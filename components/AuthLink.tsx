"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { useLanguage } from "@/context/LanguageContext";

export default function AuthLink() {
  const router = useRouter();
  const { t } = useLanguage();
  const [email, setEmail] = useState<string | null>(null);
  useEffect(() => {
    const client = getSupabaseBrowserClient();
    if (!client) return;
    void client.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null));
    const { data: { subscription } } = client.auth.onAuthStateChange((_event, session) => setEmail(session?.user.email ?? null));
    return () => subscription.unsubscribe();
  }, []);
  if (!email) return <Link href="/auth" className="rounded border px-3 py-1.5 text-sm">{t("auth.signin")}</Link>;
  return <button className="rounded border px-3 py-1.5 text-sm" onClick={async () => {
    await getSupabaseBrowserClient()?.auth.signOut();
    router.replace("/");
  }}>{t("auth.signout")}</button>;
}
