import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { log } from '@/lib/logger';
import type { Tables } from '@/integrations/supabase/schema';

type ContactRow = Tables<'contacts'>;

interface UseContactDataResult {
  contact: ContactRow | null;
  loading: boolean;
  error: Error | null;
}

/** Fetches contact data by ID with loading and error handling. */
export function useContactData(contactId: string | undefined): UseContactDataResult {
  const [contact, setContact] = useState<ContactRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!contactId) {
      setContact(null);
      setLoading(false);
      return;
    }

    let cancelled = false;

    const fetchContact = async () => {
      try {
        const { data, error: fetchError } = await supabase
          .from('contacts')
          .select('*')
          .eq('id', contactId)
          .maybeSingle() // ✅ fix: maybeSingle evita PGRST116;

        if (cancelled) return;

        if (fetchError) {
          setError(new Error(fetchError.message));
          setContact(null);
        } else {
          setContact(data);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          const error = err instanceof Error ? err : new Error(String(err));
          log.error('Failed to fetch contact:', error);
          setError(error);
          setContact(null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void fetchContact();

    return () => {
      cancelled = true;
    };
  }, [contactId]);

  return { contact, loading, error };
}