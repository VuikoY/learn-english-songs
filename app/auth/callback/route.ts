import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function safeErrorMessage(message: string): string {
  return message
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[email]")
    .replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
    .replace(/\b[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\b/g, "[token]")
    .replace(/(code|access[_-]?token|refresh[_-]?token|api[_-]?key|cookie)=?\s*[^\s&,;]+/gi, "$1=[redacted]")
    .replace(/[\r\n\t]+/g, " ")
    .slice(0, 240);
}

function logCallbackFailure(stage: string, error?: { name?: string; code?: string; status?: number; message?: string }) {
  console.error("[auth.callback] Authentication callback failed", {
    category: "callback_failure",
    stage,
    name: error?.name ?? null,
    code: error?.code ?? null,
    status: error?.status ?? null,
    reason: error?.message ? safeErrorMessage(error.message) : null,
  });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const token_hash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type");
  const providerError = url.searchParams.get("error");
  const next = url.searchParams.get("next");
  const safeNext = next?.startsWith("/") && !next.startsWith("//") ? next : "/";
  let authenticated = false;
  let failure = false;
  try {
    const supabase = await createSupabaseServerClient();
    if (providerError) {
      const safeProviderCode = /^[a-z0-9_-]{1,80}$/i.test(providerError) ? providerError : "provider_error";
      logCallbackFailure("provider_redirect", { code: safeProviderCode });
      failure = true;
    } else if (!supabase) {
      logCallbackFailure("client_configuration");
      failure = true;
    } else if (code) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      authenticated = !error;
      if (error) { logCallbackFailure("code_exchange", error); failure = true; }
    } else if (token_hash && (type === "email" || type === "magiclink" || type === "recovery" || type === "signup")) {
      const { error } = await supabase.auth.verifyOtp({ token_hash, type });
      authenticated = !error;
      if (error) { logCallbackFailure("otp_verification", error); failure = true; }
    } else {
      logCallbackFailure("missing_or_invalid_parameters");
      failure = true;
    }
  } catch (error) {
    logCallbackFailure("unexpected_exception", error instanceof Error ? { name: error.name, message: error.message } : undefined);
    failure = true;
  }
  const destination = authenticated && type === "recovery" ? "/auth/reset-password" : authenticated ? safeNext : "/auth";
  const redirect = new URL(destination, url.origin);
  if (failure) redirect.searchParams.set("callbackError", "1");
  return NextResponse.redirect(redirect);
}
