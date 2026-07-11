import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/features/auth';
import { log } from '@/lib/logger';

const ONBOARDING_KEY = 'onboarding_completed';

export function useOnboarding() {
  const { user } = useAuth();
  const [hasCompletedOnboarding, setHasCompletedOnboarding] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    // Check localStorage first for quick response
    let localCompleted: string | null = null;
    try {
      localCompleted = localStorage.getItem(`${ONBOARDING_KEY}_${user.id}`);
    } catch {
      /* storage unavailable */
    }
    if (localCompleted === 'true') {
      setHasCompletedOnboarding(true);
      setLoading(false);
      return;
    }

    // Check user_settings in database
    const checkOnboarding = async () => {
      try {
        const { data } = await supabase
          .from('user_settings')
          .select('onboarding_completed')
          .eq('user_id', user.id)
          .maybeSingle();

        // If user has settings, they've been here before
        if (data && data.onboarding_completed) {
          setHasCompletedOnboarding(true);
          try {
            localStorage.setItem(`${ONBOARDING_KEY}_${user.id}`, 'true');
          } catch {
            /* storage unavailable */
          }
        } else {
          setHasCompletedOnboarding(false);
        }
      } catch (error) {
        log.error('Error checking onboarding status:', error);
        setHasCompletedOnboarding(true); // Default to completed on error
      } finally {
        setLoading(false);
      }
    };

    checkOnboarding();
  }, [user]);

  const completeOnboarding = async () => {
    if (user) {
      try {
        await supabase
          .from('user_settings')
          .update({ onboarding_completed: true })
          .eq('user_id', user.id);

        localStorage.setItem(`${ONBOARDING_KEY}_${user.id}`, 'true');
      } catch {
        /* ignore storage error */
      }
      setHasCompletedOnboarding(true);
    }
  };

  const resetOnboarding = async () => {
    if (user) {
      try {
        await supabase
          .from('user_settings')
          .update({ onboarding_completed: false })
          .eq('user_id', user.id);

        localStorage.removeItem(`${ONBOARDING_KEY}_${user.id}`);
      } catch {
        /* ignore storage error */
      }
      setHasCompletedOnboarding(false);
    }
  };

  return {
    hasCompletedOnboarding,
    loading,
    completeOnboarding,
    resetOnboarding,
  };
}
