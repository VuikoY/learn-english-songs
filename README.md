# Learn English with Songs

Next.js app for learning English through song subtitles, line explanations, vocabulary practice and learning progress.

## Local setup

1. Use Node.js 20+ and run `npm install`.
2. Copy `.env.example` to `.env.local` and fill in the Supabase project URL, public anon/publishable key, server-only service-role key and Gemini API key. Explanations use the `gemini-3.8-flash` model. `MOCK_AI=true` enables demo explanations without Gemini. `SUPABASE_SERVICE_ROLE_KEY` is used only by server routes; never expose it through a `NEXT_PUBLIC_` variable or browser code.
3. Apply the ordered migrations in `supabase/migrations` to your Supabase project (for example, link the project with `npx supabase link` and run `npx supabase db push`). `supabase/schema.sql` is a legacy pointer; database changes are managed by migrations.
4. In Supabase Authentication, enable Google and Email/Password, and allow email signups if users should be able to register. The app has separate email/password sign-in and registration actions. With email confirmation enabled, users receive a confirmation link; otherwise Supabase can create a session immediately. Users who signed in with Google or a previous magic link can use “Встановити або відновити пароль” to set a password through Supabase password recovery. Add `http://localhost:3000/auth/callback` and your deployed `https://<domain>/auth/callback` to the allowed redirect URLs; set the site URL to the production origin.
5. Start with `npm run dev`.

The interface language is selected independently from the song/source language and the explanation/target language. The current choices for all three are Russian, English, Polish and Spanish. The interface language defaults to Russian and is saved with the user's language settings (or locally for a guest); changing the languages being studied does not change the interface language.

The browser uses only the Supabase public anon/publishable key. Never put a `service_role` key in client code or a `NEXT_PUBLIC_` variable. RLS protects vocabulary/settings; only verified transcript rows are publicly readable. Direct Data API writes to the transcript table are revoked; the server route validates the signed-in user and performs the confirmation with its server-only service-role key. Explanation-cache writes require a signed-in account.

## Deploy to Vercel

Import this repository into Vercel with the Next.js defaults. Configure these environment variables for Production (and Preview/Development if needed):

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (server-only; used for shared explanation caching and transcript confirmation; never use a `NEXT_PUBLIC_` prefix)
- `GEMINI_API_KEY`
- `MOCK_AI=false`

Apply the ordered SQL migrations, configure Google OAuth credentials and email delivery in Supabase, then add the Vercel production and preview callback URLs to Supabase Auth URL Configuration. Redeploy after setting environment variables. The deployment requires access to the owner's Supabase and Vercel accounts; these are not configured by the repository.

## Commands

```bash
npm run dev
npm run lint
npm run build
npm run start
```
