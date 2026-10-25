# Learn English with Songs

Next.js app for learning English through song subtitles, line explanations, vocabulary practice and learning progress.

## Local setup

1. Use Node.js 20+ and run `npm install`.
2. Copy `.env.example` to `.env.local` and fill in the Supabase project URL, public anon/publishable key, server-only service-role key, RapidAPI credentials and Gemini API key. Explanations use the `gemini-3.8-flash` model. `MOCK_AI=true` enables demo explanations without Gemini. `SUPABASE_SERVICE_ROLE_KEY`, `RAPIDAPI_KEY` and `RAPIDAPI_HOST` are used only by server routes; never expose them through a `NEXT_PUBLIC_` variable or browser code.
3. Apply the ordered migrations in `supabase/migrations` to your Supabase project (for example, link the project with `npx supabase link` and run `npx supabase db push`). `supabase/schema.sql` is a legacy pointer; database changes are managed by migrations.
4. In Supabase Authentication, enable Google and Email/Password, and allow email signups if users should be able to register. The app has separate email/password sign-in and registration actions. With email confirmation enabled, users receive a confirmation link; otherwise Supabase can create a session immediately. Users who signed in with Google or a previous magic link can use “Встановити або відновити пароль” to set a password through Supabase password recovery. Add `http://localhost:3000/auth/callback` and your deployed `https://<domain>/auth/callback` to the allowed redirect URLs; set the site URL to the production origin.
5. Start with `npm run dev`.

The interface language is selected independently from the song/source language and the explanation/target language. The current choices for all three are Russian, English, Polish and Spanish. The interface language defaults to Russian and is saved with the user's language settings (or locally for a guest); changing the languages being studied does not change the interface language.

The browser uses only the Supabase public anon/publishable key. Never put a `service_role` key in client code or a `NEXT_PUBLIC_` variable. RLS protects vocabulary/settings; only verified transcript rows are publicly readable. Direct Data API writes to the transcript table are revoked; the server route validates the signed-in user and performs the confirmation with its server-only service-role key. Explanation-cache writes require a signed-in account.

## Deploy to Vercel

### One-time setup

1. Import this GitHub repository into Vercel and keep the detected Next.js build settings. Set the Production Branch to the branch you deploy from (usually `main`).
2. In Vercel Project Settings → Environment Variables, add the following for Production. Add them for Preview too if preview deployments need access to the real services:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` (server-only; never use a `NEXT_PUBLIC_` prefix)
   - `RAPIDAPI_KEY` (server-only; required for fetching uncached transcripts)
   - `RAPIDAPI_HOST` (RapidAPI host for the selected YouTube transcript service)
   - `GEMINI_API_KEY`
   - `MOCK_AI=false`
3. Apply the database migrations as described below. Migrations run against Supabase separately from the Vercel app deployment.
4. In Supabase Auth, configure Google OAuth and email delivery as needed. Set the Site URL to the production origin and add the production site's `/auth/callback` URL to the allowed redirect URLs. Add preview callback URLs only if you use preview deployments for authentication.
5. After changing Vercel environment variables, trigger a new deployment so the build picks them up.

### Deploying changes

Before pushing, run `npm run lint`, `npm run knip` and `npm run build` locally. Push or merge the change to the configured Production Branch; Vercel builds and deploys it automatically. Pushes to other branches create Preview deployments. Check the deployment's build logs and open its URL to verify the app. If a deployment fails, fix the reported issue and push again, or redeploy the commit from the Vercel dashboard.

Keep secrets in Vercel's environment-variable settings and out of Git; `.env.local` is for local development only. Deployment requires access to the project's Vercel and Supabase accounts.

### Applying database migrations

Install and authenticate the Supabase CLI, then link this repository to the intended Supabase project:

```bash
npx supabase login
npx supabase link --project-ref <project-ref>
npx supabase migration list
```

Check that the project reference is correct and compare local and remote migration history before proceeding. Preview pending changes, then apply them:

```bash
npx supabase db push --dry-run
npx supabase db push
```

The CLI may ask for the database password. Do not put database passwords, access tokens, or other secrets in Git or share them in chat. Review every pending migration before applying it to production. In particular, `20261019120000_remove_song_artist.sql` drops the `artist` column from `public.songs`, which deletes any data stored in that column. Back up or migrate that data first if it needs to be kept.

After initial setup, GitHub Actions applies new migrations automatically when changes under `supabase/migrations` are pushed to `main`. In GitHub, create a `production` environment under **Settings → Environments**, then add an environment secret named `SUPABASE_DB_URL` containing the full Session pooler URI for the production database. Rotate any database password previously exposed, and URL-encode reserved characters in the replacement password. Keep the URI private.

The workflow only runs for migration-file changes (or when started manually from Actions); it does not run as part of the Vercel build. Vercel may deploy the same commit in parallel, so make schema changes backward-compatible with the currently deployed app. Review every migration before merging it to `main`, especially destructive changes. After a successful run, check the workflow and Supabase migration history.

## Commands

```bash
npm run dev
npm run lint
npm run knip
npm run build
npm run start
```
