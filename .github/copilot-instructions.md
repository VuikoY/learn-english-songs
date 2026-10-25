# Project instructions

Before any push, run `npm run lint` and `npm run knip`. Do not push while either command reports errors; fix the reported issues, rerun both checks, and push only after both pass. If a check fails, report the relevant failures and do not claim it passed.

When the user asks to push, include all intended tracked and untracked project changes in the commit and push them; do not silently leave unrelated code changes behind. Always exclude secrets and local-only files such as `.env.local`.
