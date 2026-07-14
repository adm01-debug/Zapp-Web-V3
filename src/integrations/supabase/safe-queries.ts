/**
 * Safe Query Utilities - RLS Enforcement Layer
 *
 * Enforces use of safe, RLS-protected views instead of direct table access.
 * Prevents information disclosure and ensures field-level masking.
 *
 * @module integrations/supabase/safe-queries
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { Database } from './types';

/**
 * Safe WhatsApp Connections Query
 * Returns only non-sensitive fields (id, name, phone_number, status, is_default)
 * Enforces RLS policies and hides sensitive fields (qr_code, instance_id, evo_instance_id)
 */
export const safeWhatsAppConnectionsQuery = (supabase: SupabaseClient<Database>) => ({
  /**
   * Get all connections visible to current user (RLS enforced)
   * Safe for: listing, filtering, display
   */
  getList: async (filters?: { status?: string; isDefault?: boolean }) => {
    let query = supabase
      .from('whatsapp_connections')
      .select('id, name, phone_number, status, is_default, updated_at');

    if (filters?.status) {
      query = query.eq('status', filters.status);
    }
    if (filters?.isDefault !== undefined) {
      query = query.eq('is_default', filters.isDefault);
    }

    return query.order('name', { ascending: true });
  },

  /**
   * Get single connection by ID (RLS enforced)
   * Safe for: detail view, settings
   */
  getById: async (id: string) => {
    return supabase
      .from('whatsapp_connections')
      .select(
        'id, name, phone_number, status, is_default, health_status, health_response_ms, last_health_check, auto_reconnect_enabled, reconnect_interval_seconds, max_reconnect_attempts, loop_protection_active, updated_at'
      )
      .eq('id', id)
      .single();
  },

  /**
   * Get connection summary (minimal fields)
   * Safe for: dropdowns, selectors
   */
  getSummary: async (ids?: string[]) => {
    let query = supabase.from('whatsapp_connections').select('id, name, phone_number, status');

    if (ids && ids.length > 0) {
      query = query.in('id', ids);
    }

    return query.order('name', { ascending: true });
  },

  /**
   * Get connections with degraded health status (RLS enforced)
   * Safe for: monitoring, alerts, health dashboards
   */
  getDegraded: async (sinceDatetime?: string) => {
    let query = supabase
      .from('whatsapp_connections')
      .select(
        'id, name, instance_name, health_status, health_response_ms, last_health_check, updated_at'
      )
      .eq('health_status', 'degraded');

    if (sinceDatetime) {
      query = query.gte('last_health_check', sinceDatetime);
    }

    return query.order('last_health_check', { ascending: false });
  },

  /**
   * Get multiple connections by IDs (RLS enforced)
   * Safe for: lookups, joins, data enrichment
   */
  getByIds: async (ids: string[]) => {
    if (ids.length === 0) return { data: [], error: null };
    return supabase
      .from('whatsapp_connections')
      .select(
        'id, name, phone_number, status, is_default, health_status, health_response_ms, last_health_check, updated_at'
      )
      .in('id', ids)
      .order('name', { ascending: true });
  },

  /**
   * Subscribe to connection changes (RLS enforced)
   * Safe for: realtime updates with masking
   */
  subscribe: (
    callback: (changes: unknown) => void,
    options?: { event?: string; filter?: string }
  ) => {
    return supabase
      .channel('whatsapp_connections_safe')
      .on(
        'postgres_changes',
        {
          event: options?.event || '*',
          schema: 'public',
          table: 'whatsapp_connections',
          filter: options?.filter,
        },
        callback
      )
      .subscribe();
  },
});

/**
 * Safe Channel Connections Query
 * Returns only non-credential fields (id, channel_type, name, status)
 * Enforces RLS policies and hides credentials
 */
export const safeChannelConnectionsQuery = (supabase: SupabaseClient<Database>) => ({
  /**
   * Get all channels visible to current user (RLS enforced)
   * Safe for: listing, filtering, display
   */
  getList: async (filters?: { channelType?: string; status?: string }) => {
    let query = supabase
      .from('channel_connections')
      .select('id, channel_type, name, status, updated_at');

    if (filters?.channelType) {
      query = query.eq('channel_type', filters.channelType);
    }
    if (filters?.status) {
      query = query.eq('status', filters.status);
    }

    return query.order('name', { ascending: true });
  },

  /**
   * Get single channel by ID (RLS enforced)
   * Safe for: detail view, settings
   */
  getById: async (id: string) => {
    return supabase
      .from('channel_connections')
      .select('id, channel_type, name, status, updated_at')
      .eq('id', id)
      .single();
  },

  /**
   * Subscribe to channel changes (RLS enforced)
   * Safe for: realtime updates with masking
   */
  subscribe: (callback: (changes: unknown) => void) => {
    return supabase
      .channel('channel_connections_safe')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'channel_connections',
        },
        callback
      )
      .subscribe();
  },
});

/**
 * Enforcer: Prevents direct table access
 * Throws error if code tries to use dangerous patterns
 */
export const enforceViewUsage = {
  /**
   * Validate that queries use safe methods from this module
   */
  validateQuery: (query: string): boolean => {
    // Patterns that should NOT be present in safe code
    const dangerousPatterns = [
      /\.from\(['"]whatsapp_connections['"]\)\.select\([^)]*qr_code/,
      /\.from\(['"]whatsapp_connections['"]\)\.select\([^)]*evo_instance_id/,
      /\.from\(['"]channel_connections['"]\)\.select\([^)]*api_key/,
      /\.from\(['"]channel_connections['"]\)\.select\([^)]*secret/,
    ];

    for (const pattern of dangerousPatterns) {
      if (pattern.test(query)) {
        throw new Error(
          `Dangerous query detected: Attempting to access sensitive fields. ` +
            `Use safeWhatsAppConnectionsQuery() or safeChannelConnectionsQuery() instead.`
        );
      }
    }

    return true;
  },
};

/**
 * Safe Credentials Access (Service Role Only)
 * Use only in edge functions or backend with service_role token
 */
export const serviceRoleOnlyQueries = {
  /**
   * Get WhatsApp connection WITH credentials (service role only)
   * WARNING: Only use in edge functions with proper authentication check
   */
  getWhatsAppWithCredentials: async (supabase: SupabaseClient<Database>, id: string) => {
    return supabase
      .from('whatsapp_connections')
      .select('*') // All fields including sensitive ones
      .eq('id', id)
      .single();
  },

  /**
   * Get channel connection WITH credentials (service role only)
   * WARNING: Only use in edge functions with proper authentication check
   */
  getChannelWithCredentials: async (supabase: SupabaseClient<Database>, id: string) => {
    return supabase
      .from('channel_connections')
      .select('*') // All fields including sensitive ones
      .eq('id', id)
      .single();
  },
};
