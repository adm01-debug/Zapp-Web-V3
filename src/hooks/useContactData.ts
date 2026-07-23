import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { log } from '@/lib/logger';
import type { ContactRow } from '@/integrations/supabase/schema';

interface UseContactDataResult {
  contact: ContactRow | null;
  loading: boolean;
  error: Error | null;
}

/** Fetches contact data by ID with loading and error handling. */
export function useContactData(contactId: string | undefined): UseContactDataResult {
  const { data: contact = null, isLoading: loading, error: queryError } = useQuery({
    queryKey: ['contact', contactId],
    queryFn: async () => {
      try {
        const { data, error: fetchError } = await supabase
          .from('contacts')
          .select('*')
          .eq('id', contactId!)
          .maybeSingle();
        if (fetchError) throw new Error(fetchError.message);
        return data as ContactRow | null;
      } catch (err) {
        const e = err instanceof Error ? err : new Error(String(err));
        log.error('Failed to fetch contact:', e);
        throw e;
      }
    },
    enabled: !!contactId,
    staleTime: 30_000,
  });

  return {
    contact,
    loading,
    error: queryError instanceof Error ? queryError : queryError ? new Error(String(queryError)) : null,
  };
}
