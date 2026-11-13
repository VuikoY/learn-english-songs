const TECHNICAL_TITLE_TAG = /\b(?:official|lyrics?|hd|4k|legendado)\b/iu;
const TECHNICAL_TITLE_SUFFIX = /(?:[\s|:–—-]+)(?:official(?:\s+(?:music\s+)?video)?|lyrics?(?:\s+video)?|hd|4k|legendado(?:\s+[a-z]{2}(?:\s*[/&,+]\s*[a-z]{2})?)?)[\s|:–—-]*$/iu;

export function cleanYouTubeTitle(title: string): string {
  const original = title.trim();
  let cleaned = original
    .replace(/\([^)]*\)|\[[^\]]*\]/gu, (tag) => TECHNICAL_TITLE_TAG.test(tag) ? " " : tag)
    .replace(/\s+/gu, " ")
    .trim();

  let previous: string;
  do {
    previous = cleaned;
    cleaned = cleaned.replace(TECHNICAL_TITLE_SUFFIX, "").replace(/[\s|:–—-]+$/u, "").trim();
  } while (cleaned !== previous);

  return cleaned || original;
}
