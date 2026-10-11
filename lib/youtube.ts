// lib/youtube.ts
// Утиліта: витягує videoId з будь-якого поширеного формату YouTube-посилання.
//
// Розуміє:
//   dQw4w9WgXcQ                                  (голий ID)
//   https://www.youtube.com/watch?v=ID&t=30s     (звичайне, з додатковими параметрами)
//   www.youtube.com/watch?v=ID                   (без https://)
//   https://youtu.be/ID?si=...                   (коротке)
//   https://m.youtube.com/watch?v=ID             (мобільне)
//   https://music.youtube.com/watch?v=ID         (YouTube Music)
//   https://www.youtube.com/embed/ID, /shorts/ID, /live/ID, /v/ID
//   https://www.youtube-nocookie.com/embed/ID

// Справжній videoId — завжди 11 символів: літери, цифри, "-" і "_"
const VIDEO_ID_PATTERN = /^[\w-]{11}$/;

export function isValidVideoId(value: string): boolean {
  return VIDEO_ID_PATTERN.test(value);
}

export function extractVideoId(input: string): string | null {
  const value = input.trim();
  if (!value) return null;

  // 1. Користувач вставив уже готовий ID
  if (isValidVideoId(value)) return value;

  // 2. Якщо протоколу немає ("youtube.com/..."), додаємо його, щоб URL() не падав
  const withProtocol = /^https?:\/\//i.test(value) ? value : `https://${value}`;

  let url: URL;
  try {
    url = new URL(withProtocol);
  } catch {
    return null; // це взагалі не схоже на посилання
  }

  // Прибираємо префікси піддоменів: www.youtube.com, m.youtube.com, music.youtube.com
  const host = url.hostname.replace(/^(www|m|music)\./, "");

  let candidate: string | null = null;

  if (host === "youtu.be") {
    // https://youtu.be/ID  ->  pathname "/ID"
    candidate = url.pathname.split("/")[1] ?? null;
  } else if (host === "youtube.com" || host === "youtube-nocookie.com") {
    // Спочатку шукаємо ?v=ID, потім формати /embed/ID, /shorts/ID, /live/ID, /v/ID
    candidate =
      url.searchParams.get("v") ??
      url.pathname.match(/^\/(?:embed|shorts|live|v)\/([^/?#]+)/)?.[1] ??
      null;
  }

  // Повертаємо лише те, що справді виглядає як videoId
  return candidate && isValidVideoId(candidate) ? candidate : null;
}
