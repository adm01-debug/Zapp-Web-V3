/**
 * useContactsStats.ts + ContactsStatsBar.tsx
 * Real-time stats for the contacts list view header.
 * Shows: total, no consent, duplicates suspect, birthdays today.
 */
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { getLogger } from '@/lib/logger';

import { dbFrom, dbTable } from '@/integrations/datasource/db';

const log = getLogger('useContactsStats');

// ── Hook ───────────────────────────────────────────────────────────────────

export interface ContactsStats {
  total:           number;
  noConsent:       number;
  birthdayToday:   number;
  deletedPending:  number;
}

export function useContactsStats(workspaceId: string) {
  const [stats,   setStats]   = useState<ContactsStats | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    try {
      const today = new Date();
      const mm = String(today.getMonth() + 1).padStart(2, '0');
      const dd = String(today.getDate()).padStart(2, '0');

      const [totalRes, noConsentRes, birthdayRes, deletedRes] = await Promise.all([
        // Total active contacts
        dbFrom('contacts')
          .select('id', { count: 'exact', head: true })
          .eq('workspace_id', workspaceId)
          .is('deleted_at', null),

        // Contacts without LGPD consent
        dbFrom('contacts')
          .select('id', { count: 'exact', head: true })
          .eq('workspace_id', workspaceId)
          .is('deleted_at', null)
          .is('lgpd_consent_at', null),

        // Birthdays today (by month/day)
        dbFrom('contacts')
          .select('id', { count: 'exact', head: true })
          .eq('workspace_id', workspaceId)
          .is('deleted_at', null)
          .not('birth_date', 'is', null)
          .filter('birth_date', 'like', `%-${mm}-${dd}`),

        // Deleted contacts pending purge
        dbFrom('contacts')
          .select('id', { count: 'exact', head: true })
          .eq('workspace_id', workspaceId)
          .not('deleted_at', 'is', null)
          .gte('deleted_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()),
      ]);

      setStats({
        total:          totalRes.count ?? 0,
        noConsent:      noConsentRes.count ?? 0,
        birthdayToday:  birthdayRes.count ?? 0,
        deletedPending: deletedRes.count ?? 0,
      });
    } catch (err) {
      log.error('Failed to load contacts stats', err);
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => { load(); }, [load]);

  // Realtime subscription for live updates
  useEffect(() => {
    const channel = supabase
      .channel(`contacts-stats-${workspaceId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'evo', table: 'evolution_contacts' },
        () => { load(); }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [workspaceId, load]);

  return { stats, loading, refresh: load };
}
