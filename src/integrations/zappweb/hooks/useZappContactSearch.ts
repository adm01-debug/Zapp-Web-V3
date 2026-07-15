import { useState, useCallback } from 'react';
import { zappSupabase } from '../supabaseClient';
import type { EvolutionContact } from '../types';

/**
 * Busca contatos por nome / telefone no schema Zap Webb.
 */
export function useZappContactSearch() {
  const [results, setResults] = useState<EvolutionContact[]>([]);
  const [loading, setLoading] = useState(false);

  const search = useCallback(async (term: string) => {
    if (!term.trim()) {
      setResults([]);
      return;
    }
    setLoading(true);
    const safe = term.replace(/[%_]/g, '');
    const { data } = await zappSupabase
      .schema('evo')
      .from('evolution_contacts')
      .select(
        `id, push_name, full_name, first_name, last_name, phone_number, email,
         company, lead_status, lead_score, tags, profile_picture_url`,
      )
      .or(
        `push_name.ilike.%${safe}%,full_name.ilike.%${safe}%,phone_number.ilike.%${safe}%`,
      )
      .limit(20);
    setResults((data ?? []) as EvolutionContact[]);
    setLoading(false);
  }, []);

  return { results, loading, search };
}
