# Local Supabase development

The database schema is managed by files in `supabase/migrations`. Do not apply the legacy `schema.sql` snapshots to a database.

After adding a migration while the local stack is already running, apply pending migrations without resetting local data:

```sh
npx supabase migration up --local
npm run db:types
```

## Prerequisites

- Install and start Docker Desktop.
- Install the Supabase CLI, or run it through `npx supabase`.

## Start and reset the local database

```sh
npx supabase start
npx supabase db reset
```

When `supabase start` completes, copy the local API URL, anon key, and service role key from its output into `.env.local`. Keep the existing file private and do not commit it. Use the local values only for local development.

## Regenerate TypeScript types

```sh
npx supabase gen types typescript --local --schema public > types/supabase.ts
```

The command regenerates `types/supabase.ts` from the local database after migrations have been applied.

## Production

Link the project and push migrations only after reviewing the local result:

```sh
npx supabase link --project-ref <project-ref>
npx supabase db push
```
