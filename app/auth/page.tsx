"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { useLanguage } from "@/context/LanguageContext";

function AuthPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t } = useLanguage();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function signIn(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const client = getSupabaseBrowserClient();
    if (!client) { setMessage(t("auth.error.supabase")); return; }
    setBusy(true);
    setMessage("");
    try {
      const { error } = await client.auth.signInWithPassword({ email: email.trim(), password });
      if (error) {
        console.error("[auth.signin] Password sign-in rejected", {
          category: "supabase_auth_error", name: error.name, code: error.code ?? null, status: error.status ?? null,
        });
        setMessage(t("auth.error.signin"));
      }
      else router.replace("/");
    } catch {
      console.error("[auth.signin] Password sign-in request failed", {
        category: "request_error", name: "RequestError",
      });
      setMessage(t("auth.error.unavailable"));
    } finally {
      setBusy(false);
    }
  }

  async function signUp(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const client = getSupabaseBrowserClient();
    if (!client) { setMessage(t("auth.error.supabase")); return; }
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const result = await response.json() as { confirmationRequired?: boolean; failure?: string };
      if (!response.ok) {
        const messageKey = result.failure === "invalid_input" ? "auth.error.signup.invalid"
          : result.failure === "weak_password" ? "auth.error.signup.weak"
            : result.failure === "signup_disabled" ? "auth.error.signup.disabled"
              : result.failure === "email_rate_limit" ? "auth.error.signup.rate"
                : "auth.error.signup";
        setMessage(t(messageKey));
      } else if (!result.confirmationRequired) {
        await client.auth.getSession();
        router.replace("/");
      } else {
        setMessage(t("auth.signup.sent"));
      }
    } catch {
      setMessage(t("auth.error.unavailable"));
    } finally {
      setBusy(false);
    }
  }

  async function signInWithGoogle() {
    const client = getSupabaseBrowserClient();
    if (!client) { setMessage(t("auth.error.supabase")); return; }
    setBusy(true);
    setMessage("");
    try {
      const { error } = await client.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${location.origin}/auth/callback` },
      });
      if (error) {
        console.error("[auth.google] OAuth initiation failed", {
          category: "supabase_auth_error", name: error.name, code: error.code ?? null, status: error.status ?? null,
        });
        setMessage(t("auth.error.google"));
      }
    } catch {
      console.error("[auth.google] OAuth initiation request failed", { category: "request_error", name: "RequestError" });
      setMessage(t("auth.error.google"));
    } finally {
      setBusy(false);
    }
  }

  async function sendPasswordReset() {
    const client = getSupabaseBrowserClient();
    if (!client) { setMessage(t("auth.error.supabase")); return; }
    if (!email.trim()) { setMessage(t("auth.reset.emailRequired")); return; }
    setBusy(true);
    setMessage("");
    try {
      await client.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${location.origin}/auth/callback?next=/auth/reset-password`,
      });
    } catch {
      // Keep the response identical to avoid revealing whether the address has an account.
    } finally {
      setBusy(false);
      setMessage(t("auth.reset.sent"));
    }
  }

  return <main className="mx-auto w-full max-w-md flex-1 p-6">
    <h1 className="mb-5 text-2xl font-semibold">{t(mode === "signin" ? "auth.title.signin" : "auth.title.signup")}</h1>
    <button type="button" className="mb-4 w-full rounded border px-4 py-2" disabled={busy} onClick={() => void signInWithGoogle()}>{t("auth.google")}</button>
    <form onSubmit={(event) => void (mode === "signin" ? signIn(event) : signUp(event))}>
      <label className="mb-2 block text-sm" htmlFor="email">{t("auth.email")}</label>
      <input id="email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} className="mb-3 w-full rounded border bg-background px-3 py-2" placeholder="you@example.com" />
      <label className="mb-2 block text-sm" htmlFor="password">{t("auth.password")}</label>
      <div className="mb-2 flex gap-2">
        <input id="password" type={showPassword ? "text" : "password"} autoComplete={mode === "signin" ? "current-password" : "new-password"} minLength={mode === "signup" ? 6 : undefined} required value={password} onChange={(event) => setPassword(event.target.value)} className="min-w-0 flex-1 rounded border bg-background px-3 py-2" />
        <button type="button" className="rounded border px-3 text-sm" aria-pressed={showPassword} onClick={() => setShowPassword((shown) => !shown)}>{t(showPassword ? "auth.hidePassword" : "auth.showPassword")}</button>
      </div>
      <button type="submit" className="mt-2 w-full rounded bg-primary px-4 py-2 text-primary-foreground" disabled={busy}>{t(mode === "signin" ? "auth.submit.signin" : "auth.submit.signup")}</button>
    </form>
    <button type="button" className="mt-3 block text-sm underline" disabled={busy} onClick={() => { setMode((current) => current === "signin" ? "signup" : "signin"); setMessage(""); }}>
      {t(mode === "signin" ? "auth.toggle.signup" : "auth.toggle.signin")}
    </button>
    {mode === "signin" && <button type="button" className="mt-3 text-sm underline" disabled={busy} onClick={() => void sendPasswordReset()}>{t("auth.reset")}</button>}
    {(message || (searchParams.get("callbackError") === "1" ? t("auth.error.callback") : "")) &&
      <p className="mt-4 text-sm" role="status">{message || t("auth.error.callback")}</p>}
    <Link href="/" className="mt-6 inline-block text-sm underline">{t("auth.home")}</Link>
  </main>;
}

export default function AuthPage() {
  return <Suspense fallback={<main className="mx-auto w-full max-w-md flex-1 p-6" aria-busy="true" />}>
    <AuthPageContent />
  </Suspense>;
}
