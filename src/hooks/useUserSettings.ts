import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export type { UserSettings } from '@/hooks/userSettingsSchema';

export function useUserSettings(userId?: string) {
  return useUserSettingsManagement(userId);
}
