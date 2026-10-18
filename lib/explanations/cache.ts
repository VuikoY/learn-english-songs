import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { isExplanation, type Explanation } from "@/lib/types";
import { isLanguage, type Language } from "@/types/game";

type ExplanationCacheLookup = {
  youtubeId?: string;
  lineIndex: number;
  text: string;
  sourceLanguage: Language;
  targetLanguage: Language;
  context: string;
};

/** Read the shared Supabase explanation cache before calling the AI endpoint. */
export async function readExplanationCache({
  youtubeId,
  lineIndex,
  text,
  sourceLanguage,
  targetLanguage,
  context,
}: ExplanationCacheLookup): Promise<Explanation | null> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return null;

  let resolvedSourceLanguage = sourceLanguage;
  if (youtubeId) {
    const { data: song } = await supabase
      .from("songs")
      .select("id,language")
      .eq("youtube_id", youtubeId)
      .maybeSingle();

    if (song) {
      if (isLanguage(song.language)) resolvedSourceLanguage = song.language;
      const { data } = await supabase
        .from("line_explanations")
        .select("explanation_json")
        .eq("song_id", song.id)
        .eq("line_index", lineIndex)
        .eq("source_language", resolvedSourceLanguage)
        .eq("target_language", targetLanguage)
        .maybeSingle();
      if (data && isExplanation(data.explanation_json)) return data.explanation_json;
    }
  }

  const { data } = await supabase
    .from("line_explanations")
    .select("explanation_json")
    .eq("line_text", text.trim())
    .eq("source_language", resolvedSourceLanguage)
    .eq("target_language", targetLanguage)
    .eq("context", context)
    .maybeSingle();

  return data && isExplanation(data.explanation_json) ? data.explanation_json : null;
}
