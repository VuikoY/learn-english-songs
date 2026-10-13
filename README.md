# Learn English with Songs

Вебзастосунок для вивчення англійської за піснями: завантажуйте субтитри з YouTube, читайте їх синхронно з відео, отримуйте пояснення рядків і грайте у вправи на пропущені слова.

## Можливості

- Отримання субтитрів YouTube за ідентифікатором або посиланням на відео.
- Інтерактивний текст, синхронізований із YouTube-плеєром.
- Пояснення перекладу, граматики та сленгу через Gemini API або деморежим.
- Ігри на заповнення пропусків і введення перших літер.
- Словник збережених фраз і налаштування мов.
- Локальне збереження даних; необов'язкова синхронізація словника й налаштувань через Supabase.

## Технології

- Next.js (App Router), React, TypeScript
- Tailwind CSS
- Supabase Auth і Postgres — необов'язкове підключення; наразі використовується анонімна авторизація
- Gemini API для пояснень
- YouTube IFrame Player і `youtube-transcript` для відео та субтитрів

## Вимоги

- Node.js 20 або новіший і npm.
- Ключ Gemini для справжніх пояснень. Для деморежиму ключ не потрібен.
- Проєкт Supabase — лише якщо потрібні хмарний кеш і синхронізація даних.

## Локальний запуск

1. Клонуйте репозиторій і перейдіть до його каталогу:

   ```bash
   git clone <repository-url>
   cd learn-english-songs
   ```

2. Встановіть залежності:

   ```bash
   npm install
   ```

3. Створіть `.env.local` у корені проєкту. Мінімальний варіант для деморежиму:

   ```dotenv
   MOCK_AI=true
   ```

   Щоб отримувати справжні пояснення через Gemini, вимкніть деморежим і додайте ключ:

   ```dotenv
   MOCK_AI=false
   GEMINI_API_KEY=your_gemini_api_key
   # Необов'язково; за замовчуванням gemini-flash-latest
   GEMINI_MODEL=gemini-flash-latest
   ```

   Щоб увімкнути Supabase, додайте URL проєкту й anon/publishable key:

   ```dotenv
   NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_or_publishable_key
   ```

   Не додавайте секрети до Git. Файл `.env.local` ігнорується Git.

4. Запустіть сервер розробки:

   ```bash
   npm run dev
   ```

5. Відкрийте [http://localhost:3000](http://localhost:3000).

## Налаштування Supabase

Supabase поки необов'язковий: застосунок працює без нього, а словник і налаштування зберігаються у сховищі браузера. З налаштованим Supabase застосунок створює анонімну сесію, зберігає копії словника й мовних налаштувань у базі та кешує субтитри й пояснення.

1. Створіть проєкт у Supabase.
2. У **SQL Editor** виконайте [`supabase/schema.sql`](supabase/schema.sql).
3. У налаштуваннях **Authentication → Providers** дозвольте Anonymous sign-ins. Звичайний вхід через email/OAuth у застосунку ще не реалізовано.
4. Скопіюйте Project URL та anon/publishable key у `.env.local` (локально) або у змінні середовища хостингу.

Таблиці словника й мовних налаштувань мають увімкнений RLS із політиками доступу за `auth.uid()`. Не використовуйте `service_role` key у браузері або у змінній із префіксом `NEXT_PUBLIC_`.

## Команди

```bash
npm run dev    # локальна розробка
npm run lint   # ESLint
npm run build  # production-збірка
npm run start  # запуск зібраного застосунку
```

## Деплой на Vercel

1. Запуште проєкт у GitHub, GitLab або Bitbucket.
2. У Vercel створіть проєкт **Add New → Project** і під'єднайте репозиторій. Vercel автоматично визначить Next.js; стандартні команди збірки можна залишити без змін.
3. У **Project Settings → Environment Variables** додайте змінні для потрібних середовищ (Production, Preview, Development):
   - `GEMINI_API_KEY` — для справжніх пояснень;
   - `GEMINI_MODEL` — необов'язково;
   - `MOCK_AI` — встановіть `true` для деморежиму або `false` для Gemini;
   - `NEXT_PUBLIC_SUPABASE_URL` і `NEXT_PUBLIC_SUPABASE_ANON_KEY` — якщо підключаєте Supabase.
4. Якщо використовуєте Supabase, застосуйте `supabase/schema.sql` і дозвольте Anonymous sign-ins. У **Authentication → URL Configuration** додайте production-домен Vercel до Site URL / Redirect URLs, а для preview-деплоїв — потрібні preview URL.
5. Задеплойте застосунок і перевірте головну сторінку, завантаження субтитрів та пояснення. Після зміни змінних середовища створіть новий deployment.

Для production бажано використовувати власний домен і явно додати його в URL Configuration Supabase.

## API-маршрути

- `GET /api/transcript?videoId=<id>&lang=<language>` — отримує субтитри, очищує їх і за наявності Supabase кешує в базі.
- `POST /api/explain` — приймає `{ "text": "...", "sourceLanguage": "en", "targetLanguage": "ru", "context": "..." }` і повертає `{ "translation": "...", "grammar": "...", "slang": "..." }`.

## Межі поточної реалізації

- Supabase Auth поки використовує лише анонімні сесії. Реєстрація, звичайний вхід і відновлення пароля не реалізовані.
- Словник і мовні налаштування спочатку записуються у `localStorage`, а потім синхронізуються із Supabase, якщо той налаштований. Дані між різними браузерами без акаунта не переносяться.
- Для Gemini діє серверна перевірка вхідних даних, але окремий rate limiting наразі не налаштований.
- Інтерфейс запитує `/api/video-title`, але API-маршруту для цієї адреси в поточному репозиторії немає; отримання назви відео може не працювати.

## Перевірка документації при змінах

Для оцінки того, чи потребують зміни коду оновлення README, використовуйте локальний скіл [`.agents/skills/readme-impact-review/SKILL.md`](.agents/skills/readme-impact-review/SKILL.md).
