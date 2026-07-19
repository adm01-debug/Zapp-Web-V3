import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { getLogger } from '@/lib/logger';

const log = getLogger('useOnboardingChecklist');
const dismissedKey = (userId: string | undefined) =>
  userId ? `onboarding_dismissed_${userId}` : 'onboarding_dismissed';

interface OnboardingStatus {
  profile: boolean;
  whatsapp: boolean;
  settings: boolean;
  templates: boolean;
  [key: string]: boolean;
}

/** Hook: use Onboarding Checklist. */
export function useOnboardingChecklist() {
  const { user } = useAuth();
  const [status, setStatus] = useState<OnboardingStatus>({
    profile: false,
    whatsapp: false,
    settings: false,
    templates: false,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isDismissed, setIsDismissed] = useState(false);

  useEffect(() => {
    try {
      setIsDismissed(localStorage.getItem(dismissedKey(user?.id)) === 'true');
    } catch {
      // ignore
    }
  }, [user?.id]);

  const checkStatus = useCallback(async () => {
    if (!user) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const [profileRes, whatsappRes, settingsRes, templatesRes] = await Promise.all([
        supabase
          .from('profiles')
          .select('name, avatar_url')
          .eq('user_id', user.id)
          .maybeSingle(),
        supabase
          .from('whatsapp_connections')
          .select('id')
          .eq('created_by', user.id)
          .limit(1),
        supabase
          .from('user_settings')
          .select('id')
          .eq('user_id', user.id)
          .maybeSingle(),
        supabase
          .from('message_templates')
          .select('id')
          .eq('created_by', user.id)
          .limit(1),
      ]);

      setStatus({
        profile: !!(profileRes.data?.name && profileRes.data.name.length > 2),
        whatsapp: (whatsappRes.data?.length ?? 0) > 0,
        settings: !!settingsRes.data,
        templates: (templatesRes.data?.length ?? 0) > 0,
      });
    } catch (err) {
      log.error('Error checking onboarding status:', err);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    checkStatus();
  }, [checkStatus]);

  const dismiss = useCallback(() => {
    try {
      localStorage.setItem(dismissedKey(user?.id), 'true');
    } catch {
      // ignore
    }
    setIsDismissed(true);
  }, [user?.id]);

  const completedCount = Object.values(status).filter(Boolean).length;
  const totalCount = Object.keys(status).length;
  const progress = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  return { status, isLoading, isDismissed, dismiss, checkStatus, progress };
}
