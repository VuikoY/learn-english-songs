import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type SignupFailure = "invalid_input" | "weak_password" | "signup_disabled" | "email_rate_limit" | "unavailable";

function safeDiagnosticMessage(message: string, email: string, password: string): string {
  return message
    .replaceAll(email, "[email]")
    .replaceAll(password, "[password]")
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[email]")
    .replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
    .replace(/\b[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\b/g, "[token]")
    .replace(/AIza[\w-]{20,}/g, "[api-key]")
    .replace(/\bsb_(?:secret|publishable)_[\w-]+/g, "[api-key]")
    .replace(/(access[_-]?token|refresh[_-]?token|api[_-]?key|cookie)=?\s*[^\s&,;]+/gi, "$1=[redacted]")
    .replace(/[\r\n\t]+/g, " ")
    .slice(0, 240);
}

function publicFailure(code: string | undefined): SignupFailure {
  if (code === "weak_password" || code === "password_too_short") return "weak_password";
  if (code === "signup_disabled") return "signup_disabled";
  if (code === "over_email_send_rate_limit" || code === "email_address_not_authorized") return "email_rate_limit";
  return "unavailable";
}

export async function POST(request: Request) {
  let body: unknown;
  try { body = await request.json(); } catch {
    return NextResponse.json({ failure: "invalid_input" satisfies SignupFailure }, { status: 400 });
  }
  if (!body || typeof body !== "object" || !("email" in body) || !("password" in body) ||
      typeof body.email !== "string" || typeof body.password !== "string" ||
      !body.email.trim() || body.password.length < 6 || body.password.length > 128) {
    return NextResponse.json({ failure: "invalid_input" satisfies SignupFailure }, { status: 400 });
  }
  const signupEmail = body.email.trim();
  const signupPassword = body.password;

  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) {
      console.error("[auth.signup] Supabase client unavailable", { category: "configuration" });
      return NextResponse.json({ failure: "unavailable" satisfies SignupFailure }, { status: 503 });
    }
    const origin = new URL(request.url).origin;
    const { data, error } = await supabase.auth.signUp({
      email: signupEmail,
      password: signupPassword,
      options: { emailRedirectTo: `${origin}/auth/callback` },
    });
    if (error) {
      if (error.code === "user_already_exists" || error.code === "email_exists") {
        console.error("[auth.signup] Supabase rejected sign-up", {
          category: "supabase_auth_error",
          code: error.code,
          status: error.status,
          name: error.name,
          providerMessage: safeDiagnosticMessage(error.message, signupEmail, signupPassword),
        });
        // Preserve Supabase's anti-enumeration behavior if project settings expose this error.
        return NextResponse.json({ confirmationRequired: true }, { status: 200 });
      }
      const failure = publicFailure(error.code);
      // Keep the provider reason after scrubbing credentials, personal data and tokens.
      console.error("[auth.signup] Supabase rejected sign-up", {
        category: "supabase_auth_error",
        code: error.code ?? "unavailable_code",
        status: error.status,
        name: error.name,
        providerMessage: safeDiagnosticMessage(error.message, signupEmail, signupPassword),
      });
      return NextResponse.json({ failure }, { status: 400 });
    }

    return NextResponse.json({ confirmationRequired: !data.session }, { status: 200 });
  } catch (error) {
    console.error("[auth.signup] Unexpected failure", {
      category: "unexpected_error",
      name: error instanceof Error ? error.name : "UnknownError",
      message: error instanceof Error ? safeDiagnosticMessage(error.message, signupEmail, signupPassword) : "No error message",
    });
    return NextResponse.json({ failure: "unavailable" satisfies SignupFailure }, { status: 503 });
  }
}
