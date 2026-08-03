export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  evo: {
    Tables: {
      _backup_evolution_alerts_20260802: {
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
      _backup_evolution_contacts_20260802: {
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
      _evolution_contacts_backup_20260801: {
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
          id: string
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
          id: string
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
          id?: string
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
      _secure_config: {
        Row: {
          created_at: string | null
          key: string
          value: string
        }
        Insert: {
          created_at?: string | null
          key: string
          value: string
        }
        Update: {
          created_at?: string | null
          key?: string
          value?: string
        }
        Relationships: []
      }
      _snapshot_version_state: {
        Row: {
          current_version: number
          last_increment_at: string
          operation_count: number
          snapshot_id: number
          table_affected: string | null
        }
        Insert: {
          current_version?: number
          last_increment_at?: string
          operation_count?: number
          snapshot_id?: number
          table_affected?: string | null
        }
        Update: {
          current_version?: number
          last_increment_at?: string
          operation_count?: number
          snapshot_id?: number
          table_affected?: string | null
        }
        Relationships: []
      }
      contact_id_graveyard: {
        Row: {
          audit_user_id: string | null
          deleted_at: string
          deleted_contact_id: string
          expiration_date: string
          original_remote_jid: string
          reason: string
        }
        Insert: {
          audit_user_id?: string | null
          deleted_at?: string
          deleted_contact_id: string
          expiration_date?: string
          original_remote_jid: string
          reason: string
        }
        Update: {
          audit_user_id?: string | null
          deleted_at?: string
          deleted_contact_id?: string
          expiration_date?: string
          original_remote_jid?: string
          reason?: string
        }
        Relationships: []
      }
      evolution_alert_cooldown: {
        Row: {
          alert_key: string
          consecutive_count: number
          cooldown_minutes: number
          last_dispatch_status: string | null
          last_payload: Json | null
          last_sent_at: string
          last_severity: string
          last_severity_rank: number
          updated_at: string
        }
        Insert: {
          alert_key: string
          consecutive_count?: number
          cooldown_minutes?: number
          last_dispatch_status?: string | null
          last_payload?: Json | null
          last_sent_at?: string
          last_severity: string
          last_severity_rank: number
          updated_at?: string
        }
        Update: {
          alert_key?: string
          consecutive_count?: number
          cooldown_minutes?: number
          last_dispatch_status?: string | null
          last_payload?: Json | null
          last_sent_at?: string
          last_severity?: string
          last_severity_rank?: number
          updated_at?: string
        }
        Relationships: []
      }
      evolution_alerts: {
        Row: {
          acknowledged: boolean | null
          acknowledged_at: string | null
          acknowledged_by: string | null
          alert_type: string
          contact_id: string | null
          created_at: string | null
          description: string | null
          escalated_at: string | null
          id: string
          message: string | null
          notified_at: string | null
          payload: Json | null
          remote_jid: string | null
          resolved: boolean | null
          resolved_at: string | null
          resolved_by: string | null
          severity: string
          title: string | null
        }
        Insert: {
          acknowledged?: boolean | null
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          alert_type: string
          contact_id?: string | null
          created_at?: string | null
          description?: string | null
          escalated_at?: string | null
          id?: string
          message?: string | null
          notified_at?: string | null
          payload?: Json | null
          remote_jid?: string | null
          resolved?: boolean | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity: string
          title?: string | null
        }
        Update: {
          acknowledged?: boolean | null
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          alert_type?: string
          contact_id?: string | null
          created_at?: string | null
          description?: string | null
          escalated_at?: string | null
          id?: string
          message?: string | null
          notified_at?: string | null
          payload?: Json | null
          remote_jid?: string | null
          resolved?: boolean | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          title?: string | null
        }
        Relationships: []
      }
      evolution_api_consumers: {
        Row: {
          api_key_secret_ref: string | null
          consumer_type: string
          created_at: string
          criticality: string
          description: string | null
          endpoints_called: string[] | null
          id: string
          last_verified_at: string | null
          name: string
          notes: string | null
          rotation_needed: boolean
          status: string
          updated_at: string
        }
        Insert: {
          api_key_secret_ref?: string | null
          consumer_type: string
          created_at?: string
          criticality?: string
          description?: string | null
          endpoints_called?: string[] | null
          id: string
          last_verified_at?: string | null
          name: string
          notes?: string | null
          rotation_needed?: boolean
          status?: string
          updated_at?: string
        }
        Update: {
          api_key_secret_ref?: string | null
          consumer_type?: string
          created_at?: string
          criticality?: string
          description?: string | null
          endpoints_called?: string[] | null
          id?: string
          last_verified_at?: string | null
          name?: string
          notes?: string | null
          rotation_needed?: boolean
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      evolution_audit_log: {
        Row: {
          action: string
          changes: Json | null
          created_at: string | null
          entity_id: string | null
          entity_type: string
          id: string
          ip_address: string | null
          metadata: Json | null
          new_values: Json | null
          old_values: Json | null
          performed_by: string
          performed_by_type: string | null
          session_id: string | null
          user_agent: string | null
        }
        Insert: {
          action: string
          changes?: Json | null
          created_at?: string | null
          entity_id?: string | null
          entity_type: string
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          new_values?: Json | null
          old_values?: Json | null
          performed_by?: string
          performed_by_type?: string | null
          session_id?: string | null
          user_agent?: string | null
        }
        Update: {
          action?: string
          changes?: Json | null
          created_at?: string | null
          entity_id?: string | null
          entity_type?: string
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          new_values?: Json | null
          old_values?: Json | null
          performed_by?: string
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
          id: string
          status: string | null
          trigger_data: Json | null
        }
        Insert: {
          action_result?: Json | null
          automation_id?: string | null
          contact_id?: string | null
          error_message?: string | null
          executed_at?: string | null
          id?: string
          status?: string | null
          trigger_data?: Json | null
        }
        Update: {
          action_result?: Json | null
          automation_id?: string | null
          contact_id?: string | null
          error_message?: string | null
          executed_at?: string | null
          id?: string
          status?: string | null
          trigger_data?: Json | null
        }
        Relationships: []
      }
      evolution_automations: {
        Row: {
          action_config: Json
          action_type: string
          conditions: Json | null
          created_at: string | null
          delay_minutes: number | null
          description: string | null
          id: string
          is_active: boolean | null
          last_run_at: string | null
          name: string
          run_count: number | null
          trigger_config: Json
          trigger_type: string
          updated_at: string | null
        }
        Insert: {
          action_config?: Json
          action_type: string
          conditions?: Json | null
          created_at?: string | null
          delay_minutes?: number | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          last_run_at?: string | null
          name: string
          run_count?: number | null
          trigger_config?: Json
          trigger_type: string
          updated_at?: string | null
        }
        Update: {
          action_config?: Json
          action_type?: string
          conditions?: Json | null
          created_at?: string | null
          delay_minutes?: number | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          last_run_at?: string | null
          name?: string
          run_count?: number | null
          trigger_config?: Json
          trigger_type?: string
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
          id: string
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
          id?: string
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
          id?: string
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
          event_type: string
          id: string
          instance_name: string | null
          is_recovery: boolean | null
          messages_reset: number | null
          new_state: string | null
          occurred_at: string
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
          event_type: string
          id?: string
          instance_name?: string | null
          is_recovery?: boolean | null
          messages_reset?: number | null
          new_state?: string | null
          occurred_at?: string
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
          event_type?: string
          id?: string
          instance_name?: string | null
          is_recovery?: boolean | null
          messages_reset?: number | null
          new_state?: string | null
          occurred_at?: string
          payload?: Json | null
          prev_state?: string | null
          reason_code?: string | null
          source_event_id?: string | null
        }
        Relationships: []
      }
      evolution_bitrix_field_mapping: {
        Row: {
          bitrix_field: string
          created_at: string | null
          entity_type: string
          id: string
          is_active: boolean | null
          local_field: string
          sync_direction: string | null
          transform_config: Json | null
          transform_type: string | null
        }
        Insert: {
          bitrix_field: string
          created_at?: string | null
          entity_type: string
          id?: string
          is_active?: boolean | null
          local_field: string
          sync_direction?: string | null
          transform_config?: Json | null
          transform_type?: string | null
        }
        Update: {
          bitrix_field?: string
          created_at?: string | null
          entity_type?: string
          id?: string
          is_active?: boolean | null
          local_field?: string
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
          entity_type: string
          id: string
          last_error: string | null
          local_id: string
          max_attempts: number | null
          next_attempt_at: string | null
          operation: string
          payload: Json
          processed_at: string | null
          status: string | null
        }
        Insert: {
          attempts?: number | null
          created_at?: string | null
          entity_type: string
          id?: string
          last_error?: string | null
          local_id: string
          max_attempts?: number | null
          next_attempt_at?: string | null
          operation: string
          payload: Json
          processed_at?: string | null
          status?: string | null
        }
        Update: {
          attempts?: number | null
          created_at?: string | null
          entity_type?: string
          id?: string
          last_error?: string | null
          local_id?: string
          max_attempts?: number | null
          next_attempt_at?: string | null
          operation?: string
          payload?: Json
          processed_at?: string | null
          status?: string | null
        }
        Relationships: []
      }
      evolution_bitrix_sync: {
        Row: {
          bitrix_entity_type: string
          bitrix_id: number
          bitrix_version: number | null
          created_at: string | null
          entity_type: string
          id: string
          last_error: string | null
          last_sync_at: string | null
          local_id: string
          local_version: number | null
          sync_status: string | null
          updated_at: string | null
        }
        Insert: {
          bitrix_entity_type: string
          bitrix_id: number
          bitrix_version?: number | null
          created_at?: string | null
          entity_type: string
          id?: string
          last_error?: string | null
          last_sync_at?: string | null
          local_id: string
          local_version?: number | null
          sync_status?: string | null
          updated_at?: string | null
        }
        Update: {
          bitrix_entity_type?: string
          bitrix_id?: number
          bitrix_version?: number | null
          created_at?: string | null
          entity_type?: string
          id?: string
          last_error?: string | null
          last_sync_at?: string | null
          local_id?: string
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
          id: string
          is_active: boolean | null
          reason: string | null
          remote_jid: string
        }
        Insert: {
          blocked_at?: string | null
          blocked_by?: string | null
          created_at?: string | null
          description?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          reason?: string | null
          remote_jid: string
        }
        Update: {
          blocked_at?: string | null
          blocked_by?: string | null
          created_at?: string | null
          description?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          reason?: string | null
          remote_jid?: string
        }
        Relationships: []
      }
      evolution_bootstrap_log: {
        Row: {
          created_at: string | null
          id: string
          instance_id: string
          instance_name: string
          notes: string | null
          rabbitmq_events_count: number | null
          settings_applied: Json | null
          status: string | null
          triggered_by: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          instance_id: string
          instance_name: string
          notes?: string | null
          rabbitmq_events_count?: number | null
          settings_applied?: Json | null
          status?: string | null
          triggered_by?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          instance_id?: string
          instance_name?: string
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
          id: string
          instance_name: string | null
          media_url: string | null
          messages_per_minute: number | null
          name: string
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
          id?: string
          instance_name?: string | null
          media_url?: string | null
          messages_per_minute?: number | null
          name: string
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
          id?: string
          instance_name?: string | null
          media_url?: string | null
          messages_per_minute?: number | null
          name?: string
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
          burn_in_passed: boolean
          burn_in_start: string
          id: number
          last_reset_reason: string | null
          updated_at: string
        }
        Insert: {
          burn_in_passed?: boolean
          burn_in_start?: string
          id?: number
          last_reset_reason?: string | null
          updated_at?: string
        }
        Update: {
          burn_in_passed?: boolean
          burn_in_start?: string
          id?: number
          last_reset_reason?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      evolution_business_hours: {
        Row: {
          close_time: string
          created_at: string | null
          day_of_week: number
          id: string
          is_closed: boolean | null
          open_time: string
          timezone: string | null
        }
        Insert: {
          close_time: string
          created_at?: string | null
          day_of_week: number
          id?: string
          is_closed?: boolean | null
          open_time: string
          timezone?: string | null
        }
        Update: {
          close_time?: string
          created_at?: string | null
          day_of_week?: number
          id?: string
          is_closed?: boolean | null
          open_time?: string
          timezone?: string | null
        }
        Relationships: []
      }
      evolution_calls: {
        Row: {
          call_id: string
          call_status: string
          call_type: string
          contact_id: string | null
          created_at: string | null
          direction: string
          duration_seconds: number | null
          ended_at: string | null
          id: string
          instance_name: string | null
          missed_callback_sent: boolean | null
          raw_data: Json | null
          remote_jid: string
          started_at: string | null
        }
        Insert: {
          call_id: string
          call_status: string
          call_type: string
          contact_id?: string | null
          created_at?: string | null
          direction: string
          duration_seconds?: number | null
          ended_at?: string | null
          id?: string
          instance_name?: string | null
          missed_callback_sent?: boolean | null
          raw_data?: Json | null
          remote_jid: string
          started_at?: string | null
        }
        Update: {
          call_id?: string
          call_status?: string
          call_type?: string
          contact_id?: string | null
          created_at?: string | null
          direction?: string
          duration_seconds?: number | null
          ended_at?: string | null
          id?: string
          instance_name?: string | null
          missed_callback_sent?: boolean | null
          raw_data?: Json | null
          remote_jid?: string
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
          id: string
          message_id: string | null
          read_at: string | null
          remote_jid: string
          sent_at: string | null
          status: string | null
        }
        Insert: {
          campaign_id?: string | null
          contact_name?: string | null
          created_at?: string | null
          delivered_at?: string | null
          error_message?: string | null
          id?: string
          message_id?: string | null
          read_at?: string | null
          remote_jid: string
          sent_at?: string | null
          status?: string | null
        }
        Update: {
          campaign_id?: string | null
          contact_name?: string | null
          created_at?: string | null
          delivered_at?: string | null
          error_message?: string | null
          id?: string
          message_id?: string | null
          read_at?: string | null
          remote_jid?: string
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
          id: string
          messages_per_minute: number | null
          name: string
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
          id?: string
          messages_per_minute?: number | null
          name: string
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
          id?: string
          messages_per_minute?: number | null
          name?: string
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
          id: string
          model_used: string
          remote_jid: string
          response_text: string
          response_time_ms: number | null
          tokens_used: number | null
        }
        Insert: {
          created_at?: string | null
          feedback?: string | null
          id?: string
          model_used?: string
          remote_jid: string
          response_text: string
          response_time_ms?: number | null
          tokens_used?: number | null
        }
        Update: {
          created_at?: string | null
          feedback?: string | null
          id?: string
          model_used?: string
          remote_jid?: string
          response_text?: string
          response_time_ms?: number | null
          tokens_used?: number | null
        }
        Relationships: []
      }
      evolution_connection_history: {
        Row: {
          created_at: string | null
          duration_seconds: number | null
          id: string
          instance_name: string
          metadata: Json | null
          previous_state: string | null
          state: string
        }
        Insert: {
          created_at?: string | null
          duration_seconds?: number | null
          id?: string
          instance_name?: string
          metadata?: Json | null
          previous_state?: string | null
          state: string
        }
        Update: {
          created_at?: string | null
          duration_seconds?: number | null
          id?: string
          instance_name?: string
          metadata?: Json | null
          previous_state?: string | null
          state?: string
        }
        Relationships: []
      }
      evolution_contact_attachments: {
        Row: {
          created_at: string | null
          description: string | null
          file_name: string
          file_size: number | null
          file_type: string | null
          file_url: string | null
          id: string
          remote_jid: string
          storage_path: string | null
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          file_name: string
          file_size?: number | null
          file_type?: string | null
          file_url?: string | null
          id?: string
          remote_jid: string
          storage_path?: string | null
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          file_name?: string
          file_size?: number | null
          file_type?: string | null
          file_url?: string | null
          id?: string
          remote_jid?: string
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
          id: string
          is_active: boolean | null
          reason: string | null
          remote_jid: string
        }
        Insert: {
          blocked_at?: string | null
          blocked_by?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          reason?: string | null
          remote_jid: string
        }
        Update: {
          blocked_at?: string | null
          blocked_by?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          reason?: string | null
          remote_jid?: string
        }
        Relationships: []
      }
      evolution_contact_notes: {
        Row: {
          content: string
          created_at: string | null
          created_by: string | null
          id: string
          is_pinned: boolean | null
          note_type: string | null
          remote_jid: string
          updated_at: string | null
        }
        Insert: {
          content: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_pinned?: boolean | null
          note_type?: string | null
          remote_jid: string
          updated_at?: string | null
        }
        Update: {
          content?: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_pinned?: boolean | null
          note_type?: string | null
          remote_jid?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      evolution_contact_rate_limits: {
        Row: {
          created_at: string | null
          id: string
          is_rate_limited: boolean | null
          message_count: number | null
          remote_jid: string
          updated_at: string | null
          window_start: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_rate_limited?: boolean | null
          message_count?: number | null
          remote_jid: string
          updated_at?: string | null
          window_start?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          is_rate_limited?: boolean | null
          message_count?: number | null
          remote_jid?: string
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
          id: string
          instance_name: string | null
          last_message_at: string | null
          last_name: string | null
          lead_score: number | null
          lead_source: string | null
          lead_status: string | null
          lgpd_consent_at: string | null
          lgpd_consent_channel: string | null
          lgpd_data_sharing: boolean
          lgpd_deletion_requested_at: string | null
          lgpd_last_updated_at: string | null
          lgpd_marketing_consent: boolean
          lgpd_opt_out_at: string | null
          lgpd_profiling: boolean
          merge_source_id: string | null
          message_count: number
          nickname: string | null
          notes: string | null
          phone_number: string | null
          pii_masked_at: string | null
          profile_picture_url: string | null
          push_name: string | null
          queue_id: string | null
          raw_data: Json | null
          remote_jid: string
          role_title: string | null
          search_vector: unknown
          tags: string[] | null
          total_messages: number | null
          total_purchases: number | null
          updated_at: string | null
          version: number
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
          id?: string
          instance_name?: string | null
          last_message_at?: string | null
          last_name?: string | null
          lead_score?: number | null
          lead_source?: string | null
          lead_status?: string | null
          lgpd_consent_at?: string | null
          lgpd_consent_channel?: string | null
          lgpd_data_sharing?: boolean
          lgpd_deletion_requested_at?: string | null
          lgpd_last_updated_at?: string | null
          lgpd_marketing_consent?: boolean
          lgpd_opt_out_at?: string | null
          lgpd_profiling?: boolean
          merge_source_id?: string | null
          message_count?: number
          nickname?: string | null
          notes?: string | null
          phone_number?: string | null
          pii_masked_at?: string | null
          profile_picture_url?: string | null
          push_name?: string | null
          queue_id?: string | null
          raw_data?: Json | null
          remote_jid: string
          role_title?: string | null
          search_vector?: unknown
          tags?: string[] | null
          total_messages?: number | null
          total_purchases?: number | null
          updated_at?: string | null
          version?: number
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
          id?: string
          instance_name?: string | null
          last_message_at?: string | null
          last_name?: string | null
          lead_score?: number | null
          lead_source?: string | null
          lead_status?: string | null
          lgpd_consent_at?: string | null
          lgpd_consent_channel?: string | null
          lgpd_data_sharing?: boolean
          lgpd_deletion_requested_at?: string | null
          lgpd_last_updated_at?: string | null
          lgpd_marketing_consent?: boolean
          lgpd_opt_out_at?: string | null
          lgpd_profiling?: boolean
          merge_source_id?: string | null
          message_count?: number
          nickname?: string | null
          notes?: string | null
          phone_number?: string | null
          pii_masked_at?: string | null
          profile_picture_url?: string | null
          push_name?: string | null
          queue_id?: string | null
          raw_data?: Json | null
          remote_jid?: string
          role_title?: string | null
          search_vector?: unknown
          tags?: string[] | null
          total_messages?: number | null
          total_purchases?: number | null
          updated_at?: string | null
          version?: number
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
          id: string
          instance_name: string
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
          remote_jid: string
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
          id?: string
          instance_name?: string
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
          remote_jid: string
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
          id?: string
          instance_name?: string
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
          remote_jid?: string
          resolution_at?: string | null
          resolution_seconds?: number | null
          satisfaction_comment?: string | null
          satisfaction_score?: number | null
          status?: string | null
          subject?: string | null
          unread_count?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "evolution_conversations_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "evolution_contacts"
            referencedColumns: ["id"]
          },
        ]
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
          id: string
          instance_name: string
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
          remote_jid: string
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
          id?: string
          instance_name?: string
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
          remote_jid: string
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
          id?: string
          instance_name?: string
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
          remote_jid?: string
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
          id: string
          instance_name: string
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
          remote_jid: string
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
          id?: string
          instance_name?: string
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
          remote_jid: string
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
          id?: string
          instance_name?: string
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
          remote_jid?: string
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
          id: string
          instance_name: string
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
          remote_jid: string
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
          id?: string
          instance_name?: string
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
          remote_jid: string
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
          id?: string
          instance_name?: string
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
          remote_jid?: string
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
          id: string
          instance_name: string
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
          remote_jid: string
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
          id?: string
          instance_name?: string
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
          remote_jid: string
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
          id?: string
          instance_name?: string
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
          remote_jid?: string
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
          id: string
          instance_name: string
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
          remote_jid: string
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
          id?: string
          instance_name?: string
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
          remote_jid: string
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
          id?: string
          instance_name?: string
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
          remote_jid?: string
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
          id: string
          instance_name: string
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
          remote_jid: string
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
          id?: string
          instance_name?: string
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
          remote_jid: string
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
          id?: string
          instance_name?: string
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
          remote_jid?: string
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
          id: string
          instance_name: string
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
          remote_jid: string
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
          id?: string
          instance_name?: string
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
          remote_jid: string
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
          id?: string
          instance_name?: string
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
          remote_jid?: string
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
          id: string
          instance_name: string
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
          remote_jid: string
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
          id?: string
          instance_name?: string
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
          remote_jid: string
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
          id?: string
          instance_name?: string
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
          remote_jid?: string
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
          id: string
          instance_name: string
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
          remote_jid: string
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
          id?: string
          instance_name?: string
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
          remote_jid: string
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
          id?: string
          instance_name?: string
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
          remote_jid?: string
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
          id: string
          instance_name: string
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
          remote_jid: string
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
          id?: string
          instance_name?: string
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
          remote_jid: string
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
          id?: string
          instance_name?: string
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
          remote_jid?: string
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
          id: string
          instance_name: string
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
          remote_jid: string
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
          id?: string
          instance_name?: string
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
          remote_jid: string
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
          id?: string
          instance_name?: string
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
          remote_jid?: string
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
          id: string
          instance_name: string
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
          remote_jid: string
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
          id?: string
          instance_name?: string
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
          remote_jid: string
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
          id?: string
          instance_name?: string
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
          remote_jid?: string
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
          id: string
          instance_name: string
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
          remote_jid: string
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
          id?: string
          instance_name?: string
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
          remote_jid: string
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
          id?: string
          instance_name?: string
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
          remote_jid?: string
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
          id: string
          instance_name: string
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
          remote_jid: string
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
          id?: string
          instance_name?: string
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
          remote_jid: string
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
          id?: string
          instance_name?: string
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
          remote_jid?: string
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
          id: string
          instance_name: string
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
          remote_jid: string
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
          id?: string
          instance_name?: string
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
          remote_jid: string
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
          id?: string
          instance_name?: string
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
          remote_jid?: string
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
          id: string
          instance_name: string
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
          remote_jid: string
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
          id?: string
          instance_name?: string
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
          remote_jid: string
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
          id?: string
          instance_name?: string
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
          remote_jid?: string
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
          id: string
          instance_name: string
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
          remote_jid: string
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
          id?: string
          instance_name?: string
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
          remote_jid: string
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
          id?: string
          instance_name?: string
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
          remote_jid?: string
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
          id: string
          instance_name: string
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
          remote_jid: string
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
          id?: string
          instance_name?: string
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
          remote_jid: string
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
          id?: string
          instance_name?: string
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
          remote_jid?: string
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
          id: string
          instance_name: string
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
          remote_jid: string
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
          id?: string
          instance_name?: string
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
          remote_jid: string
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
          id?: string
          instance_name?: string
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
          remote_jid?: string
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
          id: string
          instance_name: string
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
          remote_jid: string
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
          id?: string
          instance_name?: string
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
          remote_jid: string
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
          id?: string
          instance_name?: string
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
          remote_jid?: string
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
          id: string
          instance_name: string
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
          remote_jid: string
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
          id?: string
          instance_name?: string
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
          remote_jid: string
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
          id?: string
          instance_name?: string
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
          remote_jid?: string
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
          id: string
          instance_name: string
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
          remote_jid: string
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
          id?: string
          instance_name?: string
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
          remote_jid: string
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
          id?: string
          instance_name?: string
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
          remote_jid?: string
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
          id: string
          instance_name: string
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
          remote_jid: string
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
          id?: string
          instance_name?: string
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
          remote_jid: string
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
          id?: string
          instance_name?: string
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
          remote_jid?: string
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
          id: string
          lead_to_deal_rate: number | null
          messages_received: number | null
          messages_sent: number | null
          metric_date: string
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
          id?: string
          lead_to_deal_rate?: number | null
          messages_received?: number | null
          messages_sent?: number | null
          metric_date: string
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
          id?: string
          lead_to_deal_rate?: number | null
          messages_received?: number | null
          messages_sent?: number | null
          metric_date?: string
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
          deal_number: number
          deleted_at: string | null
          description: string | null
          discount_percent: number | null
          expected_close_date: string | null
          id: string
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
          title: string
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
          deal_number?: number
          deleted_at?: string | null
          description?: string | null
          discount_percent?: number | null
          expected_close_date?: string | null
          id?: string
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
          title: string
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
          deal_number?: number
          deleted_at?: string | null
          description?: string | null
          discount_percent?: number | null
          expected_close_date?: string | null
          id?: string
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
          title?: string
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
          id: string
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
          id?: string
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
          id?: string
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
          ef_name: string
          ef_version: string | null
          function_name: string | null
          id: number
          level: string
          message: string | null
          trace_id: string | null
        }
        Insert: {
          context?: Json | null
          created_at?: string | null
          duration_ms?: number | null
          ef_name: string
          ef_version?: string | null
          function_name?: string | null
          id?: number
          level: string
          message?: string | null
          trace_id?: string | null
        }
        Update: {
          context?: Json | null
          created_at?: string | null
          duration_ms?: number | null
          ef_name?: string
          ef_version?: string | null
          function_name?: string | null
          id?: number
          level?: string
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
          event_type: string
          id: string
          instance: string | null
          instance_name: string | null
          payload: Json | null
          ts: string | null
        }
        Insert: {
          action?: string | null
          created_at?: string | null
          error_message?: string | null
          event_type: string
          id?: string
          instance?: string | null
          instance_name?: string | null
          payload?: Json | null
          ts?: string | null
        }
        Update: {
          action?: string | null
          created_at?: string | null
          error_message?: string | null
          event_type?: string
          id?: string
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
          id: string
          is_active: boolean | null
          name: string
          run_count: number | null
          sequence_group: string | null
          sequence_order: number | null
          template_id: string | null
          trigger_config: Json
          trigger_type: string
          updated_at: string | null
        }
        Insert: {
          conditions?: Json | null
          created_at?: string | null
          delay_hours?: number | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          run_count?: number | null
          sequence_group?: string | null
          sequence_order?: number | null
          template_id?: string | null
          trigger_config?: Json
          trigger_type: string
          updated_at?: string | null
        }
        Update: {
          conditions?: Json | null
          created_at?: string | null
          delay_hours?: number | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          run_count?: number | null
          sequence_group?: string | null
          sequence_order?: number | null
          template_id?: string | null
          trigger_config?: Json
          trigger_type?: string
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
          followup_type: string
          id: string
          instance_name: string | null
          max_attempts: number | null
          metadata: Json | null
          response_at: string | null
          scheduled_at: string
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
          followup_type: string
          id?: string
          instance_name?: string | null
          max_attempts?: number | null
          metadata?: Json | null
          response_at?: string | null
          scheduled_at: string
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
          followup_type?: string
          id?: string
          instance_name?: string | null
          max_attempts?: number | null
          metadata?: Json | null
          response_at?: string | null
          scheduled_at?: string
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
          id: string
          is_from_admin: boolean | null
          media_url: string | null
          mentions: string[] | null
          message_id: string
          message_type: string | null
          quoted_message_id: string | null
          sender_jid: string
          sender_name: string | null
        }
        Insert: {
          content?: string | null
          created_at?: string | null
          group_id?: string | null
          id?: string
          is_from_admin?: boolean | null
          media_url?: string | null
          mentions?: string[] | null
          message_id: string
          message_type?: string | null
          quoted_message_id?: string | null
          sender_jid: string
          sender_name?: string | null
        }
        Update: {
          content?: string | null
          created_at?: string | null
          group_id?: string | null
          id?: string
          is_from_admin?: boolean | null
          media_url?: string | null
          mentions?: string[] | null
          message_id?: string
          message_type?: string | null
          quoted_message_id?: string | null
          sender_jid?: string
          sender_name?: string | null
        }
        Relationships: []
      }
      evolution_group_participants: {
        Row: {
          contact_id: string | null
          group_id: string | null
          id: string
          is_active: boolean | null
          joined_at: string | null
          left_at: string | null
          participant_jid: string
          role: string | null
        }
        Insert: {
          contact_id?: string | null
          group_id?: string | null
          id?: string
          is_active?: boolean | null
          joined_at?: string | null
          left_at?: string | null
          participant_jid: string
          role?: string | null
        }
        Update: {
          contact_id?: string | null
          group_id?: string | null
          id?: string
          is_active?: boolean | null
          joined_at?: string | null
          left_at?: string | null
          participant_jid?: string
          role?: string | null
        }
        Relationships: []
      }
      evolution_group_rules: {
        Row: {
          action_type: string
          action_value: string | null
          created_at: string | null
          execution_count: number | null
          group_id: string | null
          id: string
          is_active: boolean | null
          last_executed_at: string | null
          rule_type: string
          trigger_value: string | null
        }
        Insert: {
          action_type: string
          action_value?: string | null
          created_at?: string | null
          execution_count?: number | null
          group_id?: string | null
          id?: string
          is_active?: boolean | null
          last_executed_at?: string | null
          rule_type: string
          trigger_value?: string | null
        }
        Update: {
          action_type?: string
          action_value?: string | null
          created_at?: string | null
          execution_count?: number | null
          group_id?: string | null
          id?: string
          is_active?: boolean | null
          last_executed_at?: string | null
          rule_type?: string
          trigger_value?: string | null
        }
        Relationships: []
      }
      evolution_group_stats: {
        Row: {
          active_participants: number | null
          group_id: string | null
          id: string
          left_members: number | null
          links_count: number | null
          media_count: number | null
          messages_count: number | null
          new_members: number | null
          stat_date: string
        }
        Insert: {
          active_participants?: number | null
          group_id?: string | null
          id?: string
          left_members?: number | null
          links_count?: number | null
          media_count?: number | null
          messages_count?: number | null
          new_members?: number | null
          stat_date: string
        }
        Update: {
          active_participants?: number | null
          group_id?: string | null
          id?: string
          left_members?: number | null
          links_count?: number | null
          media_count?: number | null
          messages_count?: number | null
          new_members?: number | null
          stat_date?: string
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
          group_jid: string
          id: string
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
          group_jid: string
          id?: string
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
          group_jid?: string
          id?: string
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
          heartbeat_at: string
          id: string
          service_name: string
        }
        Insert: {
          cycles_since_last?: number | null
          details?: Json | null
          heartbeat_at?: string
          id?: string
          service_name?: string
        }
        Update: {
          cycles_since_last?: number | null
          details?: Json | null
          heartbeat_at?: string
          id?: string
          service_name?: string
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
          id: string
          instance_name: string
          metadata: Json | null
          online_instances: number | null
          performed_at: string
          response_time_ms: number | null
          status: string
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
          id?: string
          instance_name: string
          metadata?: Json | null
          online_instances?: number | null
          performed_at?: string
          response_time_ms?: number | null
          status?: string
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
          id?: string
          instance_name?: string
          metadata?: Json | null
          online_instances?: number | null
          performed_at?: string
          response_time_ms?: number | null
          status?: string
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
          date: string
          id: string
          is_half_day: boolean | null
          name: string
        }
        Insert: {
          auto_reply_message?: string | null
          close_time?: string | null
          created_at?: string | null
          date: string
          id?: string
          is_half_day?: boolean | null
          name: string
        }
        Update: {
          auto_reply_message?: string | null
          close_time?: string | null
          created_at?: string | null
          date?: string
          id?: string
          is_half_day?: boolean | null
          name?: string
        }
        Relationships: []
      }
      evolution_incident_runbook: {
        Row: {
          category: string
          created_at: string
          escalation: string | null
          estimated_minutes: number | null
          id: string
          last_drilled_at: string | null
          severity: string
          steps: Json
          success_criteria: string[]
          title: string
          triggers: string[]
          updated_at: string
        }
        Insert: {
          category: string
          created_at?: string
          escalation?: string | null
          estimated_minutes?: number | null
          id: string
          last_drilled_at?: string | null
          severity: string
          steps: Json
          success_criteria: string[]
          title: string
          triggers: string[]
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          escalation?: string | null
          estimated_minutes?: number | null
          id?: string
          last_drilled_at?: string | null
          severity?: string
          steps?: Json
          success_criteria?: string[]
          title?: string
          triggers?: string[]
          updated_at?: string
        }
        Relationships: []
      }
      evolution_instance_credentials: {
        Row: {
          api_key: string
          api_url: string
          connection_id: string | null
          created_at: string
          department: string | null
          display_name: string | null
          health_status: string
          id: string
          instance_name: string
          instance_token: string | null
          is_active: boolean
          last_health_check: string | null
          notes: string | null
          online_instances: number | null
          total_instances: number | null
          updated_at: string
          webhook_url: string | null
        }
        Insert: {
          api_key: string
          api_url?: string
          connection_id?: string | null
          created_at?: string
          department?: string | null
          display_name?: string | null
          health_status?: string
          id?: string
          instance_name: string
          instance_token?: string | null
          is_active?: boolean
          last_health_check?: string | null
          notes?: string | null
          online_instances?: number | null
          total_instances?: number | null
          updated_at?: string
          webhook_url?: string | null
        }
        Update: {
          api_key?: string
          api_url?: string
          connection_id?: string | null
          created_at?: string
          department?: string | null
          display_name?: string | null
          health_status?: string
          id?: string
          instance_name?: string
          instance_token?: string | null
          is_active?: boolean
          last_health_check?: string | null
          notes?: string | null
          online_instances?: number | null
          total_instances?: number | null
          updated_at?: string
          webhook_url?: string | null
        }
        Relationships: []
      }
      evolution_ip_blocklist: {
        Row: {
          auto_blocked: boolean
          created_at: string
          first_seen: string
          hit_count: number
          ip_address: string
          last_seen: string
          reason: string
          unblocked_at: string | null
          updated_at: string
        }
        Insert: {
          auto_blocked?: boolean
          created_at?: string
          first_seen: string
          hit_count?: number
          ip_address: string
          last_seen: string
          reason: string
          unblocked_at?: string | null
          updated_at?: string
        }
        Update: {
          auto_blocked?: boolean
          created_at?: string
          first_seen?: string
          hit_count?: number
          ip_address?: string
          last_seen?: string
          reason?: string
          unblocked_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      evolution_ip_watch: {
        Row: {
          created_at: string
          endpoint: string | null
          http_status: number
          id: number
          ip_address: string
          user_agent: string | null
        }
        Insert: {
          created_at?: string
          endpoint?: string | null
          http_status?: number
          id?: number
          ip_address: string
          user_agent?: string | null
        }
        Update: {
          created_at?: string
          endpoint?: string | null
          http_status?: number
          id?: number
          ip_address?: string
          user_agent?: string | null
        }
        Relationships: []
      }
      evolution_keyword_automations: {
        Row: {
          cooldown_minutes: number | null
          created_at: string | null
          hit_count: number | null
          id: string
          is_active: boolean | null
          is_case_sensitive: boolean | null
          keyword: string
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
          id?: string
          is_active?: boolean | null
          is_case_sensitive?: boolean | null
          keyword: string
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
          id?: string
          is_active?: boolean | null
          is_case_sensitive?: boolean | null
          keyword?: string
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
          id: string
          is_active: boolean | null
          label_id: string | null
          remote_jid: string
          removed_at: string | null
        }
        Insert: {
          associated_at?: string | null
          contact_id?: string | null
          conversation_id?: string | null
          id?: string
          is_active?: boolean | null
          label_id?: string | null
          remote_jid: string
          removed_at?: string | null
        }
        Update: {
          associated_at?: string | null
          contact_id?: string | null
          conversation_id?: string | null
          id?: string
          is_active?: boolean | null
          label_id?: string | null
          remote_jid?: string
          removed_at?: string | null
        }
        Relationships: []
      }
      evolution_labels: {
        Row: {
          color: string | null
          color_hex: string | null
          created_at: string | null
          id: string
          instance_name: string | null
          is_active: boolean | null
          label_id: string
          name: string
          predefined_id: string | null
          updated_at: string | null
        }
        Insert: {
          color?: string | null
          color_hex?: string | null
          created_at?: string | null
          id?: string
          instance_name?: string | null
          is_active?: boolean | null
          label_id: string
          name: string
          predefined_id?: string | null
          updated_at?: string | null
        }
        Update: {
          color?: string | null
          color_hex?: string | null
          created_at?: string | null
          id?: string
          instance_name?: string | null
          is_active?: boolean | null
          label_id?: string
          name?: string
          predefined_id?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      evolution_logpatch_audit: {
        Row: {
          boot_at: string | null
          container_id: string
          force_update: number | null
          id: string
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
          container_id: string
          force_update?: number | null
          id?: string
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
          container_id?: string
          force_update?: number | null
          id?: string
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
          id: string
          is_animated: boolean | null
          media_status: string | null
          media_type: string
          message_id: string
          mime_type: string | null
          remote_jid: string
          storage_bucket: string | null
          storage_path: string | null
          storage_path_clean: string | null
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
          id?: string
          is_animated?: boolean | null
          media_status?: string | null
          media_type: string
          message_id: string
          mime_type?: string | null
          remote_jid: string
          storage_bucket?: string | null
          storage_path?: string | null
          storage_path_clean?: string | null
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
          id?: string
          is_animated?: boolean | null
          media_status?: string | null
          media_type?: string
          message_id?: string
          mime_type?: string | null
          remote_jid?: string
          storage_bucket?: string | null
          storage_path?: string | null
          storage_path_clean?: string | null
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
          id: string
          instance_name: string | null
          max_attempts: number | null
          media_filename: string | null
          media_url: string | null
          message_type: string | null
          metadata: Json | null
          priority: number | null
          read_at: string | null
          remote_jid: string
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
          id?: string
          instance_name?: string | null
          max_attempts?: number | null
          media_filename?: string | null
          media_url?: string | null
          message_type?: string | null
          metadata?: Json | null
          priority?: number | null
          read_at?: string | null
          remote_jid: string
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
          id?: string
          instance_name?: string | null
          max_attempts?: number | null
          media_filename?: string | null
          media_url?: string | null
          message_type?: string | null
          metadata?: Json | null
          priority?: number | null
          read_at?: string | null
          remote_jid?: string
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
          category: string
          content: string
          created_at: string | null
          created_by: string | null
          footer_text: string | null
          header_content: string | null
          header_type: string | null
          id: string
          instance_name: string | null
          is_active: boolean | null
          language: string | null
          last_used_at: string | null
          name: string
          rejection_reason: string | null
          updated_at: string | null
          usage_count: number | null
          variables: Json | null
        }
        Insert: {
          approval_status?: string | null
          approved_at?: string | null
          buttons?: Json | null
          category?: string
          content: string
          created_at?: string | null
          created_by?: string | null
          footer_text?: string | null
          header_content?: string | null
          header_type?: string | null
          id?: string
          instance_name?: string | null
          is_active?: boolean | null
          language?: string | null
          last_used_at?: string | null
          name: string
          rejection_reason?: string | null
          updated_at?: string | null
          usage_count?: number | null
          variables?: Json | null
        }
        Update: {
          approval_status?: string | null
          approved_at?: string | null
          buttons?: Json | null
          category?: string
          content?: string
          created_at?: string | null
          created_by?: string | null
          footer_text?: string | null
          header_content?: string | null
          header_type?: string | null
          id?: string
          instance_name?: string | null
          is_active?: boolean | null
          language?: string | null
          last_used_at?: string | null
          name?: string
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
          created_at: string
          deleted_at: string | null
          direction: string | null
          edited_at: string | null
          error_code: string | null
          error_reason: string | null
          follow_up_at: string | null
          follow_up_done: boolean | null
          from_me: boolean | null
          id: string
          instance_name: string
          is_important: boolean | null
          is_read: boolean
          is_starred: boolean | null
          link_preview: Json | null
          media_bucket: string | null
          media_filename: string | null
          media_meta: Json | null
          media_mimetype: string | null
          media_path: string | null
          media_sha256: string | null
          media_size: number | null
          media_status: string | null
          media_type: string | null
          media_url: string | null
          message_id: string | null
          message_type: string
          notes: string | null
          payload: Json | null
          push_name: string | null
          quoted_message_id: string | null
          raw_data: Json | null
          remote_jid: string
          reply_to_id: string | null
          retry_attempt: number | null
          retry_total: number | null
          sent_by_bot: boolean | null
          sentiment: string | null
          status: string | null
          status_at: string | null
          sticker_id: string | null
          tags: string[] | null
          template_name: string | null
          transcription: string | null
          transcription_status: string | null
          updated_at: string | null
        }
        Insert: {
          audio_meme_id?: string | null
          caption?: string | null
          category?: string | null
          contact_id?: string | null
          content?: string | null
          conversation_id?: string | null
          created_at?: string
          deleted_at?: string | null
          direction?: string | null
          edited_at?: string | null
          error_code?: string | null
          error_reason?: string | null
          follow_up_at?: string | null
          follow_up_done?: boolean | null
          from_me?: boolean | null
          id?: string
          instance_name: string
          is_important?: boolean | null
          is_read?: boolean
          is_starred?: boolean | null
          link_preview?: Json | null
          media_bucket?: string | null
          media_filename?: string | null
          media_meta?: Json | null
          media_mimetype?: string | null
          media_path?: string | null
          media_sha256?: string | null
          media_size?: number | null
          media_status?: string | null
          media_type?: string | null
          media_url?: string | null
          message_id?: string | null
          message_type?: string
          notes?: string | null
          payload?: Json | null
          push_name?: string | null
          quoted_message_id?: string | null
          raw_data?: Json | null
          remote_jid: string
          reply_to_id?: string | null
          retry_attempt?: number | null
          retry_total?: number | null
          sent_by_bot?: boolean | null
          sentiment?: string | null
          status?: string | null
          status_at?: string | null
          sticker_id?: string | null
          tags?: string[] | null
          template_name?: string | null
          transcription?: string | null
          transcription_status?: string | null
          updated_at?: string | null
        }
        Update: {
          audio_meme_id?: string | null
          caption?: string | null
          category?: string | null
          contact_id?: string | null
          content?: string | null
          conversation_id?: string | null
          created_at?: string
          deleted_at?: string | null
          direction?: string | null
          edited_at?: string | null
          error_code?: string | null
          error_reason?: string | null
          follow_up_at?: string | null
          follow_up_done?: boolean | null
          from_me?: boolean | null
          id?: string
          instance_name?: string
          is_important?: boolean | null
          is_read?: boolean
          is_starred?: boolean | null
          link_preview?: Json | null
          media_bucket?: string | null
          media_filename?: string | null
          media_meta?: Json | null
          media_mimetype?: string | null
          media_path?: string | null
          media_sha256?: string | null
          media_size?: number | null
          media_status?: string | null
          media_type?: string | null
          media_url?: string | null
          message_id?: string | null
          message_type?: string
          notes?: string | null
          payload?: Json | null
          push_name?: string | null
          quoted_message_id?: string | null
          raw_data?: Json | null
          remote_jid?: string
          reply_to_id?: string | null
          retry_attempt?: number | null
          retry_total?: number | null
          sent_by_bot?: boolean | null
          sentiment?: string | null
          status?: string | null
          status_at?: string | null
          sticker_id?: string | null
          tags?: string[] | null
          template_name?: string | null
          transcription?: string | null
          transcription_status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_evolution_messages_contact"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "evolution_contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      evolution_messages_artes: {
        Row: {
          audio_meme_id: string | null
          caption: string | null
          category: string | null
          contact_id: string | null
          content: string | null
          conversation_id: string | null
          created_at: string
          deleted_at: string | null
          direction: string | null
          edited_at: string | null
          error_code: string | null
          error_reason: string | null
          follow_up_at: string | null
          follow_up_done: boolean | null
          from_me: boolean | null
          id: string
          instance_name: string
          is_important: boolean | null
          is_read: boolean
          is_starred: boolean | null
          link_preview: Json | null
          media_bucket: string | null
          media_filename: string | null
          media_meta: Json | null
          media_mimetype: string | null
          media_path: string | null
          media_sha256: string | null
          media_size: number | null
          media_status: string | null
          media_type: string | null
          media_url: string | null
          message_id: string | null
          message_type: string
          notes: string | null
          payload: Json | null
          push_name: string | null
          quoted_message_id: string | null
          raw_data: Json | null
          remote_jid: string
          reply_to_id: string | null
          retry_attempt: number | null
          retry_total: number | null
          sent_by_bot: boolean | null
          sentiment: string | null
          status: string | null
          status_at: string | null
          sticker_id: string | null
          tags: string[] | null
          template_name: string | null
          transcription: string | null
          transcription_status: string | null
          updated_at: string | null
        }
        Insert: {
          audio_meme_id?: string | null
          caption?: string | null
          category?: string | null
          contact_id?: string | null
          content?: string | null
          conversation_id?: string | null
          created_at?: string
          deleted_at?: string | null
          direction?: string | null
          edited_at?: string | null
          error_code?: string | null
          error_reason?: string | null
          follow_up_at?: string | null
          follow_up_done?: boolean | null
          from_me?: boolean | null
          id?: string
          instance_name: string
          is_important?: boolean | null
          is_read?: boolean
          is_starred?: boolean | null
          link_preview?: Json | null
          media_bucket?: string | null
          media_filename?: string | null
          media_meta?: Json | null
          media_mimetype?: string | null
          media_path?: string | null
          media_sha256?: string | null
          media_size?: number | null
          media_status?: string | null
          media_type?: string | null
          media_url?: string | null
          message_id?: string | null
          message_type?: string
          notes?: string | null
          payload?: Json | null
          push_name?: string | null
          quoted_message_id?: string | null
          raw_data?: Json | null
          remote_jid: string
          reply_to_id?: string | null
          retry_attempt?: number | null
          retry_total?: number | null
          sent_by_bot?: boolean | null
          sentiment?: string | null
          status?: string | null
          status_at?: string | null
          sticker_id?: string | null
          tags?: string[] | null
          template_name?: string | null
          transcription?: string | null
          transcription_status?: string | null
          updated_at?: string | null
        }
        Update: {
          audio_meme_id?: string | null
          caption?: string | null
          category?: string | null
          contact_id?: string | null
          content?: string | null
          conversation_id?: string | null
          created_at?: string
          deleted_at?: string | null
          direction?: string | null
          edited_at?: string | null
          error_code?: string | null
          error_reason?: string | null
          follow_up_at?: string | null
          follow_up_done?: boolean | null
          from_me?: boolean | null
          id?: string
          instance_name?: string
          is_important?: boolean | null
          is_read?: boolean
          is_starred?: boolean | null
          link_preview?: Json | null
          media_bucket?: string | null
          media_filename?: string | null
          media_meta?: Json | null
          media_mimetype?: string | null
          media_path?: string | null
          media_sha256?: string | null
          media_size?: number | null
          media_status?: string | null
          media_type?: string | null
          media_url?: string | null
          message_id?: string | null
          message_type?: string
          notes?: string | null
          payload?: Json | null
          push_name?: string | null
          quoted_message_id?: string | null
          raw_data?: Json | null
          remote_jid?: string
          reply_to_id?: string | null
          retry_attempt?: number | null
          retry_total?: number | null
          sent_by_bot?: boolean | null
          sentiment?: string | null
          status?: string | null
          status_at?: string | null
          sticker_id?: string | null
          tags?: string[] | null
          template_name?: string | null
          transcription?: string | null
          transcription_status?: string | null
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
          created_at: string
          deleted_at: string | null
          direction: string | null
          edited_at: string | null
          error_code: string | null
          error_reason: string | null
          follow_up_at: string | null
          follow_up_done: boolean | null
          from_me: boolean | null
          id: string
          instance_name: string
          is_important: boolean | null
          is_read: boolean
          is_starred: boolean | null
          link_preview: Json | null
          media_bucket: string | null
          media_filename: string | null
          media_meta: Json | null
          media_mimetype: string | null
          media_path: string | null
          media_sha256: string | null
          media_size: number | null
          media_status: string | null
          media_type: string | null
          media_url: string | null
          message_id: string | null
          message_type: string
          notes: string | null
          payload: Json | null
          push_name: string | null
          quoted_message_id: string | null
          raw_data: Json | null
          remote_jid: string
          reply_to_id: string | null
          retry_attempt: number | null
          retry_total: number | null
          sent_by_bot: boolean | null
          sentiment: string | null
          status: string | null
          status_at: string | null
          sticker_id: string | null
          tags: string[] | null
          template_name: string | null
          transcription: string | null
          transcription_status: string | null
          updated_at: string | null
        }
        Insert: {
          audio_meme_id?: string | null
          caption?: string | null
          category?: string | null
          contact_id?: string | null
          content?: string | null
          conversation_id?: string | null
          created_at?: string
          deleted_at?: string | null
          direction?: string | null
          edited_at?: string | null
          error_code?: string | null
          error_reason?: string | null
          follow_up_at?: string | null
          follow_up_done?: boolean | null
          from_me?: boolean | null
          id?: string
          instance_name: string
          is_important?: boolean | null
          is_read?: boolean
          is_starred?: boolean | null
          link_preview?: Json | null
          media_bucket?: string | null
          media_filename?: string | null
          media_meta?: Json | null
          media_mimetype?: string | null
          media_path?: string | null
          media_sha256?: string | null
          media_size?: number | null
          media_status?: string | null
          media_type?: string | null
          media_url?: string | null
          message_id?: string | null
          message_type?: string
          notes?: string | null
          payload?: Json | null
          push_name?: string | null
          quoted_message_id?: string | null
          raw_data?: Json | null
          remote_jid: string
          reply_to_id?: string | null
          retry_attempt?: number | null
          retry_total?: number | null
          sent_by_bot?: boolean | null
          sentiment?: string | null
          status?: string | null
          status_at?: string | null
          sticker_id?: string | null
          tags?: string[] | null
          template_name?: string | null
          transcription?: string | null
          transcription_status?: string | null
          updated_at?: string | null
        }
        Update: {
          audio_meme_id?: string | null
          caption?: string | null
          category?: string | null
          contact_id?: string | null
          content?: string | null
          conversation_id?: string | null
          created_at?: string
          deleted_at?: string | null
          direction?: string | null
          edited_at?: string | null
          error_code?: string | null
          error_reason?: string | null
          follow_up_at?: string | null
          follow_up_done?: boolean | null
          from_me?: boolean | null
          id?: string
          instance_name?: string
          is_important?: boolean | null
          is_read?: boolean
          is_starred?: boolean | null
          link_preview?: Json | null
          media_bucket?: string | null
          media_filename?: string | null
          media_meta?: Json | null
          media_mimetype?: string | null
          media_path?: string | null
          media_sha256?: string | null
          media_size?: number | null
          media_status?: string | null
          media_type?: string | null
          media_url?: string | null
          message_id?: string | null
          message_type?: string
          notes?: string | null
          payload?: Json | null
          push_name?: string | null
          quoted_message_id?: string | null
          raw_data?: Json | null
          remote_jid?: string
          reply_to_id?: string | null
          retry_attempt?: number | null
          retry_total?: number | null
          sent_by_bot?: boolean | null
          sentiment?: string | null
          status?: string | null
          status_at?: string | null
          sticker_id?: string | null
          tags?: string[] | null
          template_name?: string | null
          transcription?: string | null
          transcription_status?: string | null
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
          created_at: string
          deleted_at: string | null
          direction: string | null
          edited_at: string | null
          error_code: string | null
          error_reason: string | null
          follow_up_at: string | null
          follow_up_done: boolean | null
          from_me: boolean | null
          id: string
          instance_name: string
          is_important: boolean | null
          is_read: boolean
          is_starred: boolean | null
          link_preview: Json | null
          media_bucket: string | null
          media_filename: string | null
          media_meta: Json | null
          media_mimetype: string | null
          media_path: string | null
          media_sha256: string | null
          media_size: number | null
          media_status: string | null
          media_type: string | null
          media_url: string | null
          message_id: string | null
          message_type: string
          notes: string | null
          payload: Json | null
          push_name: string | null
          quoted_message_id: string | null
          raw_data: Json | null
          remote_jid: string
          reply_to_id: string | null
          retry_attempt: number | null
          retry_total: number | null
          sent_by_bot: boolean | null
          sentiment: string | null
          status: string | null
          status_at: string | null
          sticker_id: string | null
          tags: string[] | null
          template_name: string | null
          transcription: string | null
          transcription_status: string | null
          updated_at: string | null
        }
        Insert: {
          audio_meme_id?: string | null
          caption?: string | null
          category?: string | null
          contact_id?: string | null
          content?: string | null
          conversation_id?: string | null
          created_at?: string
          deleted_at?: string | null
          direction?: string | null
          edited_at?: string | null
          error_code?: string | null
          error_reason?: string | null
          follow_up_at?: string | null
          follow_up_done?: boolean | null
          from_me?: boolean | null
          id?: string
          instance_name: string
          is_important?: boolean | null
          is_read?: boolean
          is_starred?: boolean | null
          link_preview?: Json | null
          media_bucket?: string | null
          media_filename?: string | null
          media_meta?: Json | null
          media_mimetype?: string | null
          media_path?: string | null
          media_sha256?: string | null
          media_size?: number | null
          media_status?: string | null
          media_type?: string | null
          media_url?: string | null
          message_id?: string | null
          message_type?: string
          notes?: string | null
          payload?: Json | null
          push_name?: string | null
          quoted_message_id?: string | null
          raw_data?: Json | null
          remote_jid: string
          reply_to_id?: string | null
          retry_attempt?: number | null
          retry_total?: number | null
          sent_by_bot?: boolean | null
          sentiment?: string | null
          status?: string | null
          status_at?: string | null
          sticker_id?: string | null
          tags?: string[] | null
          template_name?: string | null
          transcription?: string | null
          transcription_status?: string | null
          updated_at?: string | null
        }
        Update: {
          audio_meme_id?: string | null
          caption?: string | null
          category?: string | null
          contact_id?: string | null
          content?: string | null
          conversation_id?: string | null
          created_at?: string
          deleted_at?: string | null
          direction?: string | null
          edited_at?: string | null
          error_code?: string | null
          error_reason?: string | null
          follow_up_at?: string | null
          follow_up_done?: boolean | null
          from_me?: boolean | null
          id?: string
          instance_name?: string
          is_important?: boolean | null
          is_read?: boolean
          is_starred?: boolean | null
          link_preview?: Json | null
          media_bucket?: string | null
          media_filename?: string | null
          media_meta?: Json | null
          media_mimetype?: string | null
          media_path?: string | null
          media_sha256?: string | null
          media_size?: number | null
          media_status?: string | null
          media_type?: string | null
          media_url?: string | null
          message_id?: string | null
          message_type?: string
          notes?: string | null
          payload?: Json | null
          push_name?: string | null
          quoted_message_id?: string | null
          raw_data?: Json | null
          remote_jid?: string
          reply_to_id?: string | null
          retry_attempt?: number | null
          retry_total?: number | null
          sent_by_bot?: boolean | null
          sentiment?: string | null
          status?: string | null
          status_at?: string | null
          sticker_id?: string | null
          tags?: string[] | null
          template_name?: string | null
          transcription?: string | null
          transcription_status?: string | null
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
          created_at: string
          deleted_at: string | null
          direction: string | null
          edited_at: string | null
          error_code: string | null
          error_reason: string | null
          follow_up_at: string | null
          follow_up_done: boolean | null
          from_me: boolean | null
          id: string
          instance_name: string
          is_important: boolean | null
          is_read: boolean
          is_starred: boolean | null
          link_preview: Json | null
          media_bucket: string | null
          media_filename: string | null
          media_meta: Json | null
          media_mimetype: string | null
          media_path: string | null
          media_sha256: string | null
          media_size: number | null
          media_status: string | null
          media_type: string | null
          media_url: string | null
          message_id: string | null
          message_type: string
          notes: string | null
          payload: Json | null
          push_name: string | null
          quoted_message_id: string | null
          raw_data: Json | null
          remote_jid: string
          reply_to_id: string | null
          retry_attempt: number | null
          retry_total: number | null
          sent_by_bot: boolean | null
          sentiment: string | null
          status: string | null
          status_at: string | null
          sticker_id: string | null
          tags: string[] | null
          template_name: string | null
          transcription: string | null
          transcription_status: string | null
          updated_at: string | null
        }
        Insert: {
          audio_meme_id?: string | null
          caption?: string | null
          category?: string | null
          contact_id?: string | null
          content?: string | null
          conversation_id?: string | null
          created_at?: string
          deleted_at?: string | null
          direction?: string | null
          edited_at?: string | null
          error_code?: string | null
          error_reason?: string | null
          follow_up_at?: string | null
          follow_up_done?: boolean | null
          from_me?: boolean | null
          id?: string
          instance_name: string
          is_important?: boolean | null
          is_read?: boolean
          is_starred?: boolean | null
          link_preview?: Json | null
          media_bucket?: string | null
          media_filename?: string | null
          media_meta?: Json | null
          media_mimetype?: string | null
          media_path?: string | null
          media_sha256?: string | null
          media_size?: number | null
          media_status?: string | null
          media_type?: string | null
          media_url?: string | null
          message_id?: string | null
          message_type?: string
          notes?: string | null
          payload?: Json | null
          push_name?: string | null
          quoted_message_id?: string | null
          raw_data?: Json | null
          remote_jid: string
          reply_to_id?: string | null
          retry_attempt?: number | null
          retry_total?: number | null
          sent_by_bot?: boolean | null
          sentiment?: string | null
          status?: string | null
          status_at?: string | null
          sticker_id?: string | null
          tags?: string[] | null
          template_name?: string | null
          transcription?: string | null
          transcription_status?: string | null
          updated_at?: string | null
        }
        Update: {
          audio_meme_id?: string | null
          caption?: string | null
          category?: string | null
          contact_id?: string | null
          content?: string | null
          conversation_id?: string | null
          created_at?: string
          deleted_at?: string | null
          direction?: string | null
          edited_at?: string | null
          error_code?: string | null
          error_reason?: string | null
          follow_up_at?: string | null
          follow_up_done?: boolean | null
          from_me?: boolean | null
          id?: string
          instance_name?: string
          is_important?: boolean | null
          is_read?: boolean
          is_starred?: boolean | null
          link_preview?: Json | null
          media_bucket?: string | null
          media_filename?: string | null
          media_meta?: Json | null
          media_mimetype?: string | null
          media_path?: string | null
          media_sha256?: string | null
          media_size?: number | null
          media_status?: string | null
          media_type?: string | null
          media_url?: string | null
          message_id?: string | null
          message_type?: string
          notes?: string | null
          payload?: Json | null
          push_name?: string | null
          quoted_message_id?: string | null
          raw_data?: Json | null
          remote_jid?: string
          reply_to_id?: string | null
          retry_attempt?: number | null
          retry_total?: number | null
          sent_by_bot?: boolean | null
          sentiment?: string | null
          status?: string | null
          status_at?: string | null
          sticker_id?: string | null
          tags?: string[] | null
          template_name?: string | null
          transcription?: string | null
          transcription_status?: string | null
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
          created_at: string
          deleted_at: string | null
          direction: string | null
          edited_at: string | null
          error_code: string | null
          error_reason: string | null
          follow_up_at: string | null
          follow_up_done: boolean | null
          from_me: boolean | null
          id: string
          instance_name: string
          is_important: boolean | null
          is_read: boolean
          is_starred: boolean | null
          link_preview: Json | null
          media_bucket: string | null
          media_filename: string | null
          media_meta: Json | null
          media_mimetype: string | null
          media_path: string | null
          media_sha256: string | null
          media_size: number | null
          media_status: string | null
          media_type: string | null
          media_url: string | null
          message_id: string | null
          message_type: string
          notes: string | null
          payload: Json | null
          push_name: string | null
          quoted_message_id: string | null
          raw_data: Json | null
          remote_jid: string
          reply_to_id: string | null
          retry_attempt: number | null
          retry_total: number | null
          sent_by_bot: boolean | null
          sentiment: string | null
          status: string | null
          status_at: string | null
          sticker_id: string | null
          tags: string[] | null
          template_name: string | null
          transcription: string | null
          transcription_status: string | null
          updated_at: string | null
        }
        Insert: {
          audio_meme_id?: string | null
          caption?: string | null
          category?: string | null
          contact_id?: string | null
          content?: string | null
          conversation_id?: string | null
          created_at?: string
          deleted_at?: string | null
          direction?: string | null
          edited_at?: string | null
          error_code?: string | null
          error_reason?: string | null
          follow_up_at?: string | null
          follow_up_done?: boolean | null
          from_me?: boolean | null
          id?: string
          instance_name: string
          is_important?: boolean | null
          is_read?: boolean
          is_starred?: boolean | null
          link_preview?: Json | null
          media_bucket?: string | null
          media_filename?: string | null
          media_meta?: Json | null
          media_mimetype?: string | null
          media_path?: string | null
          media_sha256?: string | null
          media_size?: number | null
          media_status?: string | null
          media_type?: string | null
          media_url?: string | null
          message_id?: string | null
          message_type?: string
          notes?: string | null
          payload?: Json | null
          push_name?: string | null
          quoted_message_id?: string | null
          raw_data?: Json | null
          remote_jid: string
          reply_to_id?: string | null
          retry_attempt?: number | null
          retry_total?: number | null
          sent_by_bot?: boolean | null
          sentiment?: string | null
          status?: string | null
          status_at?: string | null
          sticker_id?: string | null
          tags?: string[] | null
          template_name?: string | null
          transcription?: string | null
          transcription_status?: string | null
          updated_at?: string | null
        }
        Update: {
          audio_meme_id?: string | null
          caption?: string | null
          category?: string | null
          contact_id?: string | null
          content?: string | null
          conversation_id?: string | null
          created_at?: string
          deleted_at?: string | null
          direction?: string | null
          edited_at?: string | null
          error_code?: string | null
          error_reason?: string | null
          follow_up_at?: string | null
          follow_up_done?: boolean | null
          from_me?: boolean | null
          id?: string
          instance_name?: string
          is_important?: boolean | null
          is_read?: boolean
          is_starred?: boolean | null
          link_preview?: Json | null
          media_bucket?: string | null
          media_filename?: string | null
          media_meta?: Json | null
          media_mimetype?: string | null
          media_path?: string | null
          media_sha256?: string | null
          media_size?: number | null
          media_status?: string | null
          media_type?: string | null
          media_url?: string | null
          message_id?: string | null
          message_type?: string
          notes?: string | null
          payload?: Json | null
          push_name?: string | null
          quoted_message_id?: string | null
          raw_data?: Json | null
          remote_jid?: string
          reply_to_id?: string | null
          retry_attempt?: number | null
          retry_total?: number | null
          sent_by_bot?: boolean | null
          sentiment?: string | null
          status?: string | null
          status_at?: string | null
          sticker_id?: string | null
          tags?: string[] | null
          template_name?: string | null
          transcription?: string | null
          transcription_status?: string | null
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
          created_at: string
          deleted_at: string | null
          direction: string | null
          edited_at: string | null
          error_code: string | null
          error_reason: string | null
          follow_up_at: string | null
          follow_up_done: boolean | null
          from_me: boolean | null
          id: string
          instance_name: string
          is_important: boolean | null
          is_read: boolean
          is_starred: boolean | null
          link_preview: Json | null
          media_bucket: string | null
          media_filename: string | null
          media_meta: Json | null
          media_mimetype: string | null
          media_path: string | null
          media_sha256: string | null
          media_size: number | null
          media_status: string | null
          media_type: string | null
          media_url: string | null
          message_id: string | null
          message_type: string
          notes: string | null
          payload: Json | null
          push_name: string | null
          quoted_message_id: string | null
          raw_data: Json | null
          remote_jid: string
          reply_to_id: string | null
          retry_attempt: number | null
          retry_total: number | null
          sent_by_bot: boolean | null
          sentiment: string | null
          status: string | null
          status_at: string | null
          sticker_id: string | null
          tags: string[] | null
          template_name: string | null
          transcription: string | null
          transcription_status: string | null
          updated_at: string | null
        }
        Insert: {
          audio_meme_id?: string | null
          caption?: string | null
          category?: string | null
          contact_id?: string | null
          content?: string | null
          conversation_id?: string | null
          created_at?: string
          deleted_at?: string | null
          direction?: string | null
          edited_at?: string | null
          error_code?: string | null
          error_reason?: string | null
          follow_up_at?: string | null
          follow_up_done?: boolean | null
          from_me?: boolean | null
          id?: string
          instance_name: string
          is_important?: boolean | null
          is_read?: boolean
          is_starred?: boolean | null
          link_preview?: Json | null
          media_bucket?: string | null
          media_filename?: string | null
          media_meta?: Json | null
          media_mimetype?: string | null
          media_path?: string | null
          media_sha256?: string | null
          media_size?: number | null
          media_status?: string | null
          media_type?: string | null
          media_url?: string | null
          message_id?: string | null
          message_type?: string
          notes?: string | null
          payload?: Json | null
          push_name?: string | null
          quoted_message_id?: string | null
          raw_data?: Json | null
          remote_jid: string
          reply_to_id?: string | null
          retry_attempt?: number | null
          retry_total?: number | null
          sent_by_bot?: boolean | null
          sentiment?: string | null
          status?: string | null
          status_at?: string | null
          sticker_id?: string | null
          tags?: string[] | null
          template_name?: string | null
          transcription?: string | null
          transcription_status?: string | null
          updated_at?: string | null
        }
        Update: {
          audio_meme_id?: string | null
          caption?: string | null
          category?: string | null
          contact_id?: string | null
          content?: string | null
          conversation_id?: string | null
          created_at?: string
          deleted_at?: string | null
          direction?: string | null
          edited_at?: string | null
          error_code?: string | null
          error_reason?: string | null
          follow_up_at?: string | null
          follow_up_done?: boolean | null
          from_me?: boolean | null
          id?: string
          instance_name?: string
          is_important?: boolean | null
          is_read?: boolean
          is_starred?: boolean | null
          link_preview?: Json | null
          media_bucket?: string | null
          media_filename?: string | null
          media_meta?: Json | null
          media_mimetype?: string | null
          media_path?: string | null
          media_sha256?: string | null
          media_size?: number | null
          media_status?: string | null
          media_type?: string | null
          media_url?: string | null
          message_id?: string | null
          message_type?: string
          notes?: string | null
          payload?: Json | null
          push_name?: string | null
          quoted_message_id?: string | null
          raw_data?: Json | null
          remote_jid?: string
          reply_to_id?: string | null
          retry_attempt?: number | null
          retry_total?: number | null
          sent_by_bot?: boolean | null
          sentiment?: string | null
          status?: string | null
          status_at?: string | null
          sticker_id?: string | null
          tags?: string[] | null
          template_name?: string | null
          transcription?: string | null
          transcription_status?: string | null
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
          created_at: string
          deleted_at: string | null
          direction: string | null
          edited_at: string | null
          error_code: string | null
          error_reason: string | null
          follow_up_at: string | null
          follow_up_done: boolean | null
          from_me: boolean | null
          id: string
          instance_name: string
          is_important: boolean | null
          is_read: boolean
          is_starred: boolean | null
          link_preview: Json | null
          media_bucket: string | null
          media_filename: string | null
          media_meta: Json | null
          media_mimetype: string | null
          media_path: string | null
          media_sha256: string | null
          media_size: number | null
          media_status: string | null
          media_type: string | null
          media_url: string | null
          message_id: string | null
          message_type: string
          notes: string | null
          payload: Json | null
          push_name: string | null
          quoted_message_id: string | null
          raw_data: Json | null
          remote_jid: string
          reply_to_id: string | null
          retry_attempt: number | null
          retry_total: number | null
          sent_by_bot: boolean | null
          sentiment: string | null
          status: string | null
          status_at: string | null
          sticker_id: string | null
          tags: string[] | null
          template_name: string | null
          transcription: string | null
          transcription_status: string | null
          updated_at: string | null
        }
        Insert: {
          audio_meme_id?: string | null
          caption?: string | null
          category?: string | null
          contact_id?: string | null
          content?: string | null
          conversation_id?: string | null
          created_at?: string
          deleted_at?: string | null
          direction?: string | null
          edited_at?: string | null
          error_code?: string | null
          error_reason?: string | null
          follow_up_at?: string | null
          follow_up_done?: boolean | null
          from_me?: boolean | null
          id?: string
          instance_name: string
          is_important?: boolean | null
          is_read?: boolean
          is_starred?: boolean | null
          link_preview?: Json | null
          media_bucket?: string | null
          media_filename?: string | null
          media_meta?: Json | null
          media_mimetype?: string | null
          media_path?: string | null
          media_sha256?: string | null
          media_size?: number | null
          media_status?: string | null
          media_type?: string | null
          media_url?: string | null
          message_id?: string | null
          message_type?: string
          notes?: string | null
          payload?: Json | null
          push_name?: string | null
          quoted_message_id?: string | null
          raw_data?: Json | null
          remote_jid: string
          reply_to_id?: string | null
          retry_attempt?: number | null
          retry_total?: number | null
          sent_by_bot?: boolean | null
          sentiment?: string | null
          status?: string | null
          status_at?: string | null
          sticker_id?: string | null
          tags?: string[] | null
          template_name?: string | null
          transcription?: string | null
          transcription_status?: string | null
          updated_at?: string | null
        }
        Update: {
          audio_meme_id?: string | null
          caption?: string | null
          category?: string | null
          contact_id?: string | null
          content?: string | null
          conversation_id?: string | null
          created_at?: string
          deleted_at?: string | null
          direction?: string | null
          edited_at?: string | null
          error_code?: string | null
          error_reason?: string | null
          follow_up_at?: string | null
          follow_up_done?: boolean | null
          from_me?: boolean | null
          id?: string
          instance_name?: string
          is_important?: boolean | null
          is_read?: boolean
          is_starred?: boolean | null
          link_preview?: Json | null
          media_bucket?: string | null
          media_filename?: string | null
          media_meta?: Json | null
          media_mimetype?: string | null
          media_path?: string | null
          media_sha256?: string | null
          media_size?: number | null
          media_status?: string | null
          media_type?: string | null
          media_url?: string | null
          message_id?: string | null
          message_type?: string
          notes?: string | null
          payload?: Json | null
          push_name?: string | null
          quoted_message_id?: string | null
          raw_data?: Json | null
          remote_jid?: string
          reply_to_id?: string | null
          retry_attempt?: number | null
          retry_total?: number | null
          sent_by_bot?: boolean | null
          sentiment?: string | null
          status?: string | null
          status_at?: string | null
          sticker_id?: string | null
          tags?: string[] | null
          template_name?: string | null
          transcription?: string | null
          transcription_status?: string | null
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
          created_at: string
          deleted_at: string | null
          direction: string | null
          edited_at: string | null
          error_code: string | null
          error_reason: string | null
          follow_up_at: string | null
          follow_up_done: boolean | null
          from_me: boolean | null
          id: string
          instance_name: string
          is_important: boolean | null
          is_read: boolean
          is_starred: boolean | null
          link_preview: Json | null
          media_bucket: string | null
          media_filename: string | null
          media_meta: Json | null
          media_mimetype: string | null
          media_path: string | null
          media_sha256: string | null
          media_size: number | null
          media_status: string | null
          media_type: string | null
          media_url: string | null
          message_id: string | null
          message_type: string
          notes: string | null
          payload: Json | null
          push_name: string | null
          quoted_message_id: string | null
          raw_data: Json | null
          remote_jid: string
          reply_to_id: string | null
          retry_attempt: number | null
          retry_total: number | null
          sent_by_bot: boolean | null
          sentiment: string | null
          status: string | null
          status_at: string | null
          sticker_id: string | null
          tags: string[] | null
          template_name: string | null
          transcription: string | null
          transcription_status: string | null
          updated_at: string | null
        }
        Insert: {
          audio_meme_id?: string | null
          caption?: string | null
          category?: string | null
          contact_id?: string | null
          content?: string | null
          conversation_id?: string | null
          created_at?: string
          deleted_at?: string | null
          direction?: string | null
          edited_at?: string | null
          error_code?: string | null
          error_reason?: string | null
          follow_up_at?: string | null
          follow_up_done?: boolean | null
          from_me?: boolean | null
          id?: string
          instance_name: string
          is_important?: boolean | null
          is_read?: boolean
          is_starred?: boolean | null
          link_preview?: Json | null
          media_bucket?: string | null
          media_filename?: string | null
          media_meta?: Json | null
          media_mimetype?: string | null
          media_path?: string | null
          media_sha256?: string | null
          media_size?: number | null
          media_status?: string | null
          media_type?: string | null
          media_url?: string | null
          message_id?: string | null
          message_type?: string
          notes?: string | null
          payload?: Json | null
          push_name?: string | null
          quoted_message_id?: string | null
          raw_data?: Json | null
          remote_jid: string
          reply_to_id?: string | null
          retry_attempt?: number | null
          retry_total?: number | null
          sent_by_bot?: boolean | null
          sentiment?: string | null
          status?: string | null
          status_at?: string | null
          sticker_id?: string | null
          tags?: string[] | null
          template_name?: string | null
          transcription?: string | null
          transcription_status?: string | null
          updated_at?: string | null
        }
        Update: {
          audio_meme_id?: string | null
          caption?: string | null
          category?: string | null
          contact_id?: string | null
          content?: string | null
          conversation_id?: string | null
          created_at?: string
          deleted_at?: string | null
          direction?: string | null
          edited_at?: string | null
          error_code?: string | null
          error_reason?: string | null
          follow_up_at?: string | null
          follow_up_done?: boolean | null
          from_me?: boolean | null
          id?: string
          instance_name?: string
          is_important?: boolean | null
          is_read?: boolean
          is_starred?: boolean | null
          link_preview?: Json | null
          media_bucket?: string | null
          media_filename?: string | null
          media_meta?: Json | null
          media_mimetype?: string | null
          media_path?: string | null
          media_sha256?: string | null
          media_size?: number | null
          media_status?: string | null
          media_type?: string | null
          media_url?: string | null
          message_id?: string | null
          message_type?: string
          notes?: string | null
          payload?: Json | null
          push_name?: string | null
          quoted_message_id?: string | null
          raw_data?: Json | null
          remote_jid?: string
          reply_to_id?: string | null
          retry_attempt?: number | null
          retry_total?: number | null
          sent_by_bot?: boolean | null
          sentiment?: string | null
          status?: string | null
          status_at?: string | null
          sticker_id?: string | null
          tags?: string[] | null
          template_name?: string | null
          transcription?: string | null
          transcription_status?: string | null
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
          created_at: string
          deleted_at: string | null
          direction: string | null
          edited_at: string | null
          error_code: string | null
          error_reason: string | null
          follow_up_at: string | null
          follow_up_done: boolean | null
          from_me: boolean | null
          id: string
          instance_name: string
          is_important: boolean | null
          is_read: boolean
          is_starred: boolean | null
          link_preview: Json | null
          media_bucket: string | null
          media_filename: string | null
          media_meta: Json | null
          media_mimetype: string | null
          media_path: string | null
          media_sha256: string | null
          media_size: number | null
          media_status: string | null
          media_type: string | null
          media_url: string | null
          message_id: string | null
          message_type: string
          notes: string | null
          payload: Json | null
          push_name: string | null
          quoted_message_id: string | null
          raw_data: Json | null
          remote_jid: string
          reply_to_id: string | null
          retry_attempt: number | null
          retry_total: number | null
          sent_by_bot: boolean | null
          sentiment: string | null
          status: string | null
          status_at: string | null
          sticker_id: string | null
          tags: string[] | null
          template_name: string | null
          transcription: string | null
          transcription_status: string | null
          updated_at: string | null
        }
        Insert: {
          audio_meme_id?: string | null
          caption?: string | null
          category?: string | null
          contact_id?: string | null
          content?: string | null
          conversation_id?: string | null
          created_at?: string
          deleted_at?: string | null
          direction?: string | null
          edited_at?: string | null
          error_code?: string | null
          error_reason?: string | null
          follow_up_at?: string | null
          follow_up_done?: boolean | null
          from_me?: boolean | null
          id?: string
          instance_name: string
          is_important?: boolean | null
          is_read?: boolean
          is_starred?: boolean | null
          link_preview?: Json | null
          media_bucket?: string | null
          media_filename?: string | null
          media_meta?: Json | null
          media_mimetype?: string | null
          media_path?: string | null
          media_sha256?: string | null
          media_size?: number | null
          media_status?: string | null
          media_type?: string | null
          media_url?: string | null
          message_id?: string | null
          message_type?: string
          notes?: string | null
          payload?: Json | null
          push_name?: string | null
          quoted_message_id?: string | null
          raw_data?: Json | null
          remote_jid: string
          reply_to_id?: string | null
          retry_attempt?: number | null
          retry_total?: number | null
          sent_by_bot?: boolean | null
          sentiment?: string | null
          status?: string | null
          status_at?: string | null
          sticker_id?: string | null
          tags?: string[] | null
          template_name?: string | null
          transcription?: string | null
          transcription_status?: string | null
          updated_at?: string | null
        }
        Update: {
          audio_meme_id?: string | null
          caption?: string | null
          category?: string | null
          contact_id?: string | null
          content?: string | null
          conversation_id?: string | null
          created_at?: string
          deleted_at?: string | null
          direction?: string | null
          edited_at?: string | null
          error_code?: string | null
          error_reason?: string | null
          follow_up_at?: string | null
          follow_up_done?: boolean | null
          from_me?: boolean | null
          id?: string
          instance_name?: string
          is_important?: boolean | null
          is_read?: boolean
          is_starred?: boolean | null
          link_preview?: Json | null
          media_bucket?: string | null
          media_filename?: string | null
          media_meta?: Json | null
          media_mimetype?: string | null
          media_path?: string | null
          media_sha256?: string | null
          media_size?: number | null
          media_status?: string | null
          media_type?: string | null
          media_url?: string | null
          message_id?: string | null
          message_type?: string
          notes?: string | null
          payload?: Json | null
          push_name?: string | null
          quoted_message_id?: string | null
          raw_data?: Json | null
          remote_jid?: string
          reply_to_id?: string | null
          retry_attempt?: number | null
          retry_total?: number | null
          sent_by_bot?: boolean | null
          sentiment?: string | null
          status?: string | null
          status_at?: string | null
          sticker_id?: string | null
          tags?: string[] | null
          template_name?: string | null
          transcription?: string | null
          transcription_status?: string | null
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
          created_at: string
          deleted_at: string | null
          direction: string | null
          edited_at: string | null
          error_code: string | null
          error_reason: string | null
          follow_up_at: string | null
          follow_up_done: boolean | null
          from_me: boolean | null
          id: string
          instance_name: string
          is_important: boolean | null
          is_read: boolean
          is_starred: boolean | null
          link_preview: Json | null
          media_bucket: string | null
          media_filename: string | null
          media_meta: Json | null
          media_mimetype: string | null
          media_path: string | null
          media_sha256: string | null
          media_size: number | null
          media_status: string | null
          media_type: string | null
          media_url: string | null
          message_id: string | null
          message_type: string
          notes: string | null
          payload: Json | null
          push_name: string | null
          quoted_message_id: string | null
          raw_data: Json | null
          remote_jid: string
          reply_to_id: string | null
          retry_attempt: number | null
          retry_total: number | null
          sent_by_bot: boolean | null
          sentiment: string | null
          status: string | null
          status_at: string | null
          sticker_id: string | null
          tags: string[] | null
          template_name: string | null
          transcription: string | null
          transcription_status: string | null
          updated_at: string | null
        }
        Insert: {
          audio_meme_id?: string | null
          caption?: string | null
          category?: string | null
          contact_id?: string | null
          content?: string | null
          conversation_id?: string | null
          created_at?: string
          deleted_at?: string | null
          direction?: string | null
          edited_at?: string | null
          error_code?: string | null
          error_reason?: string | null
          follow_up_at?: string | null
          follow_up_done?: boolean | null
          from_me?: boolean | null
          id?: string
          instance_name: string
          is_important?: boolean | null
          is_read?: boolean
          is_starred?: boolean | null
          link_preview?: Json | null
          media_bucket?: string | null
          media_filename?: string | null
          media_meta?: Json | null
          media_mimetype?: string | null
          media_path?: string | null
          media_sha256?: string | null
          media_size?: number | null
          media_status?: string | null
          media_type?: string | null
          media_url?: string | null
          message_id?: string | null
          message_type?: string
          notes?: string | null
          payload?: Json | null
          push_name?: string | null
          quoted_message_id?: string | null
          raw_data?: Json | null
          remote_jid: string
          reply_to_id?: string | null
          retry_attempt?: number | null
          retry_total?: number | null
          sent_by_bot?: boolean | null
          sentiment?: string | null
          status?: string | null
          status_at?: string | null
          sticker_id?: string | null
          tags?: string[] | null
          template_name?: string | null
          transcription?: string | null
          transcription_status?: string | null
          updated_at?: string | null
        }
        Update: {
          audio_meme_id?: string | null
          caption?: string | null
          category?: string | null
          contact_id?: string | null
          content?: string | null
          conversation_id?: string | null
          created_at?: string
          deleted_at?: string | null
          direction?: string | null
          edited_at?: string | null
          error_code?: string | null
          error_reason?: string | null
          follow_up_at?: string | null
          follow_up_done?: boolean | null
          from_me?: boolean | null
          id?: string
          instance_name?: string
          is_important?: boolean | null
          is_read?: boolean
          is_starred?: boolean | null
          link_preview?: Json | null
          media_bucket?: string | null
          media_filename?: string | null
          media_meta?: Json | null
          media_mimetype?: string | null
          media_path?: string | null
          media_sha256?: string | null
          media_size?: number | null
          media_status?: string | null
          media_type?: string | null
          media_url?: string | null
          message_id?: string | null
          message_type?: string
          notes?: string | null
          payload?: Json | null
          push_name?: string | null
          quoted_message_id?: string | null
          raw_data?: Json | null
          remote_jid?: string
          reply_to_id?: string | null
          retry_attempt?: number | null
          retry_total?: number | null
          sent_by_bot?: boolean | null
          sentiment?: string | null
          status?: string | null
          status_at?: string | null
          sticker_id?: string | null
          tags?: string[] | null
          template_name?: string | null
          transcription?: string | null
          transcription_status?: string | null
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
          created_at: string
          deleted_at: string | null
          direction: string | null
          edited_at: string | null
          error_code: string | null
          error_reason: string | null
          follow_up_at: string | null
          follow_up_done: boolean | null
          from_me: boolean | null
          id: string
          instance_name: string
          is_important: boolean | null
          is_read: boolean
          is_starred: boolean | null
          link_preview: Json | null
          media_bucket: string | null
          media_filename: string | null
          media_meta: Json | null
          media_mimetype: string | null
          media_path: string | null
          media_sha256: string | null
          media_size: number | null
          media_status: string | null
          media_type: string | null
          media_url: string | null
          message_id: string | null
          message_type: string
          notes: string | null
          payload: Json | null
          push_name: string | null
          quoted_message_id: string | null
          raw_data: Json | null
          remote_jid: string
          reply_to_id: string | null
          retry_attempt: number | null
          retry_total: number | null
          sent_by_bot: boolean | null
          sentiment: string | null
          status: string | null
          status_at: string | null
          sticker_id: string | null
          tags: string[] | null
          template_name: string | null
          transcription: string | null
          transcription_status: string | null
          updated_at: string | null
        }
        Insert: {
          audio_meme_id?: string | null
          caption?: string | null
          category?: string | null
          contact_id?: string | null
          content?: string | null
          conversation_id?: string | null
          created_at?: string
          deleted_at?: string | null
          direction?: string | null
          edited_at?: string | null
          error_code?: string | null
          error_reason?: string | null
          follow_up_at?: string | null
          follow_up_done?: boolean | null
          from_me?: boolean | null
          id?: string
          instance_name: string
          is_important?: boolean | null
          is_read?: boolean
          is_starred?: boolean | null
          link_preview?: Json | null
          media_bucket?: string | null
          media_filename?: string | null
          media_meta?: Json | null
          media_mimetype?: string | null
          media_path?: string | null
          media_sha256?: string | null
          media_size?: number | null
          media_status?: string | null
          media_type?: string | null
          media_url?: string | null
          message_id?: string | null
          message_type?: string
          notes?: string | null
          payload?: Json | null
          push_name?: string | null
          quoted_message_id?: string | null
          raw_data?: Json | null
          remote_jid: string
          reply_to_id?: string | null
          retry_attempt?: number | null
          retry_total?: number | null
          sent_by_bot?: boolean | null
          sentiment?: string | null
          status?: string | null
          status_at?: string | null
          sticker_id?: string | null
          tags?: string[] | null
          template_name?: string | null
          transcription?: string | null
          transcription_status?: string | null
          updated_at?: string | null
        }
        Update: {
          audio_meme_id?: string | null
          caption?: string | null
          category?: string | null
          contact_id?: string | null
          content?: string | null
          conversation_id?: string | null
          created_at?: string
          deleted_at?: string | null
          direction?: string | null
          edited_at?: string | null
          error_code?: string | null
          error_reason?: string | null
          follow_up_at?: string | null
          follow_up_done?: boolean | null
          from_me?: boolean | null
          id?: string
          instance_name?: string
          is_important?: boolean | null
          is_read?: boolean
          is_starred?: boolean | null
          link_preview?: Json | null
          media_bucket?: string | null
          media_filename?: string | null
          media_meta?: Json | null
          media_mimetype?: string | null
          media_path?: string | null
          media_sha256?: string | null
          media_size?: number | null
          media_status?: string | null
          media_type?: string | null
          media_url?: string | null
          message_id?: string | null
          message_type?: string
          notes?: string | null
          payload?: Json | null
          push_name?: string | null
          quoted_message_id?: string | null
          raw_data?: Json | null
          remote_jid?: string
          reply_to_id?: string | null
          retry_attempt?: number | null
          retry_total?: number | null
          sent_by_bot?: boolean | null
          sentiment?: string | null
          status?: string | null
          status_at?: string | null
          sticker_id?: string | null
          tags?: string[] | null
          template_name?: string | null
          transcription?: string | null
          transcription_status?: string | null
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
          created_at: string
          deleted_at: string | null
          direction: string | null
          edited_at: string | null
          error_code: string | null
          error_reason: string | null
          follow_up_at: string | null
          follow_up_done: boolean | null
          from_me: boolean | null
          id: string
          instance_name: string
          is_important: boolean | null
          is_read: boolean
          is_starred: boolean | null
          link_preview: Json | null
          media_bucket: string | null
          media_filename: string | null
          media_meta: Json | null
          media_mimetype: string | null
          media_path: string | null
          media_sha256: string | null
          media_size: number | null
          media_status: string | null
          media_type: string | null
          media_url: string | null
          message_id: string | null
          message_type: string
          notes: string | null
          payload: Json | null
          push_name: string | null
          quoted_message_id: string | null
          raw_data: Json | null
          remote_jid: string
          reply_to_id: string | null
          retry_attempt: number | null
          retry_total: number | null
          sent_by_bot: boolean | null
          sentiment: string | null
          status: string | null
          status_at: string | null
          sticker_id: string | null
          tags: string[] | null
          template_name: string | null
          transcription: string | null
          transcription_status: string | null
          updated_at: string | null
        }
        Insert: {
          audio_meme_id?: string | null
          caption?: string | null
          category?: string | null
          contact_id?: string | null
          content?: string | null
          conversation_id?: string | null
          created_at?: string
          deleted_at?: string | null
          direction?: string | null
          edited_at?: string | null
          error_code?: string | null
          error_reason?: string | null
          follow_up_at?: string | null
          follow_up_done?: boolean | null
          from_me?: boolean | null
          id?: string
          instance_name: string
          is_important?: boolean | null
          is_read?: boolean
          is_starred?: boolean | null
          link_preview?: Json | null
          media_bucket?: string | null
          media_filename?: string | null
          media_meta?: Json | null
          media_mimetype?: string | null
          media_path?: string | null
          media_sha256?: string | null
          media_size?: number | null
          media_status?: string | null
          media_type?: string | null
          media_url?: string | null
          message_id?: string | null
          message_type?: string
          notes?: string | null
          payload?: Json | null
          push_name?: string | null
          quoted_message_id?: string | null
          raw_data?: Json | null
          remote_jid: string
          reply_to_id?: string | null
          retry_attempt?: number | null
          retry_total?: number | null
          sent_by_bot?: boolean | null
          sentiment?: string | null
          status?: string | null
          status_at?: string | null
          sticker_id?: string | null
          tags?: string[] | null
          template_name?: string | null
          transcription?: string | null
          transcription_status?: string | null
          updated_at?: string | null
        }
        Update: {
          audio_meme_id?: string | null
          caption?: string | null
          category?: string | null
          contact_id?: string | null
          content?: string | null
          conversation_id?: string | null
          created_at?: string
          deleted_at?: string | null
          direction?: string | null
          edited_at?: string | null
          error_code?: string | null
          error_reason?: string | null
          follow_up_at?: string | null
          follow_up_done?: boolean | null
          from_me?: boolean | null
          id?: string
          instance_name?: string
          is_important?: boolean | null
          is_read?: boolean
          is_starred?: boolean | null
          link_preview?: Json | null
          media_bucket?: string | null
          media_filename?: string | null
          media_meta?: Json | null
          media_mimetype?: string | null
          media_path?: string | null
          media_sha256?: string | null
          media_size?: number | null
          media_status?: string | null
          media_type?: string | null
          media_url?: string | null
          message_id?: string | null
          message_type?: string
          notes?: string | null
          payload?: Json | null
          push_name?: string | null
          quoted_message_id?: string | null
          raw_data?: Json | null
          remote_jid?: string
          reply_to_id?: string | null
          retry_attempt?: number | null
          retry_total?: number | null
          sent_by_bot?: boolean | null
          sentiment?: string | null
          status?: string | null
          status_at?: string | null
          sticker_id?: string | null
          tags?: string[] | null
          template_name?: string | null
          transcription?: string | null
          transcription_status?: string | null
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
          created_at: string
          deleted_at: string | null
          direction: string | null
          edited_at: string | null
          error_code: string | null
          error_reason: string | null
          follow_up_at: string | null
          follow_up_done: boolean | null
          from_me: boolean | null
          id: string
          instance_name: string
          is_important: boolean | null
          is_read: boolean
          is_starred: boolean | null
          link_preview: Json | null
          media_bucket: string | null
          media_filename: string | null
          media_meta: Json | null
          media_mimetype: string | null
          media_path: string | null
          media_sha256: string | null
          media_size: number | null
          media_status: string | null
          media_type: string | null
          media_url: string | null
          message_id: string | null
          message_type: string
          notes: string | null
          payload: Json | null
          push_name: string | null
          quoted_message_id: string | null
          raw_data: Json | null
          remote_jid: string
          reply_to_id: string | null
          retry_attempt: number | null
          retry_total: number | null
          sent_by_bot: boolean | null
          sentiment: string | null
          status: string | null
          status_at: string | null
          sticker_id: string | null
          tags: string[] | null
          template_name: string | null
          transcription: string | null
          transcription_status: string | null
          updated_at: string | null
        }
        Insert: {
          audio_meme_id?: string | null
          caption?: string | null
          category?: string | null
          contact_id?: string | null
          content?: string | null
          conversation_id?: string | null
          created_at?: string
          deleted_at?: string | null
          direction?: string | null
          edited_at?: string | null
          error_code?: string | null
          error_reason?: string | null
          follow_up_at?: string | null
          follow_up_done?: boolean | null
          from_me?: boolean | null
          id?: string
          instance_name: string
          is_important?: boolean | null
          is_read?: boolean
          is_starred?: boolean | null
          link_preview?: Json | null
          media_bucket?: string | null
          media_filename?: string | null
          media_meta?: Json | null
          media_mimetype?: string | null
          media_path?: string | null
          media_sha256?: string | null
          media_size?: number | null
          media_status?: string | null
          media_type?: string | null
          media_url?: string | null
          message_id?: string | null
          message_type?: string
          notes?: string | null
          payload?: Json | null
          push_name?: string | null
          quoted_message_id?: string | null
          raw_data?: Json | null
          remote_jid: string
          reply_to_id?: string | null
          retry_attempt?: number | null
          retry_total?: number | null
          sent_by_bot?: boolean | null
          sentiment?: string | null
          status?: string | null
          status_at?: string | null
          sticker_id?: string | null
          tags?: string[] | null
          template_name?: string | null
          transcription?: string | null
          transcription_status?: string | null
          updated_at?: string | null
        }
        Update: {
          audio_meme_id?: string | null
          caption?: string | null
          category?: string | null
          contact_id?: string | null
          content?: string | null
          conversation_id?: string | null
          created_at?: string
          deleted_at?: string | null
          direction?: string | null
          edited_at?: string | null
          error_code?: string | null
          error_reason?: string | null
          follow_up_at?: string | null
          follow_up_done?: boolean | null
          from_me?: boolean | null
          id?: string
          instance_name?: string
          is_important?: boolean | null
          is_read?: boolean
          is_starred?: boolean | null
          link_preview?: Json | null
          media_bucket?: string | null
          media_filename?: string | null
          media_meta?: Json | null
          media_mimetype?: string | null
          media_path?: string | null
          media_sha256?: string | null
          media_size?: number | null
          media_status?: string | null
          media_type?: string | null
          media_url?: string | null
          message_id?: string | null
          message_type?: string
          notes?: string | null
          payload?: Json | null
          push_name?: string | null
          quoted_message_id?: string | null
          raw_data?: Json | null
          remote_jid?: string
          reply_to_id?: string | null
          retry_attempt?: number | null
          retry_total?: number | null
          sent_by_bot?: boolean | null
          sentiment?: string | null
          status?: string | null
          status_at?: string | null
          sticker_id?: string | null
          tags?: string[] | null
          template_name?: string | null
          transcription?: string | null
          transcription_status?: string | null
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
          created_at: string
          deleted_at: string | null
          direction: string | null
          edited_at: string | null
          error_code: string | null
          error_reason: string | null
          follow_up_at: string | null
          follow_up_done: boolean | null
          from_me: boolean | null
          id: string
          instance_name: string
          is_important: boolean | null
          is_read: boolean
          is_starred: boolean | null
          link_preview: Json | null
          media_bucket: string | null
          media_filename: string | null
          media_meta: Json | null
          media_mimetype: string | null
          media_path: string | null
          media_sha256: string | null
          media_size: number | null
          media_status: string | null
          media_type: string | null
          media_url: string | null
          message_id: string | null
          message_type: string
          notes: string | null
          payload: Json | null
          push_name: string | null
          quoted_message_id: string | null
          raw_data: Json | null
          remote_jid: string
          reply_to_id: string | null
          retry_attempt: number | null
          retry_total: number | null
          sent_by_bot: boolean | null
          sentiment: string | null
          status: string | null
          status_at: string | null
          sticker_id: string | null
          tags: string[] | null
          template_name: string | null
          transcription: string | null
          transcription_status: string | null
          updated_at: string | null
        }
        Insert: {
          audio_meme_id?: string | null
          caption?: string | null
          category?: string | null
          contact_id?: string | null
          content?: string | null
          conversation_id?: string | null
          created_at?: string
          deleted_at?: string | null
          direction?: string | null
          edited_at?: string | null
          error_code?: string | null
          error_reason?: string | null
          follow_up_at?: string | null
          follow_up_done?: boolean | null
          from_me?: boolean | null
          id?: string
          instance_name: string
          is_important?: boolean | null
          is_read?: boolean
          is_starred?: boolean | null
          link_preview?: Json | null
          media_bucket?: string | null
          media_filename?: string | null
          media_meta?: Json | null
          media_mimetype?: string | null
          media_path?: string | null
          media_sha256?: string | null
          media_size?: number | null
          media_status?: string | null
          media_type?: string | null
          media_url?: string | null
          message_id?: string | null
          message_type?: string
          notes?: string | null
          payload?: Json | null
          push_name?: string | null
          quoted_message_id?: string | null
          raw_data?: Json | null
          remote_jid: string
          reply_to_id?: string | null
          retry_attempt?: number | null
          retry_total?: number | null
          sent_by_bot?: boolean | null
          sentiment?: string | null
          status?: string | null
          status_at?: string | null
          sticker_id?: string | null
          tags?: string[] | null
          template_name?: string | null
          transcription?: string | null
          transcription_status?: string | null
          updated_at?: string | null
        }
        Update: {
          audio_meme_id?: string | null
          caption?: string | null
          category?: string | null
          contact_id?: string | null
          content?: string | null
          conversation_id?: string | null
          created_at?: string
          deleted_at?: string | null
          direction?: string | null
          edited_at?: string | null
          error_code?: string | null
          error_reason?: string | null
          follow_up_at?: string | null
          follow_up_done?: boolean | null
          from_me?: boolean | null
          id?: string
          instance_name?: string
          is_important?: boolean | null
          is_read?: boolean
          is_starred?: boolean | null
          link_preview?: Json | null
          media_bucket?: string | null
          media_filename?: string | null
          media_meta?: Json | null
          media_mimetype?: string | null
          media_path?: string | null
          media_sha256?: string | null
          media_size?: number | null
          media_status?: string | null
          media_type?: string | null
          media_url?: string | null
          message_id?: string | null
          message_type?: string
          notes?: string | null
          payload?: Json | null
          push_name?: string | null
          quoted_message_id?: string | null
          raw_data?: Json | null
          remote_jid?: string
          reply_to_id?: string | null
          retry_attempt?: number | null
          retry_total?: number | null
          sent_by_bot?: boolean | null
          sentiment?: string | null
          status?: string | null
          status_at?: string | null
          sticker_id?: string | null
          tags?: string[] | null
          template_name?: string | null
          transcription?: string | null
          transcription_status?: string | null
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
          created_at: string
          deleted_at: string | null
          direction: string | null
          edited_at: string | null
          error_code: string | null
          error_reason: string | null
          follow_up_at: string | null
          follow_up_done: boolean | null
          from_me: boolean | null
          id: string
          instance_name: string
          is_important: boolean | null
          is_read: boolean
          is_starred: boolean | null
          link_preview: Json | null
          media_bucket: string | null
          media_filename: string | null
          media_meta: Json | null
          media_mimetype: string | null
          media_path: string | null
          media_sha256: string | null
          media_size: number | null
          media_status: string | null
          media_type: string | null
          media_url: string | null
          message_id: string | null
          message_type: string
          notes: string | null
          payload: Json | null
          push_name: string | null
          quoted_message_id: string | null
          raw_data: Json | null
          remote_jid: string
          reply_to_id: string | null
          retry_attempt: number | null
          retry_total: number | null
          sent_by_bot: boolean | null
          sentiment: string | null
          status: string | null
          status_at: string | null
          sticker_id: string | null
          tags: string[] | null
          template_name: string | null
          transcription: string | null
          transcription_status: string | null
          updated_at: string | null
        }
        Insert: {
          audio_meme_id?: string | null
          caption?: string | null
          category?: string | null
          contact_id?: string | null
          content?: string | null
          conversation_id?: string | null
          created_at?: string
          deleted_at?: string | null
          direction?: string | null
          edited_at?: string | null
          error_code?: string | null
          error_reason?: string | null
          follow_up_at?: string | null
          follow_up_done?: boolean | null
          from_me?: boolean | null
          id?: string
          instance_name: string
          is_important?: boolean | null
          is_read?: boolean
          is_starred?: boolean | null
          link_preview?: Json | null
          media_bucket?: string | null
          media_filename?: string | null
          media_meta?: Json | null
          media_mimetype?: string | null
          media_path?: string | null
          media_sha256?: string | null
          media_size?: number | null
          media_status?: string | null
          media_type?: string | null
          media_url?: string | null
          message_id?: string | null
          message_type?: string
          notes?: string | null
          payload?: Json | null
          push_name?: string | null
          quoted_message_id?: string | null
          raw_data?: Json | null
          remote_jid: string
          reply_to_id?: string | null
          retry_attempt?: number | null
          retry_total?: number | null
          sent_by_bot?: boolean | null
          sentiment?: string | null
          status?: string | null
          status_at?: string | null
          sticker_id?: string | null
          tags?: string[] | null
          template_name?: string | null
          transcription?: string | null
          transcription_status?: string | null
          updated_at?: string | null
        }
        Update: {
          audio_meme_id?: string | null
          caption?: string | null
          category?: string | null
          contact_id?: string | null
          content?: string | null
          conversation_id?: string | null
          created_at?: string
          deleted_at?: string | null
          direction?: string | null
          edited_at?: string | null
          error_code?: string | null
          error_reason?: string | null
          follow_up_at?: string | null
          follow_up_done?: boolean | null
          from_me?: boolean | null
          id?: string
          instance_name?: string
          is_important?: boolean | null
          is_read?: boolean
          is_starred?: boolean | null
          link_preview?: Json | null
          media_bucket?: string | null
          media_filename?: string | null
          media_meta?: Json | null
          media_mimetype?: string | null
          media_path?: string | null
          media_sha256?: string | null
          media_size?: number | null
          media_status?: string | null
          media_type?: string | null
          media_url?: string | null
          message_id?: string | null
          message_type?: string
          notes?: string | null
          payload?: Json | null
          push_name?: string | null
          quoted_message_id?: string | null
          raw_data?: Json | null
          remote_jid?: string
          reply_to_id?: string | null
          retry_attempt?: number | null
          retry_total?: number | null
          sent_by_bot?: boolean | null
          sentiment?: string | null
          status?: string | null
          status_at?: string | null
          sticker_id?: string | null
          tags?: string[] | null
          template_name?: string | null
          transcription?: string | null
          transcription_status?: string | null
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
          created_at: string
          deleted_at: string | null
          direction: string | null
          edited_at: string | null
          error_code: string | null
          error_reason: string | null
          follow_up_at: string | null
          follow_up_done: boolean | null
          from_me: boolean | null
          id: string
          instance_name: string
          is_important: boolean | null
          is_read: boolean
          is_starred: boolean | null
          link_preview: Json | null
          media_bucket: string | null
          media_filename: string | null
          media_meta: Json | null
          media_mimetype: string | null
          media_path: string | null
          media_sha256: string | null
          media_size: number | null
          media_status: string | null
          media_type: string | null
          media_url: string | null
          message_id: string | null
          message_type: string
          notes: string | null
          payload: Json | null
          push_name: string | null
          quoted_message_id: string | null
          raw_data: Json | null
          remote_jid: string
          reply_to_id: string | null
          retry_attempt: number | null
          retry_total: number | null
          sent_by_bot: boolean | null
          sentiment: string | null
          status: string | null
          status_at: string | null
          sticker_id: string | null
          tags: string[] | null
          template_name: string | null
          transcription: string | null
          transcription_status: string | null
          updated_at: string | null
        }
        Insert: {
          audio_meme_id?: string | null
          caption?: string | null
          category?: string | null
          contact_id?: string | null
          content?: string | null
          conversation_id?: string | null
          created_at?: string
          deleted_at?: string | null
          direction?: string | null
          edited_at?: string | null
          error_code?: string | null
          error_reason?: string | null
          follow_up_at?: string | null
          follow_up_done?: boolean | null
          from_me?: boolean | null
          id?: string
          instance_name: string
          is_important?: boolean | null
          is_read?: boolean
          is_starred?: boolean | null
          link_preview?: Json | null
          media_bucket?: string | null
          media_filename?: string | null
          media_meta?: Json | null
          media_mimetype?: string | null
          media_path?: string | null
          media_sha256?: string | null
          media_size?: number | null
          media_status?: string | null
          media_type?: string | null
          media_url?: string | null
          message_id?: string | null
          message_type?: string
          notes?: string | null
          payload?: Json | null
          push_name?: string | null
          quoted_message_id?: string | null
          raw_data?: Json | null
          remote_jid: string
          reply_to_id?: string | null
          retry_attempt?: number | null
          retry_total?: number | null
          sent_by_bot?: boolean | null
          sentiment?: string | null
          status?: string | null
          status_at?: string | null
          sticker_id?: string | null
          tags?: string[] | null
          template_name?: string | null
          transcription?: string | null
          transcription_status?: string | null
          updated_at?: string | null
        }
        Update: {
          audio_meme_id?: string | null
          caption?: string | null
          category?: string | null
          contact_id?: string | null
          content?: string | null
          conversation_id?: string | null
          created_at?: string
          deleted_at?: string | null
          direction?: string | null
          edited_at?: string | null
          error_code?: string | null
          error_reason?: string | null
          follow_up_at?: string | null
          follow_up_done?: boolean | null
          from_me?: boolean | null
          id?: string
          instance_name?: string
          is_important?: boolean | null
          is_read?: boolean
          is_starred?: boolean | null
          link_preview?: Json | null
          media_bucket?: string | null
          media_filename?: string | null
          media_meta?: Json | null
          media_mimetype?: string | null
          media_path?: string | null
          media_sha256?: string | null
          media_size?: number | null
          media_status?: string | null
          media_type?: string | null
          media_url?: string | null
          message_id?: string | null
          message_type?: string
          notes?: string | null
          payload?: Json | null
          push_name?: string | null
          quoted_message_id?: string | null
          raw_data?: Json | null
          remote_jid?: string
          reply_to_id?: string | null
          retry_attempt?: number | null
          retry_total?: number | null
          sent_by_bot?: boolean | null
          sentiment?: string | null
          status?: string | null
          status_at?: string | null
          sticker_id?: string | null
          tags?: string[] | null
          template_name?: string | null
          transcription?: string | null
          transcription_status?: string | null
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
          created_at: string
          deleted_at: string | null
          direction: string | null
          edited_at: string | null
          error_code: string | null
          error_reason: string | null
          follow_up_at: string | null
          follow_up_done: boolean | null
          from_me: boolean | null
          id: string
          instance_name: string
          is_important: boolean | null
          is_read: boolean
          is_starred: boolean | null
          link_preview: Json | null
          media_bucket: string | null
          media_filename: string | null
          media_meta: Json | null
          media_mimetype: string | null
          media_path: string | null
          media_sha256: string | null
          media_size: number | null
          media_status: string | null
          media_type: string | null
          media_url: string | null
          message_id: string | null
          message_type: string
          notes: string | null
          payload: Json | null
          push_name: string | null
          quoted_message_id: string | null
          raw_data: Json | null
          remote_jid: string
          reply_to_id: string | null
          retry_attempt: number | null
          retry_total: number | null
          sent_by_bot: boolean | null
          sentiment: string | null
          status: string | null
          status_at: string | null
          sticker_id: string | null
          tags: string[] | null
          template_name: string | null
          transcription: string | null
          transcription_status: string | null
          updated_at: string | null
        }
        Insert: {
          audio_meme_id?: string | null
          caption?: string | null
          category?: string | null
          contact_id?: string | null
          content?: string | null
          conversation_id?: string | null
          created_at?: string
          deleted_at?: string | null
          direction?: string | null
          edited_at?: string | null
          error_code?: string | null
          error_reason?: string | null
          follow_up_at?: string | null
          follow_up_done?: boolean | null
          from_me?: boolean | null
          id?: string
          instance_name: string
          is_important?: boolean | null
          is_read?: boolean
          is_starred?: boolean | null
          link_preview?: Json | null
          media_bucket?: string | null
          media_filename?: string | null
          media_meta?: Json | null
          media_mimetype?: string | null
          media_path?: string | null
          media_sha256?: string | null
          media_size?: number | null
          media_status?: string | null
          media_type?: string | null
          media_url?: string | null
          message_id?: string | null
          message_type?: string
          notes?: string | null
          payload?: Json | null
          push_name?: string | null
          quoted_message_id?: string | null
          raw_data?: Json | null
          remote_jid: string
          reply_to_id?: string | null
          retry_attempt?: number | null
          retry_total?: number | null
          sent_by_bot?: boolean | null
          sentiment?: string | null
          status?: string | null
          status_at?: string | null
          sticker_id?: string | null
          tags?: string[] | null
          template_name?: string | null
          transcription?: string | null
          transcription_status?: string | null
          updated_at?: string | null
        }
        Update: {
          audio_meme_id?: string | null
          caption?: string | null
          category?: string | null
          contact_id?: string | null
          content?: string | null
          conversation_id?: string | null
          created_at?: string
          deleted_at?: string | null
          direction?: string | null
          edited_at?: string | null
          error_code?: string | null
          error_reason?: string | null
          follow_up_at?: string | null
          follow_up_done?: boolean | null
          from_me?: boolean | null
          id?: string
          instance_name?: string
          is_important?: boolean | null
          is_read?: boolean
          is_starred?: boolean | null
          link_preview?: Json | null
          media_bucket?: string | null
          media_filename?: string | null
          media_meta?: Json | null
          media_mimetype?: string | null
          media_path?: string | null
          media_sha256?: string | null
          media_size?: number | null
          media_status?: string | null
          media_type?: string | null
          media_url?: string | null
          message_id?: string | null
          message_type?: string
          notes?: string | null
          payload?: Json | null
          push_name?: string | null
          quoted_message_id?: string | null
          raw_data?: Json | null
          remote_jid?: string
          reply_to_id?: string | null
          retry_attempt?: number | null
          retry_total?: number | null
          sent_by_bot?: boolean | null
          sentiment?: string | null
          status?: string | null
          status_at?: string | null
          sticker_id?: string | null
          tags?: string[] | null
          template_name?: string | null
          transcription?: string | null
          transcription_status?: string | null
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
          created_at: string
          deleted_at: string | null
          direction: string | null
          edited_at: string | null
          error_code: string | null
          error_reason: string | null
          follow_up_at: string | null
          follow_up_done: boolean | null
          from_me: boolean | null
          id: string
          instance_name: string
          is_important: boolean | null
          is_read: boolean
          is_starred: boolean | null
          link_preview: Json | null
          media_bucket: string | null
          media_filename: string | null
          media_meta: Json | null
          media_mimetype: string | null
          media_path: string | null
          media_sha256: string | null
          media_size: number | null
          media_status: string | null
          media_type: string | null
          media_url: string | null
          message_id: string | null
          message_type: string
          notes: string | null
          payload: Json | null
          push_name: string | null
          quoted_message_id: string | null
          raw_data: Json | null
          remote_jid: string
          reply_to_id: string | null
          retry_attempt: number | null
          retry_total: number | null
          sent_by_bot: boolean | null
          sentiment: string | null
          status: string | null
          status_at: string | null
          sticker_id: string | null
          tags: string[] | null
          template_name: string | null
          transcription: string | null
          transcription_status: string | null
          updated_at: string | null
        }
        Insert: {
          audio_meme_id?: string | null
          caption?: string | null
          category?: string | null
          contact_id?: string | null
          content?: string | null
          conversation_id?: string | null
          created_at?: string
          deleted_at?: string | null
          direction?: string | null
          edited_at?: string | null
          error_code?: string | null
          error_reason?: string | null
          follow_up_at?: string | null
          follow_up_done?: boolean | null
          from_me?: boolean | null
          id?: string
          instance_name: string
          is_important?: boolean | null
          is_read?: boolean
          is_starred?: boolean | null
          link_preview?: Json | null
          media_bucket?: string | null
          media_filename?: string | null
          media_meta?: Json | null
          media_mimetype?: string | null
          media_path?: string | null
          media_sha256?: string | null
          media_size?: number | null
          media_status?: string | null
          media_type?: string | null
          media_url?: string | null
          message_id?: string | null
          message_type?: string
          notes?: string | null
          payload?: Json | null
          push_name?: string | null
          quoted_message_id?: string | null
          raw_data?: Json | null
          remote_jid: string
          reply_to_id?: string | null
          retry_attempt?: number | null
          retry_total?: number | null
          sent_by_bot?: boolean | null
          sentiment?: string | null
          status?: string | null
          status_at?: string | null
          sticker_id?: string | null
          tags?: string[] | null
          template_name?: string | null
          transcription?: string | null
          transcription_status?: string | null
          updated_at?: string | null
        }
        Update: {
          audio_meme_id?: string | null
          caption?: string | null
          category?: string | null
          contact_id?: string | null
          content?: string | null
          conversation_id?: string | null
          created_at?: string
          deleted_at?: string | null
          direction?: string | null
          edited_at?: string | null
          error_code?: string | null
          error_reason?: string | null
          follow_up_at?: string | null
          follow_up_done?: boolean | null
          from_me?: boolean | null
          id?: string
          instance_name?: string
          is_important?: boolean | null
          is_read?: boolean
          is_starred?: boolean | null
          link_preview?: Json | null
          media_bucket?: string | null
          media_filename?: string | null
          media_meta?: Json | null
          media_mimetype?: string | null
          media_path?: string | null
          media_sha256?: string | null
          media_size?: number | null
          media_status?: string | null
          media_type?: string | null
          media_url?: string | null
          message_id?: string | null
          message_type?: string
          notes?: string | null
          payload?: Json | null
          push_name?: string | null
          quoted_message_id?: string | null
          raw_data?: Json | null
          remote_jid?: string
          reply_to_id?: string | null
          retry_attempt?: number | null
          retry_total?: number | null
          sent_by_bot?: boolean | null
          sentiment?: string | null
          status?: string | null
          status_at?: string | null
          sticker_id?: string | null
          tags?: string[] | null
          template_name?: string | null
          transcription?: string | null
          transcription_status?: string | null
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
          created_at: string
          deleted_at: string | null
          direction: string | null
          edited_at: string | null
          error_code: string | null
          error_reason: string | null
          follow_up_at: string | null
          follow_up_done: boolean | null
          from_me: boolean | null
          id: string
          instance_name: string
          is_important: boolean | null
          is_read: boolean
          is_starred: boolean | null
          link_preview: Json | null
          media_bucket: string | null
          media_filename: string | null
          media_meta: Json | null
          media_mimetype: string | null
          media_path: string | null
          media_sha256: string | null
          media_size: number | null
          media_status: string | null
          media_type: string | null
          media_url: string | null
          message_id: string | null
          message_type: string
          notes: string | null
          payload: Json | null
          push_name: string | null
          quoted_message_id: string | null
          raw_data: Json | null
          remote_jid: string
          reply_to_id: string | null
          retry_attempt: number | null
          retry_total: number | null
          sent_by_bot: boolean | null
          sentiment: string | null
          status: string | null
          status_at: string | null
          sticker_id: string | null
          tags: string[] | null
          template_name: string | null
          transcription: string | null
          transcription_status: string | null
          updated_at: string | null
        }
        Insert: {
          audio_meme_id?: string | null
          caption?: string | null
          category?: string | null
          contact_id?: string | null
          content?: string | null
          conversation_id?: string | null
          created_at?: string
          deleted_at?: string | null
          direction?: string | null
          edited_at?: string | null
          error_code?: string | null
          error_reason?: string | null
          follow_up_at?: string | null
          follow_up_done?: boolean | null
          from_me?: boolean | null
          id?: string
          instance_name: string
          is_important?: boolean | null
          is_read?: boolean
          is_starred?: boolean | null
          link_preview?: Json | null
          media_bucket?: string | null
          media_filename?: string | null
          media_meta?: Json | null
          media_mimetype?: string | null
          media_path?: string | null
          media_sha256?: string | null
          media_size?: number | null
          media_status?: string | null
          media_type?: string | null
          media_url?: string | null
          message_id?: string | null
          message_type?: string
          notes?: string | null
          payload?: Json | null
          push_name?: string | null
          quoted_message_id?: string | null
          raw_data?: Json | null
          remote_jid: string
          reply_to_id?: string | null
          retry_attempt?: number | null
          retry_total?: number | null
          sent_by_bot?: boolean | null
          sentiment?: string | null
          status?: string | null
          status_at?: string | null
          sticker_id?: string | null
          tags?: string[] | null
          template_name?: string | null
          transcription?: string | null
          transcription_status?: string | null
          updated_at?: string | null
        }
        Update: {
          audio_meme_id?: string | null
          caption?: string | null
          category?: string | null
          contact_id?: string | null
          content?: string | null
          conversation_id?: string | null
          created_at?: string
          deleted_at?: string | null
          direction?: string | null
          edited_at?: string | null
          error_code?: string | null
          error_reason?: string | null
          follow_up_at?: string | null
          follow_up_done?: boolean | null
          from_me?: boolean | null
          id?: string
          instance_name?: string
          is_important?: boolean | null
          is_read?: boolean
          is_starred?: boolean | null
          link_preview?: Json | null
          media_bucket?: string | null
          media_filename?: string | null
          media_meta?: Json | null
          media_mimetype?: string | null
          media_path?: string | null
          media_sha256?: string | null
          media_size?: number | null
          media_status?: string | null
          media_type?: string | null
          media_url?: string | null
          message_id?: string | null
          message_type?: string
          notes?: string | null
          payload?: Json | null
          push_name?: string | null
          quoted_message_id?: string | null
          raw_data?: Json | null
          remote_jid?: string
          reply_to_id?: string | null
          retry_attempt?: number | null
          retry_total?: number | null
          sent_by_bot?: boolean | null
          sentiment?: string | null
          status?: string | null
          status_at?: string | null
          sticker_id?: string | null
          tags?: string[] | null
          template_name?: string | null
          transcription?: string | null
          transcription_status?: string | null
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
          created_at: string
          deleted_at: string | null
          direction: string | null
          edited_at: string | null
          error_code: string | null
          error_reason: string | null
          follow_up_at: string | null
          follow_up_done: boolean | null
          from_me: boolean | null
          id: string
          instance_name: string
          is_important: boolean | null
          is_read: boolean
          is_starred: boolean | null
          link_preview: Json | null
          media_bucket: string | null
          media_filename: string | null
          media_meta: Json | null
          media_mimetype: string | null
          media_path: string | null
          media_sha256: string | null
          media_size: number | null
          media_status: string | null
          media_type: string | null
          media_url: string | null
          message_id: string | null
          message_type: string
          notes: string | null
          payload: Json | null
          push_name: string | null
          quoted_message_id: string | null
          raw_data: Json | null
          remote_jid: string
          reply_to_id: string | null
          retry_attempt: number | null
          retry_total: number | null
          sent_by_bot: boolean | null
          sentiment: string | null
          status: string | null
          status_at: string | null
          sticker_id: string | null
          tags: string[] | null
          template_name: string | null
          transcription: string | null
          transcription_status: string | null
          updated_at: string | null
        }
        Insert: {
          audio_meme_id?: string | null
          caption?: string | null
          category?: string | null
          contact_id?: string | null
          content?: string | null
          conversation_id?: string | null
          created_at?: string
          deleted_at?: string | null
          direction?: string | null
          edited_at?: string | null
          error_code?: string | null
          error_reason?: string | null
          follow_up_at?: string | null
          follow_up_done?: boolean | null
          from_me?: boolean | null
          id?: string
          instance_name: string
          is_important?: boolean | null
          is_read?: boolean
          is_starred?: boolean | null
          link_preview?: Json | null
          media_bucket?: string | null
          media_filename?: string | null
          media_meta?: Json | null
          media_mimetype?: string | null
          media_path?: string | null
          media_sha256?: string | null
          media_size?: number | null
          media_status?: string | null
          media_type?: string | null
          media_url?: string | null
          message_id?: string | null
          message_type?: string
          notes?: string | null
          payload?: Json | null
          push_name?: string | null
          quoted_message_id?: string | null
          raw_data?: Json | null
          remote_jid: string
          reply_to_id?: string | null
          retry_attempt?: number | null
          retry_total?: number | null
          sent_by_bot?: boolean | null
          sentiment?: string | null
          status?: string | null
          status_at?: string | null
          sticker_id?: string | null
          tags?: string[] | null
          template_name?: string | null
          transcription?: string | null
          transcription_status?: string | null
          updated_at?: string | null
        }
        Update: {
          audio_meme_id?: string | null
          caption?: string | null
          category?: string | null
          contact_id?: string | null
          content?: string | null
          conversation_id?: string | null
          created_at?: string
          deleted_at?: string | null
          direction?: string | null
          edited_at?: string | null
          error_code?: string | null
          error_reason?: string | null
          follow_up_at?: string | null
          follow_up_done?: boolean | null
          from_me?: boolean | null
          id?: string
          instance_name?: string
          is_important?: boolean | null
          is_read?: boolean
          is_starred?: boolean | null
          link_preview?: Json | null
          media_bucket?: string | null
          media_filename?: string | null
          media_meta?: Json | null
          media_mimetype?: string | null
          media_path?: string | null
          media_sha256?: string | null
          media_size?: number | null
          media_status?: string | null
          media_type?: string | null
          media_url?: string | null
          message_id?: string | null
          message_type?: string
          notes?: string | null
          payload?: Json | null
          push_name?: string | null
          quoted_message_id?: string | null
          raw_data?: Json | null
          remote_jid?: string
          reply_to_id?: string | null
          retry_attempt?: number | null
          retry_total?: number | null
          sent_by_bot?: boolean | null
          sentiment?: string | null
          status?: string | null
          status_at?: string | null
          sticker_id?: string | null
          tags?: string[] | null
          template_name?: string | null
          transcription?: string | null
          transcription_status?: string | null
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
          created_at: string
          deleted_at: string | null
          direction: string | null
          edited_at: string | null
          error_code: string | null
          error_reason: string | null
          follow_up_at: string | null
          follow_up_done: boolean | null
          from_me: boolean | null
          id: string
          instance_name: string
          is_important: boolean | null
          is_read: boolean
          is_starred: boolean | null
          link_preview: Json | null
          media_bucket: string | null
          media_filename: string | null
          media_meta: Json | null
          media_mimetype: string | null
          media_path: string | null
          media_sha256: string | null
          media_size: number | null
          media_status: string | null
          media_type: string | null
          media_url: string | null
          message_id: string | null
          message_type: string
          notes: string | null
          payload: Json | null
          push_name: string | null
          quoted_message_id: string | null
          raw_data: Json | null
          remote_jid: string
          reply_to_id: string | null
          retry_attempt: number | null
          retry_total: number | null
          sent_by_bot: boolean | null
          sentiment: string | null
          status: string | null
          status_at: string | null
          sticker_id: string | null
          tags: string[] | null
          template_name: string | null
          transcription: string | null
          transcription_status: string | null
          updated_at: string | null
        }
        Insert: {
          audio_meme_id?: string | null
          caption?: string | null
          category?: string | null
          contact_id?: string | null
          content?: string | null
          conversation_id?: string | null
          created_at?: string
          deleted_at?: string | null
          direction?: string | null
          edited_at?: string | null
          error_code?: string | null
          error_reason?: string | null
          follow_up_at?: string | null
          follow_up_done?: boolean | null
          from_me?: boolean | null
          id?: string
          instance_name: string
          is_important?: boolean | null
          is_read?: boolean
          is_starred?: boolean | null
          link_preview?: Json | null
          media_bucket?: string | null
          media_filename?: string | null
          media_meta?: Json | null
          media_mimetype?: string | null
          media_path?: string | null
          media_sha256?: string | null
          media_size?: number | null
          media_status?: string | null
          media_type?: string | null
          media_url?: string | null
          message_id?: string | null
          message_type?: string
          notes?: string | null
          payload?: Json | null
          push_name?: string | null
          quoted_message_id?: string | null
          raw_data?: Json | null
          remote_jid: string
          reply_to_id?: string | null
          retry_attempt?: number | null
          retry_total?: number | null
          sent_by_bot?: boolean | null
          sentiment?: string | null
          status?: string | null
          status_at?: string | null
          sticker_id?: string | null
          tags?: string[] | null
          template_name?: string | null
          transcription?: string | null
          transcription_status?: string | null
          updated_at?: string | null
        }
        Update: {
          audio_meme_id?: string | null
          caption?: string | null
          category?: string | null
          contact_id?: string | null
          content?: string | null
          conversation_id?: string | null
          created_at?: string
          deleted_at?: string | null
          direction?: string | null
          edited_at?: string | null
          error_code?: string | null
          error_reason?: string | null
          follow_up_at?: string | null
          follow_up_done?: boolean | null
          from_me?: boolean | null
          id?: string
          instance_name?: string
          is_important?: boolean | null
          is_read?: boolean
          is_starred?: boolean | null
          link_preview?: Json | null
          media_bucket?: string | null
          media_filename?: string | null
          media_meta?: Json | null
          media_mimetype?: string | null
          media_path?: string | null
          media_sha256?: string | null
          media_size?: number | null
          media_status?: string | null
          media_type?: string | null
          media_url?: string | null
          message_id?: string | null
          message_type?: string
          notes?: string | null
          payload?: Json | null
          push_name?: string | null
          quoted_message_id?: string | null
          raw_data?: Json | null
          remote_jid?: string
          reply_to_id?: string | null
          retry_attempt?: number | null
          retry_total?: number | null
          sent_by_bot?: boolean | null
          sentiment?: string | null
          status?: string | null
          status_at?: string | null
          sticker_id?: string | null
          tags?: string[] | null
          template_name?: string | null
          transcription?: string | null
          transcription_status?: string | null
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
          created_at: string
          deleted_at: string | null
          direction: string | null
          edited_at: string | null
          error_code: string | null
          error_reason: string | null
          follow_up_at: string | null
          follow_up_done: boolean | null
          from_me: boolean | null
          id: string
          instance_name: string
          is_important: boolean | null
          is_read: boolean
          is_starred: boolean | null
          link_preview: Json | null
          media_bucket: string | null
          media_filename: string | null
          media_meta: Json | null
          media_mimetype: string | null
          media_path: string | null
          media_sha256: string | null
          media_size: number | null
          media_status: string | null
          media_type: string | null
          media_url: string | null
          message_id: string | null
          message_type: string
          notes: string | null
          payload: Json | null
          push_name: string | null
          quoted_message_id: string | null
          raw_data: Json | null
          remote_jid: string
          reply_to_id: string | null
          retry_attempt: number | null
          retry_total: number | null
          sent_by_bot: boolean | null
          sentiment: string | null
          status: string | null
          status_at: string | null
          sticker_id: string | null
          tags: string[] | null
          template_name: string | null
          transcription: string | null
          transcription_status: string | null
          updated_at: string | null
        }
        Insert: {
          audio_meme_id?: string | null
          caption?: string | null
          category?: string | null
          contact_id?: string | null
          content?: string | null
          conversation_id?: string | null
          created_at?: string
          deleted_at?: string | null
          direction?: string | null
          edited_at?: string | null
          error_code?: string | null
          error_reason?: string | null
          follow_up_at?: string | null
          follow_up_done?: boolean | null
          from_me?: boolean | null
          id?: string
          instance_name: string
          is_important?: boolean | null
          is_read?: boolean
          is_starred?: boolean | null
          link_preview?: Json | null
          media_bucket?: string | null
          media_filename?: string | null
          media_meta?: Json | null
          media_mimetype?: string | null
          media_path?: string | null
          media_sha256?: string | null
          media_size?: number | null
          media_status?: string | null
          media_type?: string | null
          media_url?: string | null
          message_id?: string | null
          message_type?: string
          notes?: string | null
          payload?: Json | null
          push_name?: string | null
          quoted_message_id?: string | null
          raw_data?: Json | null
          remote_jid: string
          reply_to_id?: string | null
          retry_attempt?: number | null
          retry_total?: number | null
          sent_by_bot?: boolean | null
          sentiment?: string | null
          status?: string | null
          status_at?: string | null
          sticker_id?: string | null
          tags?: string[] | null
          template_name?: string | null
          transcription?: string | null
          transcription_status?: string | null
          updated_at?: string | null
        }
        Update: {
          audio_meme_id?: string | null
          caption?: string | null
          category?: string | null
          contact_id?: string | null
          content?: string | null
          conversation_id?: string | null
          created_at?: string
          deleted_at?: string | null
          direction?: string | null
          edited_at?: string | null
          error_code?: string | null
          error_reason?: string | null
          follow_up_at?: string | null
          follow_up_done?: boolean | null
          from_me?: boolean | null
          id?: string
          instance_name?: string
          is_important?: boolean | null
          is_read?: boolean
          is_starred?: boolean | null
          link_preview?: Json | null
          media_bucket?: string | null
          media_filename?: string | null
          media_meta?: Json | null
          media_mimetype?: string | null
          media_path?: string | null
          media_sha256?: string | null
          media_size?: number | null
          media_status?: string | null
          media_type?: string | null
          media_url?: string | null
          message_id?: string | null
          message_type?: string
          notes?: string | null
          payload?: Json | null
          push_name?: string | null
          quoted_message_id?: string | null
          raw_data?: Json | null
          remote_jid?: string
          reply_to_id?: string | null
          retry_attempt?: number | null
          retry_total?: number | null
          sent_by_bot?: boolean | null
          sentiment?: string | null
          status?: string | null
          status_at?: string | null
          sticker_id?: string | null
          tags?: string[] | null
          template_name?: string | null
          transcription?: string | null
          transcription_status?: string | null
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
          created_at: string
          deleted_at: string | null
          direction: string | null
          edited_at: string | null
          error_code: string | null
          error_reason: string | null
          follow_up_at: string | null
          follow_up_done: boolean | null
          from_me: boolean | null
          id: string
          instance_name: string
          is_important: boolean | null
          is_read: boolean
          is_starred: boolean | null
          link_preview: Json | null
          media_bucket: string | null
          media_filename: string | null
          media_meta: Json | null
          media_mimetype: string | null
          media_path: string | null
          media_sha256: string | null
          media_size: number | null
          media_status: string | null
          media_type: string | null
          media_url: string | null
          message_id: string | null
          message_type: string
          notes: string | null
          payload: Json | null
          push_name: string | null
          quoted_message_id: string | null
          raw_data: Json | null
          remote_jid: string
          reply_to_id: string | null
          retry_attempt: number | null
          retry_total: number | null
          sent_by_bot: boolean | null
          sentiment: string | null
          status: string | null
          status_at: string | null
          sticker_id: string | null
          tags: string[] | null
          template_name: string | null
          transcription: string | null
          transcription_status: string | null
          updated_at: string | null
        }
        Insert: {
          audio_meme_id?: string | null
          caption?: string | null
          category?: string | null
          contact_id?: string | null
          content?: string | null
          conversation_id?: string | null
          created_at?: string
          deleted_at?: string | null
          direction?: string | null
          edited_at?: string | null
          error_code?: string | null
          error_reason?: string | null
          follow_up_at?: string | null
          follow_up_done?: boolean | null
          from_me?: boolean | null
          id?: string
          instance_name: string
          is_important?: boolean | null
          is_read?: boolean
          is_starred?: boolean | null
          link_preview?: Json | null
          media_bucket?: string | null
          media_filename?: string | null
          media_meta?: Json | null
          media_mimetype?: string | null
          media_path?: string | null
          media_sha256?: string | null
          media_size?: number | null
          media_status?: string | null
          media_type?: string | null
          media_url?: string | null
          message_id?: string | null
          message_type?: string
          notes?: string | null
          payload?: Json | null
          push_name?: string | null
          quoted_message_id?: string | null
          raw_data?: Json | null
          remote_jid: string
          reply_to_id?: string | null
          retry_attempt?: number | null
          retry_total?: number | null
          sent_by_bot?: boolean | null
          sentiment?: string | null
          status?: string | null
          status_at?: string | null
          sticker_id?: string | null
          tags?: string[] | null
          template_name?: string | null
          transcription?: string | null
          transcription_status?: string | null
          updated_at?: string | null
        }
        Update: {
          audio_meme_id?: string | null
          caption?: string | null
          category?: string | null
          contact_id?: string | null
          content?: string | null
          conversation_id?: string | null
          created_at?: string
          deleted_at?: string | null
          direction?: string | null
          edited_at?: string | null
          error_code?: string | null
          error_reason?: string | null
          follow_up_at?: string | null
          follow_up_done?: boolean | null
          from_me?: boolean | null
          id?: string
          instance_name?: string
          is_important?: boolean | null
          is_read?: boolean
          is_starred?: boolean | null
          link_preview?: Json | null
          media_bucket?: string | null
          media_filename?: string | null
          media_meta?: Json | null
          media_mimetype?: string | null
          media_path?: string | null
          media_sha256?: string | null
          media_size?: number | null
          media_status?: string | null
          media_type?: string | null
          media_url?: string | null
          message_id?: string | null
          message_type?: string
          notes?: string | null
          payload?: Json | null
          push_name?: string | null
          quoted_message_id?: string | null
          raw_data?: Json | null
          remote_jid?: string
          reply_to_id?: string | null
          retry_attempt?: number | null
          retry_total?: number | null
          sent_by_bot?: boolean | null
          sentiment?: string | null
          status?: string | null
          status_at?: string | null
          sticker_id?: string | null
          tags?: string[] | null
          template_name?: string | null
          transcription?: string | null
          transcription_status?: string | null
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
          created_at: string
          deleted_at: string | null
          direction: string | null
          edited_at: string | null
          follow_up_at: string | null
          follow_up_done: boolean | null
          from_me: boolean | null
          id: string
          instance_name: string
          is_important: boolean | null
          is_read: boolean
          is_starred: boolean | null
          link_preview: Json | null
          media_bucket: string | null
          media_filename: string | null
          media_meta: Json | null
          media_mimetype: string | null
          media_path: string | null
          media_sha256: string | null
          media_size: number | null
          media_status: string | null
          media_type: string | null
          media_url: string | null
          message_id: string | null
          message_type: string
          notes: string | null
          payload: Json | null
          push_name: string | null
          quoted_message_id: string | null
          raw_data: Json | null
          remote_jid: string
          reply_to_id: string | null
          sent_by_bot: boolean | null
          sentiment: string | null
          status: string | null
          status_at: string | null
          sticker_id: string | null
          tags: string[] | null
          template_name: string | null
          transcription: string | null
          transcription_status: string | null
          updated_at: string | null
        }
        Insert: {
          audio_meme_id?: string | null
          caption?: string | null
          category?: string | null
          contact_id?: string | null
          content?: string | null
          conversation_id?: string | null
          created_at?: string
          deleted_at?: string | null
          direction?: string | null
          edited_at?: string | null
          follow_up_at?: string | null
          follow_up_done?: boolean | null
          from_me?: boolean | null
          id?: string
          instance_name: string
          is_important?: boolean | null
          is_read?: boolean
          is_starred?: boolean | null
          link_preview?: Json | null
          media_bucket?: string | null
          media_filename?: string | null
          media_meta?: Json | null
          media_mimetype?: string | null
          media_path?: string | null
          media_sha256?: string | null
          media_size?: number | null
          media_status?: string | null
          media_type?: string | null
          media_url?: string | null
          message_id?: string | null
          message_type?: string
          notes?: string | null
          payload?: Json | null
          push_name?: string | null
          quoted_message_id?: string | null
          raw_data?: Json | null
          remote_jid: string
          reply_to_id?: string | null
          sent_by_bot?: boolean | null
          sentiment?: string | null
          status?: string | null
          status_at?: string | null
          sticker_id?: string | null
          tags?: string[] | null
          template_name?: string | null
          transcription?: string | null
          transcription_status?: string | null
          updated_at?: string | null
        }
        Update: {
          audio_meme_id?: string | null
          caption?: string | null
          category?: string | null
          contact_id?: string | null
          content?: string | null
          conversation_id?: string | null
          created_at?: string
          deleted_at?: string | null
          direction?: string | null
          edited_at?: string | null
          follow_up_at?: string | null
          follow_up_done?: boolean | null
          from_me?: boolean | null
          id?: string
          instance_name?: string
          is_important?: boolean | null
          is_read?: boolean
          is_starred?: boolean | null
          link_preview?: Json | null
          media_bucket?: string | null
          media_filename?: string | null
          media_meta?: Json | null
          media_mimetype?: string | null
          media_path?: string | null
          media_sha256?: string | null
          media_size?: number | null
          media_status?: string | null
          media_type?: string | null
          media_url?: string | null
          message_id?: string | null
          message_type?: string
          notes?: string | null
          payload?: Json | null
          push_name?: string | null
          quoted_message_id?: string | null
          raw_data?: Json | null
          remote_jid?: string
          reply_to_id?: string | null
          sent_by_bot?: boolean | null
          sentiment?: string | null
          status?: string | null
          status_at?: string | null
          sticker_id?: string | null
          tags?: string[] | null
          template_name?: string | null
          transcription?: string | null
          transcription_status?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      evolution_mirror_batches: {
        Row: {
          batch_seq: number
          bytes_gz: number | null
          consumed_at: string | null
          consumed_status: string | null
          consumer_error: string | null
          created_at: string
          id: number
          metrics: Json | null
          row_count: number | null
          run_id: string | null
          s3_bucket: string
          s3_key: string
        }
        Insert: {
          batch_seq: number
          bytes_gz?: number | null
          consumed_at?: string | null
          consumed_status?: string | null
          consumer_error?: string | null
          created_at?: string
          id?: number
          metrics?: Json | null
          row_count?: number | null
          run_id?: string | null
          s3_bucket?: string
          s3_key: string
        }
        Update: {
          batch_seq?: number
          bytes_gz?: number | null
          consumed_at?: string | null
          consumed_status?: string | null
          consumer_error?: string | null
          created_at?: string
          id?: number
          metrics?: Json | null
          row_count?: number | null
          run_id?: string | null
          s3_bucket?: string
          s3_key?: string
        }
        Relationships: []
      }
      evolution_mirror_checkpoints: {
        Row: {
          checkpoint_key: string
          id: number
          last_message_id: string | null
          last_synced_at: string
          total_synced: number | null
          updated_at: string
        }
        Insert: {
          checkpoint_key: string
          id?: number
          last_message_id?: string | null
          last_synced_at: string
          total_synced?: number | null
          updated_at?: string
        }
        Update: {
          checkpoint_key?: string
          id?: number
          last_message_id?: string | null
          last_synced_at?: string
          total_synced?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      evolution_mirror_media_queue: {
        Row: {
          created_at: string
          downloaded_at: string | null
          file_length: number | null
          id: number
          last_error: string | null
          media_key: string | null
          media_type: string
          media_url_source: string | null
          message_id: string
          mimetype: string | null
          minio_path: string | null
          retry_count: number | null
          status: string
          transcription: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          downloaded_at?: string | null
          file_length?: number | null
          id?: number
          last_error?: string | null
          media_key?: string | null
          media_type: string
          media_url_source?: string | null
          message_id: string
          mimetype?: string | null
          minio_path?: string | null
          retry_count?: number | null
          status?: string
          transcription?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          downloaded_at?: string | null
          file_length?: number | null
          id?: number
          last_error?: string | null
          media_key?: string | null
          media_type?: string
          media_url_source?: string | null
          message_id?: string
          mimetype?: string | null
          minio_path?: string | null
          retry_count?: number | null
          status?: string
          transcription?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      evolution_mirror_runs: {
        Row: {
          chunks_processed: number | null
          completed_at: string | null
          created_at: string
          duration_seconds: number | null
          error_message: string | null
          id: string
          messages_errored: number | null
          messages_exported: number | null
          messages_inserted: number | null
          messages_skipped: number | null
          metadata: Json | null
          run_type: string
          since_timestamp: string | null
          started_at: string
          status: string
          until_timestamp: string | null
        }
        Insert: {
          chunks_processed?: number | null
          completed_at?: string | null
          created_at?: string
          duration_seconds?: number | null
          error_message?: string | null
          id?: string
          messages_errored?: number | null
          messages_exported?: number | null
          messages_inserted?: number | null
          messages_skipped?: number | null
          metadata?: Json | null
          run_type: string
          since_timestamp?: string | null
          started_at?: string
          status: string
          until_timestamp?: string | null
        }
        Update: {
          chunks_processed?: number | null
          completed_at?: string | null
          created_at?: string
          duration_seconds?: number | null
          error_message?: string | null
          id?: string
          messages_errored?: number | null
          messages_exported?: number | null
          messages_inserted?: number | null
          messages_skipped?: number | null
          metadata?: Json | null
          run_type?: string
          since_timestamp?: string | null
          started_at?: string
          status?: string
          until_timestamp?: string | null
        }
        Relationships: []
      }
      evolution_monthly_audit_log: {
        Row: {
          audit_month: string
          created_at: string
          id: number
          report: Json
        }
        Insert: {
          audit_month: string
          created_at?: string
          id?: number
          report: Json
        }
        Update: {
          audit_month?: string
          created_at?: string
          id?: number
          report?: Json
        }
        Relationships: []
      }
      evolution_notification_config: {
        Row: {
          api_token: string | null
          channel: string
          chat_id: string | null
          created_at: string | null
          email_addresses: string[] | null
          enabled: boolean | null
          id: string
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
          channel: string
          chat_id?: string | null
          created_at?: string | null
          email_addresses?: string[] | null
          enabled?: boolean | null
          id?: string
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
          channel?: string
          chat_id?: string | null
          created_at?: string | null
          email_addresses?: string[] | null
          enabled?: boolean | null
          id?: string
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
          channel: string
          created_at: string | null
          error_message: string | null
          id: string
          message: string
          sent_at: string | null
          status: string | null
        }
        Insert: {
          alert_id?: string | null
          channel: string
          created_at?: string | null
          error_message?: string | null
          id?: string
          message: string
          sent_at?: string | null
          status?: string | null
        }
        Update: {
          alert_id?: string | null
          channel?: string
          created_at?: string | null
          error_message?: string | null
          id?: string
          message?: string
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
          id: string
          message: string
          metadata: Json | null
          notification_type: string
          priority: string | null
          read_at: string | null
          read_by: string | null
          status: string | null
          title: string
        }
        Insert: {
          alert_id?: string | null
          channels_sent?: string[] | null
          contact_id?: string | null
          conversation_id?: string | null
          created_at?: string | null
          deal_id?: string | null
          id?: string
          message: string
          metadata?: Json | null
          notification_type: string
          priority?: string | null
          read_at?: string | null
          read_by?: string | null
          status?: string | null
          title: string
        }
        Update: {
          alert_id?: string | null
          channels_sent?: string[] | null
          contact_id?: string | null
          conversation_id?: string | null
          created_at?: string | null
          deal_id?: string | null
          id?: string
          message?: string
          metadata?: Json | null
          notification_type?: string
          priority?: string | null
          read_at?: string | null
          read_by?: string | null
          status?: string | null
          title?: string
        }
        Relationships: []
      }
      evolution_performance_metrics: {
        Row: {
          created_at: string | null
          id: string
          metadata: Json | null
          metric_date: string
          metric_type: string
          metric_value: number
        }
        Insert: {
          created_at?: string | null
          id?: string
          metadata?: Json | null
          metric_date?: string
          metric_type: string
          metric_value: number
        }
        Update: {
          created_at?: string | null
          id?: string
          metadata?: Json | null
          metric_date?: string
          metric_type?: string
          metric_value?: number
        }
        Relationships: []
      }
      evolution_pipeline_health_log: {
        Row: {
          alerts_critical_open: number | null
          alerts_unresolved: number | null
          baileys_health: string | null
          baileys_severity: number | null
          checked_at: string
          consumer_filas: string | null
          consumer_ok_count: number | null
          created_at: string | null
          detail: string | null
          evo_state: string | null
          gap_inbound_min: number | null
          id: string
          instance_name: string | null
          notes: string | null
          pipeline_status:
            | "healthy"
            | "warning"
            | "degraded_webhook"
            | "degraded_sender"
            | "critical_alerts"
            | "critical"
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
          checked_at?: string
          consumer_filas?: string | null
          consumer_ok_count?: number | null
          created_at?: string | null
          detail?: string | null
          evo_state?: string | null
          gap_inbound_min?: number | null
          id?: string
          instance_name?: string | null
          notes?: string | null
          pipeline_status:
            | "healthy"
            | "warning"
            | "degraded_webhook"
            | "degraded_sender"
            | "critical_alerts"
            | "critical"
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
          checked_at?: string
          consumer_filas?: string | null
          consumer_ok_count?: number | null
          created_at?: string | null
          detail?: string | null
          evo_state?: string | null
          gap_inbound_min?: number | null
          id?: string
          instance_name?: string | null
          notes?: string | null
          pipeline_status?:
            | "healthy"
            | "warning"
            | "degraded_webhook"
            | "degraded_sender"
            | "critical_alerts"
            | "critical"
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
          id: string
          pipeline_id: string | null
          reason: string | null
          to_stage: string | null
        }
        Insert: {
          changed_by?: string | null
          created_at?: string | null
          from_stage?: string | null
          id?: string
          pipeline_id?: string | null
          reason?: string | null
          to_stage?: string | null
        }
        Update: {
          changed_by?: string | null
          created_at?: string | null
          from_stage?: string | null
          id?: string
          pipeline_id?: string | null
          reason?: string | null
          to_stage?: string | null
        }
        Relationships: []
      }
      evolution_quick_replies: {
        Row: {
          category: string | null
          content: string
          created_at: string | null
          id: string
          is_active: boolean | null
          shortcut: string
          title: string
          use_count: number | null
        }
        Insert: {
          category?: string | null
          content: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          shortcut: string
          title: string
          use_count?: number | null
        }
        Update: {
          category?: string | null
          content?: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          shortcut?: string
          title?: string
          use_count?: number | null
        }
        Relationships: []
      }
      evolution_reactions: {
        Row: {
          created_at: string | null
          emoji: string
          from_me: boolean | null
          id: string
          instance_name: string
          message_id: string
          push_name: string | null
          reacted_at: string | null
          remote_jid: string
        }
        Insert: {
          created_at?: string | null
          emoji: string
          from_me?: boolean | null
          id?: string
          instance_name: string
          message_id: string
          push_name?: string | null
          reacted_at?: string | null
          remote_jid: string
        }
        Update: {
          created_at?: string | null
          emoji?: string
          from_me?: boolean | null
          id?: string
          instance_name?: string
          message_id?: string
          push_name?: string | null
          reacted_at?: string | null
          remote_jid?: string
        }
        Relationships: []
      }
      evolution_realtime_events: {
        Row: {
          body: string | null
          created_at: string | null
          data: Json | null
          entity_id: string | null
          entity_type: string
          event_type: string
          id: string
          priority: string | null
          read: boolean | null
          read_at: string | null
          remote_jid: string | null
          target_users: string[] | null
          title: string
        }
        Insert: {
          body?: string | null
          created_at?: string | null
          data?: Json | null
          entity_id?: string | null
          entity_type: string
          event_type: string
          id?: string
          priority?: string | null
          read?: boolean | null
          read_at?: string | null
          remote_jid?: string | null
          target_users?: string[] | null
          title: string
        }
        Update: {
          body?: string | null
          created_at?: string | null
          data?: Json | null
          entity_id?: string | null
          entity_type?: string
          event_type?: string
          id?: string
          priority?: string | null
          read?: boolean | null
          read_at?: string | null
          remote_jid?: string | null
          target_users?: string[] | null
          title?: string
        }
        Relationships: []
      }
      evolution_reconcile_jobs: {
        Row: {
          applied_at: string | null
          dispatched_at: string
          http_status: number | null
          id: number
          request_id: number
          result: Json | null
        }
        Insert: {
          applied_at?: string | null
          dispatched_at?: string
          http_status?: number | null
          id?: number
          request_id: number
          result?: Json | null
        }
        Update: {
          applied_at?: string | null
          dispatched_at?: string
          http_status?: number | null
          id?: number
          request_id?: number
          result?: Json | null
        }
        Relationships: []
      }
      evolution_retention_log: {
        Row: {
          deleted_processed: number
          deleted_unprocessed: number
          duration_ms: number
          error_message: string | null
          freed_bytes_pretty: string
          freed_bytes_raw: number
          id: number
          processed_days_kept: number
          ran_at: string
          triggered_by: string
          unprocessed_days_kept: number
        }
        Insert: {
          deleted_processed: number
          deleted_unprocessed: number
          duration_ms: number
          error_message?: string | null
          freed_bytes_pretty: string
          freed_bytes_raw: number
          id?: number
          processed_days_kept: number
          ran_at?: string
          triggered_by?: string
          unprocessed_days_kept: number
        }
        Update: {
          deleted_processed?: number
          deleted_unprocessed?: number
          duration_ms?: number
          error_message?: string | null
          freed_bytes_pretty?: string
          freed_bytes_raw?: number
          id?: number
          processed_days_kept?: number
          ran_at?: string
          triggered_by?: string
          unprocessed_days_kept?: number
        }
        Relationships: []
      }
      evolution_retry_metrics: {
        Row: {
          action: string
          attempt_count: number
          created_at: string | null
          final_http_status: number | null
          final_status: string
          id: string
          idempotency_key: string | null
          instance_name: string | null
          method: string
          retry_reasons: Json
          total_duration_ms: number | null
        }
        Insert: {
          action: string
          attempt_count: number
          created_at?: string | null
          final_http_status?: number | null
          final_status: string
          id?: string
          idempotency_key?: string | null
          instance_name?: string | null
          method: string
          retry_reasons?: Json
          total_duration_ms?: number | null
        }
        Update: {
          action?: string
          attempt_count?: number
          created_at?: string | null
          final_http_status?: number | null
          final_status?: string
          id?: string
          idempotency_key?: string | null
          instance_name?: string | null
          method?: string
          retry_reasons?: Json
          total_duration_ms?: number | null
        }
        Relationships: []
      }
      evolution_sales_pipeline: {
        Row: {
          assigned_to: string | null
          created_at: string | null
          current_stage: string
          id: string
          last_message_at: string | null
          metadata: Json | null
          notes: string | null
          previous_stage: string | null
          push_name: string | null
          remote_jid: string
          stage_changed_at: string | null
          total_messages: number | null
          updated_at: string | null
        }
        Insert: {
          assigned_to?: string | null
          created_at?: string | null
          current_stage?: string
          id?: string
          last_message_at?: string | null
          metadata?: Json | null
          notes?: string | null
          previous_stage?: string | null
          push_name?: string | null
          remote_jid: string
          stage_changed_at?: string | null
          total_messages?: number | null
          updated_at?: string | null
        }
        Update: {
          assigned_to?: string | null
          created_at?: string | null
          current_stage?: string
          id?: string
          last_message_at?: string | null
          metadata?: Json | null
          notes?: string | null
          previous_stage?: string | null
          push_name?: string | null
          remote_jid?: string
          stage_changed_at?: string | null
          total_messages?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      evolution_scheduled_messages: {
        Row: {
          contact_id: string | null
          content: string
          created_at: string | null
          created_by: string | null
          error_message: string | null
          id: string
          instance_name: string | null
          media_url: string | null
          scheduled_at: string
          sent_at: string | null
          status: string | null
          template_id: string | null
        }
        Insert: {
          contact_id?: string | null
          content: string
          created_at?: string | null
          created_by?: string | null
          error_message?: string | null
          id?: string
          instance_name?: string | null
          media_url?: string | null
          scheduled_at: string
          sent_at?: string | null
          status?: string | null
          template_id?: string | null
        }
        Update: {
          contact_id?: string | null
          content?: string
          created_at?: string | null
          created_by?: string | null
          error_message?: string | null
          id?: string
          instance_name?: string | null
          media_url?: string | null
          scheduled_at?: string
          sent_at?: string | null
          status?: string | null
          template_id?: string | null
        }
        Relationships: []
      }
      evolution_send_idempotency: {
        Row: {
          created_at: string | null
          expires_at: string
          external_message_id: string | null
          http_status: number
          idem_key: string
          instance_name: string
          path: string
          response: Json
        }
        Insert: {
          created_at?: string | null
          expires_at: string
          external_message_id?: string | null
          http_status: number
          idem_key: string
          instance_name: string
          path: string
          response?: Json
        }
        Update: {
          created_at?: string | null
          expires_at?: string
          external_message_id?: string | null
          http_status?: number
          idem_key?: string
          instance_name?: string
          path?: string
          response?: Json
        }
        Relationships: []
      }
      evolution_sentiment_alerts: {
        Row: {
          acknowledged: boolean | null
          acknowledged_at: string | null
          acknowledged_by: string | null
          alert_type: string
          contact_id: string | null
          conversation_id: string | null
          created_at: string | null
          id: string
          message_preview: string | null
          resolution_notes: string | null
          resolved: boolean | null
          sentiment_id: string | null
          severity: string
        }
        Insert: {
          acknowledged?: boolean | null
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          alert_type: string
          contact_id?: string | null
          conversation_id?: string | null
          created_at?: string | null
          id?: string
          message_preview?: string | null
          resolution_notes?: string | null
          resolved?: boolean | null
          sentiment_id?: string | null
          severity: string
        }
        Update: {
          acknowledged?: boolean | null
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          alert_type?: string
          contact_id?: string | null
          conversation_id?: string | null
          created_at?: string | null
          id?: string
          message_preview?: string | null
          resolution_notes?: string | null
          resolved?: boolean | null
          sentiment_id?: string | null
          severity?: string
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
          external_message_id: string | null
          id: string
          instance_name: string
          intent: string | null
          keywords: string[] | null
          message_id: string
          message_text: string
          model_used: string | null
          remote_jid: string
          requires_attention: boolean | null
          sentiment: string
          sentiment_score: number | null
          urgency: string | null
        }
        Insert: {
          analyzed_at?: string | null
          contact_id?: string | null
          conversation_id?: string | null
          created_at?: string | null
          emotions?: Json | null
          external_message_id?: string | null
          id?: string
          instance_name?: string
          intent?: string | null
          keywords?: string[] | null
          message_id: string
          message_text: string
          model_used?: string | null
          remote_jid: string
          requires_attention?: boolean | null
          sentiment: string
          sentiment_score?: number | null
          urgency?: string | null
        }
        Update: {
          analyzed_at?: string | null
          contact_id?: string | null
          conversation_id?: string | null
          created_at?: string | null
          emotions?: Json | null
          external_message_id?: string | null
          id?: string
          instance_name?: string
          intent?: string | null
          keywords?: string[] | null
          message_id?: string
          message_text?: string
          model_used?: string | null
          remote_jid?: string
          requires_attention?: boolean | null
          sentiment?: string
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
          id: string
          metric_date: string
          negative_count: number | null
          neutral_count: number | null
          positive_count: number | null
          total_messages: number | null
        }
        Insert: {
          alerts_generated?: number | null
          avg_sentiment_score?: number | null
          calculated_at?: string | null
          id?: string
          metric_date: string
          negative_count?: number | null
          neutral_count?: number | null
          positive_count?: number | null
          total_messages?: number | null
        }
        Update: {
          alerts_generated?: number | null
          avg_sentiment_score?: number | null
          calculated_at?: string | null
          id?: string
          metric_date?: string
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
          id: string
          is_secret: boolean | null
          key: string
          updated_at: string | null
          value: Json
        }
        Insert: {
          category?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          is_secret?: boolean | null
          key: string
          updated_at?: string | null
          value: Json
        }
        Update: {
          category?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          is_secret?: boolean | null
          key?: string
          updated_at?: string | null
          value?: Json
        }
        Relationships: []
      }
      evolution_source_schema_map: {
        Row: {
          column_name: string | null
          data_type: string | null
          database_name: string
          discovered_at: string
          id: number
          is_nullable: string | null
          is_primary_key: boolean | null
          is_unique: boolean | null
          ordinal_position: number | null
          raw_metadata: Json | null
          row_count_est: number | null
          schema_name: string
          table_name: string
        }
        Insert: {
          column_name?: string | null
          data_type?: string | null
          database_name: string
          discovered_at?: string
          id?: number
          is_nullable?: string | null
          is_primary_key?: boolean | null
          is_unique?: boolean | null
          ordinal_position?: number | null
          raw_metadata?: Json | null
          row_count_est?: number | null
          schema_name: string
          table_name: string
        }
        Update: {
          column_name?: string | null
          data_type?: string | null
          database_name?: string
          discovered_at?: string
          id?: number
          is_nullable?: string | null
          is_primary_key?: boolean | null
          is_unique?: boolean | null
          ordinal_position?: number | null
          raw_metadata?: Json | null
          row_count_est?: number | null
          schema_name?: string
          table_name?: string
        }
        Relationships: []
      }
      evolution_spam_keywords: {
        Row: {
          action: string | null
          auto_reply_message: string | null
          created_at: string | null
          hit_count: number | null
          id: string
          is_active: boolean | null
          keyword: string
          match_type: string | null
        }
        Insert: {
          action?: string | null
          auto_reply_message?: string | null
          created_at?: string | null
          hit_count?: number | null
          id?: string
          is_active?: boolean | null
          keyword: string
          match_type?: string | null
        }
        Update: {
          action?: string | null
          auto_reply_message?: string | null
          created_at?: string | null
          hit_count?: number | null
          id?: string
          is_active?: boolean | null
          keyword?: string
          match_type?: string | null
        }
        Relationships: []
      }
      evolution_stage_mapping: {
        Row: {
          auto_transition_after_hours: number | null
          label_color: string | null
          label_name: string
          next_stage: string | null
          stage_key: string
          stage_order: number | null
        }
        Insert: {
          auto_transition_after_hours?: number | null
          label_color?: string | null
          label_name: string
          next_stage?: string | null
          stage_key: string
          stage_order?: number | null
        }
        Update: {
          auto_transition_after_hours?: number | null
          label_color?: string | null
          label_name?: string
          next_stage?: string | null
          stage_key?: string
          stage_order?: number | null
        }
        Relationships: []
      }
      evolution_status_auto_rules: {
        Row: {
          cooldown_hours: number | null
          created_at: string | null
          created_by: string | null
          id: string
          instance_name: string | null
          is_active: boolean | null
          max_reactions_per_day: number | null
          name: string
          reaction_emoji: string
          target_filter: Json | null
          updated_at: string | null
        }
        Insert: {
          cooldown_hours?: number | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          instance_name?: string | null
          is_active?: boolean | null
          max_reactions_per_day?: number | null
          name: string
          reaction_emoji?: string
          target_filter?: Json | null
          updated_at?: string | null
        }
        Update: {
          cooldown_hours?: number | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          instance_name?: string | null
          is_active?: boolean | null
          max_reactions_per_day?: number | null
          name?: string
          reaction_emoji?: string
          target_filter?: Json | null
          updated_at?: string | null
        }
        Relationships: []
      }
      evolution_status_reactions: {
        Row: {
          automation_rule_id: string | null
          created_at: string | null
          id: string
          instance_name: string
          reacted_at: string | null
          reacted_by: string | null
          reaction_emoji: string
          reaction_type: string
          send_error: string | null
          sent_at: string | null
          sent_to_whatsapp: boolean | null
          status_id: string
        }
        Insert: {
          automation_rule_id?: string | null
          created_at?: string | null
          id?: string
          instance_name?: string
          reacted_at?: string | null
          reacted_by?: string | null
          reaction_emoji?: string
          reaction_type?: string
          send_error?: string | null
          sent_at?: string | null
          sent_to_whatsapp?: boolean | null
          status_id: string
        }
        Update: {
          automation_rule_id?: string | null
          created_at?: string | null
          id?: string
          instance_name?: string
          reacted_at?: string | null
          reacted_by?: string | null
          reaction_emoji?: string
          reaction_type?: string
          send_error?: string | null
          sent_at?: string | null
          sent_to_whatsapp?: boolean | null
          status_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "evolution_status_reactions_status_id_fkey"
            columns: ["status_id"]
            isOneToOne: false
            referencedRelation: "evolution_whatsapp_status"
            referencedColumns: ["id"]
          },
        ]
      }
      evolution_tag_assignments: {
        Row: {
          assigned_at: string | null
          assigned_by: string | null
          entity_id: string
          entity_type: string
          id: string
          tag_id: string | null
        }
        Insert: {
          assigned_at?: string | null
          assigned_by?: string | null
          entity_id: string
          entity_type: string
          id?: string
          tag_id?: string | null
        }
        Update: {
          assigned_at?: string | null
          assigned_by?: string | null
          entity_id?: string
          entity_type?: string
          id?: string
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
          id: string
          name: string
          use_count: number | null
        }
        Insert: {
          auto_apply?: boolean | null
          auto_apply_rules?: Json | null
          category?: string | null
          color?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          name: string
          use_count?: number | null
        }
        Update: {
          auto_apply?: boolean | null
          auto_apply_rules?: Json | null
          category?: string | null
          color?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          name?: string
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
          id: string
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
          title: string
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
          id?: string
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
          title: string
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
          id?: string
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
          title?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      evolution_template_usage: {
        Row: {
          created_at: string | null
          error_message: string | null
          id: string
          remote_jid: string
          send_status: string
          template_id: string | null
          variables_used: Json | null
        }
        Insert: {
          created_at?: string | null
          error_message?: string | null
          id?: string
          remote_jid: string
          send_status?: string
          template_id?: string | null
          variables_used?: Json | null
        }
        Update: {
          created_at?: string | null
          error_message?: string | null
          id?: string
          remote_jid?: string
          send_status?: string
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
          id: string
          last_interaction_at: string | null
          remote_jid: string
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
          id?: string
          last_interaction_at?: string | null
          remote_jid: string
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
          id?: string
          last_interaction_at?: string | null
          remote_jid?: string
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
          error_message: string
          error_stack: string | null
          event_type: string
          id: string
          instance_name: string
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
          status: string
        }
        Insert: {
          consumer_version?: string | null
          created_at?: string | null
          error_message: string
          error_stack?: string | null
          event_type: string
          id?: string
          instance_name: string
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
          status?: string
        }
        Update: {
          consumer_version?: string | null
          created_at?: string | null
          error_message?: string
          error_stack?: string | null
          event_type?: string
          id?: string
          instance_name?: string
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
          status?: string
        }
        Relationships: []
      }
      evolution_webhook_events_v2: {
        Row: {
          created_at: string
          error_message: string | null
          event_type: string
          from_me: boolean | null
          id: string
          instance_name: string
          message_type: string | null
          payload: Json
          processed: boolean | null
          processed_at: string | null
          push_name: string | null
          remote_jid: string | null
          retry_count: number
          status: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          event_type: string
          from_me?: boolean | null
          id?: string
          instance_name: string
          message_type?: string | null
          payload: Json
          processed?: boolean | null
          processed_at?: string | null
          push_name?: string | null
          remote_jid?: string | null
          retry_count?: number
          status?: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          event_type?: string
          from_me?: boolean | null
          id?: string
          instance_name?: string
          message_type?: string | null
          payload?: Json
          processed?: boolean | null
          processed_at?: string | null
          push_name?: string | null
          remote_jid?: string | null
          retry_count?: number
          status?: string
        }
        Relationships: []
      }
      evolution_webhook_events_v2_2026_03: {
        Row: {
          created_at: string
          error_message: string | null
          event_type: string
          from_me: boolean | null
          id: string
          instance_name: string
          message_type: string | null
          payload: Json
          processed: boolean | null
          processed_at: string | null
          push_name: string | null
          remote_jid: string | null
          retry_count: number
          status: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          event_type: string
          from_me?: boolean | null
          id?: string
          instance_name: string
          message_type?: string | null
          payload: Json
          processed?: boolean | null
          processed_at?: string | null
          push_name?: string | null
          remote_jid?: string | null
          retry_count?: number
          status?: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          event_type?: string
          from_me?: boolean | null
          id?: string
          instance_name?: string
          message_type?: string | null
          payload?: Json
          processed?: boolean | null
          processed_at?: string | null
          push_name?: string | null
          remote_jid?: string | null
          retry_count?: number
          status?: string
        }
        Relationships: []
      }
      evolution_webhook_events_v2_2026_04: {
        Row: {
          created_at: string
          error_message: string | null
          event_type: string
          from_me: boolean | null
          id: string
          instance_name: string
          message_type: string | null
          payload: Json
          processed: boolean | null
          processed_at: string | null
          push_name: string | null
          remote_jid: string | null
          retry_count: number
          status: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          event_type: string
          from_me?: boolean | null
          id?: string
          instance_name: string
          message_type?: string | null
          payload: Json
          processed?: boolean | null
          processed_at?: string | null
          push_name?: string | null
          remote_jid?: string | null
          retry_count?: number
          status?: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          event_type?: string
          from_me?: boolean | null
          id?: string
          instance_name?: string
          message_type?: string | null
          payload?: Json
          processed?: boolean | null
          processed_at?: string | null
          push_name?: string | null
          remote_jid?: string | null
          retry_count?: number
          status?: string
        }
        Relationships: []
      }
      evolution_webhook_events_v2_2026_05: {
        Row: {
          created_at: string
          error_message: string | null
          event_type: string
          from_me: boolean | null
          id: string
          instance_name: string
          message_type: string | null
          payload: Json
          processed: boolean | null
          processed_at: string | null
          push_name: string | null
          remote_jid: string | null
          retry_count: number
          status: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          event_type: string
          from_me?: boolean | null
          id?: string
          instance_name: string
          message_type?: string | null
          payload: Json
          processed?: boolean | null
          processed_at?: string | null
          push_name?: string | null
          remote_jid?: string | null
          retry_count?: number
          status?: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          event_type?: string
          from_me?: boolean | null
          id?: string
          instance_name?: string
          message_type?: string | null
          payload?: Json
          processed?: boolean | null
          processed_at?: string | null
          push_name?: string | null
          remote_jid?: string | null
          retry_count?: number
          status?: string
        }
        Relationships: []
      }
      evolution_webhook_events_v2_2026_06: {
        Row: {
          created_at: string
          error_message: string | null
          event_type: string
          from_me: boolean | null
          id: string
          instance_name: string
          message_type: string | null
          payload: Json
          processed: boolean | null
          processed_at: string | null
          push_name: string | null
          remote_jid: string | null
          retry_count: number
          status: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          event_type: string
          from_me?: boolean | null
          id?: string
          instance_name: string
          message_type?: string | null
          payload: Json
          processed?: boolean | null
          processed_at?: string | null
          push_name?: string | null
          remote_jid?: string | null
          retry_count?: number
          status?: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          event_type?: string
          from_me?: boolean | null
          id?: string
          instance_name?: string
          message_type?: string | null
          payload?: Json
          processed?: boolean | null
          processed_at?: string | null
          push_name?: string | null
          remote_jid?: string | null
          retry_count?: number
          status?: string
        }
        Relationships: []
      }
      evolution_webhook_events_v2_2026_07: {
        Row: {
          created_at: string
          error_message: string | null
          event_type: string
          from_me: boolean | null
          id: string
          instance_name: string
          message_type: string | null
          payload: Json
          processed: boolean | null
          processed_at: string | null
          push_name: string | null
          remote_jid: string | null
          retry_count: number
          status: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          event_type: string
          from_me?: boolean | null
          id?: string
          instance_name: string
          message_type?: string | null
          payload: Json
          processed?: boolean | null
          processed_at?: string | null
          push_name?: string | null
          remote_jid?: string | null
          retry_count?: number
          status?: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          event_type?: string
          from_me?: boolean | null
          id?: string
          instance_name?: string
          message_type?: string | null
          payload?: Json
          processed?: boolean | null
          processed_at?: string | null
          push_name?: string | null
          remote_jid?: string | null
          retry_count?: number
          status?: string
        }
        Relationships: []
      }
      evolution_webhook_events_v2_2026_08: {
        Row: {
          created_at: string
          error_message: string | null
          event_type: string
          from_me: boolean | null
          id: string
          instance_name: string
          message_type: string | null
          payload: Json
          processed: boolean | null
          processed_at: string | null
          push_name: string | null
          remote_jid: string | null
          retry_count: number
          status: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          event_type: string
          from_me?: boolean | null
          id?: string
          instance_name: string
          message_type?: string | null
          payload: Json
          processed?: boolean | null
          processed_at?: string | null
          push_name?: string | null
          remote_jid?: string | null
          retry_count?: number
          status?: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          event_type?: string
          from_me?: boolean | null
          id?: string
          instance_name?: string
          message_type?: string | null
          payload?: Json
          processed?: boolean | null
          processed_at?: string | null
          push_name?: string | null
          remote_jid?: string | null
          retry_count?: number
          status?: string
        }
        Relationships: []
      }
      evolution_webhook_events_v2_2026_09: {
        Row: {
          created_at: string
          error_message: string | null
          event_type: string
          from_me: boolean | null
          id: string
          instance_name: string
          message_type: string | null
          payload: Json
          processed: boolean | null
          processed_at: string | null
          push_name: string | null
          remote_jid: string | null
          retry_count: number
          status: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          event_type: string
          from_me?: boolean | null
          id?: string
          instance_name: string
          message_type?: string | null
          payload: Json
          processed?: boolean | null
          processed_at?: string | null
          push_name?: string | null
          remote_jid?: string | null
          retry_count?: number
          status?: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          event_type?: string
          from_me?: boolean | null
          id?: string
          instance_name?: string
          message_type?: string | null
          payload?: Json
          processed?: boolean | null
          processed_at?: string | null
          push_name?: string | null
          remote_jid?: string | null
          retry_count?: number
          status?: string
        }
        Relationships: []
      }
      evolution_webhook_events_v2_2026_10: {
        Row: {
          created_at: string
          error_message: string | null
          event_type: string
          from_me: boolean | null
          id: string
          instance_name: string
          message_type: string | null
          payload: Json
          processed: boolean | null
          processed_at: string | null
          push_name: string | null
          remote_jid: string | null
          retry_count: number
          status: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          event_type: string
          from_me?: boolean | null
          id?: string
          instance_name: string
          message_type?: string | null
          payload: Json
          processed?: boolean | null
          processed_at?: string | null
          push_name?: string | null
          remote_jid?: string | null
          retry_count?: number
          status?: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          event_type?: string
          from_me?: boolean | null
          id?: string
          instance_name?: string
          message_type?: string | null
          payload?: Json
          processed?: boolean | null
          processed_at?: string | null
          push_name?: string | null
          remote_jid?: string | null
          retry_count?: number
          status?: string
        }
        Relationships: []
      }
      evolution_webhook_events_v2_2026_11: {
        Row: {
          created_at: string
          error_message: string | null
          event_type: string
          from_me: boolean | null
          id: string
          instance_name: string
          message_type: string | null
          payload: Json
          processed: boolean | null
          processed_at: string | null
          push_name: string | null
          remote_jid: string | null
          retry_count: number
          status: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          event_type: string
          from_me?: boolean | null
          id?: string
          instance_name: string
          message_type?: string | null
          payload: Json
          processed?: boolean | null
          processed_at?: string | null
          push_name?: string | null
          remote_jid?: string | null
          retry_count?: number
          status?: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          event_type?: string
          from_me?: boolean | null
          id?: string
          instance_name?: string
          message_type?: string | null
          payload?: Json
          processed?: boolean | null
          processed_at?: string | null
          push_name?: string | null
          remote_jid?: string | null
          retry_count?: number
          status?: string
        }
        Relationships: []
      }
      evolution_webhook_events_v2_2026_12: {
        Row: {
          created_at: string
          error_message: string | null
          event_type: string
          from_me: boolean | null
          id: string
          instance_name: string
          message_type: string | null
          payload: Json
          processed: boolean | null
          processed_at: string | null
          push_name: string | null
          remote_jid: string | null
          retry_count: number
          status: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          event_type: string
          from_me?: boolean | null
          id?: string
          instance_name: string
          message_type?: string | null
          payload: Json
          processed?: boolean | null
          processed_at?: string | null
          push_name?: string | null
          remote_jid?: string | null
          retry_count?: number
          status?: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          event_type?: string
          from_me?: boolean | null
          id?: string
          instance_name?: string
          message_type?: string | null
          payload?: Json
          processed?: boolean | null
          processed_at?: string | null
          push_name?: string | null
          remote_jid?: string | null
          retry_count?: number
          status?: string
        }
        Relationships: []
      }
      evolution_webhook_events_v2_2027_01: {
        Row: {
          created_at: string
          error_message: string | null
          event_type: string
          from_me: boolean | null
          id: string
          instance_name: string
          message_type: string | null
          payload: Json
          processed: boolean | null
          processed_at: string | null
          push_name: string | null
          remote_jid: string | null
          retry_count: number
          status: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          event_type: string
          from_me?: boolean | null
          id?: string
          instance_name: string
          message_type?: string | null
          payload: Json
          processed?: boolean | null
          processed_at?: string | null
          push_name?: string | null
          remote_jid?: string | null
          retry_count?: number
          status?: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          event_type?: string
          from_me?: boolean | null
          id?: string
          instance_name?: string
          message_type?: string | null
          payload?: Json
          processed?: boolean | null
          processed_at?: string | null
          push_name?: string | null
          remote_jid?: string | null
          retry_count?: number
          status?: string
        }
        Relationships: []
      }
      evolution_webhook_events_v2_2027_02: {
        Row: {
          created_at: string
          error_message: string | null
          event_type: string
          from_me: boolean | null
          id: string
          instance_name: string
          message_type: string | null
          payload: Json
          processed: boolean | null
          processed_at: string | null
          push_name: string | null
          remote_jid: string | null
          retry_count: number
          status: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          event_type: string
          from_me?: boolean | null
          id?: string
          instance_name: string
          message_type?: string | null
          payload: Json
          processed?: boolean | null
          processed_at?: string | null
          push_name?: string | null
          remote_jid?: string | null
          retry_count?: number
          status?: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          event_type?: string
          from_me?: boolean | null
          id?: string
          instance_name?: string
          message_type?: string | null
          payload?: Json
          processed?: boolean | null
          processed_at?: string | null
          push_name?: string | null
          remote_jid?: string | null
          retry_count?: number
          status?: string
        }
        Relationships: []
      }
      evolution_webhook_events_v2_2027_03: {
        Row: {
          created_at: string
          error_message: string | null
          event_type: string
          from_me: boolean | null
          id: string
          instance_name: string
          message_type: string | null
          payload: Json
          processed: boolean | null
          processed_at: string | null
          push_name: string | null
          remote_jid: string | null
          retry_count: number
          status: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          event_type: string
          from_me?: boolean | null
          id?: string
          instance_name: string
          message_type?: string | null
          payload: Json
          processed?: boolean | null
          processed_at?: string | null
          push_name?: string | null
          remote_jid?: string | null
          retry_count?: number
          status?: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          event_type?: string
          from_me?: boolean | null
          id?: string
          instance_name?: string
          message_type?: string | null
          payload?: Json
          processed?: boolean | null
          processed_at?: string | null
          push_name?: string | null
          remote_jid?: string | null
          retry_count?: number
          status?: string
        }
        Relationships: []
      }
      evolution_webhook_events_v2_2027_04: {
        Row: {
          created_at: string
          error_message: string | null
          event_type: string
          from_me: boolean | null
          id: string
          instance_name: string
          message_type: string | null
          payload: Json
          processed: boolean | null
          processed_at: string | null
          push_name: string | null
          remote_jid: string | null
          retry_count: number
          status: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          event_type: string
          from_me?: boolean | null
          id?: string
          instance_name: string
          message_type?: string | null
          payload: Json
          processed?: boolean | null
          processed_at?: string | null
          push_name?: string | null
          remote_jid?: string | null
          retry_count?: number
          status?: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          event_type?: string
          from_me?: boolean | null
          id?: string
          instance_name?: string
          message_type?: string | null
          payload?: Json
          processed?: boolean | null
          processed_at?: string | null
          push_name?: string | null
          remote_jid?: string | null
          retry_count?: number
          status?: string
        }
        Relationships: []
      }
      evolution_webhook_events_v2_2027_05: {
        Row: {
          created_at: string
          error_message: string | null
          event_type: string
          from_me: boolean | null
          id: string
          instance_name: string
          message_type: string | null
          payload: Json
          processed: boolean | null
          processed_at: string | null
          push_name: string | null
          remote_jid: string | null
          retry_count: number
          status: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          event_type: string
          from_me?: boolean | null
          id?: string
          instance_name: string
          message_type?: string | null
          payload: Json
          processed?: boolean | null
          processed_at?: string | null
          push_name?: string | null
          remote_jid?: string | null
          retry_count?: number
          status?: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          event_type?: string
          from_me?: boolean | null
          id?: string
          instance_name?: string
          message_type?: string | null
          payload?: Json
          processed?: boolean | null
          processed_at?: string | null
          push_name?: string | null
          remote_jid?: string | null
          retry_count?: number
          status?: string
        }
        Relationships: []
      }
      evolution_webhook_events_v2_2027_06: {
        Row: {
          created_at: string
          error_message: string | null
          event_type: string
          from_me: boolean | null
          id: string
          instance_name: string
          message_type: string | null
          payload: Json
          processed: boolean | null
          processed_at: string | null
          push_name: string | null
          remote_jid: string | null
          retry_count: number
          status: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          event_type: string
          from_me?: boolean | null
          id?: string
          instance_name: string
          message_type?: string | null
          payload: Json
          processed?: boolean | null
          processed_at?: string | null
          push_name?: string | null
          remote_jid?: string | null
          retry_count?: number
          status?: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          event_type?: string
          from_me?: boolean | null
          id?: string
          instance_name?: string
          message_type?: string | null
          payload?: Json
          processed?: boolean | null
          processed_at?: string | null
          push_name?: string | null
          remote_jid?: string | null
          retry_count?: number
          status?: string
        }
        Relationships: []
      }
      evolution_webhook_events_v2_default: {
        Row: {
          created_at: string
          error_message: string | null
          event_type: string
          from_me: boolean | null
          id: string
          instance_name: string
          message_type: string | null
          payload: Json
          processed: boolean | null
          processed_at: string | null
          push_name: string | null
          remote_jid: string | null
          retry_count: number
          status: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          event_type: string
          from_me?: boolean | null
          id?: string
          instance_name: string
          message_type?: string | null
          payload: Json
          processed?: boolean | null
          processed_at?: string | null
          push_name?: string | null
          remote_jid?: string | null
          retry_count?: number
          status?: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          event_type?: string
          from_me?: boolean | null
          id?: string
          instance_name?: string
          message_type?: string | null
          payload?: Json
          processed?: boolean | null
          processed_at?: string | null
          push_name?: string | null
          remote_jid?: string | null
          retry_count?: number
          status?: string
        }
        Relationships: []
      }
      evolution_webhook_metrics: {
        Row: {
          avg_processing_time_ms: number | null
          created_at: string | null
          error_count: number | null
          event_count: number | null
          event_type: string
          hour_bucket: string
          id: string
        }
        Insert: {
          avg_processing_time_ms?: number | null
          created_at?: string | null
          error_count?: number | null
          event_count?: number | null
          event_type: string
          hour_bucket: string
          id?: string
        }
        Update: {
          avg_processing_time_ms?: number | null
          created_at?: string | null
          error_count?: number | null
          event_count?: number | null
          event_type?: string
          hour_bucket?: string
          id?: string
        }
        Relationships: []
      }
      evolution_whatsapp_status: {
        Row: {
          contact_id: string | null
          content: string | null
          created_at: string | null
          expires_at: string | null
          id: string
          instance_name: string
          media_meta: Json | null
          media_mimetype: string | null
          media_url: string | null
          message_id: string
          message_type: string | null
          participant_jid: string
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
          id?: string
          instance_name?: string
          media_meta?: Json | null
          media_mimetype?: string | null
          media_url?: string | null
          message_id: string
          message_type?: string | null
          participant_jid: string
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
          id?: string
          instance_name?: string
          media_meta?: Json | null
          media_mimetype?: string | null
          media_url?: string | null
          message_id?: string
          message_type?: string | null
          participant_jid?: string
          participant_name?: string | null
          posted_at?: string | null
          viewed_at?: string | null
          viewed_by_us?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "evolution_whatsapp_status_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "evolution_contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      idx_usage_audit: {
        Row: {
          captured_at: string
          id: string
          idx_scan: number
          idx_tup_fetch: number
          idx_tup_read: number
          index_size_bytes: number
          index_type: string | null
          indexname: string
          is_primary: boolean | null
          is_unique: boolean | null
          recommendation: string | null
          schemaname: string
          tablename: string
        }
        Insert: {
          captured_at?: string
          id?: string
          idx_scan?: number
          idx_tup_fetch?: number
          idx_tup_read?: number
          index_size_bytes?: number
          index_type?: string | null
          indexname: string
          is_primary?: boolean | null
          is_unique?: boolean | null
          recommendation?: string | null
          schemaname: string
          tablename: string
        }
        Update: {
          captured_at?: string
          id?: string
          idx_scan?: number
          idx_tup_fetch?: number
          idx_tup_read?: number
          index_size_bytes?: number
          index_type?: string | null
          indexname?: string
          is_primary?: boolean | null
          is_unique?: boolean | null
          recommendation?: string | null
          schemaname?: string
          tablename?: string
        }
        Relationships: []
      }
      migration_watermark: {
        Row: {
          last_created_at: string | null
          last_id: string | null
          migration_name: string
          rows_migrated: number
          updated_at: string
        }
        Insert: {
          last_created_at?: string | null
          last_id?: string | null
          migration_name: string
          rows_migrated?: number
          updated_at?: string
        }
        Update: {
          last_created_at?: string | null
          last_id?: string | null
          migration_name?: string
          rows_migrated?: number
          updated_at?: string
        }
        Relationships: []
      }
      ops_runbooks: {
        Row: {
          author: string | null
          category: string
          created_at: string | null
          id: string
          links: Json | null
          prevention: string | null
          root_cause: string | null
          severity: string
          steps: Json
          summary: string
          symptoms: Json | null
          title: string
          updated_at: string | null
          version: string
        }
        Insert: {
          author?: string | null
          category: string
          created_at?: string | null
          id?: string
          links?: Json | null
          prevention?: string | null
          root_cause?: string | null
          severity?: string
          steps: Json
          summary: string
          symptoms?: Json | null
          title: string
          updated_at?: string | null
          version?: string
        }
        Update: {
          author?: string | null
          category?: string
          created_at?: string | null
          id?: string
          links?: Json | null
          prevention?: string | null
          root_cause?: string | null
          severity?: string
          steps?: Json
          summary?: string
          symptoms?: Json | null
          title?: string
          updated_at?: string | null
          version?: string
        }
        Relationships: []
      }
      vps_comments: {
        Row: {
          author: string
          content: string
          created_at: string
          id: string
          scenario_id: string
          updated_at: string
        }
        Insert: {
          author?: string
          content: string
          created_at?: string
          id?: string
          scenario_id: string
          updated_at?: string
        }
        Update: {
          author?: string
          content?: string
          created_at?: string
          id?: string
          scenario_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "vps_comments_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: false
            referencedRelation: "v_vps_go_live_checklist"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vps_comments_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: false
            referencedRelation: "v_vps_live_status"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vps_comments_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: false
            referencedRelation: "vps_scenarios"
            referencedColumns: ["id"]
          },
        ]
      }
      vps_diagnostic_runs: {
        Row: {
          id: string
          is_confirmed: boolean | null
          query_executed: string
          ran_at: string
          result_data: Json | null
          result_summary: string | null
          scenario_id: string
          severity_actual: string | null
        }
        Insert: {
          id?: string
          is_confirmed?: boolean | null
          query_executed: string
          ran_at?: string
          result_data?: Json | null
          result_summary?: string | null
          scenario_id: string
          severity_actual?: string | null
        }
        Update: {
          id?: string
          is_confirmed?: boolean | null
          query_executed?: string
          ran_at?: string
          result_data?: Json | null
          result_summary?: string | null
          scenario_id?: string
          severity_actual?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vps_diagnostic_runs_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: false
            referencedRelation: "v_vps_go_live_checklist"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vps_diagnostic_runs_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: false
            referencedRelation: "v_vps_live_status"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vps_diagnostic_runs_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: false
            referencedRelation: "vps_scenarios"
            referencedColumns: ["id"]
          },
        ]
      }
      vps_etapas: {
        Row: {
          bg_color: string
          color: string
          created_at: string
          display_order: number
          icon: string
          id: number
          severity: string
          title: string
        }
        Insert: {
          bg_color: string
          color: string
          created_at?: string
          display_order?: number
          icon: string
          id: number
          severity: string
          title: string
        }
        Update: {
          bg_color?: string
          color?: string
          created_at?: string
          display_order?: number
          icon?: string
          id?: number
          severity?: string
          title?: string
        }
        Relationships: []
      }
      vps_performance_snapshots: {
        Row: {
          alert_count_open: number | null
          alert_count_unacknowledged: number | null
          blockers_open: number | null
          captured_at: string
          cron_failures_24h: number | null
          db_size_mb: number | null
          done_risk: number | null
          evo_size_mb: number | null
          id: string
          idle_connections: number | null
          notes: string | null
          scenarios_doing: number | null
          scenarios_done: number | null
          scenarios_todo: number | null
          system_grade: string | null
          system_health_score: number | null
          total_risk: number | null
          vps_health_score: number | null
        }
        Insert: {
          alert_count_open?: number | null
          alert_count_unacknowledged?: number | null
          blockers_open?: number | null
          captured_at?: string
          cron_failures_24h?: number | null
          db_size_mb?: number | null
          done_risk?: number | null
          evo_size_mb?: number | null
          id?: string
          idle_connections?: number | null
          notes?: string | null
          scenarios_doing?: number | null
          scenarios_done?: number | null
          scenarios_todo?: number | null
          system_grade?: string | null
          system_health_score?: number | null
          total_risk?: number | null
          vps_health_score?: number | null
        }
        Update: {
          alert_count_open?: number | null
          alert_count_unacknowledged?: number | null
          blockers_open?: number | null
          captured_at?: string
          cron_failures_24h?: number | null
          db_size_mb?: number | null
          done_risk?: number | null
          evo_size_mb?: number | null
          id?: string
          idle_connections?: number | null
          notes?: string | null
          scenarios_doing?: number | null
          scenarios_done?: number | null
          scenarios_todo?: number | null
          system_grade?: string | null
          system_health_score?: number | null
          total_risk?: number | null
          vps_health_score?: number | null
        }
        Relationships: []
      }
      vps_scenario_status: {
        Row: {
          notes: string | null
          scenario_id: string
          status: string
          updated_at: string
          updated_by: string
        }
        Insert: {
          notes?: string | null
          scenario_id: string
          status?: string
          updated_at?: string
          updated_by?: string
        }
        Update: {
          notes?: string | null
          scenario_id?: string
          status?: string
          updated_at?: string
          updated_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "vps_scenario_status_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: true
            referencedRelation: "v_vps_go_live_checklist"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vps_scenario_status_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: true
            referencedRelation: "v_vps_live_status"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vps_scenario_status_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: true
            referencedRelation: "vps_scenarios"
            referencedColumns: ["id"]
          },
        ]
      }
      vps_scenarios: {
        Row: {
          category: string
          created_at: string
          etapa_id: number
          fix_action: string
          id: string
          impact: number
          is_blocker: boolean
          linked_column: string | null
          linked_table: string | null
          probability: number
          risk_score: number | null
          title: string
          verified_at: string | null
          verified_result: Json | null
        }
        Insert: {
          category: string
          created_at?: string
          etapa_id: number
          fix_action: string
          id: string
          impact: number
          is_blocker?: boolean
          linked_column?: string | null
          linked_table?: string | null
          probability: number
          risk_score?: number | null
          title: string
          verified_at?: string | null
          verified_result?: Json | null
        }
        Update: {
          category?: string
          created_at?: string
          etapa_id?: number
          fix_action?: string
          id?: string
          impact?: number
          is_blocker?: boolean
          linked_column?: string | null
          linked_table?: string | null
          probability?: number
          risk_score?: number | null
          title?: string
          verified_at?: string | null
          verified_result?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "vps_scenarios_etapa_id_fkey"
            columns: ["etapa_id"]
            isOneToOne: false
            referencedRelation: "mv_vps_risk_dashboard"
            referencedColumns: ["etapa_id"]
          },
          {
            foreignKeyName: "vps_scenarios_etapa_id_fkey"
            columns: ["etapa_id"]
            isOneToOne: false
            referencedRelation: "vps_etapas"
            referencedColumns: ["id"]
          },
        ]
      }
      vps_status_history: {
        Row: {
          changed_at: string
          changed_by: string
          duration_in_prev_status: string | null
          from_status: string | null
          id: string
          notes: string | null
          scenario_id: string
          to_status: string
        }
        Insert: {
          changed_at?: string
          changed_by?: string
          duration_in_prev_status?: string | null
          from_status?: string | null
          id?: string
          notes?: string | null
          scenario_id: string
          to_status: string
        }
        Update: {
          changed_at?: string
          changed_by?: string
          duration_in_prev_status?: string | null
          from_status?: string | null
          id?: string
          notes?: string | null
          scenario_id?: string
          to_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "vps_status_history_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: false
            referencedRelation: "v_vps_go_live_checklist"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vps_status_history_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: false
            referencedRelation: "v_vps_live_status"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vps_status_history_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: false
            referencedRelation: "vps_scenarios"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      active_messages: {
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
        Relationships: [
          {
            foreignKeyName: "fk_evolution_messages_contact"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "evolution_contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      active_webhook_events: {
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
          status:
            | "pending"
            | "success"
            | "skipped"
            | "failed"
            | "dead_letter"
            | null
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
          processed?: never
          processed_at?: string | null
          push_name?: string | null
          remote_jid?: string | null
          status?: never
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
          processed?: never
          processed_at?: string | null
          push_name?: string | null
          remote_jid?: string | null
          status?: never
        }
        Relationships: []
      }
      evolution_messages_v2: {
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
        Relationships: [
          {
            foreignKeyName: "fk_evolution_messages_contact"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "evolution_contacts"
            referencedColumns: ["id"]
          },
        ]
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
      mv_vps_category_breakdown: {
        Row: {
          avg_risk: number | null
          blocker_count: number | null
          category: string | null
          coverage_pct: number | null
          doing_count: number | null
          done_count: number | null
          refreshed_at: string | null
          total: number | null
          total_risk: number | null
        }
        Relationships: []
      }
      mv_vps_risk_dashboard: {
        Row: {
          avg_risk: number | null
          bg_color: string | null
          blockers_open: number | null
          blockers_total: number | null
          color: string | null
          coverage_pct: number | null
          display_order: number | null
          doing_count: number | null
          done_count: number | null
          done_risk: number | null
          etapa_id: number | null
          etapa_title: string | null
          icon: string | null
          max_risk: number | null
          refreshed_at: string | null
          severity: string | null
          todo_count: number | null
          total_risk: number | null
          total_scenarios: number | null
        }
        Relationships: []
      }
      v_401_observability: {
        Row: {
          endpoint: string | null
          endpoint_category: string | null
          first_seen: string | null
          hit_count: number | null
          http_status: number | null
          ip_address: string | null
          last_seen: string | null
          unique_ips: number | null
          user_agents: string[] | null
        }
        Relationships: []
      }
      v_ack_loss_candidates: {
        Row: {
          created_at: string | null
          error_message: string | null
          event_type: string | null
          failure_category: string | null
          id: string | null
          instance_name: string | null
          likely_lost: boolean | null
          queue_name: string | null
          remote_jid: string | null
          retry_count: number | null
          retry_exhausted: boolean | null
          status: string | null
        }
        Insert: {
          created_at?: string | null
          error_message?: string | null
          event_type?: string | null
          failure_category?: never
          id?: string | null
          instance_name?: string | null
          likely_lost?: never
          queue_name?: string | null
          remote_jid?: string | null
          retry_count?: number | null
          retry_exhausted?: never
          status?: string | null
        }
        Update: {
          created_at?: string | null
          error_message?: string | null
          event_type?: string | null
          failure_category?: never
          id?: string | null
          instance_name?: string | null
          likely_lost?: never
          queue_name?: string | null
          remote_jid?: string | null
          retry_count?: number | null
          retry_exhausted?: never
          status?: string | null
        }
        Relationships: []
      }
      v_bootstrap_history: {
        Row: {
          created_at: string | null
          id: string | null
          instance_id: string | null
          instance_name: string | null
          notes: string | null
          rabbitmq_events_count: number | null
          reject_call: string | null
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
          reject_call?: never
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
          reject_call?: never
          status?: string | null
          triggered_by?: string | null
        }
        Relationships: []
      }
      v_dedup_failures: {
        Row: {
          duplicate_count: number | null
          first_seen: string | null
          instances: string[] | null
          jids: string[] | null
          last_seen: string | null
          message_id: string | null
          time_spread: string | null
        }
        Relationships: []
      }
      v_incident_metrics_48h: {
        Row: {
          first_seen: string | null
          last_1h: number | null
          last_seen: string | null
          metric: string | null
          total: number | null
        }
        Relationships: []
      }
      v_messages_unified: {
        Row: {
          _source_table: string | null
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
          _source_table?: never
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
          _source_table?: never
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
        Relationships: [
          {
            foreignKeyName: "fk_evolution_messages_contact"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "evolution_contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      v_pipeline_health: {
        Row: {
          backfill_24h: number | null
          business_hours_status: string | null
          checked_at: string | null
          is_business_hours: boolean | null
          lag_seconds: number | null
          last_bootstrap: string | null
          last_ingest: string | null
          msgs_1h: number | null
          msgs_5min: number | null
          pipeline_status: string | null
          strict_status: string | null
          total_bootstraps: number | null
          traffic_level: string | null
        }
        Relationships: []
      }
      v_production_scorecard: {
        Row: {
          bootstrap_needed_24h: number | null
          generated_at: string | null
          ingest_lag_s: number | null
          instance: string | null
          msgs_last_hour: number | null
          open_alerts: number | null
          pipeline_status: string | null
          strict_status: string | null
          total_contacts: number | null
          total_conversations: number | null
          total_messages: number | null
          traffic_level: string | null
          wpp2_contacts: number | null
        }
        Relationships: []
      }
      v_security_audit: {
        Row: {
          anon_blocked: boolean | null
          name: unknown
          object_type: string | null
          policy_count: number | null
          rls_enabled: boolean | null
          security_definer: boolean | null
          status: string | null
          subtype: string | null
        }
        Relationships: []
      }
      v_spurious_close_events: {
        Row: {
          disconnected_at: string | null
          instance_name: string | null
          is_spurious: boolean | null
          next_state: string | null
          next_state_at: string | null
          reconnect_seconds: number | null
        }
        Relationships: []
      }
      v_unused_index_candidates: {
        Row: {
          captured_at: string | null
          current_state: string | null
          idx_scan: number | null
          index_size_bytes: number | null
          index_size_pretty: string | null
          index_type: string | null
          indexname: string | null
          is_primary: boolean | null
          is_unique: boolean | null
          recommendation: string | null
          schemaname: string | null
          tablename: string | null
        }
        Insert: {
          captured_at?: string | null
          current_state?: never
          idx_scan?: number | null
          index_size_bytes?: number | null
          index_size_pretty?: never
          index_type?: string | null
          indexname?: string | null
          is_primary?: boolean | null
          is_unique?: boolean | null
          recommendation?: string | null
          schemaname?: string | null
          tablename?: string | null
        }
        Update: {
          captured_at?: string | null
          current_state?: never
          idx_scan?: number | null
          index_size_bytes?: number | null
          index_size_pretty?: never
          index_type?: string | null
          indexname?: string | null
          is_primary?: boolean | null
          is_unique?: boolean | null
          recommendation?: string | null
          schemaname?: string | null
          tablename?: string | null
        }
        Relationships: []
      }
      v_vps_go_live_checklist: {
        Row: {
          category: string | null
          diagnostic_severity: string | null
          etapa_id: number | null
          etapa_title: string | null
          fix_action: string | null
          id: string | null
          last_diagnostic_at: string | null
          linked_table: string | null
          notes: string | null
          passed: boolean | null
          risk_score: number | null
          severity: string | null
          status: string | null
          title: string | null
          updated_at: string | null
          updated_by: string | null
          verdict: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vps_scenarios_etapa_id_fkey"
            columns: ["etapa_id"]
            isOneToOne: false
            referencedRelation: "mv_vps_risk_dashboard"
            referencedColumns: ["etapa_id"]
          },
          {
            foreignKeyName: "vps_scenarios_etapa_id_fkey"
            columns: ["etapa_id"]
            isOneToOne: false
            referencedRelation: "vps_etapas"
            referencedColumns: ["id"]
          },
        ]
      }
      v_vps_live_status: {
        Row: {
          category: string | null
          comment_count: number | null
          diagnostic_severity: string | null
          etapa_id: number | null
          etapa_title: string | null
          fix_action: string | null
          id: string | null
          impact: number | null
          is_blocker: boolean | null
          last_diagnostic_at: string | null
          linked_table: string | null
          probability: number | null
          risk_score: number | null
          severity: string | null
          status: string | null
          status_notes: string | null
          status_updated_at: string | null
          title: string | null
          updated_by: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vps_scenarios_etapa_id_fkey"
            columns: ["etapa_id"]
            isOneToOne: false
            referencedRelation: "mv_vps_risk_dashboard"
            referencedColumns: ["etapa_id"]
          },
          {
            foreignKeyName: "vps_scenarios_etapa_id_fkey"
            columns: ["etapa_id"]
            isOneToOne: false
            referencedRelation: "vps_etapas"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      add_to_contact_id_graveyard: {
        Args: { p_contact_id: string; p_reason: string; p_remote_jid: string }
        Returns: undefined
      }
      cleanup_expired_contact_ids: {
        Args: never
        Returns: {
          deleted_count: number
        }[]
      }
      fn_audit_rmq_durability_risk: {
        Args: { p_window?: string }
        Returns: Json
      }
      fn_auto_create_next_partitions: { Args: never; Returns: string[] }
      fn_blockers_auto_detect: { Args: never; Returns: Json }
      fn_bootstrap_wpp2_instance: {
        Args: { p_instance_id: string; p_trigger?: string }
        Returns: Json
      }
      fn_burnin_critical_alert_check: { Args: never; Returns: Json }
      fn_burnin_disconnection_check: { Args: never; Returns: Json }
      fn_burnin_monitor: { Args: never; Returns: Json }
      fn_cache_warmup_after_vacuum: { Args: never; Returns: Json }
      fn_check_guardian_alive: { Args: never; Returns: undefined }
      fn_cleanup_evolution_guardian_events: {
        Args: { p_days_to_keep?: number }
        Returns: Json
      }
      fn_cleanup_test_artifacts: {
        Args: { p_confirm?: boolean; p_max_age_hours?: number }
        Returns: Json
      }
      fn_create_monthly_partition: {
        Args: {
          p_base_table: string
          p_month: number
          p_schema: string
          p_year: number
        }
        Returns: string
      }
      fn_detect_401_bursts: { Args: never; Returns: Json }
      fn_detect_ack_loss_gap: {
        Args: { p_dlq_threshold?: number; p_window?: string }
        Returns: Json
      }
      fn_detect_dedup_cap_failures: {
        Args: { p_window?: string }
        Returns: Json
      }
      fn_detect_external_401_bursts: { Args: never; Returns: Json }
      fn_detect_spurious_closes: {
        Args: { p_reconnect_window?: string; p_window?: string }
        Returns: Json
      }
      fn_detect_swarm_task_duplication: { Args: never; Returns: Json }
      fn_ensure_evolution_backcompat_views: { Args: never; Returns: number }
      fn_ensure_monthly_partitions: {
        Args: {
          p_base_table?: string
          p_months_ahead?: number
          p_schema?: string
        }
        Returns: {
          acao: string
          partitao: string
        }[]
      }
      fn_flag_poison_messages: { Args: never; Returns: Json }
      fn_get_401_glitchtip_payload: {
        Args: { p_minutes?: number }
        Returns: Json
      }
      fn_get_incident_runbook: { Args: { p_type?: string }; Returns: Json }
      fn_link_orphan_messages: { Args: { p_limit?: number }; Returns: Json }
      fn_log_api_401:
        | {
            Args: { p_endpoint?: string; p_ip: string; p_ua?: string }
            Returns: undefined
          }
        | {
            Args: {
              p_endpoint?: string
              p_ip: string
              p_status?: number
              p_ua?: string
            }
            Returns: undefined
          }
      fn_logpatch_verify: {
        Args: never
        Returns: {
          detail: string
          patch: string
          status: string
        }[]
      }
      fn_migrate_all_message_tables: {
        Args: { p_batch_size?: number; p_max_batches?: number }
        Returns: {
          batches_ran: number
          instance_name: string
          source_table: string
          status: string
          total_migrated: number
        }[]
      }
      fn_monitor_lid_contamination: { Args: never; Returns: Json }
      fn_monitor_pino_timeouts: { Args: never; Returns: Json }
      fn_monthly_evo_audit: { Args: never; Returns: Json }
      fn_peak_hours_sla_check: { Args: { p_window?: string }; Returns: Json }
      fn_pipeline_health_probe: { Args: never; Returns: Json }
      fn_purge_ip_watch: { Args: never; Returns: number }
      fn_record_runbook_drill: { Args: { p_type: string }; Returns: Json }
      fn_resolve_alert: {
        Args: { p_by?: string; p_id?: string; p_ids?: string[] }
        Returns: {
          alert_type: string
          id: string
          resolved_at: string
          resolved_by: string
          severity: string
        }[]
      }
      fn_scrub_r2_paths_from_logs: {
        Args: { p_window?: string }
        Returns: Json
      }
      fn_scrub_r2_text: { Args: { p_input: string }; Returns: string }
      fn_sync_guardian_heartbeat: {
        Args: { p_pg_password?: string }
        Returns: Json
      }
      fn_sync_messages_to_v2: { Args: never; Returns: Json }
      fn_update_instance_health: { Args: never; Returns: undefined }
      fn_uuid_safe: { Args: { t: string }; Returns: string }
      fn_v2_mirror_health: { Args: never; Returns: Json }
      fn_v2_pipeline_heartbeat: { Args: never; Returns: Json }
      fn_vps_category_breakdown: {
        Args: never
        Returns: {
          avg_risk: number
          blocker_count: number
          category: string
          coverage_pct: number
          done_count: number
          total: number
          total_risk: number
        }[]
      }
      fn_vps_dashboard_summary: { Args: never; Returns: Json }
      fn_vps_go_live_check: { Args: never; Returns: Json }
      fn_vps_health_score: { Args: never; Returns: number }
      fn_vps_next_priority: {
        Args: never
        Returns: {
          category: string
          current_status: string
          etapa_id: number
          etapa_title: string
          fix_action: string
          impact: number
          linked_table: string
          probability: number
          risk_score: number
          scenario_id: string
          title: string
        }[]
      }
      fn_vps_refresh_dashboard: { Args: never; Returns: string }
      fn_vps_risk_report: {
        Args: never
        Returns: {
          avg_risk: number
          blocker_open: number
          coverage_pct: number
          doing_count: number
          done_count: number
          done_risk: number
          etapa_id: number
          etapa_title: string
          max_risk: number
          severity: string
          todo_count: number
          total_risk: number
          total_scenarios: number
        }[]
      }
      get_snapshot_version: { Args: never; Returns: number }
      is_contact_id_available: {
        Args: { p_contact_id: string }
        Returns: boolean
      }
      validate_snapshot_freshness: {
        Args: { p_max_age_seconds?: number }
        Returns: boolean
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
  evo: {
    Enums: {},
  },
} as const
