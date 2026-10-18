// lib/youtube.ts
// Extracts a videoId from common YouTube URL formats.
//
// Supported formats:
//   dQw4w9WgXcQ                                  (bare ID)
//   https://www.youtube.com/watch?v=ID&t=30s     (standard URL with extra parameters)
//   www.youtube.com/watch?v=ID                   (without https://)
//   https://youtu.be/ID?si=...                   (short URL)
//   https://m.youtube.com/watch?v=ID             (mobile)
//   https://music.youtube.com/watch?v=ID         (YouTube Music)
//   https://www.youtube.com/embed/ID, /shorts/ID, /live/ID, /v/ID
//   https://www.youtube-nocookie.com/embed/ID

// A valid videoId has 11 letters, digits, hyphens, or underscores.
const VIDEO_ID_PATTERN = /^[\w-]{11}$/;

export function isValidVideoId(value: string): boolean {
  return VIDEO_ID_PATTERN.test(value);
}

/** Removes playlist, radio, and tracking parameters after the first ampersand. */
export function stripYoutubeUrlExtras(input: string): string {
  const value = input.trim();
  const firstAmpersand = value.indexOf("&");
  return firstAmpersand === -1 ? value : value.slice(0, firstAmpersand).trim();
}

export function extractVideoId(input: string): string | null {
  const value = stripYoutubeUrlExtras(input);
  if (!value) return null;

  // 1. The user entered a videoId directly.
  if (isValidVideoId(value)) return value;

  // 2. Add a protocol when the input starts with a bare domain.
  const withProtocol = /^https?:\/\//i.test(value) ? value : `https://${value}`;

  let url: URL;
  try {
    url = new URL(withProtocol);
  } catch {
    return null; // This does not look like a URL.
  }

  // Remove common YouTube subdomains.
  const host = url.hostname.replace(/^(www|m|music)\./, "");

  let candidate: string | null = null;

  if (host === "youtu.be") {
    // https://youtu.be/ID  ->  pathname "/ID"
    candidate = url.pathname.split("/")[1] ?? null;
  } else if (host === "youtube.com" || host === "youtube-nocookie.com") {
    // Check the v query parameter, then embed, shorts, live, and legacy URL paths.
    candidate =
      url.searchParams.get("v") ??
      url.pathname.match(/^\/(?:embed|shorts|live|v)\/([^/?#]+)/)?.[1] ??
      null;
  }

  // Return only values that match the videoId format.
  return candidate && isValidVideoId(candidate) ? candidate : null;
}
