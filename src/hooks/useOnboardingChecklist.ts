// @ts-nocheck
import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/features/auth';
import { supabase } from '@/integrations/supabase/client';
import { safeWhatsAppConnectionsQuery } from '@/integrations/supabase/safe-queries';
import { log } from '@/lib/logger';

export interface ChecklistStatus {
  profile: boolean;
  connection: boolean;
  hours: boolean;
  templates: boolean;
  notifications: boolean;
  theme: boolean;
}

const DEFAULT_STATUS: ChecklistStatus = {
  profile: false,
  connection: false,
  hours: false,
  templates: false,
  notifications: false,
  theme: false,
};

export function useOnboardingChecklist({ enabled = true }: { enabled?: boolean } = {}) {
  const { user } = useAuth();
  const [status, setStatus] = useState<ChecklistStatus>(DEFAULT_STATUS);
  const [isLoading, setIsLoading] = useState(true);
  const [isDismissed, setIsDismissed] = useState(false);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const checkStatus = useCallback(async () => {
    if (!user) return;

    setIsLoading(true);
    const newStatus: ChecklistStatus = { ...DEFAULT_STATUS };

    try {
      // Check profile
      const { data: profile } = await supabase
        .from('profiles')
        .select('name, avatar_url')
        .eq('user_id', user.id)
        .maybeSingle();
      newStatus.profile = !!(profile?.name && profile.name.length > 2);

      // Check WhatsApp connection
      try {
        const safeQueries = safeWhatsAppConnectionsQuery(supabase);
        const { data: connections } = await safeQueries.getList({ status: 'connected' });
        newStatus.connection = (connections?.length || 0) > 0;
      } catch {
        newStatus.connection = false;
      }

      // Check user settings
      const { data: settings } = await supabase
        .from('user_settings')
        .select('business_hours_enabled, browser_notifications_enabled, sound_enabled, theme')
        .eq('user_id', user.id)
        .maybeSingle();

      if (settings) {
        newStatus.hours = settings.business_hours_enabled === true;
        newStatus.notifications =
          settings.browser_notifications_enabled === true || settings.sound_enabled === true;
        newStatus.theme = settings.theme !== null && settings.theme !== 'system';
      }

      // Check templates
      const { data: templates } = await supabase
        .from('message_templates')
        .select('id')
        .eq('user_id', user.id)
        .limit(1);
      newStatus.templates = (templates?.length || 0) > 0;

      if (mountedRef.current) setStatus(newStatus);
    } catch (error) {
      log.error('Error checking checklist status:', error);
    } finally {
      if (mountedRef.current) setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    // Skip all DB queries when not enabled (e.g. not on dashboard view)
    if (!enabled || !user) {
      setIsLoading(false);
      return;
    }

    let dismissed = false;
    try {
      dismissed = localStorage.getItem(`checklist_dismissed_${user.id}`) === 'true';
    } catch {
      /* storage unavailable */
    }
    setIsDismissed(dismissed);

    // Don't run queries if already dismissed
    if (dismissed) {
      setIsLoading(false);
      return;
    }

    void checkStatus();
  }, [user, enabled, checkStatus]);

  const dismiss = useCallback(() => {
    if (user) {
      try {
        localStorage.setItem(`checklist_dismissed_${user.id}`, 'true');
      } catch {
        /* storage unavailable */
      }
      setIsDismissed(true);
    }
  }, [user]);

  const reset = useCallback(() => {
    if (user) {
      try {
        localStorage.removeItem(`checklist_dismissed_${user.id}`);
      } catch {
        /* storage unavailable */
      }
      setIsDismissed(false);
    }
  }, [user]);

  const completedCount = Object.values(status).filter(Boolean).length;
  const totalCount = Object.keys(status).length;
  const progress = (completedCount / totalCount) * 100;
  const isComplete = completedCount === totalCount;

  return {
    status,
    isLoading,
    isDismissed,
    completedCount,
    totalCount,
    progress,
    isComplete,
    checkStatus,
    dismiss,
    reset,
  };
}
