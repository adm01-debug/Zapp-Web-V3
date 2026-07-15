// @ts-nocheck
import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { safeClient } from '@/integrations/supabase/safeClient';
import { useEvolutionApi } from '@/hooks/useEvolutionApi';
import { getLogger } from '@/lib/logger';
import { normalizePhone, isSamePhone } from '@/lib/phoneUtils';

const log = getLogger('useEvolutionAutoSync');

/** Auto-syncs Evolution API instances into Supabase connections with deduplication. */
export function useEvolutionAutoSync(onSynced?: () => void) {
  const ran = useRef(false);
  const { listInstances } = useEvolutionApi();

  const syncAll = async () => {
    try {
      // 1. Get existing connections from Supabase
      const { data: existing, error } = await supabase
        .from('whatsapp_connections')
        .select('instance_id, phone_number');
      if (error) throw error;
      const knownIds = new Set((existing ?? []).map((c) => c.instance_id));
      const knownPhones = (existing ?? [])
        .map((c) => normalizePhone(c.phone_number ?? ''))
        .filter(Boolean);

      // 2. List all Evolution instances
      const evoResult = await listInstances();
      const instances: unknown[] = Array.isArray(evoResult)
        ? evoResult
        : ((evoResult as { data?: unknown[]; instances?: unknown[] })?.data ??
          (evoResult as { data?: unknown[]; instances?: unknown[] })?.instances ??
          []);

      if (!instances.length) return;

      // 3. Find instances NOT in Supabase (by instance_id AND phone number)
      const missing = instances.filter((inst) => {
        const i = inst as {
          instance?: { instanceName?: string; number?: string; ownerJid?: string };
        };
        if (!i?.instance?.instanceName) return false;
        if (knownIds.has(i.instance.instanceName)) return false;

        // Also skip if phone number already exists in another connection
        const phone =
          i.instance?.number || i.instance?.ownerJid?.replace('@s.whatsapp.net', '') || '';
        if (phone && knownPhones.some((kp) => isSamePhone(kp, phone))) {
          return false;
        }
        return true;
      });

      if (!missing.length) return;

      // 4. Insert missing instances
      for (const inst of missing) {
        const i = inst as {
          instance?: {
            instanceName?: string;
            profileName?: string;
            number?: string;
            ownerJid?: string;
            status?: string;
          };
        };
        const instanceName = i.instance?.instanceName ?? '';
        const name = i.instance?.profileName || instanceName || 'Auto-synced';
        const phone =
          i.instance?.number || i.instance?.ownerJid?.replace('@s.whatsapp.net', '') || '';
        const status = i.instance?.status === 'open' ? 'connected' : 'disconnected';

        const { error: insertError } = await safeClient.from('whatsapp_connections', (q) =>
          q.insert({
            name,
            phone_number: phone,
            instance_id: instanceName,
            instance_name: instanceName,
            status,
            is_default: false,
            api_type: 'evolution',
          })
        );

        if (insertError) {
          log.warn(`Failed to sync ${instanceName}`, { error: insertError.message });
        }
      }

      // 5. Refresh connections list
      onSynced?.();
    } catch (err) {
      log.warn('Auto-sync failed', { error: err instanceof Error ? err.message : String(err) });
    }
  };

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    void syncAll();
  }, []); // intentionally empty — runs once on mount

  return { syncAll };
}
