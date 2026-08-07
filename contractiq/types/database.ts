/**
 * Hand-authored to match docs/specs/supabase-schema.sql exactly.
 * Regenerate via `npx supabase gen types typescript --project-id <ref> --schema public
 * > types/database.ts` once the Supabase CLI is authenticated against the project, then
 * diff against this file — the shape must stay identical to what's below.
 */

export type ContractType = 'nda' | 'msa'
export type ContractStatus = 'pending' | 'processing' | 'completed' | 'error'
export type MessageRole = 'user' | 'assistant'
export type FeedbackRating = 'up' | 'down'

export interface Database {
  public: {
    Tables: {
      contracts: {
        Row: {
          id: string
          user_id: string
          contract_type: ContractType
          file_name: string
          file_path: string | null
          contract_text: string
          page_count: number
          status: ContractStatus
          last_accessed_at: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          contract_type: ContractType
          file_name: string
          file_path?: string | null
          contract_text: string
          page_count: number
          status?: ContractStatus
          last_accessed_at?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          contract_type?: ContractType
          file_name?: string
          file_path?: string | null
          contract_text?: string
          page_count?: number
          status?: ContractStatus
          last_accessed_at?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: never[]
      }
      key_terms: {
        Row: {
          id: string
          contract_id: string
          user_id: string
          term_name: string
          value: string
          page_number: number
          confidence_score: number
          source_sentence: string
          is_custom: boolean
          original_ai_value: string | null
          edited: boolean
          edited_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          contract_id: string
          user_id: string
          term_name: string
          value: string
          page_number: number
          confidence_score: number
          source_sentence: string
          is_custom?: boolean
          original_ai_value?: string | null
          edited?: boolean
          edited_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          contract_id?: string
          user_id?: string
          term_name?: string
          value?: string
          page_number?: number
          confidence_score?: number
          source_sentence?: string
          is_custom?: boolean
          original_ai_value?: string | null
          edited?: boolean
          edited_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: never[]
      }
      custom_key_terms: {
        Row: {
          id: string
          contract_id: string
          user_id: string
          term_name: string
          created_at: string
        }
        Insert: {
          id?: string
          contract_id: string
          user_id: string
          term_name: string
          created_at?: string
        }
        Update: {
          id?: string
          contract_id?: string
          user_id?: string
          term_name?: string
          created_at?: string
        }
        Relationships: never[]
      }
      chat_sessions: {
        Row: {
          id: string
          contract_id: string
          user_id: string
          created_at: string
        }
        Insert: {
          id?: string
          contract_id: string
          user_id: string
          created_at?: string
        }
        Update: {
          id?: string
          contract_id?: string
          user_id?: string
          created_at?: string
        }
        Relationships: never[]
      }
      chat_messages: {
        Row: {
          id: string
          session_id: string
          user_id: string
          role: MessageRole
          content: string
          page_citation: number | null
          created_at: string
        }
        Insert: {
          id?: string
          session_id: string
          user_id: string
          role: MessageRole
          content: string
          page_citation?: number | null
          created_at?: string
        }
        Update: {
          id?: string
          session_id?: string
          user_id?: string
          role?: MessageRole
          content?: string
          page_citation?: number | null
          created_at?: string
        }
        Relationships: never[]
      }
      user_feedback: {
        Row: {
          id: string
          contract_id: string
          user_id: string
          rating: FeedbackRating
          comment: string | null
          created_at: string
        }
        Insert: {
          id?: string
          contract_id: string
          user_id: string
          rating: FeedbackRating
          comment?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          contract_id?: string
          user_id?: string
          rating?: FeedbackRating
          comment?: string | null
          created_at?: string
        }
        Relationships: never[]
      }
      rate_limit_events: {
        Row: {
          id: string
          user_id: string
          route_key: string
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          route_key: string
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          route_key?: string
          created_at?: string
        }
        Relationships: never[]
      }
      app_config: {
        Row: {
          key: string
          value: string
          updated_at: string
        }
        Insert: {
          key: string
          value: string
          updated_at?: string
        }
        Update: {
          key?: string
          value?: string
          updated_at?: string
        }
        Relationships: never[]
      }
    }
    Views: {
      term_corrections: {
        Row: {
          id: string
          contract_id: string
          user_id: string
          term_name: string
          original_ai_value: string | null
          corrected_value: string
          edited_at: string | null
        }
        Relationships: never[]
      }
    }
    Functions: Record<string, never>
    Enums: {
      contract_type: ContractType
      contract_status: ContractStatus
      message_role: MessageRole
      feedback_rating: FeedbackRating
    }
    CompositeTypes: Record<string, never>
  }
}
