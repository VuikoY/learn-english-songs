import type { LyricLine } from "@/lib/types";
import { cleanTranscript } from "@/lib/utils/cleanTranscript";

type LrclibTrack = {
  trackName: string;
  artistName: string;
  syncedLyrics: string | null;
  plainLyrics: string | null;
};

export class LrclibProviderError extends Error {
  constructor(readonly status: number) {
    super(`Lrclib responded with status ${status}`);
    this.name = "LrclibProviderError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function normalizeTitle(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function normalizeTrackTitle(value: string): string {
  return normalizeTitle(value).replace(/^(?:the|a|an) /u, "");
}

function normalizeArtist(value: string): string {
  return normalizeTitle(value)
    .replace(/\b(?:and|with|feat|featuring)\b/gu, " ")
    .split(/\s+/u)
    .filter(Boolean)
    .sort()
    .join(" ");
}

function versionMarkers(value: string): string[] {
  const normalized = normalizeTitle(value);
  return ["live", "acoustic", "remix", "cover", "karaoke", "instrumental", "demo", "remastered", "radio edit"]
    .filter((marker) => new RegExp(`(?:^| )${marker}(?: |$)`, "u").test(normalized));
}

function titleVariants(title: string, artist: string): { values: Set<string>; artistHints: string[]; searchQuery: string } {
  const cleaned = title
    .replace(/\s*[\[(](?:official\s+)?(?:(?:music|lyric)\s+)?(?:video|audio|lyrics?)(?:\s+[\w.-]+)*[\])]\s*$/iu, "")
    .replace(/\s*[-–—]\s*(?:official\s+)?(?:(?:music|lyric)\s+)?(?:video|audio|lyrics?)\s*$/iu, "")
    .trim();
  const versionSuffix = versionMarkers(cleaned)[0];
  const titleWithoutVersion = versionSuffix
    ? cleaned.replace(/\s*[-–—]?\s*[\[(]?(?:live|acoustic|remix|cover|karaoke|instrumental|demo|remastered|radio edit)[\])]?\s*$/iu, "").trim()
    : cleaned;
  const [titleSide, embeddedArtist = ""] = titleWithoutVersion.split(/\s*\/\/\s*/u, 2);
  const parts = titleSide.split(/\s+[-–—]\s+/u).map((part) => part.trim()).filter(Boolean);
  const trackTitle = parts.at(-1) ?? titleSide;
  const artistHint = artist.trim() ||
    embeddedArtist.replace(/\s*[-–—]?\s*[\[(]?(?:live|acoustic|remix|cover|karaoke|instrumental|demo|remastered|radio edit)[\])]?\s*$/iu, "").trim() ||
    (parts.length > 1 ? parts.slice(0, -1).join(" ") : "");
  const variants = [cleaned, titleSide, trackTitle];
  if (versionSuffix && !versionMarkers(trackTitle).length) variants.push(`${trackTitle} ${versionSuffix}`);
  return {
    values: new Set(variants.map(normalizeTrackTitle).filter(Boolean)),
    artistHints: artistHint ? [artistHint] : [],
    searchQuery: [trackTitle, artistHint].filter(Boolean).join(" "),
  };
}

function parseTrack(value: unknown): LrclibTrack | null {
  if (!isRecord(value) || typeof value.trackName !== "string" || typeof value.artistName !== "string") {
    return null;
  }
  return {
    trackName: value.trackName,
    artistName: value.artistName,
    syncedLyrics: typeof value.syncedLyrics === "string" ? value.syncedLyrics : null,
    plainLyrics: typeof value.plainLyrics === "string" ? value.plainLyrics : null,
  };
}

export async function findLrclibTrack(title: string, artist = ""): Promise<LrclibTrack | null> {
  const { values, artistHints, searchQuery } = titleVariants(title, artist);
  const query = new URLSearchParams({ q: searchQuery });
  const response = await fetch(`https://lrclib.net/api/search?${query}`, {
    headers: { "User-Agent": "learn-english-songs/0.1.0 (lyrics lookup)" },
    cache: "no-store",
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) {
    throw new LrclibProviderError(response.status);
  }
  const data: unknown = await response.json();
  if (!Array.isArray(data)) {
    throw new Error("Lrclib returned an invalid response");
  }

  const requestedVersions = versionMarkers(title);
  const matches = data
    .map(parseTrack)
    .filter((track): track is LrclibTrack => track !== null)
    .filter((track) =>
      values.has(normalizeTrackTitle(track.trackName)) &&
      requestedVersions.every((marker) => versionMarkers(track.trackName).includes(marker)),
    );

  const artistMatches = matches.filter((track) =>
    artistHints.some((hint) => normalizeArtist(hint) === normalizeArtist(track.artistName)),
  );
  if (artistHints.length > 0) return artistMatches.length === 1 ? artistMatches[0] ?? null : null;
  if (matches.length < 2) return matches[0] ?? null;

  const uniqueArtists = new Set(matches.map((track) => normalizeArtist(track.artistName)));
  if (uniqueArtists.size > 1) return null;

  return matches.find((track) => track.syncedLyrics?.trim()) ?? matches[0];
}

export function parseLrcLyrics(lrc: string): LyricLine[] {
  const offsetMatch = lrc.match(/^\[offset:([+-]?\d+)\]\s*$/imu);
  const offsetSeconds = offsetMatch ? Number(offsetMatch[1]) / 1000 : 0;
  const timestampPattern = /\[(\d{1,3}):([0-5]\d)(?:\.(\d{1,3}))?\]/gu;
  const entries: Array<{ start: number; text: string }> = [];

  for (const rawLine of lrc.split(/\r?\n/u)) {
    const matches = [...rawLine.matchAll(timestampPattern)];
    if (matches.length === 0) continue;
    const text = rawLine.replace(/\[\d{1,3}:[0-5]\d(?:\.\d{1,3})?\]/gu, "").trim();
    if (!text) continue;

    for (const match of matches) {
      const fraction = (match[3] ?? "").padEnd(3, "0");
      const start = Math.max(
        0,
        Number(match[1]) * 60 + Number(match[2]) + (fraction ? Number(fraction) / 1000 : 0) + offsetSeconds,
      );
      entries.push({ start, text });
    }
  }

  entries.sort((a, b) => a.start - b.start);
  const merged: Array<{ start: number; text: string }> = [];
  for (const entry of entries) {
    const previous = merged.at(-1);
    if (previous && previous.start === entry.start) previous.text = `${previous.text} ${entry.text}`;
    else merged.push(entry);
  }

  return cleanTranscript(merged.map((entry, index) => ({
    text: entry.text,
    start: entry.start,
    duration: index + 1 < merged.length ? Math.max(0, merged[index + 1].start - entry.start) : 3,
  })));
}

type WordToken = {
  raw: string;
  normalized: string;
  lineIndex: number;
};

function wordTokens(lines: LyricLine[]): WordToken[] {
  return lines.flatMap((line, lineIndex) =>
    line.text.split(/\s+/u).filter(Boolean).map((raw) => ({
      raw,
      normalized: normalizeTitle(raw),
      lineIndex,
    })).filter((token) => token.normalized.length > 0),
  );
}

function plainWordTokens(text: string): string[] {
  return text.split(/\s+/u).filter(Boolean).filter((word) => normalizeTitle(word).length > 0);
}

function wordSimilarity(left: string, right: string): number {
  const a = normalizeTitle(left);
  const b = normalizeTitle(right);
  if (a === b) return 1;
  if (!a || !b) return 0;

  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      current[j] = Math.min(
        current[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    previous = current;
  }
  return 1 - previous[b.length] / Math.max(a.length, b.length);
}

function withTargetWord(target: string, source: string | undefined): string {
  const punctuationPattern = /^([^\p{L}\p{N}]*)([\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*(?:-[\p{L}\p{N}]+)*)([^\p{L}\p{N}]*)$/u;
  const targetMatch = target.match(punctuationPattern);
  const sourceMatch = source?.match(punctuationPattern);
  if (!targetMatch) return target;
  return `${targetMatch[1] || sourceMatch?.[1] || ""}${targetMatch[2]}${targetMatch[3] || sourceMatch?.[3] || ""}`;
}

type AlignmentStep = { targetIndex: number; sourceIndex: number | null };

export function alignPlainLyrics(
  youtubeLines: LyricLine[],
  plainLyrics: string,
): { lines: LyricLine[]; confidence: number } | null {
  const source = wordTokens(youtubeLines);
  const target = plainWordTokens(plainLyrics);
  if (!source.length || !target.length || source.length > 2_000 || target.length > 2_000) return null;

  const width = target.length + 1;
  const backtrack = new Uint8Array((source.length + 1) * width);
  const similarities = new Map<string, number>();
  const getSimilarity = (left: string, right: string) => {
    const key = `${left}\u0000${right}`;
    const cached = similarities.get(key);
    if (cached !== undefined) return cached;
    const similarity = wordSimilarity(left, right);
    similarities.set(key, similarity);
    return similarity;
  };
  let previous = new Float64Array(width);
  for (let j = 1; j <= target.length; j += 1) {
    previous[j] = j;
    backtrack[j] = 3;
  }

  for (let i = 1; i <= source.length; i += 1) {
    const current = new Float64Array(width);
    current[0] = i;
    backtrack[i * width] = 2;
    for (let j = 1; j <= target.length; j += 1) {
      const similarity = getSimilarity(source[i - 1].normalized, target[j - 1]);
      const substitutionCost = similarity === 1 ? 0 : similarity >= 0.5 ? 1.15 : 2.1;
      const substitution = previous[j - 1] + substitutionCost;
      const deletion = previous[j] + 1;
      const insertion = current[j - 1] + 1;
      const best = Math.min(substitution, deletion, insertion);
      current[j] = best;
      backtrack[i * width + j] = best === substitution ? 1 : best === deletion ? 2 : 3;
    }
    previous = current;
  }

  const steps: AlignmentStep[] = [];
  let sourceIndex = source.length;
  let targetIndex = target.length;
  while (sourceIndex > 0 || targetIndex > 0) {
    const operation = backtrack[sourceIndex * width + targetIndex];
    if (sourceIndex > 0 && targetIndex > 0 && operation === 1) {
      steps.push({ sourceIndex: sourceIndex - 1, targetIndex: targetIndex - 1 });
      sourceIndex -= 1;
      targetIndex -= 1;
    } else if (sourceIndex > 0 && (targetIndex === 0 || operation === 2)) {
      sourceIndex -= 1;
    } else if (targetIndex > 0) {
      steps.push({ sourceIndex: null, targetIndex: targetIndex - 1 });
      targetIndex -= 1;
    }
  }
  steps.reverse();

  let exactMatches = 0;
  let closeMatches = 0;
  for (const step of steps) {
    if (step.sourceIndex === null) continue;
    const similarity = getSimilarity(source[step.sourceIndex].normalized, target[step.targetIndex]);
    if (similarity === 1) exactMatches += 1;
    else if (similarity >= 0.5) closeMatches += 1;
  }
  const confidence = (exactMatches + closeMatches * 0.5) / Math.max(source.length, target.length);

  const assigned: Array<{ lineIndex: number; text: string }> = [];
  for (let index = 0; index < steps.length; index += 1) {
    const step = steps[index];
    if (step.sourceIndex !== null) {
      assigned.push({
        lineIndex: source[step.sourceIndex].lineIndex,
        text: withTargetWord(target[step.targetIndex], source[step.sourceIndex].raw),
      });
      continue;
    }

    const previousMatch = [...steps.slice(0, index)].reverse().find((item) => item.sourceIndex !== null);
    const nextMatch = steps.slice(index + 1).find((item) => item.sourceIndex !== null);
    const lineIndex = nextMatch?.sourceIndex !== null && nextMatch?.sourceIndex !== undefined
      ? source[nextMatch.sourceIndex].lineIndex
      : previousMatch?.sourceIndex !== null && previousMatch?.sourceIndex !== undefined
        ? source[previousMatch.sourceIndex].lineIndex
        : 0;
    assigned.push({ lineIndex, text: withTargetWord(target[step.targetIndex], undefined) });
  }

  const wordsByLine: string[][] = youtubeLines.map(() => []);
  for (const word of assigned) wordsByLine[word.lineIndex].push(word.text);

  const lines = youtubeLines.flatMap((line, index) => {
    const text = wordsByLine[index].join(" ").trim();
    if (!text) return [];
    const lineWithoutTranslations = { ...line };
    delete lineWithoutTranslations.translations;
    return [{ ...lineWithoutTranslations, text }];
  });
  return { lines, confidence };
}
