"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { useLanguage } from "@/context/LanguageContext";

export default function ResetPasswordPage() {
  const router = useRouter();
  const { t } = useLanguage();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function updatePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (password !== confirmPassword) { setMessage(t("auth.reset.mismatch")); return; }
    const client = getSupabaseBrowserClient();
    if (!client) { setMessage(t("auth.error.supabase")); return; }
    setBusy(true);
    setMessage("");
    try {
      const { error } = await client.auth.updateUser({ password });
      if (error) setMessage(t("auth.reset.error"));
      else {
        setMessage(t("auth.reset.updated"));
        router.replace("/");
        router.refresh();
      }
    } catch {
      setMessage(t("auth.reset.error"));
    } finally {
      setBusy(false);
    }
  }

  return <main className="mx-auto w-full max-w-md flex-1 p-6">
    <h1 className="mb-5 text-2xl font-semibold">{t("auth.reset.title")}</h1>
    <form onSubmit={(event) => void updatePassword(event)}>
      <label className="mb-2 block text-sm" htmlFor="password">{t("auth.reset.newPassword")}</label>
      <div className="mb-3 flex gap-2">
        <input id="password" type={showPassword ? "text" : "password"} autoComplete="new-password" minLength={6} required value={password} onChange={(event) => setPassword(event.target.value)} className="min-w-0 flex-1 rounded border bg-background px-3 py-2" />
        <button type="button" className="rounded border px-3 text-sm" aria-pressed={showPassword} onClick={() => setShowPassword((shown) => !shown)}>{t(showPassword ? "auth.hidePassword" : "auth.showPassword")}</button>
      </div>
      <label className="mb-2 block text-sm" htmlFor="confirm-password">{t("auth.reset.confirmPassword")}</label>
      <input id="confirm-password" type={showPassword ? "text" : "password"} autoComplete="new-password" minLength={6} required value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} className="mb-4 w-full rounded border bg-background px-3 py-2" />
      <button type="submit" className="w-full rounded bg-primary px-4 py-2 text-primary-foreground" disabled={busy}>{t("auth.reset.save")}</button>
    </form>
    {message && <p className="mt-4 text-sm" role="status">{message}</p>}
  </main>;
}
