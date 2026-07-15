// @ts-nocheck
/**
 * Settings Repository
 *
 * Data access layer for user and workspace settings.
 * Direct Supabase access only - no business logic.
 */

import { supabase } from '@/integrations/supabase/client';
import type { QueryParams } from '@/services/api/types';

export interface UserSettings {
  id: string;
  user_id: string;
  theme: 'light' | 'dark' | 'auto';
  language: string;
  notifications_enabled: boolean;
  email_notifications: boolean;
  desktop_notifications: boolean;
  timezone?: string;
  preferences?: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface WorkspaceSettings {
  id: string;
  workspace_id: string;
  name: string;
  description?: string;
  logo_url?: string;
  default_queue?: string;
  working_hours_start?: string;
  working_hours_end?: string;
  timezone?: string;
  settings?: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export const settingsRepository = {
  // User Settings
  async getUserSettings(userId: string): Promise<UserSettings | null> {
    const { data, error } = await supabase
      .from('user_settings')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle() // ✅ fix: maybeSingle evita PGRST116;

    if (error) return null;
    return data;
  },

  async updateUserSettings(userId: string, updates: Partial<UserSettings>) {
    const { data, error } = await supabase
      .from('user_settings')
      .update(updates)
      .eq('user_id', userId)
      .select()
      .maybeSingle() // ✅ fix: maybeSingle evita PGRST116;

    return { data, error };
  },

  async upsertUserSettings(userId: string, settings: Partial<UserSettings>) {
    const { data, error } = await supabase
      .from('user_settings')
      .upsert({
        user_id: userId,
        ...settings,
      })
      .select()
      .maybeSingle() // ✅ fix: maybeSingle evita PGRST116;

    return { data, error };
  },

  // Workspace Settings
  async getWorkspaceSettings(workspaceId: string): Promise<WorkspaceSettings | null> {
    const { data, error } = await supabase
      .from('workspace_settings')
      .select('*')
      .eq('workspace_id', workspaceId)
      .maybeSingle() // ✅ fix: maybeSingle evita PGRST116;

    if (error) return null;
    return data;
  },

  async updateWorkspaceSettings(workspaceId: string, updates: Partial<WorkspaceSettings>) {
    const { data, error } = await supabase
      .from('workspace_settings')
      .update(updates)
      .eq('workspace_id', workspaceId)
      .select()
      .maybeSingle() // ✅ fix: maybeSingle evita PGRST116;

    return { data, error };
  },

  async upsertWorkspaceSettings(workspaceId: string, settings: Partial<WorkspaceSettings>) {
    const { data, error } = await supabase
      .from('workspace_settings')
      .upsert({
        workspace_id: workspaceId,
        ...settings,
      })
      .select()
      .maybeSingle() // ✅ fix: maybeSingle evita PGRST116;

    return { data, error };
  },

  // Realtime subscriptions
  subscribeToUserSettings: (userId: string, callback: (settings: UserSettings) => void) => {
    return supabase
      .channel(`user_settings:${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'zapp',
          table: 'user_settings',
          filter: `user_id=eq.${userId}`,
        },
        (payload: any) => callback(payload.new || payload.old)
      )
      .subscribe();
  },

  subscribeToWorkspaceSettings: (workspaceId: string, callback: (settings: WorkspaceSettings) => void) => {
    return supabase
      .channel(`workspace_settings:${workspaceId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'zapp',
          table: 'workspace_settings',
          filter: `workspace_id=eq.${workspaceId}`,
        },
        (payload: any) => callback(payload.new || payload.old)
      )
      .subscribe();
  },
};