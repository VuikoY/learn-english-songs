---
name: multilingual-feature-ui
description: Add or change user-facing pages and features in this repository while keeping every visible string localized for each supported interface language.
---

# Multilingual feature UI

Use this skill whenever adding or changing a page, component, interaction, or user-visible response in this app.

## Required behavior

- Localize all user-visible text for every language in `LANGUAGE_CODES`: labels, buttons, headings, helper text, placeholders, validation and error messages, empty/loading/success states, confirmations, and accessibility names.
- Keep translations in `lib/i18n/dictionary.ts`. Add each new key to every language dictionary. The Russian dictionary defines `TranslationKey`; preserve the shared key set and do not leave English or Russian fallback text in another locale.
- Read interface copy through `useLanguage().t(...)` in client components. For server-rendered UI, use a client component or pass the active locale and resolve the matching dictionary; do not hardcode one language into the page.
- Treat API and server errors that reach the user as localized UI. Prefer stable error codes from the server and map them to localized dictionary keys in the client.
- When introducing a new supported language, update `LANGUAGE_CODES`, `LANGUAGES`, validation, and all dictionaries together. Do not reintroduce Ukrainian unless the user explicitly asks to support it.

## Keep language preferences independent

- `uiLanguage` controls interface text only.
- `targetLanguage` is the user's native/response language for AI Explain. Use it for AI explanations and their saved translations; changing it must not change the interface or catalog filter.
- `sourceLanguage` is the language the user is learning. Use it to filter catalog songs and select that language's subtitles; changing it must not change the interface or AI response language.
- Never synchronize these settings implicitly. Preserve each setting independently when loading, saving, or migrating preferences.

## Before finishing

Review the changed page and its complete user flow for untranslated strings, including errors and empty states. Confirm that each supported interface language has the new dictionary keys and that changing interface language changes the page without changing the AI language or catalog filter.
