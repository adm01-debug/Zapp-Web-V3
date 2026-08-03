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
      _ck_viol_audit: {
        Row: {
          conname: string | null
          def: string | null
          status: string | null
          tbl: string | null
          violations: number | null
        }
        Insert: {
          conname?: string | null
          def?: string | null
          status?: string | null
          tbl?: string | null
          violations?: number | null
        }
        Update: {
          conname?: string | null
          def?: string | null
          status?: string | null
          tbl?: string | null
          violations?: number | null
        }
        Relationships: []
      }
      _fk_orphan_audit: {
        Row: {
          child_rows_est: number | null
          child_table: string | null
          conname: string | null
          fk_cols: string | null
          orphans: number | null
          parent_table: string | null
          status: string | null
        }
        Insert: {
          child_rows_est?: number | null
          child_table?: string | null
          conname?: string | null
          fk_cols?: string | null
          orphans?: number | null
          parent_table?: string | null
          status?: string | null
        }
        Update: {
          child_rows_est?: number | null
          child_table?: string | null
          conname?: string | null
          fk_cols?: string | null
          orphans?: number | null
          parent_table?: string | null
          status?: string | null
        }
        Relationships: []
      }
      _msg_shard_orphan_audit: {
        Row: {
          col: string | null
          orphans: number | null
          status: string | null
          tbl: string | null
        }
        Insert: {
          col?: string | null
          orphans?: number | null
          status?: string | null
          tbl?: string | null
        }
        Update: {
          col?: string | null
          orphans?: number | null
          status?: string | null
          tbl?: string | null
        }
        Relationships: []
      }
      _wal_slot_guard_events: {
        Row: {
          action_taken: string
          details: Json
          detected_at: string
          frozen_sec: number | null
          id: number
          lag_mb: number | null
          slot_name: string
        }
        Insert: {
          action_taken: string
          details?: Json
          detected_at?: string
          frozen_sec?: number | null
          id?: number
          lag_mb?: number | null
          slot_name: string
        }
        Update: {
          action_taken?: string
          details?: Json
          detected_at?: string
          frozen_sec?: number | null
          id?: number
          lag_mb?: number | null
          slot_name?: string
        }
        Relationships: []
      }
    }
    Views: {
      agent_achievements: {
        Row: {
          achievement_description: string | null
          achievement_name: string | null
          achievement_type: string | null
          earned_at: string | null
          id: string | null
          profile_id: string | null
          xp_earned: number | null
        }
        Insert: {
          achievement_description?: string | null
          achievement_name?: string | null
          achievement_type?: string | null
          earned_at?: string | null
          id?: string | null
          profile_id?: string | null
          xp_earned?: number | null
        }
        Update: {
          achievement_description?: string | null
          achievement_name?: string | null
          achievement_type?: string | null
          earned_at?: string | null
          id?: string | null
          profile_id?: string | null
          xp_earned?: number | null
        }
        Relationships: []
      }
      agent_installed_skills: {
        Row: {
          agent_id: string | null
          config_overrides: Json | null
          id: string | null
          installed_at: string | null
          skill_id: string | null
        }
        Insert: {
          agent_id?: string | null
          config_overrides?: Json | null
          id?: string | null
          installed_at?: string | null
          skill_id?: string | null
        }
        Update: {
          agent_id?: string | null
          config_overrides?: Json | null
          id?: string | null
          installed_at?: string | null
          skill_id?: string | null
        }
        Relationships: []
      }
      agent_memories: {
        Row: {
          content: string | null
          created_at: string | null
          id: string | null
          memory_type: string | null
          relevance_score: number | null
          source: string | null
          updated_at: string | null
          workspace_id: string | null
        }
        Insert: {
          content?: string | null
          created_at?: string | null
          id?: string | null
          memory_type?: string | null
          relevance_score?: number | null
          source?: string | null
          updated_at?: string | null
          workspace_id?: string | null
        }
        Update: {
          content?: string | null
          created_at?: string | null
          id?: string | null
          memory_type?: string | null
          relevance_score?: number | null
          source?: string | null
          updated_at?: string | null
          workspace_id?: string | null
        }
        Relationships: []
      }
      agent_permissions: {
        Row: {
          agent_id: string | null
          created_at: string | null
          granted_by: string | null
          id: string | null
          permission_level: string | null
          user_id: string | null
        }
        Insert: {
          agent_id?: string | null
          created_at?: string | null
          granted_by?: string | null
          id?: string | null
          permission_level?: string | null
          user_id?: string | null
        }
        Update: {
          agent_id?: string | null
          created_at?: string | null
          granted_by?: string | null
          id?: string | null
          permission_level?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      agent_presence: {
        Row: {
          active_conversations: number | null
          current_queue_id: string | null
          id: string | null
          last_activity_at: string | null
          max_conversations: number | null
          status: string | null
          status_message: string | null
          updated_at: string | null
          user_id: string | null
          went_offline_at: string | null
          went_online_at: string | null
        }
        Insert: {
          active_conversations?: number | null
          current_queue_id?: string | null
          id?: string | null
          last_activity_at?: string | null
          max_conversations?: number | null
          status?: string | null
          status_message?: string | null
          updated_at?: string | null
          user_id?: string | null
          went_offline_at?: string | null
          went_online_at?: string | null
        }
        Update: {
          active_conversations?: number | null
          current_queue_id?: string | null
          id?: string | null
          last_activity_at?: string | null
          max_conversations?: number | null
          status?: string | null
          status_message?: string | null
          updated_at?: string | null
          user_id?: string | null
          went_offline_at?: string | null
          went_online_at?: string | null
        }
        Relationships: []
      }
      agent_skills: {
        Row: {
          agent_id: string | null
          confidence: number | null
          created_at: string | null
          description: string | null
          failure_count: number | null
          id: string | null
          pattern: string | null
          profile_id: string | null
          skill_level: number | null
          skill_name: string | null
          source_trace_id: string | null
          success_count: number | null
          updated_at: string | null
        }
        Insert: {
          agent_id?: string | null
          confidence?: number | null
          created_at?: string | null
          description?: string | null
          failure_count?: number | null
          id?: string | null
          pattern?: string | null
          profile_id?: string | null
          skill_level?: number | null
          skill_name?: string | null
          source_trace_id?: string | null
          success_count?: number | null
          updated_at?: string | null
        }
        Update: {
          agent_id?: string | null
          confidence?: number | null
          created_at?: string | null
          description?: string | null
          failure_count?: number | null
          id?: string | null
          pattern?: string | null
          profile_id?: string | null
          skill_level?: number | null
          skill_name?: string | null
          source_trace_id?: string | null
          success_count?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      agent_stats: {
        Row: {
          achievements_count: number | null
          avg_response_time_seconds: number | null
          best_streak: number | null
          conversations_resolved: number | null
          created_at: string | null
          current_streak: number | null
          customer_satisfaction_score: number | null
          id: string | null
          level: number | null
          messages_received: number | null
          messages_sent: number | null
          profile_id: string | null
          updated_at: string | null
          xp: number | null
        }
        Insert: {
          achievements_count?: number | null
          avg_response_time_seconds?: number | null
          best_streak?: number | null
          conversations_resolved?: number | null
          created_at?: string | null
          current_streak?: number | null
          customer_satisfaction_score?: number | null
          id?: string | null
          level?: number | null
          messages_received?: number | null
          messages_sent?: number | null
          profile_id?: string | null
          updated_at?: string | null
          xp?: number | null
        }
        Update: {
          achievements_count?: number | null
          avg_response_time_seconds?: number | null
          best_streak?: number | null
          conversations_resolved?: number | null
          created_at?: string | null
          current_streak?: number | null
          customer_satisfaction_score?: number | null
          id?: string | null
          level?: number | null
          messages_received?: number | null
          messages_sent?: number | null
          profile_id?: string | null
          updated_at?: string | null
          xp?: number | null
        }
        Relationships: []
      }
      agent_templates: {
        Row: {
          category: string | null
          config: Json | null
          created_at: string | null
          created_by: string | null
          description: string | null
          icon: string | null
          id: string | null
          is_public: boolean | null
          name: string | null
          usage_count: number | null
        }
        Insert: {
          category?: string | null
          config?: Json | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          icon?: string | null
          id?: string | null
          is_public?: boolean | null
          name?: string | null
          usage_count?: number | null
        }
        Update: {
          category?: string | null
          config?: Json | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          icon?: string | null
          id?: string | null
          is_public?: boolean | null
          name?: string | null
          usage_count?: number | null
        }
        Relationships: []
      }
      agent_traces: {
        Row: {
          agent_id: string | null
          cost_usd: number | null
          created_at: string | null
          event: string | null
          id: string | null
          input: Json | null
          latency_ms: number | null
          level: "debug" | "info" | "warning" | "error" | "critical" | null
          metadata: Json | null
          output: Json | null
          session_id: string | null
          tokens_used: number | null
          user_id: string | null
        }
        Insert: {
          agent_id?: string | null
          cost_usd?: number | null
          created_at?: string | null
          event?: string | null
          id?: string | null
          input?: Json | null
          latency_ms?: number | null
          level?: "debug" | "info" | "warning" | "error" | "critical" | null
          metadata?: Json | null
          output?: Json | null
          session_id?: string | null
          tokens_used?: number | null
          user_id?: string | null
        }
        Update: {
          agent_id?: string | null
          cost_usd?: number | null
          created_at?: string | null
          event?: string | null
          id?: string | null
          input?: Json | null
          latency_ms?: number | null
          level?: "debug" | "info" | "warning" | "error" | "critical" | null
          metadata?: Json | null
          output?: Json | null
          session_id?: string | null
          tokens_used?: number | null
          user_id?: string | null
        }
        Relationships: []
      }
      agent_usage: {
        Row: {
          agent_id: string | null
          avg_latency_ms: number | null
          created_at: string | null
          date: string | null
          error_count: number | null
          id: string | null
          requests: number | null
          tokens_input: number | null
          tokens_output: number | null
          total_cost_usd: number | null
          user_id: string | null
        }
        Insert: {
          agent_id?: string | null
          avg_latency_ms?: number | null
          created_at?: string | null
          date?: string | null
          error_count?: number | null
          id?: string | null
          requests?: number | null
          tokens_input?: number | null
          tokens_output?: number | null
          total_cost_usd?: number | null
          user_id?: string | null
        }
        Update: {
          agent_id?: string | null
          avg_latency_ms?: number | null
          created_at?: string | null
          date?: string | null
          error_count?: number | null
          id?: string | null
          requests?: number | null
          tokens_input?: number | null
          tokens_output?: number | null
          total_cost_usd?: number | null
          user_id?: string | null
        }
        Relationships: []
      }
      agent_versions: {
        Row: {
          agent_id: string | null
          change_summary: string | null
          config: Json | null
          created_at: string | null
          created_by: string | null
          id: string | null
          mission: string | null
          model: string | null
          name: string | null
          persona: string | null
          version: number | null
        }
        Insert: {
          agent_id?: string | null
          change_summary?: string | null
          config?: Json | null
          created_at?: string | null
          created_by?: string | null
          id?: string | null
          mission?: string | null
          model?: string | null
          name?: string | null
          persona?: string | null
          version?: number | null
        }
        Update: {
          agent_id?: string | null
          change_summary?: string | null
          config?: Json | null
          created_at?: string | null
          created_by?: string | null
          id?: string | null
          mission?: string | null
          model?: string | null
          name?: string | null
          persona?: string | null
          version?: number | null
        }
        Relationships: []
      }
      agent_visibility_grants: {
        Row: {
          agent_id: string | null
          can_see_agent_id: string | null
          created_at: string | null
          granted_by: string | null
          id: string | null
        }
        Insert: {
          agent_id?: string | null
          can_see_agent_id?: string | null
          created_at?: string | null
          granted_by?: string | null
          id?: string | null
        }
        Update: {
          agent_id?: string | null
          can_see_agent_id?: string | null
          created_at?: string | null
          granted_by?: string | null
          id?: string | null
        }
        Relationships: []
      }
      agents: {
        Row: {
          avatar_emoji: string | null
          config: Json | null
          created_at: string | null
          id: string | null
          is_template: boolean | null
          mission: string | null
          model: string | null
          name: string | null
          persona: string | null
          reasoning: string | null
          status:
            | "draft"
            | "configured"
            | "testing"
            | "staging"
            | "review"
            | "production"
            | "monitoring"
            | "deprecated"
            | "archived"
            | null
          tags: string[] | null
          template_category: string | null
          updated_at: string | null
          user_id: string | null
          version: number | null
          workspace_id: string | null
        }
        Insert: {
          avatar_emoji?: string | null
          config?: Json | null
          created_at?: string | null
          id?: string | null
          is_template?: boolean | null
          mission?: string | null
          model?: string | null
          name?: string | null
          persona?: string | null
          reasoning?: string | null
          status?:
            | "draft"
            | "configured"
            | "testing"
            | "staging"
            | "review"
            | "production"
            | "monitoring"
            | "deprecated"
            | "archived"
            | null
          tags?: string[] | null
          template_category?: string | null
          updated_at?: string | null
          user_id?: string | null
          version?: number | null
          workspace_id?: string | null
        }
        Update: {
          avatar_emoji?: string | null
          config?: Json | null
          created_at?: string | null
          id?: string | null
          is_template?: boolean | null
          mission?: string | null
          model?: string | null
          name?: string | null
          persona?: string | null
          reasoning?: string | null
          status?:
            | "draft"
            | "configured"
            | "testing"
            | "staging"
            | "review"
            | "production"
            | "monitoring"
            | "deprecated"
            | "archived"
            | null
          tags?: string[] | null
          template_category?: string | null
          updated_at?: string | null
          user_id?: string | null
          version?: number | null
          workspace_id?: string | null
        }
        Relationships: []
      }
      ai_conversation_tags: {
        Row: {
          confidence: number | null
          contact_id: string | null
          created_at: string | null
          id: string | null
          source: string | null
          tag_name: string | null
        }
        Insert: {
          confidence?: number | null
          contact_id?: string | null
          created_at?: string | null
          id?: string | null
          source?: string | null
          tag_name?: string | null
        }
        Update: {
          confidence?: number | null
          contact_id?: string | null
          created_at?: string | null
          id?: string | null
          source?: string | null
          tag_name?: string | null
        }
        Relationships: []
      }
      alert_channels: {
        Row: {
          channel_type: string | null
          config: Json | null
          created_at: string | null
          id: number | null
          is_active: boolean | null
          min_severity: string | null
          name: string | null
        }
        Insert: {
          channel_type?: string | null
          config?: Json | null
          created_at?: string | null
          id?: number | null
          is_active?: boolean | null
          min_severity?: string | null
          name?: string | null
        }
        Update: {
          channel_type?: string | null
          config?: Json | null
          created_at?: string | null
          id?: number | null
          is_active?: boolean | null
          min_severity?: string | null
          name?: string | null
        }
        Relationships: []
      }
      alert_dispatch_state: {
        Row: {
          alert_key: string | null
          count_1h: number | null
          last_sent_at: string | null
          last_severity: string | null
        }
        Insert: {
          alert_key?: string | null
          count_1h?: number | null
          last_sent_at?: string | null
          last_severity?: string | null
        }
        Update: {
          alert_key?: string | null
          count_1h?: number | null
          last_sent_at?: string | null
          last_severity?: string | null
        }
        Relationships: []
      }
      alerts: {
        Row: {
          agent_id: string | null
          created_at: string | null
          id: string | null
          is_resolved: boolean | null
          message: string | null
          resolved_at: string | null
          severity: string | null
          title: string | null
          workspace_id: string | null
        }
        Insert: {
          agent_id?: string | null
          created_at?: string | null
          id?: string | null
          is_resolved?: boolean | null
          message?: string | null
          resolved_at?: string | null
          severity?: string | null
          title?: string | null
          workspace_id?: string | null
        }
        Update: {
          agent_id?: string | null
          created_at?: string | null
          id?: string | null
          is_resolved?: boolean | null
          message?: string | null
          resolved_at?: string | null
          severity?: string | null
          title?: string | null
          workspace_id?: string | null
        }
        Relationships: []
      }
      allowed_countries: {
        Row: {
          added_by: string | null
          country_code: string | null
          country_name: string | null
          created_at: string | null
          id: string | null
        }
        Insert: {
          added_by?: string | null
          country_code?: string | null
          country_name?: string | null
          created_at?: string | null
          id?: string | null
        }
        Update: {
          added_by?: string | null
          country_code?: string | null
          country_name?: string | null
          created_at?: string | null
          id?: string | null
        }
        Relationships: []
      }
      api_keys: {
        Row: {
          created_at: string | null
          id: string | null
          is_active: boolean | null
          key_hash: string | null
          key_prefix: string | null
          last_used_at: string | null
          name: string | null
          scopes: string[] | null
          updated_at: string | null
          user_id: string | null
          workspace_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string | null
          is_active?: boolean | null
          key_hash?: string | null
          key_prefix?: string | null
          last_used_at?: string | null
          name?: string | null
          scopes?: string[] | null
          updated_at?: string | null
          user_id?: string | null
          workspace_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string | null
          is_active?: boolean | null
          key_hash?: string | null
          key_prefix?: string | null
          last_used_at?: string | null
          name?: string | null
          scopes?: string[] | null
          updated_at?: string | null
          user_id?: string | null
          workspace_id?: string | null
        }
        Relationships: []
      }
      app_error_logs: {
        Row: {
          component_stack: string | null
          created_at: string | null
          error_id: string | null
          id: string | null
          message: string | null
          module: string | null
          stack: string | null
          timestamp: string | null
          url: string | null
          user_agent: string | null
        }
        Insert: {
          component_stack?: string | null
          created_at?: string | null
          error_id?: string | null
          id?: string | null
          message?: string | null
          module?: string | null
          stack?: string | null
          timestamp?: string | null
          url?: string | null
          user_agent?: string | null
        }
        Update: {
          component_stack?: string | null
          created_at?: string | null
          error_id?: string | null
          id?: string | null
          message?: string | null
          module?: string | null
          stack?: string | null
          timestamp?: string | null
          url?: string | null
          user_agent?: string | null
        }
        Relationships: []
      }
      app_notifications: {
        Row: {
          action_url: string | null
          body: string | null
          created_at: string | null
          entity_id: string | null
          entity_type: string | null
          id: string | null
          is_read: boolean | null
          metadata: Json | null
          title: string | null
          type: string | null
          user_id: string | null
        }
        Insert: {
          action_url?: string | null
          body?: string | null
          created_at?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string | null
          is_read?: boolean | null
          metadata?: Json | null
          title?: string | null
          type?: string | null
          user_id?: string | null
        }
        Update: {
          action_url?: string | null
          body?: string | null
          created_at?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string | null
          is_read?: boolean | null
          metadata?: Json | null
          title?: string | null
          type?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      app_settings: {
        Row: {
          created_at: string | null
          description: string | null
          id: string | null
          key: string | null
          updated_at: string | null
          value: Json | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string | null
          key?: string | null
          updated_at?: string | null
          value?: Json | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string | null
          key?: string | null
          updated_at?: string | null
          value?: Json | null
        }
        Relationships: []
      }
      audio_meme_categories: {
        Row: {
          emoji: string | null
          id: string | null
          is_active: boolean | null
          label_en: string | null
          label_pt: string | null
          meme_count: number | null
          slug: string | null
          sort_order: number | null
          total_uses: number | null
        }
        Insert: {
          emoji?: string | null
          id?: string | null
          is_active?: boolean | null
          label_en?: string | null
          label_pt?: string | null
          meme_count?: number | null
          slug?: string | null
          sort_order?: number | null
          total_uses?: number | null
        }
        Update: {
          emoji?: string | null
          id?: string | null
          is_active?: boolean | null
          label_en?: string | null
          label_pt?: string | null
          meme_count?: number | null
          slug?: string | null
          sort_order?: number | null
          total_uses?: number | null
        }
        Relationships: []
      }
      audio_meme_favorites: {
        Row: {
          created_at: string | null
          id: string | null
          meme_id: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string | null
          meme_id?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string | null
          meme_id?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      audio_memes: {
        Row: {
          audio_url: string | null
          category: string | null
          created_at: string | null
          duration_seconds: number | null
          file_hash: string | null
          file_size: number | null
          id: string | null
          is_active: boolean | null
          is_favorite: boolean | null
          mime_type: string | null
          name: string | null
          owner_id: string | null
          tags: string[] | null
          updated_at: string | null
          uploaded_by: string | null
          use_count: number | null
        }
        Insert: {
          audio_url?: string | null
          category?: string | null
          created_at?: string | null
          duration_seconds?: number | null
          file_hash?: string | null
          file_size?: number | null
          id?: string | null
          is_active?: boolean | null
          is_favorite?: boolean | null
          mime_type?: string | null
          name?: string | null
          owner_id?: string | null
          tags?: string[] | null
          updated_at?: string | null
          uploaded_by?: string | null
          use_count?: number | null
        }
        Update: {
          audio_url?: string | null
          category?: string | null
          created_at?: string | null
          duration_seconds?: number | null
          file_hash?: string | null
          file_size?: number | null
          id?: string | null
          is_active?: boolean | null
          is_favorite?: boolean | null
          mime_type?: string | null
          name?: string | null
          owner_id?: string | null
          tags?: string[] | null
          updated_at?: string | null
          uploaded_by?: string | null
          use_count?: number | null
        }
        Relationships: []
      }
      audit_log_tables: {
        Row: {
          changed_by: string | null
          changed_fields: Json | null
          created_at: string | null
          id: number | null
          new_values: Json | null
          old_values: Json | null
          operation: string | null
          row_id: string | null
          tbl_name: string | null
        }
        Insert: {
          changed_by?: string | null
          changed_fields?: Json | null
          created_at?: string | null
          id?: number | null
          new_values?: Json | null
          old_values?: Json | null
          operation?: string | null
          row_id?: string | null
          tbl_name?: string | null
        }
        Update: {
          changed_by?: string | null
          changed_fields?: Json | null
          created_at?: string | null
          id?: number | null
          new_values?: Json | null
          old_values?: Json | null
          operation?: string | null
          row_id?: string | null
          tbl_name?: string | null
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          action: string | null
          created_at: string | null
          details: Json | null
          entity_id: string | null
          entity_type: string | null
          event_type: string | null
          id: string | null
          ip_address: string | null
          resource: string | null
          status: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          action?: string | null
          created_at?: string | null
          details?: Json | null
          entity_id?: string | null
          entity_type?: string | null
          event_type?: string | null
          id?: string | null
          ip_address?: string | null
          resource?: string | null
          status?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string | null
          created_at?: string | null
          details?: Json | null
          entity_id?: string | null
          entity_type?: string | null
          event_type?: string | null
          id?: string | null
          ip_address?: string | null
          resource?: string | null
          status?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      audit_results: {
        Row: {
          audit_name: string | null
          created_at: string | null
          id: number | null
          result: Json | null
        }
        Insert: {
          audit_name?: string | null
          created_at?: string | null
          id?: number | null
          result?: Json | null
        }
        Update: {
          audit_name?: string | null
          created_at?: string | null
          id?: number | null
          result?: Json | null
        }
        Relationships: []
      }
      auto_close_config: {
        Row: {
          close_message: string | null
          created_at: string | null
          id: string | null
          inactivity_hours: number | null
          is_enabled: boolean | null
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          close_message?: string | null
          created_at?: string | null
          id?: string | null
          inactivity_hours?: number | null
          is_enabled?: boolean | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          close_message?: string | null
          created_at?: string | null
          id?: string | null
          inactivity_hours?: number | null
          is_enabled?: boolean | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: []
      }
      automation_executions: {
        Row: {
          acted_at: string | null
          acted_by: string | null
          applied_tags: string[] | null
          assigned_to: string | null
          automation_id: string | null
          channel_id: string | null
          contact_id: string | null
          created_at: string | null
          department_id: string | null
          error_at: string | null
          error_message: string | null
          executed_at: string | null
          id: string | null
          instance_name: string | null
          kb_sources: string[] | null
          reassigned_to: string | null
          recommended_tag: string | null
          remote_jid: string | null
          result: Json | null
          rule_id: string | null
          rule_snapshot: Json | null
          status: string | null
          suggestion_text: string | null
          trigger_event: string | null
          trigger_payload: Json | null
        }
        Insert: {
          acted_at?: string | null
          acted_by?: string | null
          applied_tags?: string[] | null
          assigned_to?: string | null
          automation_id?: string | null
          channel_id?: string | null
          contact_id?: string | null
          created_at?: string | null
          department_id?: string | null
          error_at?: string | null
          error_message?: string | null
          executed_at?: string | null
          id?: string | null
          instance_name?: string | null
          kb_sources?: string[] | null
          reassigned_to?: string | null
          recommended_tag?: string | null
          remote_jid?: string | null
          result?: Json | null
          rule_id?: string | null
          rule_snapshot?: Json | null
          status?: string | null
          suggestion_text?: string | null
          trigger_event?: string | null
          trigger_payload?: Json | null
        }
        Update: {
          acted_at?: string | null
          acted_by?: string | null
          applied_tags?: string[] | null
          assigned_to?: string | null
          automation_id?: string | null
          channel_id?: string | null
          contact_id?: string | null
          created_at?: string | null
          department_id?: string | null
          error_at?: string | null
          error_message?: string | null
          executed_at?: string | null
          id?: string | null
          instance_name?: string | null
          kb_sources?: string[] | null
          reassigned_to?: string | null
          recommended_tag?: string | null
          remote_jid?: string | null
          result?: Json | null
          rule_id?: string | null
          rule_snapshot?: Json | null
          status?: string | null
          suggestion_text?: string | null
          trigger_event?: string | null
          trigger_payload?: Json | null
        }
        Relationships: []
      }
      automation_rules: {
        Row: {
          actions: Json | null
          channel_id: string | null
          conditions: Json | null
          cooldown_seconds: number | null
          created_at: string | null
          created_by: string | null
          department_id: string | null
          description: string | null
          execution_count: number | null
          id: string | null
          is_active: boolean | null
          last_executed_at: string | null
          name: string | null
          priority: number | null
          trigger_config: Json | null
          trigger_type: string | null
          updated_at: string | null
        }
        Insert: {
          actions?: Json | null
          channel_id?: string | null
          conditions?: Json | null
          cooldown_seconds?: number | null
          created_at?: string | null
          created_by?: string | null
          department_id?: string | null
          description?: string | null
          execution_count?: number | null
          id?: string | null
          is_active?: boolean | null
          last_executed_at?: string | null
          name?: string | null
          priority?: number | null
          trigger_config?: Json | null
          trigger_type?: string | null
          updated_at?: string | null
        }
        Update: {
          actions?: Json | null
          channel_id?: string | null
          conditions?: Json | null
          cooldown_seconds?: number | null
          created_at?: string | null
          created_by?: string | null
          department_id?: string | null
          description?: string | null
          execution_count?: number | null
          id?: string | null
          is_active?: boolean | null
          last_executed_at?: string | null
          name?: string | null
          priority?: number | null
          trigger_config?: Json | null
          trigger_type?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      automations: {
        Row: {
          actions: Json | null
          channel_id: string | null
          cooldown_seconds: number | null
          created_at: string | null
          created_by: string | null
          department_id: string | null
          description: string | null
          id: string | null
          is_active: boolean | null
          last_triggered_at: string | null
          name: string | null
          priority: number | null
          trigger_config: Json | null
          trigger_count: number | null
          trigger_type: string | null
          updated_at: string | null
        }
        Insert: {
          actions?: Json | null
          channel_id?: string | null
          cooldown_seconds?: number | null
          created_at?: string | null
          created_by?: string | null
          department_id?: string | null
          description?: string | null
          id?: string | null
          is_active?: boolean | null
          last_triggered_at?: string | null
          name?: string | null
          priority?: number | null
          trigger_config?: Json | null
          trigger_count?: number | null
          trigger_type?: string | null
          updated_at?: string | null
        }
        Update: {
          actions?: Json | null
          channel_id?: string | null
          cooldown_seconds?: number | null
          created_at?: string | null
          created_by?: string | null
          department_id?: string | null
          description?: string | null
          id?: string | null
          is_active?: boolean | null
          last_triggered_at?: string | null
          name?: string | null
          priority?: number | null
          trigger_config?: Json | null
          trigger_count?: number | null
          trigger_type?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      avatars: {
        Row: {
          created_at: string | null
          id: string | null
          is_default: boolean | null
          name: string | null
          updated_at: string | null
          url: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string | null
          is_default?: boolean | null
          name?: string | null
          updated_at?: string | null
          url?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string | null
          is_default?: boolean | null
          name?: string | null
          updated_at?: string | null
          url?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      away_messages: {
        Row: {
          content: string | null
          created_at: string | null
          id: string | null
          is_enabled: boolean | null
          updated_at: string | null
          whatsapp_connection_id: string | null
        }
        Insert: {
          content?: string | null
          created_at?: string | null
          id?: string | null
          is_enabled?: boolean | null
          updated_at?: string | null
          whatsapp_connection_id?: string | null
        }
        Update: {
          content?: string | null
          created_at?: string | null
          id?: string | null
          is_enabled?: boolean | null
          updated_at?: string | null
          whatsapp_connection_id?: string | null
        }
        Relationships: []
      }
      batch_jobs: {
        Row: {
          completed_at: string | null
          config: Json | null
          created_at: string | null
          error: string | null
          failed_items: number | null
          id: string | null
          processed_items: number | null
          started_at: string | null
          status: string | null
          total_items: number | null
          type: string | null
          workspace_id: string | null
        }
        Insert: {
          completed_at?: string | null
          config?: Json | null
          created_at?: string | null
          error?: string | null
          failed_items?: number | null
          id?: string | null
          processed_items?: number | null
          started_at?: string | null
          status?: string | null
          total_items?: number | null
          type?: string | null
          workspace_id?: string | null
        }
        Update: {
          completed_at?: string | null
          config?: Json | null
          created_at?: string | null
          error?: string | null
          failed_items?: number | null
          id?: string | null
          processed_items?: number | null
          started_at?: string | null
          status?: string | null
          total_items?: number | null
          type?: string | null
          workspace_id?: string | null
        }
        Relationships: []
      }
      blocked_countries: {
        Row: {
          blocked_by: string | null
          country_code: string | null
          country_name: string | null
          created_at: string | null
          id: string | null
          reason: string | null
        }
        Insert: {
          blocked_by?: string | null
          country_code?: string | null
          country_name?: string | null
          created_at?: string | null
          id?: string | null
          reason?: string | null
        }
        Update: {
          blocked_by?: string | null
          country_code?: string | null
          country_name?: string | null
          created_at?: string | null
          id?: string | null
          reason?: string | null
        }
        Relationships: []
      }
      blocked_ips: {
        Row: {
          blocked_at: string | null
          blocked_by: string | null
          created_at: string | null
          expires_at: string | null
          id: string | null
          ip_address: string | null
          is_permanent: boolean | null
          last_attempt_at: string | null
          reason: string | null
          request_count: number | null
        }
        Insert: {
          blocked_at?: string | null
          blocked_by?: string | null
          created_at?: string | null
          expires_at?: string | null
          id?: string | null
          ip_address?: string | null
          is_permanent?: boolean | null
          last_attempt_at?: string | null
          reason?: string | null
          request_count?: number | null
        }
        Update: {
          blocked_at?: string | null
          blocked_by?: string | null
          created_at?: string | null
          expires_at?: string | null
          id?: string | null
          ip_address?: string | null
          is_permanent?: boolean | null
          last_attempt_at?: string | null
          reason?: string | null
          request_count?: number | null
        }
        Relationships: []
      }
      bpm_activity_log: {
        Row: {
          action: string | null
          card_id: string | null
          changes: Json | null
          created_at: string | null
          entity_id: string | null
          entity_type: string | null
          flow_id: string | null
          id: string | null
          ip_address: string | null
          metadata: Json | null
          register_id: string | null
          user_id: string | null
          workspace_id: string | null
        }
        Insert: {
          action?: string | null
          card_id?: string | null
          changes?: Json | null
          created_at?: string | null
          entity_id?: string | null
          entity_type?: string | null
          flow_id?: string | null
          id?: string | null
          ip_address?: string | null
          metadata?: Json | null
          register_id?: string | null
          user_id?: string | null
          workspace_id?: string | null
        }
        Update: {
          action?: string | null
          card_id?: string | null
          changes?: Json | null
          created_at?: string | null
          entity_id?: string | null
          entity_type?: string | null
          flow_id?: string | null
          id?: string | null
          ip_address?: string | null
          metadata?: Json | null
          register_id?: string | null
          user_id?: string | null
          workspace_id?: string | null
        }
        Relationships: []
      }
      bpm_automation_actions: {
        Row: {
          action_config: Json | null
          action_order: number | null
          action_type:
            | "move_card"
            | "set_field"
            | "assign_user"
            | "add_comment"
            | "send_email"
            | "send_notification"
            | "create_card"
            | "add_recurrence"
            | "invoke_agent"
            | "call_webhook"
            | "call_mcp"
            | "create_calendar_event"
            | "update_register"
            | null
          agent_id: string | null
          automation_id: string | null
          created_at: string | null
          id: string | null
          mcp_server_id: string | null
          webhook_id: string | null
        }
        Insert: {
          action_config?: Json | null
          action_order?: number | null
          action_type?:
            | "move_card"
            | "set_field"
            | "assign_user"
            | "add_comment"
            | "send_email"
            | "send_notification"
            | "create_card"
            | "add_recurrence"
            | "invoke_agent"
            | "call_webhook"
            | "call_mcp"
            | "create_calendar_event"
            | "update_register"
            | null
          agent_id?: string | null
          automation_id?: string | null
          created_at?: string | null
          id?: string | null
          mcp_server_id?: string | null
          webhook_id?: string | null
        }
        Update: {
          action_config?: Json | null
          action_order?: number | null
          action_type?:
            | "move_card"
            | "set_field"
            | "assign_user"
            | "add_comment"
            | "send_email"
            | "send_notification"
            | "create_card"
            | "add_recurrence"
            | "invoke_agent"
            | "call_webhook"
            | "call_mcp"
            | "create_calendar_event"
            | "update_register"
            | null
          agent_id?: string | null
          automation_id?: string | null
          created_at?: string | null
          id?: string | null
          mcp_server_id?: string | null
          webhook_id?: string | null
        }
        Relationships: []
      }
      bpm_automation_conditions: {
        Row: {
          automation_id: string | null
          compare_value: string | null
          compare_values: Json | null
          condition_order: number | null
          created_at: string | null
          field_id: string | null
          field_path: string | null
          id: string | null
          logic_operator: string | null
          operator: string | null
        }
        Insert: {
          automation_id?: string | null
          compare_value?: string | null
          compare_values?: Json | null
          condition_order?: number | null
          created_at?: string | null
          field_id?: string | null
          field_path?: string | null
          id?: string | null
          logic_operator?: string | null
          operator?: string | null
        }
        Update: {
          automation_id?: string | null
          compare_value?: string | null
          compare_values?: Json | null
          condition_order?: number | null
          created_at?: string | null
          field_id?: string | null
          field_path?: string | null
          id?: string | null
          logic_operator?: string | null
          operator?: string | null
        }
        Relationships: []
      }
      bpm_automation_executions: {
        Row: {
          actions_executed: number | null
          actions_total: number | null
          automation_id: string | null
          card_id: string | null
          completed_at: string | null
          error: string | null
          execution_time_ms: number | null
          id: string | null
          result: Json | null
          started_at: string | null
          status: string | null
          trigger_data: Json | null
        }
        Insert: {
          actions_executed?: number | null
          actions_total?: number | null
          automation_id?: string | null
          card_id?: string | null
          completed_at?: string | null
          error?: string | null
          execution_time_ms?: number | null
          id?: string | null
          result?: Json | null
          started_at?: string | null
          status?: string | null
          trigger_data?: Json | null
        }
        Update: {
          actions_executed?: number | null
          actions_total?: number | null
          automation_id?: string | null
          card_id?: string | null
          completed_at?: string | null
          error?: string | null
          execution_time_ms?: number | null
          id?: string | null
          result?: Json | null
          started_at?: string | null
          status?: string | null
          trigger_data?: Json | null
        }
        Relationships: []
      }
      bpm_automations: {
        Row: {
          conditions: Json | null
          created_at: string | null
          created_by: string | null
          description: string | null
          execution_count: number | null
          flow_id: string | null
          id: string | null
          is_active: boolean | null
          last_executed_at: string | null
          name: string | null
          trigger_config: Json | null
          trigger_type:
            | "card_created"
            | "step_changed"
            | "field_changed"
            | "email_received"
            | "condition_met"
            | "schedule"
            | "webhook_received"
            | "manual"
            | null
          updated_at: string | null
        }
        Insert: {
          conditions?: Json | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          execution_count?: number | null
          flow_id?: string | null
          id?: string | null
          is_active?: boolean | null
          last_executed_at?: string | null
          name?: string | null
          trigger_config?: Json | null
          trigger_type?:
            | "card_created"
            | "step_changed"
            | "field_changed"
            | "email_received"
            | "condition_met"
            | "schedule"
            | "webhook_received"
            | "manual"
            | null
          updated_at?: string | null
        }
        Update: {
          conditions?: Json | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          execution_count?: number | null
          flow_id?: string | null
          id?: string | null
          is_active?: boolean | null
          last_executed_at?: string | null
          name?: string | null
          trigger_config?: Json | null
          trigger_type?:
            | "card_created"
            | "step_changed"
            | "field_changed"
            | "email_received"
            | "condition_met"
            | "schedule"
            | "webhook_received"
            | "manual"
            | null
          updated_at?: string | null
        }
        Relationships: []
      }
      bpm_card_answer_fields: {
        Row: {
          card_answer_id: string | null
          created_at: string | null
          field_id: string | null
          id: string | null
          updated_at: string | null
          value: string | null
          value_bool: boolean | null
          value_date: string | null
          value_json: Json | null
          value_numeric: number | null
        }
        Insert: {
          card_answer_id?: string | null
          created_at?: string | null
          field_id?: string | null
          id?: string | null
          updated_at?: string | null
          value?: string | null
          value_bool?: boolean | null
          value_date?: string | null
          value_json?: Json | null
          value_numeric?: number | null
        }
        Update: {
          card_answer_id?: string | null
          created_at?: string | null
          field_id?: string | null
          id?: string | null
          updated_at?: string | null
          value?: string | null
          value_bool?: boolean | null
          value_date?: string | null
          value_json?: Json | null
          value_numeric?: number | null
        }
        Relationships: []
      }
      bpm_card_answers: {
        Row: {
          answered_by: string | null
          card_id: string | null
          created_at: string | null
          deleted_at: string | null
          flow_step_id: string | null
          form_id: string | null
          id: string | null
          updated_at: string | null
        }
        Insert: {
          answered_by?: string | null
          card_id?: string | null
          created_at?: string | null
          deleted_at?: string | null
          flow_step_id?: string | null
          form_id?: string | null
          id?: string | null
          updated_at?: string | null
        }
        Update: {
          answered_by?: string | null
          card_id?: string | null
          created_at?: string | null
          deleted_at?: string | null
          flow_step_id?: string | null
          form_id?: string | null
          id?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      bpm_card_attachments: {
        Row: {
          card_id: string | null
          created_at: string | null
          file_name: string | null
          file_path: string | null
          file_size: number | null
          id: string | null
          mime_type: string | null
          uploaded_by: string | null
        }
        Insert: {
          card_id?: string | null
          created_at?: string | null
          file_name?: string | null
          file_path?: string | null
          file_size?: number | null
          id?: string | null
          mime_type?: string | null
          uploaded_by?: string | null
        }
        Update: {
          card_id?: string | null
          created_at?: string | null
          file_name?: string | null
          file_path?: string | null
          file_size?: number | null
          id?: string | null
          mime_type?: string | null
          uploaded_by?: string | null
        }
        Relationships: []
      }
      bpm_card_checklist_items: {
        Row: {
          checked_at: string | null
          checked_by: string | null
          checklist_id: string | null
          created_at: string | null
          id: string | null
          is_checked: boolean | null
          sort_order: number | null
          title: string | null
        }
        Insert: {
          checked_at?: string | null
          checked_by?: string | null
          checklist_id?: string | null
          created_at?: string | null
          id?: string | null
          is_checked?: boolean | null
          sort_order?: number | null
          title?: string | null
        }
        Update: {
          checked_at?: string | null
          checked_by?: string | null
          checklist_id?: string | null
          created_at?: string | null
          id?: string | null
          is_checked?: boolean | null
          sort_order?: number | null
          title?: string | null
        }
        Relationships: []
      }
      bpm_card_checklists: {
        Row: {
          card_id: string | null
          created_at: string | null
          created_by: string | null
          id: string | null
          sort_order: number | null
          title: string | null
        }
        Insert: {
          card_id?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string | null
          sort_order?: number | null
          title?: string | null
        }
        Update: {
          card_id?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string | null
          sort_order?: number | null
          title?: string | null
        }
        Relationships: []
      }
      bpm_card_comments: {
        Row: {
          card_id: string | null
          content: string | null
          content_html: string | null
          created_at: string | null
          deleted_at: string | null
          id: string | null
          mentions: string[] | null
          parent_id: string | null
          search_vector: unknown
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          card_id?: string | null
          content?: string | null
          content_html?: string | null
          created_at?: string | null
          deleted_at?: string | null
          id?: string | null
          mentions?: string[] | null
          parent_id?: string | null
          search_vector?: unknown
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          card_id?: string | null
          content?: string | null
          content_html?: string | null
          created_at?: string | null
          deleted_at?: string | null
          id?: string | null
          mentions?: string[] | null
          parent_id?: string | null
          search_vector?: unknown
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      bpm_card_email_attachments: {
        Row: {
          created_at: string | null
          email_id: string | null
          file_name: string | null
          file_path: string | null
          file_size: number | null
          id: string | null
          mime_type: string | null
        }
        Insert: {
          created_at?: string | null
          email_id?: string | null
          file_name?: string | null
          file_path?: string | null
          file_size?: number | null
          id?: string | null
          mime_type?: string | null
        }
        Update: {
          created_at?: string | null
          email_id?: string | null
          file_name?: string | null
          file_path?: string | null
          file_size?: number | null
          id?: string | null
          mime_type?: string | null
        }
        Relationships: []
      }
      bpm_card_emails: {
        Row: {
          bcc_addresses: string[] | null
          body_html: string | null
          body_text: string | null
          card_id: string | null
          cc_addresses: string[] | null
          created_at: string | null
          direction: string | null
          email_config_id: string | null
          from_address: string | null
          has_attachments: boolean | null
          id: string | null
          in_reply_to: string | null
          is_read: boolean | null
          message_id: string | null
          metadata: Json | null
          received_at: string | null
          sent_at: string | null
          sent_by: string | null
          subject: string | null
          to_addresses: string[] | null
        }
        Insert: {
          bcc_addresses?: string[] | null
          body_html?: string | null
          body_text?: string | null
          card_id?: string | null
          cc_addresses?: string[] | null
          created_at?: string | null
          direction?: string | null
          email_config_id?: string | null
          from_address?: string | null
          has_attachments?: boolean | null
          id?: string | null
          in_reply_to?: string | null
          is_read?: boolean | null
          message_id?: string | null
          metadata?: Json | null
          received_at?: string | null
          sent_at?: string | null
          sent_by?: string | null
          subject?: string | null
          to_addresses?: string[] | null
        }
        Update: {
          bcc_addresses?: string[] | null
          body_html?: string | null
          body_text?: string | null
          card_id?: string | null
          cc_addresses?: string[] | null
          created_at?: string | null
          direction?: string | null
          email_config_id?: string | null
          from_address?: string | null
          has_attachments?: boolean | null
          id?: string | null
          in_reply_to?: string | null
          is_read?: boolean | null
          message_id?: string | null
          metadata?: Json | null
          received_at?: string | null
          sent_at?: string | null
          sent_by?: string | null
          subject?: string | null
          to_addresses?: string[] | null
        }
        Relationships: []
      }
      bpm_card_labels: {
        Row: {
          card_id: string | null
          label_id: string | null
        }
        Insert: {
          card_id?: string | null
          label_id?: string | null
        }
        Update: {
          card_id?: string | null
          label_id?: string | null
        }
        Relationships: []
      }
      bpm_card_movements: {
        Row: {
          card_id: string | null
          from_step_id: string | null
          id: string | null
          metadata: Json | null
          moved_at: string | null
          moved_by: string | null
          reason: string | null
          to_step_id: string | null
        }
        Insert: {
          card_id?: string | null
          from_step_id?: string | null
          id?: string | null
          metadata?: Json | null
          moved_at?: string | null
          moved_by?: string | null
          reason?: string | null
          to_step_id?: string | null
        }
        Update: {
          card_id?: string | null
          from_step_id?: string | null
          id?: string | null
          metadata?: Json | null
          moved_at?: string | null
          moved_by?: string | null
          reason?: string | null
          to_step_id?: string | null
        }
        Relationships: []
      }
      bpm_card_recurrences: {
        Row: {
          base_date: string | null
          behavior: string | null
          card_id: string | null
          created_at: string | null
          created_by: string | null
          current_occurrences: number | null
          day_of_month: number | null
          day_of_week: number | null
          end_date: string | null
          frequency: "daily" | "weekly" | "monthly" | "yearly" | null
          id: string | null
          interval_value: number | null
          is_active: boolean | null
          last_executed_at: string | null
          max_occurrences: number | null
          next_execution_at: string | null
        }
        Insert: {
          base_date?: string | null
          behavior?: string | null
          card_id?: string | null
          created_at?: string | null
          created_by?: string | null
          current_occurrences?: number | null
          day_of_month?: number | null
          day_of_week?: number | null
          end_date?: string | null
          frequency?: "daily" | "weekly" | "monthly" | "yearly" | null
          id?: string | null
          interval_value?: number | null
          is_active?: boolean | null
          last_executed_at?: string | null
          max_occurrences?: number | null
          next_execution_at?: string | null
        }
        Update: {
          base_date?: string | null
          behavior?: string | null
          card_id?: string | null
          created_at?: string | null
          created_by?: string | null
          current_occurrences?: number | null
          day_of_month?: number | null
          day_of_week?: number | null
          end_date?: string | null
          frequency?: "daily" | "weekly" | "monthly" | "yearly" | null
          id?: string | null
          interval_value?: number | null
          is_active?: boolean | null
          last_executed_at?: string | null
          max_occurrences?: number | null
          next_execution_at?: string | null
        }
        Relationships: []
      }
      bpm_card_subtasks: {
        Row: {
          assignee_id: string | null
          card_id: string | null
          completed_at: string | null
          completed_by: string | null
          created_at: string | null
          created_by: string | null
          due_date: string | null
          id: string | null
          is_completed: boolean | null
          sort_order: number | null
          title: string | null
          updated_at: string | null
        }
        Insert: {
          assignee_id?: string | null
          card_id?: string | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string | null
          created_by?: string | null
          due_date?: string | null
          id?: string | null
          is_completed?: boolean | null
          sort_order?: number | null
          title?: string | null
          updated_at?: string | null
        }
        Update: {
          assignee_id?: string | null
          card_id?: string | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string | null
          created_by?: string | null
          due_date?: string | null
          id?: string | null
          is_completed?: boolean | null
          sort_order?: number | null
          title?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      bpm_card_time_entries: {
        Row: {
          card_id: string | null
          created_at: string | null
          description: string | null
          duration_minutes: number | null
          ended_at: string | null
          id: string | null
          started_at: string | null
          user_id: string | null
        }
        Insert: {
          card_id?: string | null
          created_at?: string | null
          description?: string | null
          duration_minutes?: number | null
          ended_at?: string | null
          id?: string | null
          started_at?: string | null
          user_id?: string | null
        }
        Update: {
          card_id?: string | null
          created_at?: string | null
          description?: string | null
          duration_minutes?: number | null
          ended_at?: string | null
          id?: string | null
          started_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      bpm_card_watchers: {
        Row: {
          card_id: string | null
          created_at: string | null
          user_id: string | null
          watch_type: string | null
        }
        Insert: {
          card_id?: string | null
          created_at?: string | null
          user_id?: string | null
          watch_type?: string | null
        }
        Update: {
          card_id?: string | null
          created_at?: string | null
          user_id?: string | null
          watch_type?: string | null
        }
        Relationships: []
      }
      bpm_cards: {
        Row: {
          assignee_id: string | null
          card_number: number | null
          completed_at: string | null
          created_at: string | null
          created_by: string | null
          current_step_id: string | null
          deleted_at: string | null
          due_date: string | null
          flow_id: string | null
          id: string | null
          metadata: Json | null
          origin: string | null
          priority: number | null
          recurrence_config: Json | null
          search_vector: unknown
          status: "active" | "archived" | "completed" | "cancelled" | null
          title: string | null
          updated_at: string | null
          workspace_id: string | null
        }
        Insert: {
          assignee_id?: string | null
          card_number?: number | null
          completed_at?: string | null
          created_at?: string | null
          created_by?: string | null
          current_step_id?: string | null
          deleted_at?: string | null
          due_date?: string | null
          flow_id?: string | null
          id?: string | null
          metadata?: Json | null
          origin?: string | null
          priority?: number | null
          recurrence_config?: Json | null
          search_vector?: unknown
          status?: "active" | "archived" | "completed" | "cancelled" | null
          title?: string | null
          updated_at?: string | null
          workspace_id?: string | null
        }
        Update: {
          assignee_id?: string | null
          card_number?: number | null
          completed_at?: string | null
          created_at?: string | null
          created_by?: string | null
          current_step_id?: string | null
          deleted_at?: string | null
          due_date?: string | null
          flow_id?: string | null
          id?: string | null
          metadata?: Json | null
          origin?: string | null
          priority?: number | null
          recurrence_config?: Json | null
          search_vector?: unknown
          status?: "active" | "archived" | "completed" | "cancelled" | null
          title?: string | null
          updated_at?: string | null
          workspace_id?: string | null
        }
        Relationships: []
      }
      bpm_connections: {
        Row: {
          connection_config: Json | null
          created_at: string | null
          id: string | null
          source_id: string | null
          source_type: string | null
          target_id: string | null
          target_type: string | null
        }
        Insert: {
          connection_config?: Json | null
          created_at?: string | null
          id?: string | null
          source_id?: string | null
          source_type?: string | null
          target_id?: string | null
          target_type?: string | null
        }
        Update: {
          connection_config?: Json | null
          created_at?: string | null
          id?: string | null
          source_id?: string | null
          source_type?: string | null
          target_id?: string | null
          target_type?: string | null
        }
        Relationships: []
      }
      bpm_dashboard_elements: {
        Row: {
          config: Json | null
          created_at: string | null
          element_order: number | null
          element_type: string | null
          flow_id: string | null
          id: string | null
          size_h: number | null
          size_w: number | null
          title: string | null
          updated_at: string | null
        }
        Insert: {
          config?: Json | null
          created_at?: string | null
          element_order?: number | null
          element_type?: string | null
          flow_id?: string | null
          id?: string | null
          size_h?: number | null
          size_w?: number | null
          title?: string | null
          updated_at?: string | null
        }
        Update: {
          config?: Json | null
          created_at?: string | null
          element_order?: number | null
          element_type?: string | null
          flow_id?: string | null
          id?: string | null
          size_h?: number | null
          size_w?: number | null
          title?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      bpm_email_configs: {
        Row: {
          created_at: string | null
          from_email: string | null
          from_name: string | null
          id: string | null
          is_verified: boolean | null
          name: string | null
          smtp_host: string | null
          smtp_pass_credential_id: string | null
          smtp_port: number | null
          smtp_user: string | null
          updated_at: string | null
          workspace_id: string | null
        }
        Insert: {
          created_at?: string | null
          from_email?: string | null
          from_name?: string | null
          id?: string | null
          is_verified?: boolean | null
          name?: string | null
          smtp_host?: string | null
          smtp_pass_credential_id?: string | null
          smtp_port?: number | null
          smtp_user?: string | null
          updated_at?: string | null
          workspace_id?: string | null
        }
        Update: {
          created_at?: string | null
          from_email?: string | null
          from_name?: string | null
          id?: string | null
          is_verified?: boolean | null
          name?: string | null
          smtp_host?: string | null
          smtp_pass_credential_id?: string | null
          smtp_port?: number | null
          smtp_user?: string | null
          updated_at?: string | null
          workspace_id?: string | null
        }
        Relationships: []
      }
      bpm_flow_steps: {
        Row: {
          color: string | null
          created_at: string | null
          deleted_at: string | null
          description: string | null
          flow_id: string | null
          id: string | null
          is_final: boolean | null
          is_initial: boolean | null
          name: string | null
          settings: Json | null
          sla_hours: number | null
          step_order: number | null
          updated_at: string | null
        }
        Insert: {
          color?: string | null
          created_at?: string | null
          deleted_at?: string | null
          description?: string | null
          flow_id?: string | null
          id?: string | null
          is_final?: boolean | null
          is_initial?: boolean | null
          name?: string | null
          settings?: Json | null
          sla_hours?: number | null
          step_order?: number | null
          updated_at?: string | null
        }
        Update: {
          color?: string | null
          created_at?: string | null
          deleted_at?: string | null
          description?: string | null
          flow_id?: string | null
          id?: string | null
          is_final?: boolean | null
          is_initial?: boolean | null
          name?: string | null
          settings?: Json | null
          sla_hours?: number | null
          step_order?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      bpm_flow_template_installs: {
        Row: {
          created_at: string | null
          flow_id: string | null
          id: string | null
          installed_by: string | null
          template_id: string | null
          workspace_id: string | null
        }
        Insert: {
          created_at?: string | null
          flow_id?: string | null
          id?: string | null
          installed_by?: string | null
          template_id?: string | null
          workspace_id?: string | null
        }
        Update: {
          created_at?: string | null
          flow_id?: string | null
          id?: string | null
          installed_by?: string | null
          template_id?: string | null
          workspace_id?: string | null
        }
        Relationships: []
      }
      bpm_flow_templates: {
        Row: {
          category: string | null
          color: string | null
          created_at: string | null
          created_by: string | null
          definition: Json | null
          description: string | null
          icon: string | null
          id: string | null
          install_count: number | null
          is_featured: boolean | null
          is_public: boolean | null
          name: string | null
          preview_image_url: string | null
          rating: number | null
          tags: string[] | null
          updated_at: string | null
        }
        Insert: {
          category?: string | null
          color?: string | null
          created_at?: string | null
          created_by?: string | null
          definition?: Json | null
          description?: string | null
          icon?: string | null
          id?: string | null
          install_count?: number | null
          is_featured?: boolean | null
          is_public?: boolean | null
          name?: string | null
          preview_image_url?: string | null
          rating?: number | null
          tags?: string[] | null
          updated_at?: string | null
        }
        Update: {
          category?: string | null
          color?: string | null
          created_at?: string | null
          created_by?: string | null
          definition?: Json | null
          description?: string | null
          icon?: string | null
          id?: string | null
          install_count?: number | null
          is_featured?: boolean | null
          is_public?: boolean | null
          name?: string | null
          preview_image_url?: string | null
          rating?: number | null
          tags?: string[] | null
          updated_at?: string | null
        }
        Relationships: []
      }
      bpm_flows: {
        Row: {
          color: string | null
          created_at: string | null
          created_by: string | null
          default_view:
            | "kanban"
            | "list"
            | "calendar"
            | "timeline"
            | "gantt"
            | null
          deleted_at: string | null
          description: string | null
          icon: string | null
          id: string | null
          is_active: boolean | null
          name: string | null
          settings: Json | null
          updated_at: string | null
          workspace_id: string | null
        }
        Insert: {
          color?: string | null
          created_at?: string | null
          created_by?: string | null
          default_view?:
            | "kanban"
            | "list"
            | "calendar"
            | "timeline"
            | "gantt"
            | null
          deleted_at?: string | null
          description?: string | null
          icon?: string | null
          id?: string | null
          is_active?: boolean | null
          name?: string | null
          settings?: Json | null
          updated_at?: string | null
          workspace_id?: string | null
        }
        Update: {
          color?: string | null
          created_at?: string | null
          created_by?: string | null
          default_view?:
            | "kanban"
            | "list"
            | "calendar"
            | "timeline"
            | "gantt"
            | null
          deleted_at?: string | null
          description?: string | null
          icon?: string | null
          id?: string | null
          is_active?: boolean | null
          name?: string | null
          settings?: Json | null
          updated_at?: string | null
          workspace_id?: string | null
        }
        Relationships: []
      }
      bpm_form_fields: {
        Row: {
          autocomplete_rules: Json | null
          conditional_rules: Json | null
          config: Json | null
          created_at: string | null
          default_value: string | null
          deleted_at: string | null
          field_hash: string | null
          field_order: number | null
          field_type:
            | "TEXT_SHORT_FIELD"
            | "TEXT_LONG_FIELD"
            | "COMBO_BOX_FIELD"
            | "DATE_PICKER_FIELD"
            | "RADIO_BOX_FIELD"
            | "CHECK_BOX_FIELD"
            | "COMBO_BOX_USER_FIELD"
            | "COMBO_BOX_REGISTER_FIELD"
            | "COMBO_BOX_FLOW_FIELD"
            | "CURRENCY_FIELD"
            | "DUE_DATE_FIELD"
            | "MAIL_FIELD"
            | "PHONE_FIELD"
            | "SWITCH_FIELD"
            | "INPUT_LIST_FIELD"
            | "NUMBER_FIELD"
            | "DOC_FIELD"
            | "INPUT_RICH_TEXT_FIELD"
            | "LINK_FIELD"
            | "FILE_FIELD"
            | "RATING_FIELD"
            | "COLOR_FIELD"
            | "LOCATION_FIELD"
            | "FORMULA_FIELD"
            | "RELATION_FIELD"
            | null
          form_id: string | null
          help_text: string | null
          id: string | null
          is_required: boolean | null
          label: string | null
          options: Json | null
          placeholder: string | null
          updated_at: string | null
          validation_rules: Json | null
        }
        Insert: {
          autocomplete_rules?: Json | null
          conditional_rules?: Json | null
          config?: Json | null
          created_at?: string | null
          default_value?: string | null
          deleted_at?: string | null
          field_hash?: string | null
          field_order?: number | null
          field_type?:
            | "TEXT_SHORT_FIELD"
            | "TEXT_LONG_FIELD"
            | "COMBO_BOX_FIELD"
            | "DATE_PICKER_FIELD"
            | "RADIO_BOX_FIELD"
            | "CHECK_BOX_FIELD"
            | "COMBO_BOX_USER_FIELD"
            | "COMBO_BOX_REGISTER_FIELD"
            | "COMBO_BOX_FLOW_FIELD"
            | "CURRENCY_FIELD"
            | "DUE_DATE_FIELD"
            | "MAIL_FIELD"
            | "PHONE_FIELD"
            | "SWITCH_FIELD"
            | "INPUT_LIST_FIELD"
            | "NUMBER_FIELD"
            | "DOC_FIELD"
            | "INPUT_RICH_TEXT_FIELD"
            | "LINK_FIELD"
            | "FILE_FIELD"
            | "RATING_FIELD"
            | "COLOR_FIELD"
            | "LOCATION_FIELD"
            | "FORMULA_FIELD"
            | "RELATION_FIELD"
            | null
          form_id?: string | null
          help_text?: string | null
          id?: string | null
          is_required?: boolean | null
          label?: string | null
          options?: Json | null
          placeholder?: string | null
          updated_at?: string | null
          validation_rules?: Json | null
        }
        Update: {
          autocomplete_rules?: Json | null
          conditional_rules?: Json | null
          config?: Json | null
          created_at?: string | null
          default_value?: string | null
          deleted_at?: string | null
          field_hash?: string | null
          field_order?: number | null
          field_type?:
            | "TEXT_SHORT_FIELD"
            | "TEXT_LONG_FIELD"
            | "COMBO_BOX_FIELD"
            | "DATE_PICKER_FIELD"
            | "RADIO_BOX_FIELD"
            | "CHECK_BOX_FIELD"
            | "COMBO_BOX_USER_FIELD"
            | "COMBO_BOX_REGISTER_FIELD"
            | "COMBO_BOX_FLOW_FIELD"
            | "CURRENCY_FIELD"
            | "DUE_DATE_FIELD"
            | "MAIL_FIELD"
            | "PHONE_FIELD"
            | "SWITCH_FIELD"
            | "INPUT_LIST_FIELD"
            | "NUMBER_FIELD"
            | "DOC_FIELD"
            | "INPUT_RICH_TEXT_FIELD"
            | "LINK_FIELD"
            | "FILE_FIELD"
            | "RATING_FIELD"
            | "COLOR_FIELD"
            | "LOCATION_FIELD"
            | "FORMULA_FIELD"
            | "RELATION_FIELD"
            | null
          form_id?: string | null
          help_text?: string | null
          id?: string | null
          is_required?: boolean | null
          label?: string | null
          options?: Json | null
          placeholder?: string | null
          updated_at?: string | null
          validation_rules?: Json | null
        }
        Relationships: []
      }
      bpm_forms: {
        Row: {
          created_at: string | null
          description: string | null
          flow_id: string | null
          flow_step_id: string | null
          id: string | null
          is_public: boolean | null
          name: string | null
          settings: Json | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          flow_id?: string | null
          flow_step_id?: string | null
          id?: string | null
          is_public?: boolean | null
          name?: string | null
          settings?: Json | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          flow_id?: string | null
          flow_step_id?: string | null
          id?: string | null
          is_public?: boolean | null
          name?: string | null
          settings?: Json | null
          updated_at?: string | null
        }
        Relationships: []
      }
      bpm_labels: {
        Row: {
          color: string | null
          created_at: string | null
          flow_id: string | null
          id: string | null
          name: string | null
        }
        Insert: {
          color?: string | null
          created_at?: string | null
          flow_id?: string | null
          id?: string | null
          name?: string | null
        }
        Update: {
          color?: string | null
          created_at?: string | null
          flow_id?: string | null
          id?: string | null
          name?: string | null
        }
        Relationships: []
      }
      bpm_notification_preferences: {
        Row: {
          channels: Json | null
          created_at: string | null
          digest_frequency: string | null
          flow_id: string | null
          id: string | null
          notify_automation_error: boolean | null
          notify_card_assigned: boolean | null
          notify_card_moved: boolean | null
          notify_comment_mention: boolean | null
          notify_comment_reply: boolean | null
          notify_due_date: boolean | null
          notify_email_received: boolean | null
          notify_form_submission: boolean | null
          notify_subtask_completed: boolean | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          channels?: Json | null
          created_at?: string | null
          digest_frequency?: string | null
          flow_id?: string | null
          id?: string | null
          notify_automation_error?: boolean | null
          notify_card_assigned?: boolean | null
          notify_card_moved?: boolean | null
          notify_comment_mention?: boolean | null
          notify_comment_reply?: boolean | null
          notify_due_date?: boolean | null
          notify_email_received?: boolean | null
          notify_form_submission?: boolean | null
          notify_subtask_completed?: boolean | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          channels?: Json | null
          created_at?: string | null
          digest_frequency?: string | null
          flow_id?: string | null
          id?: string | null
          notify_automation_error?: boolean | null
          notify_card_assigned?: boolean | null
          notify_card_moved?: boolean | null
          notify_comment_mention?: boolean | null
          notify_comment_reply?: boolean | null
          notify_due_date?: boolean | null
          notify_email_received?: boolean | null
          notify_form_submission?: boolean | null
          notify_subtask_completed?: boolean | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      bpm_public_form_submissions: {
        Row: {
          card_id: string | null
          created_at: string | null
          flow_id: string | null
          form_id: string | null
          id: string | null
          processed_at: string | null
          processed_by: string | null
          share_id: string | null
          status: string | null
          submitted_data: Json | null
          submitter_email: string | null
          submitter_ip: string | null
          submitter_name: string | null
          submitter_phone: string | null
        }
        Insert: {
          card_id?: string | null
          created_at?: string | null
          flow_id?: string | null
          form_id?: string | null
          id?: string | null
          processed_at?: string | null
          processed_by?: string | null
          share_id?: string | null
          status?: string | null
          submitted_data?: Json | null
          submitter_email?: string | null
          submitter_ip?: string | null
          submitter_name?: string | null
          submitter_phone?: string | null
        }
        Update: {
          card_id?: string | null
          created_at?: string | null
          flow_id?: string | null
          form_id?: string | null
          id?: string | null
          processed_at?: string | null
          processed_by?: string | null
          share_id?: string | null
          status?: string | null
          submitted_data?: Json | null
          submitter_email?: string | null
          submitter_ip?: string | null
          submitter_name?: string | null
          submitter_phone?: string | null
        }
        Relationships: []
      }
      bpm_public_share_access: {
        Row: {
          accessed_at: string | null
          id: string | null
          ip_address: string | null
          referrer: string | null
          share_id: string | null
          user_agent: string | null
        }
        Insert: {
          accessed_at?: string | null
          id?: string | null
          ip_address?: string | null
          referrer?: string | null
          share_id?: string | null
          user_agent?: string | null
        }
        Update: {
          accessed_at?: string | null
          id?: string | null
          ip_address?: string | null
          referrer?: string | null
          share_id?: string | null
          user_agent?: string | null
        }
        Relationships: []
      }
      bpm_public_shares: {
        Row: {
          allowed_actions: Json | null
          branding: Json | null
          created_at: string | null
          created_by: string | null
          entity_id: string | null
          expires_at: string | null
          id: string | null
          is_active: boolean | null
          max_views: number | null
          password_hash: string | null
          share_token: string | null
          share_type: string | null
          updated_at: string | null
          view_count: number | null
        }
        Insert: {
          allowed_actions?: Json | null
          branding?: Json | null
          created_at?: string | null
          created_by?: string | null
          entity_id?: string | null
          expires_at?: string | null
          id?: string | null
          is_active?: boolean | null
          max_views?: number | null
          password_hash?: string | null
          share_token?: string | null
          share_type?: string | null
          updated_at?: string | null
          view_count?: number | null
        }
        Update: {
          allowed_actions?: Json | null
          branding?: Json | null
          created_at?: string | null
          created_by?: string | null
          entity_id?: string | null
          expires_at?: string | null
          id?: string | null
          is_active?: boolean | null
          max_views?: number | null
          password_hash?: string | null
          share_token?: string | null
          share_type?: string | null
          updated_at?: string | null
          view_count?: number | null
        }
        Relationships: []
      }
      bpm_register_fields: {
        Row: {
          config: Json | null
          created_at: string | null
          deleted_at: string | null
          field_hash: string | null
          field_order: number | null
          field_type:
            | "TEXT_SHORT_FIELD"
            | "TEXT_LONG_FIELD"
            | "COMBO_BOX_FIELD"
            | "DATE_PICKER_FIELD"
            | "RADIO_BOX_FIELD"
            | "CHECK_BOX_FIELD"
            | "COMBO_BOX_USER_FIELD"
            | "COMBO_BOX_REGISTER_FIELD"
            | "COMBO_BOX_FLOW_FIELD"
            | "CURRENCY_FIELD"
            | "DUE_DATE_FIELD"
            | "MAIL_FIELD"
            | "PHONE_FIELD"
            | "SWITCH_FIELD"
            | "INPUT_LIST_FIELD"
            | "NUMBER_FIELD"
            | "DOC_FIELD"
            | "INPUT_RICH_TEXT_FIELD"
            | "LINK_FIELD"
            | "FILE_FIELD"
            | "RATING_FIELD"
            | "COLOR_FIELD"
            | "LOCATION_FIELD"
            | "FORMULA_FIELD"
            | "RELATION_FIELD"
            | null
          id: string | null
          is_required: boolean | null
          label: string | null
          options: Json | null
          register_id: string | null
        }
        Insert: {
          config?: Json | null
          created_at?: string | null
          deleted_at?: string | null
          field_hash?: string | null
          field_order?: number | null
          field_type?:
            | "TEXT_SHORT_FIELD"
            | "TEXT_LONG_FIELD"
            | "COMBO_BOX_FIELD"
            | "DATE_PICKER_FIELD"
            | "RADIO_BOX_FIELD"
            | "CHECK_BOX_FIELD"
            | "COMBO_BOX_USER_FIELD"
            | "COMBO_BOX_REGISTER_FIELD"
            | "COMBO_BOX_FLOW_FIELD"
            | "CURRENCY_FIELD"
            | "DUE_DATE_FIELD"
            | "MAIL_FIELD"
            | "PHONE_FIELD"
            | "SWITCH_FIELD"
            | "INPUT_LIST_FIELD"
            | "NUMBER_FIELD"
            | "DOC_FIELD"
            | "INPUT_RICH_TEXT_FIELD"
            | "LINK_FIELD"
            | "FILE_FIELD"
            | "RATING_FIELD"
            | "COLOR_FIELD"
            | "LOCATION_FIELD"
            | "FORMULA_FIELD"
            | "RELATION_FIELD"
            | null
          id?: string | null
          is_required?: boolean | null
          label?: string | null
          options?: Json | null
          register_id?: string | null
        }
        Update: {
          config?: Json | null
          created_at?: string | null
          deleted_at?: string | null
          field_hash?: string | null
          field_order?: number | null
          field_type?:
            | "TEXT_SHORT_FIELD"
            | "TEXT_LONG_FIELD"
            | "COMBO_BOX_FIELD"
            | "DATE_PICKER_FIELD"
            | "RADIO_BOX_FIELD"
            | "CHECK_BOX_FIELD"
            | "COMBO_BOX_USER_FIELD"
            | "COMBO_BOX_REGISTER_FIELD"
            | "COMBO_BOX_FLOW_FIELD"
            | "CURRENCY_FIELD"
            | "DUE_DATE_FIELD"
            | "MAIL_FIELD"
            | "PHONE_FIELD"
            | "SWITCH_FIELD"
            | "INPUT_LIST_FIELD"
            | "NUMBER_FIELD"
            | "DOC_FIELD"
            | "INPUT_RICH_TEXT_FIELD"
            | "LINK_FIELD"
            | "FILE_FIELD"
            | "RATING_FIELD"
            | "COLOR_FIELD"
            | "LOCATION_FIELD"
            | "FORMULA_FIELD"
            | "RELATION_FIELD"
            | null
          id?: string | null
          is_required?: boolean | null
          label?: string | null
          options?: Json | null
          register_id?: string | null
        }
        Relationships: []
      }
      bpm_register_records: {
        Row: {
          created_at: string | null
          created_by: string | null
          deleted_at: string | null
          id: string | null
          register_id: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          id?: string | null
          register_id?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          id?: string | null
          register_id?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      bpm_register_values: {
        Row: {
          created_at: string | null
          field_id: string | null
          id: string | null
          record_id: string | null
          updated_at: string | null
          value: string | null
          value_json: Json | null
        }
        Insert: {
          created_at?: string | null
          field_id?: string | null
          id?: string | null
          record_id?: string | null
          updated_at?: string | null
          value?: string | null
          value_json?: Json | null
        }
        Update: {
          created_at?: string | null
          field_id?: string | null
          id?: string | null
          record_id?: string | null
          updated_at?: string | null
          value?: string | null
          value_json?: Json | null
        }
        Relationships: []
      }
      bpm_registers: {
        Row: {
          created_at: string | null
          created_by: string | null
          deleted_at: string | null
          description: string | null
          icon: string | null
          id: string | null
          max_records: number | null
          name: string | null
          settings: Json | null
          updated_at: string | null
          workspace_id: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          icon?: string | null
          id?: string | null
          max_records?: number | null
          name?: string | null
          settings?: Json | null
          updated_at?: string | null
          workspace_id?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          icon?: string | null
          id?: string | null
          max_records?: number | null
          name?: string | null
          settings?: Json | null
          updated_at?: string | null
          workspace_id?: string | null
        }
        Relationships: []
      }
      bpm_saved_views: {
        Row: {
          color_coding: Json | null
          column_widths: Json | null
          created_at: string | null
          created_by: string | null
          filters: Json | null
          flow_id: string | null
          group_by: string | null
          id: string | null
          is_default: boolean | null
          is_shared: boolean | null
          name: string | null
          row_contrast: string | null
          row_height: string | null
          sort_config: Json | null
          updated_at: string | null
          view_type:
            | "kanban"
            | "list"
            | "calendar"
            | "timeline"
            | "gantt"
            | null
          visible_columns: Json | null
        }
        Insert: {
          color_coding?: Json | null
          column_widths?: Json | null
          created_at?: string | null
          created_by?: string | null
          filters?: Json | null
          flow_id?: string | null
          group_by?: string | null
          id?: string | null
          is_default?: boolean | null
          is_shared?: boolean | null
          name?: string | null
          row_contrast?: string | null
          row_height?: string | null
          sort_config?: Json | null
          updated_at?: string | null
          view_type?:
            | "kanban"
            | "list"
            | "calendar"
            | "timeline"
            | "gantt"
            | null
          visible_columns?: Json | null
        }
        Update: {
          color_coding?: Json | null
          column_widths?: Json | null
          created_at?: string | null
          created_by?: string | null
          filters?: Json | null
          flow_id?: string | null
          group_by?: string | null
          id?: string | null
          is_default?: boolean | null
          is_shared?: boolean | null
          name?: string | null
          row_contrast?: string | null
          row_height?: string | null
          sort_config?: Json | null
          updated_at?: string | null
          view_type?:
            | "kanban"
            | "list"
            | "calendar"
            | "timeline"
            | "gantt"
            | null
          visible_columns?: Json | null
        }
        Relationships: []
      }
      bpm_sla_records: {
        Row: {
          breached_at: string | null
          card_id: string | null
          created_at: string | null
          deadline_at: string | null
          entered_at: string | null
          exited_at: string | null
          id: string | null
          is_breached: boolean | null
          sla_hours: number | null
          step_id: string | null
          time_in_step_minutes: number | null
        }
        Insert: {
          breached_at?: string | null
          card_id?: string | null
          created_at?: string | null
          deadline_at?: string | null
          entered_at?: string | null
          exited_at?: string | null
          id?: string | null
          is_breached?: boolean | null
          sla_hours?: number | null
          step_id?: string | null
          time_in_step_minutes?: number | null
        }
        Update: {
          breached_at?: string | null
          card_id?: string | null
          created_at?: string | null
          deadline_at?: string | null
          entered_at?: string | null
          exited_at?: string | null
          id?: string | null
          is_breached?: boolean | null
          sla_hours?: number | null
          step_id?: string | null
          time_in_step_minutes?: number | null
        }
        Relationships: []
      }
      bpm_user_favorites: {
        Row: {
          created_at: string | null
          entity_id: string | null
          entity_type: string | null
          id: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      budgets: {
        Row: {
          alert_threshold: number | null
          created_at: string | null
          current_usd: number | null
          id: string | null
          is_active: boolean | null
          limit_usd: number | null
          name: string | null
          period: string | null
          updated_at: string | null
          workspace_id: string | null
        }
        Insert: {
          alert_threshold?: number | null
          created_at?: string | null
          current_usd?: number | null
          id?: string | null
          is_active?: boolean | null
          limit_usd?: number | null
          name?: string | null
          period?: string | null
          updated_at?: string | null
          workspace_id?: string | null
        }
        Update: {
          alert_threshold?: number | null
          created_at?: string | null
          current_usd?: number | null
          id?: string | null
          is_active?: boolean | null
          limit_usd?: number | null
          name?: string | null
          period?: string | null
          updated_at?: string | null
          workspace_id?: string | null
        }
        Relationships: []
      }
      business_hours: {
        Row: {
          close_time: string | null
          created_at: string | null
          day_of_week: number | null
          id: string | null
          is_open: boolean | null
          open_time: string | null
          updated_at: string | null
          whatsapp_connection_id: string | null
        }
        Insert: {
          close_time?: string | null
          created_at?: string | null
          day_of_week?: number | null
          id?: string | null
          is_open?: boolean | null
          open_time?: string | null
          updated_at?: string | null
          whatsapp_connection_id?: string | null
        }
        Update: {
          close_time?: string | null
          created_at?: string | null
          day_of_week?: number | null
          id?: string | null
          is_open?: boolean | null
          open_time?: string | null
          updated_at?: string | null
          whatsapp_connection_id?: string | null
        }
        Relationships: []
      }
      calls: {
        Row: {
          agent_id: string | null
          answered_at: string | null
          contact_id: string | null
          created_at: string | null
          direction: string | null
          duration_seconds: number | null
          ended_at: string | null
          id: string | null
          notes: string | null
          recording_url: string | null
          started_at: string | null
          status: string | null
          whatsapp_connection_id: string | null
        }
        Insert: {
          agent_id?: string | null
          answered_at?: string | null
          contact_id?: string | null
          created_at?: string | null
          direction?: string | null
          duration_seconds?: number | null
          ended_at?: string | null
          id?: string | null
          notes?: string | null
          recording_url?: string | null
          started_at?: string | null
          status?: string | null
          whatsapp_connection_id?: string | null
        }
        Update: {
          agent_id?: string | null
          answered_at?: string | null
          contact_id?: string | null
          created_at?: string | null
          direction?: string | null
          duration_seconds?: number | null
          ended_at?: string | null
          id?: string | null
          notes?: string | null
          recording_url?: string | null
          started_at?: string | null
          status?: string | null
          whatsapp_connection_id?: string | null
        }
        Relationships: []
      }
      campaign_ab_variants: {
        Row: {
          campaign_id: string | null
          created_at: string | null
          delivered_count: number | null
          id: string | null
          is_winner: boolean | null
          media_url: string | null
          message_content: string | null
          read_count: number | null
          response_count: number | null
          send_count: number | null
          variant_name: string | null
        }
        Insert: {
          campaign_id?: string | null
          created_at?: string | null
          delivered_count?: number | null
          id?: string | null
          is_winner?: boolean | null
          media_url?: string | null
          message_content?: string | null
          read_count?: number | null
          response_count?: number | null
          send_count?: number | null
          variant_name?: string | null
        }
        Update: {
          campaign_id?: string | null
          created_at?: string | null
          delivered_count?: number | null
          id?: string | null
          is_winner?: boolean | null
          media_url?: string | null
          message_content?: string | null
          read_count?: number | null
          response_count?: number | null
          send_count?: number | null
          variant_name?: string | null
        }
        Relationships: []
      }
      campaign_contacts: {
        Row: {
          campaign_id: string | null
          contact_id: string | null
          created_at: string | null
          error_message: string | null
          external_id: string | null
          id: string | null
          sent_at: string | null
          status: string | null
        }
        Insert: {
          campaign_id?: string | null
          contact_id?: string | null
          created_at?: string | null
          error_message?: string | null
          external_id?: string | null
          id?: string | null
          sent_at?: string | null
          status?: string | null
        }
        Update: {
          campaign_id?: string | null
          contact_id?: string | null
          created_at?: string | null
          error_message?: string | null
          external_id?: string | null
          id?: string | null
          sent_at?: string | null
          status?: string | null
        }
        Relationships: []
      }
      campaigns: {
        Row: {
          completed_at: string | null
          created_at: string | null
          created_by: string | null
          delivered_count: number | null
          description: string | null
          failed_count: number | null
          id: string | null
          media_url: string | null
          message_content: string | null
          message_type: string | null
          name: string | null
          read_count: number | null
          scheduled_at: string | null
          send_interval_seconds: number | null
          sent_count: number | null
          started_at: string | null
          status: string | null
          target_filter: Json | null
          target_type: string | null
          total_contacts: number | null
          updated_at: string | null
          whatsapp_connection_id: string | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string | null
          created_by?: string | null
          delivered_count?: number | null
          description?: string | null
          failed_count?: number | null
          id?: string | null
          media_url?: string | null
          message_content?: string | null
          message_type?: string | null
          name?: string | null
          read_count?: number | null
          scheduled_at?: string | null
          send_interval_seconds?: number | null
          sent_count?: number | null
          started_at?: string | null
          status?: string | null
          target_filter?: Json | null
          target_type?: string | null
          total_contacts?: number | null
          updated_at?: string | null
          whatsapp_connection_id?: string | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string | null
          created_by?: string | null
          delivered_count?: number | null
          description?: string | null
          failed_count?: number | null
          id?: string | null
          media_url?: string | null
          message_content?: string | null
          message_type?: string | null
          name?: string | null
          read_count?: number | null
          scheduled_at?: string | null
          send_interval_seconds?: number | null
          sent_count?: number | null
          started_at?: string | null
          status?: string | null
          target_filter?: Json | null
          target_type?: string | null
          total_contacts?: number | null
          updated_at?: string | null
          whatsapp_connection_id?: string | null
        }
        Relationships: []
      }
      channel_connections: {
        Row: {
          channel_type: Database["public"]["Enums"]["channel_type"] | null
          config: Json | null
          created_at: string | null
          created_by: string | null
          credentials: Json | null
          external_account_id: string | null
          external_page_id: string | null
          id: string | null
          is_active: boolean | null
          name: string | null
          status: string | null
          updated_at: string | null
          webhook_url: string | null
          whatsapp_connection_id: string | null
        }
        Insert: {
          channel_type?: Database["public"]["Enums"]["channel_type"] | null
          config?: Json | null
          created_at?: string | null
          created_by?: string | null
          credentials?: Json | null
          external_account_id?: string | null
          external_page_id?: string | null
          id?: string | null
          is_active?: boolean | null
          name?: string | null
          status?: string | null
          updated_at?: string | null
          webhook_url?: string | null
          whatsapp_connection_id?: string | null
        }
        Update: {
          channel_type?: Database["public"]["Enums"]["channel_type"] | null
          config?: Json | null
          created_at?: string | null
          created_by?: string | null
          credentials?: Json | null
          external_account_id?: string | null
          external_page_id?: string | null
          id?: string | null
          is_active?: boolean | null
          name?: string | null
          status?: string | null
          updated_at?: string | null
          webhook_url?: string | null
          whatsapp_connection_id?: string | null
        }
        Relationships: []
      }
      channel_connections_safe: {
        Row: {
          created_at: string | null
          created_by: string | null
          external_account_id: string | null
          external_page_id: string | null
          id: string | null
          is_active: boolean | null
          name: string | null
          status: string | null
          updated_at: string | null
          webhook_url: string | null
          whatsapp_connection_id: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          external_account_id?: string | null
          external_page_id?: string | null
          id?: string | null
          is_active?: boolean | null
          name?: string | null
          status?: string | null
          updated_at?: string | null
          webhook_url?: string | null
          whatsapp_connection_id?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          external_account_id?: string | null
          external_page_id?: string | null
          id?: string | null
          is_active?: boolean | null
          name?: string | null
          status?: string | null
          updated_at?: string | null
          webhook_url?: string | null
          whatsapp_connection_id?: string | null
        }
        Relationships: []
      }
      channel_provider_routes: {
        Row: {
          channel_connection_id: string | null
          created_at: string | null
          current_provider_id: string | null
          fallback_provider_id: string | null
          id: string | null
          primary_provider_id: string | null
          switched_at: string | null
          switched_reason: string | null
          updated_at: string | null
          whatsapp_connection_id: string | null
        }
        Insert: {
          channel_connection_id?: string | null
          created_at?: string | null
          current_provider_id?: string | null
          fallback_provider_id?: string | null
          id?: string | null
          primary_provider_id?: string | null
          switched_at?: string | null
          switched_reason?: string | null
          updated_at?: string | null
          whatsapp_connection_id?: string | null
        }
        Update: {
          channel_connection_id?: string | null
          created_at?: string | null
          current_provider_id?: string | null
          fallback_provider_id?: string | null
          id?: string | null
          primary_provider_id?: string | null
          switched_at?: string | null
          switched_reason?: string | null
          updated_at?: string | null
          whatsapp_connection_id?: string | null
        }
        Relationships: []
      }
      channel_queues: {
        Row: {
          channel_id: string | null
          created_at: string | null
          created_by: string | null
          id: string | null
          is_active: boolean | null
          is_default: boolean | null
          priority: number | null
          queue_id: string | null
          updated_at: string | null
        }
        Insert: {
          channel_id?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string | null
          is_active?: boolean | null
          is_default?: boolean | null
          priority?: number | null
          queue_id?: string | null
          updated_at?: string | null
        }
        Update: {
          channel_id?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string | null
          is_active?: boolean | null
          is_default?: boolean | null
          priority?: number | null
          queue_id?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      channel_routing_rules: {
        Row: {
          channel_connection_id: string | null
          channel_type: Database["public"]["Enums"]["channel_type"] | null
          conditions: Json | null
          created_at: string | null
          id: string | null
          is_active: boolean | null
          priority: number | null
          queue_id: string | null
        }
        Insert: {
          channel_connection_id?: string | null
          channel_type?: Database["public"]["Enums"]["channel_type"] | null
          conditions?: Json | null
          created_at?: string | null
          id?: string | null
          is_active?: boolean | null
          priority?: number | null
          queue_id?: string | null
        }
        Update: {
          channel_connection_id?: string | null
          channel_type?: Database["public"]["Enums"]["channel_type"] | null
          conditions?: Json | null
          created_at?: string | null
          id?: string | null
          is_active?: boolean | null
          priority?: number | null
          queue_id?: string | null
        }
        Relationships: []
      }
      chatbot_executions: {
        Row: {
          completed_at: string | null
          contact_id: string | null
          created_at: string | null
          current_node_id: string | null
          error_message: string | null
          flow_id: string | null
          id: string | null
          started_at: string | null
          status: string | null
          variables: Json | null
        }
        Insert: {
          completed_at?: string | null
          contact_id?: string | null
          created_at?: string | null
          current_node_id?: string | null
          error_message?: string | null
          flow_id?: string | null
          id?: string | null
          started_at?: string | null
          status?: string | null
          variables?: Json | null
        }
        Update: {
          completed_at?: string | null
          contact_id?: string | null
          created_at?: string | null
          current_node_id?: string | null
          error_message?: string | null
          flow_id?: string | null
          id?: string | null
          started_at?: string | null
          status?: string | null
          variables?: Json | null
        }
        Relationships: []
      }
      chatbot_flows: {
        Row: {
          created_at: string | null
          created_by: string | null
          description: string | null
          edges: Json | null
          execution_count: number | null
          id: string | null
          is_active: boolean | null
          last_executed_at: string | null
          name: string | null
          nodes: Json | null
          trigger_type: string | null
          trigger_value: string | null
          updated_at: string | null
          variables: Json | null
          whatsapp_connection_id: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          edges?: Json | null
          execution_count?: number | null
          id?: string | null
          is_active?: boolean | null
          last_executed_at?: string | null
          name?: string | null
          nodes?: Json | null
          trigger_type?: string | null
          trigger_value?: string | null
          updated_at?: string | null
          variables?: Json | null
          whatsapp_connection_id?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          edges?: Json | null
          execution_count?: number | null
          id?: string | null
          is_active?: boolean | null
          last_executed_at?: string | null
          name?: string | null
          nodes?: Json | null
          trigger_type?: string | null
          trigger_value?: string | null
          updated_at?: string | null
          variables?: Json | null
          whatsapp_connection_id?: string | null
        }
        Relationships: []
      }
      chunks: {
        Row: {
          bm25_tsvector: unknown
          chunk_index: number | null
          chunk_level: string | null
          content: string | null
          created_at: string | null
          document_id: string | null
          embedding: string | null
          embedding_status: string | null
          id: string | null
          l0_abstract: string | null
          l1_overview: string | null
          metadata: Json | null
          parent_chunk_id: string | null
          token_count: number | null
        }
        Insert: {
          bm25_tsvector?: unknown
          chunk_index?: number | null
          chunk_level?: string | null
          content?: string | null
          created_at?: string | null
          document_id?: string | null
          embedding?: string | null
          embedding_status?: string | null
          id?: string | null
          l0_abstract?: string | null
          l1_overview?: string | null
          metadata?: Json | null
          parent_chunk_id?: string | null
          token_count?: number | null
        }
        Update: {
          bm25_tsvector?: unknown
          chunk_index?: number | null
          chunk_level?: string | null
          content?: string | null
          created_at?: string | null
          document_id?: string | null
          embedding?: string | null
          embedding_status?: string | null
          id?: string | null
          l0_abstract?: string | null
          l1_overview?: string | null
          metadata?: Json | null
          parent_chunk_id?: string | null
          token_count?: number | null
        }
        Relationships: []
      }
      client_wallet_rules: {
        Row: {
          agent_id: string | null
          created_at: string | null
          id: string | null
          is_active: boolean | null
          name: string | null
          priority: number | null
          whatsapp_connection_id: string | null
        }
        Insert: {
          agent_id?: string | null
          created_at?: string | null
          id?: string | null
          is_active?: boolean | null
          name?: string | null
          priority?: number | null
          whatsapp_connection_id?: string | null
        }
        Update: {
          agent_id?: string | null
          created_at?: string | null
          id?: string | null
          is_active?: boolean | null
          name?: string | null
          priority?: number | null
          whatsapp_connection_id?: string | null
        }
        Relationships: []
      }
      colaboradores: {
        Row: {
          ativo: boolean | null
          atualizado_em: string | null
          cargo: string | null
          chave_pix: string | null
          criado_em: string | null
          dialog_id: string | null
          id: number | null
          id_bitrix: number | null
          nome: string | null
        }
        Insert: {
          ativo?: boolean | null
          atualizado_em?: string | null
          cargo?: string | null
          chave_pix?: string | null
          criado_em?: string | null
          dialog_id?: string | null
          id?: number | null
          id_bitrix?: number | null
          nome?: string | null
        }
        Update: {
          ativo?: boolean | null
          atualizado_em?: string | null
          cargo?: string | null
          chave_pix?: string | null
          criado_em?: string | null
          dialog_id?: string | null
          id?: number | null
          id_bitrix?: number | null
          nome?: string | null
        }
        Relationships: []
      }
      coletas: {
        Row: {
          atualizado_em: string | null
          criado_em: string | null
          dados_destino: Json | null
          dados_fornecedor: Json | null
          data_coleta: string | null
          data_entrega: string | null
          data_prevista: string | null
          data_solicitacao: string | null
          destino: string | null
          fornecedor_destino_id: string | null
          fornecedor_id: string | null
          id: string | null
          instrucoes_manuseio: Json | null
          local_coleta: string | null
          observacoes: string | null
          pedido: string | null
          pedidos: Json | null
          peso: string | null
          produtos_info: string | null
          responsavel: string | null
          status: string | null
          taxa_carga_descarga: string | null
          taxa_espera: string | null
          tipo: string | null
          tipo_coleta: string | null
          tipo_servico: string | null
          tipo_veiculo: string | null
          transportadora_id: number | null
          transportadora_nome: string | null
          volumes: number | null
        }
        Insert: {
          atualizado_em?: string | null
          criado_em?: string | null
          dados_destino?: Json | null
          dados_fornecedor?: Json | null
          data_coleta?: string | null
          data_entrega?: string | null
          data_prevista?: string | null
          data_solicitacao?: string | null
          destino?: string | null
          fornecedor_destino_id?: string | null
          fornecedor_id?: string | null
          id?: string | null
          instrucoes_manuseio?: Json | null
          local_coleta?: string | null
          observacoes?: string | null
          pedido?: string | null
          pedidos?: Json | null
          peso?: string | null
          produtos_info?: string | null
          responsavel?: string | null
          status?: string | null
          taxa_carga_descarga?: string | null
          taxa_espera?: string | null
          tipo?: string | null
          tipo_coleta?: string | null
          tipo_servico?: string | null
          tipo_veiculo?: string | null
          transportadora_id?: number | null
          transportadora_nome?: string | null
          volumes?: number | null
        }
        Update: {
          atualizado_em?: string | null
          criado_em?: string | null
          dados_destino?: Json | null
          dados_fornecedor?: Json | null
          data_coleta?: string | null
          data_entrega?: string | null
          data_prevista?: string | null
          data_solicitacao?: string | null
          destino?: string | null
          fornecedor_destino_id?: string | null
          fornecedor_id?: string | null
          id?: string | null
          instrucoes_manuseio?: Json | null
          local_coleta?: string | null
          observacoes?: string | null
          pedido?: string | null
          pedidos?: Json | null
          peso?: string | null
          produtos_info?: string | null
          responsavel?: string | null
          status?: string | null
          taxa_carga_descarga?: string | null
          taxa_espera?: string | null
          tipo?: string | null
          tipo_coleta?: string | null
          tipo_servico?: string | null
          tipo_veiculo?: string | null
          transportadora_id?: number | null
          transportadora_nome?: string | null
          volumes?: number | null
        }
        Relationships: []
      }
      collections: {
        Row: {
          created_at: string | null
          description: string | null
          id: string | null
          knowledge_base_id: string | null
          metadata: Json | null
          name: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string | null
          knowledge_base_id?: string | null
          metadata?: Json | null
          name?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string | null
          knowledge_base_id?: string | null
          metadata?: Json | null
          name?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      companies: {
        Row: {
          cnpj: string | null
          created_at: string | null
          id: string | null
          metadata: Json | null
          name: string | null
          segment: string | null
          updated_at: string | null
        }
        Insert: {
          cnpj?: string | null
          created_at?: string | null
          id?: string | null
          metadata?: Json | null
          name?: string | null
          segment?: string | null
          updated_at?: string | null
        }
        Update: {
          cnpj?: string | null
          created_at?: string | null
          id?: string | null
          metadata?: Json | null
          name?: string | null
          segment?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      connection_alert_preferences: {
        Row: {
          alert_on_degraded: boolean | null
          alert_on_disconnected: boolean | null
          alert_type: string | null
          channels: Json | null
          connection_id: string | null
          created_at: string | null
          email_enabled: boolean | null
          id: string | null
          is_enabled: boolean | null
          push_enabled: boolean | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          alert_on_degraded?: boolean | null
          alert_on_disconnected?: boolean | null
          alert_type?: string | null
          channels?: Json | null
          connection_id?: string | null
          created_at?: string | null
          email_enabled?: boolean | null
          id?: string | null
          is_enabled?: boolean | null
          push_enabled?: boolean | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          alert_on_degraded?: boolean | null
          alert_on_disconnected?: boolean | null
          alert_type?: string | null
          channels?: Json | null
          connection_id?: string | null
          created_at?: string | null
          email_enabled?: boolean | null
          id?: string | null
          is_enabled?: boolean | null
          push_enabled?: boolean | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      connection_health_logs: {
        Row: {
          checked_at: string | null
          connection_id: string | null
          error_message: string | null
          id: string | null
          instance_id: string | null
          response_time_ms: number | null
          status: string | null
        }
        Insert: {
          checked_at?: string | null
          connection_id?: string | null
          error_message?: string | null
          id?: string | null
          instance_id?: string | null
          response_time_ms?: number | null
          status?: string | null
        }
        Update: {
          checked_at?: string | null
          connection_id?: string | null
          error_message?: string | null
          id?: string | null
          instance_id?: string | null
          response_time_ms?: number | null
          status?: string | null
        }
        Relationships: []
      }
      consent_records: {
        Row: {
          consent_type: string | null
          created_at: string | null
          granted: boolean | null
          id: string | null
          ip_address: string | null
          metadata: Json | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          consent_type?: string | null
          created_at?: string | null
          granted?: boolean | null
          id?: string | null
          ip_address?: string | null
          metadata?: Json | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          consent_type?: string | null
          created_at?: string | null
          granted?: boolean | null
          id?: string | null
          ip_address?: string | null
          metadata?: Json | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      contact_assignments: {
        Row: {
          assigned_at: string | null
          assigned_to_user_id: string | null
          contact_id: string | null
          created_at: string | null
          id: string | null
          updated_at: string | null
        }
        Insert: {
          assigned_at?: string | null
          assigned_to_user_id?: string | null
          contact_id?: string | null
          created_at?: string | null
          id?: string | null
          updated_at?: string | null
        }
        Update: {
          assigned_at?: string | null
          assigned_to_user_id?: string | null
          contact_id?: string | null
          created_at?: string | null
          id?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      contact_audit_log: {
        Row: {
          action: string | null
          changed_at: string | null
          changed_by: string | null
          contact_id: string | null
          created_at: string | null
          id: string | null
          ip_address: unknown
          new_values: Json | null
          old_values: Json | null
          reason: string | null
          session_id: string | null
          updated_at: string | null
          user_agent: string | null
        }
        Insert: {
          action?: string | null
          changed_at?: string | null
          changed_by?: string | null
          contact_id?: string | null
          created_at?: string | null
          id?: string | null
          ip_address?: unknown
          new_values?: Json | null
          old_values?: Json | null
          reason?: string | null
          session_id?: string | null
          updated_at?: string | null
          user_agent?: string | null
        }
        Update: {
          action?: string | null
          changed_at?: string | null
          changed_by?: string | null
          contact_id?: string | null
          created_at?: string | null
          id?: string | null
          ip_address?: unknown
          new_values?: Json | null
          old_values?: Json | null
          reason?: string | null
          session_id?: string | null
          updated_at?: string | null
          user_agent?: string | null
        }
        Relationships: []
      }
      contact_custom_fields: {
        Row: {
          contact_id: string | null
          created_at: string | null
          field_name: string | null
          field_type: string | null
          field_value: string | null
          id: string | null
          updated_at: string | null
        }
        Insert: {
          contact_id?: string | null
          created_at?: string | null
          field_name?: string | null
          field_type?: string | null
          field_value?: string | null
          id?: string | null
          updated_at?: string | null
        }
        Update: {
          contact_id?: string | null
          created_at?: string | null
          field_name?: string | null
          field_type?: string | null
          field_value?: string | null
          id?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      contact_export_log: {
        Row: {
          created_at: string | null
          export_type: string | null
          exported_by: string | null
          file_url: string | null
          filters: Json | null
          id: string | null
          row_count: number | null
          status: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          export_type?: string | null
          exported_by?: string | null
          file_url?: string | null
          filters?: Json | null
          id?: string | null
          row_count?: number | null
          status?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          export_type?: string | null
          exported_by?: string | null
          file_url?: string | null
          filters?: Json | null
          id?: string | null
          row_count?: number | null
          status?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      contact_id_graveyard: {
        Row: {
          deleted_at: string | null
          deleted_contact_id: string | null
          expiration_date: string | null
          original_workspace_id: string | null
          reason: string | null
        }
        Insert: {
          deleted_at?: string | null
          deleted_contact_id?: string | null
          expiration_date?: string | null
          original_workspace_id?: string | null
          reason?: string | null
        }
        Update: {
          deleted_at?: string | null
          deleted_contact_id?: string | null
          expiration_date?: string | null
          original_workspace_id?: string | null
          reason?: string | null
        }
        Relationships: []
      }
      contact_intelligence: {
        Row: {
          contact_id: string | null
          contact_name: string | null
          created_at: string | null
          days_since_contact: number | null
          disc_profile: string | null
          engagement_score: number | null
          id: string | null
          inbound_ratio: number | null
          last_contact_at: string | null
          lead_status: string | null
          phone: string | null
          predicted_value: number | null
          relationship_score: number | null
          remote_jid: string | null
          risk_level: string | null
          sentiment: string | null
          total_interactions: number | null
          total_messages: number | null
          updated_at: string | null
        }
        Relationships: []
      }
      contact_notes: {
        Row: {
          author_id: string | null
          contact_id: string | null
          content: string | null
          created_at: string | null
          id: string | null
          updated_at: string | null
        }
        Insert: {
          author_id?: string | null
          contact_id?: string | null
          content?: string | null
          created_at?: string | null
          id?: string | null
          updated_at?: string | null
        }
        Update: {
          author_id?: string | null
          contact_id?: string | null
          content?: string | null
          created_at?: string | null
          id?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      contact_phones: {
        Row: {
          area_code: string | null
          contact_id: string | null
          country_code: string | null
          created_at: string | null
          has_ninth_digit: boolean | null
          id: string | null
          is_primary: boolean | null
          is_whatsapp: boolean | null
          phone_e164: string | null
          phone_normalized: string | null
          phone_raw: string | null
          verified_at: string | null
        }
        Insert: {
          area_code?: string | null
          contact_id?: string | null
          country_code?: string | null
          created_at?: string | null
          has_ninth_digit?: boolean | null
          id?: string | null
          is_primary?: boolean | null
          is_whatsapp?: boolean | null
          phone_e164?: string | null
          phone_normalized?: string | null
          phone_raw?: string | null
          verified_at?: string | null
        }
        Update: {
          area_code?: string | null
          contact_id?: string | null
          country_code?: string | null
          created_at?: string | null
          has_ninth_digit?: boolean | null
          id?: string | null
          is_primary?: boolean | null
          is_whatsapp?: boolean | null
          phone_e164?: string | null
          phone_normalized?: string | null
          phone_raw?: string | null
          verified_at?: string | null
        }
        Relationships: []
      }
      contact_purchases: {
        Row: {
          amount: number | null
          contact_id: string | null
          created_at: string | null
          created_by: string | null
          currency: string | null
          deal_id: string | null
          description: string | null
          id: string | null
          purchase_type: string | null
          purchased_at: string | null
          status: string | null
          title: string | null
          updated_at: string | null
        }
        Insert: {
          amount?: number | null
          contact_id?: string | null
          created_at?: string | null
          created_by?: string | null
          currency?: string | null
          deal_id?: string | null
          description?: string | null
          id?: string | null
          purchase_type?: string | null
          purchased_at?: string | null
          status?: string | null
          title?: string | null
          updated_at?: string | null
        }
        Update: {
          amount?: number | null
          contact_id?: string | null
          created_at?: string | null
          created_by?: string | null
          currency?: string | null
          deal_id?: string | null
          description?: string | null
          id?: string | null
          purchase_type?: string | null
          purchased_at?: string | null
          status?: string | null
          title?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      contact_segments: {
        Row: {
          contact_count: number | null
          created_at: string | null
          created_by: string | null
          description: string | null
          filters: Json | null
          id: string | null
          instance_name: string | null
          is_system: boolean | null
          name: string | null
          updated_at: string | null
        }
        Insert: {
          contact_count?: number | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          filters?: Json | null
          id?: string | null
          instance_name?: string | null
          is_system?: boolean | null
          name?: string | null
          updated_at?: string | null
        }
        Update: {
          contact_count?: number | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          filters?: Json | null
          id?: string | null
          instance_name?: string | null
          is_system?: boolean | null
          name?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      contact_tags: {
        Row: {
          contact_id: string | null
          created_at: string | null
          id: string | null
          tag_id: string | null
        }
        Insert: {
          contact_id?: string | null
          created_at?: string | null
          id?: string | null
          tag_id?: string | null
        }
        Update: {
          contact_id?: string | null
          created_at?: string | null
          id?: string | null
          tag_id?: string | null
        }
        Relationships: []
      }
      contacts: {
        Row: {
          address: string | null
          ai_priority: string | null
          ai_sentiment: string | null
          assigned_to: string | null
          avatar_url: string | null
          channel: string | null
          channel_connection_id: string | null
          channel_type: string | null
          city: string | null
          company: string | null
          consent_status: string | null
          contact_type: string | null
          country: string | null
          cpf: string | null
          created_at: string | null
          deleted_at: string | null
          email: string | null
          external_id: string | null
          first_message_at: string | null
          group_category: string | null
          id: string | null
          instance_name: string | null
          is_blocked: boolean | null
          is_favorite: boolean | null
          job_title: string | null
          last_message_at: string | null
          last_seen_at: string | null
          lead_origin: string | null
          lead_score: number | null
          metadata: Json | null
          name: string | null
          nickname: string | null
          notes: string | null
          phone: string | null
          position: string | null
          push_name: string | null
          queue_id: string | null
          remote_jid: string | null
          risk_score: number | null
          source: string | null
          state: string | null
          status: string | null
          surname: string | null
          tags: string[] | null
          total_purchases: number | null
          unread_count: number | null
          updated_at: string | null
          whatsapp_connection_id: string | null
          whatsapp_labels: string[] | null
          workspace_id: string | null
        }
        Insert: {
          address?: never
          ai_priority?: never
          ai_sentiment?: never
          assigned_to?: string | null
          avatar_url?: string | null
          channel?: never
          channel_connection_id?: never
          channel_type?: never
          city?: never
          company?: string | null
          consent_status?: never
          contact_type?: never
          country?: never
          cpf?: never
          created_at?: string | null
          deleted_at?: string | null
          email?: string | null
          external_id?: string | null
          first_message_at?: string | null
          group_category?: never
          id?: string | null
          instance_name?: string | null
          is_blocked?: never
          is_favorite?: never
          job_title?: never
          last_message_at?: string | null
          last_seen_at?: string | null
          lead_origin?: never
          lead_score?: number | null
          metadata?: Json | null
          name?: never
          nickname?: never
          notes?: string | null
          phone?: never
          position?: string | null
          push_name?: string | null
          queue_id?: string | null
          remote_jid?: string | null
          risk_score?: never
          source?: string | null
          state?: never
          status?: never
          surname?: never
          tags?: string[] | null
          total_purchases?: number | null
          unread_count?: never
          updated_at?: string | null
          whatsapp_connection_id?: never
          whatsapp_labels?: string[] | null
          workspace_id?: never
        }
        Update: {
          address?: never
          ai_priority?: never
          ai_sentiment?: never
          assigned_to?: string | null
          avatar_url?: string | null
          channel?: never
          channel_connection_id?: never
          channel_type?: never
          city?: never
          company?: string | null
          consent_status?: never
          contact_type?: never
          country?: never
          cpf?: never
          created_at?: string | null
          deleted_at?: string | null
          email?: string | null
          external_id?: string | null
          first_message_at?: string | null
          group_category?: never
          id?: string | null
          instance_name?: string | null
          is_blocked?: never
          is_favorite?: never
          job_title?: never
          last_message_at?: string | null
          last_seen_at?: string | null
          lead_origin?: never
          lead_score?: number | null
          metadata?: Json | null
          name?: never
          nickname?: never
          notes?: string | null
          phone?: never
          position?: string | null
          push_name?: string | null
          queue_id?: string | null
          remote_jid?: string | null
          risk_score?: never
          source?: string | null
          state?: never
          status?: never
          surname?: never
          tags?: string[] | null
          total_purchases?: number | null
          unread_count?: never
          updated_at?: string | null
          whatsapp_connection_id?: never
          whatsapp_labels?: string[] | null
          workspace_id?: never
        }
        Relationships: []
      }
      contatos: {
        Row: {
          bitrix_contato_id: string | null
          bitrix_empresa_id: string | null
          created_at: string | null
          email: Json | null
          id: number | null
          nome: string | null
          sobrenome: string | null
          telefone: string | null
        }
        Insert: {
          bitrix_contato_id?: string | null
          bitrix_empresa_id?: string | null
          created_at?: string | null
          email?: Json | null
          id?: number | null
          nome?: string | null
          sobrenome?: string | null
          telefone?: string | null
        }
        Update: {
          bitrix_contato_id?: string | null
          bitrix_empresa_id?: string | null
          created_at?: string | null
          email?: Json | null
          id?: number | null
          nome?: string | null
          sobrenome?: string | null
          telefone?: string | null
        }
        Relationships: []
      }
      conversation_analyses: {
        Row: {
          analyzed_by: string | null
          contact_id: string | null
          created_at: string | null
          customer_satisfaction: number | null
          department: string | null
          id: string | null
          key_points: string[] | null
          message_count: number | null
          next_steps: string[] | null
          relationship_type: string | null
          sentiment: string | null
          sentiment_score: number | null
          status: string | null
          summary: string | null
          topics: string[] | null
          urgency: string | null
        }
        Insert: {
          analyzed_by?: string | null
          contact_id?: string | null
          created_at?: string | null
          customer_satisfaction?: number | null
          department?: string | null
          id?: string | null
          key_points?: string[] | null
          message_count?: number | null
          next_steps?: string[] | null
          relationship_type?: string | null
          sentiment?: string | null
          sentiment_score?: number | null
          status?: string | null
          summary?: string | null
          topics?: string[] | null
          urgency?: string | null
        }
        Update: {
          analyzed_by?: string | null
          contact_id?: string | null
          created_at?: string | null
          customer_satisfaction?: number | null
          department?: string | null
          id?: string | null
          key_points?: string[] | null
          message_count?: number | null
          next_steps?: string[] | null
          relationship_type?: string | null
          sentiment?: string | null
          sentiment_score?: number | null
          status?: string | null
          summary?: string | null
          topics?: string[] | null
          urgency?: string | null
        }
        Relationships: []
      }
      conversation_audit_logs: {
        Row: {
          action: string | null
          actor_id: string | null
          conversation_id: string | null
          created_at: string | null
          details: Json | null
          id: string | null
          ip_address: string | null
          metadata: Json | null
          new_value: Json | null
          old_value: Json | null
          performed_by: string | null
          performed_by_name: string | null
          source: string | null
          user_agent: string | null
        }
        Insert: {
          action?: string | null
          actor_id?: string | null
          conversation_id?: string | null
          created_at?: string | null
          details?: Json | null
          id?: string | null
          ip_address?: string | null
          metadata?: Json | null
          new_value?: Json | null
          old_value?: Json | null
          performed_by?: string | null
          performed_by_name?: string | null
          source?: string | null
          user_agent?: string | null
        }
        Update: {
          action?: string | null
          actor_id?: string | null
          conversation_id?: string | null
          created_at?: string | null
          details?: Json | null
          id?: string | null
          ip_address?: string | null
          metadata?: Json | null
          new_value?: Json | null
          old_value?: Json | null
          performed_by?: string | null
          performed_by_name?: string | null
          source?: string | null
          user_agent?: string | null
        }
        Relationships: []
      }
      conversation_closures: {
        Row: {
          classification: string | null
          close_reason: string | null
          closed_by: string | null
          contact_id: string | null
          created_at: string | null
          id: string | null
          notes: string | null
          outcome: string | null
        }
        Insert: {
          classification?: string | null
          close_reason?: string | null
          closed_by?: string | null
          contact_id?: string | null
          created_at?: string | null
          id?: string | null
          notes?: string | null
          outcome?: string | null
        }
        Update: {
          classification?: string | null
          close_reason?: string | null
          closed_by?: string | null
          contact_id?: string | null
          created_at?: string | null
          id?: string | null
          notes?: string | null
          outcome?: string | null
        }
        Relationships: []
      }
      conversation_events: {
        Row: {
          contact_id: string | null
          created_at: string | null
          event_type: string | null
          from_agent_id: string | null
          from_queue_id: string | null
          id: string | null
          idempotency_key: string | null
          metadata: Json | null
          performed_by: string | null
          provider_message_log_id: string | null
          thread_id: string | null
          to_agent_id: string | null
          to_queue_id: string | null
          trace_id: string | null
        }
        Insert: {
          contact_id?: string | null
          created_at?: string | null
          event_type?: string | null
          from_agent_id?: string | null
          from_queue_id?: string | null
          id?: string | null
          idempotency_key?: string | null
          metadata?: Json | null
          performed_by?: string | null
          provider_message_log_id?: string | null
          thread_id?: string | null
          to_agent_id?: string | null
          to_queue_id?: string | null
          trace_id?: string | null
        }
        Update: {
          contact_id?: string | null
          created_at?: string | null
          event_type?: string | null
          from_agent_id?: string | null
          from_queue_id?: string | null
          id?: string | null
          idempotency_key?: string | null
          metadata?: Json | null
          performed_by?: string | null
          provider_message_log_id?: string | null
          thread_id?: string | null
          to_agent_id?: string | null
          to_queue_id?: string | null
          trace_id?: string | null
        }
        Relationships: []
      }
      conversation_memory: {
        Row: {
          commercial_summary: string | null
          contact_id: string | null
          created_at: string | null
          cumulative_summary: string | null
          facts: Json | null
          id: string | null
          objections_handled: Json | null
          pending_items: Json | null
          promises_made: Json | null
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          commercial_summary?: string | null
          contact_id?: string | null
          created_at?: string | null
          cumulative_summary?: string | null
          facts?: Json | null
          id?: string | null
          objections_handled?: Json | null
          pending_items?: Json | null
          promises_made?: Json | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          commercial_summary?: string | null
          contact_id?: string | null
          created_at?: string | null
          cumulative_summary?: string | null
          facts?: Json | null
          id?: string | null
          objections_handled?: Json | null
          pending_items?: Json | null
          promises_made?: Json | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: []
      }
      conversation_participants: {
        Row: {
          created_at: string | null
          external_actor_id: string | null
          id: string | null
          joined_at: string | null
          left_at: string | null
          metadata: Json | null
          participant_type: string | null
          profile_id: string | null
          reason_left: string | null
          role: string | null
          thread_id: string | null
        }
        Insert: {
          created_at?: string | null
          external_actor_id?: string | null
          id?: string | null
          joined_at?: string | null
          left_at?: string | null
          metadata?: Json | null
          participant_type?: string | null
          profile_id?: string | null
          reason_left?: string | null
          role?: string | null
          thread_id?: string | null
        }
        Update: {
          created_at?: string | null
          external_actor_id?: string | null
          id?: string | null
          joined_at?: string | null
          left_at?: string | null
          metadata?: Json | null
          participant_type?: string | null
          profile_id?: string | null
          reason_left?: string | null
          role?: string | null
          thread_id?: string | null
        }
        Relationships: []
      }
      conversation_pins: {
        Row: {
          contact_id: string | null
          created_at: string | null
          id: string | null
          pinned_by: string | null
          position: number | null
        }
        Insert: {
          contact_id?: string | null
          created_at?: string | null
          id?: string | null
          pinned_by?: string | null
          position?: number | null
        }
        Update: {
          contact_id?: string | null
          created_at?: string | null
          id?: string | null
          pinned_by?: string | null
          position?: number | null
        }
        Relationships: []
      }
      conversation_sla: {
        Row: {
          contact_id: string | null
          created_at: string | null
          first_message_at: string | null
          first_response_at: string | null
          first_response_breached: boolean | null
          id: string | null
          resolution_breached: boolean | null
          resolved_at: string | null
          sla_configuration_id: string | null
          updated_at: string | null
        }
        Insert: {
          contact_id?: string | null
          created_at?: string | null
          first_message_at?: string | null
          first_response_at?: string | null
          first_response_breached?: boolean | null
          id?: string | null
          resolution_breached?: boolean | null
          resolved_at?: string | null
          sla_configuration_id?: string | null
          updated_at?: string | null
        }
        Update: {
          contact_id?: string | null
          created_at?: string | null
          first_message_at?: string | null
          first_response_at?: string | null
          first_response_breached?: boolean | null
          id?: string | null
          resolution_breached?: boolean | null
          resolved_at?: string | null
          sla_configuration_id?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      conversation_snoozes: {
        Row: {
          contact_id: string | null
          created_at: string | null
          id: string | null
          reason: string | null
          snooze_until: string | null
          snoozed_by: string | null
        }
        Insert: {
          contact_id?: string | null
          created_at?: string | null
          id?: string | null
          reason?: string | null
          snooze_until?: string | null
          snoozed_by?: string | null
        }
        Update: {
          contact_id?: string | null
          created_at?: string | null
          id?: string | null
          reason?: string | null
          snooze_until?: string | null
          snoozed_by?: string | null
        }
        Relationships: []
      }
      conversation_summaries: {
        Row: {
          conversation_id: string | null
          created_at: string | null
          generated_by: string | null
          id: string | null
          summary: string | null
          updated_at: string | null
        }
        Insert: {
          conversation_id?: string | null
          created_at?: string | null
          generated_by?: string | null
          id?: string | null
          summary?: string | null
          updated_at?: string | null
        }
        Update: {
          conversation_id?: string | null
          created_at?: string | null
          generated_by?: string | null
          id?: string | null
          summary?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      conversation_tasks: {
        Row: {
          assigned_to: string | null
          completed_at: string | null
          contact_id: string | null
          created_at: string | null
          created_by: string | null
          description: string | null
          due_date: string | null
          id: string | null
          priority: string | null
          status: string | null
          title: string | null
          updated_at: string | null
        }
        Insert: {
          assigned_to?: string | null
          completed_at?: string | null
          contact_id?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          id?: string | null
          priority?: string | null
          status?: string | null
          title?: string | null
          updated_at?: string | null
        }
        Update: {
          assigned_to?: string | null
          completed_at?: string | null
          contact_id?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          id?: string | null
          priority?: string | null
          status?: string | null
          title?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      conversation_threads: {
        Row: {
          channel: string | null
          created_at: string | null
          external_contact_id: string | null
          external_conversation_id: string | null
          health_score: number | null
          id: string | null
          instance_name: string | null
          last_event_at: string | null
          last_event_type: string | null
          message_count: number | null
          metadata: Json | null
          remote_jid: string | null
          status: string | null
          unread_count: number | null
          updated_at: string | null
        }
        Insert: {
          channel?: string | null
          created_at?: string | null
          external_contact_id?: string | null
          external_conversation_id?: string | null
          health_score?: number | null
          id?: string | null
          instance_name?: string | null
          last_event_at?: string | null
          last_event_type?: string | null
          message_count?: number | null
          metadata?: Json | null
          remote_jid?: string | null
          status?: string | null
          unread_count?: number | null
          updated_at?: string | null
        }
        Update: {
          channel?: string | null
          created_at?: string | null
          external_contact_id?: string | null
          external_conversation_id?: string | null
          health_score?: number | null
          id?: string | null
          instance_name?: string | null
          last_event_at?: string | null
          last_event_type?: string | null
          message_count?: number | null
          metadata?: Json | null
          remote_jid?: string | null
          status?: string | null
          unread_count?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      conversation_transfers: {
        Row: {
          accepted_at: string | null
          category: string | null
          completed_at: string | null
          contact_id: string | null
          contact_name: string | null
          context_messages: Json | null
          context_summary: string | null
          created_at: string | null
          expires_at: string | null
          from_agent_id: string | null
          from_queue_id: string | null
          id: string | null
          metadata: Json | null
          priority: number | null
          reason: string | null
          remote_jid: string | null
          resolution_notes: string | null
          resolution_type: string | null
          return_reason: string | null
          sla_deadline: string | null
          source_conversation_id: string | null
          source_instance: string | null
          source_message_id: string | null
          source_operator: string | null
          status: string | null
          tags: string[] | null
          target_conversation_id: string | null
          target_instance: string | null
          target_operator: string | null
          ticket_number: string | null
          to_agent_id: string | null
          to_queue_id: string | null
          transfer_type: string | null
          updated_at: string | null
        }
        Insert: {
          accepted_at?: string | null
          category?: string | null
          completed_at?: string | null
          contact_id?: string | null
          contact_name?: string | null
          context_messages?: Json | null
          context_summary?: string | null
          created_at?: string | null
          expires_at?: string | null
          from_agent_id?: string | null
          from_queue_id?: string | null
          id?: string | null
          metadata?: Json | null
          priority?: number | null
          reason?: string | null
          remote_jid?: string | null
          resolution_notes?: string | null
          resolution_type?: string | null
          return_reason?: string | null
          sla_deadline?: string | null
          source_conversation_id?: string | null
          source_instance?: string | null
          source_message_id?: string | null
          source_operator?: string | null
          status?: string | null
          tags?: string[] | null
          target_conversation_id?: string | null
          target_instance?: string | null
          target_operator?: string | null
          ticket_number?: string | null
          to_agent_id?: string | null
          to_queue_id?: string | null
          transfer_type?: string | null
          updated_at?: string | null
        }
        Update: {
          accepted_at?: string | null
          category?: string | null
          completed_at?: string | null
          contact_id?: string | null
          contact_name?: string | null
          context_messages?: Json | null
          context_summary?: string | null
          created_at?: string | null
          expires_at?: string | null
          from_agent_id?: string | null
          from_queue_id?: string | null
          id?: string | null
          metadata?: Json | null
          priority?: number | null
          reason?: string | null
          remote_jid?: string | null
          resolution_notes?: string | null
          resolution_type?: string | null
          return_reason?: string | null
          sla_deadline?: string | null
          source_conversation_id?: string | null
          source_instance?: string | null
          source_message_id?: string | null
          source_operator?: string | null
          status?: string | null
          tags?: string[] | null
          target_conversation_id?: string | null
          target_instance?: string | null
          target_operator?: string | null
          ticket_number?: string | null
          to_agent_id?: string | null
          to_queue_id?: string | null
          transfer_type?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      cookies_config: {
        Row: {
          alerta_dias_antes: number | null
          atualizado_em: string | null
          cnpj: string | null
          cookie: string | null
          csrf_token: string | null
          expires_at: string | null
          health_error: string | null
          health_status: string | null
          id: number | null
          is_healthy: boolean | null
          last_health_check_at: string | null
          linkedin_cookie: string | null
          nota: string | null
          servico: string | null
          token: string | null
        }
        Insert: {
          alerta_dias_antes?: number | null
          atualizado_em?: string | null
          cnpj?: string | null
          cookie?: string | null
          csrf_token?: string | null
          expires_at?: string | null
          health_error?: string | null
          health_status?: string | null
          id?: number | null
          is_healthy?: boolean | null
          last_health_check_at?: string | null
          linkedin_cookie?: string | null
          nota?: string | null
          servico?: string | null
          token?: string | null
        }
        Update: {
          alerta_dias_antes?: number | null
          atualizado_em?: string | null
          cnpj?: string | null
          cookie?: string | null
          csrf_token?: string | null
          expires_at?: string | null
          health_error?: string | null
          health_status?: string | null
          id?: number | null
          is_healthy?: boolean | null
          last_health_check_at?: string | null
          linkedin_cookie?: string | null
          nota?: string | null
          servico?: string | null
          token?: string | null
        }
        Relationships: []
      }
      cotacao_eventos: {
        Row: {
          codigo_evento: string | null
          cotacao_id: string | null
          created_at: string | null
          descricao: string | null
          fonte: string | null
          id: string | null
          ocorrido_em: string | null
          raw: Json | null
        }
        Insert: {
          codigo_evento?: string | null
          cotacao_id?: string | null
          created_at?: string | null
          descricao?: string | null
          fonte?: string | null
          id?: string | null
          ocorrido_em?: string | null
          raw?: Json | null
        }
        Update: {
          codigo_evento?: string | null
          cotacao_id?: string | null
          created_at?: string | null
          descricao?: string | null
          fonte?: string | null
          id?: string | null
          ocorrido_em?: string | null
          raw?: Json | null
        }
        Relationships: []
      }
      cotacoes: {
        Row: {
          carga: Json | null
          chave_nf: string | null
          created_at: string | null
          data_coleta: string | null
          data_emissao_nf: string | null
          data_entrega: string | null
          data_prevista: string | null
          destinatario: Json | null
          id: string | null
          itens_pedido_vinculados: Json | null
          numero_cotacao: string | null
          numero_nf: string | null
          observacoes: string | null
          origem: string | null
          pedido_pai_origem: string | null
          prazo_dias: number | null
          preco_total: number | null
          protocolo_atual: string | null
          proxima_consulta_em: string | null
          recibo_url: string | null
          remetente: Json | null
          responsavel_nome: string | null
          responsavel_role: string | null
          status: string | null
          todas_cotacoes: Json | null
          tracking_ativo: boolean | null
          tracking_falhas_seguidas: number | null
          tracking_ultima_tentativa: string | null
          tracking_ultimo_erro: string | null
          tracking_ultimo_sucesso: string | null
          transportadora_escolhida: string | null
          ultimo_evento: string | null
          ultimo_evento_em: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          carga?: Json | null
          chave_nf?: string | null
          created_at?: string | null
          data_coleta?: string | null
          data_emissao_nf?: string | null
          data_entrega?: string | null
          data_prevista?: string | null
          destinatario?: Json | null
          id?: string | null
          itens_pedido_vinculados?: Json | null
          numero_cotacao?: string | null
          numero_nf?: string | null
          observacoes?: string | null
          origem?: string | null
          pedido_pai_origem?: string | null
          prazo_dias?: number | null
          preco_total?: number | null
          protocolo_atual?: string | null
          proxima_consulta_em?: string | null
          recibo_url?: string | null
          remetente?: Json | null
          responsavel_nome?: string | null
          responsavel_role?: string | null
          status?: string | null
          todas_cotacoes?: Json | null
          tracking_ativo?: boolean | null
          tracking_falhas_seguidas?: number | null
          tracking_ultima_tentativa?: string | null
          tracking_ultimo_erro?: string | null
          tracking_ultimo_sucesso?: string | null
          transportadora_escolhida?: string | null
          ultimo_evento?: string | null
          ultimo_evento_em?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          carga?: Json | null
          chave_nf?: string | null
          created_at?: string | null
          data_coleta?: string | null
          data_emissao_nf?: string | null
          data_entrega?: string | null
          data_prevista?: string | null
          destinatario?: Json | null
          id?: string | null
          itens_pedido_vinculados?: Json | null
          numero_cotacao?: string | null
          numero_nf?: string | null
          observacoes?: string | null
          origem?: string | null
          pedido_pai_origem?: string | null
          prazo_dias?: number | null
          preco_total?: number | null
          protocolo_atual?: string | null
          proxima_consulta_em?: string | null
          recibo_url?: string | null
          remetente?: Json | null
          responsavel_nome?: string | null
          responsavel_role?: string | null
          status?: string | null
          todas_cotacoes?: Json | null
          tracking_ativo?: boolean | null
          tracking_falhas_seguidas?: number | null
          tracking_ultima_tentativa?: string | null
          tracking_ultimo_erro?: string | null
          tracking_ultimo_sucesso?: string | null
          transportadora_escolhida?: string | null
          ultimo_evento?: string | null
          ultimo_evento_em?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      credential_audit_logs: {
        Row: {
          action: string | null
          created_at: string | null
          credential_id: string | null
          details: Json | null
          id: string | null
          ip_address: string | null
          user_id: string | null
        }
        Insert: {
          action?: string | null
          created_at?: string | null
          credential_id?: string | null
          details?: Json | null
          id?: string | null
          ip_address?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string | null
          created_at?: string | null
          credential_id?: string | null
          details?: Json | null
          id?: string | null
          ip_address?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      creditos: {
        Row: {
          criado_em: string | null
          criado_por: string | null
          fornecedor: string | null
          id: string | null
          numero_pedido: string | null
          observacao: string | null
          pedido: string | null
          pedido_abatido: string | null
          produto: string | null
          quantidade: number | null
          status: string | null
          tipo_reembolso: string | null
          valor_total: number | null
          valor_unitario: number | null
        }
        Insert: {
          criado_em?: string | null
          criado_por?: string | null
          fornecedor?: string | null
          id?: string | null
          numero_pedido?: string | null
          observacao?: string | null
          pedido?: string | null
          pedido_abatido?: string | null
          produto?: string | null
          quantidade?: number | null
          status?: string | null
          tipo_reembolso?: string | null
          valor_total?: number | null
          valor_unitario?: number | null
        }
        Update: {
          criado_em?: string | null
          criado_por?: string | null
          fornecedor?: string | null
          id?: string | null
          numero_pedido?: string | null
          observacao?: string | null
          pedido?: string | null
          pedido_abatido?: string | null
          produto?: string | null
          quantidade?: number | null
          status?: string | null
          tipo_reembolso?: string | null
          valor_total?: number | null
          valor_unitario?: number | null
        }
        Relationships: []
      }
      crisis_room_alerts: {
        Row: {
          acknowledged_at: string | null
          acknowledged_by: string | null
          created_at: string | null
          id: string | null
          is_active: boolean | null
          message: string | null
          metric_name: string | null
          metric_value: number | null
          severity: string | null
          threshold: number | null
        }
        Insert: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          created_at?: string | null
          id?: string | null
          is_active?: boolean | null
          message?: string | null
          metric_name?: string | null
          metric_value?: number | null
          severity?: string | null
          threshold?: number | null
        }
        Update: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          created_at?: string | null
          id?: string | null
          is_active?: boolean | null
          message?: string | null
          metric_name?: string | null
          metric_value?: number | null
          severity?: string | null
          threshold?: number | null
        }
        Relationships: []
      }
      cron_schedule_executions: {
        Row: {
          completed_at: string | null
          duration_ms: number | null
          error: string | null
          id: string | null
          output: Json | null
          schedule_id: string | null
          started_at: string | null
          status: string | null
        }
        Insert: {
          completed_at?: string | null
          duration_ms?: number | null
          error?: string | null
          id?: string | null
          output?: Json | null
          schedule_id?: string | null
          started_at?: string | null
          status?: string | null
        }
        Update: {
          completed_at?: string | null
          duration_ms?: number | null
          error?: string | null
          id?: string | null
          output?: Json | null
          schedule_id?: string | null
          started_at?: string | null
          status?: string | null
        }
        Relationships: []
      }
      cron_schedules: {
        Row: {
          created_at: string | null
          cron_expression: string | null
          edge_function: string | null
          id: string | null
          is_active: boolean | null
          last_run_at: string | null
          name: string | null
          next_run_at: string | null
          payload: Json | null
          workspace_id: string | null
        }
        Insert: {
          created_at?: string | null
          cron_expression?: string | null
          edge_function?: string | null
          id?: string | null
          is_active?: boolean | null
          last_run_at?: string | null
          name?: string | null
          next_run_at?: string | null
          payload?: Json | null
          workspace_id?: string | null
        }
        Update: {
          created_at?: string | null
          cron_expression?: string | null
          edge_function?: string | null
          id?: string | null
          is_active?: boolean | null
          last_run_at?: string | null
          name?: string | null
          next_run_at?: string | null
          payload?: Json | null
          workspace_id?: string | null
        }
        Relationships: []
      }
      csat_auto_config: {
        Row: {
          created_at: string | null
          delay_minutes: number | null
          id: string | null
          is_enabled: boolean | null
          message_template: string | null
          updated_at: string | null
          updated_by: string | null
          whatsapp_connection_id: string | null
        }
        Insert: {
          created_at?: string | null
          delay_minutes?: number | null
          id?: string | null
          is_enabled?: boolean | null
          message_template?: string | null
          updated_at?: string | null
          updated_by?: string | null
          whatsapp_connection_id?: string | null
        }
        Update: {
          created_at?: string | null
          delay_minutes?: number | null
          id?: string | null
          is_enabled?: boolean | null
          message_template?: string | null
          updated_at?: string | null
          updated_by?: string | null
          whatsapp_connection_id?: string | null
        }
        Relationships: []
      }
      csat_responses: {
        Row: {
          agent_id: string | null
          comment: string | null
          contact_id: string | null
          conversation_id: string | null
          created_at: string | null
          id: string | null
          instance_name: string | null
          rating: number | null
          response_time_seconds: number | null
        }
        Insert: {
          agent_id?: string | null
          comment?: string | null
          contact_id?: string | null
          conversation_id?: string | null
          created_at?: string | null
          id?: string | null
          instance_name?: string | null
          rating?: number | null
          response_time_seconds?: number | null
        }
        Update: {
          agent_id?: string | null
          comment?: string | null
          contact_id?: string | null
          conversation_id?: string | null
          created_at?: string | null
          id?: string | null
          instance_name?: string | null
          rating?: number | null
          response_time_seconds?: number | null
        }
        Relationships: []
      }
      csat_surveys: {
        Row: {
          agent_id: string | null
          contact_id: string | null
          conversation_resolved_at: string | null
          created_at: string | null
          feedback: string | null
          id: string | null
          rating: number | null
        }
        Insert: {
          agent_id?: string | null
          contact_id?: string | null
          conversation_resolved_at?: string | null
          created_at?: string | null
          feedback?: string | null
          id?: string | null
          rating?: number | null
        }
        Update: {
          agent_id?: string | null
          contact_id?: string | null
          conversation_resolved_at?: string | null
          created_at?: string | null
          feedback?: string | null
          id?: string | null
          rating?: number | null
        }
        Relationships: []
      }
      custom_emojis: {
        Row: {
          category: string | null
          created_at: string | null
          id: string | null
          image_url: string | null
          is_favorite: boolean | null
          name: string | null
          updated_at: string | null
          uploaded_by: string | null
          use_count: number | null
        }
        Insert: {
          category?: string | null
          created_at?: string | null
          id?: string | null
          image_url?: string | null
          is_favorite?: boolean | null
          name?: string | null
          updated_at?: string | null
          uploaded_by?: string | null
          use_count?: number | null
        }
        Update: {
          category?: string | null
          created_at?: string | null
          id?: string | null
          image_url?: string | null
          is_favorite?: boolean | null
          name?: string | null
          updated_at?: string | null
          uploaded_by?: string | null
          use_count?: number | null
        }
        Relationships: []
      }
      dashboard_queries: {
        Row: {
          created_at: string | null
          id: string | null
          query_config: Json | null
          query_name: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string | null
          query_config?: Json | null
          query_name?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string | null
          query_config?: Json | null
          query_name?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      data_deletion_requests: {
        Row: {
          completed_at: string | null
          id: string | null
          metadata: Json | null
          reason: string | null
          requested_at: string | null
          status: string | null
          user_id: string | null
        }
        Insert: {
          completed_at?: string | null
          id?: string | null
          metadata?: Json | null
          reason?: string | null
          requested_at?: string | null
          status?: string | null
          user_id?: string | null
        }
        Update: {
          completed_at?: string | null
          id?: string | null
          metadata?: Json | null
          reason?: string | null
          requested_at?: string | null
          status?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      dead_letter_queue: {
        Row: {
          attempts: number | null
          created_at: string | null
          error: string | null
          id: string | null
          original_item_id: string | null
          original_queue_id: string | null
          payload: Json | null
        }
        Insert: {
          attempts?: number | null
          created_at?: string | null
          error?: string | null
          id?: string | null
          original_item_id?: string | null
          original_queue_id?: string | null
          payload?: Json | null
        }
        Update: {
          attempts?: number | null
          created_at?: string | null
          error?: string | null
          id?: string | null
          original_item_id?: string | null
          original_queue_id?: string | null
          payload?: Json | null
        }
        Relationships: []
      }
      deal_activities: {
        Row: {
          activity_type: string | null
          created_at: string | null
          deal_id: string | null
          description: string | null
          id: string | null
          performed_by: string | null
        }
        Insert: {
          activity_type?: string | null
          created_at?: string | null
          deal_id?: string | null
          description?: string | null
          id?: string | null
          performed_by?: string | null
        }
        Update: {
          activity_type?: string | null
          created_at?: string | null
          deal_id?: string | null
          description?: string | null
          id?: string | null
          performed_by?: string | null
        }
        Relationships: []
      }
      department_invitations: {
        Row: {
          code: string | null
          created_at: string | null
          created_by: string | null
          department_id: string | null
          email: string | null
          expires_at: string | null
          id: string | null
          invited_by: string | null
          is_revoked: boolean | null
          role: string | null
          status: string | null
          updated_at: string | null
          used_at: string | null
          used_by: string | null
        }
        Insert: {
          code?: string | null
          created_at?: string | null
          created_by?: string | null
          department_id?: string | null
          email?: string | null
          expires_at?: string | null
          id?: string | null
          invited_by?: string | null
          is_revoked?: boolean | null
          role?: string | null
          status?: string | null
          updated_at?: string | null
          used_at?: string | null
          used_by?: string | null
        }
        Update: {
          code?: string | null
          created_at?: string | null
          created_by?: string | null
          department_id?: string | null
          email?: string | null
          expires_at?: string | null
          id?: string | null
          invited_by?: string | null
          is_revoked?: boolean | null
          role?: string | null
          status?: string | null
          updated_at?: string | null
          used_at?: string | null
          used_by?: string | null
        }
        Relationships: []
      }
      departments: {
        Row: {
          created_at: string | null
          description: string | null
          id: string | null
          is_active: boolean | null
          name: string | null
          slug: string | null
          updated_at: string | null
          whatsapp_api_key: string | null
          whatsapp_instance_id: string | null
          whatsapp_mode: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string | null
          is_active?: boolean | null
          name?: string | null
          slug?: string | null
          updated_at?: string | null
          whatsapp_api_key?: string | null
          whatsapp_instance_id?: string | null
          whatsapp_mode?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string | null
          is_active?: boolean | null
          name?: string | null
          slug?: string | null
          updated_at?: string | null
          whatsapp_api_key?: string | null
          whatsapp_instance_id?: string | null
          whatsapp_mode?: string | null
        }
        Relationships: []
      }
      departments_safe: {
        Row: {
          created_at: string | null
          description: string | null
          has_whatsapp_api_key: boolean | null
          id: string | null
          is_active: boolean | null
          name: string | null
          updated_at: string | null
          whatsapp_instance_id: string | null
          whatsapp_mode: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          has_whatsapp_api_key?: never
          id?: string | null
          is_active?: boolean | null
          name?: string | null
          updated_at?: string | null
          whatsapp_instance_id?: string | null
          whatsapp_mode?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          has_whatsapp_api_key?: never
          id?: string | null
          is_active?: boolean | null
          name?: string | null
          updated_at?: string | null
          whatsapp_instance_id?: string | null
          whatsapp_mode?: string | null
        }
        Relationships: []
      }
      deploy_connections: {
        Row: {
          agent_id: string | null
          channel: string | null
          config: Json | null
          created_at: string | null
          error_message: string | null
          id: string | null
          last_message_at: string | null
          message_count: number | null
          status: string | null
          updated_at: string | null
          workspace_id: string | null
        }
        Insert: {
          agent_id?: string | null
          channel?: string | null
          config?: Json | null
          created_at?: string | null
          error_message?: string | null
          id?: string | null
          last_message_at?: string | null
          message_count?: number | null
          status?: string | null
          updated_at?: string | null
          workspace_id?: string | null
        }
        Update: {
          agent_id?: string | null
          channel?: string | null
          config?: Json | null
          created_at?: string | null
          error_message?: string | null
          id?: string | null
          last_message_at?: string | null
          message_count?: number | null
          status?: string | null
          updated_at?: string | null
          workspace_id?: string | null
        }
        Relationships: []
      }
      dept_mapping: {
        Row: {
          ativo: boolean | null
          categoria: string | null
          criado_em: string | null
          dept_en: string | null
          dept_pt: string | null
          id: number | null
        }
        Insert: {
          ativo?: boolean | null
          categoria?: string | null
          criado_em?: string | null
          dept_en?: string | null
          dept_pt?: string | null
          id?: number | null
        }
        Update: {
          ativo?: boolean | null
          categoria?: string | null
          criado_em?: string | null
          dept_en?: string | null
          dept_pt?: string | null
          id?: number | null
        }
        Relationships: []
      }
      dev_diagnostic_logs: {
        Row: {
          action: string | null
          category: string | null
          created_at: string | null
          details: Json | null
          id: string | null
          ip_address: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          action?: string | null
          category?: string | null
          created_at?: string | null
          details?: Json | null
          id?: string | null
          ip_address?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string | null
          category?: string | null
          created_at?: string | null
          details?: Json | null
          id?: string | null
          ip_address?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      dispatch_error_logs: {
        Row: {
          agent_email: string | null
          agent_user_id: string | null
          channel_type: string | null
          contact_id: string | null
          context: Json | null
          created_at: string | null
          error_code: string | null
          error_message: string | null
          error_type: string | null
          failed_message_id: string | null
          http_status: number | null
          id: string | null
          instance_name: string | null
          message_id: string | null
          metadata: Json | null
          occurred_at: string | null
          payload: Json | null
          remote_jid: string | null
          retry_count: number | null
        }
        Insert: {
          agent_email?: string | null
          agent_user_id?: string | null
          channel_type?: string | null
          contact_id?: string | null
          context?: Json | null
          created_at?: string | null
          error_code?: string | null
          error_message?: string | null
          error_type?: string | null
          failed_message_id?: string | null
          http_status?: number | null
          id?: string | null
          instance_name?: string | null
          message_id?: string | null
          metadata?: Json | null
          occurred_at?: string | null
          payload?: Json | null
          remote_jid?: string | null
          retry_count?: number | null
        }
        Update: {
          agent_email?: string | null
          agent_user_id?: string | null
          channel_type?: string | null
          contact_id?: string | null
          context?: Json | null
          created_at?: string | null
          error_code?: string | null
          error_message?: string | null
          error_type?: string | null
          failed_message_id?: string | null
          http_status?: number | null
          id?: string | null
          instance_name?: string | null
          message_id?: string | null
          metadata?: Json | null
          occurred_at?: string | null
          payload?: Json | null
          remote_jid?: string | null
          retry_count?: number | null
        }
        Relationships: []
      }
      dlq_audit_log: {
        Row: {
          action: string | null
          created_at: string | null
          id: string | null
          item_id: string | null
          performed_by: string | null
          reason: string | null
        }
        Insert: {
          action?: string | null
          created_at?: string | null
          id?: string | null
          item_id?: string | null
          performed_by?: string | null
          reason?: string | null
        }
        Update: {
          action?: string | null
          created_at?: string | null
          id?: string | null
          item_id?: string | null
          performed_by?: string | null
          reason?: string | null
        }
        Relationships: []
      }
      documents: {
        Row: {
          collection_id: string | null
          created_at: string | null
          id: string | null
          metadata: Json | null
          mime_type: string | null
          size_bytes: number | null
          source_type: string | null
          source_url: string | null
          status: string | null
          title: string | null
          updated_at: string | null
        }
        Insert: {
          collection_id?: string | null
          created_at?: string | null
          id?: string | null
          metadata?: Json | null
          mime_type?: string | null
          size_bytes?: number | null
          source_type?: string | null
          source_url?: string | null
          status?: string | null
          title?: string | null
          updated_at?: string | null
        }
        Update: {
          collection_id?: string | null
          created_at?: string | null
          id?: string | null
          metadata?: Json | null
          mime_type?: string | null
          size_bytes?: number | null
          source_type?: string | null
          source_url?: string | null
          status?: string | null
          title?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      email_health_logs: {
        Row: {
          account_id: string | null
          created_at: string | null
          error_message: string | null
          id: string | null
          is_failure: boolean | null
          metadata: Json | null
          operation: string | null
          request_id: string | null
          resource: string | null
          status: string | null
        }
        Insert: {
          account_id?: string | null
          created_at?: string | null
          error_message?: string | null
          id?: string | null
          is_failure?: boolean | null
          metadata?: Json | null
          operation?: string | null
          request_id?: string | null
          resource?: string | null
          status?: string | null
        }
        Update: {
          account_id?: string | null
          created_at?: string | null
          error_message?: string | null
          id?: string | null
          is_failure?: boolean | null
          metadata?: Json | null
          operation?: string | null
          request_id?: string | null
          resource?: string | null
          status?: string | null
        }
        Relationships: []
      }
      email_health_summary: {
        Row: {
          active_accounts: number | null
          failure_count: number | null
          id: string | null
          last_checked_at: string | null
          metadata: Json | null
          recent_errors: Json | null
          status: string | null
          total_accounts: number | null
          updated_at: string | null
        }
        Insert: {
          active_accounts?: number | null
          failure_count?: number | null
          id?: string | null
          last_checked_at?: string | null
          metadata?: Json | null
          recent_errors?: Json | null
          status?: string | null
          total_accounts?: number | null
          updated_at?: string | null
        }
        Update: {
          active_accounts?: number | null
          failure_count?: number | null
          id?: string | null
          last_checked_at?: string | null
          metadata?: Json | null
          recent_errors?: Json | null
          status?: string | null
          total_accounts?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      email_revalidation_jobs: {
        Row: {
          account_id: string | null
          completed_at: string | null
          created_at: string | null
          error_message: string | null
          id: string | null
          result: Json | null
          retry_count: number | null
          scheduled_at: string | null
          started_at: string | null
          status: string | null
          triggered_by: string | null
        }
        Insert: {
          account_id?: string | null
          completed_at?: string | null
          created_at?: string | null
          error_message?: string | null
          id?: string | null
          result?: Json | null
          retry_count?: number | null
          scheduled_at?: string | null
          started_at?: string | null
          status?: string | null
          triggered_by?: string | null
        }
        Update: {
          account_id?: string | null
          completed_at?: string | null
          created_at?: string | null
          error_message?: string | null
          id?: string | null
          result?: Json | null
          retry_count?: number | null
          scheduled_at?: string | null
          started_at?: string | null
          status?: string | null
          triggered_by?: string | null
        }
        Relationships: []
      }
      email_watch_history: {
        Row: {
          account_id: string | null
          created_at: string | null
          expires_at: string | null
          history_id: string | null
          id: string | null
          status: string | null
          updated_at: string | null
          watch_registered_at: string | null
        }
        Insert: {
          account_id?: string | null
          created_at?: string | null
          expires_at?: string | null
          history_id?: string | null
          id?: string | null
          status?: string | null
          updated_at?: string | null
          watch_registered_at?: string | null
        }
        Update: {
          account_id?: string | null
          created_at?: string | null
          expires_at?: string | null
          history_id?: string | null
          id?: string | null
          status?: string | null
          updated_at?: string | null
          watch_registered_at?: string | null
        }
        Relationships: []
      }
      embedding_configs: {
        Row: {
          created_at: string | null
          dimension: number | null
          hybrid_search: boolean | null
          id: string | null
          knowledge_base_id: string | null
          provider: string | null
          reranker_model: string | null
          reranker_top_k: number | null
          task: string | null
          updated_at: string | null
          workspace_id: string | null
        }
        Insert: {
          created_at?: string | null
          dimension?: number | null
          hybrid_search?: boolean | null
          id?: string | null
          knowledge_base_id?: string | null
          provider?: string | null
          reranker_model?: string | null
          reranker_top_k?: number | null
          task?: string | null
          updated_at?: string | null
          workspace_id?: string | null
        }
        Update: {
          created_at?: string | null
          dimension?: number | null
          hybrid_search?: boolean | null
          id?: string | null
          knowledge_base_id?: string | null
          provider?: string | null
          reranker_model?: string | null
          reranker_top_k?: number | null
          task?: string | null
          updated_at?: string | null
          workspace_id?: string | null
        }
        Relationships: []
      }
      empresas: {
        Row: {
          bitrix_empresa_id: string | null
          created_at: string | null
          email: Json | null
          id: number | null
          nome: string | null
          telefone: string | null
        }
        Insert: {
          bitrix_empresa_id?: string | null
          created_at?: string | null
          email?: Json | null
          id?: number | null
          nome?: string | null
          telefone?: string | null
        }
        Update: {
          bitrix_empresa_id?: string | null
          created_at?: string | null
          email?: Json | null
          id?: number | null
          nome?: string | null
          telefone?: string | null
        }
        Relationships: []
      }
      engineering_principles: {
        Row: {
          batch_ref: string | null
          category: string | null
          code: string | null
          context: string | null
          discovered_at: string | null
          id: number | null
          lesson: string | null
          severity: string | null
          title: string | null
        }
        Insert: {
          batch_ref?: string | null
          category?: string | null
          code?: string | null
          context?: string | null
          discovered_at?: string | null
          id?: number | null
          lesson?: string | null
          severity?: string | null
          title?: string | null
        }
        Update: {
          batch_ref?: string | null
          category?: string | null
          code?: string | null
          context?: string | null
          discovered_at?: string | null
          id?: number | null
          lesson?: string | null
          severity?: string | null
          title?: string | null
        }
        Relationships: []
      }
      entity_versions: {
        Row: {
          change_summary: string | null
          changed_at: string | null
          changed_by: string | null
          created_at: string | null
          data: Json | null
          entity_id: string | null
          entity_type: string | null
          id: string | null
          version_number: number | null
        }
        Insert: {
          change_summary?: string | null
          changed_at?: string | null
          changed_by?: string | null
          created_at?: string | null
          data?: Json | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string | null
          version_number?: number | null
        }
        Update: {
          change_summary?: string | null
          changed_at?: string | null
          changed_by?: string | null
          created_at?: string | null
          data?: Json | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string | null
          version_number?: number | null
        }
        Relationships: []
      }
      envios_cotacao: {
        Row: {
          cotacao_id: string | null
          enviado_em: string | null
          enviado_por_email: string | null
          enviado_por_nome: string | null
          id: number | null
          observacao: string | null
          ordem_compra_id: number | null
          pedido_item: string | null
          produto: string | null
          qtd_enviada: number | null
          valor_nf_total: number | null
          valor_nf_unid: number | null
        }
        Insert: {
          cotacao_id?: string | null
          enviado_em?: string | null
          enviado_por_email?: string | null
          enviado_por_nome?: string | null
          id?: number | null
          observacao?: string | null
          ordem_compra_id?: number | null
          pedido_item?: string | null
          produto?: string | null
          qtd_enviada?: number | null
          valor_nf_total?: number | null
          valor_nf_unid?: number | null
        }
        Update: {
          cotacao_id?: string | null
          enviado_em?: string | null
          enviado_por_email?: string | null
          enviado_por_nome?: string | null
          id?: number | null
          observacao?: string | null
          ordem_compra_id?: number | null
          pedido_item?: string | null
          produto?: string | null
          qtd_enviada?: number | null
          valor_nf_total?: number | null
          valor_nf_unid?: number | null
        }
        Relationships: []
      }
      environments: {
        Row: {
          config: Json | null
          created_at: string | null
          id: string | null
          name: string | null
          workspace_id: string | null
        }
        Insert: {
          config?: Json | null
          created_at?: string | null
          id?: string | null
          name?: string | null
          workspace_id?: string | null
        }
        Update: {
          config?: Json | null
          created_at?: string | null
          id?: string | null
          name?: string | null
          workspace_id?: string | null
        }
        Relationships: []
      }
      evaluation_datasets: {
        Row: {
          case_count: number | null
          created_at: string | null
          description: string | null
          id: string | null
          name: string | null
          updated_at: string | null
          workspace_id: string | null
        }
        Insert: {
          case_count?: number | null
          created_at?: string | null
          description?: string | null
          id?: string | null
          name?: string | null
          updated_at?: string | null
          workspace_id?: string | null
        }
        Update: {
          case_count?: number | null
          created_at?: string | null
          description?: string | null
          id?: string | null
          name?: string | null
          updated_at?: string | null
          workspace_id?: string | null
        }
        Relationships: []
      }
      evaluation_runs: {
        Row: {
          agent_id: string | null
          completed_at: string | null
          created_at: string | null
          id: string | null
          name: string | null
          pass_rate: number | null
          results: Json | null
          status: string | null
          test_cases: number | null
          workspace_id: string | null
        }
        Insert: {
          agent_id?: string | null
          completed_at?: string | null
          created_at?: string | null
          id?: string | null
          name?: string | null
          pass_rate?: number | null
          results?: Json | null
          status?: string | null
          test_cases?: number | null
          workspace_id?: string | null
        }
        Update: {
          agent_id?: string | null
          completed_at?: string | null
          created_at?: string | null
          id?: string | null
          name?: string | null
          pass_rate?: number | null
          results?: Json | null
          status?: string | null
          test_cases?: number | null
          workspace_id?: string | null
        }
        Relationships: []
      }
      evolution_alert_cooldown: {
        Row: {
          alert_key: string | null
          consecutive_count: number | null
          cooldown_minutes: number | null
          last_dispatch_status: string | null
          last_payload: Json | null
          last_sent_at: string | null
          last_severity: string | null
          last_severity_rank: number | null
          updated_at: string | null
        }
        Insert: {
          alert_key?: string | null
          consecutive_count?: number | null
          cooldown_minutes?: number | null
          last_dispatch_status?: string | null
          last_payload?: Json | null
          last_sent_at?: string | null
          last_severity?: string | null
          last_severity_rank?: number | null
          updated_at?: string | null
        }
        Update: {
          alert_key?: string | null
          consecutive_count?: number | null
          cooldown_minutes?: number | null
          last_dispatch_status?: string | null
          last_payload?: Json | null
          last_sent_at?: string | null
          last_severity?: string | null
          last_severity_rank?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      evolution_alerts: {
        Row: {
          acknowledged: boolean | null
          acknowledged_at: string | null
          acknowledged_by: string | null
          alert_type: string | null
          contact_id: string | null
          created_at: string | null
          description: string | null
          escalated_at: string | null
          id: string | null
          message: string | null
          notified_at: string | null
          payload: Json | null
          remote_jid: string | null
          resolved: boolean | null
          resolved_at: string | null
          resolved_by: string | null
          severity: string | null
          title: string | null
        }
        Insert: {
          acknowledged?: boolean | null
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          alert_type?: string | null
          contact_id?: string | null
          created_at?: string | null
          description?: string | null
          escalated_at?: string | null
          id?: string | null
          message?: string | null
          notified_at?: string | null
          payload?: Json | null
          remote_jid?: string | null
          resolved?: boolean | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string | null
          title?: string | null
        }
        Update: {
          acknowledged?: boolean | null
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          alert_type?: string | null
          contact_id?: string | null
          created_at?: string | null
          description?: string | null
          escalated_at?: string | null
          id?: string | null
          message?: string | null
          notified_at?: string | null
          payload?: Json | null
          remote_jid?: string | null
          resolved?: boolean | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string | null
          title?: string | null
        }
        Relationships: []
      }
      evolution_api_consumers: {
        Row: {
          api_key_secret_ref: string | null
          consumer_type: string | null
          created_at: string | null
          criticality: string | null
          description: string | null
          endpoints_called: string[] | null
          id: string | null
          last_verified_at: string | null
          name: string | null
          notes: string | null
          rotation_needed: boolean | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          api_key_secret_ref?: string | null
          consumer_type?: string | null
          created_at?: string | null
          criticality?: string | null
          description?: string | null
          endpoints_called?: string[] | null
          id?: string | null
          last_verified_at?: string | null
          name?: string | null
          notes?: string | null
          rotation_needed?: boolean | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          api_key_secret_ref?: string | null
          consumer_type?: string | null
          created_at?: string | null
          criticality?: string | null
          description?: string | null
          endpoints_called?: string[] | null
          id?: string | null
          last_verified_at?: string | null
          name?: string | null
          notes?: string | null
          rotation_needed?: boolean | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      evolution_audit_log: {
        Row: {
          action: string | null
          changes: Json | null
          created_at: string | null
          entity_id: string | null
          entity_type: string | null
          id: string | null
          ip_address: string | null
          metadata: Json | null
          new_values: Json | null
          old_values: Json | null
          performed_by: string | null
          performed_by_type: string | null
          session_id: string | null
          user_agent: string | null
        }
        Insert: {
          action?: string | null
          changes?: Json | null
          created_at?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string | null
          ip_address?: string | null
          metadata?: Json | null
          new_values?: Json | null
          old_values?: Json | null
          performed_by?: string | null
          performed_by_type?: string | null
          session_id?: string | null
          user_agent?: string | null
        }
        Update: {
          action?: string | null
          changes?: Json | null
          created_at?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string | null
          ip_address?: string | null
          metadata?: Json | null
          new_values?: Json | null
          old_values?: Json | null
          performed_by?: string | null
          performed_by_type?: string | null
          session_id?: string | null
          user_agent?: string | null
        }
        Relationships: []
      }
      evolution_automation_logs: {
        Row: {
          action_result: Json | null
          automation_id: string | null
          contact_id: string | null
          error_message: string | null
          executed_at: string | null
          id: string | null
          status: string | null
          trigger_data: Json | null
        }
        Insert: {
          action_result?: Json | null
          automation_id?: string | null
          contact_id?: string | null
          error_message?: string | null
          executed_at?: string | null
          id?: string | null
          status?: string | null
          trigger_data?: Json | null
        }
        Update: {
          action_result?: Json | null
          automation_id?: string | null
          contact_id?: string | null
          error_message?: string | null
          executed_at?: string | null
          id?: string | null
          status?: string | null
          trigger_data?: Json | null
        }
        Relationships: []
      }
      evolution_automations: {
        Row: {
          action_config: Json | null
          action_type: string | null
          conditions: Json | null
          created_at: string | null
          delay_minutes: number | null
          description: string | null
          id: string | null
          is_active: boolean | null
          last_run_at: string | null
          name: string | null
          run_count: number | null
          trigger_config: Json | null
          trigger_type: string | null
          updated_at: string | null
        }
        Insert: {
          action_config?: Json | null
          action_type?: string | null
          conditions?: Json | null
          created_at?: string | null
          delay_minutes?: number | null
          description?: string | null
          id?: string | null
          is_active?: boolean | null
          last_run_at?: string | null
          name?: string | null
          run_count?: number | null
          trigger_config?: Json | null
          trigger_type?: string | null
          updated_at?: string | null
        }
        Update: {
          action_config?: Json | null
          action_type?: string | null
          conditions?: Json | null
          created_at?: string | null
          delay_minutes?: number | null
          description?: string | null
          id?: string | null
          is_active?: boolean | null
          last_run_at?: string | null
          name?: string | null
          run_count?: number | null
          trigger_config?: Json | null
          trigger_type?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      evolution_backfill_audit: {
        Row: {
          batch_id: string | null
          errors: number | null
          executed_at: string | null
          executed_by: string | null
          first_msg: string | null
          id: string | null
          inserted: number | null
          last_msg: string | null
          skipped: number | null
          updated: number | null
        }
        Insert: {
          batch_id?: string | null
          errors?: number | null
          executed_at?: string | null
          executed_by?: string | null
          first_msg?: string | null
          id?: string | null
          inserted?: number | null
          last_msg?: string | null
          skipped?: number | null
          updated?: number | null
        }
        Update: {
          batch_id?: string | null
          errors?: number | null
          executed_at?: string | null
          executed_by?: string | null
          first_msg?: string | null
          id?: string | null
          inserted?: number | null
          last_msg?: string | null
          skipped?: number | null
          updated?: number | null
        }
        Relationships: []
      }
      evolution_baileys_session_history: {
        Row: {
          alerts_resolved: number | null
          auto_action_taken: string | null
          classification: string | null
          duration_offline_min: number | null
          event_type: string | null
          id: string | null
          instance_name: string | null
          is_recovery: boolean | null
          messages_reset: number | null
          new_state: string | null
          occurred_at: string | null
          payload: Json | null
          prev_state: string | null
          reason_code: string | null
          source_event_id: string | null
        }
        Insert: {
          alerts_resolved?: number | null
          auto_action_taken?: string | null
          classification?: string | null
          duration_offline_min?: number | null
          event_type?: string | null
          id?: string | null
          instance_name?: string | null
          is_recovery?: boolean | null
          messages_reset?: number | null
          new_state?: string | null
          occurred_at?: string | null
          payload?: Json | null
          prev_state?: string | null
          reason_code?: string | null
          source_event_id?: string | null
        }
        Update: {
          alerts_resolved?: number | null
          auto_action_taken?: string | null
          classification?: string | null
          duration_offline_min?: number | null
          event_type?: string | null
          id?: string | null
          instance_name?: string | null
          is_recovery?: boolean | null
          messages_reset?: number | null
          new_state?: string | null
          occurred_at?: string | null
          payload?: Json | null
          prev_state?: string | null
          reason_code?: string | null
          source_event_id?: string | null
        }
        Relationships: []
      }
      evolution_bitrix_field_mapping: {
        Row: {
          bitrix_field: string | null
          created_at: string | null
          entity_type: string | null
          id: string | null
          is_active: boolean | null
          local_field: string | null
          sync_direction: string | null
          transform_config: Json | null
          transform_type: string | null
        }
        Insert: {
          bitrix_field?: string | null
          created_at?: string | null
          entity_type?: string | null
          id?: string | null
          is_active?: boolean | null
          local_field?: string | null
          sync_direction?: string | null
          transform_config?: Json | null
          transform_type?: string | null
        }
        Update: {
          bitrix_field?: string | null
          created_at?: string | null
          entity_type?: string | null
          id?: string | null
          is_active?: boolean | null
          local_field?: string | null
          sync_direction?: string | null
          transform_config?: Json | null
          transform_type?: string | null
        }
        Relationships: []
      }
      evolution_bitrix_queue: {
        Row: {
          attempts: number | null
          created_at: string | null
          entity_type: string | null
          id: string | null
          last_error: string | null
          local_id: string | null
          max_attempts: number | null
          next_attempt_at: string | null
          operation: string | null
          payload: Json | null
          processed_at: string | null
          status: string | null
        }
        Insert: {
          attempts?: number | null
          created_at?: string | null
          entity_type?: string | null
          id?: string | null
          last_error?: string | null
          local_id?: string | null
          max_attempts?: number | null
          next_attempt_at?: string | null
          operation?: string | null
          payload?: Json | null
          processed_at?: string | null
          status?: string | null
        }
        Update: {
          attempts?: number | null
          created_at?: string | null
          entity_type?: string | null
          id?: string | null
          last_error?: string | null
          local_id?: string | null
          max_attempts?: number | null
          next_attempt_at?: string | null
          operation?: string | null
          payload?: Json | null
          processed_at?: string | null
          status?: string | null
        }
        Relationships: []
      }
      evolution_bitrix_sync: {
        Row: {
          bitrix_entity_type: string | null
          bitrix_id: number | null
          bitrix_version: number | null
          created_at: string | null
          entity_type: string | null
          id: string | null
          last_error: string | null
          last_sync_at: string | null
          local_id: string | null
          local_version: number | null
          sync_status: string | null
          updated_at: string | null
        }
        Insert: {
          bitrix_entity_type?: string | null
          bitrix_id?: number | null
          bitrix_version?: number | null
          created_at?: string | null
          entity_type?: string | null
          id?: string | null
          last_error?: string | null
          last_sync_at?: string | null
          local_id?: string | null
          local_version?: number | null
          sync_status?: string | null
          updated_at?: string | null
        }
        Update: {
          bitrix_entity_type?: string | null
          bitrix_id?: number | null
          bitrix_version?: number | null
          created_at?: string | null
          entity_type?: string | null
          id?: string | null
          last_error?: string | null
          last_sync_at?: string | null
          local_id?: string | null
          local_version?: number | null
          sync_status?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      evolution_blacklist: {
        Row: {
          blocked_at: string | null
          blocked_by: string | null
          created_at: string | null
          description: string | null
          expires_at: string | null
          id: string | null
          is_active: boolean | null
          reason: string | null
          remote_jid: string | null
        }
        Insert: {
          blocked_at?: string | null
          blocked_by?: string | null
          created_at?: string | null
          description?: string | null
          expires_at?: string | null
          id?: string | null
          is_active?: boolean | null
          reason?: string | null
          remote_jid?: string | null
        }
        Update: {
          blocked_at?: string | null
          blocked_by?: string | null
          created_at?: string | null
          description?: string | null
          expires_at?: string | null
          id?: string | null
          is_active?: boolean | null
          reason?: string | null
          remote_jid?: string | null
        }
        Relationships: []
      }
      evolution_bootstrap_log: {
        Row: {
          created_at: string | null
          id: string | null
          instance_id: string | null
          instance_name: string | null
          notes: string | null
          rabbitmq_events_count: number | null
          settings_applied: Json | null
          status: string | null
          triggered_by: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string | null
          instance_id?: string | null
          instance_name?: string | null
          notes?: string | null
          rabbitmq_events_count?: number | null
          settings_applied?: Json | null
          status?: string | null
          triggered_by?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string | null
          instance_id?: string | null
          instance_name?: string | null
          notes?: string | null
          rabbitmq_events_count?: number | null
          settings_applied?: Json | null
          status?: string | null
          triggered_by?: string | null
        }
        Relationships: []
      }
      evolution_broadcasts: {
        Row: {
          completed_at: string | null
          content: string | null
          created_at: string | null
          created_by: string | null
          delivered_count: number | null
          description: string | null
          failed_count: number | null
          id: string | null
          instance_name: string | null
          media_url: string | null
          messages_per_minute: number | null
          name: string | null
          read_count: number | null
          response_count: number | null
          scheduled_at: string | null
          segment_config: Json | null
          segment_type: string | null
          sent_count: number | null
          started_at: string | null
          status: string | null
          template_id: string | null
          total_recipients: number | null
          updated_at: string | null
        }
        Insert: {
          completed_at?: string | null
          content?: string | null
          created_at?: string | null
          created_by?: string | null
          delivered_count?: number | null
          description?: string | null
          failed_count?: number | null
          id?: string | null
          instance_name?: string | null
          media_url?: string | null
          messages_per_minute?: number | null
          name?: string | null
          read_count?: number | null
          response_count?: number | null
          scheduled_at?: string | null
          segment_config?: Json | null
          segment_type?: string | null
          sent_count?: number | null
          started_at?: string | null
          status?: string | null
          template_id?: string | null
          total_recipients?: number | null
          updated_at?: string | null
        }
        Update: {
          completed_at?: string | null
          content?: string | null
          created_at?: string | null
          created_by?: string | null
          delivered_count?: number | null
          description?: string | null
          failed_count?: number | null
          id?: string | null
          instance_name?: string | null
          media_url?: string | null
          messages_per_minute?: number | null
          name?: string | null
          read_count?: number | null
          response_count?: number | null
          scheduled_at?: string | null
          segment_config?: Json | null
          segment_type?: string | null
          sent_count?: number | null
          started_at?: string | null
          status?: string | null
          template_id?: string | null
          total_recipients?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      evolution_burnin_tracker: {
        Row: {
          burn_in_passed: boolean | null
          burn_in_start: string | null
          id: number | null
          last_reset_reason: string | null
          updated_at: string | null
        }
        Insert: {
          burn_in_passed?: boolean | null
          burn_in_start?: string | null
          id?: number | null
          last_reset_reason?: string | null
          updated_at?: string | null
        }
        Update: {
          burn_in_passed?: boolean | null
          burn_in_start?: string | null
          id?: number | null
          last_reset_reason?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      evolution_business_hours: {
        Row: {
          close_time: string | null
          created_at: string | null
          day_of_week: number | null
          id: string | null
          is_closed: boolean | null
          open_time: string | null
          timezone: string | null
        }
        Insert: {
          close_time?: string | null
          created_at?: string | null
          day_of_week?: number | null
          id?: string | null
          is_closed?: boolean | null
          open_time?: string | null
          timezone?: string | null
        }
        Update: {
          close_time?: string | null
          created_at?: string | null
          day_of_week?: number | null
          id?: string | null
          is_closed?: boolean | null
          open_time?: string | null
          timezone?: string | null
        }
        Relationships: []
      }
      evolution_calls: {
        Row: {
          call_id: string | null
          call_status: string | null
          call_type: string | null
          contact_id: string | null
          created_at: string | null
          direction: string | null
          duration_seconds: number | null
          ended_at: string | null
          id: string | null
          instance_name: string | null
          missed_callback_sent: boolean | null
          raw_data: Json | null
          remote_jid: string | null
          started_at: string | null
        }
        Insert: {
          call_id?: string | null
          call_status?: string | null
          call_type?: string | null
          contact_id?: string | null
          created_at?: string | null
          direction?: string | null
          duration_seconds?: number | null
          ended_at?: string | null
          id?: string | null
          instance_name?: string | null
          missed_callback_sent?: boolean | null
          raw_data?: Json | null
          remote_jid?: string | null
          started_at?: string | null
        }
        Update: {
          call_id?: string | null
          call_status?: string | null
          call_type?: string | null
          contact_id?: string | null
          created_at?: string | null
          direction?: string | null
          duration_seconds?: number | null
          ended_at?: string | null
          id?: string | null
          instance_name?: string | null
          missed_callback_sent?: boolean | null
          raw_data?: Json | null
          remote_jid?: string | null
          started_at?: string | null
        }
        Relationships: []
      }
      evolution_campaign_recipients: {
        Row: {
          campaign_id: string | null
          contact_name: string | null
          created_at: string | null
          delivered_at: string | null
          error_message: string | null
          id: string | null
          message_id: string | null
          read_at: string | null
          remote_jid: string | null
          sent_at: string | null
          status: string | null
        }
        Insert: {
          campaign_id?: string | null
          contact_name?: string | null
          created_at?: string | null
          delivered_at?: string | null
          error_message?: string | null
          id?: string | null
          message_id?: string | null
          read_at?: string | null
          remote_jid?: string | null
          sent_at?: string | null
          status?: string | null
        }
        Update: {
          campaign_id?: string | null
          contact_name?: string | null
          created_at?: string | null
          delivered_at?: string | null
          error_message?: string | null
          id?: string | null
          message_id?: string | null
          read_at?: string | null
          remote_jid?: string | null
          sent_at?: string | null
          status?: string | null
        }
        Relationships: []
      }
      evolution_campaigns: {
        Row: {
          completed_at: string | null
          created_at: string | null
          created_by: string | null
          delivered_count: number | null
          description: string | null
          failed_count: number | null
          id: string | null
          messages_per_minute: number | null
          name: string | null
          read_count: number | null
          scheduled_at: string | null
          sent_count: number | null
          started_at: string | null
          status: string | null
          target_filter: Json | null
          template_id: string | null
          total_recipients: number | null
          updated_at: string | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string | null
          created_by?: string | null
          delivered_count?: number | null
          description?: string | null
          failed_count?: number | null
          id?: string | null
          messages_per_minute?: number | null
          name?: string | null
          read_count?: number | null
          scheduled_at?: string | null
          sent_count?: number | null
          started_at?: string | null
          status?: string | null
          target_filter?: Json | null
          template_id?: string | null
          total_recipients?: number | null
          updated_at?: string | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string | null
          created_by?: string | null
          delivered_count?: number | null
          description?: string | null
          failed_count?: number | null
          id?: string | null
          messages_per_minute?: number | null
          name?: string | null
          read_count?: number | null
          scheduled_at?: string | null
          sent_count?: number | null
          started_at?: string | null
          status?: string | null
          target_filter?: Json | null
          template_id?: string | null
          total_recipients?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      evolution_chatbot_responses: {
        Row: {
          created_at: string | null
          feedback: string | null
          id: string | null
          model_used: string | null
          remote_jid: string | null
          response_text: string | null
          response_time_ms: number | null
          tokens_used: number | null
        }
        Insert: {
          created_at?: string | null
          feedback?: string | null
          id?: string | null
          model_used?: string | null
          remote_jid?: string | null
          response_text?: string | null
          response_time_ms?: number | null
          tokens_used?: number | null
        }
        Update: {
          created_at?: string | null
          feedback?: string | null
          id?: string | null
          model_used?: string | null
          remote_jid?: string | null
          response_text?: string | null
          response_time_ms?: number | null
          tokens_used?: number | null
        }
        Relationships: []
      }
      evolution_connection_history: {
        Row: {
          created_at: string | null
          duration_seconds: number | null
          id: string | null
          instance_name: string | null
          metadata: Json | null
          previous_state: string | null
          state: string | null
        }
        Insert: {
          created_at?: string | null
          duration_seconds?: number | null
          id?: string | null
          instance_name?: string | null
          metadata?: Json | null
          previous_state?: string | null
          state?: string | null
        }
        Update: {
          created_at?: string | null
          duration_seconds?: number | null
          id?: string | null
          instance_name?: string | null
          metadata?: Json | null
          previous_state?: string | null
          state?: string | null
        }
        Relationships: []
      }
      evolution_contact_attachments: {
        Row: {
          created_at: string | null
          description: string | null
          file_name: string | null
          file_size: number | null
          file_type: string | null
          file_url: string | null
          id: string | null
          remote_jid: string | null
          storage_path: string | null
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          file_name?: string | null
          file_size?: number | null
          file_type?: string | null
          file_url?: string | null
          id?: string | null
          remote_jid?: string | null
          storage_path?: string | null
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          file_name?: string | null
          file_size?: number | null
          file_type?: string | null
          file_url?: string | null
          id?: string | null
          remote_jid?: string | null
          storage_path?: string | null
          uploaded_by?: string | null
        }
        Relationships: []
      }
      evolution_contact_blacklist: {
        Row: {
          blocked_at: string | null
          blocked_by: string | null
          expires_at: string | null
          id: string | null
          is_active: boolean | null
          reason: string | null
          remote_jid: string | null
        }
        Insert: {
          blocked_at?: string | null
          blocked_by?: string | null
          expires_at?: string | null
          id?: string | null
          is_active?: boolean | null
          reason?: string | null
          remote_jid?: string | null
        }
        Update: {
          blocked_at?: string | null
          blocked_by?: string | null
          expires_at?: string | null
          id?: string | null
          is_active?: boolean | null
          reason?: string | null
          remote_jid?: string | null
        }
        Relationships: []
      }
      evolution_contact_notes: {
        Row: {
          content: string | null
          created_at: string | null
          created_by: string | null
          id: string | null
          is_pinned: boolean | null
          note_type: string | null
          remote_jid: string | null
          updated_at: string | null
        }
        Insert: {
          content?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string | null
          is_pinned?: boolean | null
          note_type?: string | null
          remote_jid?: string | null
          updated_at?: string | null
        }
        Update: {
          content?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string | null
          is_pinned?: boolean | null
          note_type?: string | null
          remote_jid?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      evolution_contact_rate_limits: {
        Row: {
          created_at: string | null
          id: string | null
          is_rate_limited: boolean | null
          message_count: number | null
          remote_jid: string | null
          updated_at: string | null
          window_start: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string | null
          is_rate_limited?: boolean | null
          message_count?: number | null
          remote_jid?: string | null
          updated_at?: string | null
          window_start?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string | null
          is_rate_limited?: boolean | null
          message_count?: number | null
          remote_jid?: string | null
          updated_at?: string | null
          window_start?: string | null
        }
        Relationships: []
      }
      evolution_contacts: {
        Row: {
          assigned_to: string | null
          company: string | null
          created_at: string | null
          dedup_hash: string | null
          deleted_at: string | null
          deleted_reason: string | null
          email: string | null
          first_contact_at: string | null
          first_name: string | null
          full_name: string | null
          id: string | null
          instance_name: string | null
          last_message_at: string | null
          last_name: string | null
          lead_score: number | null
          lead_source: string | null
          lead_status: string | null
          lgpd_consent_at: string | null
          lgpd_consent_channel: string | null
          lgpd_data_sharing: boolean | null
          lgpd_deletion_requested_at: string | null
          lgpd_last_updated_at: string | null
          lgpd_marketing_consent: boolean | null
          lgpd_opt_out_at: string | null
          lgpd_profiling: boolean | null
          merge_source_id: string | null
          message_count: number | null
          nickname: string | null
          notes: string | null
          phone_number: string | null
          pii_masked_at: string | null
          profile_picture_url: string | null
          push_name: string | null
          queue_id: string | null
          raw_data: Json | null
          remote_jid: string | null
          role_title: string | null
          search_vector: unknown
          tags: string[] | null
          total_messages: number | null
          total_purchases: number | null
          updated_at: string | null
          version: number | null
          whatsapp_labels: string[] | null
        }
        Insert: {
          assigned_to?: string | null
          company?: string | null
          created_at?: string | null
          dedup_hash?: string | null
          deleted_at?: string | null
          deleted_reason?: string | null
          email?: string | null
          first_contact_at?: string | null
          first_name?: string | null
          full_name?: string | null
          id?: string | null
          instance_name?: string | null
          last_message_at?: string | null
          last_name?: string | null
          lead_score?: number | null
          lead_source?: string | null
          lead_status?: string | null
          lgpd_consent_at?: string | null
          lgpd_consent_channel?: string | null
          lgpd_data_sharing?: boolean | null
          lgpd_deletion_requested_at?: string | null
          lgpd_last_updated_at?: string | null
          lgpd_marketing_consent?: boolean | null
          lgpd_opt_out_at?: string | null
          lgpd_profiling?: boolean | null
          merge_source_id?: string | null
          message_count?: number | null
          nickname?: string | null
          notes?: string | null
          phone_number?: string | null
          pii_masked_at?: string | null
          profile_picture_url?: string | null
          push_name?: string | null
          queue_id?: string | null
          raw_data?: Json | null
          remote_jid?: string | null
          role_title?: string | null
          search_vector?: unknown
          tags?: string[] | null
          total_messages?: number | null
          total_purchases?: number | null
          updated_at?: string | null
          version?: number | null
          whatsapp_labels?: string[] | null
        }
        Update: {
          assigned_to?: string | null
          company?: string | null
          created_at?: string | null
          dedup_hash?: string | null
          deleted_at?: string | null
          deleted_reason?: string | null
          email?: string | null
          first_contact_at?: string | null
          first_name?: string | null
          full_name?: string | null
          id?: string | null
          instance_name?: string | null
          last_message_at?: string | null
          last_name?: string | null
          lead_score?: number | null
          lead_source?: string | null
          lead_status?: string | null
          lgpd_consent_at?: string | null
          lgpd_consent_channel?: string | null
          lgpd_data_sharing?: boolean | null
          lgpd_deletion_requested_at?: string | null
          lgpd_last_updated_at?: string | null
          lgpd_marketing_consent?: boolean | null
          lgpd_opt_out_at?: string | null
          lgpd_profiling?: boolean | null
          merge_source_id?: string | null
          message_count?: number | null
          nickname?: string | null
          notes?: string | null
          phone_number?: string | null
          pii_masked_at?: string | null
          profile_picture_url?: string | null
          push_name?: string | null
          queue_id?: string | null
          raw_data?: Json | null
          remote_jid?: string | null
          role_title?: string | null
          search_vector?: unknown
          tags?: string[] | null
          total_messages?: number | null
          total_purchases?: number | null
          updated_at?: string | null
          version?: number | null
          whatsapp_labels?: string[] | null
        }
        Relationships: []
      }
      evolution_conversations: {
        Row: {
          assigned_to: string | null
          bot_session_id: string | null
          contact_id: string | null
          created_at: string | null
          department: string | null
          first_message_at: string | null
          first_response_at: string | null
          first_response_seconds: number | null
          id: string | null
          instance_name: string | null
          is_bot_active: boolean | null
          labels: string[] | null
          last_inbound_at: string | null
          last_message_at: string | null
          last_message_content: string | null
          last_message_type: string | null
          last_outbound_at: string | null
          message_count: number | null
          metadata: Json | null
          priority: string | null
          remote_jid: string | null
          resolution_at: string | null
          resolution_seconds: number | null
          satisfaction_comment: string | null
          satisfaction_score: number | null
          status: string | null
          subject: string | null
          unread_count: number | null
          updated_at: string | null
        }
        Insert: {
          assigned_to?: string | null
          bot_session_id?: string | null
          contact_id?: string | null
          created_at?: string | null
          department?: string | null
          first_message_at?: string | null
          first_response_at?: string | null
          first_response_seconds?: number | null
          id?: string | null
          instance_name?: string | null
          is_bot_active?: boolean | null
          labels?: string[] | null
          last_inbound_at?: string | null
          last_message_at?: string | null
          last_message_content?: string | null
          last_message_type?: string | null
          last_outbound_at?: string | null
          message_count?: number | null
          metadata?: Json | null
          priority?: string | null
          remote_jid?: string | null
          resolution_at?: string | null
          resolution_seconds?: number | null
          satisfaction_comment?: string | null
          satisfaction_score?: number | null
          status?: string | null
          subject?: string | null
          unread_count?: number | null
          updated_at?: string | null
        }
        Update: {
          assigned_to?: string | null
          bot_session_id?: string | null
          contact_id?: string | null
          created_at?: string | null
          department?: string | null
          first_message_at?: string | null
          first_response_at?: string | null
          first_response_seconds?: number | null
          id?: string | null
          instance_name?: string | null
          is_bot_active?: boolean | null
          labels?: string[] | null
          last_inbound_at?: string | null
          last_message_at?: string | null
          last_message_content?: string | null
          last_message_type?: string | null
          last_outbound_at?: string | null
          message_count?: number | null
          metadata?: Json | null
          priority?: string | null
          remote_jid?: string | null
          resolution_at?: string | null
          resolution_seconds?: number | null
          satisfaction_comment?: string | null
          satisfaction_score?: number | null
          status?: string | null
          subject?: string | null
          unread_count?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      evolution_conversations_artes: {
        Row: {
          assigned_to: string | null
          bot_session_id: string | null
          contact_id: string | null
          created_at: string | null
          department: string | null
          first_message_at: string | null
          first_response_at: string | null
          first_response_seconds: number | null
          id: string | null
          instance_name: string | null
          is_bot_active: boolean | null
          labels: string[] | null
          last_inbound_at: string | null
          last_message_at: string | null
          last_message_content: string | null
          last_message_type: string | null
          last_outbound_at: string | null
          message_count: number | null
          metadata: Json | null
          priority: string | null
          remote_jid: string | null
          resolution_at: string | null
          resolution_seconds: number | null
          satisfaction_comment: string | null
          satisfaction_score: number | null
          status: string | null
          subject: string | null
          unread_count: number | null
          updated_at: string | null
        }
        Insert: {
          assigned_to?: string | null
          bot_session_id?: string | null
          contact_id?: string | null
          created_at?: string | null
          department?: string | null
          first_message_at?: string | null
          first_response_at?: string | null
          first_response_seconds?: number | null
          id?: string | null
          instance_name?: string | null
          is_bot_active?: boolean | null
          labels?: string[] | null
          last_inbound_at?: string | null
          last_message_at?: string | null
          last_message_content?: string | null
          last_message_type?: string | null
          last_outbound_at?: string | null
          message_count?: number | null
          metadata?: Json | null
          priority?: string | null
          remote_jid?: string | null
          resolution_at?: string | null
          resolution_seconds?: number | null
          satisfaction_comment?: string | null
          satisfaction_score?: number | null
          status?: string | null
          subject?: string | null
          unread_count?: number | null
          updated_at?: string | null
        }
        Update: {
          assigned_to?: string | null
          bot_session_id?: string | null
          contact_id?: string | null
          created_at?: string | null
          department?: string | null
          first_message_at?: string | null
          first_response_at?: string | null
          first_response_seconds?: number | null
          id?: string | null
          instance_name?: string | null
          is_bot_active?: boolean | null
          labels?: string[] | null
          last_inbound_at?: string | null
          last_message_at?: string | null
          last_message_content?: string | null
          last_message_type?: string | null
          last_outbound_at?: string | null
          message_count?: number | null
          metadata?: Json | null
          priority?: string | null
          remote_jid?: string | null
          resolution_at?: string | null
          resolution_seconds?: number | null
          satisfaction_comment?: string | null
          satisfaction_score?: number | null
          status?: string | null
          subject?: string | null
          unread_count?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      evolution_conversations_comercial_01: {
        Row: {
          assigned_to: string | null
          bot_session_id: string | null
          contact_id: string | null
          created_at: string | null
          department: string | null
          first_message_at: string | null
          first_response_at: string | null
          first_response_seconds: number | null
          id: string | null
          instance_name: string | null
          is_bot_active: boolean | null
          labels: string[] | null
          last_inbound_at: string | null
          last_message_at: string | null
          last_message_content: string | null
          last_message_type: string | null
          last_outbound_at: string | null
          message_count: number | null
          metadata: Json | null
          priority: string | null
          remote_jid: string | null
          resolution_at: string | null
          resolution_seconds: number | null
          satisfaction_comment: string | null
          satisfaction_score: number | null
          status: string | null
          subject: string | null
          unread_count: number | null
          updated_at: string | null
        }
        Insert: {
          assigned_to?: string | null
          bot_session_id?: string | null
          contact_id?: string | null
          created_at?: string | null
          department?: string | null
          first_message_at?: string | null
          first_response_at?: string | null
          first_response_seconds?: number | null
          id?: string | null
          instance_name?: string | null
          is_bot_active?: boolean | null
          labels?: string[] | null
          last_inbound_at?: string | null
          last_message_at?: string | null
          last_message_content?: string | null
          last_message_type?: string | null
          last_outbound_at?: string | null
          message_count?: number | null
          metadata?: Json | null
          priority?: string | null
          remote_jid?: string | null
          resolution_at?: string | null
          resolution_seconds?: number | null
          satisfaction_comment?: string | null
          satisfaction_score?: number | null
          status?: string | null
          subject?: string | null
          unread_count?: number | null
          updated_at?: string | null
        }
        Update: {
          assigned_to?: string | null
          bot_session_id?: string | null
          contact_id?: string | null
          created_at?: string | null
          department?: string | null
          first_message_at?: string | null
          first_response_at?: string | null
          first_response_seconds?: number | null
          id?: string | null
          instance_name?: string | null
          is_bot_active?: boolean | null
          labels?: string[] | null
          last_inbound_at?: string | null
          last_message_at?: string | null
          last_message_content?: string | null
          last_message_type?: string | null
          last_outbound_at?: string | null
          message_count?: number | null
          metadata?: Json | null
          priority?: string | null
          remote_jid?: string | null
          resolution_at?: string | null
          resolution_seconds?: number | null
          satisfaction_comment?: string | null
          satisfaction_score?: number | null
          status?: string | null
          subject?: string | null
          unread_count?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      evolution_conversations_comercial_02: {
        Row: {
          assigned_to: string | null
          bot_session_id: string | null
          contact_id: string | null
          created_at: string | null
          department: string | null
          first_message_at: string | null
          first_response_at: string | null
          first_response_seconds: number | null
          id: string | null
          instance_name: string | null
          is_bot_active: boolean | null
          labels: string[] | null
          last_inbound_at: string | null
          last_message_at: string | null
          last_message_content: string | null
          last_message_type: string | null
          last_outbound_at: string | null
          message_count: number | null
          metadata: Json | null
          priority: string | null
          remote_jid: string | null
          resolution_at: string | null
          resolution_seconds: number | null
          satisfaction_comment: string | null
          satisfaction_score: number | null
          status: string | null
          subject: string | null
          unread_count: number | null
          updated_at: string | null
        }
        Insert: {
          assigned_to?: string | null
          bot_session_id?: string | null
          contact_id?: string | null
          created_at?: string | null
          department?: string | null
          first_message_at?: string | null
          first_response_at?: string | null
          first_response_seconds?: number | null
          id?: string | null
          instance_name?: string | null
          is_bot_active?: boolean | null
          labels?: string[] | null
          last_inbound_at?: string | null
          last_message_at?: string | null
          last_message_content?: string | null
          last_message_type?: string | null
          last_outbound_at?: string | null
          message_count?: number | null
          metadata?: Json | null
          priority?: string | null
          remote_jid?: string | null
          resolution_at?: string | null
          resolution_seconds?: number | null
          satisfaction_comment?: string | null
          satisfaction_score?: number | null
          status?: string | null
          subject?: string | null
          unread_count?: number | null
          updated_at?: string | null
        }
        Update: {
          assigned_to?: string | null
          bot_session_id?: string | null
          contact_id?: string | null
          created_at?: string | null
          department?: string | null
          first_message_at?: string | null
          first_response_at?: string | null
          first_response_seconds?: number | null
          id?: string | null
          instance_name?: string | null
          is_bot_active?: boolean | null
          labels?: string[] | null
          last_inbound_at?: string | null
          last_message_at?: string | null
          last_message_content?: string | null
          last_message_type?: string | null
          last_outbound_at?: string | null
          message_count?: number | null
          metadata?: Json | null
          priority?: string | null
          remote_jid?: string | null
          resolution_at?: string | null
          resolution_seconds?: number | null
          satisfaction_comment?: string | null
          satisfaction_score?: number | null
          status?: string | null
          subject?: string | null
          unread_count?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      evolution_conversations_comercial_03: {
        Row: {
          assigned_to: string | null
          bot_session_id: string | null
          contact_id: string | null
          created_at: string | null
          department: string | null
          first_message_at: string | null
          first_response_at: string | null
          first_response_seconds: number | null
          id: string | null
          instance_name: string | null
          is_bot_active: boolean | null
          labels: string[] | null
          last_inbound_at: string | null
          last_message_at: string | null
          last_message_content: string | null
          last_message_type: string | null
          last_outbound_at: string | null
          message_count: number | null
          metadata: Json | null
          priority: string | null
          remote_jid: string | null
          resolution_at: string | null
          resolution_seconds: number | null
          satisfaction_comment: string | null
          satisfaction_score: number | null
          status: string | null
          subject: string | null
          unread_count: number | null
          updated_at: string | null
        }
        Insert: {
          assigned_to?: string | null
          bot_session_id?: string | null
          contact_id?: string | null
          created_at?: string | null
          department?: string | null
          first_message_at?: string | null
          first_response_at?: string | null
          first_response_seconds?: number | null
          id?: string | null
          instance_name?: string | null
          is_bot_active?: boolean | null
          labels?: string[] | null
          last_inbound_at?: string | null
          last_message_at?: string | null
          last_message_content?: string | null
          last_message_type?: string | null
          last_outbound_at?: string | null
          message_count?: number | null
          metadata?: Json | null
          priority?: string | null
          remote_jid?: string | null
          resolution_at?: string | null
          resolution_seconds?: number | null
          satisfaction_comment?: string | null
          satisfaction_score?: number | null
          status?: string | null
          subject?: string | null
          unread_count?: number | null
          updated_at?: string | null
        }
        Update: {
          assigned_to?: string | null
          bot_session_id?: string | null
          contact_id?: string | null
          created_at?: string | null
          department?: string | null
          first_message_at?: string | null
          first_response_at?: string | null
          first_response_seconds?: number | null
          id?: string | null
          instance_name?: string | null
          is_bot_active?: boolean | null
          labels?: string[] | null
          last_inbound_at?: string | null
          last_message_at?: string | null
          last_message_content?: string | null
          last_message_type?: string | null
          last_outbound_at?: string | null
          message_count?: number | null
          metadata?: Json | null
          priority?: string | null
          remote_jid?: string | null
          resolution_at?: string | null
          resolution_seconds?: number | null
          satisfaction_comment?: string | null
          satisfaction_score?: number | null
          status?: string | null
          subject?: string | null
          unread_count?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      evolution_conversations_comercial_04: {
        Row: {
          assigned_to: string | null
          bot_session_id: string | null
          contact_id: string | null
          created_at: string | null
          department: string | null
          first_message_at: string | null
          first_response_at: string | null
          first_response_seconds: number | null
          id: string | null
          instance_name: string | null
          is_bot_active: boolean | null
          labels: string[] | null
          last_inbound_at: string | null
          last_message_at: string | null
          last_message_content: string | null
          last_message_type: string | null
          last_outbound_at: string | null
          message_count: number | null
          metadata: Json | null
          priority: string | null
          remote_jid: string | null
          resolution_at: string | null
          resolution_seconds: number | null
          satisfaction_comment: string | null
          satisfaction_score: number | null
          status: string | null
          subject: string | null
          unread_count: number | null
          updated_at: string | null
        }
        Insert: {
          assigned_to?: string | null
          bot_session_id?: string | null
          contact_id?: string | null
          created_at?: string | null
          department?: string | null
          first_message_at?: string | null
          first_response_at?: string | null
          first_response_seconds?: number | null
          id?: string | null
          instance_name?: string | null
          is_bot_active?: boolean | null
          labels?: string[] | null
          last_inbound_at?: string | null
          last_message_at?: string | null
          last_message_content?: string | null
          last_message_type?: string | null
          last_outbound_at?: string | null
          message_count?: number | null
          metadata?: Json | null
          priority?: string | null
          remote_jid?: string | null
          resolution_at?: string | null
          resolution_seconds?: number | null
          satisfaction_comment?: string | null
          satisfaction_score?: number | null
          status?: string | null
          subject?: string | null
          unread_count?: number | null
          updated_at?: string | null
        }
        Update: {
          assigned_to?: string | null
          bot_session_id?: string | null
          contact_id?: string | null
          created_at?: string | null
          department?: string | null
          first_message_at?: string | null
          first_response_at?: string | null
          first_response_seconds?: number | null
          id?: string | null
          instance_name?: string | null
          is_bot_active?: boolean | null
          labels?: string[] | null
          last_inbound_at?: string | null
          last_message_at?: string | null
          last_message_content?: string | null
          last_message_type?: string | null
          last_outbound_at?: string | null
          message_count?: number | null
          metadata?: Json | null
          priority?: string | null
          remote_jid?: string | null
          resolution_at?: string | null
          resolution_seconds?: number | null
          satisfaction_comment?: string | null
          satisfaction_score?: number | null
          status?: string | null
          subject?: string | null
          unread_count?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      evolution_conversations_comercial_05: {
        Row: {
          assigned_to: string | null
          bot_session_id: string | null
          contact_id: string | null
          created_at: string | null
          department: string | null
          first_message_at: string | null
          first_response_at: string | null
          first_response_seconds: number | null
          id: string | null
          instance_name: string | null
          is_bot_active: boolean | null
          labels: string[] | null
          last_inbound_at: string | null
          last_message_at: string | null
          last_message_content: string | null
          last_message_type: string | null
          last_outbound_at: string | null
          message_count: number | null
          metadata: Json | null
          priority: string | null
          remote_jid: string | null
          resolution_at: string | null
          resolution_seconds: number | null
          satisfaction_comment: string | null
          satisfaction_score: number | null
          status: string | null
          subject: string | null
          unread_count: number | null
          updated_at: string | null
        }
        Insert: {
          assigned_to?: string | null
          bot_session_id?: string | null
          contact_id?: string | null
          created_at?: string | null
          department?: string | null
          first_message_at?: string | null
          first_response_at?: string | null
          first_response_seconds?: number | null
          id?: string | null
          instance_name?: string | null
          is_bot_active?: boolean | null
          labels?: string[] | null
          last_inbound_at?: string | null
          last_message_at?: string | null
          last_message_content?: string | null
          last_message_type?: string | null
          last_outbound_at?: string | null
          message_count?: number | null
          metadata?: Json | null
          priority?: string | null
          remote_jid?: string | null
          resolution_at?: string | null
          resolution_seconds?: number | null
          satisfaction_comment?: string | null
          satisfaction_score?: number | null
          status?: string | null
          subject?: string | null
          unread_count?: number | null
          updated_at?: string | null
        }
        Update: {
          assigned_to?: string | null
          bot_session_id?: string | null
          contact_id?: string | null
          created_at?: string | null
          department?: string | null
          first_message_at?: string | null
          first_response_at?: string | null
          first_response_seconds?: number | null
          id?: string | null
          instance_name?: string | null
          is_bot_active?: boolean | null
          labels?: string[] | null
          last_inbound_at?: string | null
          last_message_at?: string | null
          last_message_content?: string | null
          last_message_type?: string | null
          last_outbound_at?: string | null
          message_count?: number | null
          metadata?: Json | null
          priority?: string | null
          remote_jid?: string | null
          resolution_at?: string | null
          resolution_seconds?: number | null
          satisfaction_comment?: string | null
          satisfaction_score?: number | null
          status?: string | null
          subject?: string | null
          unread_count?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      evolution_conversations_comercial_06: {
        Row: {
          assigned_to: string | null
          bot_session_id: string | null
          contact_id: string | null
          created_at: string | null
          department: string | null
          first_message_at: string | null
          first_response_at: string | null
          first_response_seconds: number | null
          id: string | null
          instance_name: string | null
          is_bot_active: boolean | null
          labels: string[] | null
          last_inbound_at: string | null
          last_message_at: string | null
          last_message_content: string | null
          last_message_type: string | null
          last_outbound_at: string | null
          message_count: number | null
          metadata: Json | null
          priority: string | null
          remote_jid: string | null
          resolution_at: string | null
          resolution_seconds: number | null
          satisfaction_comment: string | null
          satisfaction_score: number | null
          status: string | null
          subject: string | null
          unread_count: number | null
          updated_at: string | null
        }
        Insert: {
          assigned_to?: string | null
          bot_session_id?: string | null
          contact_id?: string | null
          created_at?: string | null
          department?: string | null
          first_message_at?: string | null
          first_response_at?: string | null
          first_response_seconds?: number | null
          id?: string | null
          instance_name?: string | null
          is_bot_active?: boolean | null
          labels?: string[] | null
          last_inbound_at?: string | null
          last_message_at?: string | null
          last_message_content?: string | null
          last_message_type?: string | null
          last_outbound_at?: string | null
          message_count?: number | null
          metadata?: Json | null
          priority?: string | null
          remote_jid?: string | null
          resolution_at?: string | null
          resolution_seconds?: number | null
          satisfaction_comment?: string | null
          satisfaction_score?: number | null
          status?: string | null
          subject?: string | null
          unread_count?: number | null
          updated_at?: string | null
        }
        Update: {
          assigned_to?: string | null
          bot_session_id?: string | null
          contact_id?: string | null
          created_at?: string | null
          department?: string | null
          first_message_at?: string | null
          first_response_at?: string | null
          first_response_seconds?: number | null
          id?: string | null
          instance_name?: string | null
          is_bot_active?: boolean | null
          labels?: string[] | null
          last_inbound_at?: string | null
          last_message_at?: string | null
          last_message_content?: string | null
          last_message_type?: string | null
          last_outbound_at?: string | null
          message_count?: number | null
          metadata?: Json | null
          priority?: string | null
          remote_jid?: string | null
          resolution_at?: string | null
          resolution_seconds?: number | null
          satisfaction_comment?: string | null
          satisfaction_score?: number | null
          status?: string | null
          subject?: string | null
          unread_count?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      evolution_conversations_comercial_07: {
        Row: {
          assigned_to: string | null
          bot_session_id: string | null
          contact_id: string | null
          created_at: string | null
          department: string | null
          first_message_at: string | null
          first_response_at: string | null
          first_response_seconds: number | null
          id: string | null
          instance_name: string | null
          is_bot_active: boolean | null
          labels: string[] | null
          last_inbound_at: string | null
          last_message_at: string | null
          last_message_content: string | null
          last_message_type: string | null
          last_outbound_at: string | null
          message_count: number | null
          metadata: Json | null
          priority: string | null
          remote_jid: string | null
          resolution_at: string | null
          resolution_seconds: number | null
          satisfaction_comment: string | null
          satisfaction_score: number | null
          status: string | null
          subject: string | null
          unread_count: number | null
          updated_at: string | null
        }
        Insert: {
          assigned_to?: string | null
          bot_session_id?: string | null
          contact_id?: string | null
          created_at?: string | null
          department?: string | null
          first_message_at?: string | null
          first_response_at?: string | null
          first_response_seconds?: number | null
          id?: string | null
          instance_name?: string | null
          is_bot_active?: boolean | null
          labels?: string[] | null
          last_inbound_at?: string | null
          last_message_at?: string | null
          last_message_content?: string | null
          last_message_type?: string | null
          last_outbound_at?: string | null
          message_count?: number | null
          metadata?: Json | null
          priority?: string | null
          remote_jid?: string | null
          resolution_at?: string | null
          resolution_seconds?: number | null
          satisfaction_comment?: string | null
          satisfaction_score?: number | null
          status?: string | null
          subject?: string | null
          unread_count?: number | null
          updated_at?: string | null
        }
        Update: {
          assigned_to?: string | null
          bot_session_id?: string | null
          contact_id?: string | null
          created_at?: string | null
          department?: string | null
          first_message_at?: string | null
          first_response_at?: string | null
          first_response_seconds?: number | null
          id?: string | null
          instance_name?: string | null
          is_bot_active?: boolean | null
          labels?: string[] | null
          last_inbound_at?: string | null
          last_message_at?: string | null
          last_message_content?: string | null
          last_message_type?: string | null
          last_outbound_at?: string | null
          message_count?: number | null
          metadata?: Json | null
          priority?: string | null
          remote_jid?: string | null
          resolution_at?: string | null
          resolution_seconds?: number | null
          satisfaction_comment?: string | null
          satisfaction_score?: number | null
          status?: string | null
          subject?: string | null
          unread_count?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      evolution_conversations_comercial_08: {
        Row: {
          assigned_to: string | null
          bot_session_id: string | null
          contact_id: string | null
          created_at: string | null
          department: string | null
          first_message_at: string | null
          first_response_at: string | null
          first_response_seconds: number | null
          id: string | null
          instance_name: string | null
          is_bot_active: boolean | null
          labels: string[] | null
          last_inbound_at: string | null
          last_message_at: string | null
          last_message_content: string | null
          last_message_type: string | null
          last_outbound_at: string | null
          message_count: number | null
          metadata: Json | null
          priority: string | null
          remote_jid: string | null
          resolution_at: string | null
          resolution_seconds: number | null
          satisfaction_comment: string | null
          satisfaction_score: number | null
          status: string | null
          subject: string | null
          unread_count: number | null
          updated_at: string | null
        }
        Insert: {
          assigned_to?: string | null
          bot_session_id?: string | null
          contact_id?: string | null
          created_at?: string | null
          department?: string | null
          first_message_at?: string | null
          first_response_at?: string | null
          first_response_seconds?: number | null
          id?: string | null
          instance_name?: string | null
          is_bot_active?: boolean | null
          labels?: string[] | null
          last_inbound_at?: string | null
          last_message_at?: string | null
          last_message_content?: string | null
          last_message_type?: string | null
          last_outbound_at?: string | null
          message_count?: number | null
          metadata?: Json | null
          priority?: string | null
          remote_jid?: string | null
          resolution_at?: string | null
          resolution_seconds?: number | null
          satisfaction_comment?: string | null
          satisfaction_score?: number | null
          status?: string | null
          subject?: string | null
          unread_count?: number | null
          updated_at?: string | null
        }
        Update: {
          assigned_to?: string | null
          bot_session_id?: string | null
          contact_id?: string | null
          created_at?: string | null
          department?: string | null
          first_message_at?: string | null
          first_response_at?: string | null
          first_response_seconds?: number | null
          id?: string | null
          instance_name?: string | null
          is_bot_active?: boolean | null
          labels?: string[] | null
          last_inbound_at?: string | null
          last_message_at?: string | null
          last_message_content?: string | null
          last_message_type?: string | null
          last_outbound_at?: string | null
          message_count?: number | null
          metadata?: Json | null
          priority?: string | null
          remote_jid?: string | null
          resolution_at?: string | null
          resolution_seconds?: number | null
          satisfaction_comment?: string | null
          satisfaction_score?: number | null
          status?: string | null
          subject?: string | null
          unread_count?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      evolution_conversations_comercial_09: {
        Row: {
          assigned_to: string | null
          bot_session_id: string | null
          contact_id: string | null
          created_at: string | null
          department: string | null
          first_message_at: string | null
          first_response_at: string | null
          first_response_seconds: number | null
          id: string | null
          instance_name: string | null
          is_bot_active: boolean | null
          labels: string[] | null
          last_inbound_at: string | null
          last_message_at: string | null
          last_message_content: string | null
          last_message_type: string | null
          last_outbound_at: string | null
          message_count: number | null
          metadata: Json | null
          priority: string | null
          remote_jid: string | null
          resolution_at: string | null
          resolution_seconds: number | null
          satisfaction_comment: string | null
          satisfaction_score: number | null
          status: string | null
          subject: string | null
          unread_count: number | null
          updated_at: string | null
        }
        Insert: {
          assigned_to?: string | null
          bot_session_id?: string | null
          contact_id?: string | null
          created_at?: string | null
          department?: string | null
          first_message_at?: string | null
          first_response_at?: string | null
          first_response_seconds?: number | null
          id?: string | null
          instance_name?: string | null
          is_bot_active?: boolean | null
          labels?: string[] | null
          last_inbound_at?: string | null
          last_message_at?: string | null
          last_message_content?: string | null
          last_message_type?: string | null
          last_outbound_at?: string | null
          message_count?: number | null
          metadata?: Json | null
          priority?: string | null
          remote_jid?: string | null
          resolution_at?: string | null
          resolution_seconds?: number | null
          satisfaction_comment?: string | null
          satisfaction_score?: number | null
          status?: string | null
          subject?: string | null
          unread_count?: number | null
          updated_at?: string | null
        }
        Update: {
          assigned_to?: string | null
          bot_session_id?: string | null
          contact_id?: string | null
          created_at?: string | null
          department?: string | null
          first_message_at?: string | null
          first_response_at?: string | null
          first_response_seconds?: number | null
          id?: string | null
          instance_name?: string | null
          is_bot_active?: boolean | null
          labels?: string[] | null
          last_inbound_at?: string | null
          last_message_at?: string | null
          last_message_content?: string | null
          last_message_type?: string | null
          last_outbound_at?: string | null
          message_count?: number | null
          metadata?: Json | null
          priority?: string | null
          remote_jid?: string | null
          resolution_at?: string | null
          resolution_seconds?: number | null
          satisfaction_comment?: string | null
          satisfaction_score?: number | null
          status?: string | null
          subject?: string | null
          unread_count?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      evolution_conversations_comercial_10: {
        Row: {
          assigned_to: string | null
          bot_session_id: string | null
          contact_id: string | null
          created_at: string | null
          department: string | null
          first_message_at: string | null
          first_response_at: string | null
          first_response_seconds: number | null
          id: string | null
          instance_name: string | null
          is_bot_active: boolean | null
          labels: string[] | null
          last_inbound_at: string | null
          last_message_at: string | null
          last_message_content: string | null
          last_message_type: string | null
          last_outbound_at: string | null
          message_count: number | null
          metadata: Json | null
          priority: string | null
          remote_jid: string | null
          resolution_at: string | null
          resolution_seconds: number | null
          satisfaction_comment: string | null
          satisfaction_score: number | null
          status: string | null
          subject: string | null
          unread_count: number | null
          updated_at: string | null
        }
        Insert: {
          assigned_to?: string | null
          bot_session_id?: string | null
          contact_id?: string | null
          created_at?: string | null
          department?: string | null
          first_message_at?: string | null
          first_response_at?: string | null
          first_response_seconds?: number | null
          id?: string | null
          instance_name?: string | null
          is_bot_active?: boolean | null
          labels?: string[] | null
          last_inbound_at?: string | null
          last_message_at?: string | null
          last_message_content?: string | null
          last_message_type?: string | null
          last_outbound_at?: string | null
          message_count?: number | null
          metadata?: Json | null
          priority?: string | null
          remote_jid?: string | null
          resolution_at?: string | null
          resolution_seconds?: number | null
          satisfaction_comment?: string | null
          satisfaction_score?: number | null
          status?: string | null
          subject?: string | null
          unread_count?: number | null
          updated_at?: string | null
        }
        Update: {
          assigned_to?: string | null
          bot_session_id?: string | null
          contact_id?: string | null
          created_at?: string | null
          department?: string | null
          first_message_at?: string | null
          first_response_at?: string | null
          first_response_seconds?: number | null
          id?: string | null
          instance_name?: string | null
          is_bot_active?: boolean | null
          labels?: string[] | null
          last_inbound_at?: string | null
          last_message_at?: string | null
          last_message_content?: string | null
          last_message_type?: string | null
          last_outbound_at?: string | null
          message_count?: number | null
          metadata?: Json | null
          priority?: string | null
          remote_jid?: string | null
          resolution_at?: string | null
          resolution_seconds?: number | null
          satisfaction_comment?: string | null
          satisfaction_score?: number | null
          status?: string | null
          subject?: string | null
          unread_count?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      evolution_conversations_comercial_11: {
        Row: {
          assigned_to: string | null
          bot_session_id: string | null
          contact_id: string | null
          created_at: string | null
          department: string | null
          first_message_at: string | null
          first_response_at: string | null
          first_response_seconds: number | null
          id: string | null
          instance_name: string | null
          is_bot_active: boolean | null
          labels: string[] | null
          last_inbound_at: string | null
          last_message_at: string | null
          last_message_content: string | null
          last_message_type: string | null
          last_outbound_at: string | null
          message_count: number | null
          metadata: Json | null
          priority: string | null
          remote_jid: string | null
          resolution_at: string | null
          resolution_seconds: number | null
          satisfaction_comment: string | null
          satisfaction_score: number | null
          status: string | null
          subject: string | null
          unread_count: number | null
          updated_at: string | null
        }
        Insert: {
          assigned_to?: string | null
          bot_session_id?: string | null
          contact_id?: string | null
          created_at?: string | null
          department?: string | null
          first_message_at?: string | null
          first_response_at?: string | null
          first_response_seconds?: number | null
          id?: string | null
          instance_name?: string | null
          is_bot_active?: boolean | null
          labels?: string[] | null
          last_inbound_at?: string | null
          last_message_at?: string | null
          last_message_content?: string | null
          last_message_type?: string | null
          last_outbound_at?: string | null
          message_count?: number | null
          metadata?: Json | null
          priority?: string | null
          remote_jid?: string | null
          resolution_at?: string | null
          resolution_seconds?: number | null
          satisfaction_comment?: string | null
          satisfaction_score?: number | null
          status?: string | null
          subject?: string | null
          unread_count?: number | null
          updated_at?: string | null
        }
        Update: {
          assigned_to?: string | null
          bot_session_id?: string | null
          contact_id?: string | null
          created_at?: string | null
          department?: string | null
          first_message_at?: string | null
          first_response_at?: string | null
          first_response_seconds?: number | null
          id?: string | null
          instance_name?: string | null
          is_bot_active?: boolean | null
          labels?: string[] | null
          last_inbound_at?: string | null
          last_message_at?: string | null
          last_message_content?: string | null
          last_message_type?: string | null
          last_outbound_at?: string | null
          message_count?: number | null
          metadata?: Json | null
          priority?: string | null
          remote_jid?: string | null
          resolution_at?: string | null
          resolution_seconds?: number | null
          satisfaction_comment?: string | null
          satisfaction_score?: number | null
          status?: string | null
          subject?: string | null
          unread_count?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      evolution_conversations_comercial_12: {
        Row: {
          assigned_to: string | null
          bot_session_id: string | null
          contact_id: string | null
          created_at: string | null
          department: string | null
          first_message_at: string | null
          first_response_at: string | null
          first_response_seconds: number | null
          id: string | null
          instance_name: string | null
          is_bot_active: boolean | null
          labels: string[] | null
          last_inbound_at: string | null
          last_message_at: string | null
          last_message_content: string | null
          last_message_type: string | null
          last_outbound_at: string | null
          message_count: number | null
          metadata: Json | null
          priority: string | null
          remote_jid: string | null
          resolution_at: string | null
          resolution_seconds: number | null
          satisfaction_comment: string | null
          satisfaction_score: number | null
          status: string | null
          subject: string | null
          unread_count: number | null
          updated_at: string | null
        }
        Insert: {
          assigned_to?: string | null
          bot_session_id?: string | null
          contact_id?: string | null
          created_at?: string | null
          department?: string | null
          first_message_at?: string | null
          first_response_at?: string | null
          first_response_seconds?: number | null
          id?: string | null
          instance_name?: string | null
          is_bot_active?: boolean | null
          labels?: string[] | null
          last_inbound_at?: string | null
          last_message_at?: string | null
          last_message_content?: string | null
          last_message_type?: string | null
          last_outbound_at?: string | null
          message_count?: number | null
          metadata?: Json | null
          priority?: string | null
          remote_jid?: string | null
          resolution_at?: string | null
          resolution_seconds?: number | null
          satisfaction_comment?: string | null
          satisfaction_score?: number | null
          status?: string | null
          subject?: string | null
          unread_count?: number | null
          updated_at?: string | null
        }
        Update: {
          assigned_to?: string | null
          bot_session_id?: string | null
          contact_id?: string | null
          created_at?: string | null
          department?: string | null
          first_message_at?: string | null
          first_response_at?: string | null
          first_response_seconds?: number | null
          id?: string | null
          instance_name?: string | null
          is_bot_active?: boolean | null
          labels?: string[] | null
          last_inbound_at?: string | null
          last_message_at?: string | null
          last_message_content?: string | null
          last_message_type?: string | null
          last_outbound_at?: string | null
          message_count?: number | null
          metadata?: Json | null
          priority?: string | null
          remote_jid?: string | null
          resolution_at?: string | null
          resolution_seconds?: number | null
          satisfaction_comment?: string | null
          satisfaction_score?: number | null
          status?: string | null
          subject?: string | null
          unread_count?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      evolution_conversations_comercial_13: {
        Row: {
          assigned_to: string | null
          bot_session_id: string | null
          contact_id: string | null
          created_at: string | null
          department: string | null
          first_message_at: string | null
          first_response_at: string | null
          first_response_seconds: number | null
          id: string | null
          instance_name: string | null
          is_bot_active: boolean | null
          labels: string[] | null
          last_inbound_at: string | null
          last_message_at: string | null
          last_message_content: string | null
          last_message_type: string | null
          last_outbound_at: string | null
          message_count: number | null
          metadata: Json | null
          priority: string | null
          remote_jid: string | null
          resolution_at: string | null
          resolution_seconds: number | null
          satisfaction_comment: string | null
          satisfaction_score: number | null
          status: string | null
          subject: string | null
          unread_count: number | null
          updated_at: string | null
        }
        Insert: {
          assigned_to?: string | null
          bot_session_id?: string | null
          contact_id?: string | null
          created_at?: string | null
          department?: string | null
          first_message_at?: string | null
          first_response_at?: string | null
          first_response_seconds?: number | null
          id?: string | null
          instance_name?: string | null
          is_bot_active?: boolean | null
          labels?: string[] | null
          last_inbound_at?: string | null
          last_message_at?: string | null
          last_message_content?: string | null
          last_message_type?: string | null
          last_outbound_at?: string | null
          message_count?: number | null
          metadata?: Json | null
          priority?: string | null
          remote_jid?: string | null
          resolution_at?: string | null
          resolution_seconds?: number | null
          satisfaction_comment?: string | null
          satisfaction_score?: number | null
          status?: string | null
          subject?: string | null
          unread_count?: number | null
          updated_at?: string | null
        }
        Update: {
          assigned_to?: string | null
          bot_session_id?: string | null
          contact_id?: string | null
          created_at?: string | null
          department?: string | null
          first_message_at?: string | null
          first_response_at?: string | null
          first_response_seconds?: number | null
          id?: string | null
          instance_name?: string | null
          is_bot_active?: boolean | null
          labels?: string[] | null
          last_inbound_at?: string | null
          last_message_at?: string | null
          last_message_content?: string | null
          last_message_type?: string | null
          last_outbound_at?: string | null
          message_count?: number | null
          metadata?: Json | null
          priority?: string | null
          remote_jid?: string | null
          resolution_at?: string | null
          resolution_seconds?: number | null
          satisfaction_comment?: string | null
          satisfaction_score?: number | null
          status?: string | null
          subject?: string | null
          unread_count?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      evolution_conversations_comercial_14: {
        Row: {
          assigned_to: string | null
          bot_session_id: string | null
          contact_id: string | null
          created_at: string | null
          department: string | null
          first_message_at: string | null
          first_response_at: string | null
          first_response_seconds: number | null
          id: string | null
          instance_name: string | null
          is_bot_active: boolean | null
          labels: string[] | null
          last_inbound_at: string | null
          last_message_at: string | null
          last_message_content: string | null
          last_message_type: string | null
          last_outbound_at: string | null
          message_count: number | null
          metadata: Json | null
          priority: string | null
          remote_jid: string | null
          resolution_at: string | null
          resolution_seconds: number | null
          satisfaction_comment: string | null
          satisfaction_score: number | null
          status: string | null
          subject: string | null
          unread_count: number | null
          updated_at: string | null
        }
        Insert: {
          assigned_to?: string | null
          bot_session_id?: string | null
          contact_id?: string | null
          created_at?: string | null
          department?: string | null
          first_message_at?: string | null
          first_response_at?: string | null
          first_response_seconds?: number | null
          id?: string | null
          instance_name?: string | null
          is_bot_active?: boolean | null
          labels?: string[] | null
          last_inbound_at?: string | null
          last_message_at?: string | null
          last_message_content?: string | null
          last_message_type?: string | null
          last_outbound_at?: string | null
          message_count?: number | null
          metadata?: Json | null
          priority?: string | null
          remote_jid?: string | null
          resolution_at?: string | null
          resolution_seconds?: number | null
          satisfaction_comment?: string | null
          satisfaction_score?: number | null
          status?: string | null
          subject?: string | null
          unread_count?: number | null
          updated_at?: string | null
        }
        Update: {
          assigned_to?: string | null
          bot_session_id?: string | null
          contact_id?: string | null
          created_at?: string | null
          department?: string | null
          first_message_at?: string | null
          first_response_at?: string | null
          first_response_seconds?: number | null
          id?: string | null
          instance_name?: string | null
          is_bot_active?: boolean | null
          labels?: string[] | null
          last_inbound_at?: string | null
          last_message_at?: string | null
          last_message_content?: string | null
          last_message_type?: string | null
          last_outbound_at?: string | null
          message_count?: number | null
          metadata?: Json | null
          priority?: string | null
          remote_jid?: string | null
          resolution_at?: string | null
          resolution_seconds?: number | null
          satisfaction_comment?: string | null
          satisfaction_score?: number | null
          status?: string | null
          subject?: string | null
          unread_count?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      evolution_conversations_comercial_15: {
        Row: {
          assigned_to: string | null
          bot_session_id: string | null
          contact_id: string | null
          created_at: string | null
          department: string | null
          first_message_at: string | null
          first_response_at: string | null
          first_response_seconds: number | null
          id: string | null
          instance_name: string | null
          is_bot_active: boolean | null
          labels: string[] | null
          last_inbound_at: string | null
          last_message_at: string | null
          last_message_content: string | null
          last_message_type: string | null
          last_outbound_at: string | null
          message_count: number | null
          metadata: Json | null
          priority: string | null
          remote_jid: string | null
          resolution_at: string | null
          resolution_seconds: number | null
          satisfaction_comment: string | null
          satisfaction_score: number | null
          status: string | null
          subject: string | null
          unread_count: number | null
          updated_at: string | null
        }
        Insert: {
          assigned_to?: string | null
          bot_session_id?: string | null
          contact_id?: string | null
          created_at?: string | null
          department?: string | null
          first_message_at?: string | null
          first_response_at?: string | null
          first_response_seconds?: number | null
          id?: string | null
          instance_name?: string | null
          is_bot_active?: boolean | null
          labels?: string[] | null
          last_inbound_at?: string | null
          last_message_at?: string | null
          last_message_content?: string | null
          last_message_type?: string | null
          last_outbound_at?: string | null
          message_count?: number | null
          metadata?: Json | null
          priority?: string | null
          remote_jid?: string | null
          resolution_at?: string | null
          resolution_seconds?: number | null
          satisfaction_comment?: string | null
          satisfaction_score?: number | null
          status?: string | null
          subject?: string | null
          unread_count?: number | null
          updated_at?: string | null
        }
        Update: {
          assigned_to?: string | null
          bot_session_id?: string | null
          contact_id?: string | null
          created_at?: string | null
          department?: string | null
          first_message_at?: string | null
          first_response_at?: string | null
          first_response_seconds?: number | null
          id?: string | null
          instance_name?: string | null
          is_bot_active?: boolean | null
          labels?: string[] | null
          last_inbound_at?: string | null
          last_message_at?: string | null
          last_message_content?: string | null
          last_message_type?: string | null
          last_outbound_at?: string | null
          message_count?: number | null
          metadata?: Json | null
          priority?: string | null
          remote_jid?: string | null
          resolution_at?: string | null
          resolution_seconds?: number | null
          satisfaction_comment?: string | null
          satisfaction_score?: number | null
          status?: string | null
          subject?: string | null
          unread_count?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      evolution_conversations_compras: {
        Row: {
          assigned_to: string | null
          bot_session_id: string | null
          contact_id: string | null
          created_at: string | null
          department: string | null
          first_message_at: string | null
          first_response_at: string | null
          first_response_seconds: number | null
          id: string | null
          instance_name: string | null
          is_bot_active: boolean | null
          labels: string[] | null
          last_inbound_at: string | null
          last_message_at: string | null
          last_message_content: string | null
          last_message_type: string | null
          last_outbound_at: string | null
          message_count: number | null
          metadata: Json | null
          priority: string | null
          remote_jid: string | null
          resolution_at: string | null
          resolution_seconds: number | null
          satisfaction_comment: string | null
          satisfaction_score: number | null
          status: string | null
          subject: string | null
          unread_count: number | null
          updated_at: string | null
        }
        Insert: {
          assigned_to?: string | null
          bot_session_id?: string | null
          contact_id?: string | null
          created_at?: string | null
          department?: string | null
          first_message_at?: string | null
          first_response_at?: string | null
          first_response_seconds?: number | null
          id?: string | null
          instance_name?: string | null
          is_bot_active?: boolean | null
          labels?: string[] | null
          last_inbound_at?: string | null
          last_message_at?: string | null
          last_message_content?: string | null
          last_message_type?: string | null
          last_outbound_at?: string | null
          message_count?: number | null
          metadata?: Json | null
          priority?: string | null
          remote_jid?: string | null
          resolution_at?: string | null
          resolution_seconds?: number | null
          satisfaction_comment?: string | null
          satisfaction_score?: number | null
          status?: string | null
          subject?: string | null
          unread_count?: number | null
          updated_at?: string | null
        }
        Update: {
          assigned_to?: string | null
          bot_session_id?: string | null
          contact_id?: string | null
          created_at?: string | null
          department?: string | null
          first_message_at?: string | null
          first_response_at?: string | null
          first_response_seconds?: number | null
          id?: string | null
          instance_name?: string | null
          is_bot_active?: boolean | null
          labels?: string[] | null
          last_inbound_at?: string | null
          last_message_at?: string | null
          last_message_content?: string | null
          last_message_type?: string | null
          last_outbound_at?: string | null
          message_count?: number | null
          metadata?: Json | null
          priority?: string | null
          remote_jid?: string | null
          resolution_at?: string | null
          resolution_seconds?: number | null
          satisfaction_comment?: string | null
          satisfaction_score?: number | null
          status?: string | null
          subject?: string | null
          unread_count?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      evolution_conversations_default: {
        Row: {
          assigned_to: string | null
          bot_session_id: string | null
          contact_id: string | null
          created_at: string | null
          department: string | null
          first_message_at: string | null
          first_response_at: string | null
          first_response_seconds: number | null
          id: string | null
          instance_name: string | null
          is_bot_active: boolean | null
          labels: string[] | null
          last_inbound_at: string | null
          last_message_at: string | null
          last_message_content: string | null
          last_message_type: string | null
          last_outbound_at: string | null
          message_count: number | null
          metadata: Json | null
          priority: string | null
          remote_jid: string | null
          resolution_at: string | null
          resolution_seconds: number | null
          satisfaction_comment: string | null
          satisfaction_score: number | null
          status: string | null
          subject: string | null
          unread_count: number | null
          updated_at: string | null
        }
        Insert: {
          assigned_to?: string | null
          bot_session_id?: string | null
          contact_id?: string | null
          created_at?: string | null
          department?: string | null
          first_message_at?: string | null
          first_response_at?: string | null
          first_response_seconds?: number | null
          id?: string | null
          instance_name?: string | null
          is_bot_active?: boolean | null
          labels?: string[] | null
          last_inbound_at?: string | null
          last_message_at?: string | null
          last_message_content?: string | null
          last_message_type?: string | null
          last_outbound_at?: string | null
          message_count?: number | null
          metadata?: Json | null
          priority?: string | null
          remote_jid?: string | null
          resolution_at?: string | null
          resolution_seconds?: number | null
          satisfaction_comment?: string | null
          satisfaction_score?: number | null
          status?: string | null
          subject?: string | null
          unread_count?: number | null
          updated_at?: string | null
        }
        Update: {
          assigned_to?: string | null
          bot_session_id?: string | null
          contact_id?: string | null
          created_at?: string | null
          department?: string | null
          first_message_at?: string | null
          first_response_at?: string | null
          first_response_seconds?: number | null
          id?: string | null
          instance_name?: string | null
          is_bot_active?: boolean | null
          labels?: string[] | null
          last_inbound_at?: string | null
          last_message_at?: string | null
          last_message_content?: string | null
          last_message_type?: string | null
          last_outbound_at?: string | null
          message_count?: number | null
          metadata?: Json | null
          priority?: string | null
          remote_jid?: string | null
          resolution_at?: string | null
          resolution_seconds?: number | null
          satisfaction_comment?: string | null
          satisfaction_score?: number | null
          status?: string | null
          subject?: string | null
          unread_count?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      evolution_conversations_financeiro: {
        Row: {
          assigned_to: string | null
          bot_session_id: string | null
          contact_id: string | null
          created_at: string | null
          department: string | null
          first_message_at: string | null
          first_response_at: string | null
          first_response_seconds: number | null
          id: string | null
          instance_name: string | null
          is_bot_active: boolean | null
          labels: string[] | null
          last_inbound_at: string | null
          last_message_at: string | null
          last_message_content: string | null
          last_message_type: string | null
          last_outbound_at: string | null
          message_count: number | null
          metadata: Json | null
          priority: string | null
          remote_jid: string | null
          resolution_at: string | null
          resolution_seconds: number | null
          satisfaction_comment: string | null
          satisfaction_score: number | null
          status: string | null
          subject: string | null
          unread_count: number | null
          updated_at: string | null
        }
        Insert: {
          assigned_to?: string | null
          bot_session_id?: string | null
          contact_id?: string | null
          created_at?: string | null
          department?: string | null
          first_message_at?: string | null
          first_response_at?: string | null
          first_response_seconds?: number | null
          id?: string | null
          instance_name?: string | null
          is_bot_active?: boolean | null
          labels?: string[] | null
          last_inbound_at?: string | null
          last_message_at?: string | null
          last_message_content?: string | null
          last_message_type?: string | null
          last_outbound_at?: string | null
          message_count?: number | null
          metadata?: Json | null
          priority?: string | null
          remote_jid?: string | null
          resolution_at?: string | null
          resolution_seconds?: number | null
          satisfaction_comment?: string | null
          satisfaction_score?: number | null
          status?: string | null
          subject?: string | null
          unread_count?: number | null
          updated_at?: string | null
        }
        Update: {
          assigned_to?: string | null
          bot_session_id?: string | null
          contact_id?: string | null
          created_at?: string | null
          department?: string | null
          first_message_at?: string | null
          first_response_at?: string | null
          first_response_seconds?: number | null
          id?: string | null
          instance_name?: string | null
          is_bot_active?: boolean | null
          labels?: string[] | null
          last_inbound_at?: string | null
          last_message_at?: string | null
          last_message_content?: string | null
          last_message_type?: string | null
          last_outbound_at?: string | null
          message_count?: number | null
          metadata?: Json | null
          priority?: string | null
          remote_jid?: string | null
          resolution_at?: string | null
          resolution_seconds?: number | null
          satisfaction_comment?: string | null
          satisfaction_score?: number | null
          status?: string | null
          subject?: string | null
          unread_count?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      evolution_conversations_gravacao: {
        Row: {
          assigned_to: string | null
          bot_session_id: string | null
          contact_id: string | null
          created_at: string | null
          department: string | null
          first_message_at: string | null
          first_response_at: string | null
          first_response_seconds: number | null
          id: string | null
          instance_name: string | null
          is_bot_active: boolean | null
          labels: string[] | null
          last_inbound_at: string | null
          last_message_at: string | null
          last_message_content: string | null
          last_message_type: string | null
          last_outbound_at: string | null
          message_count: number | null
          metadata: Json | null
          priority: string | null
          remote_jid: string | null
          resolution_at: string | null
          resolution_seconds: number | null
          satisfaction_comment: string | null
          satisfaction_score: number | null
          status: string | null
          subject: string | null
          unread_count: number | null
          updated_at: string | null
        }
        Insert: {
          assigned_to?: string | null
          bot_session_id?: string | null
          contact_id?: string | null
          created_at?: string | null
          department?: string | null
          first_message_at?: string | null
          first_response_at?: string | null
          first_response_seconds?: number | null
          id?: string | null
          instance_name?: string | null
          is_bot_active?: boolean | null
          labels?: string[] | null
          last_inbound_at?: string | null
          last_message_at?: string | null
          last_message_content?: string | null
          last_message_type?: string | null
          last_outbound_at?: string | null
          message_count?: number | null
          metadata?: Json | null
          priority?: string | null
          remote_jid?: string | null
          resolution_at?: string | null
          resolution_seconds?: number | null
          satisfaction_comment?: string | null
          satisfaction_score?: number | null
          status?: string | null
          subject?: string | null
          unread_count?: number | null
          updated_at?: string | null
        }
        Update: {
          assigned_to?: string | null
          bot_session_id?: string | null
          contact_id?: string | null
          created_at?: string | null
          department?: string | null
          first_message_at?: string | null
          first_response_at?: string | null
          first_response_seconds?: number | null
          id?: string | null
          instance_name?: string | null
          is_bot_active?: boolean | null
          labels?: string[] | null
          last_inbound_at?: string | null
          last_message_at?: string | null
          last_message_content?: string | null
          last_message_type?: string | null
          last_outbound_at?: string | null
          message_count?: number | null
          metadata?: Json | null
          priority?: string | null
          remote_jid?: string | null
          resolution_at?: string | null
          resolution_seconds?: number | null
          satisfaction_comment?: string | null
          satisfaction_score?: number | null
          status?: string | null
          subject?: string | null
          unread_count?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      evolution_conversations_logistica: {
        Row: {
          assigned_to: string | null
          bot_session_id: string | null
          contact_id: string | null
          created_at: string | null
          department: string | null
          first_message_at: string | null
          first_response_at: string | null
          first_response_seconds: number | null
          id: string | null
          instance_name: string | null
          is_bot_active: boolean | null
          labels: string[] | null
          last_inbound_at: string | null
          last_message_at: string | null
          last_message_content: string | null
          last_message_type: string | null
          last_outbound_at: string | null
          message_count: number | null
          metadata: Json | null
          priority: string | null
          remote_jid: string | null
          resolution_at: string | null
          resolution_seconds: number | null
          satisfaction_comment: string | null
          satisfaction_score: number | null
          status: string | null
          subject: string | null
          unread_count: number | null
          updated_at: string | null
        }
        Insert: {
          assigned_to?: string | null
          bot_session_id?: string | null
          contact_id?: string | null
          created_at?: string | null
          department?: string | null
          first_message_at?: string | null
          first_response_at?: string | null
          first_response_seconds?: number | null
          id?: string | null
          instance_name?: string | null
          is_bot_active?: boolean | null
          labels?: string[] | null
          last_inbound_at?: string | null
          last_message_at?: string | null
          last_message_content?: string | null
          last_message_type?: string | null
          last_outbound_at?: string | null
          message_count?: number | null
          metadata?: Json | null
          priority?: string | null
          remote_jid?: string | null
          resolution_at?: string | null
          resolution_seconds?: number | null
          satisfaction_comment?: string | null
          satisfaction_score?: number | null
          status?: string | null
          subject?: string | null
          unread_count?: number | null
          updated_at?: string | null
        }
        Update: {
          assigned_to?: string | null
          bot_session_id?: string | null
          contact_id?: string | null
          created_at?: string | null
          department?: string | null
          first_message_at?: string | null
          first_response_at?: string | null
          first_response_seconds?: number | null
          id?: string | null
          instance_name?: string | null
          is_bot_active?: boolean | null
          labels?: string[] | null
          last_inbound_at?: string | null
          last_message_at?: string | null
          last_message_content?: string | null
          last_message_type?: string | null
          last_outbound_at?: string | null
          message_count?: number | null
          metadata?: Json | null
          priority?: string | null
          remote_jid?: string | null
          resolution_at?: string | null
          resolution_seconds?: number | null
          satisfaction_comment?: string | null
          satisfaction_score?: number | null
          status?: string | null
          subject?: string | null
          unread_count?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      evolution_conversations_marketing: {
        Row: {
          assigned_to: string | null
          bot_session_id: string | null
          contact_id: string | null
          created_at: string | null
          department: string | null
          first_message_at: string | null
          first_response_at: string | null
          first_response_seconds: number | null
          id: string | null
          instance_name: string | null
          is_bot_active: boolean | null
          labels: string[] | null
          last_inbound_at: string | null
          last_message_at: string | null
          last_message_content: string | null
          last_message_type: string | null
          last_outbound_at: string | null
          message_count: number | null
          metadata: Json | null
          priority: string | null
          remote_jid: string | null
          resolution_at: string | null
          resolution_seconds: number | null
          satisfaction_comment: string | null
          satisfaction_score: number | null
          status: string | null
          subject: string | null
          unread_count: number | null
          updated_at: string | null
        }
        Insert: {
          assigned_to?: string | null
          bot_session_id?: string | null
          contact_id?: string | null
          created_at?: string | null
          department?: string | null
          first_message_at?: string | null
          first_response_at?: string | null
          first_response_seconds?: number | null
          id?: string | null
          instance_name?: string | null
          is_bot_active?: boolean | null
          labels?: string[] | null
          last_inbound_at?: string | null
          last_message_at?: string | null
          last_message_content?: string | null
          last_message_type?: string | null
          last_outbound_at?: string | null
          message_count?: number | null
          metadata?: Json | null
          priority?: string | null
          remote_jid?: string | null
          resolution_at?: string | null
          resolution_seconds?: number | null
          satisfaction_comment?: string | null
          satisfaction_score?: number | null
          status?: string | null
          subject?: string | null
          unread_count?: number | null
          updated_at?: string | null
        }
        Update: {
          assigned_to?: string | null
          bot_session_id?: string | null
          contact_id?: string | null
          created_at?: string | null
          department?: string | null
          first_message_at?: string | null
          first_response_at?: string | null
          first_response_seconds?: number | null
          id?: string | null
          instance_name?: string | null
          is_bot_active?: boolean | null
          labels?: string[] | null
          last_inbound_at?: string | null
          last_message_at?: string | null
          last_message_content?: string | null
          last_message_type?: string | null
          last_outbound_at?: string | null
          message_count?: number | null
          metadata?: Json | null
          priority?: string | null
          remote_jid?: string | null
          resolution_at?: string | null
          resolution_seconds?: number | null
          satisfaction_comment?: string | null
          satisfaction_score?: number | null
          status?: string | null
          subject?: string | null
          unread_count?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      evolution_conversations_wpp2: {
        Row: {
          assigned_to: string | null
          bot_session_id: string | null
          contact_id: string | null
          created_at: string | null
          department: string | null
          first_message_at: string | null
          first_response_at: string | null
          first_response_seconds: number | null
          id: string | null
          instance_name: string | null
          is_bot_active: boolean | null
          labels: string[] | null
          last_inbound_at: string | null
          last_message_at: string | null
          last_message_content: string | null
          last_message_type: string | null
          last_outbound_at: string | null
          message_count: number | null
          metadata: Json | null
          priority: string | null
          remote_jid: string | null
          resolution_at: string | null
          resolution_seconds: number | null
          satisfaction_comment: string | null
          satisfaction_score: number | null
          status: string | null
          subject: string | null
          unread_count: number | null
          updated_at: string | null
        }
        Insert: {
          assigned_to?: string | null
          bot_session_id?: string | null
          contact_id?: string | null
          created_at?: string | null
          department?: string | null
          first_message_at?: string | null
          first_response_at?: string | null
          first_response_seconds?: number | null
          id?: string | null
          instance_name?: string | null
          is_bot_active?: boolean | null
          labels?: string[] | null
          last_inbound_at?: string | null
          last_message_at?: string | null
          last_message_content?: string | null
          last_message_type?: string | null
          last_outbound_at?: string | null
          message_count?: number | null
          metadata?: Json | null
          priority?: string | null
          remote_jid?: string | null
          resolution_at?: string | null
          resolution_seconds?: number | null
          satisfaction_comment?: string | null
          satisfaction_score?: number | null
          status?: string | null
          subject?: string | null
          unread_count?: number | null
          updated_at?: string | null
        }
        Update: {
          assigned_to?: string | null
          bot_session_id?: string | null
          contact_id?: string | null
          created_at?: string | null
          department?: string | null
          first_message_at?: string | null
          first_response_at?: string | null
          first_response_seconds?: number | null
          id?: string | null
          instance_name?: string | null
          is_bot_active?: boolean | null
          labels?: string[] | null
          last_inbound_at?: string | null
          last_message_at?: string | null
          last_message_content?: string | null
          last_message_type?: string | null
          last_outbound_at?: string | null
          message_count?: number | null
          metadata?: Json | null
          priority?: string | null
          remote_jid?: string | null
          resolution_at?: string | null
          resolution_seconds?: number | null
          satisfaction_comment?: string | null
          satisfaction_score?: number | null
          status?: string | null
          subject?: string | null
          unread_count?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      evolution_daily_metrics: {
        Row: {
          active_contacts: number | null
          automations_triggered: number | null
          avg_messages_per_contact: number | null
          avg_resolution_time_seconds: number | null
          avg_response_time_seconds: number | null
          calculated_at: string | null
          conversations_opened: number | null
          conversations_resolved: number | null
          deal_win_rate: number | null
          deals_created: number | null
          deals_lost: number | null
          deals_won: number | null
          followups_sent: number | null
          id: string | null
          lead_to_deal_rate: number | null
          messages_received: number | null
          messages_sent: number | null
          metric_date: string | null
          new_contacts: number | null
          pipeline_value: number | null
          revenue: number | null
          total_contacts: number | null
        }
        Insert: {
          active_contacts?: number | null
          automations_triggered?: number | null
          avg_messages_per_contact?: number | null
          avg_resolution_time_seconds?: number | null
          avg_response_time_seconds?: number | null
          calculated_at?: string | null
          conversations_opened?: number | null
          conversations_resolved?: number | null
          deal_win_rate?: number | null
          deals_created?: number | null
          deals_lost?: number | null
          deals_won?: number | null
          followups_sent?: number | null
          id?: string | null
          lead_to_deal_rate?: number | null
          messages_received?: number | null
          messages_sent?: number | null
          metric_date?: string | null
          new_contacts?: number | null
          pipeline_value?: number | null
          revenue?: number | null
          total_contacts?: number | null
        }
        Update: {
          active_contacts?: number | null
          automations_triggered?: number | null
          avg_messages_per_contact?: number | null
          avg_resolution_time_seconds?: number | null
          avg_response_time_seconds?: number | null
          calculated_at?: string | null
          conversations_opened?: number | null
          conversations_resolved?: number | null
          deal_win_rate?: number | null
          deals_created?: number | null
          deals_lost?: number | null
          deals_won?: number | null
          followups_sent?: number | null
          id?: string | null
          lead_to_deal_rate?: number | null
          messages_received?: number | null
          messages_sent?: number | null
          metric_date?: string | null
          new_contacts?: number | null
          pipeline_value?: number | null
          revenue?: number | null
          total_contacts?: number | null
        }
        Relationships: []
      }
      evolution_deals: {
        Row: {
          actual_close_date: string | null
          assigned_to: string | null
          closed_at: string | null
          contact_id: string | null
          conversation_id: string | null
          cost: number | null
          created_at: string | null
          deal_number: number | null
          deleted_at: string | null
          description: string | null
          discount_percent: number | null
          expected_close_date: string | null
          id: string | null
          instance_name: string | null
          lost: boolean | null
          lost_notes: string | null
          lost_reason: string | null
          metadata: Json | null
          notes: string | null
          probability: number | null
          products: Json | null
          profit: number | null
          source: string | null
          stage: string | null
          stage_changed_at: string | null
          tags: string[] | null
          title: string | null
          updated_at: string | null
          value: number | null
          weighted_value: number | null
          won: boolean | null
        }
        Insert: {
          actual_close_date?: string | null
          assigned_to?: string | null
          closed_at?: string | null
          contact_id?: string | null
          conversation_id?: string | null
          cost?: number | null
          created_at?: string | null
          deal_number?: number | null
          deleted_at?: string | null
          description?: string | null
          discount_percent?: number | null
          expected_close_date?: string | null
          id?: string | null
          instance_name?: string | null
          lost?: boolean | null
          lost_notes?: string | null
          lost_reason?: string | null
          metadata?: Json | null
          notes?: string | null
          probability?: number | null
          products?: Json | null
          profit?: number | null
          source?: string | null
          stage?: string | null
          stage_changed_at?: string | null
          tags?: string[] | null
          title?: string | null
          updated_at?: string | null
          value?: number | null
          weighted_value?: number | null
          won?: boolean | null
        }
        Update: {
          actual_close_date?: string | null
          assigned_to?: string | null
          closed_at?: string | null
          contact_id?: string | null
          conversation_id?: string | null
          cost?: number | null
          created_at?: string | null
          deal_number?: number | null
          deleted_at?: string | null
          description?: string | null
          discount_percent?: number | null
          expected_close_date?: string | null
          id?: string | null
          instance_name?: string | null
          lost?: boolean | null
          lost_notes?: string | null
          lost_reason?: string | null
          metadata?: Json | null
          notes?: string | null
          probability?: number | null
          products?: Json | null
          profit?: number | null
          source?: string | null
          stage?: string | null
          stage_changed_at?: string | null
          tags?: string[] | null
          title?: string | null
          updated_at?: string | null
          value?: number | null
          weighted_value?: number | null
          won?: boolean | null
        }
        Relationships: []
      }
      evolution_dlq: {
        Row: {
          created_at: string | null
          error_message: string | null
          event_id: string | null
          event_type: string | null
          id: string | null
          instance_name: string | null
          max_retries: number | null
          payload: Json | null
          processed_at: string | null
          retry_count: number | null
        }
        Insert: {
          created_at?: string | null
          error_message?: string | null
          event_id?: string | null
          event_type?: string | null
          id?: string | null
          instance_name?: string | null
          max_retries?: number | null
          payload?: Json | null
          processed_at?: string | null
          retry_count?: number | null
        }
        Update: {
          created_at?: string | null
          error_message?: string | null
          event_id?: string | null
          event_type?: string | null
          id?: string | null
          instance_name?: string | null
          max_retries?: number | null
          payload?: Json | null
          processed_at?: string | null
          retry_count?: number | null
        }
        Relationships: []
      }
      evolution_ef_logs: {
        Row: {
          context: Json | null
          created_at: string | null
          duration_ms: number | null
          ef_name: string | null
          ef_version: string | null
          function_name: string | null
          id: number | null
          level: string | null
          message: string | null
          trace_id: string | null
        }
        Insert: {
          context?: Json | null
          created_at?: string | null
          duration_ms?: number | null
          ef_name?: string | null
          ef_version?: string | null
          function_name?: string | null
          id?: number | null
          level?: string | null
          message?: string | null
          trace_id?: string | null
        }
        Update: {
          context?: Json | null
          created_at?: string | null
          duration_ms?: number | null
          ef_name?: string | null
          ef_version?: string | null
          function_name?: string | null
          id?: number | null
          level?: string | null
          message?: string | null
          trace_id?: string | null
        }
        Relationships: []
      }
      evolution_fallback_events: {
        Row: {
          action: string | null
          created_at: string | null
          error_message: string | null
          event_type: string | null
          id: string | null
          instance: string | null
          instance_name: string | null
          payload: Json | null
          ts: string | null
        }
        Insert: {
          action?: string | null
          created_at?: string | null
          error_message?: string | null
          event_type?: string | null
          id?: string | null
          instance?: string | null
          instance_name?: string | null
          payload?: Json | null
          ts?: string | null
        }
        Update: {
          action?: string | null
          created_at?: string | null
          error_message?: string | null
          event_type?: string | null
          id?: string | null
          instance?: string | null
          instance_name?: string | null
          payload?: Json | null
          ts?: string | null
        }
        Relationships: []
      }
      evolution_followup_rules: {
        Row: {
          conditions: Json | null
          created_at: string | null
          delay_hours: number | null
          description: string | null
          id: string | null
          is_active: boolean | null
          name: string | null
          run_count: number | null
          sequence_group: string | null
          sequence_order: number | null
          template_id: string | null
          trigger_config: Json | null
          trigger_type: string | null
          updated_at: string | null
        }
        Insert: {
          conditions?: Json | null
          created_at?: string | null
          delay_hours?: number | null
          description?: string | null
          id?: string | null
          is_active?: boolean | null
          name?: string | null
          run_count?: number | null
          sequence_group?: string | null
          sequence_order?: number | null
          template_id?: string | null
          trigger_config?: Json | null
          trigger_type?: string | null
          updated_at?: string | null
        }
        Update: {
          conditions?: Json | null
          created_at?: string | null
          delay_hours?: number | null
          description?: string | null
          id?: string | null
          is_active?: boolean | null
          name?: string | null
          run_count?: number | null
          sequence_group?: string | null
          sequence_order?: number | null
          template_id?: string | null
          trigger_config?: Json | null
          trigger_type?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      evolution_followups: {
        Row: {
          attempts: number | null
          contact_id: string | null
          conversation_id: string | null
          created_at: string | null
          created_by: string | null
          custom_message: string | null
          deal_id: string | null
          error_message: string | null
          followup_type: string | null
          id: string | null
          instance_name: string | null
          max_attempts: number | null
          metadata: Json | null
          response_at: string | null
          scheduled_at: string | null
          sent_at: string | null
          status: string | null
          template_id: string | null
          triggered_at: string | null
        }
        Insert: {
          attempts?: number | null
          contact_id?: string | null
          conversation_id?: string | null
          created_at?: string | null
          created_by?: string | null
          custom_message?: string | null
          deal_id?: string | null
          error_message?: string | null
          followup_type?: string | null
          id?: string | null
          instance_name?: string | null
          max_attempts?: number | null
          metadata?: Json | null
          response_at?: string | null
          scheduled_at?: string | null
          sent_at?: string | null
          status?: string | null
          template_id?: string | null
          triggered_at?: string | null
        }
        Update: {
          attempts?: number | null
          contact_id?: string | null
          conversation_id?: string | null
          created_at?: string | null
          created_by?: string | null
          custom_message?: string | null
          deal_id?: string | null
          error_message?: string | null
          followup_type?: string | null
          id?: string | null
          instance_name?: string | null
          max_attempts?: number | null
          metadata?: Json | null
          response_at?: string | null
          scheduled_at?: string | null
          sent_at?: string | null
          status?: string | null
          template_id?: string | null
          triggered_at?: string | null
        }
        Relationships: []
      }
      evolution_group_messages: {
        Row: {
          content: string | null
          created_at: string | null
          group_id: string | null
          id: string | null
          is_from_admin: boolean | null
          media_url: string | null
          mentions: string[] | null
          message_id: string | null
          message_type: string | null
          quoted_message_id: string | null
          sender_jid: string | null
          sender_name: string | null
        }
        Insert: {
          content?: string | null
          created_at?: string | null
          group_id?: string | null
          id?: string | null
          is_from_admin?: boolean | null
          media_url?: string | null
          mentions?: string[] | null
          message_id?: string | null
          message_type?: string | null
          quoted_message_id?: string | null
          sender_jid?: string | null
          sender_name?: string | null
        }
        Update: {
          content?: string | null
          created_at?: string | null
          group_id?: string | null
          id?: string | null
          is_from_admin?: boolean | null
          media_url?: string | null
          mentions?: string[] | null
          message_id?: string | null
          message_type?: string | null
          quoted_message_id?: string | null
          sender_jid?: string | null
          sender_name?: string | null
        }
        Relationships: []
      }
      evolution_group_participants: {
        Row: {
          contact_id: string | null
          group_id: string | null
          id: string | null
          is_active: boolean | null
          joined_at: string | null
          left_at: string | null
          participant_jid: string | null
          role: string | null
        }
        Insert: {
          contact_id?: string | null
          group_id?: string | null
          id?: string | null
          is_active?: boolean | null
          joined_at?: string | null
          left_at?: string | null
          participant_jid?: string | null
          role?: string | null
        }
        Update: {
          contact_id?: string | null
          group_id?: string | null
          id?: string | null
          is_active?: boolean | null
          joined_at?: string | null
          left_at?: string | null
          participant_jid?: string | null
          role?: string | null
        }
        Relationships: []
      }
      evolution_group_rules: {
        Row: {
          action_type: string | null
          action_value: string | null
          created_at: string | null
          execution_count: number | null
          group_id: string | null
          id: string | null
          is_active: boolean | null
          last_executed_at: string | null
          rule_type: string | null
          trigger_value: string | null
        }
        Insert: {
          action_type?: string | null
          action_value?: string | null
          created_at?: string | null
          execution_count?: number | null
          group_id?: string | null
          id?: string | null
          is_active?: boolean | null
          last_executed_at?: string | null
          rule_type?: string | null
          trigger_value?: string | null
        }
        Update: {
          action_type?: string | null
          action_value?: string | null
          created_at?: string | null
          execution_count?: number | null
          group_id?: string | null
          id?: string | null
          is_active?: boolean | null
          last_executed_at?: string | null
          rule_type?: string | null
          trigger_value?: string | null
        }
        Relationships: []
      }
      evolution_group_stats: {
        Row: {
          active_participants: number | null
          group_id: string | null
          id: string | null
          left_members: number | null
          links_count: number | null
          media_count: number | null
          messages_count: number | null
          new_members: number | null
          stat_date: string | null
        }
        Insert: {
          active_participants?: number | null
          group_id?: string | null
          id?: string | null
          left_members?: number | null
          links_count?: number | null
          media_count?: number | null
          messages_count?: number | null
          new_members?: number | null
          stat_date?: string | null
        }
        Update: {
          active_participants?: number | null
          group_id?: string | null
          id?: string | null
          left_members?: number | null
          links_count?: number | null
          media_count?: number | null
          messages_count?: number | null
          new_members?: number | null
          stat_date?: string | null
        }
        Relationships: []
      }
      evolution_groups: {
        Row: {
          auto_response_enabled: boolean | null
          auto_response_message: string | null
          category: string | null
          community_id: string | null
          created_at: string | null
          description: string | null
          goodbye_message: string | null
          group_jid: string | null
          id: string | null
          is_active: boolean | null
          is_community: boolean | null
          is_monitored: boolean | null
          last_activity_at: string | null
          name: string | null
          owner_jid: string | null
          participant_count: number | null
          rules: string | null
          tags: string[] | null
          updated_at: string | null
          welcome_message: string | null
        }
        Insert: {
          auto_response_enabled?: boolean | null
          auto_response_message?: string | null
          category?: string | null
          community_id?: string | null
          created_at?: string | null
          description?: string | null
          goodbye_message?: string | null
          group_jid?: string | null
          id?: string | null
          is_active?: boolean | null
          is_community?: boolean | null
          is_monitored?: boolean | null
          last_activity_at?: string | null
          name?: string | null
          owner_jid?: string | null
          participant_count?: number | null
          rules?: string | null
          tags?: string[] | null
          updated_at?: string | null
          welcome_message?: string | null
        }
        Update: {
          auto_response_enabled?: boolean | null
          auto_response_message?: string | null
          category?: string | null
          community_id?: string | null
          created_at?: string | null
          description?: string | null
          goodbye_message?: string | null
          group_jid?: string | null
          id?: string | null
          is_active?: boolean | null
          is_community?: boolean | null
          is_monitored?: boolean | null
          last_activity_at?: string | null
          name?: string | null
          owner_jid?: string | null
          participant_count?: number | null
          rules?: string | null
          tags?: string[] | null
          updated_at?: string | null
          welcome_message?: string | null
        }
        Relationships: []
      }
      evolution_guardian_heartbeat: {
        Row: {
          cycles_since_last: number | null
          details: Json | null
          heartbeat_at: string | null
          id: string | null
          service_name: string | null
        }
        Insert: {
          cycles_since_last?: number | null
          details?: Json | null
          heartbeat_at?: string | null
          id?: string | null
          service_name?: string | null
        }
        Update: {
          cycles_since_last?: number | null
          details?: Json | null
          heartbeat_at?: string | null
          id?: string | null
          service_name?: string | null
        }
        Relationships: []
      }
      evolution_health_logs: {
        Row: {
          connection_id: string | null
          created_at: string | null
          endpoint_tested: string | null
          error_count: number | null
          error_message: string | null
          http_status_code: number | null
          id: string | null
          instance_name: string | null
          metadata: Json | null
          online_instances: number | null
          performed_at: string | null
          response_time_ms: number | null
          status: string | null
          success_count: number | null
          total_instances: number | null
        }
        Insert: {
          connection_id?: string | null
          created_at?: string | null
          endpoint_tested?: string | null
          error_count?: number | null
          error_message?: string | null
          http_status_code?: number | null
          id?: string | null
          instance_name?: string | null
          metadata?: Json | null
          online_instances?: number | null
          performed_at?: string | null
          response_time_ms?: number | null
          status?: string | null
          success_count?: number | null
          total_instances?: number | null
        }
        Update: {
          connection_id?: string | null
          created_at?: string | null
          endpoint_tested?: string | null
          error_count?: number | null
          error_message?: string | null
          http_status_code?: number | null
          id?: string | null
          instance_name?: string | null
          metadata?: Json | null
          online_instances?: number | null
          performed_at?: string | null
          response_time_ms?: number | null
          status?: string | null
          success_count?: number | null
          total_instances?: number | null
        }
        Relationships: []
      }
      evolution_holidays: {
        Row: {
          auto_reply_message: string | null
          close_time: string | null
          created_at: string | null
          date: string | null
          id: string | null
          is_half_day: boolean | null
          name: string | null
        }
        Insert: {
          auto_reply_message?: string | null
          close_time?: string | null
          created_at?: string | null
          date?: string | null
          id?: string | null
          is_half_day?: boolean | null
          name?: string | null
        }
        Update: {
          auto_reply_message?: string | null
          close_time?: string | null
          created_at?: string | null
          date?: string | null
          id?: string | null
          is_half_day?: boolean | null
          name?: string | null
        }
        Relationships: []
      }
      evolution_incident_runbook: {
        Row: {
          category: string | null
          created_at: string | null
          escalation: string | null
          estimated_minutes: number | null
          id: string | null
          last_drilled_at: string | null
          severity: string | null
          steps: Json | null
          success_criteria: string[] | null
          title: string | null
          triggers: string[] | null
          updated_at: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string | null
          escalation?: string | null
          estimated_minutes?: number | null
          id?: string | null
          last_drilled_at?: string | null
          severity?: string | null
          steps?: Json | null
          success_criteria?: string[] | null
          title?: string | null
          triggers?: string[] | null
          updated_at?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string | null
          escalation?: string | null
          estimated_minutes?: number | null
          id?: string | null
          last_drilled_at?: string | null
          severity?: string | null
          steps?: Json | null
          success_criteria?: string[] | null
          title?: string | null
          triggers?: string[] | null
          updated_at?: string | null
        }
        Relationships: []
      }
      evolution_instance_credentials: {
        Row: {
          api_url: string | null
          connection_id: string | null
          created_at: string | null
          department: string | null
          display_name: string | null
          health_status: string | null
          id: string | null
          instance_name: string | null
          is_active: boolean | null
          last_health_check: string | null
          notes: string | null
          online_instances: number | null
          total_instances: number | null
          updated_at: string | null
          webhook_url: string | null
        }
        Insert: {
          api_url?: string | null
          connection_id?: string | null
          created_at?: string | null
          department?: string | null
          display_name?: string | null
          health_status?: string | null
          id?: string | null
          instance_name?: string | null
          is_active?: boolean | null
          last_health_check?: string | null
          notes?: string | null
          online_instances?: number | null
          total_instances?: number | null
          updated_at?: string | null
          webhook_url?: string | null
        }
        Update: {
          api_url?: string | null
          connection_id?: string | null
          created_at?: string | null
          department?: string | null
          display_name?: string | null
          health_status?: string | null
          id?: string | null
          instance_name?: string | null
          is_active?: boolean | null
          last_health_check?: string | null
          notes?: string | null
          online_instances?: number | null
          total_instances?: number | null
          updated_at?: string | null
          webhook_url?: string | null
        }
        Relationships: []
      }
      evolution_ip_blocklist: {
        Row: {
          auto_blocked: boolean | null
          created_at: string | null
          first_seen: string | null
          hit_count: number | null
          ip_address: string | null
          last_seen: string | null
          reason: string | null
          unblocked_at: string | null
          updated_at: string | null
        }
        Insert: {
          auto_blocked?: boolean | null
          created_at?: string | null
          first_seen?: string | null
          hit_count?: number | null
          ip_address?: string | null
          last_seen?: string | null
          reason?: string | null
          unblocked_at?: string | null
          updated_at?: string | null
        }
        Update: {
          auto_blocked?: boolean | null
          created_at?: string | null
          first_seen?: string | null
          hit_count?: number | null
          ip_address?: string | null
          last_seen?: string | null
          reason?: string | null
          unblocked_at?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      evolution_ip_watch: {
        Row: {
          created_at: string | null
          endpoint: string | null
          http_status: number | null
          id: number | null
          ip_address: string | null
          user_agent: string | null
        }
        Insert: {
          created_at?: string | null
          endpoint?: string | null
          http_status?: number | null
          id?: number | null
          ip_address?: string | null
          user_agent?: string | null
        }
        Update: {
          created_at?: string | null
          endpoint?: string | null
          http_status?: number | null
          id?: number | null
          ip_address?: string | null
          user_agent?: string | null
        }
        Relationships: []
      }
      evolution_keyword_automations: {
        Row: {
          cooldown_minutes: number | null
          created_at: string | null
          hit_count: number | null
          id: string | null
          is_active: boolean | null
          is_case_sensitive: boolean | null
          keyword: string | null
          last_triggered_at: string | null
          match_type: string | null
          media_url: string | null
          menu_options: Json | null
          only_first_message: boolean | null
          only_outside_hours: boolean | null
          priority: number | null
          response_text: string | null
          response_type: string | null
          template_id: string | null
          updated_at: string | null
        }
        Insert: {
          cooldown_minutes?: number | null
          created_at?: string | null
          hit_count?: number | null
          id?: string | null
          is_active?: boolean | null
          is_case_sensitive?: boolean | null
          keyword?: string | null
          last_triggered_at?: string | null
          match_type?: string | null
          media_url?: string | null
          menu_options?: Json | null
          only_first_message?: boolean | null
          only_outside_hours?: boolean | null
          priority?: number | null
          response_text?: string | null
          response_type?: string | null
          template_id?: string | null
          updated_at?: string | null
        }
        Update: {
          cooldown_minutes?: number | null
          created_at?: string | null
          hit_count?: number | null
          id?: string | null
          is_active?: boolean | null
          is_case_sensitive?: boolean | null
          keyword?: string | null
          last_triggered_at?: string | null
          match_type?: string | null
          media_url?: string | null
          menu_options?: Json | null
          only_first_message?: boolean | null
          only_outside_hours?: boolean | null
          priority?: number | null
          response_text?: string | null
          response_type?: string | null
          template_id?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      evolution_label_associations: {
        Row: {
          associated_at: string | null
          contact_id: string | null
          conversation_id: string | null
          id: string | null
          is_active: boolean | null
          label_id: string | null
          remote_jid: string | null
          removed_at: string | null
        }
        Insert: {
          associated_at?: string | null
          contact_id?: string | null
          conversation_id?: string | null
          id?: string | null
          is_active?: boolean | null
          label_id?: string | null
          remote_jid?: string | null
          removed_at?: string | null
        }
        Update: {
          associated_at?: string | null
          contact_id?: string | null
          conversation_id?: string | null
          id?: string | null
          is_active?: boolean | null
          label_id?: string | null
          remote_jid?: string | null
          removed_at?: string | null
        }
        Relationships: []
      }
      evolution_labels: {
        Row: {
          color: string | null
          color_hex: string | null
          created_at: string | null
          id: string | null
          instance_name: string | null
          is_active: boolean | null
          label_id: string | null
          name: string | null
          predefined_id: string | null
          updated_at: string | null
        }
        Insert: {
          color?: string | null
          color_hex?: string | null
          created_at?: string | null
          id?: string | null
          instance_name?: string | null
          is_active?: boolean | null
          label_id?: string | null
          name?: string | null
          predefined_id?: string | null
          updated_at?: string | null
        }
        Update: {
          color?: string | null
          color_hex?: string | null
          created_at?: string | null
          id?: string | null
          instance_name?: string | null
          is_active?: boolean | null
          label_id?: string | null
          name?: string | null
          predefined_id?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      evolution_logpatch_audit: {
        Row: {
          boot_at: string | null
          container_id: string | null
          force_update: number | null
          id: string | null
          notes: string | null
          patch_version: string | null
          patched_size_bytes: number | null
          t1_ok: boolean | null
          t2_ok: boolean | null
          t3_ok: boolean | null
          t4_ok: boolean | null
          t5_ok: boolean | null
          verified_at: string | null
        }
        Insert: {
          boot_at?: string | null
          container_id?: string | null
          force_update?: number | null
          id?: string | null
          notes?: string | null
          patch_version?: string | null
          patched_size_bytes?: number | null
          t1_ok?: boolean | null
          t2_ok?: boolean | null
          t3_ok?: boolean | null
          t4_ok?: boolean | null
          t5_ok?: boolean | null
          verified_at?: string | null
        }
        Update: {
          boot_at?: string | null
          container_id?: string | null
          force_update?: number | null
          id?: string | null
          notes?: string | null
          patch_version?: string | null
          patched_size_bytes?: number | null
          t1_ok?: boolean | null
          t2_ok?: boolean | null
          t3_ok?: boolean | null
          t4_ok?: boolean | null
          t5_ok?: boolean | null
          verified_at?: string | null
        }
        Relationships: []
      }
      evolution_media: {
        Row: {
          base64_data: string | null
          caption: string | null
          created_at: string | null
          duration_seconds: number | null
          file_name: string | null
          file_sha256: string | null
          file_size: number | null
          height: number | null
          id: string | null
          is_animated: boolean | null
          media_type: string | null
          message_id: string | null
          mime_type: string | null
          remote_jid: string | null
          storage_path: string | null
          storage_url: string | null
          thumbnail_base64: string | null
          width: number | null
        }
        Insert: {
          base64_data?: string | null
          caption?: string | null
          created_at?: string | null
          duration_seconds?: number | null
          file_name?: string | null
          file_sha256?: string | null
          file_size?: number | null
          height?: number | null
          id?: string | null
          is_animated?: boolean | null
          media_type?: string | null
          message_id?: string | null
          mime_type?: string | null
          remote_jid?: string | null
          storage_path?: string | null
          storage_url?: string | null
          thumbnail_base64?: string | null
          width?: number | null
        }
        Update: {
          base64_data?: string | null
          caption?: string | null
          created_at?: string | null
          duration_seconds?: number | null
          file_name?: string | null
          file_sha256?: string | null
          file_size?: number | null
          height?: number | null
          id?: string | null
          is_animated?: boolean | null
          media_type?: string | null
          message_id?: string | null
          mime_type?: string | null
          remote_jid?: string | null
          storage_path?: string | null
          storage_url?: string | null
          thumbnail_base64?: string | null
          width?: number | null
        }
        Relationships: []
      }
      evolution_message_queue: {
        Row: {
          attempts: number | null
          contact_id: string | null
          content: string | null
          created_at: string | null
          created_by: string | null
          delivered_at: string | null
          error_message: string | null
          id: string | null
          instance_name: string | null
          max_attempts: number | null
          media_filename: string | null
          media_url: string | null
          message_type: string | null
          metadata: Json | null
          priority: number | null
          read_at: string | null
          remote_jid: string | null
          scheduled_at: string | null
          sent_at: string | null
          source: string | null
          source_id: string | null
          status: string | null
          template_id: string | null
          template_vars: Json | null
          whatsapp_message_id: string | null
        }
        Insert: {
          attempts?: number | null
          contact_id?: string | null
          content?: string | null
          created_at?: string | null
          created_by?: string | null
          delivered_at?: string | null
          error_message?: string | null
          id?: string | null
          instance_name?: string | null
          max_attempts?: number | null
          media_filename?: string | null
          media_url?: string | null
          message_type?: string | null
          metadata?: Json | null
          priority?: number | null
          read_at?: string | null
          remote_jid?: string | null
          scheduled_at?: string | null
          sent_at?: string | null
          source?: string | null
          source_id?: string | null
          status?: string | null
          template_id?: string | null
          template_vars?: Json | null
          whatsapp_message_id?: string | null
        }
        Update: {
          attempts?: number | null
          contact_id?: string | null
          content?: string | null
          created_at?: string | null
          created_by?: string | null
          delivered_at?: string | null
          error_message?: string | null
          id?: string | null
          instance_name?: string | null
          max_attempts?: number | null
          media_filename?: string | null
          media_url?: string | null
          message_type?: string | null
          metadata?: Json | null
          priority?: number | null
          read_at?: string | null
          remote_jid?: string | null
          scheduled_at?: string | null
          sent_at?: string | null
          source?: string | null
          source_id?: string | null
          status?: string | null
          template_id?: string | null
          template_vars?: Json | null
          whatsapp_message_id?: string | null
        }
        Relationships: []
      }
      evolution_message_templates: {
        Row: {
          approval_status: string | null
          approved_at: string | null
          buttons: Json | null
          category: string | null
          content: string | null
          created_at: string | null
          created_by: string | null
          footer_text: string | null
          header_content: string | null
          header_type: string | null
          id: string | null
          instance_name: string | null
          is_active: boolean | null
          language: string | null
          last_used_at: string | null
          name: string | null
          rejection_reason: string | null
          updated_at: string | null
          usage_count: number | null
          variables: Json | null
        }
        Insert: {
          approval_status?: string | null
          approved_at?: string | null
          buttons?: Json | null
          category?: string | null
          content?: string | null
          created_at?: string | null
          created_by?: string | null
          footer_text?: string | null
          header_content?: string | null
          header_type?: string | null
          id?: string | null
          instance_name?: string | null
          is_active?: boolean | null
          language?: string | null
          last_used_at?: string | null
          name?: string | null
          rejection_reason?: string | null
          updated_at?: string | null
          usage_count?: number | null
          variables?: Json | null
        }
        Update: {
          approval_status?: string | null
          approved_at?: string | null
          buttons?: Json | null
          category?: string | null
          content?: string | null
          created_at?: string | null
          created_by?: string | null
          footer_text?: string | null
          header_content?: string | null
          header_type?: string | null
          id?: string | null
          instance_name?: string | null
          is_active?: boolean | null
          language?: string | null
          last_used_at?: string | null
          name?: string | null
          rejection_reason?: string | null
          updated_at?: string | null
          usage_count?: number | null
          variables?: Json | null
        }
        Relationships: []
      }
      evolution_messages: {
        Row: {
          audio_meme_id: string | null
          caption: string | null
          category: string | null
          contact_id: string | null
          content: string | null
          conversation_id: string | null
          created_at: string | null
          deleted_at: string | null
          direction: string | null
          edited_at: string | null
          follow_up_at: string | null
          follow_up_done: boolean | null
          from_me: boolean | null
          id: string | null
          instance_name: string | null
          is_important: boolean | null
          is_read: boolean | null
          is_starred: boolean | null
          link_preview: Json | null
          media_filename: string | null
          media_meta: Json | null
          media_mimetype: string | null
          media_size: number | null
          media_type: string | null
          media_url: string | null
          message_id: string | null
          message_type: string | null
          notes: string | null
          payload: Json | null
          push_name: string | null
          quoted_message_id: string | null
          raw_data: Json | null
          remote_jid: string | null
          reply_to_id: string | null
          sent_by_bot: boolean | null
          sentiment: string | null
          status: string | null
          status_at: string | null
          sticker_id: string | null
          tags: string[] | null
          template_name: string | null
          updated_at: string | null
        }
        Insert: {
          audio_meme_id?: string | null
          caption?: string | null
          category?: string | null
          contact_id?: string | null
          content?: string | null
          conversation_id?: string | null
          created_at?: string | null
          deleted_at?: string | null
          direction?: string | null
          edited_at?: string | null
          follow_up_at?: string | null
          follow_up_done?: boolean | null
          from_me?: boolean | null
          id?: string | null
          instance_name?: string | null
          is_important?: boolean | null
          is_read?: boolean | null
          is_starred?: boolean | null
          link_preview?: Json | null
          media_filename?: string | null
          media_meta?: Json | null
          media_mimetype?: string | null
          media_size?: number | null
          media_type?: string | null
          media_url?: string | null
          message_id?: string | null
          message_type?: string | null
          notes?: string | null
          payload?: Json | null
          push_name?: string | null
          quoted_message_id?: string | null
          raw_data?: Json | null
          remote_jid?: string | null
          reply_to_id?: string | null
          sent_by_bot?: boolean | null
          sentiment?: string | null
          status?: string | null
          status_at?: string | null
          sticker_id?: string | null
          tags?: string[] | null
          template_name?: string | null
          updated_at?: string | null
        }
        Update: {
          audio_meme_id?: string | null
          caption?: string | null
          category?: string | null
          contact_id?: string | null
          content?: string | null
          conversation_id?: string | null
          created_at?: string | null
          deleted_at?: string | null
          direction?: string | null
          edited_at?: string | null
          follow_up_at?: string | null
          follow_up_done?: boolean | null
          from_me?: boolean | null
          id?: string | null
          instance_name?: string | null
          is_important?: boolean | null
          is_read?: boolean | null
          is_starred?: boolean | null
          link_preview?: Json | null
          media_filename?: string | null
          media_meta?: Json | null
          media_mimetype?: string | null
          media_size?: number | null
          media_type?: string | null
          media_url?: string | null
          message_id?: string | null
          message_type?: string | null
          notes?: string | null
          payload?: Json | null
          push_name?: string | null
          quoted_message_id?: string | null
          raw_data?: Json | null
          remote_jid?: string | null
          reply_to_id?: string | null
          sent_by_bot?: boolean | null
          sentiment?: string | null
          status?: string | null
          status_at?: string | null
          sticker_id?: string | null
          tags?: string[] | null
          template_name?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      evolution_messages_artes: {
        Row: {
          audio_meme_id: string | null
          caption: string | null
          category: string | null
          contact_id: string | null
          content: string | null
          conversation_id: string | null
          created_at: string | null
          deleted_at: string | null
          direction: string | null
          edited_at: string | null
          follow_up_at: string | null
          follow_up_done: boolean | null
          from_me: boolean | null
          id: string | null
          instance_name: string | null
          is_important: boolean | null
          is_read: boolean | null
          is_starred: boolean | null
          link_preview: Json | null
          media_filename: string | null
          media_meta: Json | null
          media_mimetype: string | null
          media_size: number | null
          media_type: string | null
          media_url: string | null
          message_id: string | null
          message_type: string | null
          notes: string | null
          payload: Json | null
          push_name: string | null
          quoted_message_id: string | null
          raw_data: Json | null
          remote_jid: string | null
          reply_to_id: string | null
          sent_by_bot: boolean | null
          sentiment: string | null
          status: string | null
          status_at: string | null
          sticker_id: string | null
          tags: string[] | null
          template_name: string | null
          updated_at: string | null
        }
        Insert: {
          audio_meme_id?: string | null
          caption?: string | null
          category?: string | null
          contact_id?: string | null
          content?: string | null
          conversation_id?: string | null
          created_at?: string | null
          deleted_at?: string | null
          direction?: string | null
          edited_at?: string | null
          follow_up_at?: string | null
          follow_up_done?: boolean | null
          from_me?: boolean | null
          id?: string | null
          instance_name?: string | null
          is_important?: boolean | null
          is_read?: boolean | null
          is_starred?: boolean | null
          link_preview?: Json | null
          media_filename?: string | null
          media_meta?: Json | null
          media_mimetype?: string | null
          media_size?: number | null
          media_type?: string | null
          media_url?: string | null
          message_id?: string | null
          message_type?: string | null
          notes?: string | null
          payload?: Json | null
          push_name?: string | null
          quoted_message_id?: string | null
          raw_data?: Json | null
          remote_jid?: string | null
          reply_to_id?: string | null
          sent_by_bot?: boolean | null
          sentiment?: string | null
          status?: string | null
          status_at?: string | null
          sticker_id?: string | null
          tags?: string[] | null
          template_name?: string | null
          updated_at?: string | null
        }
        Update: {
          audio_meme_id?: string | null
          caption?: string | null
          category?: string | null
          contact_id?: string | null
          content?: string | null
          conversation_id?: string | null
          created_at?: string | null
          deleted_at?: string | null
          direction?: string | null
          edited_at?: string | null
          follow_up_at?: string | null
          follow_up_done?: boolean | null
          from_me?: boolean | null
          id?: string | null
          instance_name?: string | null
          is_important?: boolean | null
          is_read?: boolean | null
          is_starred?: boolean | null
          link_preview?: Json | null
          media_filename?: string | null
          media_meta?: Json | null
          media_mimetype?: string | null
          media_size?: number | null
          media_type?: string | null
          media_url?: string | null
          message_id?: string | null
          message_type?: string | null
          notes?: string | null
          payload?: Json | null
          push_name?: string | null
          quoted_message_id?: string | null
          raw_data?: Json | null
          remote_jid?: string | null
          reply_to_id?: string | null
          sent_by_bot?: boolean | null
          sentiment?: string | null
          status?: string | null
          status_at?: string | null
          sticker_id?: string | null
          tags?: string[] | null
          template_name?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      evolution_messages_comercial_01: {
        Row: {
          audio_meme_id: string | null
          caption: string | null
          category: string | null
          contact_id: string | null
          content: string | null
          conversation_id: string | null
          created_at: string | null
          deleted_at: string | null
          direction: string | null
          edited_at: string | null
          follow_up_at: string | null
          follow_up_done: boolean | null
          from_me: boolean | null
          id: string | null
          instance_name: string | null
          is_important: boolean | null
          is_read: boolean | null
          is_starred: boolean | null
          link_preview: Json | null
          media_filename: string | null
          media_meta: Json | null
          media_mimetype: string | null
          media_size: number | null
          media_type: string | null
          media_url: string | null
          message_id: string | null
          message_type: string | null
          notes: string | null
          payload: Json | null
          push_name: string | null
          quoted_message_id: string | null
          raw_data: Json | null
          remote_jid: string | null
          reply_to_id: string | null
          sent_by_bot: boolean | null
          sentiment: string | null
          status: string | null
          status_at: string | null
          sticker_id: string | null
          tags: string[] | null
          template_name: string | null
          updated_at: string | null
        }
        Insert: {
          audio_meme_id?: string | null
          caption?: string | null
          category?: string | null
          contact_id?: string | null
          content?: string | null
          conversation_id?: string | null
          created_at?: string | null
          deleted_at?: string | null
          direction?: string | null
          edited_at?: string | null
          follow_up_at?: string | null
          follow_up_done?: boolean | null
          from_me?: boolean | null
          id?: string | null
          instance_name?: string | null
          is_important?: boolean | null
          is_read?: boolean | null
          is_starred?: boolean | null
          link_preview?: Json | null
          media_filename?: string | null
          media_meta?: Json | null
          media_mimetype?: string | null
          media_size?: number | null
          media_type?: string | null
          media_url?: string | null
          message_id?: string | null
          message_type?: string | null
          notes?: string | null
          payload?: Json | null
          push_name?: string | null
          quoted_message_id?: string | null
          raw_data?: Json | null
          remote_jid?: string | null
          reply_to_id?: string | null
          sent_by_bot?: boolean | null
          sentiment?: string | null
          status?: string | null
          status_at?: string | null
          sticker_id?: string | null
          tags?: string[] | null
          template_name?: string | null
          updated_at?: string | null
        }
        Update: {
          audio_meme_id?: string | null
          caption?: string | null
          category?: string | null
          contact_id?: string | null
          content?: string | null
          conversation_id?: string | null
          created_at?: string | null
          deleted_at?: string | null
          direction?: string | null
          edited_at?: string | null
          follow_up_at?: string | null
          follow_up_done?: boolean | null
          from_me?: boolean | null
          id?: string | null
          instance_name?: string | null
          is_important?: boolean | null
          is_read?: boolean | null
          is_starred?: boolean | null
          link_preview?: Json | null
          media_filename?: string | null
          media_meta?: Json | null
          media_mimetype?: string | null
          media_size?: number | null
          media_type?: string | null
          media_url?: string | null
          message_id?: string | null
          message_type?: string | null
          notes?: string | null
          payload?: Json | null
          push_name?: string | null
          quoted_message_id?: string | null
          raw_data?: Json | null
          remote_jid?: string | null
          reply_to_id?: string | null
          sent_by_bot?: boolean | null
          sentiment?: string | null
          status?: string | null
          status_at?: string | null
          sticker_id?: string | null
          tags?: string[] | null
          template_name?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      evolution_messages_comercial_02: {
        Row: {
          audio_meme_id: string | null
          caption: string | null
          category: string | null
          contact_id: string | null
          content: string | null
          conversation_id: string | null
          created_at: string | null
          deleted_at: string | null
          direction: string | null
          edited_at: string | null
          follow_up_at: string | null
          follow_up_done: boolean | null
          from_me: boolean | null
          id: string | null
          instance_name: string | null
          is_important: boolean | null
          is_read: boolean | null
          is_starred: boolean | null
          link_preview: Json | null
          media_filename: string | null
          media_meta: Json | null
          media_mimetype: string | null
          media_size: number | null
          media_type: string | null
          media_url: string | null
          message_id: string | null
          message_type: string | null
          notes: string | null
          payload: Json | null
          push_name: string | null
          quoted_message_id: string | null
          raw_data: Json | null
          remote_jid: string | null
          reply_to_id: string | null
          sent_by_bot: boolean | null
          sentiment: string | null
          status: string | null
          status_at: string | null
          sticker_id: string | null
          tags: string[] | null
          template_name: string | null
          updated_at: string | null
        }
        Insert: {
          audio_meme_id?: string | null
          caption?: string | null
          category?: string | null
          contact_id?: string | null
          content?: string | null
          conversation_id?: string | null
          created_at?: string | null
          deleted_at?: string | null
          direction?: string | null
          edited_at?: string | null
          follow_up_at?: string | null
          follow_up_done?: boolean | null
          from_me?: boolean | null
          id?: string | null
          instance_name?: string | null
          is_important?: boolean | null
          is_read?: boolean | null
          is_starred?: boolean | null
          link_preview?: Json | null
          media_filename?: string | null
          media_meta?: Json | null
          media_mimetype?: string | null
          media_size?: number | null
          media_type?: string | null
          media_url?: string | null
          message_id?: string | null
          message_type?: string | null
          notes?: string | null
          payload?: Json | null
          push_name?: string | null
          quoted_message_id?: string | null
          raw_data?: Json | null
          remote_jid?: string | null
          reply_to_id?: string | null
          sent_by_bot?: boolean | null
          sentiment?: string | null
          status?: string | null
          status_at?: string | null
          sticker_id?: string | null
          tags?: string[] | null
          template_name?: string | null
          updated_at?: string | null
        }
        Update: {
          audio_meme_id?: string | null
          caption?: string | null
          category?: string | null
          contact_id?: string | null
          content?: string | null
          conversation_id?: string | null
          created_at?: string | null
          deleted_at?: string | null
          direction?: string | null
          edited_at?: string | null
          follow_up_at?: string | null
          follow_up_done?: boolean | null
          from_me?: boolean | null
          id?: string | null
          instance_name?: string | null
          is_important?: boolean | null
          is_read?: boolean | null
          is_starred?: boolean | null
          link_preview?: Json | null
          media_filename?: string | null
          media_meta?: Json | null
          media_mimetype?: string | null
          media_size?: number | null
          media_type?: string | null
          media_url?: string | null
          message_id?: string | null
          message_type?: string | null
          notes?: string | null
          payload?: Json | null
          push_name?: string | null
          quoted_message_id?: string | null
          raw_data?: Json | null
          remote_jid?: string | null
          reply_to_id?: string | null
          sent_by_bot?: boolean | null
          sentiment?: string | null
          status?: string | null
          status_at?: string | null
          sticker_id?: string | null
          tags?: string[] | null
          template_name?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      evolution_messages_comercial_03: {
        Row: {
          audio_meme_id: string | null
          caption: string | null
          category: string | null
          contact_id: string | null
          content: string | null
          conversation_id: string | null
          created_at: string | null
          deleted_at: string | null
          direction: string | null
          edited_at: string | null
          follow_up_at: string | null
          follow_up_done: boolean | null
          from_me: boolean | null
          id: string | null
          instance_name: string | null
          is_important: boolean | null
          is_read: boolean | null
          is_starred: boolean | null
          link_preview: Json | null
          media_filename: string | null
          media_meta: Json | null
          media_mimetype: string | null
          media_size: number | null
          media_type: string | null
          media_url: string | null
          message_id: string | null
          message_type: string | null
          notes: string | null
          payload: Json | null
          push_name: string | null
          quoted_message_id: string | null
          raw_data: Json | null
          remote_jid: string | null
          reply_to_id: string | null
          sent_by_bot: boolean | null
          sentiment: string | null
          status: string | null
          status_at: string | null
          sticker_id: string | null
          tags: string[] | null
          template_name: string | null
          updated_at: string | null
        }
        Insert: {
          audio_meme_id?: string | null
          caption?: string | null
          category?: string | null
          contact_id?: string | null
          content?: string | null
          conversation_id?: string | null
          created_at?: string | null
          deleted_at?: string | null
          direction?: string | null
          edited_at?: string | null
          follow_up_at?: string | null
          follow_up_done?: boolean | null
          from_me?: boolean | null
          id?: string | null
          instance_name?: string | null
          is_important?: boolean | null
          is_read?: boolean | null
          is_starred?: boolean | null
          link_preview?: Json | null
          media_filename?: string | null
          media_meta?: Json | null
          media_mimetype?: string | null
          media_size?: number | null
          media_type?: string | null
          media_url?: string | null
          message_id?: string | null
          message_type?: string | null
          notes?: string | null
          payload?: Json | null
          push_name?: string | null
          quoted_message_id?: string | null
          raw_data?: Json | null
          remote_jid?: string | null
          reply_to_id?: string | null
          sent_by_bot?: boolean | null
          sentiment?: string | null
          status?: string | null
          status_at?: string | null
          sticker_id?: string | null
          tags?: string[] | null
          template_name?: string | null
          updated_at?: string | null
        }
        Update: {
          audio_meme_id?: string | null
          caption?: string | null
          category?: string | null
          contact_id?: string | null
          content?: string | null
          conversation_id?: string | null
          created_at?: string | null
          deleted_at?: string | null
          direction?: string | null
          edited_at?: string | null
          follow_up_at?: string | null
          follow_up_done?: boolean | null
          from_me?: boolean | null
          id?: string | null
          instance_name?: string | null
          is_important?: boolean | null
          is_read?: boolean | null
          is_starred?: boolean | null
          link_preview?: Json | null
          media_filename?: string | null
          media_meta?: Json | null
          media_mimetype?: string | null
          media_size?: number | null
          media_type?: string | null
          media_url?: string | null
          message_id?: string | null
          message_type?: string | null
          notes?: string | null
          payload?: Json | null
          push_name?: string | null
          quoted_message_id?: string | null
          raw_data?: Json | null
          remote_jid?: string | null
          reply_to_id?: string | null
          sent_by_bot?: boolean | null
          sentiment?: string | null
          status?: string | null
          status_at?: string | null
          sticker_id?: string | null
          tags?: string[] | null
          template_name?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      evolution_messages_comercial_04: {
        Row: {
          audio_meme_id: string | null
          caption: string | null
          category: string | null
          contact_id: string | null
          content: string | null
          conversation_id: string | null
          created_at: string | null
          deleted_at: string | null
          direction: string | null
          edited_at: string | null
          follow_up_at: string | null
          follow_up_done: boolean | null
          from_me: boolean | null
          id: string | null
          instance_name: string | null
          is_important: boolean | null
          is_read: boolean | null
          is_starred: boolean | null
          link_preview: Json | null
          media_filename: string | null
          media_meta: Json | null
          media_mimetype: string | null
          media_size: number | null
          media_type: string | null
          media_url: string | null
          message_id: string | null
          message_type: string | null
          notes: string | null
          payload: Json | null
          push_name: string | null
          quoted_message_id: string | null
          raw_data: Json | null
          remote_jid: string | null
          reply_to_id: string | null
          sent_by_bot: boolean | null
          sentiment: string | null
          status: string | null
          status_at: string | null
          sticker_id: string | null
          tags: string[] | null
          template_name: string | null
          updated_at: string | null
        }
        Insert: {
          audio_meme_id?: string | null
          caption?: string | null
          category?: string | null
          contact_id?: string | null
          content?: string | null
          conversation_id?: string | null
          created_at?: string | null
          deleted_at?: string | null
          direction?: string | null
          edited_at?: string | null
          follow_up_at?: string | null
          follow_up_done?: boolean | null
          from_me?: boolean | null
          id?: string | null
          instance_name?: string | null
          is_important?: boolean | null
          is_read?: boolean | null
          is_starred?: boolean | null
          link_preview?: Json | null
          media_filename?: string | null
          media_meta?: Json | null
          media_mimetype?: string | null
          media_size?: number | null
          media_type?: string | null
          media_url?: string | null
          message_id?: string | null
          message_type?: string | null
          notes?: string | null
          payload?: Json | null
          push_name?: string | null
          quoted_message_id?: string | null
          raw_data?: Json | null
          remote_jid?: string | null
          reply_to_id?: string | null
          sent_by_bot?: boolean | null
          sentiment?: string | null
          status?: string | null
          status_at?: string | null
          sticker_id?: string | null
          tags?: string[] | null
          template_name?: string | null
          updated_at?: string | null
        }
        Update: {
          audio_meme_id?: string | null
          caption?: string | null
          category?: string | null
          contact_id?: string | null
          content?: string | null
          conversation_id?: string | null
          created_at?: string | null
          deleted_at?: string | null
          direction?: string | null
          edited_at?: string | null
          follow_up_at?: string | null
          follow_up_done?: boolean | null
          from_me?: boolean | null
          id?: string | null
          instance_name?: string | null
          is_important?: boolean | null
          is_read?: boolean | null
          is_starred?: boolean | null
          link_preview?: Json | null
          media_filename?: string | null
          media_meta?: Json | null
          media_mimetype?: string | null
          media_size?: number | null
          media_type?: string | null
          media_url?: string | null
          message_id?: string | null
          message_type?: string | null
          notes?: string | null
          payload?: Json | null
          push_name?: string | null
          quoted_message_id?: string | null
          raw_data?: Json | null
          remote_jid?: string | null
          reply_to_id?: string | null
          sent_by_bot?: boolean | null
          sentiment?: string | null
          status?: string | null
          status_at?: string | null
          sticker_id?: string | null
          tags?: string[] | null
          template_name?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      evolution_messages_comercial_05: {
        Row: {
          audio_meme_id: string | null
          caption: string | null
          category: string | null
          contact_id: string | null
          content: string | null
          conversation_id: string | null
          created_at: string | null
          deleted_at: string | null
          direction: string | null
          edited_at: string | null
          follow_up_at: string | null
          follow_up_done: boolean | null
          from_me: boolean | null
          id: string | null
          instance_name: string | null
          is_important: boolean | null
          is_read: boolean | null
          is_starred: boolean | null
          link_preview: Json | null
          media_filename: string | null
          media_meta: Json | null
          media_mimetype: string | null
          media_size: number | null
          media_type: string | null
          media_url: string | null
          message_id: string | null
          message_type: string | null
          notes: string | null
          payload: Json | null
          push_name: string | null
          quoted_message_id: string | null
          raw_data: Json | null
          remote_jid: string | null
          reply_to_id: string | null
          sent_by_bot: boolean | null
          sentiment: string | null
          status: string | null
          status_at: string | null
          sticker_id: string | null
          tags: string[] | null
          template_name: string | null
          updated_at: string | null
        }
        Insert: {
          audio_meme_id?: string | null
          caption?: string | null
          category?: string | null
          contact_id?: string | null
          content?: string | null
          conversation_id?: string | null
          created_at?: string | null
          deleted_at?: string | null
          direction?: string | null
          edited_at?: string | null
          follow_up_at?: string | null
          follow_up_done?: boolean | null
          from_me?: boolean | null
          id?: string | null
          instance_name?: string | null
          is_important?: boolean | null
          is_read?: boolean | null
          is_starred?: boolean | null
          link_preview?: Json | null
          media_filename?: string | null
          media_meta?: Json | null
          media_mimetype?: string | null
          media_size?: number | null
          media_type?: string | null
          media_url?: string | null
          message_id?: string | null
          message_type?: string | null
          notes?: string | null
          payload?: Json | null
          push_name?: string | null
          quoted_message_id?: string | null
          raw_data?: Json | null
          remote_jid?: string | null
          reply_to_id?: string | null
          sent_by_bot?: boolean | null
          sentiment?: string | null
          status?: string | null
          status_at?: string | null
          sticker_id?: string | null
          tags?: string[] | null
          template_name?: string | null
          updated_at?: string | null
        }
        Update: {
          audio_meme_id?: string | null
          caption?: string | null
          category?: string | null
          contact_id?: string | null
          content?: string | null
          conversation_id?: string | null
          created_at?: string | null
          deleted_at?: string | null
          direction?: string | null
          edited_at?: string | null
          follow_up_at?: string | null
          follow_up_done?: boolean | null
          from_me?: boolean | null
          id?: string | null
          instance_name?: string | null
          is_important?: boolean | null
          is_read?: boolean | null
          is_starred?: boolean | null
          link_preview?: Json | null
          media_filename?: string | null
          media_meta?: Json | null
          media_mimetype?: string | null
          media_size?: number | null
          media_type?: string | null
          media_url?: string | null
          message_id?: string | null
          message_type?: string | null
          notes?: string | null
          payload?: Json | null
          push_name?: string | null
          quoted_message_id?: string | null
          raw_data?: Json | null
          remote_jid?: string | null
          reply_to_id?: string | null
          sent_by_bot?: boolean | null
          sentiment?: string | null
          status?: string | null
          status_at?: string | null
          sticker_id?: string | null
          tags?: string[] | null
          template_name?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      evolution_messages_comercial_06: {
        Row: {
          audio_meme_id: string | null
          caption: string | null
          category: string | null
          contact_id: string | null
          content: string | null
          conversation_id: string | null
          created_at: string | null
          deleted_at: string | null
          direction: string | null
          edited_at: string | null
          follow_up_at: string | null
          follow_up_done: boolean | null
          from_me: boolean | null
          id: string | null
          instance_name: string | null
          is_important: boolean | null
          is_read: boolean | null
          is_starred: boolean | null
          link_preview: Json | null
          media_filename: string | null
          media_meta: Json | null
          media_mimetype: string | null
          media_size: number | null
          media_type: string | null
          media_url: string | null
          message_id: string | null
          message_type: string | null
          notes: string | null
          payload: Json | null
          push_name: string | null
          quoted_message_id: string | null
          raw_data: Json | null
          remote_jid: string | null
          reply_to_id: string | null
          sent_by_bot: boolean | null
          sentiment: string | null
          status: string | null
          status_at: string | null
          sticker_id: string | null
          tags: string[] | null
          template_name: string | null
          updated_at: string | null
        }
        Insert: {
          audio_meme_id?: string | null
          caption?: string | null
          category?: string | null
          contact_id?: string | null
          content?: string | null
          conversation_id?: string | null
          created_at?: string | null
          deleted_at?: string | null
          direction?: string | null
          edited_at?: string | null
          follow_up_at?: string | null
          follow_up_done?: boolean | null
          from_me?: boolean | null
          id?: string | null
          instance_name?: string | null
          is_important?: boolean | null
          is_read?: boolean | null
          is_starred?: boolean | null
          link_preview?: Json | null
          media_filename?: string | null
          media_meta?: Json | null
          media_mimetype?: string | null
          media_size?: number | null
          media_type?: string | null
          media_url?: string | null
          message_id?: string | null
          message_type?: string | null
          notes?: string | null
          payload?: Json | null
          push_name?: string | null
          quoted_message_id?: string | null
          raw_data?: Json | null
          remote_jid?: string | null
          reply_to_id?: string | null
          sent_by_bot?: boolean | null
          sentiment?: string | null
          status?: string | null
          status_at?: string | null
          sticker_id?: string | null
          tags?: string[] | null
          template_name?: string | null
          updated_at?: string | null
        }
        Update: {
          audio_meme_id?: string | null
          caption?: string | null
          category?: string | null
          contact_id?: string | null
          content?: string | null
          conversation_id?: string | null
          created_at?: string | null
          deleted_at?: string | null
          direction?: string | null
          edited_at?: string | null
          follow_up_at?: string | null
          follow_up_done?: boolean | null
          from_me?: boolean | null
          id?: string | null
          instance_name?: string | null
          is_important?: boolean | null
          is_read?: boolean | null
          is_starred?: boolean | null
          link_preview?: Json | null
          media_filename?: string | null
          media_meta?: Json | null
          media_mimetype?: string | null
          media_size?: number | null
          media_type?: string | null
          media_url?: string | null
          message_id?: string | null
          message_type?: string | null
          notes?: string | null
          payload?: Json | null
          push_name?: string | null
          quoted_message_id?: string | null
          raw_data?: Json | null
          remote_jid?: string | null
          reply_to_id?: string | null
          sent_by_bot?: boolean | null
          sentiment?: string | null
          status?: string | null
          status_at?: string | null
          sticker_id?: string | null
          tags?: string[] | null
          template_name?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      evolution_messages_comercial_07: {
        Row: {
          audio_meme_id: string | null
          caption: string | null
          category: string | null
          contact_id: string | null
          content: string | null
          conversation_id: string | null
          created_at: string | null
          deleted_at: string | null
          direction: string | null
          edited_at: string | null
          follow_up_at: string | null
          follow_up_done: boolean | null
          from_me: boolean | null
          id: string | null
          instance_name: string | null
          is_important: boolean | null
          is_read: boolean | null
          is_starred: boolean | null
          link_preview: Json | null
          media_filename: string | null
          media_meta: Json | null
          media_mimetype: string | null
          media_size: number | null
          media_type: string | null
          media_url: string | null
          message_id: string | null
          message_type: string | null
          notes: string | null
          payload: Json | null
          push_name: string | null
          quoted_message_id: string | null
          raw_data: Json | null
          remote_jid: string | null
          reply_to_id: string | null
          sent_by_bot: boolean | null
          sentiment: string | null
          status: string | null
          status_at: string | null
          sticker_id: string | null
          tags: string[] | null
          template_name: string | null
          updated_at: string | null
        }
        Insert: {
          audio_meme_id?: string | null
          caption?: string | null
          category?: string | null
          contact_id?: string | null
          content?: string | null
          conversation_id?: string | null
          created_at?: string | null
          deleted_at?: string | null
          direction?: string | null
          edited_at?: string | null
          follow_up_at?: string | null
          follow_up_done?: boolean | null
          from_me?: boolean | null
          id?: string | null
          instance_name?: string | null
          is_important?: boolean | null
          is_read?: boolean | null
          is_starred?: boolean | null
          link_preview?: Json | null
          media_filename?: string | null
          media_meta?: Json | null
          media_mimetype?: string | null
          media_size?: number | null
          media_type?: string | null
          media_url?: string | null
          message_id?: string | null
          message_type?: string | null
          notes?: string | null
          payload?: Json | null
          push_name?: string | null
          quoted_message_id?: string | null
          raw_data?: Json | null
          remote_jid?: string | null
          reply_to_id?: string | null
          sent_by_bot?: boolean | null
          sentiment?: string | null
          status?: string | null
          status_at?: string | null
          sticker_id?: string | null
          tags?: string[] | null
          template_name?: string | null
          updated_at?: string | null
        }
        Update: {
          audio_meme_id?: string | null
          caption?: string | null
          category?: string | null
          contact_id?: string | null
          content?: string | null
          conversation_id?: string | null
          created_at?: string | null
          deleted_at?: string | null
          direction?: string | null
          edited_at?: string | null
          follow_up_at?: string | null
          follow_up_done?: boolean | null
          from_me?: boolean | null
          id?: string | null
          instance_name?: string | null
          is_important?: boolean | null
          is_read?: boolean | null
          is_starred?: boolean | null
          link_preview?: Json | null
          media_filename?: string | null
          media_meta?: Json | null
          media_mimetype?: string | null
          media_size?: number | null
          media_type?: string | null
          media_url?: string | null
          message_id?: string | null
          message_type?: string | null
          notes?: string | null
          payload?: Json | null
          push_name?: string | null
          quoted_message_id?: string | null
          raw_data?: Json | null
          remote_jid?: string | null
          reply_to_id?: string | null
          sent_by_bot?: boolean | null
          sentiment?: string | null
          status?: string | null
          status_at?: string | null
          sticker_id?: string | null
          tags?: string[] | null
          template_name?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      evolution_messages_comercial_08: {
        Row: {
          audio_meme_id: string | null
          caption: string | null
          category: string | null
          contact_id: string | null
          content: string | null
          conversation_id: string | null
          created_at: string | null
          deleted_at: string | null
          direction: string | null
          edited_at: string | null
          follow_up_at: string | null
          follow_up_done: boolean | null
          from_me: boolean | null
          id: string | null
          instance_name: string | null
          is_important: boolean | null
          is_read: boolean | null
          is_starred: boolean | null
          link_preview: Json | null
          media_filename: string | null
          media_meta: Json | null
          media_mimetype: string | null
          media_size: number | null
          media_type: string | null
          media_url: string | null
          message_id: string | null
          message_type: string | null
          notes: string | null
          payload: Json | null
          push_name: string | null
          quoted_message_id: string | null
          raw_data: Json | null
          remote_jid: string | null
          reply_to_id: string | null
          sent_by_bot: boolean | null
          sentiment: string | null
          status: string | null
          status_at: string | null
          sticker_id: string | null
          tags: string[] | null
          template_name: string | null
          updated_at: string | null
        }
        Insert: {
          audio_meme_id?: string | null
          caption?: string | null
          category?: string | null
          contact_id?: string | null
          content?: string | null
          conversation_id?: string | null
          created_at?: string | null
          deleted_at?: string | null
          direction?: string | null
          edited_at?: string | null
          follow_up_at?: string | null
          follow_up_done?: boolean | null
          from_me?: boolean | null
          id?: string | null
          instance_name?: string | null
          is_important?: boolean | null
          is_read?: boolean | null
          is_starred?: boolean | null
          link_preview?: Json | null
          media_filename?: string | null
          media_meta?: Json | null
          media_mimetype?: string | null
          media_size?: number | null
          media_type?: string | null
          media_url?: string | null
          message_id?: string | null
          message_type?: string | null
          notes?: string | null
          payload?: Json | null
          push_name?: string | null
          quoted_message_id?: string | null
          raw_data?: Json | null
          remote_jid?: string | null
          reply_to_id?: string | null
          sent_by_bot?: boolean | null
          sentiment?: string | null
          status?: string | null
          status_at?: string | null
          sticker_id?: string | null
          tags?: string[] | null
          template_name?: string | null
          updated_at?: string | null
        }
        Update: {
          audio_meme_id?: string | null
          caption?: string | null
          category?: string | null
          contact_id?: string | null
          content?: string | null
          conversation_id?: string | null
          created_at?: string | null
          deleted_at?: string | null
          direction?: string | null
          edited_at?: string | null
          follow_up_at?: string | null
          follow_up_done?: boolean | null
          from_me?: boolean | null
          id?: string | null
          instance_name?: string | null
          is_important?: boolean | null
          is_read?: boolean | null
          is_starred?: boolean | null
          link_preview?: Json | null
          media_filename?: string | null
          media_meta?: Json | null
          media_mimetype?: string | null
          media_size?: number | null
          media_type?: string | null
          media_url?: string | null
          message_id?: string | null
          message_type?: string | null
          notes?: string | null
          payload?: Json | null
          push_name?: string | null
          quoted_message_id?: string | null
          raw_data?: Json | null
          remote_jid?: string | null
          reply_to_id?: string | null
          sent_by_bot?: boolean | null
          sentiment?: string | null
          status?: string | null
          status_at?: string | null
          sticker_id?: string | null
          tags?: string[] | null
          template_name?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      evolution_messages_comercial_09: {
        Row: {
          audio_meme_id: string | null
          caption: string | null
          category: string | null
          contact_id: string | null
          content: string | null
          conversation_id: string | null
          created_at: string | null
          deleted_at: string | null
          direction: string | null
          edited_at: string | null
          follow_up_at: string | null
          follow_up_done: boolean | null
          from_me: boolean | null
          id: string | null
          instance_name: string | null
          is_important: boolean | null
          is_read: boolean | null
          is_starred: boolean | null
          link_preview: Json | null
          media_filename: string | null
          media_meta: Json | null
          media_mimetype: string | null
          media_size: number | null
          media_type: string | null
          media_url: string | null
          message_id: string | null
          message_type: string | null
          notes: string | null
          payload: Json | null
          push_name: string | null
          quoted_message_id: string | null
          raw_data: Json | null
          remote_jid: string | null
          reply_to_id: string | null
          sent_by_bot: boolean | null
          sentiment: string | null
          status: string | null
          status_at: string | null
          sticker_id: string | null
          tags: string[] | null
          template_name: string | null
          updated_at: string | null
        }
        Insert: {
          audio_meme_id?: string | null
          caption?: string | null
          category?: string | null
          contact_id?: string | null
          content?: string | null
          conversation_id?: string | null
          created_at?: string | null
          deleted_at?: string | null
          direction?: string | null
          edited_at?: string | null
          follow_up_at?: string | null
          follow_up_done?: boolean | null
          from_me?: boolean | null
          id?: string | null
          instance_name?: string | null
          is_important?: boolean | null
          is_read?: boolean | null
          is_starred?: boolean | null
          link_preview?: Json | null
          media_filename?: string | null
          media_meta?: Json | null
          media_mimetype?: string | null
          media_size?: number | null
          media_type?: string | null
          media_url?: string | null
          message_id?: string | null
          message_type?: string | null
          notes?: string | null
          payload?: Json | null
          push_name?: string | null
          quoted_message_id?: string | null
          raw_data?: Json | null
          remote_jid?: string | null
          reply_to_id?: string | null
          sent_by_bot?: boolean | null
          sentiment?: string | null
          status?: string | null
          status_at?: string | null
          sticker_id?: string | null
          tags?: string[] | null
          template_name?: string | null
          updated_at?: string | null
        }
        Update: {
          audio_meme_id?: string | null
          caption?: string | null
          category?: string | null
          contact_id?: string | null
          content?: string | null
          conversation_id?: string | null
          created_at?: string | null
          deleted_at?: string | null
          direction?: string | null
          edited_at?: string | null
          follow_up_at?: string | null
          follow_up_done?: boolean | null
          from_me?: boolean | null
          id?: string | null
          instance_name?: string | null
          is_important?: boolean | null
          is_read?: boolean | null
          is_starred?: boolean | null
          link_preview?: Json | null
          media_filename?: string | null
          media_meta?: Json | null
          media_mimetype?: string | null
          media_size?: number | null
          media_type?: string | null
          media_url?: string | null
          message_id?: string | null
          message_type?: string | null
          notes?: string | null
          payload?: Json | null
          push_name?: string | null
          quoted_message_id?: string | null
          raw_data?: Json | null
          remote_jid?: string | null
          reply_to_id?: string | null
          sent_by_bot?: boolean | null
          sentiment?: string | null
          status?: string | null
          status_at?: string | null
          sticker_id?: string | null
          tags?: string[] | null
          template_name?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      evolution_messages_comercial_10: {
        Row: {
          audio_meme_id: string | null
          caption: string | null
          category: string | null
          contact_id: string | null
          content: string | null
          conversation_id: string | null
          created_at: string | null
          deleted_at: string | null
          direction: string | null
          edited_at: string | null
          follow_up_at: string | null
          follow_up_done: boolean | null
          from_me: boolean | null
          id: string | null
          instance_name: string | null
          is_important: boolean | null
          is_read: boolean | null
          is_starred: boolean | null
          link_preview: Json | null
          media_filename: string | null
          media_meta: Json | null
          media_mimetype: string | null
          media_size: number | null
          media_type: string | null
          media_url: string | null
          message_id: string | null
          message_type: string | null
          notes: string | null
          payload: Json | null
          push_name: string | null
          quoted_message_id: string | null
          raw_data: Json | null
          remote_jid: string | null
          reply_to_id: string | null
          sent_by_bot: boolean | null
          sentiment: string | null
          status: string | null
          status_at: string | null
          sticker_id: string | null
          tags: string[] | null
          template_name: string | null
          updated_at: string | null
        }
        Insert: {
          audio_meme_id?: string | null
          caption?: string | null
          category?: string | null
          contact_id?: string | null
          content?: string | null
          conversation_id?: string | null
          created_at?: string | null
          deleted_at?: string | null
          direction?: string | null
          edited_at?: string | null
          follow_up_at?: string | null
          follow_up_done?: boolean | null
          from_me?: boolean | null
          id?: string | null
          instance_name?: string | null
          is_important?: boolean | null
          is_read?: boolean | null
          is_starred?: boolean | null
          link_preview?: Json | null
          media_filename?: string | null
          media_meta?: Json | null
          media_mimetype?: string | null
          media_size?: number | null
          media_type?: string | null
          media_url?: string | null
          message_id?: string | null
          message_type?: string | null
          notes?: string | null
          payload?: Json | null
          push_name?: string | null
          quoted_message_id?: string | null
          raw_data?: Json | null
          remote_jid?: string | null
          reply_to_id?: string | null
          sent_by_bot?: boolean | null
          sentiment?: string | null
          status?: string | null
          status_at?: string | null
          sticker_id?: string | null
          tags?: string[] | null
          template_name?: string | null
          updated_at?: string | null
        }
        Update: {
          audio_meme_id?: string | null
          caption?: string | null
          category?: string | null
          contact_id?: string | null
          content?: string | null
          conversation_id?: string | null
          created_at?: string | null
          deleted_at?: string | null
          direction?: string | null
          edited_at?: string | null
          follow_up_at?: string | null
          follow_up_done?: boolean | null
          from_me?: boolean | null
          id?: string | null
          instance_name?: string | null
          is_important?: boolean | null
          is_read?: boolean | null
          is_starred?: boolean | null
          link_preview?: Json | null
          media_filename?: string | null
          media_meta?: Json | null
          media_mimetype?: string | null
          media_size?: number | null
          media_type?: string | null
          media_url?: string | null
          message_id?: string | null
          message_type?: string | null
          notes?: string | null
          payload?: Json | null
          push_name?: string | null
          quoted_message_id?: string | null
          raw_data?: Json | null
          remote_jid?: string | null
          reply_to_id?: string | null
          sent_by_bot?: boolean | null
          sentiment?: string | null
          status?: string | null
          status_at?: string | null
          sticker_id?: string | null
          tags?: string[] | null
          template_name?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      evolution_messages_comercial_11: {
        Row: {
          audio_meme_id: string | null
          caption: string | null
          category: string | null
          contact_id: string | null
          content: string | null
          conversation_id: string | null
          created_at: string | null
          deleted_at: string | null
          direction: string | null
          edited_at: string | null
          follow_up_at: string | null
          follow_up_done: boolean | null
          from_me: boolean | null
          id: string | null
          instance_name: string | null
          is_important: boolean | null
          is_read: boolean | null
          is_starred: boolean | null
          link_preview: Json | null
          media_filename: string | null
          media_meta: Json | null
          media_mimetype: string | null
          media_size: number | null
          media_type: string | null
          media_url: string | null
          message_id: string | null
          message_type: string | null
          notes: string | null
          payload: Json | null
          push_name: string | null
          quoted_message_id: string | null
          raw_data: Json | null
          remote_jid: string | null
          reply_to_id: string | null
          sent_by_bot: boolean | null
          sentiment: string | null
          status: string | null
          status_at: string | null
          sticker_id: string | null
          tags: string[] | null
          template_name: string | null
          updated_at: string | null
        }
        Insert: {
          audio_meme_id?: string | null
          caption?: string | null
          category?: string | null
          contact_id?: string | null
          content?: string | null
          conversation_id?: string | null
          created_at?: string | null
          deleted_at?: string | null
          direction?: string | null
          edited_at?: string | null
          follow_up_at?: string | null
          follow_up_done?: boolean | null
          from_me?: boolean | null
          id?: string | null
          instance_name?: string | null
          is_important?: boolean | null
          is_read?: boolean | null
          is_starred?: boolean | null
          link_preview?: Json | null
          media_filename?: string | null
          media_meta?: Json | null
          media_mimetype?: string | null
          media_size?: number | null
          media_type?: string | null
          media_url?: string | null
          message_id?: string | null
          message_type?: string | null
          notes?: string | null
          payload?: Json | null
          push_name?: string | null
          quoted_message_id?: string | null
          raw_data?: Json | null
          remote_jid?: string | null
          reply_to_id?: string | null
          sent_by_bot?: boolean | null
          sentiment?: string | null
          status?: string | null
          status_at?: string | null
          sticker_id?: string | null
          tags?: string[] | null
          template_name?: string | null
          updated_at?: string | null
        }
        Update: {
          audio_meme_id?: string | null
          caption?: string | null
          category?: string | null
          contact_id?: string | null
          content?: string | null
          conversation_id?: string | null
          created_at?: string | null
          deleted_at?: string | null
          direction?: string | null
          edited_at?: string | null
          follow_up_at?: string | null
          follow_up_done?: boolean | null
          from_me?: boolean | null
          id?: string | null
          instance_name?: string | null
          is_important?: boolean | null
          is_read?: boolean | null
          is_starred?: boolean | null
          link_preview?: Json | null
          media_filename?: string | null
          media_meta?: Json | null
          media_mimetype?: string | null
          media_size?: number | null
          media_type?: string | null
          media_url?: string | null
          message_id?: string | null
          message_type?: string | null
          notes?: string | null
          payload?: Json | null
          push_name?: string | null
          quoted_message_id?: string | null
          raw_data?: Json | null
          remote_jid?: string | null
          reply_to_id?: string | null
          sent_by_bot?: boolean | null
          sentiment?: string | null
          status?: string | null
          status_at?: string | null
          sticker_id?: string | null
          tags?: string[] | null
          template_name?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      evolution_messages_comercial_12: {
        Row: {
          audio_meme_id: string | null
          caption: string | null
          category: string | null
          contact_id: string | null
          content: string | null
          conversation_id: string | null
          created_at: string | null
          deleted_at: string | null
          direction: string | null
          edited_at: string | null
          follow_up_at: string | null
          follow_up_done: boolean | null
          from_me: boolean | null
          id: string | null
          instance_name: string | null
          is_important: boolean | null
          is_read: boolean | null
          is_starred: boolean | null
          link_preview: Json | null
          media_filename: string | null
          media_meta: Json | null
          media_mimetype: string | null
          media_size: number | null
          media_type: string | null
          media_url: string | null
          message_id: string | null
          message_type: string | null
          notes: string | null
          payload: Json | null
          push_name: string | null
          quoted_message_id: string | null
          raw_data: Json | null
          remote_jid: string | null
          reply_to_id: string | null
          sent_by_bot: boolean | null
          sentiment: string | null
          status: string | null
          status_at: string | null
          sticker_id: string | null
          tags: string[] | null
          template_name: string | null
          updated_at: string | null
        }
        Insert: {
          audio_meme_id?: string | null
          caption?: string | null
          category?: string | null
          contact_id?: string | null
          content?: string | null
          conversation_id?: string | null
          created_at?: string | null
          deleted_at?: string | null
          direction?: string | null
          edited_at?: string | null
          follow_up_at?: string | null
          follow_up_done?: boolean | null
          from_me?: boolean | null
          id?: string | null
          instance_name?: string | null
          is_important?: boolean | null
          is_read?: boolean | null
          is_starred?: boolean | null
          link_preview?: Json | null
          media_filename?: string | null
          media_meta?: Json | null
          media_mimetype?: string | null
          media_size?: number | null
          media_type?: string | null
          media_url?: string | null
          message_id?: string | null
          message_type?: string | null
          notes?: string | null
          payload?: Json | null
          push_name?: string | null
          quoted_message_id?: string | null
          raw_data?: Json | null
          remote_jid?: string | null
          reply_to_id?: string | null
          sent_by_bot?: boolean | null
          sentiment?: string | null
          status?: string | null
          status_at?: string | null
          sticker_id?: string | null
          tags?: string[] | null
          template_name?: string | null
          updated_at?: string | null
        }
        Update: {
          audio_meme_id?: string | null
          caption?: string | null
          category?: string | null
          contact_id?: string | null
          content?: string | null
          conversation_id?: string | null
          created_at?: string | null
          deleted_at?: string | null
          direction?: string | null
          edited_at?: string | null
          follow_up_at?: string | null
          follow_up_done?: boolean | null
          from_me?: boolean | null
          id?: string | null
          instance_name?: string | null
          is_important?: boolean | null
          is_read?: boolean | null
          is_starred?: boolean | null
          link_preview?: Json | null
          media_filename?: string | null
          media_meta?: Json | null
          media_mimetype?: string | null
          media_size?: number | null
          media_type?: string | null
          media_url?: string | null
          message_id?: string | null
          message_type?: string | null
          notes?: string | null
          payload?: Json | null
          push_name?: string | null
          quoted_message_id?: string | null
          raw_data?: Json | null
          remote_jid?: string | null
          reply_to_id?: string | null
          sent_by_bot?: boolean | null
          sentiment?: string | null
          status?: string | null
          status_at?: string | null
          sticker_id?: string | null
          tags?: string[] | null
          template_name?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      evolution_messages_comercial_13: {
        Row: {
          audio_meme_id: string | null
          caption: string | null
          category: string | null
          contact_id: string | null
          content: string | null
          conversation_id: string | null
          created_at: string | null
          deleted_at: string | null
          direction: string | null
          edited_at: string | null
          follow_up_at: string | null
          follow_up_done: boolean | null
          from_me: boolean | null
          id: string | null
          instance_name: string | null
          is_important: boolean | null
          is_read: boolean | null
          is_starred: boolean | null
          link_preview: Json | null
          media_filename: string | null
          media_meta: Json | null
          media_mimetype: string | null
          media_size: number | null
          media_type: string | null
          media_url: string | null
          message_id: string | null
          message_type: string | null
          notes: string | null
          payload: Json | null
          push_name: string | null
          quoted_message_id: string | null
          raw_data: Json | null
          remote_jid: string | null
          reply_to_id: string | null
          sent_by_bot: boolean | null
          sentiment: string | null
          status: string | null
          status_at: string | null
          sticker_id: string | null
          tags: string[] | null
          template_name: string | null
          updated_at: string | null
        }
        Insert: {
          audio_meme_id?: string | null
          caption?: string | null
          category?: string | null
          contact_id?: string | null
          content?: string | null
          conversation_id?: string | null
          created_at?: string | null
          deleted_at?: string | null
          direction?: string | null
          edited_at?: string | null
          follow_up_at?: string | null
          follow_up_done?: boolean | null
          from_me?: boolean | null
          id?: string | null
          instance_name?: string | null
          is_important?: boolean | null
          is_read?: boolean | null
          is_starred?: boolean | null
          link_preview?: Json | null
          media_filename?: string | null
          media_meta?: Json | null
          media_mimetype?: string | null
          media_size?: number | null
          media_type?: string | null
          media_url?: string | null
          message_id?: string | null
          message_type?: string | null
          notes?: string | null
          payload?: Json | null
          push_name?: string | null
          quoted_message_id?: string | null
          raw_data?: Json | null
          remote_jid?: string | null
          reply_to_id?: string | null
          sent_by_bot?: boolean | null
          sentiment?: string | null
          status?: string | null
          status_at?: string | null
          sticker_id?: string | null
          tags?: string[] | null
          template_name?: string | null
          updated_at?: string | null
        }
        Update: {
          audio_meme_id?: string | null
          caption?: string | null
          category?: string | null
          contact_id?: string | null
          content?: string | null
          conversation_id?: string | null
          created_at?: string | null
          deleted_at?: string | null
          direction?: string | null
          edited_at?: string | null
          follow_up_at?: string | null
          follow_up_done?: boolean | null
          from_me?: boolean | null
          id?: string | null
          instance_name?: string | null
          is_important?: boolean | null
          is_read?: boolean | null
          is_starred?: boolean | null
          link_preview?: Json | null
          media_filename?: string | null
          media_meta?: Json | null
          media_mimetype?: string | null
          media_size?: number | null
          media_type?: string | null
          media_url?: string | null
          message_id?: string | null
          message_type?: string | null
          notes?: string | null
          payload?: Json | null
          push_name?: string | null
          quoted_message_id?: string | null
          raw_data?: Json | null
          remote_jid?: string | null
          reply_to_id?: string | null
          sent_by_bot?: boolean | null
          sentiment?: string | null
          status?: string | null
          status_at?: string | null
          sticker_id?: string | null
          tags?: string[] | null
          template_name?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      evolution_messages_comercial_14: {
        Row: {
          audio_meme_id: string | null
          caption: string | null
          category: string | null
          contact_id: string | null
          content: string | null
          conversation_id: string | null
          created_at: string | null
          deleted_at: string | null
          direction: string | null
          edited_at: string | null
          follow_up_at: string | null
          follow_up_done: boolean | null
          from_me: boolean | null
          id: string | null
          instance_name: string | null
          is_important: boolean | null
          is_read: boolean | null
          is_starred: boolean | null
          link_preview: Json | null
          media_filename: string | null
          media_meta: Json | null
          media_mimetype: string | null
          media_size: number | null
          media_type: string | null
          media_url: string | null
          message_id: string | null
          message_type: string | null
          notes: string | null
          payload: Json | null
          push_name: string | null
          quoted_message_id: string | null
          raw_data: Json | null
          remote_jid: string | null
          reply_to_id: string | null
          sent_by_bot: boolean | null
          sentiment: string | null
          status: string | null
          status_at: string | null
          sticker_id: string | null
          tags: string[] | null
          template_name: string | null
          updated_at: string | null
        }
        Insert: {
          audio_meme_id?: string | null
          caption?: string | null
          category?: string | null
          contact_id?: string | null
          content?: string | null
          conversation_id?: string | null
          created_at?: string | null
          deleted_at?: string | null
          direction?: string | null
          edited_at?: string | null
          follow_up_at?: string | null
          follow_up_done?: boolean | null
          from_me?: boolean | null
          id?: string | null
          instance_name?: string | null
          is_important?: boolean | null
          is_read?: boolean | null
          is_starred?: boolean | null
          link_preview?: Json | null
          media_filename?: string | null
          media_meta?: Json | null
          media_mimetype?: string | null
          media_size?: number | null
          media_type?: string | null
          media_url?: string | null
          message_id?: string | null
          message_type?: string | null
          notes?: string | null
          payload?: Json | null
          push_name?: string | null
          quoted_message_id?: string | null
          raw_data?: Json | null
          remote_jid?: string | null
          reply_to_id?: string | null
          sent_by_bot?: boolean | null
          sentiment?: string | null
          status?: string | null
          status_at?: string | null
          sticker_id?: string | null
          tags?: string[] | null
          template_name?: string | null
          updated_at?: string | null
        }
        Update: {
          audio_meme_id?: string | null
          caption?: string | null
          category?: string | null
          contact_id?: string | null
          content?: string | null
          conversation_id?: string | null
          created_at?: string | null
          deleted_at?: string | null
          direction?: string | null
          edited_at?: string | null
          follow_up_at?: string | null
          follow_up_done?: boolean | null
          from_me?: boolean | null
          id?: string | null
          instance_name?: string | null
          is_important?: boolean | null
          is_read?: boolean | null
          is_starred?: boolean | null
          link_preview?: Json | null
          media_filename?: string | null
          media_meta?: Json | null
          media_mimetype?: string | null
          media_size?: number | null
          media_type?: string | null
          media_url?: string | null
          message_id?: string | null
          message_type?: string | null
          notes?: string | null
          payload?: Json | null
          push_name?: string | null
          quoted_message_id?: string | null
          raw_data?: Json | null
          remote_jid?: string | null
          reply_to_id?: string | null
          sent_by_bot?: boolean | null
          sentiment?: string | null
          status?: string | null
          status_at?: string | null
          sticker_id?: string | null
          tags?: string[] | null
          template_name?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      evolution_messages_comercial_15: {
        Row: {
          audio_meme_id: string | null
          caption: string | null
          category: string | null
          contact_id: string | null
          content: string | null
          conversation_id: string | null
          created_at: string | null
          deleted_at: string | null
          direction: string | null
          edited_at: string | null
          follow_up_at: string | null
          follow_up_done: boolean | null
          from_me: boolean | null
          id: string | null
          instance_name: string | null
          is_important: boolean | null
          is_read: boolean | null
          is_starred: boolean | null
          link_preview: Json | null
          media_filename: string | null
          media_meta: Json | null
          media_mimetype: string | null
          media_size: number | null
          media_type: string | null
          media_url: string | null
          message_id: string | null
          message_type: string | null
          notes: string | null
          payload: Json | null
          push_name: string | null
          quoted_message_id: string | null
          raw_data: Json | null
          remote_jid: string | null
          reply_to_id: string | null
          sent_by_bot: boolean | null
          sentiment: string | null
          status: string | null
          status_at: string | null
          sticker_id: string | null
          tags: string[] | null
          template_name: string | null
          updated_at: string | null
        }
        Insert: {
          audio_meme_id?: string | null
          caption?: string | null
          category?: string | null
          contact_id?: string | null
          content?: string | null
          conversation_id?: string | null
          created_at?: string | null
          deleted_at?: string | null
          direction?: string | null
          edited_at?: string | null
          follow_up_at?: string | null
          follow_up_done?: boolean | null
          from_me?: boolean | null
          id?: string | null
          instance_name?: string | null
          is_important?: boolean | null
          is_read?: boolean | null
          is_starred?: boolean | null
          link_preview?: Json | null
          media_filename?: string | null
          media_meta?: Json | null
          media_mimetype?: string | null
          media_size?: number | null
          media_type?: string | null
          media_url?: string | null
          message_id?: string | null
          message_type?: string | null
          notes?: string | null
          payload?: Json | null
          push_name?: string | null
          quoted_message_id?: string | null
          raw_data?: Json | null
          remote_jid?: string | null
          reply_to_id?: string | null
          sent_by_bot?: boolean | null
          sentiment?: string | null
          status?: string | null
          status_at?: string | null
          sticker_id?: string | null
          tags?: string[] | null
          template_name?: string | null
          updated_at?: string | null
        }
        Update: {
          audio_meme_id?: string | null
          caption?: string | null
          category?: string | null
          contact_id?: string | null
          content?: string | null
          conversation_id?: string | null
          created_at?: string | null
          deleted_at?: string | null
          direction?: string | null
          edited_at?: string | null
          follow_up_at?: string | null
          follow_up_done?: boolean | null
          from_me?: boolean | null
          id?: string | null
          instance_name?: string | null
          is_important?: boolean | null
          is_read?: boolean | null
          is_starred?: boolean | null
          link_preview?: Json | null
          media_filename?: string | null
          media_meta?: Json | null
          media_mimetype?: string | null
          media_size?: number | null
          media_type?: string | null
          media_url?: string | null
          message_id?: string | null
          message_type?: string | null
          notes?: string | null
          payload?: Json | null
          push_name?: string | null
          quoted_message_id?: string | null
          raw_data?: Json | null
          remote_jid?: string | null
          reply_to_id?: string | null
          sent_by_bot?: boolean | null
          sentiment?: string | null
          status?: string | null
          status_at?: string | null
          sticker_id?: string | null
          tags?: string[] | null
          template_name?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      evolution_messages_compras: {
        Row: {
          audio_meme_id: string | null
          caption: string | null
          category: string | null
          contact_id: string | null
          content: string | null
          conversation_id: string | null
          created_at: string | null
          deleted_at: string | null
          direction: string | null
          edited_at: string | null
          follow_up_at: string | null
          follow_up_done: boolean | null
          from_me: boolean | null
          id: string | null
          instance_name: string | null
          is_important: boolean | null
          is_read: boolean | null
          is_starred: boolean | null
          link_preview: Json | null
          media_filename: string | null
          media_meta: Json | null
          media_mimetype: string | null
          media_size: number | null
          media_type: string | null
          media_url: string | null
          message_id: string | null
          message_type: string | null
          notes: string | null
          payload: Json | null
          push_name: string | null
          quoted_message_id: string | null
          raw_data: Json | null
          remote_jid: string | null
          reply_to_id: string | null
          sent_by_bot: boolean | null
          sentiment: string | null
          status: string | null
          status_at: string | null
          sticker_id: string | null
          tags: string[] | null
          template_name: string | null
          updated_at: string | null
        }
        Insert: {
          audio_meme_id?: string | null
          caption?: string | null
          category?: string | null
          contact_id?: string | null
          content?: string | null
          conversation_id?: string | null
          created_at?: string | null
          deleted_at?: string | null
          direction?: string | null
          edited_at?: string | null
          follow_up_at?: string | null
          follow_up_done?: boolean | null
          from_me?: boolean | null
          id?: string | null
          instance_name?: string | null
          is_important?: boolean | null
          is_read?: boolean | null
          is_starred?: boolean | null
          link_preview?: Json | null
          media_filename?: string | null
          media_meta?: Json | null
          media_mimetype?: string | null
          media_size?: number | null
          media_type?: string | null
          media_url?: string | null
          message_id?: string | null
          message_type?: string | null
          notes?: string | null
          payload?: Json | null
          push_name?: string | null
          quoted_message_id?: string | null
          raw_data?: Json | null
          remote_jid?: string | null
          reply_to_id?: string | null
          sent_by_bot?: boolean | null
          sentiment?: string | null
          status?: string | null
          status_at?: string | null
          sticker_id?: string | null
          tags?: string[] | null
          template_name?: string | null
          updated_at?: string | null
        }
        Update: {
          audio_meme_id?: string | null
          caption?: string | null
          category?: string | null
          contact_id?: string | null
          content?: string | null
          conversation_id?: string | null
          created_at?: string | null
          deleted_at?: string | null
          direction?: string | null
          edited_at?: string | null
          follow_up_at?: string | null
          follow_up_done?: boolean | null
          from_me?: boolean | null
          id?: string | null
          instance_name?: string | null
          is_important?: boolean | null
          is_read?: boolean | null
          is_starred?: boolean | null
          link_preview?: Json | null
          media_filename?: string | null
          media_meta?: Json | null
          media_mimetype?: string | null
          media_size?: number | null
          media_type?: string | null
          media_url?: string | null
          message_id?: string | null
          message_type?: string | null
          notes?: string | null
          payload?: Json | null
          push_name?: string | null
          quoted_message_id?: string | null
          raw_data?: Json | null
          remote_jid?: string | null
          reply_to_id?: string | null
          sent_by_bot?: boolean | null
          sentiment?: string | null
          status?: string | null
          status_at?: string | null
          sticker_id?: string | null
          tags?: string[] | null
          template_name?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      evolution_messages_default: {
        Row: {
          audio_meme_id: string | null
          caption: string | null
          category: string | null
          contact_id: string | null
          content: string | null
          conversation_id: string | null
          created_at: string | null
          deleted_at: string | null
          direction: string | null
          edited_at: string | null
          follow_up_at: string | null
          follow_up_done: boolean | null
          from_me: boolean | null
          id: string | null
          instance_name: string | null
          is_important: boolean | null
          is_read: boolean | null
          is_starred: boolean | null
          link_preview: Json | null
          media_filename: string | null
          media_meta: Json | null
          media_mimetype: string | null
          media_size: number | null
          media_type: string | null
          media_url: string | null
          message_id: string | null
          message_type: string | null
          notes: string | null
          payload: Json | null
          push_name: string | null
          quoted_message_id: string | null
          raw_data: Json | null
          remote_jid: string | null
          reply_to_id: string | null
          sent_by_bot: boolean | null
          sentiment: string | null
          status: string | null
          status_at: string | null
          sticker_id: string | null
          tags: string[] | null
          template_name: string | null
          updated_at: string | null
        }
        Insert: {
          audio_meme_id?: string | null
          caption?: string | null
          category?: string | null
          contact_id?: string | null
          content?: string | null
          conversation_id?: string | null
          created_at?: string | null
          deleted_at?: string | null
          direction?: string | null
          edited_at?: string | null
          follow_up_at?: string | null
          follow_up_done?: boolean | null
          from_me?: boolean | null
          id?: string | null
          instance_name?: string | null
          is_important?: boolean | null
          is_read?: boolean | null
          is_starred?: boolean | null
          link_preview?: Json | null
          media_filename?: string | null
          media_meta?: Json | null
          media_mimetype?: string | null
          media_size?: number | null
          media_type?: string | null
          media_url?: string | null
          message_id?: string | null
          message_type?: string | null
          notes?: string | null
          payload?: Json | null
          push_name?: string | null
          quoted_message_id?: string | null
          raw_data?: Json | null
          remote_jid?: string | null
          reply_to_id?: string | null
          sent_by_bot?: boolean | null
          sentiment?: string | null
          status?: string | null
          status_at?: string | null
          sticker_id?: string | null
          tags?: string[] | null
          template_name?: string | null
          updated_at?: string | null
        }
        Update: {
          audio_meme_id?: string | null
          caption?: string | null
          category?: string | null
          contact_id?: string | null
          content?: string | null
          conversation_id?: string | null
          created_at?: string | null
          deleted_at?: string | null
          direction?: string | null
          edited_at?: string | null
          follow_up_at?: string | null
          follow_up_done?: boolean | null
          from_me?: boolean | null
          id?: string | null
          instance_name?: string | null
          is_important?: boolean | null
          is_read?: boolean | null
          is_starred?: boolean | null
          link_preview?: Json | null
          media_filename?: string | null
          media_meta?: Json | null
          media_mimetype?: string | null
          media_size?: number | null
          media_type?: string | null
          media_url?: string | null
          message_id?: string | null
          message_type?: string | null
          notes?: string | null
          payload?: Json | null
          push_name?: string | null
          quoted_message_id?: string | null
          raw_data?: Json | null
          remote_jid?: string | null
          reply_to_id?: string | null
          sent_by_bot?: boolean | null
          sentiment?: string | null
          status?: string | null
          status_at?: string | null
          sticker_id?: string | null
          tags?: string[] | null
          template_name?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      evolution_messages_financeiro: {
        Row: {
          audio_meme_id: string | null
          caption: string | null
          category: string | null
          contact_id: string | null
          content: string | null
          conversation_id: string | null
          created_at: string | null
          deleted_at: string | null
          direction: string | null
          edited_at: string | null
          follow_up_at: string | null
          follow_up_done: boolean | null
          from_me: boolean | null
          id: string | null
          instance_name: string | null
          is_important: boolean | null
          is_read: boolean | null
          is_starred: boolean | null
          link_preview: Json | null
          media_filename: string | null
          media_meta: Json | null
          media_mimetype: string | null
          media_size: number | null
          media_type: string | null
          media_url: string | null
          message_id: string | null
          message_type: string | null
          notes: string | null
          payload: Json | null
          push_name: string | null
          quoted_message_id: string | null
          raw_data: Json | null
          remote_jid: string | null
          reply_to_id: string | null
          sent_by_bot: boolean | null
          sentiment: string | null
          status: string | null
          status_at: string | null
          sticker_id: string | null
          tags: string[] | null
          template_name: string | null
          updated_at: string | null
        }
        Insert: {
          audio_meme_id?: string | null
          caption?: string | null
          category?: string | null
          contact_id?: string | null
          content?: string | null
          conversation_id?: string | null
          created_at?: string | null
          deleted_at?: string | null
          direction?: string | null
          edited_at?: string | null
          follow_up_at?: string | null
          follow_up_done?: boolean | null
          from_me?: boolean | null
          id?: string | null
          instance_name?: string | null
          is_important?: boolean | null
          is_read?: boolean | null
          is_starred?: boolean | null
          link_preview?: Json | null
          media_filename?: string | null
          media_meta?: Json | null
          media_mimetype?: string | null
          media_size?: number | null
          media_type?: string | null
          media_url?: string | null
          message_id?: string | null
          message_type?: string | null
          notes?: string | null
          payload?: Json | null
          push_name?: string | null
          quoted_message_id?: string | null
          raw_data?: Json | null
          remote_jid?: string | null
          reply_to_id?: string | null
          sent_by_bot?: boolean | null
          sentiment?: string | null
          status?: string | null
          status_at?: string | null
          sticker_id?: string | null
          tags?: string[] | null
          template_name?: string | null
          updated_at?: string | null
        }
        Update: {
          audio_meme_id?: string | null
          caption?: string | null
          category?: string | null
          contact_id?: string | null
          content?: string | null
          conversation_id?: string | null
          created_at?: string | null
          deleted_at?: string | null
          direction?: string | null
          edited_at?: string | null
          follow_up_at?: string | null
          follow_up_done?: boolean | null
          from_me?: boolean | null
          id?: string | null
          instance_name?: string | null
          is_important?: boolean | null
          is_read?: boolean | null
          is_starred?: boolean | null
          link_preview?: Json | null
          media_filename?: string | null
          media_meta?: Json | null
          media_mimetype?: string | null
          media_size?: number | null
          media_type?: string | null
          media_url?: string | null
          message_id?: string | null
          message_type?: string | null
          notes?: string | null
          payload?: Json | null
          push_name?: string | null
          quoted_message_id?: string | null
          raw_data?: Json | null
          remote_jid?: string | null
          reply_to_id?: string | null
          sent_by_bot?: boolean | null
          sentiment?: string | null
          status?: string | null
          status_at?: string | null
          sticker_id?: string | null
          tags?: string[] | null
          template_name?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      evolution_messages_gravacao: {
        Row: {
          audio_meme_id: string | null
          caption: string | null
          category: string | null
          contact_id: string | null
          content: string | null
          conversation_id: string | null
          created_at: string | null
          deleted_at: string | null
          direction: string | null
          edited_at: string | null
          follow_up_at: string | null
          follow_up_done: boolean | null
          from_me: boolean | null
          id: string | null
          instance_name: string | null
          is_important: boolean | null
          is_read: boolean | null
          is_starred: boolean | null
          link_preview: Json | null
          media_filename: string | null
          media_meta: Json | null
          media_mimetype: string | null
          media_size: number | null
          media_type: string | null
          media_url: string | null
          message_id: string | null
          message_type: string | null
          notes: string | null
          payload: Json | null
          push_name: string | null
          quoted_message_id: string | null
          raw_data: Json | null
          remote_jid: string | null
          reply_to_id: string | null
          sent_by_bot: boolean | null
          sentiment: string | null
          status: string | null
          status_at: string | null
          sticker_id: string | null
          tags: string[] | null
          template_name: string | null
          updated_at: string | null
        }
        Insert: {
          audio_meme_id?: string | null
          caption?: string | null
          category?: string | null
          contact_id?: string | null
          content?: string | null
          conversation_id?: string | null
          created_at?: string | null
          deleted_at?: string | null
          direction?: string | null
          edited_at?: string | null
          follow_up_at?: string | null
          follow_up_done?: boolean | null
          from_me?: boolean | null
          id?: string | null
          instance_name?: string | null
          is_important?: boolean | null
          is_read?: boolean | null
          is_starred?: boolean | null
          link_preview?: Json | null
          media_filename?: string | null
          media_meta?: Json | null
          media_mimetype?: string | null
          media_size?: number | null
          media_type?: string | null
          media_url?: string | null
          message_id?: string | null
          message_type?: string | null
          notes?: string | null
          payload?: Json | null
          push_name?: string | null
          quoted_message_id?: string | null
          raw_data?: Json | null
          remote_jid?: string | null
          reply_to_id?: string | null
          sent_by_bot?: boolean | null
          sentiment?: string | null
          status?: string | null
          status_at?: string | null
          sticker_id?: string | null
          tags?: string[] | null
          template_name?: string | null
          updated_at?: string | null
        }
        Update: {
          audio_meme_id?: string | null
          caption?: string | null
          category?: string | null
          contact_id?: string | null
          content?: string | null
          conversation_id?: string | null
          created_at?: string | null
          deleted_at?: string | null
          direction?: string | null
          edited_at?: string | null
          follow_up_at?: string | null
          follow_up_done?: boolean | null
          from_me?: boolean | null
          id?: string | null
          instance_name?: string | null
          is_important?: boolean | null
          is_read?: boolean | null
          is_starred?: boolean | null
          link_preview?: Json | null
          media_filename?: string | null
          media_meta?: Json | null
          media_mimetype?: string | null
          media_size?: number | null
          media_type?: string | null
          media_url?: string | null
          message_id?: string | null
          message_type?: string | null
          notes?: string | null
          payload?: Json | null
          push_name?: string | null
          quoted_message_id?: string | null
          raw_data?: Json | null
          remote_jid?: string | null
          reply_to_id?: string | null
          sent_by_bot?: boolean | null
          sentiment?: string | null
          status?: string | null
          status_at?: string | null
          sticker_id?: string | null
          tags?: string[] | null
          template_name?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      evolution_messages_logistica: {
        Row: {
          audio_meme_id: string | null
          caption: string | null
          category: string | null
          contact_id: string | null
          content: string | null
          conversation_id: string | null
          created_at: string | null
          deleted_at: string | null
          direction: string | null
          edited_at: string | null
          follow_up_at: string | null
          follow_up_done: boolean | null
          from_me: boolean | null
          id: string | null
          instance_name: string | null
          is_important: boolean | null
          is_read: boolean | null
          is_starred: boolean | null
          link_preview: Json | null
          media_filename: string | null
          media_meta: Json | null
          media_mimetype: string | null
          media_size: number | null
          media_type: string | null
          media_url: string | null
          message_id: string | null
          message_type: string | null
          notes: string | null
          payload: Json | null
          push_name: string | null
          quoted_message_id: string | null
          raw_data: Json | null
          remote_jid: string | null
          reply_to_id: string | null
          sent_by_bot: boolean | null
          sentiment: string | null
          status: string | null
          status_at: string | null
          sticker_id: string | null
          tags: string[] | null
          template_name: string | null
          updated_at: string | null
        }
        Insert: {
          audio_meme_id?: string | null
          caption?: string | null
          category?: string | null
          contact_id?: string | null
          content?: string | null
          conversation_id?: string | null
          created_at?: string | null
          deleted_at?: string | null
          direction?: string | null
          edited_at?: string | null
          follow_up_at?: string | null
          follow_up_done?: boolean | null
          from_me?: boolean | null
          id?: string | null
          instance_name?: string | null
          is_important?: boolean | null
          is_read?: boolean | null
          is_starred?: boolean | null
          link_preview?: Json | null
          media_filename?: string | null
          media_meta?: Json | null
          media_mimetype?: string | null
          media_size?: number | null
          media_type?: string | null
          media_url?: string | null
          message_id?: string | null
          message_type?: string | null
          notes?: string | null
          payload?: Json | null
          push_name?: string | null
          quoted_message_id?: string | null
          raw_data?: Json | null
          remote_jid?: string | null
          reply_to_id?: string | null
          sent_by_bot?: boolean | null
          sentiment?: string | null
          status?: string | null
          status_at?: string | null
          sticker_id?: string | null
          tags?: string[] | null
          template_name?: string | null
          updated_at?: string | null
        }
        Update: {
          audio_meme_id?: string | null
          caption?: string | null
          category?: string | null
          contact_id?: string | null
          content?: string | null
          conversation_id?: string | null
          created_at?: string | null
          deleted_at?: string | null
          direction?: string | null
          edited_at?: string | null
          follow_up_at?: string | null
          follow_up_done?: boolean | null
          from_me?: boolean | null
          id?: string | null
          instance_name?: string | null
          is_important?: boolean | null
          is_read?: boolean | null
          is_starred?: boolean | null
          link_preview?: Json | null
          media_filename?: string | null
          media_meta?: Json | null
          media_mimetype?: string | null
          media_size?: number | null
          media_type?: string | null
          media_url?: string | null
          message_id?: string | null
          message_type?: string | null
          notes?: string | null
          payload?: Json | null
          push_name?: string | null
          quoted_message_id?: string | null
          raw_data?: Json | null
          remote_jid?: string | null
          reply_to_id?: string | null
          sent_by_bot?: boolean | null
          sentiment?: string | null
          status?: string | null
          status_at?: string | null
          sticker_id?: string | null
          tags?: string[] | null
          template_name?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      evolution_messages_marketing: {
        Row: {
          audio_meme_id: string | null
          caption: string | null
          category: string | null
          contact_id: string | null
          content: string | null
          conversation_id: string | null
          created_at: string | null
          deleted_at: string | null
          direction: string | null
          edited_at: string | null
          follow_up_at: string | null
          follow_up_done: boolean | null
          from_me: boolean | null
          id: string | null
          instance_name: string | null
          is_important: boolean | null
          is_read: boolean | null
          is_starred: boolean | null
          link_preview: Json | null
          media_filename: string | null
          media_meta: Json | null
          media_mimetype: string | null
          media_size: number | null
          media_type: string | null
          media_url: string | null
          message_id: string | null
          message_type: string | null
          notes: string | null
          payload: Json | null
          push_name: string | null
          quoted_message_id: string | null
          raw_data: Json | null
          remote_jid: string | null
          reply_to_id: string | null
          sent_by_bot: boolean | null
          sentiment: string | null
          status: string | null
          status_at: string | null
          sticker_id: string | null
          tags: string[] | null
          template_name: string | null
          updated_at: string | null
        }
        Insert: {
          audio_meme_id?: string | null
          caption?: string | null
          category?: string | null
          contact_id?: string | null
          content?: string | null
          conversation_id?: string | null
          created_at?: string | null
          deleted_at?: string | null
          direction?: string | null
          edited_at?: string | null
          follow_up_at?: string | null
          follow_up_done?: boolean | null
          from_me?: boolean | null
          id?: string | null
          instance_name?: string | null
          is_important?: boolean | null
          is_read?: boolean | null
          is_starred?: boolean | null
          link_preview?: Json | null
          media_filename?: string | null
          media_meta?: Json | null
          media_mimetype?: string | null
          media_size?: number | null
          media_type?: string | null
          media_url?: string | null
          message_id?: string | null
          message_type?: string | null
          notes?: string | null
          payload?: Json | null
          push_name?: string | null
          quoted_message_id?: string | null
          raw_data?: Json | null
          remote_jid?: string | null
          reply_to_id?: string | null
          sent_by_bot?: boolean | null
          sentiment?: string | null
          status?: string | null
          status_at?: string | null
          sticker_id?: string | null
          tags?: string[] | null
          template_name?: string | null
          updated_at?: string | null
        }
        Update: {
          audio_meme_id?: string | null
          caption?: string | null
          category?: string | null
          contact_id?: string | null
          content?: string | null
          conversation_id?: string | null
          created_at?: string | null
          deleted_at?: string | null
          direction?: string | null
          edited_at?: string | null
          follow_up_at?: string | null
          follow_up_done?: boolean | null
          from_me?: boolean | null
          id?: string | null
          instance_name?: string | null
          is_important?: boolean | null
          is_read?: boolean | null
          is_starred?: boolean | null
          link_preview?: Json | null
          media_filename?: string | null
          media_meta?: Json | null
          media_mimetype?: string | null
          media_size?: number | null
          media_type?: string | null
          media_url?: string | null
          message_id?: string | null
          message_type?: string | null
          notes?: string | null
          payload?: Json | null
          push_name?: string | null
          quoted_message_id?: string | null
          raw_data?: Json | null
          remote_jid?: string | null
          reply_to_id?: string | null
          sent_by_bot?: boolean | null
          sentiment?: string | null
          status?: string | null
          status_at?: string | null
          sticker_id?: string | null
          tags?: string[] | null
          template_name?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      evolution_messages_wpp2: {
        Row: {
          audio_meme_id: string | null
          caption: string | null
          category: string | null
          contact_id: string | null
          content: string | null
          conversation_id: string | null
          created_at: string | null
          deleted_at: string | null
          direction: string | null
          edited_at: string | null
          follow_up_at: string | null
          follow_up_done: boolean | null
          from_me: boolean | null
          id: string | null
          instance_name: string | null
          is_important: boolean | null
          is_read: boolean | null
          is_starred: boolean | null
          link_preview: Json | null
          media_filename: string | null
          media_meta: Json | null
          media_mimetype: string | null
          media_size: number | null
          media_type: string | null
          media_url: string | null
          message_id: string | null
          message_type: string | null
          notes: string | null
          payload: Json | null
          push_name: string | null
          quoted_message_id: string | null
          raw_data: Json | null
          remote_jid: string | null
          reply_to_id: string | null
          sent_by_bot: boolean | null
          sentiment: string | null
          status: string | null
          status_at: string | null
          sticker_id: string | null
          tags: string[] | null
          template_name: string | null
          updated_at: string | null
        }
        Insert: {
          audio_meme_id?: string | null
          caption?: string | null
          category?: string | null
          contact_id?: string | null
          content?: string | null
          conversation_id?: string | null
          created_at?: string | null
          deleted_at?: string | null
          direction?: string | null
          edited_at?: string | null
          follow_up_at?: string | null
          follow_up_done?: boolean | null
          from_me?: boolean | null
          id?: string | null
          instance_name?: string | null
          is_important?: boolean | null
          is_read?: boolean | null
          is_starred?: boolean | null
          link_preview?: Json | null
          media_filename?: string | null
          media_meta?: Json | null
          media_mimetype?: string | null
          media_size?: number | null
          media_type?: string | null
          media_url?: string | null
          message_id?: string | null
          message_type?: string | null
          notes?: string | null
          payload?: Json | null
          push_name?: string | null
          quoted_message_id?: string | null
          raw_data?: Json | null
          remote_jid?: string | null
          reply_to_id?: string | null
          sent_by_bot?: boolean | null
          sentiment?: string | null
          status?: string | null
          status_at?: string | null
          sticker_id?: string | null
          tags?: string[] | null
          template_name?: string | null
          updated_at?: string | null
        }
        Update: {
          audio_meme_id?: string | null
          caption?: string | null
          category?: string | null
          contact_id?: string | null
          content?: string | null
          conversation_id?: string | null
          created_at?: string | null
          deleted_at?: string | null
          direction?: string | null
          edited_at?: string | null
          follow_up_at?: string | null
          follow_up_done?: boolean | null
          from_me?: boolean | null
          id?: string | null
          instance_name?: string | null
          is_important?: boolean | null
          is_read?: boolean | null
          is_starred?: boolean | null
          link_preview?: Json | null
          media_filename?: string | null
          media_meta?: Json | null
          media_mimetype?: string | null
          media_size?: number | null
          media_type?: string | null
          media_url?: string | null
          message_id?: string | null
          message_type?: string | null
          notes?: string | null
          payload?: Json | null
          push_name?: string | null
          quoted_message_id?: string | null
          raw_data?: Json | null
          remote_jid?: string | null
          reply_to_id?: string | null
          sent_by_bot?: boolean | null
          sentiment?: string | null
          status?: string | null
          status_at?: string | null
          sticker_id?: string | null
          tags?: string[] | null
          template_name?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      evolution_messages_wpp2_archive: {
        Row: {
          audio_meme_id: string | null
          caption: string | null
          category: string | null
          contact_id: string | null
          content: string | null
          conversation_id: string | null
          created_at: string | null
          deleted_at: string | null
          direction: string | null
          edited_at: string | null
          follow_up_at: string | null
          follow_up_done: boolean | null
          from_me: boolean | null
          id: string | null
          instance_name: string | null
          is_important: boolean | null
          is_read: boolean | null
          is_starred: boolean | null
          link_preview: Json | null
          media_filename: string | null
          media_meta: Json | null
          media_mimetype: string | null
          media_size: number | null
          media_type: string | null
          media_url: string | null
          message_id: string | null
          message_type: string | null
          notes: string | null
          payload: Json | null
          push_name: string | null
          quoted_message_id: string | null
          raw_data: Json | null
          remote_jid: string | null
          sent_by_bot: boolean | null
          sentiment: string | null
          status: string | null
          status_at: string | null
          sticker_id: string | null
          tags: string[] | null
          template_name: string | null
          updated_at: string | null
        }
        Insert: {
          audio_meme_id?: string | null
          caption?: string | null
          category?: string | null
          contact_id?: string | null
          content?: string | null
          conversation_id?: string | null
          created_at?: string | null
          deleted_at?: string | null
          direction?: string | null
          edited_at?: string | null
          follow_up_at?: string | null
          follow_up_done?: boolean | null
          from_me?: boolean | null
          id?: string | null
          instance_name?: string | null
          is_important?: boolean | null
          is_read?: boolean | null
          is_starred?: boolean | null
          link_preview?: Json | null
          media_filename?: string | null
          media_meta?: Json | null
          media_mimetype?: string | null
          media_size?: number | null
          media_type?: string | null
          media_url?: string | null
          message_id?: string | null
          message_type?: string | null
          notes?: string | null
          payload?: Json | null
          push_name?: string | null
          quoted_message_id?: string | null
          raw_data?: Json | null
          remote_jid?: string | null
          sent_by_bot?: boolean | null
          sentiment?: string | null
          status?: string | null
          status_at?: string | null
          sticker_id?: string | null
          tags?: string[] | null
          template_name?: string | null
          updated_at?: string | null
        }
        Update: {
          audio_meme_id?: string | null
          caption?: string | null
          category?: string | null
          contact_id?: string | null
          content?: string | null
          conversation_id?: string | null
          created_at?: string | null
          deleted_at?: string | null
          direction?: string | null
          edited_at?: string | null
          follow_up_at?: string | null
          follow_up_done?: boolean | null
          from_me?: boolean | null
          id?: string | null
          instance_name?: string | null
          is_important?: boolean | null
          is_read?: boolean | null
          is_starred?: boolean | null
          link_preview?: Json | null
          media_filename?: string | null
          media_meta?: Json | null
          media_mimetype?: string | null
          media_size?: number | null
          media_type?: string | null
          media_url?: string | null
          message_id?: string | null
          message_type?: string | null
          notes?: string | null
          payload?: Json | null
          push_name?: string | null
          quoted_message_id?: string | null
          raw_data?: Json | null
          remote_jid?: string | null
          sent_by_bot?: boolean | null
          sentiment?: string | null
          status?: string | null
          status_at?: string | null
          sticker_id?: string | null
          tags?: string[] | null
          template_name?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      evolution_mirror_batches: {
        Row: {
          batch_seq: number | null
          bytes_gz: number | null
          consumed_at: string | null
          consumed_status: string | null
          consumer_error: string | null
          created_at: string | null
          id: number | null
          metrics: Json | null
          row_count: number | null
          run_id: string | null
          s3_bucket: string | null
          s3_key: string | null
        }
        Insert: {
          batch_seq?: number | null
          bytes_gz?: number | null
          consumed_at?: string | null
          consumed_status?: string | null
          consumer_error?: string | null
          created_at?: string | null
          id?: number | null
          metrics?: Json | null
          row_count?: number | null
          run_id?: string | null
          s3_bucket?: string | null
          s3_key?: string | null
        }
        Update: {
          batch_seq?: number | null
          bytes_gz?: number | null
          consumed_at?: string | null
          consumed_status?: string | null
          consumer_error?: string | null
          created_at?: string | null
          id?: number | null
          metrics?: Json | null
          row_count?: number | null
          run_id?: string | null
          s3_bucket?: string | null
          s3_key?: string | null
        }
        Relationships: []
      }
      evolution_mirror_checkpoints: {
        Row: {
          checkpoint_key: string | null
          id: number | null
          last_message_id: string | null
          last_synced_at: string | null
          total_synced: number | null
          updated_at: string | null
        }
        Insert: {
          checkpoint_key?: string | null
          id?: number | null
          last_message_id?: string | null
          last_synced_at?: string | null
          total_synced?: number | null
          updated_at?: string | null
        }
        Update: {
          checkpoint_key?: string | null
          id?: number | null
          last_message_id?: string | null
          last_synced_at?: string | null
          total_synced?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      evolution_mirror_media_queue: {
        Row: {
          created_at: string | null
          downloaded_at: string | null
          file_length: number | null
          id: number | null
          last_error: string | null
          media_key: string | null
          media_type: string | null
          media_url_source: string | null
          message_id: string | null
          mimetype: string | null
          minio_path: string | null
          retry_count: number | null
          status: string | null
          transcription: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          downloaded_at?: string | null
          file_length?: number | null
          id?: number | null
          last_error?: string | null
          media_key?: string | null
          media_type?: string | null
          media_url_source?: string | null
          message_id?: string | null
          mimetype?: string | null
          minio_path?: string | null
          retry_count?: number | null
          status?: string | null
          transcription?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          downloaded_at?: string | null
          file_length?: number | null
          id?: number | null
          last_error?: string | null
          media_key?: string | null
          media_type?: string | null
          media_url_source?: string | null
          message_id?: string | null
          mimetype?: string | null
          minio_path?: string | null
          retry_count?: number | null
          status?: string | null
          transcription?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      evolution_mirror_runs: {
        Row: {
          chunks_processed: number | null
          completed_at: string | null
          created_at: string | null
          duration_seconds: number | null
          error_message: string | null
          id: string | null
          messages_errored: number | null
          messages_exported: number | null
          messages_inserted: number | null
          messages_skipped: number | null
          metadata: Json | null
          run_type: string | null
          since_timestamp: string | null
          started_at: string | null
          status: string | null
          until_timestamp: string | null
        }
        Insert: {
          chunks_processed?: number | null
          completed_at?: string | null
          created_at?: string | null
          duration_seconds?: number | null
          error_message?: string | null
          id?: string | null
          messages_errored?: number | null
          messages_exported?: number | null
          messages_inserted?: number | null
          messages_skipped?: number | null
          metadata?: Json | null
          run_type?: string | null
          since_timestamp?: string | null
          started_at?: string | null
          status?: string | null
          until_timestamp?: string | null
        }
        Update: {
          chunks_processed?: number | null
          completed_at?: string | null
          created_at?: string | null
          duration_seconds?: number | null
          error_message?: string | null
          id?: string | null
          messages_errored?: number | null
          messages_exported?: number | null
          messages_inserted?: number | null
          messages_skipped?: number | null
          metadata?: Json | null
          run_type?: string | null
          since_timestamp?: string | null
          started_at?: string | null
          status?: string | null
          until_timestamp?: string | null
        }
        Relationships: []
      }
      evolution_monthly_audit_log: {
        Row: {
          audit_month: string | null
          created_at: string | null
          id: number | null
          report: Json | null
        }
        Insert: {
          audit_month?: string | null
          created_at?: string | null
          id?: number | null
          report?: Json | null
        }
        Update: {
          audit_month?: string | null
          created_at?: string | null
          id?: number | null
          report?: Json | null
        }
        Relationships: []
      }
      evolution_notification_config: {
        Row: {
          api_token: string | null
          channel: string | null
          chat_id: string | null
          created_at: string | null
          email_addresses: string[] | null
          enabled: boolean | null
          id: string | null
          notify_on: string[] | null
          notify_on_days: number[] | null
          notify_on_hours: string | null
          priority_filter: string[] | null
          slack_webhook: string | null
          updated_at: string | null
          webhook_url: string | null
        }
        Insert: {
          api_token?: string | null
          channel?: string | null
          chat_id?: string | null
          created_at?: string | null
          email_addresses?: string[] | null
          enabled?: boolean | null
          id?: string | null
          notify_on?: string[] | null
          notify_on_days?: number[] | null
          notify_on_hours?: string | null
          priority_filter?: string[] | null
          slack_webhook?: string | null
          updated_at?: string | null
          webhook_url?: string | null
        }
        Update: {
          api_token?: string | null
          channel?: string | null
          chat_id?: string | null
          created_at?: string | null
          email_addresses?: string[] | null
          enabled?: boolean | null
          id?: string | null
          notify_on?: string[] | null
          notify_on_days?: number[] | null
          notify_on_hours?: string | null
          priority_filter?: string[] | null
          slack_webhook?: string | null
          updated_at?: string | null
          webhook_url?: string | null
        }
        Relationships: []
      }
      evolution_notification_log: {
        Row: {
          alert_id: string | null
          channel: string | null
          created_at: string | null
          error_message: string | null
          id: string | null
          message: string | null
          sent_at: string | null
          status: string | null
        }
        Insert: {
          alert_id?: string | null
          channel?: string | null
          created_at?: string | null
          error_message?: string | null
          id?: string | null
          message?: string | null
          sent_at?: string | null
          status?: string | null
        }
        Update: {
          alert_id?: string | null
          channel?: string | null
          created_at?: string | null
          error_message?: string | null
          id?: string | null
          message?: string | null
          sent_at?: string | null
          status?: string | null
        }
        Relationships: []
      }
      evolution_notifications: {
        Row: {
          alert_id: string | null
          channels_sent: string[] | null
          contact_id: string | null
          conversation_id: string | null
          created_at: string | null
          deal_id: string | null
          id: string | null
          message: string | null
          metadata: Json | null
          notification_type: string | null
          priority: string | null
          read_at: string | null
          read_by: string | null
          status: string | null
          title: string | null
        }
        Insert: {
          alert_id?: string | null
          channels_sent?: string[] | null
          contact_id?: string | null
          conversation_id?: string | null
          created_at?: string | null
          deal_id?: string | null
          id?: string | null
          message?: string | null
          metadata?: Json | null
          notification_type?: string | null
          priority?: string | null
          read_at?: string | null
          read_by?: string | null
          status?: string | null
          title?: string | null
        }
        Update: {
          alert_id?: string | null
          channels_sent?: string[] | null
          contact_id?: string | null
          conversation_id?: string | null
          created_at?: string | null
          deal_id?: string | null
          id?: string | null
          message?: string | null
          metadata?: Json | null
          notification_type?: string | null
          priority?: string | null
          read_at?: string | null
          read_by?: string | null
          status?: string | null
          title?: string | null
        }
        Relationships: []
      }
      evolution_performance_metrics: {
        Row: {
          created_at: string | null
          id: string | null
          metadata: Json | null
          metric_date: string | null
          metric_type: string | null
          metric_value: number | null
        }
        Insert: {
          created_at?: string | null
          id?: string | null
          metadata?: Json | null
          metric_date?: string | null
          metric_type?: string | null
          metric_value?: number | null
        }
        Update: {
          created_at?: string | null
          id?: string | null
          metadata?: Json | null
          metric_date?: string | null
          metric_type?: string | null
          metric_value?: number | null
        }
        Relationships: []
      }
      evolution_pipeline_health_log: {
        Row: {
          alerts_critical_open: number | null
          alerts_unresolved: number | null
          baileys_health: string | null
          baileys_severity: number | null
          checked_at: string | null
          consumer_filas: string | null
          consumer_ok_count: number | null
          created_at: string | null
          detail: string | null
          evo_state: string | null
          gap_inbound_min: number | null
          id: string | null
          instance_name: string | null
          notes: string | null
          pipeline_status:
            | "healthy"
            | "warning"
            | "degraded_webhook"
            | "degraded_sender"
            | "critical_alerts"
            | "critical"
            | null
          probe_latency_ms: number | null
          probe_status: string | null
          queue_failed_24h: number | null
          queue_pending_now: number | null
          queue_sent_24h: number | null
          snapshot: Json | null
          unroutable_count: number | null
          webhook_avg_ms: number | null
          webhook_events_15min: number | null
          webhook_events_1h: number | null
          webhook_processed_pct: number | null
        }
        Insert: {
          alerts_critical_open?: number | null
          alerts_unresolved?: number | null
          baileys_health?: string | null
          baileys_severity?: number | null
          checked_at?: string | null
          consumer_filas?: string | null
          consumer_ok_count?: number | null
          created_at?: string | null
          detail?: string | null
          evo_state?: string | null
          gap_inbound_min?: number | null
          id?: string | null
          instance_name?: string | null
          notes?: string | null
          pipeline_status?:
            | "healthy"
            | "warning"
            | "degraded_webhook"
            | "degraded_sender"
            | "critical_alerts"
            | "critical"
            | null
          probe_latency_ms?: number | null
          probe_status?: string | null
          queue_failed_24h?: number | null
          queue_pending_now?: number | null
          queue_sent_24h?: number | null
          snapshot?: Json | null
          unroutable_count?: number | null
          webhook_avg_ms?: number | null
          webhook_events_15min?: number | null
          webhook_events_1h?: number | null
          webhook_processed_pct?: number | null
        }
        Update: {
          alerts_critical_open?: number | null
          alerts_unresolved?: number | null
          baileys_health?: string | null
          baileys_severity?: number | null
          checked_at?: string | null
          consumer_filas?: string | null
          consumer_ok_count?: number | null
          created_at?: string | null
          detail?: string | null
          evo_state?: string | null
          gap_inbound_min?: number | null
          id?: string | null
          instance_name?: string | null
          notes?: string | null
          pipeline_status?:
            | "healthy"
            | "warning"
            | "degraded_webhook"
            | "degraded_sender"
            | "critical_alerts"
            | "critical"
            | null
          probe_latency_ms?: number | null
          probe_status?: string | null
          queue_failed_24h?: number | null
          queue_pending_now?: number | null
          queue_sent_24h?: number | null
          snapshot?: Json | null
          unroutable_count?: number | null
          webhook_avg_ms?: number | null
          webhook_events_15min?: number | null
          webhook_events_1h?: number | null
          webhook_processed_pct?: number | null
        }
        Relationships: []
      }
      evolution_pipeline_history: {
        Row: {
          changed_by: string | null
          created_at: string | null
          from_stage: string | null
          id: string | null
          pipeline_id: string | null
          reason: string | null
          to_stage: string | null
        }
        Insert: {
          changed_by?: string | null
          created_at?: string | null
          from_stage?: string | null
          id?: string | null
          pipeline_id?: string | null
          reason?: string | null
          to_stage?: string | null
        }
        Update: {
          changed_by?: string | null
          created_at?: string | null
          from_stage?: string | null
          id?: string | null
          pipeline_id?: string | null
          reason?: string | null
          to_stage?: string | null
        }
        Relationships: []
      }
      evolution_quick_replies: {
        Row: {
          category: string | null
          content: string | null
          created_at: string | null
          id: string | null
          is_active: boolean | null
          shortcut: string | null
          title: string | null
          use_count: number | null
        }
        Insert: {
          category?: string | null
          content?: string | null
          created_at?: string | null
          id?: string | null
          is_active?: boolean | null
          shortcut?: string | null
          title?: string | null
          use_count?: number | null
        }
        Update: {
          category?: string | null
          content?: string | null
          created_at?: string | null
          id?: string | null
          is_active?: boolean | null
          shortcut?: string | null
          title?: string | null
          use_count?: number | null
        }
        Relationships: []
      }
      evolution_reactions: {
        Row: {
          created_at: string | null
          emoji: string | null
          from_me: boolean | null
          id: string | null
          instance_name: string | null
          message_id: string | null
          push_name: string | null
          reacted_at: string | null
          remote_jid: string | null
        }
        Insert: {
          created_at?: string | null
          emoji?: string | null
          from_me?: boolean | null
          id?: string | null
          instance_name?: string | null
          message_id?: string | null
          push_name?: string | null
          reacted_at?: string | null
          remote_jid?: string | null
        }
        Update: {
          created_at?: string | null
          emoji?: string | null
          from_me?: boolean | null
          id?: string | null
          instance_name?: string | null
          message_id?: string | null
          push_name?: string | null
          reacted_at?: string | null
          remote_jid?: string | null
        }
        Relationships: []
      }
      evolution_realtime_events: {
        Row: {
          body: string | null
          created_at: string | null
          data: Json | null
          entity_id: string | null
          entity_type: string | null
          event_type: string | null
          id: string | null
          priority: string | null
          read: boolean | null
          read_at: string | null
          remote_jid: string | null
          target_users: string[] | null
          title: string | null
        }
        Insert: {
          body?: string | null
          created_at?: string | null
          data?: Json | null
          entity_id?: string | null
          entity_type?: string | null
          event_type?: string | null
          id?: string | null
          priority?: string | null
          read?: boolean | null
          read_at?: string | null
          remote_jid?: string | null
          target_users?: string[] | null
          title?: string | null
        }
        Update: {
          body?: string | null
          created_at?: string | null
          data?: Json | null
          entity_id?: string | null
          entity_type?: string | null
          event_type?: string | null
          id?: string | null
          priority?: string | null
          read?: boolean | null
          read_at?: string | null
          remote_jid?: string | null
          target_users?: string[] | null
          title?: string | null
        }
        Relationships: []
      }
      evolution_reconcile_jobs: {
        Row: {
          applied_at: string | null
          dispatched_at: string | null
          http_status: number | null
          id: number | null
          request_id: number | null
          result: Json | null
        }
        Insert: {
          applied_at?: string | null
          dispatched_at?: string | null
          http_status?: number | null
          id?: number | null
          request_id?: number | null
          result?: Json | null
        }
        Update: {
          applied_at?: string | null
          dispatched_at?: string | null
          http_status?: number | null
          id?: number | null
          request_id?: number | null
          result?: Json | null
        }
        Relationships: []
      }
      evolution_retention_log: {
        Row: {
          deleted_processed: number | null
          deleted_unprocessed: number | null
          duration_ms: number | null
          error_message: string | null
          freed_bytes_pretty: string | null
          freed_bytes_raw: number | null
          id: number | null
          processed_days_kept: number | null
          ran_at: string | null
          triggered_by: string | null
          unprocessed_days_kept: number | null
        }
        Insert: {
          deleted_processed?: number | null
          deleted_unprocessed?: number | null
          duration_ms?: number | null
          error_message?: string | null
          freed_bytes_pretty?: string | null
          freed_bytes_raw?: number | null
          id?: number | null
          processed_days_kept?: number | null
          ran_at?: string | null
          triggered_by?: string | null
          unprocessed_days_kept?: number | null
        }
        Update: {
          deleted_processed?: number | null
          deleted_unprocessed?: number | null
          duration_ms?: number | null
          error_message?: string | null
          freed_bytes_pretty?: string | null
          freed_bytes_raw?: number | null
          id?: number | null
          processed_days_kept?: number | null
          ran_at?: string | null
          triggered_by?: string | null
          unprocessed_days_kept?: number | null
        }
        Relationships: []
      }
      evolution_retry_metrics: {
        Row: {
          action: string | null
          attempt_count: number | null
          created_at: string | null
          final_http_status: number | null
          final_status: string | null
          id: string | null
          idempotency_key: string | null
          instance_name: string | null
          method: string | null
          retry_reasons: Json | null
          total_duration_ms: number | null
        }
        Insert: {
          action?: string | null
          attempt_count?: number | null
          created_at?: string | null
          final_http_status?: number | null
          final_status?: string | null
          id?: string | null
          idempotency_key?: string | null
          instance_name?: string | null
          method?: string | null
          retry_reasons?: Json | null
          total_duration_ms?: number | null
        }
        Update: {
          action?: string | null
          attempt_count?: number | null
          created_at?: string | null
          final_http_status?: number | null
          final_status?: string | null
          id?: string | null
          idempotency_key?: string | null
          instance_name?: string | null
          method?: string | null
          retry_reasons?: Json | null
          total_duration_ms?: number | null
        }
        Relationships: []
      }
      evolution_sales_pipeline: {
        Row: {
          assigned_to: string | null
          created_at: string | null
          current_stage: string | null
          id: string | null
          last_message_at: string | null
          metadata: Json | null
          notes: string | null
          previous_stage: string | null
          push_name: string | null
          remote_jid: string | null
          stage_changed_at: string | null
          total_messages: number | null
          updated_at: string | null
        }
        Insert: {
          assigned_to?: string | null
          created_at?: string | null
          current_stage?: string | null
          id?: string | null
          last_message_at?: string | null
          metadata?: Json | null
          notes?: string | null
          previous_stage?: string | null
          push_name?: string | null
          remote_jid?: string | null
          stage_changed_at?: string | null
          total_messages?: number | null
          updated_at?: string | null
        }
        Update: {
          assigned_to?: string | null
          created_at?: string | null
          current_stage?: string | null
          id?: string | null
          last_message_at?: string | null
          metadata?: Json | null
          notes?: string | null
          previous_stage?: string | null
          push_name?: string | null
          remote_jid?: string | null
          stage_changed_at?: string | null
          total_messages?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      evolution_scheduled_messages: {
        Row: {
          contact_id: string | null
          content: string | null
          created_at: string | null
          created_by: string | null
          error_message: string | null
          id: string | null
          instance_name: string | null
          media_url: string | null
          scheduled_at: string | null
          sent_at: string | null
          status: string | null
          template_id: string | null
        }
        Insert: {
          contact_id?: string | null
          content?: string | null
          created_at?: string | null
          created_by?: string | null
          error_message?: string | null
          id?: string | null
          instance_name?: string | null
          media_url?: string | null
          scheduled_at?: string | null
          sent_at?: string | null
          status?: string | null
          template_id?: string | null
        }
        Update: {
          contact_id?: string | null
          content?: string | null
          created_at?: string | null
          created_by?: string | null
          error_message?: string | null
          id?: string | null
          instance_name?: string | null
          media_url?: string | null
          scheduled_at?: string | null
          sent_at?: string | null
          status?: string | null
          template_id?: string | null
        }
        Relationships: []
      }
      evolution_send_idempotency: {
        Row: {
          created_at: string | null
          expires_at: string | null
          external_message_id: string | null
          http_status: number | null
          idem_key: string | null
          instance_name: string | null
          path: string | null
          response: Json | null
        }
        Insert: {
          created_at?: string | null
          expires_at?: string | null
          external_message_id?: string | null
          http_status?: number | null
          idem_key?: string | null
          instance_name?: string | null
          path?: string | null
          response?: Json | null
        }
        Update: {
          created_at?: string | null
          expires_at?: string | null
          external_message_id?: string | null
          http_status?: number | null
          idem_key?: string | null
          instance_name?: string | null
          path?: string | null
          response?: Json | null
        }
        Relationships: []
      }
      evolution_sentiment_alerts: {
        Row: {
          acknowledged: boolean | null
          acknowledged_at: string | null
          acknowledged_by: string | null
          alert_type: string | null
          contact_id: string | null
          conversation_id: string | null
          created_at: string | null
          id: string | null
          message_preview: string | null
          resolution_notes: string | null
          resolved: boolean | null
          sentiment_id: string | null
          severity: string | null
        }
        Insert: {
          acknowledged?: boolean | null
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          alert_type?: string | null
          contact_id?: string | null
          conversation_id?: string | null
          created_at?: string | null
          id?: string | null
          message_preview?: string | null
          resolution_notes?: string | null
          resolved?: boolean | null
          sentiment_id?: string | null
          severity?: string | null
        }
        Update: {
          acknowledged?: boolean | null
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          alert_type?: string | null
          contact_id?: string | null
          conversation_id?: string | null
          created_at?: string | null
          id?: string | null
          message_preview?: string | null
          resolution_notes?: string | null
          resolved?: boolean | null
          sentiment_id?: string | null
          severity?: string | null
        }
        Relationships: []
      }
      evolution_sentiment_analysis: {
        Row: {
          analyzed_at: string | null
          contact_id: string | null
          conversation_id: string | null
          created_at: string | null
          emotions: Json | null
          id: string | null
          intent: string | null
          keywords: string[] | null
          message_id: string | null
          message_text: string | null
          model_used: string | null
          remote_jid: string | null
          requires_attention: boolean | null
          sentiment: string | null
          sentiment_score: number | null
          urgency: string | null
        }
        Insert: {
          analyzed_at?: string | null
          contact_id?: string | null
          conversation_id?: string | null
          created_at?: string | null
          emotions?: Json | null
          id?: string | null
          intent?: string | null
          keywords?: string[] | null
          message_id?: string | null
          message_text?: string | null
          model_used?: string | null
          remote_jid?: string | null
          requires_attention?: boolean | null
          sentiment?: string | null
          sentiment_score?: number | null
          urgency?: string | null
        }
        Update: {
          analyzed_at?: string | null
          contact_id?: string | null
          conversation_id?: string | null
          created_at?: string | null
          emotions?: Json | null
          id?: string | null
          intent?: string | null
          keywords?: string[] | null
          message_id?: string | null
          message_text?: string | null
          model_used?: string | null
          remote_jid?: string | null
          requires_attention?: boolean | null
          sentiment?: string | null
          sentiment_score?: number | null
          urgency?: string | null
        }
        Relationships: []
      }
      evolution_sentiment_metrics: {
        Row: {
          alerts_generated: number | null
          avg_sentiment_score: number | null
          calculated_at: string | null
          id: string | null
          metric_date: string | null
          negative_count: number | null
          neutral_count: number | null
          positive_count: number | null
          total_messages: number | null
        }
        Insert: {
          alerts_generated?: number | null
          avg_sentiment_score?: number | null
          calculated_at?: string | null
          id?: string | null
          metric_date?: string | null
          negative_count?: number | null
          neutral_count?: number | null
          positive_count?: number | null
          total_messages?: number | null
        }
        Update: {
          alerts_generated?: number | null
          avg_sentiment_score?: number | null
          calculated_at?: string | null
          id?: string | null
          metric_date?: string | null
          negative_count?: number | null
          neutral_count?: number | null
          positive_count?: number | null
          total_messages?: number | null
        }
        Relationships: []
      }
      evolution_settings: {
        Row: {
          category: string | null
          created_at: string | null
          description: string | null
          id: string | null
          is_secret: boolean | null
          key: string | null
          updated_at: string | null
          value: Json | null
        }
        Insert: {
          category?: string | null
          created_at?: string | null
          description?: string | null
          id?: string | null
          is_secret?: boolean | null
          key?: string | null
          updated_at?: string | null
          value?: Json | null
        }
        Update: {
          category?: string | null
          created_at?: string | null
          description?: string | null
          id?: string | null
          is_secret?: boolean | null
          key?: string | null
          updated_at?: string | null
          value?: Json | null
        }
        Relationships: []
      }
      evolution_source_schema_map: {
        Row: {
          column_name: string | null
          data_type: string | null
          database_name: string | null
          discovered_at: string | null
          id: number | null
          is_nullable: string | null
          is_primary_key: boolean | null
          is_unique: boolean | null
          ordinal_position: number | null
          raw_metadata: Json | null
          row_count_est: number | null
          schema_name: string | null
          table_name: string | null
        }
        Insert: {
          column_name?: string | null
          data_type?: string | null
          database_name?: string | null
          discovered_at?: string | null
          id?: number | null
          is_nullable?: string | null
          is_primary_key?: boolean | null
          is_unique?: boolean | null
          ordinal_position?: number | null
          raw_metadata?: Json | null
          row_count_est?: number | null
          schema_name?: string | null
          table_name?: string | null
        }
        Update: {
          column_name?: string | null
          data_type?: string | null
          database_name?: string | null
          discovered_at?: string | null
          id?: number | null
          is_nullable?: string | null
          is_primary_key?: boolean | null
          is_unique?: boolean | null
          ordinal_position?: number | null
          raw_metadata?: Json | null
          row_count_est?: number | null
          schema_name?: string | null
          table_name?: string | null
        }
        Relationships: []
      }
      evolution_spam_keywords: {
        Row: {
          action: string | null
          auto_reply_message: string | null
          created_at: string | null
          hit_count: number | null
          id: string | null
          is_active: boolean | null
          keyword: string | null
          match_type: string | null
        }
        Insert: {
          action?: string | null
          auto_reply_message?: string | null
          created_at?: string | null
          hit_count?: number | null
          id?: string | null
          is_active?: boolean | null
          keyword?: string | null
          match_type?: string | null
        }
        Update: {
          action?: string | null
          auto_reply_message?: string | null
          created_at?: string | null
          hit_count?: number | null
          id?: string | null
          is_active?: boolean | null
          keyword?: string | null
          match_type?: string | null
        }
        Relationships: []
      }
      evolution_stage_mapping: {
        Row: {
          auto_transition_after_hours: number | null
          label_color: string | null
          label_name: string | null
          next_stage: string | null
          stage_key: string | null
          stage_order: number | null
        }
        Insert: {
          auto_transition_after_hours?: number | null
          label_color?: string | null
          label_name?: string | null
          next_stage?: string | null
          stage_key?: string | null
          stage_order?: number | null
        }
        Update: {
          auto_transition_after_hours?: number | null
          label_color?: string | null
          label_name?: string | null
          next_stage?: string | null
          stage_key?: string | null
          stage_order?: number | null
        }
        Relationships: []
      }
      evolution_status_auto_rules: {
        Row: {
          cooldown_hours: number | null
          created_at: string | null
          created_by: string | null
          id: string | null
          instance_name: string | null
          is_active: boolean | null
          max_reactions_per_day: number | null
          name: string | null
          reaction_emoji: string | null
          target_filter: Json | null
          updated_at: string | null
        }
        Insert: {
          cooldown_hours?: number | null
          created_at?: string | null
          created_by?: string | null
          id?: string | null
          instance_name?: string | null
          is_active?: boolean | null
          max_reactions_per_day?: number | null
          name?: string | null
          reaction_emoji?: string | null
          target_filter?: Json | null
          updated_at?: string | null
        }
        Update: {
          cooldown_hours?: number | null
          created_at?: string | null
          created_by?: string | null
          id?: string | null
          instance_name?: string | null
          is_active?: boolean | null
          max_reactions_per_day?: number | null
          name?: string | null
          reaction_emoji?: string | null
          target_filter?: Json | null
          updated_at?: string | null
        }
        Relationships: []
      }
      evolution_status_reactions: {
        Row: {
          automation_rule_id: string | null
          created_at: string | null
          id: string | null
          instance_name: string | null
          reacted_at: string | null
          reacted_by: string | null
          reaction_emoji: string | null
          reaction_type: string | null
          send_error: string | null
          sent_at: string | null
          sent_to_whatsapp: boolean | null
          status_id: string | null
        }
        Insert: {
          automation_rule_id?: string | null
          created_at?: string | null
          id?: string | null
          instance_name?: string | null
          reacted_at?: string | null
          reacted_by?: string | null
          reaction_emoji?: string | null
          reaction_type?: string | null
          send_error?: string | null
          sent_at?: string | null
          sent_to_whatsapp?: boolean | null
          status_id?: string | null
        }
        Update: {
          automation_rule_id?: string | null
          created_at?: string | null
          id?: string | null
          instance_name?: string | null
          reacted_at?: string | null
          reacted_by?: string | null
          reaction_emoji?: string | null
          reaction_type?: string | null
          send_error?: string | null
          sent_at?: string | null
          sent_to_whatsapp?: boolean | null
          status_id?: string | null
        }
        Relationships: []
      }
      evolution_tag_assignments: {
        Row: {
          assigned_at: string | null
          assigned_by: string | null
          entity_id: string | null
          entity_type: string | null
          id: string | null
          tag_id: string | null
        }
        Insert: {
          assigned_at?: string | null
          assigned_by?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string | null
          tag_id?: string | null
        }
        Update: {
          assigned_at?: string | null
          assigned_by?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string | null
          tag_id?: string | null
        }
        Relationships: []
      }
      evolution_tags: {
        Row: {
          auto_apply: boolean | null
          auto_apply_rules: Json | null
          category: string | null
          color: string | null
          created_at: string | null
          description: string | null
          id: string | null
          name: string | null
          use_count: number | null
        }
        Insert: {
          auto_apply?: boolean | null
          auto_apply_rules?: Json | null
          category?: string | null
          color?: string | null
          created_at?: string | null
          description?: string | null
          id?: string | null
          name?: string | null
          use_count?: number | null
        }
        Update: {
          auto_apply?: boolean | null
          auto_apply_rules?: Json | null
          category?: string | null
          color?: string | null
          created_at?: string | null
          description?: string | null
          id?: string | null
          name?: string | null
          use_count?: number | null
        }
        Relationships: []
      }
      evolution_tasks: {
        Row: {
          assigned_by: string | null
          assigned_to: string | null
          completed_at: string | null
          completed_by: string | null
          contact_id: string | null
          conversation_id: string | null
          created_at: string | null
          deal_id: string | null
          deleted_at: string | null
          description: string | null
          due_date: string | null
          due_time: string | null
          id: string | null
          is_recurring: boolean | null
          metadata: Json | null
          notes: string | null
          parent_task_id: string | null
          priority: string | null
          recurrence_end: string | null
          recurrence_rule: string | null
          reminder_at: string | null
          status: string | null
          tags: string[] | null
          task_type: string | null
          title: string | null
          updated_at: string | null
        }
        Insert: {
          assigned_by?: string | null
          assigned_to?: string | null
          completed_at?: string | null
          completed_by?: string | null
          contact_id?: string | null
          conversation_id?: string | null
          created_at?: string | null
          deal_id?: string | null
          deleted_at?: string | null
          description?: string | null
          due_date?: string | null
          due_time?: string | null
          id?: string | null
          is_recurring?: boolean | null
          metadata?: Json | null
          notes?: string | null
          parent_task_id?: string | null
          priority?: string | null
          recurrence_end?: string | null
          recurrence_rule?: string | null
          reminder_at?: string | null
          status?: string | null
          tags?: string[] | null
          task_type?: string | null
          title?: string | null
          updated_at?: string | null
        }
        Update: {
          assigned_by?: string | null
          assigned_to?: string | null
          completed_at?: string | null
          completed_by?: string | null
          contact_id?: string | null
          conversation_id?: string | null
          created_at?: string | null
          deal_id?: string | null
          deleted_at?: string | null
          description?: string | null
          due_date?: string | null
          due_time?: string | null
          id?: string | null
          is_recurring?: boolean | null
          metadata?: Json | null
          notes?: string | null
          parent_task_id?: string | null
          priority?: string | null
          recurrence_end?: string | null
          recurrence_rule?: string | null
          reminder_at?: string | null
          status?: string | null
          tags?: string[] | null
          task_type?: string | null
          title?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      evolution_template_usage: {
        Row: {
          created_at: string | null
          error_message: string | null
          id: string | null
          remote_jid: string | null
          send_status: string | null
          template_id: string | null
          variables_used: Json | null
        }
        Insert: {
          created_at?: string | null
          error_message?: string | null
          id?: string | null
          remote_jid?: string | null
          send_status?: string | null
          template_id?: string | null
          variables_used?: Json | null
        }
        Update: {
          created_at?: string | null
          error_message?: string | null
          id?: string | null
          remote_jid?: string | null
          send_status?: string | null
          template_id?: string | null
          variables_used?: Json | null
        }
        Relationships: []
      }
      evolution_typebot_sessions: {
        Row: {
          completed_at: string | null
          created_at: string | null
          current_block: string | null
          id: string | null
          last_interaction_at: string | null
          remote_jid: string | null
          session_id: string | null
          started_at: string | null
          status: string | null
          total_interactions: number | null
          typebot_id: string | null
          typebot_name: string | null
          variables: Json | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string | null
          current_block?: string | null
          id?: string | null
          last_interaction_at?: string | null
          remote_jid?: string | null
          session_id?: string | null
          started_at?: string | null
          status?: string | null
          total_interactions?: number | null
          typebot_id?: string | null
          typebot_name?: string | null
          variables?: Json | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string | null
          current_block?: string | null
          id?: string | null
          last_interaction_at?: string | null
          remote_jid?: string | null
          session_id?: string | null
          started_at?: string | null
          status?: string | null
          total_interactions?: number | null
          typebot_id?: string | null
          typebot_name?: string | null
          variables?: Json | null
        }
        Relationships: []
      }
      evolution_webhook_dlq: {
        Row: {
          consumer_version: string | null
          created_at: string | null
          error_message: string | null
          error_stack: string | null
          event_type: string | null
          id: string | null
          instance_name: string | null
          last_request_id: number | null
          max_retries: number | null
          next_retry_at: string | null
          original_event_id: string | null
          payload: Json | null
          queue_name: string | null
          raw_payload: string | null
          remote_jid: string | null
          resolved_at: string | null
          resolved_by: string | null
          retry_count: number | null
          source_event_id: string | null
          status: string | null
        }
        Insert: {
          consumer_version?: string | null
          created_at?: string | null
          error_message?: string | null
          error_stack?: string | null
          event_type?: string | null
          id?: string | null
          instance_name?: string | null
          last_request_id?: number | null
          max_retries?: number | null
          next_retry_at?: string | null
          original_event_id?: string | null
          payload?: Json | null
          queue_name?: string | null
          raw_payload?: string | null
          remote_jid?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          retry_count?: number | null
          source_event_id?: string | null
          status?: string | null
        }
        Update: {
          consumer_version?: string | null
          created_at?: string | null
          error_message?: string | null
          error_stack?: string | null
          event_type?: string | null
          id?: string | null
          instance_name?: string | null
          last_request_id?: number | null
          max_retries?: number | null
          next_retry_at?: string | null
          original_event_id?: string | null
          payload?: Json | null
          queue_name?: string | null
          raw_payload?: string | null
          remote_jid?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          retry_count?: number | null
          source_event_id?: string | null
          status?: string | null
        }
        Relationships: []
      }
      evolution_webhook_events_v2: {
        Row: {
          created_at: string | null
          error_message: string | null
          event_type: string | null
          from_me: boolean | null
          id: string | null
          instance_name: string | null
          message_type: string | null
          payload: Json | null
          processed: boolean | null
          processed_at: string | null
          push_name: string | null
          remote_jid: string | null
          retry_count: number | null
          status: string | null
        }
        Insert: {
          created_at?: string | null
          error_message?: string | null
          event_type?: string | null
          from_me?: boolean | null
          id?: string | null
          instance_name?: string | null
          message_type?: string | null
          payload?: Json | null
          processed?: boolean | null
          processed_at?: string | null
          push_name?: string | null
          remote_jid?: string | null
          retry_count?: number | null
          status?: string | null
        }
        Update: {
          created_at?: string | null
          error_message?: string | null
          event_type?: string | null
          from_me?: boolean | null
          id?: string | null
          instance_name?: string | null
          message_type?: string | null
          payload?: Json | null
          processed?: boolean | null
          processed_at?: string | null
          push_name?: string | null
          remote_jid?: string | null
          retry_count?: number | null
          status?: string | null
        }
        Relationships: []
      }
      evolution_webhook_events_v2_2026_03: {
        Row: {
          created_at: string | null
          error_message: string | null
          event_type: string | null
          from_me: boolean | null
          id: string | null
          instance_name: string | null
          message_type: string | null
          payload: Json | null
          processed: boolean | null
          processed_at: string | null
          push_name: string | null
          remote_jid: string | null
          retry_count: number | null
          status: string | null
        }
        Insert: {
          created_at?: string | null
          error_message?: string | null
          event_type?: string | null
          from_me?: boolean | null
          id?: string | null
          instance_name?: string | null
          message_type?: string | null
          payload?: Json | null
          processed?: boolean | null
          processed_at?: string | null
          push_name?: string | null
          remote_jid?: string | null
          retry_count?: number | null
          status?: string | null
        }
        Update: {
          created_at?: string | null
          error_message?: string | null
          event_type?: string | null
          from_me?: boolean | null
          id?: string | null
          instance_name?: string | null
          message_type?: string | null
          payload?: Json | null
          processed?: boolean | null
          processed_at?: string | null
          push_name?: string | null
          remote_jid?: string | null
          retry_count?: number | null
          status?: string | null
        }
        Relationships: []
      }
      evolution_webhook_events_v2_2026_04: {
        Row: {
          created_at: string | null
          error_message: string | null
          event_type: string | null
          from_me: boolean | null
          id: string | null
          instance_name: string | null
          message_type: string | null
          payload: Json | null
          processed: boolean | null
          processed_at: string | null
          push_name: string | null
          remote_jid: string | null
          retry_count: number | null
          status: string | null
        }
        Insert: {
          created_at?: string | null
          error_message?: string | null
          event_type?: string | null
          from_me?: boolean | null
          id?: string | null
          instance_name?: string | null
          message_type?: string | null
          payload?: Json | null
          processed?: boolean | null
          processed_at?: string | null
          push_name?: string | null
          remote_jid?: string | null
          retry_count?: number | null
          status?: string | null
        }
        Update: {
          created_at?: string | null
          error_message?: string | null
          event_type?: string | null
          from_me?: boolean | null
          id?: string | null
          instance_name?: string | null
          message_type?: string | null
          payload?: Json | null
          processed?: boolean | null
          processed_at?: string | null
          push_name?: string | null
          remote_jid?: string | null
          retry_count?: number | null
          status?: string | null
        }
        Relationships: []
      }
      evolution_webhook_events_v2_2026_05: {
        Row: {
          created_at: string | null
          error_message: string | null
          event_type: string | null
          from_me: boolean | null
          id: string | null
          instance_name: string | null
          message_type: string | null
          payload: Json | null
          processed: boolean | null
          processed_at: string | null
          push_name: string | null
          remote_jid: string | null
          retry_count: number | null
          status: string | null
        }
        Insert: {
          created_at?: string | null
          error_message?: string | null
          event_type?: string | null
          from_me?: boolean | null
          id?: string | null
          instance_name?: string | null
          message_type?: string | null
          payload?: Json | null
          processed?: boolean | null
          processed_at?: string | null
          push_name?: string | null
          remote_jid?: string | null
          retry_count?: number | null
          status?: string | null
        }
        Update: {
          created_at?: string | null
          error_message?: string | null
          event_type?: string | null
          from_me?: boolean | null
          id?: string | null
          instance_name?: string | null
          message_type?: string | null
          payload?: Json | null
          processed?: boolean | null
          processed_at?: string | null
          push_name?: string | null
          remote_jid?: string | null
          retry_count?: number | null
          status?: string | null
        }
        Relationships: []
      }
      evolution_webhook_events_v2_2026_06: {
        Row: {
          created_at: string | null
          error_message: string | null
          event_type: string | null
          from_me: boolean | null
          id: string | null
          instance_name: string | null
          message_type: string | null
          payload: Json | null
          processed: boolean | null
          processed_at: string | null
          push_name: string | null
          remote_jid: string | null
          retry_count: number | null
          status: string | null
        }
        Insert: {
          created_at?: string | null
          error_message?: string | null
          event_type?: string | null
          from_me?: boolean | null
          id?: string | null
          instance_name?: string | null
          message_type?: string | null
          payload?: Json | null
          processed?: boolean | null
          processed_at?: string | null
          push_name?: string | null
          remote_jid?: string | null
          retry_count?: number | null
          status?: string | null
        }
        Update: {
          created_at?: string | null
          error_message?: string | null
          event_type?: string | null
          from_me?: boolean | null
          id?: string | null
          instance_name?: string | null
          message_type?: string | null
          payload?: Json | null
          processed?: boolean | null
          processed_at?: string | null
          push_name?: string | null
          remote_jid?: string | null
          retry_count?: number | null
          status?: string | null
        }
        Relationships: []
      }
      evolution_webhook_events_v2_2026_07: {
        Row: {
          created_at: string | null
          error_message: string | null
          event_type: string | null
          from_me: boolean | null
          id: string | null
          instance_name: string | null
          message_type: string | null
          payload: Json | null
          processed: boolean | null
          processed_at: string | null
          push_name: string | null
          remote_jid: string | null
          retry_count: number | null
          status: string | null
        }
        Insert: {
          created_at?: string | null
          error_message?: string | null
          event_type?: string | null
          from_me?: boolean | null
          id?: string | null
          instance_name?: string | null
          message_type?: string | null
          payload?: Json | null
          processed?: boolean | null
          processed_at?: string | null
          push_name?: string | null
          remote_jid?: string | null
          retry_count?: number | null
          status?: string | null
        }
        Update: {
          created_at?: string | null
          error_message?: string | null
          event_type?: string | null
          from_me?: boolean | null
          id?: string | null
          instance_name?: string | null
          message_type?: string | null
          payload?: Json | null
          processed?: boolean | null
          processed_at?: string | null
          push_name?: string | null
          remote_jid?: string | null
          retry_count?: number | null
          status?: string | null
        }
        Relationships: []
      }
      evolution_webhook_events_v2_2026_08: {
        Row: {
          created_at: string | null
          error_message: string | null
          event_type: string | null
          from_me: boolean | null
          id: string | null
          instance_name: string | null
          message_type: string | null
          payload: Json | null
          processed: boolean | null
          processed_at: string | null
          push_name: string | null
          remote_jid: string | null
          retry_count: number | null
          status: string | null
        }
        Insert: {
          created_at?: string | null
          error_message?: string | null
          event_type?: string | null
          from_me?: boolean | null
          id?: string | null
          instance_name?: string | null
          message_type?: string | null
          payload?: Json | null
          processed?: boolean | null
          processed_at?: string | null
          push_name?: string | null
          remote_jid?: string | null
          retry_count?: number | null
          status?: string | null
        }
        Update: {
          created_at?: string | null
          error_message?: string | null
          event_type?: string | null
          from_me?: boolean | null
          id?: string | null
          instance_name?: string | null
          message_type?: string | null
          payload?: Json | null
          processed?: boolean | null
          processed_at?: string | null
          push_name?: string | null
          remote_jid?: string | null
          retry_count?: number | null
          status?: string | null
        }
        Relationships: []
      }
      evolution_webhook_events_v2_2026_09: {
        Row: {
          created_at: string | null
          error_message: string | null
          event_type: string | null
          from_me: boolean | null
          id: string | null
          instance_name: string | null
          message_type: string | null
          payload: Json | null
          processed: boolean | null
          processed_at: string | null
          push_name: string | null
          remote_jid: string | null
          retry_count: number | null
          status: string | null
        }
        Insert: {
          created_at?: string | null
          error_message?: string | null
          event_type?: string | null
          from_me?: boolean | null
          id?: string | null
          instance_name?: string | null
          message_type?: string | null
          payload?: Json | null
          processed?: boolean | null
          processed_at?: string | null
          push_name?: string | null
          remote_jid?: string | null
          retry_count?: number | null
          status?: string | null
        }
        Update: {
          created_at?: string | null
          error_message?: string | null
          event_type?: string | null
          from_me?: boolean | null
          id?: string | null
          instance_name?: string | null
          message_type?: string | null
          payload?: Json | null
          processed?: boolean | null
          processed_at?: string | null
          push_name?: string | null
          remote_jid?: string | null
          retry_count?: number | null
          status?: string | null
        }
        Relationships: []
      }
      evolution_webhook_events_v2_2026_10: {
        Row: {
          created_at: string | null
          error_message: string | null
          event_type: string | null
          from_me: boolean | null
          id: string | null
          instance_name: string | null
          message_type: string | null
          payload: Json | null
          processed: boolean | null
          processed_at: string | null
          push_name: string | null
          remote_jid: string | null
          retry_count: number | null
          status: string | null
        }
        Insert: {
          created_at?: string | null
          error_message?: string | null
          event_type?: string | null
          from_me?: boolean | null
          id?: string | null
          instance_name?: string | null
          message_type?: string | null
          payload?: Json | null
          processed?: boolean | null
          processed_at?: string | null
          push_name?: string | null
          remote_jid?: string | null
          retry_count?: number | null
          status?: string | null
        }
        Update: {
          created_at?: string | null
          error_message?: string | null
          event_type?: string | null
          from_me?: boolean | null
          id?: string | null
          instance_name?: string | null
          message_type?: string | null
          payload?: Json | null
          processed?: boolean | null
          processed_at?: string | null
          push_name?: string | null
          remote_jid?: string | null
          retry_count?: number | null
          status?: string | null
        }
        Relationships: []
      }
      evolution_webhook_events_v2_2026_11: {
        Row: {
          created_at: string | null
          error_message: string | null
          event_type: string | null
          from_me: boolean | null
          id: string | null
          instance_name: string | null
          message_type: string | null
          payload: Json | null
          processed: boolean | null
          processed_at: string | null
          push_name: string | null
          remote_jid: string | null
          retry_count: number | null
          status: string | null
        }
        Insert: {
          created_at?: string | null
          error_message?: string | null
          event_type?: string | null
          from_me?: boolean | null
          id?: string | null
          instance_name?: string | null
          message_type?: string | null
          payload?: Json | null
          processed?: boolean | null
          processed_at?: string | null
          push_name?: string | null
          remote_jid?: string | null
          retry_count?: number | null
          status?: string | null
        }
        Update: {
          created_at?: string | null
          error_message?: string | null
          event_type?: string | null
          from_me?: boolean | null
          id?: string | null
          instance_name?: string | null
          message_type?: string | null
          payload?: Json | null
          processed?: boolean | null
          processed_at?: string | null
          push_name?: string | null
          remote_jid?: string | null
          retry_count?: number | null
          status?: string | null
        }
        Relationships: []
      }
      evolution_webhook_events_v2_2026_12: {
        Row: {
          created_at: string | null
          error_message: string | null
          event_type: string | null
          from_me: boolean | null
          id: string | null
          instance_name: string | null
          message_type: string | null
          payload: Json | null
          processed: boolean | null
          processed_at: string | null
          push_name: string | null
          remote_jid: string | null
          retry_count: number | null
          status: string | null
        }
        Insert: {
          created_at?: string | null
          error_message?: string | null
          event_type?: string | null
          from_me?: boolean | null
          id?: string | null
          instance_name?: string | null
          message_type?: string | null
          payload?: Json | null
          processed?: boolean | null
          processed_at?: string | null
          push_name?: string | null
          remote_jid?: string | null
          retry_count?: number | null
          status?: string | null
        }
        Update: {
          created_at?: string | null
          error_message?: string | null
          event_type?: string | null
          from_me?: boolean | null
          id?: string | null
          instance_name?: string | null
          message_type?: string | null
          payload?: Json | null
          processed?: boolean | null
          processed_at?: string | null
          push_name?: string | null
          remote_jid?: string | null
          retry_count?: number | null
          status?: string | null
        }
        Relationships: []
      }
      evolution_webhook_events_v2_2027_01: {
        Row: {
          created_at: string | null
          error_message: string | null
          event_type: string | null
          from_me: boolean | null
          id: string | null
          instance_name: string | null
          message_type: string | null
          payload: Json | null
          processed: boolean | null
          processed_at: string | null
          push_name: string | null
          remote_jid: string | null
          retry_count: number | null
          status: string | null
        }
        Insert: {
          created_at?: string | null
          error_message?: string | null
          event_type?: string | null
          from_me?: boolean | null
          id?: string | null
          instance_name?: string | null
          message_type?: string | null
          payload?: Json | null
          processed?: boolean | null
          processed_at?: string | null
          push_name?: string | null
          remote_jid?: string | null
          retry_count?: number | null
          status?: string | null
        }
        Update: {
          created_at?: string | null
          error_message?: string | null
          event_type?: string | null
          from_me?: boolean | null
          id?: string | null
          instance_name?: string | null
          message_type?: string | null
          payload?: Json | null
          processed?: boolean | null
          processed_at?: string | null
          push_name?: string | null
          remote_jid?: string | null
          retry_count?: number | null
          status?: string | null
        }
        Relationships: []
      }
      evolution_webhook_events_v2_2027_02: {
        Row: {
          created_at: string | null
          error_message: string | null
          event_type: string | null
          from_me: boolean | null
          id: string | null
          instance_name: string | null
          message_type: string | null
          payload: Json | null
          processed: boolean | null
          processed_at: string | null
          push_name: string | null
          remote_jid: string | null
          retry_count: number | null
          status: string | null
        }
        Insert: {
          created_at?: string | null
          error_message?: string | null
          event_type?: string | null
          from_me?: boolean | null
          id?: string | null
          instance_name?: string | null
          message_type?: string | null
          payload?: Json | null
          processed?: boolean | null
          processed_at?: string | null
          push_name?: string | null
          remote_jid?: string | null
          retry_count?: number | null
          status?: string | null
        }
        Update: {
          created_at?: string | null
          error_message?: string | null
          event_type?: string | null
          from_me?: boolean | null
          id?: string | null
          instance_name?: string | null
          message_type?: string | null
          payload?: Json | null
          processed?: boolean | null
          processed_at?: string | null
          push_name?: string | null
          remote_jid?: string | null
          retry_count?: number | null
          status?: string | null
        }
        Relationships: []
      }
      evolution_webhook_events_v2_2027_03: {
        Row: {
          created_at: string | null
          error_message: string | null
          event_type: string | null
          from_me: boolean | null
          id: string | null
          instance_name: string | null
          message_type: string | null
          payload: Json | null
          processed: boolean | null
          processed_at: string | null
          push_name: string | null
          remote_jid: string | null
          retry_count: number | null
          status: string | null
        }
        Insert: {
          created_at?: string | null
          error_message?: string | null
          event_type?: string | null
          from_me?: boolean | null
          id?: string | null
          instance_name?: string | null
          message_type?: string | null
          payload?: Json | null
          processed?: boolean | null
          processed_at?: string | null
          push_name?: string | null
          remote_jid?: string | null
          retry_count?: number | null
          status?: string | null
        }
        Update: {
          created_at?: string | null
          error_message?: string | null
          event_type?: string | null
          from_me?: boolean | null
          id?: string | null
          instance_name?: string | null
          message_type?: string | null
          payload?: Json | null
          processed?: boolean | null
          processed_at?: string | null
          push_name?: string | null
          remote_jid?: string | null
          retry_count?: number | null
          status?: string | null
        }
        Relationships: []
      }
      evolution_webhook_events_v2_2027_04: {
        Row: {
          created_at: string | null
          error_message: string | null
          event_type: string | null
          from_me: boolean | null
          id: string | null
          instance_name: string | null
          message_type: string | null
          payload: Json | null
          processed: boolean | null
          processed_at: string | null
          push_name: string | null
          remote_jid: string | null
          retry_count: number | null
          status: string | null
        }
        Insert: {
          created_at?: string | null
          error_message?: string | null
          event_type?: string | null
          from_me?: boolean | null
          id?: string | null
          instance_name?: string | null
          message_type?: string | null
          payload?: Json | null
          processed?: boolean | null
          processed_at?: string | null
          push_name?: string | null
          remote_jid?: string | null
          retry_count?: number | null
          status?: string | null
        }
        Update: {
          created_at?: string | null
          error_message?: string | null
          event_type?: string | null
          from_me?: boolean | null
          id?: string | null
          instance_name?: string | null
          message_type?: string | null
          payload?: Json | null
          processed?: boolean | null
          processed_at?: string | null
          push_name?: string | null
          remote_jid?: string | null
          retry_count?: number | null
          status?: string | null
        }
        Relationships: []
      }
      evolution_webhook_events_v2_2027_05: {
        Row: {
          created_at: string | null
          error_message: string | null
          event_type: string | null
          from_me: boolean | null
          id: string | null
          instance_name: string | null
          message_type: string | null
          payload: Json | null
          processed: boolean | null
          processed_at: string | null
          push_name: string | null
          remote_jid: string | null
          retry_count: number | null
          status: string | null
        }
        Insert: {
          created_at?: string | null
          error_message?: string | null
          event_type?: string | null
          from_me?: boolean | null
          id?: string | null
          instance_name?: string | null
          message_type?: string | null
          payload?: Json | null
          processed?: boolean | null
          processed_at?: string | null
          push_name?: string | null
          remote_jid?: string | null
          retry_count?: number | null
          status?: string | null
        }
        Update: {
          created_at?: string | null
          error_message?: string | null
          event_type?: string | null
          from_me?: boolean | null
          id?: string | null
          instance_name?: string | null
          message_type?: string | null
          payload?: Json | null
          processed?: boolean | null
          processed_at?: string | null
          push_name?: string | null
          remote_jid?: string | null
          retry_count?: number | null
          status?: string | null
        }
        Relationships: []
      }
      evolution_webhook_events_v2_2027_06: {
        Row: {
          created_at: string | null
          error_message: string | null
          event_type: string | null
          from_me: boolean | null
          id: string | null
          instance_name: string | null
          message_type: string | null
          payload: Json | null
          processed: boolean | null
          processed_at: string | null
          push_name: string | null
          remote_jid: string | null
          retry_count: number | null
          status: string | null
        }
        Insert: {
          created_at?: string | null
          error_message?: string | null
          event_type?: string | null
          from_me?: boolean | null
          id?: string | null
          instance_name?: string | null
          message_type?: string | null
          payload?: Json | null
          processed?: boolean | null
          processed_at?: string | null
          push_name?: string | null
          remote_jid?: string | null
          retry_count?: number | null
          status?: string | null
        }
        Update: {
          created_at?: string | null
          error_message?: string | null
          event_type?: string | null
          from_me?: boolean | null
          id?: string | null
          instance_name?: string | null
          message_type?: string | null
          payload?: Json | null
          processed?: boolean | null
          processed_at?: string | null
          push_name?: string | null
          remote_jid?: string | null
          retry_count?: number | null
          status?: string | null
        }
        Relationships: []
      }
      evolution_webhook_events_v2_default: {
        Row: {
          created_at: string | null
          error_message: string | null
          event_type: string | null
          from_me: boolean | null
          id: string | null
          instance_name: string | null
          message_type: string | null
          payload: Json | null
          processed: boolean | null
          processed_at: string | null
          push_name: string | null
          remote_jid: string | null
          retry_count: number | null
          status: string | null
        }
        Insert: {
          created_at?: string | null
          error_message?: string | null
          event_type?: string | null
          from_me?: boolean | null
          id?: string | null
          instance_name?: string | null
          message_type?: string | null
          payload?: Json | null
          processed?: boolean | null
          processed_at?: string | null
          push_name?: string | null
          remote_jid?: string | null
          retry_count?: number | null
          status?: string | null
        }
        Update: {
          created_at?: string | null
          error_message?: string | null
          event_type?: string | null
          from_me?: boolean | null
          id?: string | null
          instance_name?: string | null
          message_type?: string | null
          payload?: Json | null
          processed?: boolean | null
          processed_at?: string | null
          push_name?: string | null
          remote_jid?: string | null
          retry_count?: number | null
          status?: string | null
        }
        Relationships: []
      }
      evolution_webhook_metrics: {
        Row: {
          avg_processing_time_ms: number | null
          created_at: string | null
          error_count: number | null
          event_count: number | null
          event_type: string | null
          hour_bucket: string | null
          id: string | null
        }
        Insert: {
          avg_processing_time_ms?: number | null
          created_at?: string | null
          error_count?: number | null
          event_count?: number | null
          event_type?: string | null
          hour_bucket?: string | null
          id?: string | null
        }
        Update: {
          avg_processing_time_ms?: number | null
          created_at?: string | null
          error_count?: number | null
          event_count?: number | null
          event_type?: string | null
          hour_bucket?: string | null
          id?: string | null
        }
        Relationships: []
      }
      evolution_whatsapp_status: {
        Row: {
          contact_id: string | null
          content: string | null
          created_at: string | null
          expires_at: string | null
          id: string | null
          instance_name: string | null
          media_meta: Json | null
          media_mimetype: string | null
          media_url: string | null
          message_id: string | null
          message_type: string | null
          participant_jid: string | null
          participant_name: string | null
          posted_at: string | null
          viewed_at: string | null
          viewed_by_us: boolean | null
        }
        Insert: {
          contact_id?: string | null
          content?: string | null
          created_at?: string | null
          expires_at?: string | null
          id?: string | null
          instance_name?: string | null
          media_meta?: Json | null
          media_mimetype?: string | null
          media_url?: string | null
          message_id?: string | null
          message_type?: string | null
          participant_jid?: string | null
          participant_name?: string | null
          posted_at?: string | null
          viewed_at?: string | null
          viewed_by_us?: boolean | null
        }
        Update: {
          contact_id?: string | null
          content?: string | null
          created_at?: string | null
          expires_at?: string | null
          id?: string | null
          instance_name?: string | null
          media_meta?: Json | null
          media_mimetype?: string | null
          media_url?: string | null
          message_id?: string | null
          message_type?: string | null
          participant_jid?: string | null
          participant_name?: string | null
          posted_at?: string | null
          viewed_at?: string | null
          viewed_by_us?: boolean | null
        }
        Relationships: []
      }
      extensions: {
        Row: {
          id: string | null
          inserted_at: string | null
          settings: Json | null
          tenant_external_id: string | null
          type: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string | null
          inserted_at?: string | null
          settings?: Json | null
          tenant_external_id?: string | null
          type?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string | null
          inserted_at?: string | null
          settings?: Json | null
          tenant_external_id?: string | null
          type?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      failed_messages: {
        Row: {
          created_at: string | null
          error_code: string | null
          error_message: string | null
          http_status: number | null
          id: string | null
          idempotency_key: string | null
          instance_name: string | null
          last_attempt_at: string | null
          last_retry_reason: string | null
          max_retries: number | null
          message_id: string | null
          next_attempt_at: string | null
          next_retry_at: string | null
          payload: Json | null
          remote_jid: string | null
          retry_count: number | null
          status: string | null
          succeeded_at: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          error_code?: string | null
          error_message?: string | null
          http_status?: number | null
          id?: string | null
          idempotency_key?: string | null
          instance_name?: string | null
          last_attempt_at?: string | null
          last_retry_reason?: string | null
          max_retries?: number | null
          message_id?: string | null
          next_attempt_at?: string | null
          next_retry_at?: string | null
          payload?: Json | null
          remote_jid?: string | null
          retry_count?: number | null
          status?: string | null
          succeeded_at?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          error_code?: string | null
          error_message?: string | null
          http_status?: number | null
          id?: string | null
          idempotency_key?: string | null
          instance_name?: string | null
          last_attempt_at?: string | null
          last_retry_reason?: string | null
          max_retries?: number | null
          message_id?: string | null
          next_attempt_at?: string | null
          next_retry_at?: string | null
          payload?: Json | null
          remote_jid?: string | null
          retry_count?: number | null
          status?: string | null
          succeeded_at?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      favorite_contacts: {
        Row: {
          contact_id: string | null
          created_at: string | null
          id: string | null
          user_id: string | null
        }
        Insert: {
          contact_id?: string | null
          created_at?: string | null
          id?: string | null
          user_id?: string | null
        }
        Update: {
          contact_id?: string | null
          created_at?: string | null
          id?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      feature_flags: {
        Row: {
          allowed_roles: string[] | null
          allowed_user_ids: string[] | null
          blocked_user_ids: string[] | null
          created_at: string | null
          enabled: boolean | null
          expires_at: string | null
          key: string | null
          metadata: Json | null
          rollout_percentage: number | null
          updated_at: string | null
        }
        Insert: {
          allowed_roles?: string[] | null
          allowed_user_ids?: string[] | null
          blocked_user_ids?: string[] | null
          created_at?: string | null
          enabled?: boolean | null
          expires_at?: string | null
          key?: string | null
          metadata?: Json | null
          rollout_percentage?: number | null
          updated_at?: string | null
        }
        Update: {
          allowed_roles?: string[] | null
          allowed_user_ids?: string[] | null
          blocked_user_ids?: string[] | null
          created_at?: string | null
          enabled?: boolean | null
          expires_at?: string | null
          key?: string | null
          metadata?: Json | null
          rollout_percentage?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      file_scan_logs: {
        Row: {
          bucket_id: string | null
          created_at: string | null
          file_name: string | null
          id: string | null
          provider: string | null
          provider_response: Json | null
          status: string | null
        }
        Insert: {
          bucket_id?: string | null
          created_at?: string | null
          file_name?: string | null
          id?: string | null
          provider?: string | null
          provider_response?: Json | null
          status?: string | null
        }
        Update: {
          bucket_id?: string | null
          created_at?: string | null
          file_name?: string | null
          id?: string | null
          provider?: string | null
          provider_response?: Json | null
          status?: string | null
        }
        Relationships: []
      }
      finetune_jobs: {
        Row: {
          agent_id: string | null
          completed_at: string | null
          config: Json | null
          created_at: string | null
          dataset_path: string | null
          error: string | null
          id: string | null
          model_name: string | null
          progress: number | null
          result: Json | null
          started_at: string | null
          status: string | null
          workspace_id: string | null
        }
        Insert: {
          agent_id?: string | null
          completed_at?: string | null
          config?: Json | null
          created_at?: string | null
          dataset_path?: string | null
          error?: string | null
          id?: string | null
          model_name?: string | null
          progress?: number | null
          result?: Json | null
          started_at?: string | null
          status?: string | null
          workspace_id?: string | null
        }
        Update: {
          agent_id?: string | null
          completed_at?: string | null
          config?: Json | null
          created_at?: string | null
          dataset_path?: string | null
          error?: string | null
          id?: string | null
          model_name?: string | null
          progress?: number | null
          result?: Json | null
          started_at?: string | null
          status?: string | null
          workspace_id?: string | null
        }
        Relationships: []
      }
      followup_executions: {
        Row: {
          completed_at: string | null
          contact_id: string | null
          created_at: string | null
          current_step: number | null
          id: string | null
          next_step_at: string | null
          sequence_id: string | null
          started_at: string | null
          status: string | null
        }
        Insert: {
          completed_at?: string | null
          contact_id?: string | null
          created_at?: string | null
          current_step?: number | null
          id?: string | null
          next_step_at?: string | null
          sequence_id?: string | null
          started_at?: string | null
          status?: string | null
        }
        Update: {
          completed_at?: string | null
          contact_id?: string | null
          created_at?: string | null
          current_step?: number | null
          id?: string | null
          next_step_at?: string | null
          sequence_id?: string | null
          started_at?: string | null
          status?: string | null
        }
        Relationships: []
      }
      followup_sequences: {
        Row: {
          created_at: string | null
          created_by: string | null
          id: string | null
          is_active: boolean | null
          name: string | null
          trigger_event: string | null
          updated_at: string | null
          whatsapp_connection_id: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          id?: string | null
          is_active?: boolean | null
          name?: string | null
          trigger_event?: string | null
          updated_at?: string | null
          whatsapp_connection_id?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          id?: string | null
          is_active?: boolean | null
          name?: string | null
          trigger_event?: string | null
          updated_at?: string | null
          whatsapp_connection_id?: string | null
        }
        Relationships: []
      }
      followup_steps: {
        Row: {
          created_at: string | null
          delay_hours: number | null
          id: string | null
          is_active: boolean | null
          message_template: string | null
          message_type: string | null
          sequence_id: string | null
          step_order: number | null
        }
        Insert: {
          created_at?: string | null
          delay_hours?: number | null
          id?: string | null
          is_active?: boolean | null
          message_template?: string | null
          message_type?: string | null
          sequence_id?: string | null
          step_order?: number | null
        }
        Update: {
          created_at?: string | null
          delay_hours?: number | null
          id?: string | null
          is_active?: boolean | null
          message_template?: string | null
          message_type?: string | null
          sequence_id?: string | null
          step_order?: number | null
        }
        Relationships: []
      }
      forensic_snapshots: {
        Row: {
          agent_id: string | null
          chain_hash: string | null
          created_at: string | null
          decision_rationale: string | null
          decision_type: string | null
          execution_id: string | null
          id: string | null
          input_hash: string | null
          metadata: Json | null
          output_hash: string | null
          previous_hash: string | null
          state_after: Json | null
          state_before: Json | null
          step_index: number | null
        }
        Insert: {
          agent_id?: string | null
          chain_hash?: string | null
          created_at?: string | null
          decision_rationale?: string | null
          decision_type?: string | null
          execution_id?: string | null
          id?: string | null
          input_hash?: string | null
          metadata?: Json | null
          output_hash?: string | null
          previous_hash?: string | null
          state_after?: Json | null
          state_before?: Json | null
          step_index?: number | null
        }
        Update: {
          agent_id?: string | null
          chain_hash?: string | null
          created_at?: string | null
          decision_rationale?: string | null
          decision_type?: string | null
          execution_id?: string | null
          id?: string | null
          input_hash?: string | null
          metadata?: Json | null
          output_hash?: string | null
          previous_hash?: string | null
          state_after?: Json | null
          state_before?: Json | null
          step_index?: number | null
        }
        Relationships: []
      }
      fornecedores: {
        Row: {
          ativo: boolean | null
          atualizado_em: string | null
          cep: string | null
          chave_pix: string | null
          cidade: string | null
          contato_nome: string | null
          contato_telefone: string | null
          criado_em: string | null
          data_cadastro: string | null
          endereco: string | null
          estado: string | null
          favorecido: string | null
          id: string | null
          nome: string | null
          observacao: string | null
          tipo: string | null
          tipo_chave_pix: string | null
        }
        Insert: {
          ativo?: boolean | null
          atualizado_em?: string | null
          cep?: string | null
          chave_pix?: string | null
          cidade?: string | null
          contato_nome?: string | null
          contato_telefone?: string | null
          criado_em?: string | null
          data_cadastro?: string | null
          endereco?: string | null
          estado?: string | null
          favorecido?: string | null
          id?: string | null
          nome?: string | null
          observacao?: string | null
          tipo?: string | null
          tipo_chave_pix?: string | null
        }
        Update: {
          ativo?: boolean | null
          atualizado_em?: string | null
          cep?: string | null
          chave_pix?: string | null
          cidade?: string | null
          contato_nome?: string | null
          contato_telefone?: string | null
          criado_em?: string | null
          data_cadastro?: string | null
          endereco?: string | null
          estado?: string | null
          favorecido?: string | null
          id?: string | null
          nome?: string | null
          observacao?: string | null
          tipo?: string | null
          tipo_chave_pix?: string | null
        }
        Relationships: []
      }
      forwarded_messages: {
        Row: {
          created_at: string | null
          forwarded_at: string | null
          id: string | null
          source_message_id: string | null
          target_id: string | null
        }
        Insert: {
          created_at?: string | null
          forwarded_at?: string | null
          id?: string | null
          source_message_id?: string | null
          target_id?: string | null
        }
        Update: {
          created_at?: string | null
          forwarded_at?: string | null
          id?: string | null
          source_message_id?: string | null
          target_id?: string | null
        }
        Relationships: []
      }
      geo_blocking_settings: {
        Row: {
          created_at: string | null
          id: string | null
          mode: string | null
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string | null
          mode?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string | null
          mode?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: []
      }
      global_settings: {
        Row: {
          created_at: string | null
          description: string | null
          id: string | null
          key: string | null
          updated_at: string | null
          updated_by: string | null
          value: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string | null
          key?: string | null
          updated_at?: string | null
          updated_by?: string | null
          value?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string | null
          key?: string | null
          updated_at?: string | null
          updated_by?: string | null
          value?: string | null
        }
        Relationships: []
      }
      goals_configurations: {
        Row: {
          created_at: string | null
          daily_target: number | null
          goal_type: string | null
          id: string | null
          is_active: boolean | null
          monthly_target: number | null
          profile_id: string | null
          queue_id: string | null
          updated_at: string | null
          weekly_target: number | null
        }
        Insert: {
          created_at?: string | null
          daily_target?: number | null
          goal_type?: string | null
          id?: string | null
          is_active?: boolean | null
          monthly_target?: number | null
          profile_id?: string | null
          queue_id?: string | null
          updated_at?: string | null
          weekly_target?: number | null
        }
        Update: {
          created_at?: string | null
          daily_target?: number | null
          goal_type?: string | null
          id?: string | null
          is_active?: boolean | null
          monthly_target?: number | null
          profile_id?: string | null
          queue_id?: string | null
          updated_at?: string | null
          weekly_target?: number | null
        }
        Relationships: []
      }
      inbox_custom_scopes: {
        Row: {
          created_at: string | null
          description: string | null
          filter_criteria: Json | null
          icon: string | null
          id: string | null
          is_active: boolean | null
          label: string | null
          name: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          filter_criteria?: Json | null
          icon?: string | null
          id?: string | null
          is_active?: boolean | null
          label?: string | null
          name?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          filter_criteria?: Json | null
          icon?: string | null
          id?: string | null
          is_active?: boolean | null
          label?: string | null
          name?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      installed_templates: {
        Row: {
          agent_id: string | null
          created_at: string | null
          id: string | null
          installed_by: string | null
          template_id: string | null
          workspace_id: string | null
        }
        Insert: {
          agent_id?: string | null
          created_at?: string | null
          id?: string | null
          installed_by?: string | null
          template_id?: string | null
          workspace_id?: string | null
        }
        Update: {
          agent_id?: string | null
          created_at?: string | null
          id?: string | null
          installed_by?: string | null
          template_id?: string | null
          workspace_id?: string | null
        }
        Relationships: []
      }
      instance_auth_events: {
        Row: {
          created_at: string | null
          detail: string | null
          event_type: string | null
          http_status: number | null
          id: string | null
          instance_name: string | null
          investigated_at: string | null
          ip_address: string | null
          meta: Json | null
          paused_until: string | null
          reason: string | null
          source: string | null
          status_code: number | null
          success: boolean | null
          user_agent: string | null
        }
        Insert: {
          created_at?: string | null
          detail?: string | null
          event_type?: string | null
          http_status?: number | null
          id?: string | null
          instance_name?: string | null
          investigated_at?: string | null
          ip_address?: string | null
          meta?: Json | null
          paused_until?: string | null
          reason?: string | null
          source?: string | null
          status_code?: number | null
          success?: boolean | null
          user_agent?: string | null
        }
        Update: {
          created_at?: string | null
          detail?: string | null
          event_type?: string | null
          http_status?: number | null
          id?: string | null
          instance_name?: string | null
          investigated_at?: string | null
          ip_address?: string | null
          meta?: Json | null
          paused_until?: string | null
          reason?: string | null
          source?: string | null
          status_code?: number | null
          success?: boolean | null
          user_agent?: string | null
        }
        Relationships: []
      }
      instance_processing_pauses: {
        Row: {
          auto_paused: boolean | null
          created_at: string | null
          id: string | null
          instance_name: string | null
          paused_at: string | null
          paused_by: string | null
          paused_until: string | null
          reason: string | null
          resumed_at: string | null
          trigger_count: number | null
          updated_at: string | null
        }
        Insert: {
          auto_paused?: boolean | null
          created_at?: string | null
          id?: string | null
          instance_name?: string | null
          paused_at?: string | null
          paused_by?: string | null
          paused_until?: string | null
          reason?: string | null
          resumed_at?: string | null
          trigger_count?: number | null
          updated_at?: string | null
        }
        Update: {
          auto_paused?: boolean | null
          created_at?: string | null
          id?: string | null
          instance_name?: string | null
          paused_at?: string | null
          paused_by?: string | null
          paused_until?: string | null
          reason?: string | null
          resumed_at?: string | null
          trigger_count?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      instance_registry: {
        Row: {
          api_key: string | null
          api_url: string | null
          auto_reply_enabled: boolean | null
          auto_reply_message: string | null
          bitrix_integration: Json | null
          business_hours_enabled: boolean | null
          config: Json | null
          connection_status: string | null
          created_at: string | null
          department: string | null
          display_name: string | null
          error_logs: string | null
          id: string | null
          instance_name: string | null
          is_active: boolean | null
          is_master: boolean | null
          last_connected_at: string | null
          max_concurrent_chats: number | null
          message_count_received: number | null
          message_count_sent: number | null
          metadata: Json | null
          n8n_workflows: Json | null
          notes: string | null
          operator_email: string | null
          operator_name: string | null
          operator_phone: string | null
          operator_since: string | null
          owner_id: string | null
          phone_number: string | null
          profile_picture: string | null
          proxy_host: string | null
          proxy_pass: string | null
          proxy_port: string | null
          proxy_user: string | null
          responsible_email: string | null
          responsible_name: string | null
          settings: Json | null
          sla_first_response_minutes: number | null
          sla_resolution_hours: number | null
          slot_name: string | null
          status: string | null
          updated_at: string | null
          usage_type: string | null
          webhook_enabled: boolean | null
          webhook_url: string | null
        }
        Insert: {
          api_key?: string | null
          api_url?: string | null
          auto_reply_enabled?: boolean | null
          auto_reply_message?: string | null
          bitrix_integration?: Json | null
          business_hours_enabled?: boolean | null
          config?: Json | null
          connection_status?: string | null
          created_at?: string | null
          department?: string | null
          display_name?: string | null
          error_logs?: string | null
          id?: string | null
          instance_name?: string | null
          is_active?: boolean | null
          is_master?: boolean | null
          last_connected_at?: string | null
          max_concurrent_chats?: number | null
          message_count_received?: number | null
          message_count_sent?: number | null
          metadata?: Json | null
          n8n_workflows?: Json | null
          notes?: string | null
          operator_email?: string | null
          operator_name?: string | null
          operator_phone?: string | null
          operator_since?: string | null
          owner_id?: string | null
          phone_number?: string | null
          profile_picture?: string | null
          proxy_host?: string | null
          proxy_pass?: string | null
          proxy_port?: string | null
          proxy_user?: string | null
          responsible_email?: string | null
          responsible_name?: string | null
          settings?: Json | null
          sla_first_response_minutes?: number | null
          sla_resolution_hours?: number | null
          slot_name?: string | null
          status?: string | null
          updated_at?: string | null
          usage_type?: string | null
          webhook_enabled?: boolean | null
          webhook_url?: string | null
        }
        Update: {
          api_key?: string | null
          api_url?: string | null
          auto_reply_enabled?: boolean | null
          auto_reply_message?: string | null
          bitrix_integration?: Json | null
          business_hours_enabled?: boolean | null
          config?: Json | null
          connection_status?: string | null
          created_at?: string | null
          department?: string | null
          display_name?: string | null
          error_logs?: string | null
          id?: string | null
          instance_name?: string | null
          is_active?: boolean | null
          is_master?: boolean | null
          last_connected_at?: string | null
          max_concurrent_chats?: number | null
          message_count_received?: number | null
          message_count_sent?: number | null
          metadata?: Json | null
          n8n_workflows?: Json | null
          notes?: string | null
          operator_email?: string | null
          operator_name?: string | null
          operator_phone?: string | null
          operator_since?: string | null
          owner_id?: string | null
          phone_number?: string | null
          profile_picture?: string | null
          proxy_host?: string | null
          proxy_pass?: string | null
          proxy_port?: string | null
          proxy_user?: string | null
          responsible_email?: string | null
          responsible_name?: string | null
          settings?: Json | null
          sla_first_response_minutes?: number | null
          sla_resolution_hours?: number | null
          slot_name?: string | null
          status?: string | null
          updated_at?: string | null
          usage_type?: string | null
          webhook_enabled?: boolean | null
          webhook_url?: string | null
        }
        Relationships: []
      }
      integration_profiles: {
        Row: {
          created_at: string | null
          default_instance: string | null
          detected_signals: Json | null
          display_phone: string | null
          id: string | null
          is_active: boolean | null
          migrated_at: string | null
          migration_notes: string | null
          migration_status: string | null
          provider: string | null
          updated_at: string | null
          waba_name: string | null
        }
        Insert: {
          created_at?: string | null
          default_instance?: string | null
          detected_signals?: Json | null
          display_phone?: string | null
          id?: string | null
          is_active?: boolean | null
          migrated_at?: string | null
          migration_notes?: string | null
          migration_status?: string | null
          provider?: string | null
          updated_at?: string | null
          waba_name?: string | null
        }
        Update: {
          created_at?: string | null
          default_instance?: string | null
          detected_signals?: Json | null
          display_phone?: string | null
          id?: string | null
          is_active?: boolean | null
          migrated_at?: string | null
          migration_notes?: string | null
          migration_status?: string | null
          provider?: string | null
          updated_at?: string | null
          waba_name?: string | null
        }
        Relationships: []
      }
      integration_registry: {
        Row: {
          config: Json | null
          created_at: string | null
          endpoint_url: string | null
          health_status: string | null
          id: string | null
          last_health_check: string | null
          metadata: Json | null
          name: string | null
          provider: string | null
          status: string | null
          type: string | null
          updated_at: string | null
        }
        Insert: {
          config?: Json | null
          created_at?: string | null
          endpoint_url?: string | null
          health_status?: string | null
          id?: string | null
          last_health_check?: string | null
          metadata?: Json | null
          name?: string | null
          provider?: string | null
          status?: string | null
          type?: string | null
          updated_at?: string | null
        }
        Update: {
          config?: Json | null
          created_at?: string | null
          endpoint_url?: string | null
          health_status?: string | null
          id?: string | null
          last_health_check?: string | null
          metadata?: Json | null
          name?: string | null
          provider?: string | null
          status?: string | null
          type?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      integrations: {
        Row: {
          config: Json | null
          created_at: string | null
          id: string | null
          is_active: boolean | null
          type: string | null
          updated_at: string | null
        }
        Insert: {
          config?: Json | null
          created_at?: string | null
          id?: string | null
          is_active?: boolean | null
          type?: string | null
          updated_at?: string | null
        }
        Update: {
          config?: Json | null
          created_at?: string | null
          id?: string | null
          is_active?: boolean | null
          type?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      interactions: {
        Row: {
          contact_id: string | null
          created_at: string | null
          created_by: string | null
          description: string | null
          id: string | null
          interaction_type: string | null
          metadata: Json | null
        }
        Insert: {
          contact_id?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string | null
          interaction_type?: string | null
          metadata?: Json | null
        }
        Update: {
          contact_id?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string | null
          interaction_type?: string | null
          metadata?: Json | null
        }
        Relationships: []
      }
      ip_whitelist: {
        Row: {
          added_by: string | null
          created_at: string | null
          description: string | null
          id: string | null
          ip_address: string | null
        }
        Insert: {
          added_by?: string | null
          created_at?: string | null
          description?: string | null
          id?: string | null
          ip_address?: string | null
        }
        Update: {
          added_by?: string | null
          created_at?: string | null
          description?: string | null
          id?: string | null
          ip_address?: string | null
        }
        Relationships: []
      }
      lgpd_consent_audit: {
        Row: {
          audit_timestamp: string | null
          consent_type: string | null
          contact_id: string | null
          given_at: string | null
          id: number | null
          verified_by_user_id: string | null
          withdrawn_at: string | null
        }
        Insert: {
          audit_timestamp?: string | null
          consent_type?: string | null
          contact_id?: string | null
          given_at?: string | null
          id?: number | null
          verified_by_user_id?: string | null
          withdrawn_at?: string | null
        }
        Update: {
          audit_timestamp?: string | null
          consent_type?: string | null
          contact_id?: string | null
          given_at?: string | null
          id?: number | null
          verified_by_user_id?: string | null
          withdrawn_at?: string | null
        }
        Relationships: []
      }
      lgpd_consent_audit_archive: {
        Row: {
          archived_at: string | null
          archived_batch_id: string | null
          audit_timestamp: string | null
          consent_type: string | null
          contact_id: string | null
          given_at: string | null
          id: number | null
          verified_by_user_id: string | null
          withdrawn_at: string | null
        }
        Insert: {
          archived_at?: string | null
          archived_batch_id?: string | null
          audit_timestamp?: string | null
          consent_type?: string | null
          contact_id?: string | null
          given_at?: string | null
          id?: number | null
          verified_by_user_id?: string | null
          withdrawn_at?: string | null
        }
        Update: {
          archived_at?: string | null
          archived_batch_id?: string | null
          audit_timestamp?: string | null
          consent_type?: string | null
          contact_id?: string | null
          given_at?: string | null
          id?: number | null
          verified_by_user_id?: string | null
          withdrawn_at?: string | null
        }
        Relationships: []
      }
      login_attempts: {
        Row: {
          attempt_count: number | null
          created_at: string | null
          email: string | null
          failure_reason: string | null
          id: string | null
          ip_address: string | null
          last_attempt_at: string | null
          locked_until: string | null
          success: boolean | null
          updated_at: string | null
          user_agent: string | null
        }
        Insert: {
          attempt_count?: number | null
          created_at?: string | null
          email?: string | null
          failure_reason?: string | null
          id?: string | null
          ip_address?: string | null
          last_attempt_at?: string | null
          locked_until?: string | null
          success?: boolean | null
          updated_at?: string | null
          user_agent?: string | null
        }
        Update: {
          attempt_count?: number | null
          created_at?: string | null
          email?: string | null
          failure_reason?: string | null
          id?: string | null
          ip_address?: string | null
          last_attempt_at?: string | null
          locked_until?: string | null
          success?: boolean | null
          updated_at?: string | null
          user_agent?: string | null
        }
        Relationships: []
      }
      media_cache: {
        Row: {
          accessed_at: string | null
          created_at: string | null
          file_hash: string | null
          mime_type: string | null
          size: number | null
          storage_path: string | null
        }
        Insert: {
          accessed_at?: string | null
          created_at?: string | null
          file_hash?: string | null
          mime_type?: string | null
          size?: number | null
          storage_path?: string | null
        }
        Update: {
          accessed_at?: string | null
          created_at?: string | null
          file_hash?: string | null
          mime_type?: string | null
          size?: number | null
          storage_path?: string | null
        }
        Relationships: []
      }
      media_download_queue: {
        Row: {
          created_at: string | null
          direct_path: string | null
          download_url: string | null
          error_message: string | null
          file_length: number | null
          id: number | null
          instance_name: string | null
          max_retries: number | null
          media_key: string | null
          media_type: string | null
          message_id: string | null
          message_uuid: string | null
          mimetype: string | null
          priority: number | null
          processed_at: string | null
          remote_jid: string | null
          retry_count: number | null
          scan_result: string | null
          scan_status: string | null
          scanned_at: string | null
          status: string | null
          storage_path: string | null
        }
        Insert: {
          created_at?: string | null
          direct_path?: string | null
          download_url?: string | null
          error_message?: string | null
          file_length?: number | null
          id?: number | null
          instance_name?: string | null
          max_retries?: number | null
          media_key?: string | null
          media_type?: string | null
          message_id?: string | null
          message_uuid?: string | null
          mimetype?: string | null
          priority?: number | null
          processed_at?: string | null
          remote_jid?: string | null
          retry_count?: number | null
          scan_result?: string | null
          scan_status?: string | null
          scanned_at?: string | null
          status?: string | null
          storage_path?: string | null
        }
        Update: {
          created_at?: string | null
          direct_path?: string | null
          download_url?: string | null
          error_message?: string | null
          file_length?: number | null
          id?: number | null
          instance_name?: string | null
          max_retries?: number | null
          media_key?: string | null
          media_type?: string | null
          message_id?: string | null
          message_uuid?: string | null
          mimetype?: string | null
          priority?: number | null
          processed_at?: string | null
          remote_jid?: string | null
          retry_count?: number | null
          scan_result?: string | null
          scan_status?: string | null
          scanned_at?: string | null
          status?: string | null
          storage_path?: string | null
        }
        Relationships: []
      }
      media_quarantine: {
        Row: {
          block_reason: string | null
          contact_id: string | null
          created_at: string | null
          file_size_bytes: number | null
          id: string | null
          instance_name: string | null
          media_meta: Json | null
          message_id: string | null
          original_extension: string | null
          original_mimetype: string | null
          released: boolean | null
          released_at: string | null
          remote_jid: string | null
          reviewed: boolean | null
          reviewed_at: string | null
          reviewed_by: string | null
          rule_id: string | null
          severity: string | null
        }
        Insert: {
          block_reason?: string | null
          contact_id?: string | null
          created_at?: string | null
          file_size_bytes?: number | null
          id?: string | null
          instance_name?: string | null
          media_meta?: Json | null
          message_id?: string | null
          original_extension?: string | null
          original_mimetype?: string | null
          released?: boolean | null
          released_at?: string | null
          remote_jid?: string | null
          reviewed?: boolean | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          rule_id?: string | null
          severity?: string | null
        }
        Update: {
          block_reason?: string | null
          contact_id?: string | null
          created_at?: string | null
          file_size_bytes?: number | null
          id?: string | null
          instance_name?: string | null
          media_meta?: Json | null
          message_id?: string | null
          original_extension?: string | null
          original_mimetype?: string | null
          released?: boolean | null
          released_at?: string | null
          remote_jid?: string | null
          reviewed?: boolean | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          rule_id?: string | null
          severity?: string | null
        }
        Relationships: []
      }
      media_scan_log: {
        Row: {
          details: string | null
          id: string | null
          instance_name: string | null
          message_id: string | null
          scan_duration_ms: number | null
          scan_result: string | null
          scan_type: string | null
          scanned_at: string | null
        }
        Insert: {
          details?: string | null
          id?: string | null
          instance_name?: string | null
          message_id?: string | null
          scan_duration_ms?: number | null
          scan_result?: string | null
          scan_type?: string | null
          scanned_at?: string | null
        }
        Update: {
          details?: string | null
          id?: string | null
          instance_name?: string | null
          message_id?: string | null
          scan_duration_ms?: number | null
          scan_result?: string | null
          scan_type?: string | null
          scanned_at?: string | null
        }
        Relationships: []
      }
      media_security_alerts: {
        Row: {
          acknowledged: boolean | null
          acknowledged_at: string | null
          acknowledged_by: string | null
          alert_type: string | null
          created_at: string | null
          details: Json | null
          id: string | null
          instance_name: string | null
          message_id: string | null
          severity: string | null
          title: string | null
        }
        Insert: {
          acknowledged?: boolean | null
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          alert_type?: string | null
          created_at?: string | null
          details?: Json | null
          id?: string | null
          instance_name?: string | null
          message_id?: string | null
          severity?: string | null
          title?: string | null
        }
        Update: {
          acknowledged?: boolean | null
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          alert_type?: string | null
          created_at?: string | null
          details?: Json | null
          id?: string | null
          instance_name?: string | null
          message_id?: string | null
          severity?: string | null
          title?: string | null
        }
        Relationships: []
      }
      media_security_config: {
        Row: {
          created_at: string | null
          created_by: string | null
          description: string | null
          id: string | null
          is_active: boolean | null
          rule_type: string | null
          rule_value: string | null
          severity: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string | null
          is_active?: boolean | null
          rule_type?: string | null
          rule_value?: string | null
          severity?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string | null
          is_active?: boolean | null
          rule_type?: string | null
          rule_value?: string | null
          severity?: string | null
        }
        Relationships: []
      }
      media_storage_config: {
        Row: {
          bucket_name: string | null
          created_at: string | null
          id: string | null
          is_active: boolean | null
          lifecycle_days_audios: number | null
          lifecycle_days_documents: number | null
          lifecycle_days_images: number | null
          lifecycle_days_stickers: number | null
          lifecycle_days_videos: number | null
          path_template: string | null
          provider: string | null
          public_base_url: string | null
          region: string | null
          s3_endpoint: string | null
          updated_at: string | null
        }
        Insert: {
          bucket_name?: string | null
          created_at?: string | null
          id?: string | null
          is_active?: boolean | null
          lifecycle_days_audios?: number | null
          lifecycle_days_documents?: number | null
          lifecycle_days_images?: number | null
          lifecycle_days_stickers?: number | null
          lifecycle_days_videos?: number | null
          path_template?: string | null
          provider?: string | null
          public_base_url?: string | null
          region?: string | null
          s3_endpoint?: string | null
          updated_at?: string | null
        }
        Update: {
          bucket_name?: string | null
          created_at?: string | null
          id?: string | null
          is_active?: boolean | null
          lifecycle_days_audios?: number | null
          lifecycle_days_documents?: number | null
          lifecycle_days_images?: number | null
          lifecycle_days_stickers?: number | null
          lifecycle_days_videos?: number | null
          path_template?: string | null
          provider?: string | null
          public_base_url?: string | null
          region?: string | null
          s3_endpoint?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      message_attempts: {
        Row: {
          attempted_at: string | null
          created_at: string | null
          error: string | null
          id: string | null
          message_id: string | null
          status: string | null
        }
        Insert: {
          attempted_at?: string | null
          created_at?: string | null
          error?: string | null
          id?: string | null
          message_id?: string | null
          status?: string | null
        }
        Update: {
          attempted_at?: string | null
          created_at?: string | null
          error?: string | null
          id?: string | null
          message_id?: string | null
          status?: string | null
        }
        Relationships: []
      }
      message_audit_log: {
        Row: {
          audit_timestamp: string | null
          contact_id: string | null
          content: string | null
          deleted_at: string | null
          deleted_reason: string | null
          id: number | null
          message_id: string | null
          sender_id: string | null
        }
        Insert: {
          audit_timestamp?: string | null
          contact_id?: string | null
          content?: string | null
          deleted_at?: string | null
          deleted_reason?: string | null
          id?: number | null
          message_id?: string | null
          sender_id?: string | null
        }
        Update: {
          audit_timestamp?: string | null
          contact_id?: string | null
          content?: string | null
          deleted_at?: string | null
          deleted_reason?: string | null
          id?: number | null
          message_id?: string | null
          sender_id?: string | null
        }
        Relationships: []
      }
      message_queue: {
        Row: {
          attempts: number | null
          content: string | null
          created_at: string | null
          id: string | null
          instance_name: string | null
          media_url: string | null
          message_type: string | null
          priority: number | null
          remote_jid: string | null
          scheduled_for: string | null
          status: string | null
        }
        Insert: {
          attempts?: number | null
          content?: string | null
          created_at?: string | null
          id?: string | null
          instance_name?: string | null
          media_url?: string | null
          message_type?: string | null
          priority?: number | null
          remote_jid?: string | null
          scheduled_for?: string | null
          status?: string | null
        }
        Update: {
          attempts?: number | null
          content?: string | null
          created_at?: string | null
          id?: string | null
          instance_name?: string | null
          media_url?: string | null
          message_type?: string | null
          priority?: number | null
          remote_jid?: string | null
          scheduled_for?: string | null
          status?: string | null
        }
        Relationships: []
      }
      message_reactions: {
        Row: {
          contact_id: string | null
          created_at: string | null
          emoji: string | null
          id: string | null
          message_id: string | null
          user_id: string | null
        }
        Insert: {
          contact_id?: string | null
          created_at?: string | null
          emoji?: string | null
          id?: string | null
          message_id?: string | null
          user_id?: string | null
        }
        Update: {
          contact_id?: string | null
          created_at?: string | null
          emoji?: string | null
          id?: string | null
          message_id?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      message_templates: {
        Row: {
          category: string | null
          content: string | null
          created_at: string | null
          id: string | null
          is_global: boolean | null
          shortcut: string | null
          title: string | null
          updated_at: string | null
          use_count: number | null
          user_id: string | null
        }
        Insert: {
          category?: string | null
          content?: string | null
          created_at?: string | null
          id?: string | null
          is_global?: boolean | null
          shortcut?: string | null
          title?: string | null
          updated_at?: string | null
          use_count?: number | null
          user_id?: string | null
        }
        Update: {
          category?: string | null
          content?: string | null
          created_at?: string | null
          id?: string | null
          is_global?: boolean | null
          shortcut?: string | null
          title?: string | null
          updated_at?: string | null
          use_count?: number | null
          user_id?: string | null
        }
        Relationships: []
      }
      messages: {
        Row: {
          agent_id: string | null
          caption: string | null
          channel_connection_id: string | null
          channel_type: string | null
          connection_id: string | null
          contact_id: string | null
          content: string | null
          conversation_id: string | null
          created_at: string | null
          deleted_at: string | null
          direction: string | null
          error_code: string | null
          error_reason: string | null
          external_id: string | null
          id: string | null
          instance_name: string | null
          is_deleted: boolean | null
          is_edited: boolean | null
          is_from_me: boolean | null
          is_read: boolean | null
          latitude: number | null
          link_preview: Json | null
          longitude: number | null
          media_filename: string | null
          media_meta: Json | null
          media_mime_type: string | null
          media_mimetype: string | null
          media_size: number | null
          media_type: string | null
          media_url: string | null
          message_type: string | null
          metadata: Json | null
          push_name: string | null
          quoted_message: Json | null
          reaction: string | null
          remote_jid: string | null
          reply_to_id: string | null
          reply_to_message_id: string | null
          request_id: string | null
          retry_attempt: number | null
          retry_total: number | null
          sender: string | null
          sender_id: string | null
          status: string | null
          status_updated_at: string | null
          transcription: string | null
          transcription_status: string | null
          updated_at: string | null
          whatsapp_connection_id: string | null
          whatsapp_message_id: string | null
          whatsapp_timestamp: string | null
        }
        Relationships: []
      }
      mfa_sessions: {
        Row: {
          created_at: string | null
          expires_at: string | null
          factor_id: string | null
          id: string | null
          user_id: string | null
          verified_at: string | null
        }
        Insert: {
          created_at?: string | null
          expires_at?: string | null
          factor_id?: string | null
          id?: string | null
          user_id?: string | null
          verified_at?: string | null
        }
        Update: {
          created_at?: string | null
          expires_at?: string | null
          factor_id?: string | null
          id?: string | null
          user_id?: string | null
          verified_at?: string | null
        }
        Relationships: []
      }
      mv_conversations_summary: {
        Row: {
          contatos_unicos: number | null
          dia: string | null
          instance_name: string | null
          status: string | null
          total_conversas: number | null
        }
        Relationships: []
      }
      mv_daily_metrics: {
        Row: {
          audios: number | null
          day: string | null
          documents: number | null
          images: number | null
          inbound: number | null
          instance_name: string | null
          outbound: number | null
          stickers: number | null
          total_messages: number | null
          unique_contacts: number | null
          unique_conversations: number | null
          videos: number | null
        }
        Relationships: []
      }
      mv_instance_metrics: {
        Row: {
          active_contacts_24h: number | null
          first_message_at: string | null
          instance_name: string | null
          last_message_at: string | null
          msgs_24h: number | null
          msgs_7d: number | null
          received: number | null
          sent: number | null
          total_messages: number | null
          unique_contacts: number | null
        }
        Relationships: []
      }
      mv_system_status: {
        Row: {
          active_cards: number | null
          active_connections: number | null
          active_deals: number | null
          cron_jobs: number | null
          db_size: string | null
          db_size_bytes: number | null
          healthy_integrations: number | null
          messages_24h: number | null
          open_conversations: number | null
          pipeline_value: number | null
          production_agents: number | null
          snapshot_at: string | null
          total_agents: number | null
          total_contacts: number | null
          total_flows: number | null
          total_integrations: number | null
          total_messages: number | null
          total_tables: number | null
          triggers: number | null
        }
        Relationships: []
      }
      mv_top_stickers: {
        Row: {
          category: string | null
          created_at: string | null
          id: string | null
          image_url: string | null
          is_animated: boolean | null
          is_favorite: boolean | null
          name: string | null
          use_count: number | null
        }
        Relationships: []
      }
      ncm_skus_blacklist: {
        Row: {
          cod_produto: string | null
          criado_em: string | null
          criado_por: string | null
          motivo: string | null
        }
        Insert: {
          cod_produto?: string | null
          criado_em?: string | null
          criado_por?: string | null
          motivo?: string | null
        }
        Update: {
          cod_produto?: string | null
          criado_em?: string | null
          criado_por?: string | null
          motivo?: string | null
        }
        Relationships: []
      }
      notification_channels_config: {
        Row: {
          channel_name: string | null
          config: Json | null
          created_at: string | null
          enabled: boolean | null
          id: number | null
          min_severity: string | null
          updated_at: string | null
        }
        Insert: {
          channel_name?: string | null
          config?: Json | null
          created_at?: string | null
          enabled?: boolean | null
          id?: number | null
          min_severity?: string | null
          updated_at?: string | null
        }
        Update: {
          channel_name?: string | null
          config?: Json | null
          created_at?: string | null
          enabled?: boolean | null
          id?: number | null
          min_severity?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      notification_templates: {
        Row: {
          body_template: string | null
          channel: string | null
          created_at: string | null
          id: string | null
          is_active: boolean | null
          name: string | null
          subject: string | null
          variables: Json | null
          workspace_id: string | null
        }
        Insert: {
          body_template?: string | null
          channel?: string | null
          created_at?: string | null
          id?: string | null
          is_active?: boolean | null
          name?: string | null
          subject?: string | null
          variables?: Json | null
          workspace_id?: string | null
        }
        Update: {
          body_template?: string | null
          channel?: string | null
          created_at?: string | null
          id?: string | null
          is_active?: boolean | null
          name?: string | null
          subject?: string | null
          variables?: Json | null
          workspace_id?: string | null
        }
        Relationships: []
      }
      notifications: {
        Row: {
          action_url: string | null
          body: string | null
          created_at: string | null
          id: string | null
          is_read: boolean | null
          message: string | null
          metadata: Json | null
          read_at: string | null
          title: string | null
          type: string | null
          user_id: string | null
          workspace_id: string | null
        }
        Insert: {
          action_url?: string | null
          body?: string | null
          created_at?: string | null
          id?: string | null
          is_read?: boolean | null
          message?: string | null
          metadata?: Json | null
          read_at?: string | null
          title?: string | null
          type?: string | null
          user_id?: string | null
          workspace_id?: string | null
        }
        Update: {
          action_url?: string | null
          body?: string | null
          created_at?: string | null
          id?: string | null
          is_read?: boolean | null
          message?: string | null
          metadata?: Json | null
          read_at?: string | null
          title?: string | null
          type?: string | null
          user_id?: string | null
          workspace_id?: string | null
        }
        Relationships: []
      }
      number_reputation: {
        Row: {
          complaints_count: number | null
          created_at: string | null
          daily_limit: number | null
          failures_today: number | null
          health_score: number | null
          id: string | null
          last_reset_at: string | null
          messages_sent_today: number | null
          updated_at: string | null
          warmup_day: number | null
          warmup_status: string | null
          whatsapp_connection_id: string | null
        }
        Insert: {
          complaints_count?: number | null
          created_at?: string | null
          daily_limit?: number | null
          failures_today?: number | null
          health_score?: number | null
          id?: string | null
          last_reset_at?: string | null
          messages_sent_today?: number | null
          updated_at?: string | null
          warmup_day?: number | null
          warmup_status?: string | null
          whatsapp_connection_id?: string | null
        }
        Update: {
          complaints_count?: number | null
          created_at?: string | null
          daily_limit?: number | null
          failures_today?: number | null
          health_score?: number | null
          id?: string | null
          last_reset_at?: string | null
          messages_sent_today?: number | null
          updated_at?: string | null
          warmup_day?: number | null
          warmup_status?: string | null
          whatsapp_connection_id?: string | null
        }
        Relationships: []
      }
      onboarding_steps: {
        Row: {
          completed: boolean | null
          created_at: string | null
          id: string | null
          step_key: string | null
          timestamp: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          completed?: boolean | null
          created_at?: string | null
          id?: string | null
          step_key?: string | null
          timestamp?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          completed?: boolean | null
          created_at?: string | null
          id?: string | null
          step_key?: string | null
          timestamp?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      ordens_compra: {
        Row: {
          aba_origem: string | null
          alteracao_valor_status: string | null
          ano: number | null
          atualizado_em: string | null
          chave_pix: string | null
          cidade_estado: string | null
          cliente: string | null
          cnpj: string | null
          cod_produto: string | null
          comprovante: string | null
          cor: string | null
          criado_em: string | null
          data_entrega: string | null
          data_solicitacao: string | null
          data_venda: string | null
          empresa: string | null
          excluido_em: string | null
          favorecido: string | null
          fornecedor: string | null
          gravacao_fornecedor: string | null
          gravacao_valor_unid: number | null
          hash_compras: string | null
          hash_linha: string | null
          hash_update: string | null
          id: number | null
          layout: string | null
          linha_planilha: number | null
          link_produto: string | null
          mes: number | null
          ncm: string | null
          ncm_atualizado_em: string | null
          ncm_fonte: string | null
          numero_fornecedor: string | null
          obs_vendedor: string | null
          observacoes: string | null
          pagamento: string | null
          payload_raw: Json | null
          pedido: string | null
          prioridade: string | null
          produto: string | null
          qtd_compra: number | null
          qtd_enviada: number | null
          qtd_faltante: number | null
          qtd_pedido: number | null
          recibo_enviado: string | null
          restante: number | null
          sincronizado_em: string | null
          solicitante: string | null
          status: string | null
          status_envio: string | null
          status_pagamento: string | null
          tipo_gravacao: string | null
          tipo_pedido: string | null
          ultima_cotacao_id: string | null
          ultimo_envio_em: string | null
          valor_compra_aprovado: number | null
          valor_compra_total: number | null
          valor_compra_unid: number | null
          valor_vendido_unid: number | null
          vendedor: string | null
        }
        Insert: {
          aba_origem?: string | null
          alteracao_valor_status?: string | null
          ano?: number | null
          atualizado_em?: string | null
          chave_pix?: string | null
          cidade_estado?: string | null
          cliente?: string | null
          cnpj?: string | null
          cod_produto?: string | null
          comprovante?: string | null
          cor?: string | null
          criado_em?: string | null
          data_entrega?: string | null
          data_solicitacao?: string | null
          data_venda?: string | null
          empresa?: string | null
          excluido_em?: string | null
          favorecido?: string | null
          fornecedor?: string | null
          gravacao_fornecedor?: string | null
          gravacao_valor_unid?: number | null
          hash_compras?: string | null
          hash_linha?: string | null
          hash_update?: string | null
          id?: number | null
          layout?: string | null
          linha_planilha?: number | null
          link_produto?: string | null
          mes?: number | null
          ncm?: string | null
          ncm_atualizado_em?: string | null
          ncm_fonte?: string | null
          numero_fornecedor?: string | null
          obs_vendedor?: string | null
          observacoes?: string | null
          pagamento?: string | null
          payload_raw?: Json | null
          pedido?: string | null
          prioridade?: string | null
          produto?: string | null
          qtd_compra?: number | null
          qtd_enviada?: number | null
          qtd_faltante?: number | null
          qtd_pedido?: number | null
          recibo_enviado?: string | null
          restante?: number | null
          sincronizado_em?: string | null
          solicitante?: string | null
          status?: string | null
          status_envio?: string | null
          status_pagamento?: string | null
          tipo_gravacao?: string | null
          tipo_pedido?: string | null
          ultima_cotacao_id?: string | null
          ultimo_envio_em?: string | null
          valor_compra_aprovado?: number | null
          valor_compra_total?: number | null
          valor_compra_unid?: number | null
          valor_vendido_unid?: number | null
          vendedor?: string | null
        }
        Update: {
          aba_origem?: string | null
          alteracao_valor_status?: string | null
          ano?: number | null
          atualizado_em?: string | null
          chave_pix?: string | null
          cidade_estado?: string | null
          cliente?: string | null
          cnpj?: string | null
          cod_produto?: string | null
          comprovante?: string | null
          cor?: string | null
          criado_em?: string | null
          data_entrega?: string | null
          data_solicitacao?: string | null
          data_venda?: string | null
          empresa?: string | null
          excluido_em?: string | null
          favorecido?: string | null
          fornecedor?: string | null
          gravacao_fornecedor?: string | null
          gravacao_valor_unid?: number | null
          hash_compras?: string | null
          hash_linha?: string | null
          hash_update?: string | null
          id?: number | null
          layout?: string | null
          linha_planilha?: number | null
          link_produto?: string | null
          mes?: number | null
          ncm?: string | null
          ncm_atualizado_em?: string | null
          ncm_fonte?: string | null
          numero_fornecedor?: string | null
          obs_vendedor?: string | null
          observacoes?: string | null
          pagamento?: string | null
          payload_raw?: Json | null
          pedido?: string | null
          prioridade?: string | null
          produto?: string | null
          qtd_compra?: number | null
          qtd_enviada?: number | null
          qtd_faltante?: number | null
          qtd_pedido?: number | null
          recibo_enviado?: string | null
          restante?: number | null
          sincronizado_em?: string | null
          solicitante?: string | null
          status?: string | null
          status_envio?: string | null
          status_pagamento?: string | null
          tipo_gravacao?: string | null
          tipo_pedido?: string | null
          ultima_cotacao_id?: string | null
          ultimo_envio_em?: string | null
          valor_compra_aprovado?: number | null
          valor_compra_total?: number | null
          valor_compra_unid?: number | null
          valor_vendido_unid?: number | null
          vendedor?: string | null
        }
        Relationships: []
      }
      outbound_delivery_audit: {
        Row: {
          conversation_id: string | null
          created_at: string | null
          error_message: string | null
          event_type: string | null
          http_status: number | null
          id: string | null
          instance_name: string | null
          latency_ms: number | null
          message_id: string | null
          metadata: Json | null
          provider: string | null
          remote_jid: string | null
          status: string | null
        }
        Insert: {
          conversation_id?: string | null
          created_at?: string | null
          error_message?: string | null
          event_type?: string | null
          http_status?: number | null
          id?: string | null
          instance_name?: string | null
          latency_ms?: number | null
          message_id?: string | null
          metadata?: Json | null
          provider?: string | null
          remote_jid?: string | null
          status?: string | null
        }
        Update: {
          conversation_id?: string | null
          created_at?: string | null
          error_message?: string | null
          event_type?: string | null
          http_status?: number | null
          id?: string | null
          instance_name?: string | null
          latency_ms?: number | null
          message_id?: string | null
          metadata?: Json | null
          provider?: string | null
          remote_jid?: string | null
          status?: string | null
        }
        Relationships: []
      }
      outbound_message_queue: {
        Row: {
          audio_meme_id: string | null
          caption: string | null
          contact_id: string | null
          content: string | null
          created_at: string | null
          created_by: string | null
          error_message: string | null
          external_id: string | null
          failed_at: string | null
          id: string | null
          instance_name: string | null
          max_retries: number | null
          media_mime_type: string | null
          media_url: string | null
          message_type: string | null
          metadata: Json | null
          ptt: boolean | null
          remote_jid: string | null
          retry_count: number | null
          sent_at: string | null
          status: string | null
          sticker_id: string | null
          updated_at: string | null
        }
        Insert: {
          audio_meme_id?: string | null
          caption?: string | null
          contact_id?: string | null
          content?: string | null
          created_at?: string | null
          created_by?: string | null
          error_message?: string | null
          external_id?: string | null
          failed_at?: string | null
          id?: string | null
          instance_name?: string | null
          max_retries?: number | null
          media_mime_type?: string | null
          media_url?: string | null
          message_type?: string | null
          metadata?: Json | null
          ptt?: boolean | null
          remote_jid?: string | null
          retry_count?: number | null
          sent_at?: string | null
          status?: string | null
          sticker_id?: string | null
          updated_at?: string | null
        }
        Update: {
          audio_meme_id?: string | null
          caption?: string | null
          contact_id?: string | null
          content?: string | null
          created_at?: string | null
          created_by?: string | null
          error_message?: string | null
          external_id?: string | null
          failed_at?: string | null
          id?: string | null
          instance_name?: string | null
          max_retries?: number | null
          media_mime_type?: string | null
          media_url?: string | null
          message_type?: string | null
          metadata?: Json | null
          ptt?: boolean | null
          remote_jid?: string | null
          retry_count?: number | null
          sent_at?: string | null
          status?: string | null
          sticker_id?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      outbox_events: {
        Row: {
          aggregate_id: string | null
          aggregate_type: string | null
          attempts: number | null
          created_at: string | null
          dispatched_at: string | null
          event_type: string | null
          id: string | null
          idempotency_key: string | null
          last_error: string | null
          next_attempt_at: string | null
          payload: Json | null
          status: string | null
          trace_id: string | null
          updated_at: string | null
        }
        Insert: {
          aggregate_id?: string | null
          aggregate_type?: string | null
          attempts?: number | null
          created_at?: string | null
          dispatched_at?: string | null
          event_type?: string | null
          id?: string | null
          idempotency_key?: string | null
          last_error?: string | null
          next_attempt_at?: string | null
          payload?: Json | null
          status?: string | null
          trace_id?: string | null
          updated_at?: string | null
        }
        Update: {
          aggregate_id?: string | null
          aggregate_type?: string | null
          attempts?: number | null
          created_at?: string | null
          dispatched_at?: string | null
          event_type?: string | null
          id?: string | null
          idempotency_key?: string | null
          last_error?: string | null
          next_attempt_at?: string | null
          payload?: Json | null
          status?: string | null
          trace_id?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      parabens_enviados: {
        Row: {
          empresa: string | null
          enviado_em: string | null
          id: number | null
          tipo: string | null
          vendedor: string | null
        }
        Insert: {
          empresa?: string | null
          enviado_em?: string | null
          id?: number | null
          tipo?: string | null
          vendedor?: string | null
        }
        Update: {
          empresa?: string | null
          enviado_em?: string | null
          id?: number | null
          tipo?: string | null
          vendedor?: string | null
        }
        Relationships: []
      }
      passkey_credentials: {
        Row: {
          backed_up: boolean | null
          counter: number | null
          created_at: string | null
          credential_id: string | null
          device_type: string | null
          friendly_name: string | null
          id: string | null
          last_used_at: string | null
          public_key: string | null
          transports: string[] | null
          user_id: string | null
        }
        Insert: {
          backed_up?: boolean | null
          counter?: number | null
          created_at?: string | null
          credential_id?: string | null
          device_type?: string | null
          friendly_name?: string | null
          id?: string | null
          last_used_at?: string | null
          public_key?: string | null
          transports?: string[] | null
          user_id?: string | null
        }
        Update: {
          backed_up?: boolean | null
          counter?: number | null
          created_at?: string | null
          credential_id?: string | null
          device_type?: string | null
          friendly_name?: string | null
          id?: string | null
          last_used_at?: string | null
          public_key?: string | null
          transports?: string[] | null
          user_id?: string | null
        }
        Relationships: []
      }
      password_reset_requests: {
        Row: {
          created_at: string | null
          email: string | null
          id: string | null
          ip_address: string | null
          reason: string | null
          rejection_reason: string | null
          reset_token: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string | null
          token_expires_at: string | null
          updated_at: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          email?: string | null
          id?: string | null
          ip_address?: string | null
          reason?: string | null
          rejection_reason?: string | null
          reset_token?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string | null
          token_expires_at?: string | null
          updated_at?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string | null
          id?: string | null
          ip_address?: string | null
          reason?: string | null
          rejection_reason?: string | null
          reset_token?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string | null
          token_expires_at?: string | null
          updated_at?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      password_reset_tokens: {
        Row: {
          created_at: string | null
          expires_at: string | null
          id: string | null
          request_id: string | null
          token_hash: string | null
          used_at: string | null
        }
        Insert: {
          created_at?: string | null
          expires_at?: string | null
          id?: string | null
          request_id?: string | null
          token_hash?: string | null
          used_at?: string | null
        }
        Update: {
          created_at?: string | null
          expires_at?: string | null
          id?: string | null
          request_id?: string | null
          token_hash?: string | null
          used_at?: string | null
        }
        Relationships: []
      }
      perfis_usuarios: {
        Row: {
          ativo: boolean | null
          created_at: string | null
          deletado: boolean | null
          email: string | null
          id: string | null
          nome: string | null
          role: string | null
          ultimo_login: string | null
          updated_at: string | null
        }
        Insert: {
          ativo?: boolean | null
          created_at?: string | null
          deletado?: boolean | null
          email?: string | null
          id?: string | null
          nome?: string | null
          role?: string | null
          ultimo_login?: string | null
          updated_at?: string | null
        }
        Update: {
          ativo?: boolean | null
          created_at?: string | null
          deletado?: boolean | null
          email?: string | null
          id?: string | null
          nome?: string | null
          role?: string | null
          ultimo_login?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      performance_snapshots: {
        Row: {
          created_at: string | null
          dom_nodes: number | null
          dom_ready: number | null
          fcp: number | null
          id: string | null
          memory_total: number | null
          memory_used: number | null
          network_type: string | null
          overall_score: number | null
          page_load: number | null
          profile_id: string | null
          rtt: number | null
          ttfb: number | null
          user_agent: string | null
        }
        Insert: {
          created_at?: string | null
          dom_nodes?: number | null
          dom_ready?: number | null
          fcp?: number | null
          id?: string | null
          memory_total?: number | null
          memory_used?: number | null
          network_type?: string | null
          overall_score?: number | null
          page_load?: number | null
          profile_id?: string | null
          rtt?: number | null
          ttfb?: number | null
          user_agent?: string | null
        }
        Update: {
          created_at?: string | null
          dom_nodes?: number | null
          dom_ready?: number | null
          fcp?: number | null
          id?: string | null
          memory_total?: number | null
          memory_used?: number | null
          network_type?: string | null
          overall_score?: number | null
          page_load?: number | null
          profile_id?: string | null
          rtt?: number | null
          ttfb?: number | null
          user_agent?: string | null
        }
        Relationships: []
      }
      permissions: {
        Row: {
          category: string | null
          created_at: string | null
          description: string | null
          id: string | null
          is_system: boolean | null
          key: string | null
          module: string | null
          name: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string | null
          description?: string | null
          id?: string | null
          is_system?: boolean | null
          key?: string | null
          module?: string | null
          name?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string | null
          description?: string | null
          id?: string | null
          is_system?: boolean | null
          key?: string | null
          module?: string | null
          name?: string | null
        }
        Relationships: []
      }
      personal_stickers: {
        Row: {
          category: string | null
          created_at: string | null
          id: string | null
          name: string | null
          url: string | null
          user_id: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string | null
          id?: string | null
          name?: string | null
          url?: string | null
          user_id?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string | null
          id?: string | null
          name?: string | null
          url?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      pg_buffercache: {
        Row: {
          bufferid: number | null
          isdirty: boolean | null
          pinning_backends: number | null
          relblocknumber: number | null
          reldatabase: unknown
          relfilenode: unknown
          relforknumber: number | null
          reltablespace: unknown
          usagecount: number | null
        }
        Relationships: []
      }
      pii_access_log: {
        Row: {
          accessed_at: string | null
          accessed_by: string | null
          contact_id: string | null
          field: string | null
          id: string | null
          source: string | null
        }
        Insert: {
          accessed_at?: string | null
          accessed_by?: string | null
          contact_id?: string | null
          field?: string | null
          id?: string | null
          source?: string | null
        }
        Update: {
          accessed_at?: string | null
          accessed_by?: string | null
          contact_id?: string | null
          field?: string | null
          id?: string | null
          source?: string | null
        }
        Relationships: []
      }
      pinned_conversations: {
        Row: {
          contact_id: string | null
          created_at: string | null
          id: string | null
          pinned_by: string | null
          position: number | null
        }
        Insert: {
          contact_id?: string | null
          created_at?: string | null
          id?: string | null
          pinned_by?: string | null
          position?: number | null
        }
        Update: {
          contact_id?: string | null
          created_at?: string | null
          id?: string | null
          pinned_by?: string | null
          position?: number | null
        }
        Relationships: []
      }
      processed_webhook_events: {
        Row: {
          event_id: string | null
          event_type: string | null
          instance: string | null
          processed_at: string | null
        }
        Insert: {
          event_id?: string | null
          event_type?: string | null
          instance?: string | null
          processed_at?: string | null
        }
        Update: {
          event_id?: string | null
          event_type?: string | null
          instance?: string | null
          processed_at?: string | null
        }
        Relationships: []
      }
      products: {
        Row: {
          category: string | null
          created_at: string | null
          currency: string | null
          description: string | null
          id: string | null
          image_url: string | null
          is_active: boolean | null
          name: string | null
          price: number | null
          retailer_id: string | null
          sku: string | null
          stock_quantity: number | null
          updated_at: string | null
          whatsapp_connection_id: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string | null
          currency?: string | null
          description?: string | null
          id?: string | null
          image_url?: string | null
          is_active?: boolean | null
          name?: string | null
          price?: number | null
          retailer_id?: string | null
          sku?: string | null
          stock_quantity?: number | null
          updated_at?: string | null
          whatsapp_connection_id?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string | null
          currency?: string | null
          description?: string | null
          id?: string | null
          image_url?: string | null
          is_active?: boolean | null
          name?: string | null
          price?: number | null
          retailer_id?: string | null
          sku?: string | null
          stock_quantity?: number | null
          updated_at?: string | null
          whatsapp_connection_id?: string | null
        }
        Relationships: []
      }
      produtos_ncm_mapa: {
        Row: {
          atualizado_em: string | null
          cod_produto: string | null
          confianca_ia: string | null
          criado_em: string | null
          criado_por: string | null
          descricao_ncm: string | null
          fornecedor: string | null
          id: string | null
          justificativa_ia: string | null
          modelo_ia: string | null
          ncm: string | null
          nome_produto: string | null
          observacao: string | null
          origem: string | null
          validado: boolean | null
        }
        Insert: {
          atualizado_em?: string | null
          cod_produto?: string | null
          confianca_ia?: string | null
          criado_em?: string | null
          criado_por?: string | null
          descricao_ncm?: string | null
          fornecedor?: string | null
          id?: string | null
          justificativa_ia?: string | null
          modelo_ia?: string | null
          ncm?: string | null
          nome_produto?: string | null
          observacao?: string | null
          origem?: string | null
          validado?: boolean | null
        }
        Update: {
          atualizado_em?: string | null
          cod_produto?: string | null
          confianca_ia?: string | null
          criado_em?: string | null
          criado_por?: string | null
          descricao_ncm?: string | null
          fornecedor?: string | null
          id?: string | null
          justificativa_ia?: string | null
          modelo_ia?: string | null
          ncm?: string | null
          nome_produto?: string | null
          observacao?: string | null
          origem?: string | null
          validado?: boolean | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          _admin_user_id: string | null
          access_level: string | null
          avatar_url: string | null
          birthday: string | null
          can_download: boolean | null
          created_at: string | null
          department: string | null
          department_id: string | null
          email: string | null
          id: string | null
          is_active: boolean | null
          is_online: boolean | null
          job_title: string | null
          last_seen: string | null
          max_chats: number | null
          name: string | null
          nickname: string | null
          online_status: string | null
          permissions: Json | null
          phone: string | null
          role: string | null
          session_invalidated_at: string | null
          signature: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          _admin_user_id?: string | null
          access_level?: string | null
          avatar_url?: string | null
          birthday?: string | null
          can_download?: boolean | null
          created_at?: string | null
          department?: string | null
          department_id?: string | null
          email?: string | null
          id?: string | null
          is_active?: boolean | null
          is_online?: boolean | null
          job_title?: string | null
          last_seen?: string | null
          max_chats?: number | null
          name?: string | null
          nickname?: string | null
          online_status?: string | null
          permissions?: Json | null
          phone?: string | null
          role?: string | null
          session_invalidated_at?: string | null
          signature?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          _admin_user_id?: string | null
          access_level?: string | null
          avatar_url?: string | null
          birthday?: string | null
          can_download?: boolean | null
          created_at?: string | null
          department?: string | null
          department_id?: string | null
          email?: string | null
          id?: string | null
          is_active?: boolean | null
          is_online?: boolean | null
          job_title?: string | null
          last_seen?: string | null
          max_chats?: number | null
          name?: string | null
          nickname?: string | null
          online_status?: string | null
          permissions?: Json | null
          phone?: string | null
          role?: string | null
          session_invalidated_at?: string | null
          signature?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      provider_configs: {
        Row: {
          auth_token: string | null
          base_url: string | null
          config: Json | null
          created_at: string | null
          created_by: string | null
          id: string | null
          is_active: boolean | null
          last_error: string | null
          last_ping_at: string | null
          last_ping_latency_ms: number | null
          name: string | null
          priority: number | null
          provider_type: string | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          auth_token?: string | null
          base_url?: string | null
          config?: Json | null
          created_at?: string | null
          created_by?: string | null
          id?: string | null
          is_active?: boolean | null
          last_error?: string | null
          last_ping_at?: string | null
          last_ping_latency_ms?: number | null
          name?: string | null
          priority?: number | null
          provider_type?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          auth_token?: string | null
          base_url?: string | null
          config?: Json | null
          created_at?: string | null
          created_by?: string | null
          id?: string | null
          is_active?: boolean | null
          last_error?: string | null
          last_ping_at?: string | null
          last_ping_latency_ms?: number | null
          name?: string | null
          priority?: number | null
          provider_type?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      provider_message_log: {
        Row: {
          created_at: string | null
          delivered_at: string | null
          delivery_status: string | null
          direction: string | null
          duration_ms: number | null
          error_code: string | null
          error_message: string | null
          external_contact_id: string | null
          external_message_id: string | null
          http_status: number | null
          id: string | null
          idempotency_key: string | null
          instance_name: string | null
          message_id: string | null
          metadata: Json | null
          payload: Json | null
          payload_hash: string | null
          persisted_at: string | null
          provider: string | null
          received_at: string | null
          remote_jid: string | null
          request_body: Json | null
          response_body: Json | null
          routed_at: string | null
          status: string | null
          thread_id: string | null
          trace_id: string | null
        }
        Insert: {
          created_at?: string | null
          delivered_at?: string | null
          delivery_status?: string | null
          direction?: string | null
          duration_ms?: number | null
          error_code?: string | null
          error_message?: string | null
          external_contact_id?: string | null
          external_message_id?: string | null
          http_status?: number | null
          id?: string | null
          idempotency_key?: string | null
          instance_name?: string | null
          message_id?: string | null
          metadata?: Json | null
          payload?: Json | null
          payload_hash?: string | null
          persisted_at?: string | null
          provider?: string | null
          received_at?: string | null
          remote_jid?: string | null
          request_body?: Json | null
          response_body?: Json | null
          routed_at?: string | null
          status?: string | null
          thread_id?: string | null
          trace_id?: string | null
        }
        Update: {
          created_at?: string | null
          delivered_at?: string | null
          delivery_status?: string | null
          direction?: string | null
          duration_ms?: number | null
          error_code?: string | null
          error_message?: string | null
          external_contact_id?: string | null
          external_message_id?: string | null
          http_status?: number | null
          id?: string | null
          idempotency_key?: string | null
          instance_name?: string | null
          message_id?: string | null
          metadata?: Json | null
          payload?: Json | null
          payload_hash?: string | null
          persisted_at?: string | null
          provider?: string | null
          received_at?: string | null
          remote_jid?: string | null
          request_body?: Json | null
          response_body?: Json | null
          routed_at?: string | null
          status?: string | null
          thread_id?: string | null
          trace_id?: string | null
        }
        Relationships: []
      }
      provider_session_logs: {
        Row: {
          created_at: string | null
          event: string | null
          id: string | null
          latency_ms: number | null
          level: string | null
          message: string | null
          payload: Json | null
          provider_id: string | null
          session_id: string | null
        }
        Insert: {
          created_at?: string | null
          event?: string | null
          id?: string | null
          latency_ms?: number | null
          level?: string | null
          message?: string | null
          payload?: Json | null
          provider_id?: string | null
          session_id?: string | null
        }
        Update: {
          created_at?: string | null
          event?: string | null
          id?: string | null
          latency_ms?: number | null
          level?: string | null
          message?: string | null
          payload?: Json | null
          provider_id?: string | null
          session_id?: string | null
        }
        Relationships: []
      }
      provider_sessions: {
        Row: {
          channel_connection_id: string | null
          ended_at: string | null
          id: string | null
          last_heartbeat_at: string | null
          metadata: Json | null
          provider_id: string | null
          started_at: string | null
          status: string | null
          whatsapp_connection_id: string | null
        }
        Insert: {
          channel_connection_id?: string | null
          ended_at?: string | null
          id?: string | null
          last_heartbeat_at?: string | null
          metadata?: Json | null
          provider_id?: string | null
          started_at?: string | null
          status?: string | null
          whatsapp_connection_id?: string | null
        }
        Update: {
          channel_connection_id?: string | null
          ended_at?: string | null
          id?: string | null
          last_heartbeat_at?: string | null
          metadata?: Json | null
          provider_id?: string | null
          started_at?: string | null
          status?: string | null
          whatsapp_connection_id?: string | null
        }
        Relationships: []
      }
      proxy_alerts: {
        Row: {
          alert_type: string | null
          created_at: string | null
          id: string | null
          investigated_by: string | null
          is_resolved: boolean | null
          kind: string | null
          message: string | null
          proxy_id: string | null
          response_id: string | null
          severity: string | null
          ts: string | null
        }
        Insert: {
          alert_type?: string | null
          created_at?: string | null
          id?: string | null
          investigated_by?: string | null
          is_resolved?: boolean | null
          kind?: string | null
          message?: string | null
          proxy_id?: string | null
          response_id?: string | null
          severity?: string | null
          ts?: string | null
        }
        Update: {
          alert_type?: string | null
          created_at?: string | null
          id?: string | null
          investigated_by?: string | null
          is_resolved?: boolean | null
          kind?: string | null
          message?: string | null
          proxy_id?: string | null
          response_id?: string | null
          severity?: string | null
          ts?: string | null
        }
        Relationships: []
      }
      proxy_metrics: {
        Row: {
          avg_latency_ms: number | null
          id: string | null
          proxy_id: string | null
          recorded_at: string | null
          requests_blocked: number | null
          requests_total: number | null
          status: string | null
          target: string | null
          ts: string | null
        }
        Insert: {
          avg_latency_ms?: number | null
          id?: string | null
          proxy_id?: string | null
          recorded_at?: string | null
          requests_blocked?: number | null
          requests_total?: number | null
          status?: string | null
          target?: string | null
          ts?: string | null
        }
        Update: {
          avg_latency_ms?: number | null
          id?: string | null
          proxy_id?: string | null
          recorded_at?: string | null
          requests_blocked?: number | null
          requests_total?: number | null
          status?: string | null
          target?: string | null
          ts?: string | null
        }
        Relationships: []
      }
      qr_attempts: {
        Row: {
          connected_at: string | null
          connection_id: string | null
          connection_name: string | null
          created_at: string | null
          error_code: string | null
          error_message: string | null
          expired_at: string | null
          id: string | null
          instance_id: string | null
          metadata: Json | null
          requested_by: string | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          connected_at?: string | null
          connection_id?: string | null
          connection_name?: string | null
          created_at?: string | null
          error_code?: string | null
          error_message?: string | null
          expired_at?: string | null
          id?: string | null
          instance_id?: string | null
          metadata?: Json | null
          requested_by?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          connected_at?: string | null
          connection_id?: string | null
          connection_name?: string | null
          created_at?: string | null
          error_code?: string | null
          error_message?: string | null
          expired_at?: string | null
          id?: string | null
          instance_id?: string | null
          metadata?: Json | null
          requested_by?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      queue_goals: {
        Row: {
          alerts_enabled: boolean | null
          created_at: string | null
          id: string | null
          max_avg_wait_minutes: number | null
          max_messages_pending: number | null
          max_waiting_contacts: number | null
          min_assignment_rate: number | null
          queue_id: string | null
          updated_at: string | null
        }
        Insert: {
          alerts_enabled?: boolean | null
          created_at?: string | null
          id?: string | null
          max_avg_wait_minutes?: number | null
          max_messages_pending?: number | null
          max_waiting_contacts?: number | null
          min_assignment_rate?: number | null
          queue_id?: string | null
          updated_at?: string | null
        }
        Update: {
          alerts_enabled?: boolean | null
          created_at?: string | null
          id?: string | null
          max_avg_wait_minutes?: number | null
          max_messages_pending?: number | null
          max_waiting_contacts?: number | null
          min_assignment_rate?: number | null
          queue_id?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      queue_items: {
        Row: {
          attempts: number | null
          completed_at: string | null
          created_at: string | null
          error: string | null
          id: string | null
          locked_at: string | null
          locked_by: string | null
          max_attempts: number | null
          payload: Json | null
          priority: number | null
          queue_id: string | null
          status: string | null
        }
        Insert: {
          attempts?: number | null
          completed_at?: string | null
          created_at?: string | null
          error?: string | null
          id?: string | null
          locked_at?: string | null
          locked_by?: string | null
          max_attempts?: number | null
          payload?: Json | null
          priority?: number | null
          queue_id?: string | null
          status?: string | null
        }
        Update: {
          attempts?: number | null
          completed_at?: string | null
          created_at?: string | null
          error?: string | null
          id?: string | null
          locked_at?: string | null
          locked_by?: string | null
          max_attempts?: number | null
          payload?: Json | null
          priority?: number | null
          queue_id?: string | null
          status?: string | null
        }
        Relationships: []
      }
      queue_members: {
        Row: {
          created_at: string | null
          id: string | null
          is_active: boolean | null
          max_simultaneous: number | null
          profile_id: string | null
          queue_id: string | null
          role: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string | null
          is_active?: boolean | null
          max_simultaneous?: number | null
          profile_id?: string | null
          queue_id?: string | null
          role?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string | null
          is_active?: boolean | null
          max_simultaneous?: number | null
          profile_id?: string | null
          queue_id?: string | null
          role?: string | null
        }
        Relationships: []
      }
      queue_positions: {
        Row: {
          contact_id: string | null
          created_at: string | null
          entered_at: string | null
          estimated_wait_minutes: number | null
          id: string | null
          notified: boolean | null
          position: number | null
          queue_id: string | null
        }
        Insert: {
          contact_id?: string | null
          created_at?: string | null
          entered_at?: string | null
          estimated_wait_minutes?: number | null
          id?: string | null
          notified?: boolean | null
          position?: number | null
          queue_id?: string | null
        }
        Update: {
          contact_id?: string | null
          created_at?: string | null
          entered_at?: string | null
          estimated_wait_minutes?: number | null
          id?: string | null
          notified?: boolean | null
          position?: number | null
          queue_id?: string | null
        }
        Relationships: []
      }
      queue_routing_rules: {
        Row: {
          condition: Json | null
          created_at: string | null
          id: string | null
          is_active: boolean | null
          priority: number | null
          queue_id: string | null
          rule_type: string | null
        }
        Insert: {
          condition?: Json | null
          created_at?: string | null
          id?: string | null
          is_active?: boolean | null
          priority?: number | null
          queue_id?: string | null
          rule_type?: string | null
        }
        Update: {
          condition?: Json | null
          created_at?: string | null
          id?: string | null
          is_active?: boolean | null
          priority?: number | null
          queue_id?: string | null
          rule_type?: string | null
        }
        Relationships: []
      }
      queue_skill_requirements: {
        Row: {
          created_at: string | null
          id: string | null
          min_level: number | null
          queue_id: string | null
          skill_name: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string | null
          min_level?: number | null
          queue_id?: string | null
          skill_name?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string | null
          min_level?: number | null
          queue_id?: string | null
          skill_name?: string | null
        }
        Relationships: []
      }
      queues: {
        Row: {
          auto_assign: boolean | null
          auto_rebalance_enabled: boolean | null
          business_hours: Json | null
          color: string | null
          created_at: string | null
          department_id: string | null
          description: string | null
          distribution_algorithm: string | null
          icon: string | null
          id: string | null
          is_active: boolean | null
          last_assigned_at: string | null
          last_assigned_user_id: string | null
          max_capacity: number | null
          max_concurrent_per_agent: number | null
          max_per_queue_per_agent: number | null
          max_queue_size: number | null
          max_wait_seconds: number | null
          max_wait_time_minutes: number | null
          name: string | null
          overflow_queue_id: string | null
          paused_at: string | null
          paused_by: string | null
          paused_reason: string | null
          priority: number | null
          round_robin: boolean | null
          routing_weight: number | null
          sla_policy_id: string | null
          sla_priority: string | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          auto_assign?: boolean | null
          auto_rebalance_enabled?: boolean | null
          business_hours?: Json | null
          color?: string | null
          created_at?: string | null
          department_id?: string | null
          description?: string | null
          distribution_algorithm?: string | null
          icon?: string | null
          id?: string | null
          is_active?: boolean | null
          last_assigned_at?: string | null
          last_assigned_user_id?: string | null
          max_capacity?: number | null
          max_concurrent_per_agent?: number | null
          max_per_queue_per_agent?: number | null
          max_queue_size?: number | null
          max_wait_seconds?: number | null
          max_wait_time_minutes?: number | null
          name?: string | null
          overflow_queue_id?: string | null
          paused_at?: string | null
          paused_by?: string | null
          paused_reason?: string | null
          priority?: number | null
          round_robin?: boolean | null
          routing_weight?: number | null
          sla_policy_id?: string | null
          sla_priority?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          auto_assign?: boolean | null
          auto_rebalance_enabled?: boolean | null
          business_hours?: Json | null
          color?: string | null
          created_at?: string | null
          department_id?: string | null
          description?: string | null
          distribution_algorithm?: string | null
          icon?: string | null
          id?: string | null
          is_active?: boolean | null
          last_assigned_at?: string | null
          last_assigned_user_id?: string | null
          max_capacity?: number | null
          max_concurrent_per_agent?: number | null
          max_per_queue_per_agent?: number | null
          max_queue_size?: number | null
          max_wait_seconds?: number | null
          max_wait_time_minutes?: number | null
          name?: string | null
          overflow_queue_id?: string | null
          paused_at?: string | null
          paused_by?: string | null
          paused_reason?: string | null
          priority?: number | null
          round_robin?: boolean | null
          routing_weight?: number | null
          sla_policy_id?: string | null
          sla_priority?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      quick_replies: {
        Row: {
          category: string | null
          content: string | null
          created_at: string | null
          id: string | null
          is_active: boolean | null
          is_global: boolean | null
          media_type: string | null
          media_url: string | null
          owner_id: string | null
          shortcut: string | null
          title: string | null
          updated_at: string | null
          use_count: number | null
        }
        Insert: {
          category?: string | null
          content?: string | null
          created_at?: string | null
          id?: string | null
          is_active?: boolean | null
          is_global?: boolean | null
          media_type?: string | null
          media_url?: string | null
          owner_id?: string | null
          shortcut?: string | null
          title?: string | null
          updated_at?: string | null
          use_count?: number | null
        }
        Update: {
          category?: string | null
          content?: string | null
          created_at?: string | null
          id?: string | null
          is_active?: boolean | null
          is_global?: boolean | null
          media_type?: string | null
          media_url?: string | null
          owner_id?: string | null
          shortcut?: string | null
          title?: string | null
          updated_at?: string | null
          use_count?: number | null
        }
        Relationships: []
      }
      rate_limit_configs: {
        Row: {
          block_duration_minutes: number | null
          created_at: string | null
          endpoint_pattern: string | null
          id: string | null
          is_active: boolean | null
          max_requests: number | null
          name: string | null
          updated_at: string | null
          window_seconds: number | null
        }
        Insert: {
          block_duration_minutes?: number | null
          created_at?: string | null
          endpoint_pattern?: string | null
          id?: string | null
          is_active?: boolean | null
          max_requests?: number | null
          name?: string | null
          updated_at?: string | null
          window_seconds?: number | null
        }
        Update: {
          block_duration_minutes?: number | null
          created_at?: string | null
          endpoint_pattern?: string | null
          id?: string | null
          is_active?: boolean | null
          max_requests?: number | null
          name?: string | null
          updated_at?: string | null
          window_seconds?: number | null
        }
        Relationships: []
      }
      rate_limit_logs: {
        Row: {
          blocked: boolean | null
          city: string | null
          country: string | null
          created_at: string | null
          endpoint: string | null
          id: string | null
          identifier: string | null
          ip_address: string | null
          limit_name: string | null
          max_requests: number | null
          request_count: number | null
          user_agent: string | null
          user_id: string | null
          was_blocked: boolean | null
          window_ms: number | null
        }
        Insert: {
          blocked?: boolean | null
          city?: string | null
          country?: string | null
          created_at?: string | null
          endpoint?: string | null
          id?: string | null
          identifier?: string | null
          ip_address?: string | null
          limit_name?: string | null
          max_requests?: number | null
          request_count?: number | null
          user_agent?: string | null
          user_id?: string | null
          was_blocked?: boolean | null
          window_ms?: number | null
        }
        Update: {
          blocked?: boolean | null
          city?: string | null
          country?: string | null
          created_at?: string | null
          endpoint?: string | null
          id?: string | null
          identifier?: string | null
          ip_address?: string | null
          limit_name?: string | null
          max_requests?: number | null
          request_count?: number | null
          user_agent?: string | null
          user_id?: string | null
          was_blocked?: boolean | null
          window_ms?: number | null
        }
        Relationships: []
      }
      reconnection_logs: {
        Row: {
          attempt_number: number | null
          connected_at: string | null
          connection_id: string | null
          created_at: string | null
          duration_ms: number | null
          error_code: string | null
          error_message: string | null
          id: string | null
          instance_name: string | null
          metadata: Json | null
          qr_generated: boolean | null
          status: string | null
          triggered_by: string | null
        }
        Insert: {
          attempt_number?: number | null
          connected_at?: string | null
          connection_id?: string | null
          created_at?: string | null
          duration_ms?: number | null
          error_code?: string | null
          error_message?: string | null
          id?: string | null
          instance_name?: string | null
          metadata?: Json | null
          qr_generated?: boolean | null
          status?: string | null
          triggered_by?: string | null
        }
        Update: {
          attempt_number?: number | null
          connected_at?: string | null
          connection_id?: string | null
          created_at?: string | null
          duration_ms?: number | null
          error_code?: string | null
          error_message?: string | null
          id?: string | null
          instance_name?: string | null
          metadata?: Json | null
          qr_generated?: boolean | null
          status?: string | null
          triggered_by?: string | null
        }
        Relationships: []
      }
      reminders: {
        Row: {
          contact_id: string | null
          created_at: string | null
          description: string | null
          id: string | null
          is_dismissed: boolean | null
          profile_id: string | null
          remind_at: string | null
          title: string | null
        }
        Insert: {
          contact_id?: string | null
          created_at?: string | null
          description?: string | null
          id?: string | null
          is_dismissed?: boolean | null
          profile_id?: string | null
          remind_at?: string | null
          title?: string | null
        }
        Update: {
          contact_id?: string | null
          created_at?: string | null
          description?: string | null
          id?: string | null
          is_dismissed?: boolean | null
          profile_id?: string | null
          remind_at?: string | null
          title?: string | null
        }
        Relationships: []
      }
      reprocess_jobs: {
        Row: {
          action: string | null
          attempts: number | null
          created_at: string | null
          error_message: string | null
          finished_at: string | null
          id: string | null
          idempotency_key: string | null
          max_attempts: number | null
          reason: string | null
          requested_by: string | null
          result: Json | null
          scheduled_at: string | null
          started_at: string | null
          status: string | null
          target_id: string | null
          target_kind: string | null
          trace_id: string | null
          updated_at: string | null
        }
        Insert: {
          action?: string | null
          attempts?: number | null
          created_at?: string | null
          error_message?: string | null
          finished_at?: string | null
          id?: string | null
          idempotency_key?: string | null
          max_attempts?: number | null
          reason?: string | null
          requested_by?: string | null
          result?: Json | null
          scheduled_at?: string | null
          started_at?: string | null
          status?: string | null
          target_id?: string | null
          target_kind?: string | null
          trace_id?: string | null
          updated_at?: string | null
        }
        Update: {
          action?: string | null
          attempts?: number | null
          created_at?: string | null
          error_message?: string | null
          finished_at?: string | null
          id?: string | null
          idempotency_key?: string | null
          max_attempts?: number | null
          reason?: string | null
          requested_by?: string | null
          result?: Json | null
          scheduled_at?: string | null
          started_at?: string | null
          status?: string | null
          target_id?: string | null
          target_kind?: string | null
          trace_id?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      restore_test_log: {
        Row: {
          detail: string | null
          dump_file: string | null
          id: number | null
          logged_at: string | null
          metrics: Json | null
          run_id: string | null
          status: string | null
          step: string | null
        }
        Insert: {
          detail?: string | null
          dump_file?: string | null
          id?: number | null
          logged_at?: string | null
          metrics?: Json | null
          run_id?: string | null
          status?: string | null
          step?: string | null
        }
        Update: {
          detail?: string | null
          dump_file?: string | null
          id?: number | null
          logged_at?: string | null
          metrics?: Json | null
          run_id?: string | null
          status?: string | null
          step?: string | null
        }
        Relationships: []
      }
      role_permissions: {
        Row: {
          created_at: string | null
          id: string | null
          permission_id: string | null
          role: Database["public"]["Enums"]["app_role"] | null
          role_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string | null
          permission_id?: string | null
          role?: Database["public"]["Enums"]["app_role"] | null
          role_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string | null
          permission_id?: string | null
          role?: Database["public"]["Enums"]["app_role"] | null
          role_id?: string | null
        }
        Relationships: []
      }
      roles: {
        Row: {
          color: string | null
          created_at: string | null
          description: string | null
          icon: string | null
          id: string | null
          is_active: boolean | null
          is_system: boolean | null
          key: string | null
          level: number | null
          name: string | null
          updated_at: string | null
        }
        Insert: {
          color?: string | null
          created_at?: string | null
          description?: string | null
          icon?: string | null
          id?: string | null
          is_active?: boolean | null
          is_system?: boolean | null
          key?: string | null
          level?: number | null
          name?: string | null
          updated_at?: string | null
        }
        Update: {
          color?: string | null
          created_at?: string | null
          description?: string | null
          icon?: string | null
          id?: string | null
          is_active?: boolean | null
          is_system?: boolean | null
          key?: string | null
          level?: number | null
          name?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      route_permissions: {
        Row: {
          allowed_roles: string[] | null
          created_at: string | null
          description: string | null
          id: string | null
          is_system: boolean | null
          path: string | null
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          allowed_roles?: string[] | null
          created_at?: string | null
          description?: string | null
          id?: string | null
          is_system?: boolean | null
          path?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          allowed_roles?: string[] | null
          created_at?: string | null
          description?: string | null
          id?: string | null
          is_system?: boolean | null
          path?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: []
      }
      rpc_rate_limits: {
        Row: {
          call_count: number | null
          id: string | null
          identifier: string | null
          rpc_name: string | null
          window_start: string | null
        }
        Insert: {
          call_count?: number | null
          id?: string | null
          identifier?: string | null
          rpc_name?: string | null
          window_start?: string | null
        }
        Update: {
          call_count?: number | null
          id?: string | null
          identifier?: string | null
          rpc_name?: string | null
          window_start?: string | null
        }
        Relationships: []
      }
      sales_deals: {
        Row: {
          assigned_to: string | null
          contact_id: string | null
          created_at: string | null
          currency: string | null
          expected_close_date: string | null
          id: string | null
          lost_at: string | null
          lost_reason: string | null
          notes: string | null
          priority: string | null
          stage_id: string | null
          status: string | null
          tags: string[] | null
          title: string | null
          updated_at: string | null
          value: number | null
          won_at: string | null
        }
        Insert: {
          assigned_to?: string | null
          contact_id?: string | null
          created_at?: string | null
          currency?: string | null
          expected_close_date?: string | null
          id?: string | null
          lost_at?: string | null
          lost_reason?: string | null
          notes?: string | null
          priority?: string | null
          stage_id?: string | null
          status?: string | null
          tags?: string[] | null
          title?: string | null
          updated_at?: string | null
          value?: number | null
          won_at?: string | null
        }
        Update: {
          assigned_to?: string | null
          contact_id?: string | null
          created_at?: string | null
          currency?: string | null
          expected_close_date?: string | null
          id?: string | null
          lost_at?: string | null
          lost_reason?: string | null
          notes?: string | null
          priority?: string | null
          stage_id?: string | null
          status?: string | null
          tags?: string[] | null
          title?: string | null
          updated_at?: string | null
          value?: number | null
          won_at?: string | null
        }
        Relationships: []
      }
      sales_pipeline_stages: {
        Row: {
          color: string | null
          created_at: string | null
          id: string | null
          is_active: boolean | null
          name: string | null
          position: number | null
          updated_at: string | null
        }
        Insert: {
          color?: string | null
          created_at?: string | null
          id?: string | null
          is_active?: boolean | null
          name?: string | null
          position?: number | null
          updated_at?: string | null
        }
        Update: {
          color?: string | null
          created_at?: string | null
          id?: string | null
          is_active?: boolean | null
          name?: string | null
          position?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      salespeople: {
        Row: {
          created_at: string | null
          email: string | null
          id: string | null
          is_active: boolean | null
          name: string | null
          phone: string | null
          quota: number | null
          role: string | null
          team: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          email?: string | null
          id?: string | null
          is_active?: boolean | null
          name?: string | null
          phone?: string | null
          quota?: number | null
          role?: string | null
          team?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string | null
          id?: string | null
          is_active?: boolean | null
          name?: string | null
          phone?: string | null
          quota?: number | null
          role?: string | null
          team?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      saved_filters: {
        Row: {
          created_at: string | null
          entity_type: string | null
          filters: Json | null
          id: string | null
          is_default: boolean | null
          is_shared: boolean | null
          name: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          entity_type?: string | null
          filters?: Json | null
          id?: string | null
          is_default?: boolean | null
          is_shared?: boolean | null
          name?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          entity_type?: string | null
          filters?: Json | null
          id?: string | null
          is_default?: boolean | null
          is_shared?: boolean | null
          name?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      scheduled_job_log: {
        Row: {
          error_msg: string | null
          finished_at: string | null
          id: string | null
          job_name: string | null
          rows_affected: number | null
          started_at: string | null
          status: string | null
        }
        Insert: {
          error_msg?: string | null
          finished_at?: string | null
          id?: string | null
          job_name?: string | null
          rows_affected?: number | null
          started_at?: string | null
          status?: string | null
        }
        Update: {
          error_msg?: string | null
          finished_at?: string | null
          id?: string | null
          job_name?: string | null
          rows_affected?: number | null
          started_at?: string | null
          status?: string | null
        }
        Relationships: []
      }
      scheduled_messages: {
        Row: {
          contact_id: string | null
          content: string | null
          created_at: string | null
          created_by: string | null
          error_message: string | null
          id: string | null
          media_url: string | null
          message_type: string | null
          scheduled_at: string | null
          sent_at: string | null
          status: string | null
          updated_at: string | null
          whatsapp_connection_id: string | null
        }
        Insert: {
          contact_id?: string | null
          content?: string | null
          created_at?: string | null
          created_by?: string | null
          error_message?: string | null
          id?: string | null
          media_url?: string | null
          message_type?: string | null
          scheduled_at?: string | null
          sent_at?: string | null
          status?: string | null
          updated_at?: string | null
          whatsapp_connection_id?: string | null
        }
        Update: {
          contact_id?: string | null
          content?: string | null
          created_at?: string | null
          created_by?: string | null
          error_message?: string | null
          id?: string | null
          media_url?: string | null
          message_type?: string | null
          scheduled_at?: string | null
          sent_at?: string | null
          status?: string | null
          updated_at?: string | null
          whatsapp_connection_id?: string | null
        }
        Relationships: []
      }
      scheduled_report_configs: {
        Row: {
          config: Json | null
          created_at: string | null
          created_by: string | null
          frequency: string | null
          id: string | null
          is_active: boolean | null
          last_sent_at: string | null
          name: string | null
          next_send_at: string | null
          recipients: string[] | null
          report_type: string | null
          updated_at: string | null
        }
        Insert: {
          config?: Json | null
          created_at?: string | null
          created_by?: string | null
          frequency?: string | null
          id?: string | null
          is_active?: boolean | null
          last_sent_at?: string | null
          name?: string | null
          next_send_at?: string | null
          recipients?: string[] | null
          report_type?: string | null
          updated_at?: string | null
        }
        Update: {
          config?: Json | null
          created_at?: string | null
          created_by?: string | null
          frequency?: string | null
          id?: string | null
          is_active?: boolean | null
          last_sent_at?: string | null
          name?: string | null
          next_send_at?: string | null
          recipients?: string[] | null
          report_type?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      scheduled_reports: {
        Row: {
          created_at: string | null
          created_by: string | null
          format: string | null
          frequency: string | null
          id: string | null
          is_active: boolean | null
          last_sent_at: string | null
          name: string | null
          next_send_at: string | null
          recipients: string[] | null
          report_type: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          format?: string | null
          frequency?: string | null
          id?: string | null
          is_active?: boolean | null
          last_sent_at?: string | null
          name?: string | null
          next_send_at?: string | null
          recipients?: string[] | null
          report_type?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          format?: string | null
          frequency?: string | null
          id?: string | null
          is_active?: boolean | null
          last_sent_at?: string | null
          name?: string | null
          next_send_at?: string | null
          recipients?: string[] | null
          report_type?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      search_history: {
        Row: {
          created_at: string | null
          id: number | null
          query: string | null
          result_type: string | null
          timestamp: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: number | null
          query?: string | null
          result_type?: string | null
          timestamp?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: number | null
          query?: string | null
          result_type?: string | null
          timestamp?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      search_insights: {
        Row: {
          click_count: number | null
          created_at: string | null
          id: string | null
          search_count: number | null
          search_term: string | null
          updated_at: string | null
        }
        Insert: {
          click_count?: number | null
          created_at?: string | null
          id?: string | null
          search_count?: number | null
          search_term?: string | null
          updated_at?: string | null
        }
        Update: {
          click_count?: number | null
          created_at?: string | null
          id?: string | null
          search_count?: number | null
          search_term?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      security_acl_alerts: {
        Row: {
          alert_type: string | null
          details: Json | null
          detected_at: string | null
          id: number | null
          object_name: string | null
          privilege: string | null
          resolved_at: string | null
          resolved_by: string | null
          role_name: string | null
          severity: string | null
        }
        Insert: {
          alert_type?: string | null
          details?: Json | null
          detected_at?: string | null
          id?: number | null
          object_name?: string | null
          privilege?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          role_name?: string | null
          severity?: string | null
        }
        Update: {
          alert_type?: string | null
          details?: Json | null
          detected_at?: string | null
          id?: number | null
          object_name?: string | null
          privilege?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          role_name?: string | null
          severity?: string | null
        }
        Relationships: []
      }
      security_alerts: {
        Row: {
          alert_type: string | null
          created_at: string | null
          description: string | null
          id: string | null
          ip_address: string | null
          is_resolved: boolean | null
          metadata: Json | null
          resolved_at: string | null
          resolved_by: string | null
          severity: string | null
          title: string | null
          user_id: string | null
        }
        Insert: {
          alert_type?: string | null
          created_at?: string | null
          description?: string | null
          id?: string | null
          ip_address?: string | null
          is_resolved?: boolean | null
          metadata?: Json | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string | null
          title?: string | null
          user_id?: string | null
        }
        Update: {
          alert_type?: string | null
          created_at?: string | null
          description?: string | null
          id?: string | null
          ip_address?: string | null
          is_resolved?: boolean | null
          metadata?: Json | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string | null
          title?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      security_audit_logs: {
        Row: {
          action: string | null
          created_at: string | null
          details: Json | null
          event_type: string | null
          id: string | null
          ip_address: string | null
          resource: string | null
          status: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          action?: string | null
          created_at?: string | null
          details?: Json | null
          event_type?: string | null
          id?: string | null
          ip_address?: string | null
          resource?: string | null
          status?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string | null
          created_at?: string | null
          details?: Json | null
          event_type?: string | null
          id?: string | null
          ip_address?: string | null
          resource?: string | null
          status?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      security_events: {
        Row: {
          created_at: string | null
          details: Json | null
          event_type: string | null
          id: string | null
          ip_address: string | null
          severity: string | null
          user_agent: string | null
          user_id: string | null
          workspace_id: string | null
        }
        Insert: {
          created_at?: string | null
          details?: Json | null
          event_type?: string | null
          id?: string | null
          ip_address?: string | null
          severity?: string | null
          user_agent?: string | null
          user_id?: string | null
          workspace_id?: string | null
        }
        Update: {
          created_at?: string | null
          details?: Json | null
          event_type?: string | null
          id?: string | null
          ip_address?: string | null
          severity?: string | null
          user_agent?: string | null
          user_id?: string | null
          workspace_id?: string | null
        }
        Relationships: []
      }
      sentiment_alerts: {
        Row: {
          acknowledged: boolean | null
          alert_level: string | null
          contact_id: string | null
          created_at: string | null
          id: string | null
          message_id: string | null
          sentiment_score: number | null
        }
        Insert: {
          acknowledged?: boolean | null
          alert_level?: string | null
          contact_id?: string | null
          created_at?: string | null
          id?: string | null
          message_id?: string | null
          sentiment_score?: number | null
        }
        Update: {
          acknowledged?: boolean | null
          alert_level?: string | null
          contact_id?: string | null
          created_at?: string | null
          id?: string | null
          message_id?: string | null
          sentiment_score?: number | null
        }
        Relationships: []
      }
      service_channels: {
        Row: {
          channel_type: string | null
          color: string | null
          config: Json | null
          created_at: string | null
          created_by: string | null
          default_queue_id: string | null
          description: string | null
          disabled_at: string | null
          disabled_reason: string | null
          display_name: string | null
          icon: string | null
          id: string | null
          is_active: boolean | null
          is_default: boolean | null
          metadata: Json | null
          name: string | null
          paused_at: string | null
          paused_reason: string | null
          routing_mode: string | null
          status: string | null
          sticky_enabled: boolean | null
          sticky_ttl_hours: number | null
          updated_at: string | null
          whatsapp_connection_id: string | null
        }
        Insert: {
          channel_type?: string | null
          color?: string | null
          config?: Json | null
          created_at?: string | null
          created_by?: string | null
          default_queue_id?: string | null
          description?: string | null
          disabled_at?: string | null
          disabled_reason?: string | null
          display_name?: string | null
          icon?: string | null
          id?: string | null
          is_active?: boolean | null
          is_default?: boolean | null
          metadata?: Json | null
          name?: string | null
          paused_at?: string | null
          paused_reason?: string | null
          routing_mode?: string | null
          status?: string | null
          sticky_enabled?: boolean | null
          sticky_ttl_hours?: number | null
          updated_at?: string | null
          whatsapp_connection_id?: string | null
        }
        Update: {
          channel_type?: string | null
          color?: string | null
          config?: Json | null
          created_at?: string | null
          created_by?: string | null
          default_queue_id?: string | null
          description?: string | null
          disabled_at?: string | null
          disabled_reason?: string | null
          display_name?: string | null
          icon?: string | null
          id?: string | null
          is_active?: boolean | null
          is_default?: boolean | null
          metadata?: Json | null
          name?: string | null
          paused_at?: string | null
          paused_reason?: string | null
          routing_mode?: string | null
          status?: string | null
          sticky_enabled?: boolean | null
          sticky_ttl_hours?: number | null
          updated_at?: string | null
          whatsapp_connection_id?: string | null
        }
        Relationships: []
      }
      sessions: {
        Row: {
          agent_id: string | null
          ended_at: string | null
          id: string | null
          metadata: Json | null
          started_at: string | null
          status: string | null
          user_id: string | null
        }
        Insert: {
          agent_id?: string | null
          ended_at?: string | null
          id?: string | null
          metadata?: Json | null
          started_at?: string | null
          status?: string | null
          user_id?: string | null
        }
        Update: {
          agent_id?: string | null
          ended_at?: string | null
          id?: string | null
          metadata?: Json | null
          started_at?: string | null
          status?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      sicoob_contact_mapping: {
        Row: {
          contact_id: string | null
          created_at: string | null
          id: string | null
          sicoob_singular_id: string | null
          sicoob_user_id: string | null
          sicoob_vendedor_id: string | null
          zappweb_agent_id: string | null
        }
        Insert: {
          contact_id?: string | null
          created_at?: string | null
          id?: string | null
          sicoob_singular_id?: string | null
          sicoob_user_id?: string | null
          sicoob_vendedor_id?: string | null
          zappweb_agent_id?: string | null
        }
        Update: {
          contact_id?: string | null
          created_at?: string | null
          id?: string | null
          sicoob_singular_id?: string | null
          sicoob_user_id?: string | null
          sicoob_vendedor_id?: string | null
          zappweb_agent_id?: string | null
        }
        Relationships: []
      }
      sicoob_reply_outbox: {
        Row: {
          agent_id: string | null
          attempts: number | null
          contact_id: string | null
          content: string | null
          created_at: string | null
          id: string | null
          last_error: string | null
          message_id: string | null
          next_attempt_at: string | null
          processed_at: string | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          agent_id?: string | null
          attempts?: number | null
          contact_id?: string | null
          content?: string | null
          created_at?: string | null
          id?: string | null
          last_error?: string | null
          message_id?: string | null
          next_attempt_at?: string | null
          processed_at?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          agent_id?: string | null
          attempts?: number | null
          contact_id?: string | null
          content?: string | null
          created_at?: string | null
          id?: string | null
          last_error?: string | null
          message_id?: string | null
          next_attempt_at?: string | null
          processed_at?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      sla_alert_preferences: {
        Row: {
          alert_first_response: boolean | null
          alert_resolution: boolean | null
          created_at: string | null
          enabled: boolean | null
          id: string | null
          severity_breached: boolean | null
          severity_warning: boolean | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          alert_first_response?: boolean | null
          alert_resolution?: boolean | null
          created_at?: string | null
          enabled?: boolean | null
          id?: string | null
          severity_breached?: boolean | null
          severity_warning?: boolean | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          alert_first_response?: boolean | null
          alert_resolution?: boolean | null
          created_at?: string | null
          enabled?: boolean | null
          id?: string | null
          severity_breached?: boolean | null
          severity_warning?: boolean | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      sla_configurations: {
        Row: {
          created_at: string | null
          first_response_minutes: number | null
          id: string | null
          is_active: boolean | null
          is_default: boolean | null
          name: string | null
          priority: string | null
          resolution_minutes: number | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          first_response_minutes?: number | null
          id?: string | null
          is_active?: boolean | null
          is_default?: boolean | null
          name?: string | null
          priority?: string | null
          resolution_minutes?: number | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          first_response_minutes?: number | null
          id?: string | null
          is_active?: boolean | null
          is_default?: boolean | null
          name?: string | null
          priority?: string | null
          resolution_minutes?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      sla_delivery_rules: {
        Row: {
          applies_to: string | null
          breach_threshold_minutes: number | null
          contact_id: string | null
          created_at: string | null
          custom_message: string | null
          id: string | null
          is_active: boolean | null
          name: string | null
          updated_at: string | null
          warning_threshold_minutes: number | null
        }
        Insert: {
          applies_to?: string | null
          breach_threshold_minutes?: number | null
          contact_id?: string | null
          created_at?: string | null
          custom_message?: string | null
          id?: string | null
          is_active?: boolean | null
          name?: string | null
          updated_at?: string | null
          warning_threshold_minutes?: number | null
        }
        Update: {
          applies_to?: string | null
          breach_threshold_minutes?: number | null
          contact_id?: string | null
          created_at?: string | null
          custom_message?: string | null
          id?: string | null
          is_active?: boolean | null
          name?: string | null
          updated_at?: string | null
          warning_threshold_minutes?: number | null
        }
        Relationships: []
      }
      sla_delivery_violations: {
        Row: {
          contact_id: string | null
          detected_at: string | null
          id: string | null
          is_resolved: boolean | null
          message_id: string | null
          metadata: Json | null
          resolution_notes: string | null
          resolved_at: string | null
          resolved_by: string | null
          rule_id: string | null
          threshold_type: string | null
        }
        Insert: {
          contact_id?: string | null
          detected_at?: string | null
          id?: string | null
          is_resolved?: boolean | null
          message_id?: string | null
          metadata?: Json | null
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          rule_id?: string | null
          threshold_type?: string | null
        }
        Update: {
          contact_id?: string | null
          detected_at?: string | null
          id?: string | null
          is_resolved?: boolean | null
          message_id?: string | null
          metadata?: Json | null
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          rule_id?: string | null
          threshold_type?: string | null
        }
        Relationships: []
      }
      sla_history: {
        Row: {
          alert_time: string | null
          breach_minutes: number | null
          breach_type: string | null
          created_at: string | null
          id: string | null
          is_resolved: boolean | null
          metadata: Json | null
          resolved_at: string | null
          resolved_by: string | null
          sla_config_id: string | null
          status: string | null
          thread_id: string | null
        }
        Insert: {
          alert_time?: string | null
          breach_minutes?: number | null
          breach_type?: string | null
          created_at?: string | null
          id?: string | null
          is_resolved?: boolean | null
          metadata?: Json | null
          resolved_at?: string | null
          resolved_by?: string | null
          sla_config_id?: string | null
          status?: string | null
          thread_id?: string | null
        }
        Update: {
          alert_time?: string | null
          breach_minutes?: number | null
          breach_type?: string | null
          created_at?: string | null
          id?: string | null
          is_resolved?: boolean | null
          metadata?: Json | null
          resolved_at?: string | null
          resolved_by?: string | null
          sla_config_id?: string | null
          status?: string | null
          thread_id?: string | null
        }
        Relationships: []
      }
      sla_policies: {
        Row: {
          applies_to_queues: string[] | null
          business_hours_only: boolean | null
          created_at: string | null
          critical_threshold_pct: number | null
          description: string | null
          first_response_minutes: number | null
          id: string | null
          is_active: boolean | null
          name: string | null
          priority: number | null
          resolution_minutes: number | null
          updated_at: string | null
          warning_threshold_pct: number | null
        }
        Insert: {
          applies_to_queues?: string[] | null
          business_hours_only?: boolean | null
          created_at?: string | null
          critical_threshold_pct?: number | null
          description?: string | null
          first_response_minutes?: number | null
          id?: string | null
          is_active?: boolean | null
          name?: string | null
          priority?: number | null
          resolution_minutes?: number | null
          updated_at?: string | null
          warning_threshold_pct?: number | null
        }
        Update: {
          applies_to_queues?: string[] | null
          business_hours_only?: boolean | null
          created_at?: string | null
          critical_threshold_pct?: number | null
          description?: string | null
          first_response_minutes?: number | null
          id?: string | null
          is_active?: boolean | null
          name?: string | null
          priority?: number | null
          resolution_minutes?: number | null
          updated_at?: string | null
          warning_threshold_pct?: number | null
        }
        Relationships: []
      }
      sla_rules: {
        Row: {
          agent_id: string | null
          company: string | null
          contact_id: string | null
          contact_type: string | null
          created_at: string | null
          first_response_minutes: number | null
          id: string | null
          is_active: boolean | null
          job_title: string | null
          metadata: Json | null
          name: string | null
          priority: number | null
          queue_id: string | null
          resolution_minutes: number | null
          updated_at: string | null
        }
        Insert: {
          agent_id?: string | null
          company?: string | null
          contact_id?: string | null
          contact_type?: string | null
          created_at?: string | null
          first_response_minutes?: number | null
          id?: string | null
          is_active?: boolean | null
          job_title?: string | null
          metadata?: Json | null
          name?: string | null
          priority?: number | null
          queue_id?: string | null
          resolution_minutes?: number | null
          updated_at?: string | null
        }
        Update: {
          agent_id?: string | null
          company?: string | null
          contact_id?: string | null
          contact_type?: string | null
          created_at?: string | null
          first_response_minutes?: number | null
          id?: string | null
          is_active?: boolean | null
          job_title?: string | null
          metadata?: Json | null
          name?: string | null
          priority?: number | null
          queue_id?: string | null
          resolution_minutes?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      sla_violations: {
        Row: {
          actual_minutes: number | null
          agent_id: string | null
          contact_id: string | null
          conversation_id: string | null
          created_at: string | null
          expected_minutes: number | null
          id: string | null
          resolved_at: string | null
          severity: string | null
          sla_policy_id: string | null
          violation_type: string | null
        }
        Insert: {
          actual_minutes?: number | null
          agent_id?: string | null
          contact_id?: string | null
          conversation_id?: string | null
          created_at?: string | null
          expected_minutes?: number | null
          id?: string | null
          resolved_at?: string | null
          severity?: string | null
          sla_policy_id?: string | null
          violation_type?: string | null
        }
        Update: {
          actual_minutes?: number | null
          agent_id?: string | null
          contact_id?: string | null
          conversation_id?: string | null
          created_at?: string | null
          expected_minutes?: number | null
          id?: string | null
          resolved_at?: string | null
          severity?: string | null
          sla_policy_id?: string | null
          violation_type?: string | null
        }
        Relationships: []
      }
      solicitacoes_vale: {
        Row: {
          criado_em: string | null
          disparado_em: string | null
          id: number | null
          id_bitrix: number | null
          id_card_bitrix: number | null
          lembretes: number | null
          periodo: string | null
          respondido_em: string | null
          status: string | null
          valor: number | null
        }
        Insert: {
          criado_em?: string | null
          disparado_em?: string | null
          id?: number | null
          id_bitrix?: number | null
          id_card_bitrix?: number | null
          lembretes?: number | null
          periodo?: string | null
          respondido_em?: string | null
          status?: string | null
          valor?: number | null
        }
        Update: {
          criado_em?: string | null
          disparado_em?: string | null
          id?: number | null
          id_bitrix?: number | null
          id_card_bitrix?: number | null
          lembretes?: number | null
          periodo?: string | null
          respondido_em?: string | null
          status?: string | null
          valor?: number | null
        }
        Relationships: []
      }
      sticker_categories: {
        Row: {
          emoji: string | null
          id: string | null
          is_active: boolean | null
          label_en: string | null
          label_pt: string | null
          slug: string | null
          sort_order: number | null
          sticker_count: number | null
          total_uses: number | null
        }
        Insert: {
          emoji?: string | null
          id?: string | null
          is_active?: boolean | null
          label_en?: string | null
          label_pt?: string | null
          slug?: string | null
          sort_order?: number | null
          sticker_count?: number | null
          total_uses?: number | null
        }
        Update: {
          emoji?: string | null
          id?: string | null
          is_active?: boolean | null
          label_en?: string | null
          label_pt?: string | null
          slug?: string | null
          sort_order?: number | null
          sticker_count?: number | null
          total_uses?: number | null
        }
        Relationships: []
      }
      sticker_favorites: {
        Row: {
          created_at: string | null
          id: string | null
          sticker_id: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string | null
          sticker_id?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string | null
          sticker_id?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      stickers: {
        Row: {
          category: string | null
          created_at: string | null
          file_hash: string | null
          file_size: number | null
          height: number | null
          id: string | null
          image_url: string | null
          is_active: boolean | null
          is_animated: boolean | null
          is_favorite: boolean | null
          mime_type: string | null
          name: string | null
          owner_id: string | null
          tags: string[] | null
          updated_at: string | null
          uploaded_by: string | null
          use_count: number | null
          width: number | null
        }
        Insert: {
          category?: string | null
          created_at?: string | null
          file_hash?: string | null
          file_size?: number | null
          height?: number | null
          id?: string | null
          image_url?: string | null
          is_active?: boolean | null
          is_animated?: boolean | null
          is_favorite?: boolean | null
          mime_type?: string | null
          name?: string | null
          owner_id?: string | null
          tags?: string[] | null
          updated_at?: string | null
          uploaded_by?: string | null
          use_count?: number | null
          width?: number | null
        }
        Update: {
          category?: string | null
          created_at?: string | null
          file_hash?: string | null
          file_size?: number | null
          height?: number | null
          id?: string | null
          image_url?: string | null
          is_active?: boolean | null
          is_animated?: boolean | null
          is_favorite?: boolean | null
          mime_type?: string | null
          name?: string | null
          owner_id?: string | null
          tags?: string[] | null
          updated_at?: string | null
          uploaded_by?: string | null
          use_count?: number | null
          width?: number | null
        }
        Relationships: []
      }
      sticky_assignments: {
        Row: {
          agent_profile_id: string | null
          channel_connection_id: string | null
          contact_id: string | null
          created_at: string | null
          expires_at: string | null
          id: string | null
          last_assigned_at: string | null
          queue_id: string | null
        }
        Insert: {
          agent_profile_id?: string | null
          channel_connection_id?: string | null
          contact_id?: string | null
          created_at?: string | null
          expires_at?: string | null
          id?: string | null
          last_assigned_at?: string | null
          queue_id?: string | null
        }
        Update: {
          agent_profile_id?: string | null
          channel_connection_id?: string | null
          contact_id?: string | null
          created_at?: string | null
          expires_at?: string | null
          id?: string | null
          last_assigned_at?: string | null
          queue_id?: string | null
        }
        Relationships: []
      }
      storage_cleanup_logs: {
        Row: {
          bucket_id: string | null
          created_at: string | null
          files_deleted: number | null
          id: string | null
          status: string | null
          total_size_bytes: number | null
        }
        Insert: {
          bucket_id?: string | null
          created_at?: string | null
          files_deleted?: number | null
          id?: string | null
          status?: string | null
          total_size_bytes?: number | null
        }
        Update: {
          bucket_id?: string | null
          created_at?: string | null
          files_deleted?: number | null
          id?: string | null
          status?: string | null
          total_size_bytes?: number | null
        }
        Relationships: []
      }
      stress_test_metrics: {
        Row: {
          created_at: string | null
          error_msg: string | null
          id: string | null
          latency_ms: number | null
          run_id: string | null
          status: string | null
          task_type: string | null
        }
        Insert: {
          created_at?: string | null
          error_msg?: string | null
          id?: string | null
          latency_ms?: number | null
          run_id?: string | null
          status?: string | null
          task_type?: string | null
        }
        Update: {
          created_at?: string | null
          error_msg?: string | null
          id?: string | null
          latency_ms?: number | null
          run_id?: string | null
          status?: string | null
          task_type?: string | null
        }
        Relationships: []
      }
      stress_test_runs: {
        Row: {
          abort_reason: string | null
          ended_at: string | null
          id: string | null
          instance_name: string | null
          results: Json | null
          started_at: string | null
          started_by: string | null
          status: string | null
          target_phone: string | null
          total_failed: number | null
          total_planned: number | null
          total_sent: number | null
        }
        Insert: {
          abort_reason?: string | null
          ended_at?: string | null
          id?: string | null
          instance_name?: string | null
          results?: Json | null
          started_at?: string | null
          started_by?: string | null
          status?: string | null
          target_phone?: string | null
          total_failed?: number | null
          total_planned?: number | null
          total_sent?: number | null
        }
        Update: {
          abort_reason?: string | null
          ended_at?: string | null
          id?: string | null
          instance_name?: string | null
          results?: Json | null
          started_at?: string | null
          started_by?: string | null
          status?: string | null
          target_phone?: string | null
          total_failed?: number | null
          total_planned?: number | null
          total_sent?: number | null
        }
        Relationships: []
      }
      sts_performance_metrics: {
        Row: {
          id: string | null
          measured_at: string | null
          metadata: Json | null
          metric_name: string | null
          metric_value: number | null
          passed: boolean | null
          run_id: string | null
          test_suite: string | null
          threshold: number | null
          unit: string | null
        }
        Insert: {
          id?: string | null
          measured_at?: string | null
          metadata?: Json | null
          metric_name?: string | null
          metric_value?: number | null
          passed?: boolean | null
          run_id?: string | null
          test_suite?: string | null
          threshold?: number | null
          unit?: string | null
        }
        Update: {
          id?: string | null
          measured_at?: string | null
          metadata?: Json | null
          metric_name?: string | null
          metric_value?: number | null
          passed?: boolean | null
          run_id?: string | null
          test_suite?: string | null
          threshold?: number | null
          unit?: string | null
        }
        Relationships: []
      }
      sts_telemetry: {
        Row: {
          created_at: string | null
          error_type: string | null
          id: string | null
          input_size_bytes: number | null
          metadata: Json | null
          response_time_ms: number | null
          status_code: number | null
          task_id: string | null
        }
        Insert: {
          created_at?: string | null
          error_type?: string | null
          id?: string | null
          input_size_bytes?: number | null
          metadata?: Json | null
          response_time_ms?: number | null
          status_code?: number | null
          task_id?: string | null
        }
        Update: {
          created_at?: string | null
          error_type?: string | null
          id?: string | null
          input_size_bytes?: number | null
          metadata?: Json | null
          response_time_ms?: number | null
          status_code?: number | null
          task_id?: string | null
        }
        Relationships: []
      }
      sts_troubleshooting_report: {
        Row: {
          category: string | null
          completed_at: string | null
          created_at: string | null
          description: string | null
          details: Json | null
          duration_ms: number | null
          error_message: string | null
          id: string | null
          started_at: string | null
          status: string | null
          test_name: string | null
        }
        Insert: {
          category?: string | null
          completed_at?: string | null
          created_at?: string | null
          description?: string | null
          details?: Json | null
          duration_ms?: number | null
          error_message?: string | null
          id?: string | null
          started_at?: string | null
          status?: string | null
          test_name?: string | null
        }
        Update: {
          category?: string | null
          completed_at?: string | null
          created_at?: string | null
          description?: string | null
          details?: Json | null
          duration_ms?: number | null
          error_message?: string | null
          id?: string | null
          started_at?: string | null
          status?: string | null
          test_name?: string | null
        }
        Relationships: []
      }
      supabase_projects: {
        Row: {
          config: Json | null
          created_at: string | null
          description: string | null
          health_status: string | null
          id: string | null
          last_health_check: string | null
          main_tables: Json | null
          project_name: string | null
          project_slug: string | null
          purpose: string | null
          size_mb: number | null
          status: string | null
          tables_count: number | null
          updated_at: string | null
        }
        Insert: {
          config?: Json | null
          created_at?: string | null
          description?: string | null
          health_status?: string | null
          id?: string | null
          last_health_check?: string | null
          main_tables?: Json | null
          project_name?: string | null
          project_slug?: string | null
          purpose?: string | null
          size_mb?: number | null
          status?: string | null
          tables_count?: number | null
          updated_at?: string | null
        }
        Update: {
          config?: Json | null
          created_at?: string | null
          description?: string | null
          health_status?: string | null
          id?: string | null
          last_health_check?: string | null
          main_tables?: Json | null
          project_name?: string | null
          project_slug?: string | null
          purpose?: string | null
          size_mb?: number | null
          status?: string | null
          tables_count?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      supplier_pix_keys: {
        Row: {
          bitrix_card_id: number | null
          bitrix_company_id: string | null
          bitrix_company_name: string | null
          bitrix_validation_task_id: string | null
          created_at: string | null
          first_seen_at: string | null
          id: string | null
          last_payment_amount: number | null
          last_payment_at: string | null
          pix_key: string | null
          pix_key_type: string | null
          status: string | null
          total_payments_count: number | null
          updated_at: string | null
          validated_by_purchasing: string | null
          validation_notes: string | null
        }
        Insert: {
          bitrix_card_id?: number | null
          bitrix_company_id?: string | null
          bitrix_company_name?: string | null
          bitrix_validation_task_id?: string | null
          created_at?: string | null
          first_seen_at?: string | null
          id?: string | null
          last_payment_amount?: number | null
          last_payment_at?: string | null
          pix_key?: string | null
          pix_key_type?: string | null
          status?: string | null
          total_payments_count?: number | null
          updated_at?: string | null
          validated_by_purchasing?: string | null
          validation_notes?: string | null
        }
        Update: {
          bitrix_card_id?: number | null
          bitrix_company_id?: string | null
          bitrix_company_name?: string | null
          bitrix_validation_task_id?: string | null
          created_at?: string | null
          first_seen_at?: string | null
          id?: string | null
          last_payment_amount?: number | null
          last_payment_at?: string | null
          pix_key?: string | null
          pix_key_type?: string | null
          status?: string | null
          total_payments_count?: number | null
          updated_at?: string | null
          validated_by_purchasing?: string | null
          validation_notes?: string | null
        }
        Relationships: []
      }
      system_connections: {
        Row: {
          config: Json | null
          created_at: string | null
          created_by: string | null
          id: string | null
          is_active: boolean | null
          name: string | null
          provider: string | null
          updated_at: string | null
        }
        Insert: {
          config?: Json | null
          created_at?: string | null
          created_by?: string | null
          id?: string | null
          is_active?: boolean | null
          name?: string | null
          provider?: string | null
          updated_at?: string | null
        }
        Update: {
          config?: Json | null
          created_at?: string | null
          created_by?: string | null
          id?: string | null
          is_active?: boolean | null
          name?: string | null
          provider?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      system_docs: {
        Row: {
          content: string | null
          content_hash: string | null
          doc_name: string | null
          drift_from_previous: Json | null
          generated_at: string | null
          generated_by: string | null
          id: string | null
          size_bytes: number | null
          total_lines: number | null
          version: string | null
        }
        Insert: {
          content?: string | null
          content_hash?: string | null
          doc_name?: string | null
          drift_from_previous?: Json | null
          generated_at?: string | null
          generated_by?: string | null
          id?: string | null
          size_bytes?: number | null
          total_lines?: number | null
          version?: string | null
        }
        Update: {
          content?: string | null
          content_hash?: string | null
          doc_name?: string | null
          drift_from_previous?: Json | null
          generated_at?: string | null
          generated_by?: string | null
          id?: string | null
          size_bytes?: number | null
          total_lines?: number | null
          version?: string | null
        }
        Relationships: []
      }
      system_health_incidents: {
        Row: {
          component: string | null
          created_at: string | null
          created_by: string | null
          description: string | null
          id: string | null
          impact: string | null
          metadata: Json | null
          resolved_at: string | null
          severity: string | null
          started_at: string | null
          status: string | null
          title: string | null
        }
        Insert: {
          component?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string | null
          impact?: string | null
          metadata?: Json | null
          resolved_at?: string | null
          severity?: string | null
          started_at?: string | null
          status?: string | null
          title?: string | null
        }
        Update: {
          component?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string | null
          impact?: string | null
          metadata?: Json | null
          resolved_at?: string | null
          severity?: string | null
          started_at?: string | null
          status?: string | null
          title?: string | null
        }
        Relationships: []
      }
      system_kill_switches: {
        Row: {
          created_at: string | null
          description: string | null
          enabled: boolean | null
          id: string | null
          legacy_message: string | null
          rollout_percentage: number | null
          switch_name: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          enabled?: boolean | null
          id?: string | null
          legacy_message?: string | null
          rollout_percentage?: number | null
          switch_name?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          enabled?: boolean | null
          id?: string | null
          legacy_message?: string | null
          rollout_percentage?: number | null
          switch_name?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      system_logs: {
        Row: {
          created_at: string | null
          id: string | null
          level: string | null
          message: string | null
          metadata: Json | null
          source: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string | null
          level?: string | null
          message?: string | null
          metadata?: Json | null
          source?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string | null
          level?: string | null
          message?: string | null
          metadata?: Json | null
          source?: string | null
        }
        Relationships: []
      }
      system_settings: {
        Row: {
          created_at: string | null
          description: string | null
          id: string | null
          key: string | null
          updated_at: string | null
          value: Json | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string | null
          key?: string | null
          updated_at?: string | null
          value?: Json | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string | null
          key?: string | null
          updated_at?: string | null
          value?: Json | null
        }
        Relationships: []
      }
      tags: {
        Row: {
          color: string | null
          confidence: number | null
          contact_id: string | null
          created_at: string | null
          created_by: string | null
          description: string | null
          id: string | null
          name: string | null
          source: string | null
          tag_name: string | null
          updated_at: string | null
        }
        Insert: {
          color?: string | null
          confidence?: number | null
          contact_id?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string | null
          name?: string | null
          source?: string | null
          tag_name?: string | null
          updated_at?: string | null
        }
        Update: {
          color?: string | null
          confidence?: number | null
          contact_id?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string | null
          name?: string | null
          source?: string | null
          tag_name?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      talkx_blacklist: {
        Row: {
          blocked_by: string | null
          contact_id: string | null
          created_at: string | null
          id: string | null
          reason: string | null
        }
        Insert: {
          blocked_by?: string | null
          contact_id?: string | null
          created_at?: string | null
          id?: string | null
          reason?: string | null
        }
        Update: {
          blocked_by?: string | null
          contact_id?: string | null
          created_at?: string | null
          id?: string | null
          reason?: string | null
        }
        Relationships: []
      }
      talkx_campaigns: {
        Row: {
          completed_at: string | null
          created_at: string | null
          created_by: string | null
          delivered_count: number | null
          failed_count: number | null
          id: string | null
          media_type: string | null
          media_url: string | null
          message_template: string | null
          name: string | null
          scheduled_at: string | null
          send_interval_max: number | null
          send_interval_min: number | null
          sent_count: number | null
          started_at: string | null
          status: string | null
          total_recipients: number | null
          typing_delay_max: number | null
          typing_delay_min: number | null
          updated_at: string | null
          variables_config: Json | null
          whatsapp_connection_id: string | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string | null
          created_by?: string | null
          delivered_count?: number | null
          failed_count?: number | null
          id?: string | null
          media_type?: string | null
          media_url?: string | null
          message_template?: string | null
          name?: string | null
          scheduled_at?: string | null
          send_interval_max?: number | null
          send_interval_min?: number | null
          sent_count?: number | null
          started_at?: string | null
          status?: string | null
          total_recipients?: number | null
          typing_delay_max?: number | null
          typing_delay_min?: number | null
          updated_at?: string | null
          variables_config?: Json | null
          whatsapp_connection_id?: string | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string | null
          created_by?: string | null
          delivered_count?: number | null
          failed_count?: number | null
          id?: string | null
          media_type?: string | null
          media_url?: string | null
          message_template?: string | null
          name?: string | null
          scheduled_at?: string | null
          send_interval_max?: number | null
          send_interval_min?: number | null
          sent_count?: number | null
          started_at?: string | null
          status?: string | null
          total_recipients?: number | null
          typing_delay_max?: number | null
          typing_delay_min?: number | null
          updated_at?: string | null
          variables_config?: Json | null
          whatsapp_connection_id?: string | null
        }
        Relationships: []
      }
      talkx_recipients: {
        Row: {
          campaign_id: string | null
          contact_id: string | null
          created_at: string | null
          delivered_at: string | null
          error_message: string | null
          id: string | null
          personalized_message: string | null
          request_id: string | null
          sent_at: string | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          campaign_id?: string | null
          contact_id?: string | null
          created_at?: string | null
          delivered_at?: string | null
          error_message?: string | null
          id?: string | null
          personalized_message?: string | null
          request_id?: string | null
          sent_at?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          campaign_id?: string | null
          contact_id?: string | null
          created_at?: string | null
          delivered_at?: string | null
          error_message?: string | null
          id?: string | null
          personalized_message?: string | null
          request_id?: string | null
          sent_at?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      task_queues: {
        Row: {
          created_at: string | null
          id: string | null
          max_concurrency: number | null
          name: string | null
          status: string | null
          workspace_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string | null
          max_concurrency?: number | null
          name?: string | null
          status?: string | null
          workspace_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string | null
          max_concurrency?: number | null
          name?: string | null
          status?: string | null
          workspace_id?: string | null
        }
        Relationships: []
      }
      team_conversation_members: {
        Row: {
          conversation_id: string | null
          id: string | null
          is_muted: boolean | null
          joined_at: string | null
          last_read_at: string | null
          profile_id: string | null
        }
        Insert: {
          conversation_id?: string | null
          id?: string | null
          is_muted?: boolean | null
          joined_at?: string | null
          last_read_at?: string | null
          profile_id?: string | null
        }
        Update: {
          conversation_id?: string | null
          id?: string | null
          is_muted?: boolean | null
          joined_at?: string | null
          last_read_at?: string | null
          profile_id?: string | null
        }
        Relationships: []
      }
      team_conversations: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          created_by: string | null
          department_id: string | null
          id: string | null
          metadata: Json | null
          name: string | null
          type: string | null
          updated_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          created_by?: string | null
          department_id?: string | null
          id?: string | null
          metadata?: Json | null
          name?: string | null
          type?: string | null
          updated_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          created_by?: string | null
          department_id?: string | null
          id?: string | null
          metadata?: Json | null
          name?: string | null
          type?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      team_message_reactions: {
        Row: {
          created_at: string | null
          emoji: string | null
          id: string | null
          message_id: string | null
          profile_id: string | null
        }
        Insert: {
          created_at?: string | null
          emoji?: string | null
          id?: string | null
          message_id?: string | null
          profile_id?: string | null
        }
        Update: {
          created_at?: string | null
          emoji?: string | null
          id?: string | null
          message_id?: string | null
          profile_id?: string | null
        }
        Relationships: []
      }
      team_message_receipts: {
        Row: {
          created_at: string | null
          delivered_at: string | null
          id: string | null
          message_id: string | null
          profile_id: string | null
          read_at: string | null
          status: string | null
        }
        Insert: {
          created_at?: string | null
          delivered_at?: string | null
          id?: string | null
          message_id?: string | null
          profile_id?: string | null
          read_at?: string | null
          status?: string | null
        }
        Update: {
          created_at?: string | null
          delivered_at?: string | null
          id?: string | null
          message_id?: string | null
          profile_id?: string | null
          read_at?: string | null
          status?: string | null
        }
        Relationships: []
      }
      team_messages: {
        Row: {
          content: string | null
          conversation_id: string | null
          created_at: string | null
          id: string | null
          is_edited: boolean | null
          media_type: string | null
          media_url: string | null
          message_type: string | null
          reply_to_id: string | null
          sender_id: string | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          content?: string | null
          conversation_id?: string | null
          created_at?: string | null
          id?: string | null
          is_edited?: boolean | null
          media_type?: string | null
          media_url?: string | null
          message_type?: string | null
          reply_to_id?: string | null
          sender_id?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          content?: string | null
          conversation_id?: string | null
          created_at?: string | null
          id?: string | null
          is_edited?: boolean | null
          media_type?: string | null
          media_url?: string | null
          message_type?: string | null
          reply_to_id?: string | null
          sender_id?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      tenants: {
        Row: {
          broadcast_adapter: string | null
          client_presence_window_ms: number | null
          external_id: string | null
          id: string | null
          inserted_at: string | null
          jwt_jwks: Json | null
          jwt_secret: string | null
          max_bytes_per_second: number | null
          max_channels_per_client: number | null
          max_client_presence_events_per_window: number | null
          max_concurrent_users: number | null
          max_events_per_second: number | null
          max_joins_per_second: number | null
          max_payload_size_in_kb: number | null
          max_presence_events_per_second: number | null
          migrations_ran: number | null
          name: string | null
          notify_private_alpha: boolean | null
          postgres_cdc_default: string | null
          private_only: boolean | null
          suspend: boolean | null
          updated_at: string | null
        }
        Insert: {
          broadcast_adapter?: string | null
          client_presence_window_ms?: number | null
          external_id?: string | null
          id?: string | null
          inserted_at?: string | null
          jwt_jwks?: Json | null
          jwt_secret?: string | null
          max_bytes_per_second?: number | null
          max_channels_per_client?: number | null
          max_client_presence_events_per_window?: number | null
          max_concurrent_users?: number | null
          max_events_per_second?: number | null
          max_joins_per_second?: number | null
          max_payload_size_in_kb?: number | null
          max_presence_events_per_second?: number | null
          migrations_ran?: number | null
          name?: string | null
          notify_private_alpha?: boolean | null
          postgres_cdc_default?: string | null
          private_only?: boolean | null
          suspend?: boolean | null
          updated_at?: string | null
        }
        Update: {
          broadcast_adapter?: string | null
          client_presence_window_ms?: number | null
          external_id?: string | null
          id?: string | null
          inserted_at?: string | null
          jwt_jwks?: Json | null
          jwt_secret?: string | null
          max_bytes_per_second?: number | null
          max_channels_per_client?: number | null
          max_client_presence_events_per_window?: number | null
          max_concurrent_users?: number | null
          max_events_per_second?: number | null
          max_joins_per_second?: number | null
          max_payload_size_in_kb?: number | null
          max_presence_events_per_second?: number | null
          migrations_ran?: number | null
          name?: string | null
          notify_private_alpha?: boolean | null
          postgres_cdc_default?: string | null
          private_only?: boolean | null
          suspend?: boolean | null
          updated_at?: string | null
        }
        Relationships: []
      }
      test_cases: {
        Row: {
          created_at: string | null
          dataset_id: string | null
          expected_output: string | null
          id: string | null
          input: string | null
          metadata: Json | null
          tags: string[] | null
        }
        Insert: {
          created_at?: string | null
          dataset_id?: string | null
          expected_output?: string | null
          id?: string | null
          input?: string | null
          metadata?: Json | null
          tags?: string[] | null
        }
        Update: {
          created_at?: string | null
          dataset_id?: string | null
          expected_output?: string | null
          id?: string | null
          input?: string | null
          metadata?: Json | null
          tags?: string[] | null
        }
        Relationships: []
      }
      transfer_comments: {
        Row: {
          agent_id: string | null
          author_instance: string | null
          author_name: string | null
          content: string | null
          created_at: string | null
          id: string | null
          metadata: Json | null
          transfer_id: string | null
        }
        Insert: {
          agent_id?: string | null
          author_instance?: string | null
          author_name?: string | null
          content?: string | null
          created_at?: string | null
          id?: string | null
          metadata?: Json | null
          transfer_id?: string | null
        }
        Update: {
          agent_id?: string | null
          author_instance?: string | null
          author_name?: string | null
          content?: string | null
          created_at?: string | null
          id?: string | null
          metadata?: Json | null
          transfer_id?: string | null
        }
        Relationships: []
      }
      transportadoras: {
        Row: {
          ativo: boolean | null
          bairro: string | null
          cep: string | null
          cnpj: string | null
          complemento: string | null
          created_at: string | null
          email: string | null
          id: number | null
          ie: string | null
          inscricao_municipal: string | null
          logradouro: string | null
          municipio: string | null
          nome: string | null
          nome_fantasia: string | null
          numero: string | null
          observacoes: string | null
          razao_social: string | null
          site: string | null
          telefone: string | null
          uf: string | null
          updated_at: string | null
        }
        Insert: {
          ativo?: boolean | null
          bairro?: string | null
          cep?: string | null
          cnpj?: string | null
          complemento?: string | null
          created_at?: string | null
          email?: string | null
          id?: number | null
          ie?: string | null
          inscricao_municipal?: string | null
          logradouro?: string | null
          municipio?: string | null
          nome?: string | null
          nome_fantasia?: string | null
          numero?: string | null
          observacoes?: string | null
          razao_social?: string | null
          site?: string | null
          telefone?: string | null
          uf?: string | null
          updated_at?: string | null
        }
        Update: {
          ativo?: boolean | null
          bairro?: string | null
          cep?: string | null
          cnpj?: string | null
          complemento?: string | null
          created_at?: string | null
          email?: string | null
          id?: number | null
          ie?: string | null
          inscricao_municipal?: string | null
          logradouro?: string | null
          municipio?: string | null
          nome?: string | null
          nome_fantasia?: string | null
          numero?: string | null
          observacoes?: string | null
          razao_social?: string | null
          site?: string | null
          telefone?: string | null
          uf?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      trocas: {
        Row: {
          criado_em: string | null
          criado_por: string | null
          fornecedor: string | null
          id: string | null
          numero_pedido: string | null
          observacao: string | null
          pedido: string | null
          produto: string | null
          quantidade: number | null
          status: string | null
          ticket: string | null
          valor_total: number | null
          valor_unitario: number | null
        }
        Insert: {
          criado_em?: string | null
          criado_por?: string | null
          fornecedor?: string | null
          id?: string | null
          numero_pedido?: string | null
          observacao?: string | null
          pedido?: string | null
          produto?: string | null
          quantidade?: number | null
          status?: string | null
          ticket?: string | null
          valor_total?: number | null
          valor_unitario?: number | null
        }
        Update: {
          criado_em?: string | null
          criado_por?: string | null
          fornecedor?: string | null
          id?: string | null
          numero_pedido?: string | null
          observacao?: string | null
          pedido?: string | null
          produto?: string | null
          quantidade?: number | null
          status?: string | null
          ticket?: string | null
          valor_total?: number | null
          valor_unitario?: number | null
        }
        Relationships: []
      }
      user_devices: {
        Row: {
          browser: string | null
          city: string | null
          country: string | null
          created_at: string | null
          device_fingerprint: string | null
          device_name: string | null
          first_seen_at: string | null
          id: string | null
          ip_address: string | null
          is_trusted: boolean | null
          last_seen_at: string | null
          os: string | null
          user_id: string | null
        }
        Insert: {
          browser?: string | null
          city?: string | null
          country?: string | null
          created_at?: string | null
          device_fingerprint?: string | null
          device_name?: string | null
          first_seen_at?: string | null
          id?: string | null
          ip_address?: string | null
          is_trusted?: boolean | null
          last_seen_at?: string | null
          os?: string | null
          user_id?: string | null
        }
        Update: {
          browser?: string | null
          city?: string | null
          country?: string | null
          created_at?: string | null
          device_fingerprint?: string | null
          device_name?: string | null
          first_seen_at?: string | null
          id?: string | null
          ip_address?: string | null
          is_trusted?: boolean | null
          last_seen_at?: string | null
          os?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          assigned_by: string | null
          created_at: string | null
          id: string | null
          role: Database["public"]["Enums"]["app_role"] | null
          role_key: string | null
          user_id: string | null
          workspace_id: string | null
        }
        Insert: {
          assigned_by?: string | null
          created_at?: string | null
          id?: string | null
          role?: Database["public"]["Enums"]["app_role"] | null
          role_key?: string | null
          user_id?: string | null
          workspace_id?: string | null
        }
        Update: {
          assigned_by?: string | null
          created_at?: string | null
          id?: string | null
          role?: Database["public"]["Enums"]["app_role"] | null
          role_key?: string | null
          user_id?: string | null
          workspace_id?: string | null
        }
        Relationships: []
      }
      user_service_accounts: {
        Row: {
          account_email: string | null
          created_at: string | null
          id: string | null
          is_active: boolean | null
          service_type:
            | Database["public"]["Enums"]["service_account_type"]
            | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          account_email?: string | null
          created_at?: string | null
          id?: string | null
          is_active?: boolean | null
          service_type?:
            | Database["public"]["Enums"]["service_account_type"]
            | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          account_email?: string | null
          created_at?: string | null
          id?: string | null
          is_active?: boolean | null
          service_type?:
            | Database["public"]["Enums"]["service_account_type"]
            | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      user_sessions: {
        Row: {
          device_id: string | null
          ended_at: string | null
          expires_at: string | null
          id: string | null
          ip_address: string | null
          is_active: boolean | null
          last_activity_at: string | null
          started_at: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          device_id?: string | null
          ended_at?: string | null
          expires_at?: string | null
          id?: string | null
          ip_address?: string | null
          is_active?: boolean | null
          last_activity_at?: string | null
          started_at?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          device_id?: string | null
          ended_at?: string | null
          expires_at?: string | null
          id?: string | null
          ip_address?: string | null
          is_active?: boolean | null
          last_activity_at?: string | null
          started_at?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      user_settings: {
        Row: {
          auto_assignment_enabled: boolean | null
          auto_assignment_method: string | null
          auto_transcription_enabled: boolean | null
          away_message: string | null
          browser_notifications_enabled: boolean | null
          business_hours_enabled: boolean | null
          business_hours_end: string | null
          business_hours_start: string | null
          closing_message: string | null
          compact_mode: boolean | null
          created_at: string | null
          goal_sound_type: string | null
          id: string | null
          inactivity_timeout: number | null
          inbox_filters: Json | null
          language: string | null
          mention_sound_type: string | null
          message_sound_type: string | null
          onboarding_completed: boolean | null
          quiet_hours_enabled: boolean | null
          quiet_hours_end: string | null
          quiet_hours_start: string | null
          sentiment_alert_enabled: boolean | null
          sentiment_alert_threshold: number | null
          sentiment_consecutive_count: number | null
          sla_sound_type: string | null
          sound_enabled: boolean | null
          theme: string | null
          transcription_notification_enabled: boolean | null
          transcription_sound_type: string | null
          tts_speed: number | null
          tts_voice_id: string | null
          updated_at: string | null
          user_id: string | null
          welcome_message: string | null
          work_days: string[] | null
        }
        Insert: {
          auto_assignment_enabled?: boolean | null
          auto_assignment_method?: string | null
          auto_transcription_enabled?: boolean | null
          away_message?: string | null
          browser_notifications_enabled?: boolean | null
          business_hours_enabled?: boolean | null
          business_hours_end?: string | null
          business_hours_start?: string | null
          closing_message?: string | null
          compact_mode?: boolean | null
          created_at?: string | null
          goal_sound_type?: string | null
          id?: string | null
          inactivity_timeout?: number | null
          inbox_filters?: Json | null
          language?: string | null
          mention_sound_type?: string | null
          message_sound_type?: string | null
          onboarding_completed?: boolean | null
          quiet_hours_enabled?: boolean | null
          quiet_hours_end?: string | null
          quiet_hours_start?: string | null
          sentiment_alert_enabled?: boolean | null
          sentiment_alert_threshold?: number | null
          sentiment_consecutive_count?: number | null
          sla_sound_type?: string | null
          sound_enabled?: boolean | null
          theme?: string | null
          transcription_notification_enabled?: boolean | null
          transcription_sound_type?: string | null
          tts_speed?: number | null
          tts_voice_id?: string | null
          updated_at?: string | null
          user_id?: string | null
          welcome_message?: string | null
          work_days?: string[] | null
        }
        Update: {
          auto_assignment_enabled?: boolean | null
          auto_assignment_method?: string | null
          auto_transcription_enabled?: boolean | null
          away_message?: string | null
          browser_notifications_enabled?: boolean | null
          business_hours_enabled?: boolean | null
          business_hours_end?: string | null
          business_hours_start?: string | null
          closing_message?: string | null
          compact_mode?: boolean | null
          created_at?: string | null
          goal_sound_type?: string | null
          id?: string | null
          inactivity_timeout?: number | null
          inbox_filters?: Json | null
          language?: string | null
          mention_sound_type?: string | null
          message_sound_type?: string | null
          onboarding_completed?: boolean | null
          quiet_hours_enabled?: boolean | null
          quiet_hours_end?: string | null
          quiet_hours_start?: string | null
          sentiment_alert_enabled?: boolean | null
          sentiment_alert_threshold?: number | null
          sentiment_consecutive_count?: number | null
          sla_sound_type?: string | null
          sound_enabled?: boolean | null
          theme?: string | null
          transcription_notification_enabled?: boolean | null
          transcription_sound_type?: string | null
          tts_speed?: number | null
          tts_voice_id?: string | null
          updated_at?: string | null
          user_id?: string | null
          welcome_message?: string | null
          work_days?: string[] | null
        }
        Relationships: []
      }
      usuarios: {
        Row: {
          ativo: boolean | null
          atualizado_em: string | null
          cargo: string | null
          criado_em: string | null
          email: string | null
          id: string | null
          nome: string | null
          perfil: string | null
          setor: string | null
          ultimo_acesso: string | null
        }
        Insert: {
          ativo?: boolean | null
          atualizado_em?: string | null
          cargo?: string | null
          criado_em?: string | null
          email?: string | null
          id?: string | null
          nome?: string | null
          perfil?: string | null
          setor?: string | null
          ultimo_acesso?: string | null
        }
        Update: {
          ativo?: boolean | null
          atualizado_em?: string | null
          cargo?: string | null
          criado_em?: string | null
          email?: string | null
          id?: string | null
          nome?: string | null
          perfil?: string | null
          setor?: string | null
          ultimo_acesso?: string | null
        }
        Relationships: []
      }
      vault_healthcheck_log: {
        Row: {
          checked_at: string | null
          defer_count: number | null
          fail_count: number | null
          failed_names: string[] | null
          full_result: Json | null
          id: number | null
          ok_count: number | null
          status: string | null
        }
        Insert: {
          checked_at?: string | null
          defer_count?: number | null
          fail_count?: number | null
          failed_names?: string[] | null
          full_result?: Json | null
          id?: number | null
          ok_count?: number | null
          status?: string | null
        }
        Update: {
          checked_at?: string | null
          defer_count?: number | null
          fail_count?: number | null
          failed_names?: string[] | null
          full_result?: Json | null
          id?: number | null
          ok_count?: number | null
          status?: string | null
        }
        Relationships: []
      }
      voice_command_logs: {
        Row: {
          action: string | null
          created_at: string | null
          data: Json | null
          duration_ms: number | null
          id: string | null
          response: string | null
          success: boolean | null
          transcript: string | null
          user_id: string | null
        }
        Insert: {
          action?: string | null
          created_at?: string | null
          data?: Json | null
          duration_ms?: number | null
          id?: string | null
          response?: string | null
          success?: boolean | null
          transcript?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string | null
          created_at?: string | null
          data?: Json | null
          duration_ms?: number | null
          id?: string | null
          response?: string | null
          success?: boolean | null
          transcript?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      voice_conversion_queue: {
        Row: {
          completed_at: string | null
          conversation_id: string | null
          created_at: string | null
          duration_ms: number | null
          error_code: string | null
          error_message: string | null
          file_size_bytes: number | null
          id: string | null
          input_audio_url: string | null
          language: string | null
          message_id: string | null
          output_audio_url: string | null
          requested_by: string | null
          started_at: string | null
          status: string | null
          updated_at: string | null
          voice_name: string | null
        }
        Insert: {
          completed_at?: string | null
          conversation_id?: string | null
          created_at?: string | null
          duration_ms?: number | null
          error_code?: string | null
          error_message?: string | null
          file_size_bytes?: number | null
          id?: string | null
          input_audio_url?: string | null
          language?: string | null
          message_id?: string | null
          output_audio_url?: string | null
          requested_by?: string | null
          started_at?: string | null
          status?: string | null
          updated_at?: string | null
          voice_name?: string | null
        }
        Update: {
          completed_at?: string | null
          conversation_id?: string | null
          created_at?: string | null
          duration_ms?: number | null
          error_code?: string | null
          error_message?: string | null
          file_size_bytes?: number | null
          id?: string | null
          input_audio_url?: string | null
          language?: string | null
          message_id?: string | null
          output_audio_url?: string | null
          requested_by?: string | null
          started_at?: string | null
          status?: string | null
          updated_at?: string | null
          voice_name?: string | null
        }
        Relationships: []
      }
      warroom_alerts: {
        Row: {
          alert_type: "info" | "warning" | "critical" | "sla_breach" | null
          created_at: string | null
          dismissed_by: string | null
          entity: string | null
          id: string | null
          is_read: boolean | null
          message: string | null
          resolved_at: string | null
          resolved_reason: string | null
          source: string | null
          title: string | null
        }
        Insert: {
          alert_type?: "info" | "warning" | "critical" | "sla_breach" | null
          created_at?: string | null
          dismissed_by?: string | null
          entity?: string | null
          id?: string | null
          is_read?: boolean | null
          message?: string | null
          resolved_at?: string | null
          resolved_reason?: string | null
          source?: string | null
          title?: string | null
        }
        Update: {
          alert_type?: "info" | "warning" | "critical" | "sla_breach" | null
          created_at?: string | null
          dismissed_by?: string | null
          entity?: string | null
          id?: string | null
          is_read?: boolean | null
          message?: string | null
          resolved_at?: string | null
          resolved_reason?: string | null
          source?: string | null
          title?: string | null
        }
        Relationships: []
      }
      webauthn_challenges: {
        Row: {
          challenge: string | null
          created_at: string | null
          expires_at: string | null
          id: string | null
          kind: string | null
          status: string | null
          target: string | null
          ts: string | null
          type: string | null
          user_id: string | null
        }
        Insert: {
          challenge?: string | null
          created_at?: string | null
          expires_at?: string | null
          id?: string | null
          kind?: string | null
          status?: string | null
          target?: string | null
          ts?: string | null
          type?: string | null
          user_id?: string | null
        }
        Update: {
          challenge?: string | null
          created_at?: string | null
          expires_at?: string | null
          id?: string | null
          kind?: string | null
          status?: string | null
          target?: string | null
          ts?: string | null
          type?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      webhook_audit_log: {
        Row: {
          created_at: string | null
          duration_ms: number | null
          endpoint: string | null
          error_message: string | null
          event_type: string | null
          id: string | null
          instance: string | null
          message_id: string | null
          method: string | null
          received_at: string | null
          request_body: Json | null
          request_id: string | null
          response_body: Json | null
          status: string | null
          status_code: number | null
          webhook_source: string | null
        }
        Insert: {
          created_at?: string | null
          duration_ms?: number | null
          endpoint?: string | null
          error_message?: string | null
          event_type?: string | null
          id?: string | null
          instance?: string | null
          message_id?: string | null
          method?: string | null
          received_at?: string | null
          request_body?: Json | null
          request_id?: string | null
          response_body?: Json | null
          status?: string | null
          status_code?: number | null
          webhook_source?: string | null
        }
        Update: {
          created_at?: string | null
          duration_ms?: number | null
          endpoint?: string | null
          error_message?: string | null
          event_type?: string | null
          id?: string | null
          instance?: string | null
          message_id?: string | null
          method?: string | null
          received_at?: string | null
          request_body?: Json | null
          request_id?: string | null
          response_body?: Json | null
          status?: string | null
          status_code?: number | null
          webhook_source?: string | null
        }
        Relationships: []
      }
      webhook_endpoints: {
        Row: {
          agent_id: string | null
          created_at: string | null
          events: string[] | null
          id: string | null
          is_active: boolean | null
          last_triggered_at: string | null
          name: string | null
          secret: string | null
          trigger_count: number | null
          updated_at: string | null
          url: string | null
          workspace_id: string | null
        }
        Insert: {
          agent_id?: string | null
          created_at?: string | null
          events?: string[] | null
          id?: string | null
          is_active?: boolean | null
          last_triggered_at?: string | null
          name?: string | null
          secret?: string | null
          trigger_count?: number | null
          updated_at?: string | null
          url?: string | null
          workspace_id?: string | null
        }
        Update: {
          agent_id?: string | null
          created_at?: string | null
          events?: string[] | null
          id?: string | null
          is_active?: boolean | null
          last_triggered_at?: string | null
          name?: string | null
          secret?: string | null
          trigger_count?: number | null
          updated_at?: string | null
          url?: string | null
          workspace_id?: string | null
        }
        Relationships: []
      }
      webhook_event_dedup: {
        Row: {
          event_key: string | null
          event_type: string | null
          instance_name: string | null
          payload_hash: string | null
          received_at: string | null
        }
        Insert: {
          event_key?: string | null
          event_type?: string | null
          instance_name?: string | null
          payload_hash?: string | null
          received_at?: string | null
        }
        Update: {
          event_key?: string | null
          event_type?: string | null
          instance_name?: string | null
          payload_hash?: string | null
          received_at?: string | null
        }
        Relationships: []
      }
      webhook_events: {
        Row: {
          created_at: string | null
          event_type: string | null
          id: string | null
          latency_ms: number | null
          payload: Json | null
          response_body: string | null
          response_status: number | null
          webhook_id: string | null
        }
        Insert: {
          created_at?: string | null
          event_type?: string | null
          id?: string | null
          latency_ms?: number | null
          payload?: Json | null
          response_body?: string | null
          response_status?: number | null
          webhook_id?: string | null
        }
        Update: {
          created_at?: string | null
          event_type?: string | null
          id?: string | null
          latency_ms?: number | null
          payload?: Json | null
          response_body?: string | null
          response_status?: number | null
          webhook_id?: string | null
        }
        Relationships: []
      }
      webhook_events_processed: {
        Row: {
          event_id: string | null
          event_type: string | null
          id: string | null
          idempotency_key: string | null
          instance: string | null
          message_key_id: string | null
          processed_at: string | null
          request_id: string | null
          responded: boolean | null
          webhook_source: string | null
        }
        Insert: {
          event_id?: string | null
          event_type?: string | null
          id?: string | null
          idempotency_key?: string | null
          instance?: string | null
          message_key_id?: string | null
          processed_at?: string | null
          request_id?: string | null
          responded?: boolean | null
          webhook_source?: string | null
        }
        Update: {
          event_id?: string | null
          event_type?: string | null
          id?: string | null
          idempotency_key?: string | null
          instance?: string | null
          message_key_id?: string | null
          processed_at?: string | null
          request_id?: string | null
          responded?: boolean | null
          webhook_source?: string | null
        }
        Relationships: []
      }
      webhook_health_alerts: {
        Row: {
          acknowledged: boolean | null
          alert_type: string | null
          created_at: string | null
          details: Json | null
          id: string | null
          resolved_at: string | null
          severity: string | null
          title: string | null
        }
        Insert: {
          acknowledged?: boolean | null
          alert_type?: string | null
          created_at?: string | null
          details?: Json | null
          id?: string | null
          resolved_at?: string | null
          severity?: string | null
          title?: string | null
        }
        Update: {
          acknowledged?: boolean | null
          alert_type?: string | null
          created_at?: string | null
          details?: Json | null
          id?: string | null
          resolved_at?: string | null
          severity?: string | null
          title?: string | null
        }
        Relationships: []
      }
      webhook_health_checks: {
        Row: {
          acknowledged: boolean | null
          created_at: string | null
          error_message: string | null
          id: string | null
          last_checked_at: string | null
          status: string | null
          webhook_id: string | null
        }
        Insert: {
          acknowledged?: boolean | null
          created_at?: string | null
          error_message?: string | null
          id?: string | null
          last_checked_at?: string | null
          status?: string | null
          webhook_id?: string | null
        }
        Update: {
          acknowledged?: boolean | null
          created_at?: string | null
          error_message?: string | null
          id?: string | null
          last_checked_at?: string | null
          status?: string | null
          webhook_id?: string | null
        }
        Relationships: []
      }
      webhook_idempotency: {
        Row: {
          error_message: string | null
          expires_at: string | null
          id: string | null
          processed_at: string | null
          received_at: string | null
          source: string | null
          status: string | null
          webhook_id: string | null
        }
        Insert: {
          error_message?: string | null
          expires_at?: string | null
          id?: string | null
          processed_at?: string | null
          received_at?: string | null
          source?: string | null
          status?: string | null
          webhook_id?: string | null
        }
        Update: {
          error_message?: string | null
          expires_at?: string | null
          id?: string | null
          processed_at?: string | null
          received_at?: string | null
          source?: string | null
          status?: string | null
          webhook_id?: string | null
        }
        Relationships: []
      }
      webhook_preferences: {
        Row: {
          created_at: string | null
          id: string | null
          preferences: Json | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string | null
          preferences?: Json | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string | null
          preferences?: Json | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      webhook_rate_limits: {
        Row: {
          created_at: string | null
          event_count: number | null
          event_type: string | null
          id: string | null
          instance_id: string | null
          window_start: string | null
        }
        Insert: {
          created_at?: string | null
          event_count?: number | null
          event_type?: string | null
          id?: string | null
          instance_id?: string | null
          window_start?: string | null
        }
        Update: {
          created_at?: string | null
          event_count?: number | null
          event_type?: string | null
          id?: string | null
          instance_id?: string | null
          window_start?: string | null
        }
        Relationships: []
      }
      webhook_reprocess_queue: {
        Row: {
          attempts: number | null
          connection_id: string | null
          created_at: string | null
          id: string | null
          last_error: string | null
          max_attempts: number | null
          next_retry_at: string | null
          payload: Json | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          attempts?: number | null
          connection_id?: string | null
          created_at?: string | null
          id?: string | null
          last_error?: string | null
          max_attempts?: number | null
          next_retry_at?: string | null
          payload?: Json | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          attempts?: number | null
          connection_id?: string | null
          created_at?: string | null
          id?: string | null
          last_error?: string | null
          max_attempts?: number | null
          next_retry_at?: string | null
          payload?: Json | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      whatsapp_cloud_webhook_pings: {
        Row: {
          challenge: string | null
          created_at: string | null
          id: string | null
          instance_name: string | null
          ip_address: string | null
          kind: string | null
          meta: Json | null
          status: string | null
          verify_token: string | null
        }
        Insert: {
          challenge?: string | null
          created_at?: string | null
          id?: string | null
          instance_name?: string | null
          ip_address?: string | null
          kind?: string | null
          meta?: Json | null
          status?: string | null
          verify_token?: string | null
        }
        Update: {
          challenge?: string | null
          created_at?: string | null
          id?: string | null
          instance_name?: string | null
          ip_address?: string | null
          kind?: string | null
          meta?: Json | null
          status?: string | null
          verify_token?: string | null
        }
        Relationships: []
      }
      whatsapp_connection_queues: {
        Row: {
          created_at: string | null
          id: string | null
          queue_id: string | null
          whatsapp_connection_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string | null
          queue_id?: string | null
          whatsapp_connection_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string | null
          queue_id?: string | null
          whatsapp_connection_id?: string | null
        }
        Relationships: []
      }
      whatsapp_connections: {
        Row: {
          api_type: string | null
          api_url: string | null
          auto_reconnect_enabled: boolean | null
          battery_level: number | null
          connected_at: string | null
          created_at: string | null
          created_by: string | null
          degraded_at: string | null
          disconnected_at: string | null
          evo_instance_id: string | null
          farewell_enabled: boolean | null
          farewell_message: string | null
          health_reason: string | null
          health_response_ms: number | null
          health_status: string | null
          id: string | null
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
          name: string | null
          owner_jid: string | null
          phone_number: string | null
          qr_code: string | null
          qr_code_base64: string | null
          reconnect_interval_seconds: number | null
          retry_count: number | null
          routing_mode: string | null
          settings: Json | null
          status: string | null
          updated_at: string | null
          webhook_url: string | null
        }
        Insert: {
          api_type?: string | null
          api_url?: string | null
          auto_reconnect_enabled?: boolean | null
          battery_level?: number | null
          connected_at?: string | null
          created_at?: string | null
          created_by?: string | null
          degraded_at?: string | null
          disconnected_at?: string | null
          evo_instance_id?: string | null
          farewell_enabled?: boolean | null
          farewell_message?: string | null
          health_reason?: string | null
          health_response_ms?: number | null
          health_status?: string | null
          id?: string | null
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
          name?: string | null
          owner_jid?: string | null
          phone_number?: string | null
          qr_code?: string | null
          qr_code_base64?: string | null
          reconnect_interval_seconds?: number | null
          retry_count?: number | null
          routing_mode?: string | null
          settings?: Json | null
          status?: string | null
          updated_at?: string | null
          webhook_url?: string | null
        }
        Update: {
          api_type?: string | null
          api_url?: string | null
          auto_reconnect_enabled?: boolean | null
          battery_level?: number | null
          connected_at?: string | null
          created_at?: string | null
          created_by?: string | null
          degraded_at?: string | null
          disconnected_at?: string | null
          evo_instance_id?: string | null
          farewell_enabled?: boolean | null
          farewell_message?: string | null
          health_reason?: string | null
          health_response_ms?: number | null
          health_status?: string | null
          id?: string | null
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
          name?: string | null
          owner_jid?: string | null
          phone_number?: string | null
          qr_code?: string | null
          qr_code_base64?: string | null
          reconnect_interval_seconds?: number | null
          retry_count?: number | null
          routing_mode?: string | null
          settings?: Json | null
          status?: string | null
          updated_at?: string | null
          webhook_url?: string | null
        }
        Relationships: []
      }
      whatsapp_flows: {
        Row: {
          created_at: string | null
          created_by: string | null
          description: string | null
          flow_json: Json | null
          id: string | null
          name: string | null
          published_at: string | null
          screens: Json | null
          status: string | null
          updated_at: string | null
          whatsapp_connection_id: string | null
          whatsapp_flow_id: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          flow_json?: Json | null
          id?: string | null
          name?: string | null
          published_at?: string | null
          screens?: Json | null
          status?: string | null
          updated_at?: string | null
          whatsapp_connection_id?: string | null
          whatsapp_flow_id?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          flow_json?: Json | null
          id?: string | null
          name?: string | null
          published_at?: string | null
          screens?: Json | null
          status?: string | null
          updated_at?: string | null
          whatsapp_connection_id?: string | null
          whatsapp_flow_id?: string | null
        }
        Relationships: []
      }
      whatsapp_groups: {
        Row: {
          avatar_url: string | null
          category: string | null
          created_at: string | null
          description: string | null
          group_id: string | null
          id: string | null
          is_admin: boolean | null
          name: string | null
          participant_count: number | null
          updated_at: string | null
          whatsapp_connection_id: string | null
        }
        Insert: {
          avatar_url?: string | null
          category?: string | null
          created_at?: string | null
          description?: string | null
          group_id?: string | null
          id?: string | null
          is_admin?: boolean | null
          name?: string | null
          participant_count?: number | null
          updated_at?: string | null
          whatsapp_connection_id?: string | null
        }
        Update: {
          avatar_url?: string | null
          category?: string | null
          created_at?: string | null
          description?: string | null
          group_id?: string | null
          id?: string | null
          is_admin?: boolean | null
          name?: string | null
          participant_count?: number | null
          updated_at?: string | null
          whatsapp_connection_id?: string | null
        }
        Relationships: []
      }
      whatsapp_official_credentials: {
        Row: {
          access_token: string | null
          app_id: string | null
          app_secret: string | null
          business_account_id: string | null
          connection_id: string | null
          created_at: string | null
          created_by: string | null
          graph_api_version: string | null
          id: string | null
          phone_number_id: string | null
          updated_at: string | null
          verify_token: string | null
          waba_id: string | null
        }
        Insert: {
          access_token?: string | null
          app_id?: string | null
          app_secret?: string | null
          business_account_id?: string | null
          connection_id?: string | null
          created_at?: string | null
          created_by?: string | null
          graph_api_version?: string | null
          id?: string | null
          phone_number_id?: string | null
          updated_at?: string | null
          verify_token?: string | null
          waba_id?: string | null
        }
        Update: {
          access_token?: string | null
          app_id?: string | null
          app_secret?: string | null
          business_account_id?: string | null
          connection_id?: string | null
          created_at?: string | null
          created_by?: string | null
          graph_api_version?: string | null
          id?: string | null
          phone_number_id?: string | null
          updated_at?: string | null
          verify_token?: string | null
          waba_id?: string | null
        }
        Relationships: []
      }
      whatsapp_official_credentials_safe: {
        Row: {
          app_id: string | null
          connection_id: string | null
          created_at: string | null
          has_access_token: boolean | null
          has_app_secret: boolean | null
          id: string | null
          phone_number_id: string | null
          updated_at: string | null
          waba_id: string | null
        }
        Insert: {
          app_id?: string | null
          connection_id?: string | null
          created_at?: string | null
          has_access_token?: never
          has_app_secret?: never
          id?: string | null
          phone_number_id?: string | null
          updated_at?: string | null
          waba_id?: string | null
        }
        Update: {
          app_id?: string | null
          connection_id?: string | null
          created_at?: string | null
          has_access_token?: never
          has_app_secret?: never
          id?: string | null
          phone_number_id?: string | null
          updated_at?: string | null
          waba_id?: string | null
        }
        Relationships: []
      }
      whatsapp_templates: {
        Row: {
          buttons: Json | null
          category: string | null
          content: string | null
          created_at: string | null
          created_by: string | null
          footer_text: string | null
          header_text: string | null
          id: string | null
          language: string | null
          name: string | null
          status: string | null
          updated_at: string | null
          variables: string[] | null
          whatsapp_connection_id: string | null
        }
        Insert: {
          buttons?: Json | null
          category?: string | null
          content?: string | null
          created_at?: string | null
          created_by?: string | null
          footer_text?: string | null
          header_text?: string | null
          id?: string | null
          language?: string | null
          name?: string | null
          status?: string | null
          updated_at?: string | null
          variables?: string[] | null
          whatsapp_connection_id?: string | null
        }
        Update: {
          buttons?: Json | null
          category?: string | null
          content?: string | null
          created_at?: string | null
          created_by?: string | null
          footer_text?: string | null
          header_text?: string | null
          id?: string | null
          language?: string | null
          name?: string | null
          status?: string | null
          updated_at?: string | null
          variables?: string[] | null
          whatsapp_connection_id?: string | null
        }
        Relationships: []
      }
      whisper_files: {
        Row: {
          contact_id: string | null
          created_at: string | null
          file_name: string | null
          file_size: number | null
          file_type: string | null
          file_url: string | null
          id: string | null
          metadata: Json | null
          sender_id: string | null
          updated_at: string | null
        }
        Insert: {
          contact_id?: string | null
          created_at?: string | null
          file_name?: string | null
          file_size?: number | null
          file_type?: string | null
          file_url?: string | null
          id?: string | null
          metadata?: Json | null
          sender_id?: string | null
          updated_at?: string | null
        }
        Update: {
          contact_id?: string | null
          created_at?: string | null
          file_name?: string | null
          file_size?: number | null
          file_type?: string | null
          file_url?: string | null
          id?: string | null
          metadata?: Json | null
          sender_id?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      whisper_messages: {
        Row: {
          audio_url: string | null
          contact_id: string | null
          content: string | null
          created_at: string | null
          id: string | null
          is_read: boolean | null
          sender_id: string | null
          target_agent_id: string | null
          whisper_thread_id: string | null
        }
        Insert: {
          audio_url?: string | null
          contact_id?: string | null
          content?: string | null
          created_at?: string | null
          id?: string | null
          is_read?: boolean | null
          sender_id?: string | null
          target_agent_id?: string | null
          whisper_thread_id?: string | null
        }
        Update: {
          audio_url?: string | null
          contact_id?: string | null
          content?: string | null
          created_at?: string | null
          id?: string | null
          is_read?: boolean | null
          sender_id?: string | null
          target_agent_id?: string | null
          whisper_thread_id?: string | null
        }
        Relationships: []
      }
      workspace_members: {
        Row: {
          accepted_at: string | null
          email: string | null
          id: string | null
          invited_at: string | null
          name: string | null
          role: string | null
          user_id: string | null
          workspace_id: string | null
        }
        Insert: {
          accepted_at?: string | null
          email?: string | null
          id?: string | null
          invited_at?: string | null
          name?: string | null
          role?: string | null
          user_id?: string | null
          workspace_id?: string | null
        }
        Update: {
          accepted_at?: string | null
          email?: string | null
          id?: string | null
          invited_at?: string | null
          name?: string | null
          role?: string | null
          user_id?: string | null
          workspace_id?: string | null
        }
        Relationships: []
      }
      workspace_settings: {
        Row: {
          created_at: string | null
          default_queue: string | null
          description: string | null
          id: string | null
          logo_url: string | null
          name: string | null
          settings: Json | null
          timezone: string | null
          updated_at: string | null
          working_hours_end: string | null
          working_hours_start: string | null
          workspace_id: string | null
        }
        Insert: {
          created_at?: string | null
          default_queue?: string | null
          description?: string | null
          id?: string | null
          logo_url?: string | null
          name?: string | null
          settings?: Json | null
          timezone?: string | null
          updated_at?: string | null
          working_hours_end?: string | null
          working_hours_start?: string | null
          workspace_id?: string | null
        }
        Update: {
          created_at?: string | null
          default_queue?: string | null
          description?: string | null
          id?: string | null
          logo_url?: string | null
          name?: string | null
          settings?: Json | null
          timezone?: string | null
          updated_at?: string | null
          working_hours_end?: string | null
          working_hours_start?: string | null
          workspace_id?: string | null
        }
        Relationships: []
      }
      workspaces: {
        Row: {
          config: Json | null
          created_at: string | null
          id: string | null
          name: string | null
          owner_id: string | null
          plan: string | null
          slug: string | null
          updated_at: string | null
        }
        Insert: {
          config?: Json | null
          created_at?: string | null
          id?: string | null
          name?: string | null
          owner_id?: string | null
          plan?: string | null
          slug?: string | null
          updated_at?: string | null
        }
        Update: {
          config?: Json | null
          created_at?: string | null
          id?: string | null
          name?: string | null
          owner_id?: string | null
          plan?: string | null
          slug?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      zapp_audit_log: {
        Row: {
          action: string | null
          created_at: string | null
          entity_id: string | null
          entity_type: string | null
          id: string | null
          ip_address: string | null
          metadata: Json | null
          new_data: Json | null
          old_data: Json | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          action?: string | null
          created_at?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string | null
          ip_address?: string | null
          metadata?: Json | null
          new_data?: Json | null
          old_data?: Json | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string | null
          created_at?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string | null
          ip_address?: string | null
          metadata?: Json | null
          new_data?: Json | null
          old_data?: Json | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      check_user_permission: {
        Args: { p_permission_name: string }
        Returns: boolean
      }
      fn_apply_connection_update: { Args: { p_event: Json }; Returns: Json }
      generate_transfer_ticket: { Args: never; Returns: string }
      get_companies_by_phones_batch: {
        Args: { p_phones: string[] }
        Returns: {
          company: string
          full_name: string
          lead_status: string
          phone_number: string
        }[]
      }
      get_contact_intelligence_by_phone: {
        Args: { p_phone: string }
        Returns: Json
      }
      increment_webhook_rate_limit: {
        Args: {
          p_event_type: string
          p_instance_id: string
          p_limit: number
          p_window_start: string
        }
        Returns: {
          current_count: number
          is_allowed: boolean
        }[]
      }
      is_instance_paused: {
        Args: { p_instance_name: string }
        Returns: boolean
      }
      is_queue_member_of_contact: {
        Args: { _contact_id: string; _user_id: string }
        Returns: boolean
      }
      log_rls_denied: {
        Args: { p_context: Json; p_required_role: string; p_resource: string }
        Returns: undefined
      }
      pg_buffercache_pages: { Args: never; Returns: Record<string, unknown>[] }
      purge_old_query_telemetry: { Args: { p_days: number }; Returns: number }
      rpc_app_bootstrap: { Args: never; Returns: Json }
      rpc_dashboard_init: {
        Args: {
          p_agent_id?: string
          p_date_from?: string
          p_date_to?: string
          p_queue_id?: string
        }
        Returns: Json
      }
      rpc_email_cleanup_old_events: {
        Args: { p_retention_days?: number }
        Returns: Json
      }
      rpc_get_contact:
        | { Args: { p_contact_id: string }; Returns: Json }
        | {
            Args: { p_instance?: string; p_remote_jid: string }
            Returns: Database["public"]["Views"]["evolution_contacts"]["Row"][]
            SetofOptions: {
              from: "*"
              to: "evolution_contacts"
              isOneToOne: false
              isSetofReturn: true
            }
          }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
    }
    Enums: {
      ai_provider_type:
        | "lovable_ai"
        | "openai_compatible"
        | "google_gemini"
        | "custom_webhook"
        | "custom_agent"
      app_role:
        | "admin"
        | "manager"
        | "supervisor"
        | "agent"
        | "special_agent"
        | "dev"
      channel_type:
        | "whatsapp"
        | "instagram"
        | "telegram"
        | "messenger"
        | "webchat"
        | "email"
      service_account_type:
        | "google_sheets"
        | "google_docs"
        | "google_calendar"
        | "google_drive"
        | "dropbox"
    }
    CompositeTypes: {
      dblink_pkey_results: {
        position: number | null
        colname: string | null
      }
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

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
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
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
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
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
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
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
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      ai_provider_type: [
        "lovable_ai",
        "openai_compatible",
        "google_gemini",
        "custom_webhook",
        "custom_agent",
      ],
      app_role: [
        "admin",
        "manager",
        "supervisor",
        "agent",
        "special_agent",
        "dev",
      ],
      channel_type: [
        "whatsapp",
        "instagram",
        "telegram",
        "messenger",
        "webchat",
        "email",
      ],
      service_account_type: [
        "google_sheets",
        "google_docs",
        "google_calendar",
        "google_drive",
        "dropbox",
      ],
    },
  },
} as const
