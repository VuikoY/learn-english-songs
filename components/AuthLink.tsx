"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { ChevronDown, UserRound } from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { useAuthState } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { PAGE_TEXT } from "@/lib/i18n/pages";

export default function AuthLink() {
  const router = useRouter();
  const { userId, loading } = useAuthState();
  const { uiLanguage } = useLanguage();
  const text = PAGE_TEXT[uiLanguage];
  const menuRef = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    function closeOutside(event: PointerEvent) {
      if (event.target instanceof Node && !menuRef.current?.contains(event.target)) menuRef.current?.removeAttribute("open");
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") menuRef.current?.removeAttribute("open");
    }
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  if (loading) return <span className="size-9" aria-hidden="true" />;
  if (!userId) return <Link href="/auth" className="rounded-md border px-3 py-2 text-sm font-medium hover:bg-muted">{text.registerLogin}</Link>;

  async function signOut() {
    await getSupabaseBrowserClient()?.auth.signOut();
    menuRef.current?.removeAttribute("open");
    router.replace("/");
    router.refresh();
  }

  return <details ref={menuRef} className="relative">
    <summary aria-label={text.userMenu} className="flex size-9 cursor-pointer list-none items-center justify-center gap-1 rounded-full border hover:bg-muted [&::-webkit-details-marker]:hidden">
      <UserRound className="size-4" aria-hidden="true" />
      <ChevronDown className="size-3" aria-hidden="true" />
    </summary>
    <div className="absolute right-0 z-50 mt-2 w-52 rounded-xl border bg-background p-1.5 shadow-lg">
      <Link href="/auth/reset-password" onClick={() => menuRef.current?.removeAttribute("open")} className="block rounded-md px-3 py-2 text-sm hover:bg-muted">{text.changePassword}</Link>
      <Link href="/dashboard" onClick={() => menuRef.current?.removeAttribute("open")} className="block rounded-md px-3 py-2 text-sm hover:bg-muted">{text.mySongs}</Link>
      <button type="button" onClick={() => void signOut()} className="block w-full rounded-md px-3 py-2 text-left text-sm text-destructive hover:bg-muted">{text.signOut}</button>
    </div>
  </details>;
}
