
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "public": {
          Tables: {
            "collection_items": {
              Row: { id: string; collection_id: string; user_id: string; song_id: string; line_text: string; start_time: number; end_time: number; created_at: string }
              Insert: { id?: string; collection_id: string; user_id: string; song_id: string; line_text: string; start_time: number; end_time: number; created_at?: string }
              Update: { id?: string; collection_id?: string; user_id?: string; song_id?: string; line_text?: string; start_time?: number; end_time?: number; created_at?: string }
              Relationships: [
                { foreignKeyName: "collection_items_collection_id_fkey"; columns: ["collection_id"]; isOneToOne: false; referencedRelation: "word_collections"; referencedColumns: ["id"] },
                { foreignKeyName: "collection_items_song_id_fkey"; columns: ["song_id"]; isOneToOne: false; referencedRelation: "songs"; referencedColumns: ["id"] }
              ]
            }
            "word_collections": {
              Row: { id: string; user_id: string; title: string; is_public: boolean; created_at: string }
              Insert: { id?: string; user_id: string; title: string; is_public?: boolean; created_at?: string }
              Update: { id?: string; user_id?: string; title?: string; is_public?: boolean; created_at?: string }
              Relationships: []
            }
            "line_explanations": {
                  Row: {
                    "context": string,"created_at": string,"explanation_json": NonNullable<Json>,"id": string,"line_index": number | null,"line_text": string,"song_id": string | null,"source_language": string,"target_language": string
                  }
                  ComputedFields: never
                  Insert: {
                    "context"?: string,"created_at"?: string,"explanation_json": NonNullable<Json>,"id"?: string,"line_index"?: number | null,"line_text": string,"song_id"?: string | null,"source_language": string,"target_language": string
                  }
                  Update: {
                    "context"?: string,"created_at"?: string,"explanation_json"?: NonNullable<Json>,"id"?: string,"line_index"?: number | null,"line_text"?: string,"song_id"?: string | null,"source_language"?: string,"target_language"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "line_explanations_song_id_fkey"
      columns: ["song_id"]
isOneToOne: false
      referencedRelation: "songs"
      referencedColumns: ["id"]
    }
                  ]
                },"songs": {
                  Row: {
                    "artist": string | null,"content_type": string,"created_at": string,"created_by": string | null,"difficulty": string,"genre": string,"id": string,"is_public": boolean,"language": string,"raw_title": string | null,"thumbnail_url": string | null,"title": string,"youtube_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "artist"?: string | null,"content_type"?: string,"created_at"?: string,"created_by"?: string | null,"difficulty"?: string,"genre"?: string,"id"?: string,"is_public"?: boolean,"language"?: string,"raw_title"?: string | null,"thumbnail_url"?: string | null,"title": string,"youtube_id": string
                  }
                  Update: {
                    "artist"?: string | null,"content_type"?: string,"created_at"?: string,"created_by"?: string | null,"difficulty"?: string,"genre"?: string,"id"?: string,"is_public"?: boolean,"language"?: string,"raw_title"?: string | null,"thumbnail_url"?: string | null,"title"?: string,"youtube_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"transcripts": {
                  Row: {
                    "created_at": string,"id": string,"is_verified": boolean,"language": string | null,"lines_json": NonNullable<Json>,"song_id": string | null,"submitted_by": string | null,"updated_at": string,"verified": boolean,"video_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"is_verified"?: boolean,"language"?: string | null,"lines_json": NonNullable<Json>,"song_id"?: string | null,"submitted_by"?: string | null,"updated_at"?: string,"verified"?: boolean,"video_id"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"is_verified"?: boolean,"language"?: string | null,"lines_json"?: NonNullable<Json>,"song_id"?: string | null,"submitted_by"?: string | null,"updated_at"?: string,"verified"?: boolean,"video_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "transcripts_song_id_fkey"
      columns: ["song_id"]
isOneToOne: false
      referencedRelation: "songs"
      referencedColumns: ["id"]
    }
                  ]
                },"user_favorites": {
                  Row: {
                    "created_at": string,"song_id": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"song_id": string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"song_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "user_favorites_song_id_fkey"
      columns: ["song_id"]
isOneToOne: false
      referencedRelation: "songs"
      referencedColumns: ["id"]
    }
                  ]
                },"user_media_progress": {
                  Row: {
                    "accuracy": number,"completed_at": string | null,"difficulty": string,"id": string,"is_completed": boolean,"media_id": string,"mistakes_count": number,"total_words": number,"user_id": string,"words_completed": number
                  }
                  ComputedFields: never
                  Insert: {
                    "accuracy": number,"completed_at"?: string | null,"difficulty": string,"id"?: string,"is_completed"?: boolean,"media_id": string,"mistakes_count": number,"total_words": number,"user_id": string,"words_completed": number
                  }
                  Update: {
                    "accuracy"?: number,"completed_at"?: string | null,"difficulty"?: string,"id"?: string,"is_completed"?: boolean,"media_id"?: string,"mistakes_count"?: number,"total_words"?: number,"user_id"?: string,"words_completed"?: number
                  }
                  Relationships: [
                    {
                      foreignKeyName: "user_media_progress_media_id_fkey"
                      columns: ["media_id"]
                      isOneToOne: false
                      referencedRelation: "songs"
                      referencedColumns: ["id"]
                    }
                  ]
                },"user_phrase_mix_records": {
                  Row: { "all_time_best": number,"daily_best": number,"daily_date": string,"updated_at": string,"user_id": string }
                  Insert: { "all_time_best"?: number,"daily_best"?: number,"daily_date"?: string,"updated_at"?: string,"user_id": string }
                  Update: { "all_time_best"?: number,"daily_best"?: number,"daily_date"?: string,"updated_at"?: string,"user_id"?: string }
                  Relationships: []
                },"user_learning_activity": {
                  Row: { user_id: string; session_id: string; source: string; words_covered: number; occurred_at: string | null }
                  Insert: { user_id: string; session_id: string; source: string; words_covered: number; occurred_at?: string | null }
                  Update: { user_id?: string; session_id?: string; source?: string; words_covered?: number; occurred_at?: string | null }
                  Relationships: []
                },"user_daily_stats": {
                  Row: { user_id: string; date: string; words_count: number }
                  Insert: { user_id: string; date: string; words_count?: number }
                  Update: { user_id?: string; date?: string; words_count?: number }
                  Relationships: []
                },"user_settings": {
                  Row: {
                    "settings_json": NonNullable<Json>,"source_language": string,"target_language": string,"ui_language": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "settings_json"?: NonNullable<Json>,"source_language"?: string,"target_language"?: string,"ui_language"?: string,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "settings_json"?: NonNullable<Json>,"source_language"?: string,"target_language"?: string,"ui_language"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"vocabulary": {
                  Row: {
                    "context_sentence": string,"created_at": string,"grammar": string,"id": string,"original_text": string,"slang": string,"song_title": string | null,"source_language": string,"target_language": string,"translation": string,"user_id": string,"word": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "context_sentence"?: string,"created_at"?: string,"grammar": string,"id": string,"original_text": string,"slang"?: string,"song_title"?: string | null,"source_language": string,"target_language": string,"translation": string,"user_id": string,"word"?: never
                  }
                  Update: {
                    "context_sentence"?: string,"created_at"?: string,"grammar"?: string,"id"?: string,"original_text"?: string,"slang"?: string,"song_title"?: string | null,"source_language"?: string,"target_language"?: string,"translation"?: string,"user_id"?: string,"word"?: never
                  }
                  Relationships: [
                    
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "search_song_content": {
              Args: { search_query: string; source_language: string; result_limit?: number }
              Returns: {
                result_kind: string
                song_id: string
                youtube_id: string
                title: string
                artist: string | null
                thumbnail_url: string | null
                line_text: string | null
                context: string | null
                line_index: number | null
                start_time: number | null
                end_time: number | null
              }[]
            }
            "get_learning_leaderboard": {
              Args: Record<PropertyKey, never>
              Returns: {
                "average_accuracy": number
                "completed_media": number
                "hard_completed": number
                "pseudonym": string
                "words_covered": number
              }[]
            }
            "get_random_phrase_mix_line": {
              Args: { p_language: string; p_only_favorites: boolean; p_excluded_video_id?: string | null }
              Returns: { song_id: string; youtube_id: string; title: string; artist: string | null; line_index: number; line_text: string }[]
            }
            "save_phrase_mix_record": {
              Args: { p_streak: number }
              Returns: { daily_best: number; all_time_best: number; daily_date: string }[]
            }
            "save_learning_activity": {
              Args: { p_session_id: string; p_source: string; p_words_covered: number }
              Returns: undefined
            }
            "get_learning_word_totals": {
              Args: Record<PropertyKey, never>
              Returns: { words_covered: number; words_today: number }[]
            }
            "get_learning_daily_stats": {
              Args: { p_period: string }
              Returns: { activity_date: string; words_count: number }[]
            }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I
    }
    ? I
    : never
  : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U
    }
    ? U
    : never
  : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "public": {
          Enums: {
            
          }
        }
} as const
