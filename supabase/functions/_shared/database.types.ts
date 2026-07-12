// MED-7 (2026-07-12): Shared Supabase Database types for Edge Functions.
// Generated from src/integrations/supabase/types.ts (source of truth).
// Keep in sync when running: supabase gen types typescript --project-id <id>
//
// Only the tables accessed by Edge Functions are included here.
// Add new tables as Edge Functions grow.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      audit_logs: {
        Row: {
          action: string
          created_at: string
          details: Json | null
          entity_id: string | null
          entity_type: string | null
          id: string
          ip_address: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          ip_address?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          ip_address?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      webhook_reprocess_queue: {
        Row: {
          id: string
          connection_id: string | null
          payload: Json
          last_error: string | null
          attempts: number
          max_attempts: number
          next_retry_at: string
          status: 'pending' | 'processing' | 'failed' | 'completed'
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          connection_id?: string | null
          payload: Json
          last_error?: string | null
          attempts?: number
          max_attempts?: number
          next_retry_at?: string
          status?: 'pending' | 'processing' | 'failed' | 'completed'
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          connection_id?: string | null
          payload?: Json
          last_error?: string | null
          attempts?: number
          max_attempts?: number
          next_retry_at?: string
          status?: 'pending' | 'processing' | 'failed' | 'completed'
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "webhook_reprocess_queue_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_connections"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_connections: {
        Row: {
          api_type: string | null
          api_url: string | null
          auto_reconnect_enabled: boolean | null
          battery_level: number | null
          connected_at: string | null
          created_at: string
          created_by: string | null
          degraded_at: string | null
          disconnected_at: string | null
          evo_instance_id: string | null
          farewell_enabled: boolean | null
          farewell_message: string | null
          health_reason: string | null
          health_response_ms: number | null
          health_status: string | null
          id: string
          instance_id: string | null
          instance_name: string | null
          is_active: boolean | null
          is_default: boolean | null
          is_plugged: boolean | null
          last_connected_at: string | null
          last_health_check: string | null
          loop_protection_active: boolean | null
          max_reconnect_attempts: number | null
          max_retries: number | null
          name: string
          owner_jid: string | null
          phone_number: string
          qr_code: string | null
          reconnect_interval_seconds: number | null
          retry_count: number | null
          routing_mode: string | null
          settings: Json | null
          status: string | null
          updated_at: string
          webhook_url: string | null
        }
        Insert: {
          api_type?: string | null
          api_url?: string | null
          auto_reconnect_enabled?: boolean | null
          battery_level?: number | null
          connected_at?: string | null
          created_at?: string
          created_by?: string | null
          degraded_at?: string | null
          disconnected_at?: string | null
          evo_instance_id?: string | null
          farewell_enabled?: boolean | null
          farewell_message?: string | null
          health_reason?: string | null
          health_response_ms?: number | null
          health_status?: string | null
          id?: string
          instance_id?: string | null
          instance_name?: string | null
          is_active?: boolean | null
          is_default?: boolean | null
          is_plugged?: boolean | null
          last_connected_at?: string | null
          last_health_check?: string | null
          loop_protection_active?: boolean | null
          max_reconnect_attempts?: number | null
          max_retries?: number | null
          name: string
          owner_jid?: string | null
          phone_number: string
          qr_code?: string | null
          reconnect_interval_seconds?: number | null
          retry_count?: number | null
          routing_mode?: string | null
          settings?: Json | null
          status?: string | null
          updated_at?: string
          webhook_url?: string | null
        }
        Update: {
          api_type?: string | null
          api_url?: string | null
          auto_reconnect_enabled?: boolean | null
          battery_level?: number | null
          connected_at?: string | null
          created_at?: string
          created_by?: string | null
          degraded_at?: string | null
          disconnected_at?: string | null
          evo_instance_id?: string | null
          farewell_enabled?: boolean | null
          farewell_message?: string | null
          health_reason?: string | null
          health_response_ms?: number | null
          health_status?: string | null
          id?: string
          instance_id?: string | null
          instance_name?: string | null
          is_active?: boolean | null
          is_default?: boolean | null
          is_plugged?: boolean | null
          last_connected_at?: string | null
          last_health_check?: string | null
          loop_protection_active?: boolean | null
          max_reconnect_attempts?: number | null
          max_retries?: number | null
          name?: string
          owner_jid?: string | null
          phone_number?: string
          qr_code?: string | null
          reconnect_interval_seconds?: number | null
          retry_count?: number | null
          routing_mode?: string | null
          settings?: Json | null
          status?: string | null
          updated_at?: string
          webhook_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_connections_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}

// Convenience re-exports for use inside Edge Functions
export type WhatsappConnectionRow = Database['public']['Tables']['whatsapp_connections']['Row']
export type WhatsappConnectionInsert = Database['public']['Tables']['whatsapp_connections']['Insert']
export type WhatsappConnectionUpdate = Database['public']['Tables']['whatsapp_connections']['Update']

export type AuditLogRow = Database['public']['Tables']['audit_logs']['Row']
export type AuditLogInsert = Database['public']['Tables']['audit_logs']['Insert']

export type WebhookReprocessQueueRow = Database['public']['Tables']['webhook_reprocess_queue']['Row']
export type WebhookReprocessQueueUpdate = Database['public']['Tables']['webhook_reprocess_queue']['Update']
