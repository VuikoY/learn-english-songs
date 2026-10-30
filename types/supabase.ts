
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "public": {
          Tables: {
            "favorite_lines": {
              Row: { id: string; user_id: string; song_id: string; line_index: number; line_text: string; start_time: number; end_time: number; created_at: string }
              Insert: { id?: string; user_id: string; song_id: string; line_index: number; line_text: string; start_time: number; end_time: number; created_at?: string }
              Update: { id?: string; user_id?: string; song_id?: string; line_index?: number; line_text?: string; start_time?: number; end_time?: number; created_at?: string }
              Relationships: [{ foreignKeyName: "favorite_lines_song_id_fkey"; columns: ["song_id"]; isOneToOne: false; referencedRelation: "songs"; referencedColumns: ["id"] }]
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
                    "content_type": string,"created_at": string,"created_by": string | null,"difficulty": string,"genre": string,"id": string,"is_public": boolean,"language": string,"thumbnail_url": string | null,"title": string,"youtube_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "content_type"?: string,"created_at"?: string,"created_by"?: string | null,"difficulty"?: string,"genre"?: string,"id"?: string,"is_public"?: boolean,"language"?: string,"thumbnail_url"?: string | null,"title": string,"youtube_id": string
                  }
                  Update: {
                    "content_type"?: string,"created_at"?: string,"created_by"?: string | null,"difficulty"?: string,"genre"?: string,"id"?: string,"is_public"?: boolean,"language"?: string,"thumbnail_url"?: string | null,"title"?: string,"youtube_id"?: string
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
            "get_learning_leaderboard": {
              Args: Record<PropertyKey, never>
              Returns: {
                "average_accuracy": number
                "completed_media": number
                "hard_completed": number
                "pseudonym": string
              }[]
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
