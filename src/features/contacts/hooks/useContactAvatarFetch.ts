/**
 * useContactAvatarFetch.ts — Auto-fetch WhatsApp profile picture and save to EXTERNAL CRM
 *
 * FIXED: Now saves avatar_url to the EXTERNAL contacts table via contactsDB bridge,
 * not to the Lovable Cloud DB.
 *
 * Flow:
 * 1. Calls Edge Function `fetch-whatsapp-avatar` (runs on Lovable Cloud)
 * 2. Edge Function calls Evolution API to get profile pic URL
 * 3. Saves the URL to the EXTERNAL CRM contacts table
 */
import { useState, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { contactsDB } from '@/lib/contactsDB';
import { isExternalConfigured } from '@/integrations/supabase/externalClient';
import { getLogger } from '@/lib/logger';

const log = getLogger('useContactAvatarFetch');

interface AvatarFetchResult {
  avatarUrl: string | null;
  isFetching: boolean;
  error: string | null;
  fetchAvatar: () => Promise<string | null>;
}

export function useContactAvatarFetch(
  contactId: string | undefined,
  phone: string | undefined,
  currentAvatarUrl: string | null | undefined
): AvatarFetchResult {
  const [avatarUrl, setAvatarUrl] = useState<string | null>(currentAvatarUrl ?? null);
  const [isFetching, setIsFetching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cacheRef = useRef<Map<string, { url: string; ts: number }>>(new Map());

  const fetchAvatar = useCallback(async (): Promise<string | null> => {
    if (!contactId || !phone || !isExternalConfigured) return null;

    const cleaned = phone.replace(/\D/g, '');
    if (cleaned.length < 10) return null;

    // Check cache (30 min TTL)
    const cached = cacheRef.current.get(cleaned);
    if (cached && Date.now() - cached.ts < 30 * 60 * 1000) {
      setAvatarUrl(cached.url);
      return cached.url;
    }

    setIsFetching(true);
    setError(null);

    try {
      // Call Edge Function on Lovable Cloud (it has Evolution API access)
      const { data, error: fnError } = await supabase.functions.invoke('fetch-whatsapp-avatar', {
        body: { phone: cleaned },
      });

      if (fnError) throw fnError;

      const url = data?.avatar_url;
      if (url) {
        setAvatarUrl(url);
        cacheRef.current.set(cleaned, { url, ts: Date.now() });

        // Save to EXTERNAL CRM database (not Lovable Cloud)
        try {
          await contactsDB.updateAvatar(contactId, url);
        } catch (saveErr) {
          log.warn('Failed to save avatar to CRM DB', saveErr);
          // Don't throw — avatar was still fetched successfully
        }
      }

      return url ?? null;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro ao buscar avatar';
      setError(msg);
      return null;
    } finally {
      setIsFetching(false);
    }
  }, [contactId, phone]);

  return { avatarUrl, isFetching, error, fetchAvatar };
}
