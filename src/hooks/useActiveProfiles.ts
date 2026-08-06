import { supabase } from '@/integrations/supabase/client';
import { MODULE_TTL_MS } from '@/lib/queryStaleTimes';

export interface Profile {
  id: string;
  name: string | null;
  avatar_url: string | null;
  is_active: boolean | null;
}

// ── Cache module-level (TTL 5min) ─────────────────────────────────────────
// Lista de perfis ativos é catálogo quase-estático (muda via admin). O cache
// evita refetch a cada mount/foco (ex.: AddMemberDialog aberto repetidamente).
const TTL_MS = MODULE_TTL_MS.catalog;
let cache: { data: Profile[]; fetchedAt: number } | null = null;
let inflight: Promise<Profile[]> | null = null;

export async function fetchActiveProfiles(): Promise<Profile[]> {
  if (cache && Date.now() - cache.fetchedAt < TTL_MS) return cache.data;
  if (inflight) return inflight;

  inflight = (async () => {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, name, avatar_url, is_active')
      .eq('is_active', true)
      .order('name');
    if (error) throw error;
    const profiles = (data ?? []) as Profile[];
    cache = { data: profiles, fetchedAt: Date.now() };
    return profiles;
  })();

  try {
    return await inflight;
  } finally {
    inflight = null;
  }
}
