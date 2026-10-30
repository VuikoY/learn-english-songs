import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";

export type SongTranscriptStats = {
  lineCount: number;
  wordCount: number;
};

function countTranscriptStats(lines: unknown): SongTranscriptStats | null {
  if (!Array.isArray(lines)) return null;

  const nonEmptyLines = lines.filter(
    (line): line is { text: string } =>
      typeof line === "object" &&
      line !== null &&
      "text" in line &&
      typeof line.text === "string" &&
      line.text.trim().length > 0,
  );
  const wordCount = nonEmptyLines.reduce(
    (total, line) =>
      total + Array.from(line.text.matchAll(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu)).length,
    0,
  );

  return { lineCount: nonEmptyLines.length, wordCount };
}

export async function fetchSongTranscriptStats(
  db: SupabaseClient<Database>,
  songIds: string[],
): Promise<Record<string, SongTranscriptStats>> {
  if (!songIds.length) return {};

  const { data, error } = await db
    .from("transcripts")
    .select("song_id,lines_json")
    .in("song_id", songIds);
  if (error) throw error;

  const stats: Record<string, SongTranscriptStats> = {};
  for (const transcript of data ?? []) {
    if (!transcript.song_id) continue;
    const summary = countTranscriptStats(transcript.lines_json);
    if (summary) stats[transcript.song_id] = summary;
  }
  return stats;
}
