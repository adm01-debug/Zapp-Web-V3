import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { getLogger } from '@/lib/logger';
import type { SLARuleScope } from '@/features/sla/hooks/useSLARules';

const log = getLogger('useSLAScopeOptions');

type ContactRow = { id: string; name: string | null; phone: string | null };

interface QueueOption {
  id: string;
  name: string;
}

interface AgentOption {
  id: string;
  name: string;
}

interface ContactOption {
  id: string;
  name: string;
  phone: string;
}

interface SLAScopeOptions {
  companies: string[];
  jobTitles: string[];
  queues: QueueOption[];
  agents: AgentOption[];
  contacts: ContactOption[];
}

/** Hook: use SLAScope Options. */
export function useSLAScopeOptions(
  open: boolean,
  scope: SLARuleScope,
  contactSearch: string
): SLAScopeOptions {
  const [companies, setCompanies] = useState<string[]>([]);
  const [jobTitles, setJobTitles] = useState<string[]>([]);
  const [queues, setQueues] = useState<QueueOption[]>([]);
  const [agents, setAgents] = useState<AgentOption[]>([]);
  const [contacts, setContacts] = useState<ContactOption[]>([]);

  useEffect(() => {
    if (!open) return;

    if (scope === 'company') {
      void supabase
        .from('contacts')
        .select('company')
        .not('company', 'is', null)
        .then(({ data, error }) => {
          if (error) {
            log.warn('Failed to load company options:', error);
            return;
          }
          const rows = (data ?? []) as Array<{ company: string | null }>;
          const unique = [
            ...new Set(rows.map((r) => r.company).filter((v): v is string => !!v)),
          ].sort();
          setCompanies(unique);
        })
        .then(undefined, (err: unknown) => {
          log.warn('Failed to load company options (rejeição):', err);
        });
    }

    if (scope === 'job_title') {
      void supabase
        .from('contacts')
        .select('job_title')
        .not('job_title', 'is', null)
        .then(({ data, error }) => {
          if (error) {
            log.warn('Failed to load job_title options:', error);
            return;
          }
          const rows = (data ?? []) as Array<{ job_title: string | null }>;
          const unique = [
            ...new Set(rows.map((r) => r.job_title).filter((v): v is string => !!v)),
          ].sort();
          setJobTitles(unique);
        })
        .then(undefined, (err: unknown) => {
          log.warn('Failed to load job_title options (rejeição):', err);
        });
    }

    if (scope === 'queue') {
      void supabase
        .from('queues')
        .select('id, name')
        .order('name')
        .then(({ data, error }) => {
          if (error) {
            log.warn('Failed to load queue options:', error);
            return;
          }
          setQueues((data ?? []) as unknown as QueueOption[]); // ignore-audit — Supabase queues row has no index signature for direct widening to QueueOption
        })
        .then(undefined, (err: unknown) => {
          log.warn('Failed to load queue options (rejeição):', err);
        });
    }

    if (scope === 'agent') {
      void supabase
        .from('profiles')
        .select('id, name')
        .order('name')
        .then(({ data, error }) => {
          if (error) {
            log.warn('Failed to load agent options:', error);
            return;
          }
          setAgents((data ?? []) as unknown as AgentOption[]); // ignore-audit — Supabase profiles row has no index signature for direct widening to AgentOption
        })
        .then(undefined, (err: unknown) => {
          log.warn('Failed to load agent options (rejeição):', err);
        });
    }
  }, [open, scope]);

  useEffect(() => {
    if (!open || scope !== 'contact') return;
    if (!contactSearch.trim()) {
      setContacts([]);
      return;
    }
    const term = `%${contactSearch.trim()}%`;
    void Promise.all([
      supabase
        .from('contacts')
        .select('id, name, phone')
        .ilike('name', term)
        .order('name')
        .limit(20),
      supabase
        .from('contacts')
        .select('id, name, phone')
        .ilike('phone', term)
        .order('name')
        .limit(20),
    ]).then(([nameRes, phoneRes]) => {
      const seen = new Set<string>();
      const combined = [
        ...((nameRes.data ?? []) as unknown as ContactRow[]), // ignore-audit — Supabase contacts row has no index signature for direct widening to ContactRow
        ...((phoneRes.data ?? []) as unknown as ContactRow[]), // ignore-audit — Supabase contacts row has no index signature for direct widening to ContactRow
      ];
      const merged = combined.filter(({ id }) => {
        if (seen.has(id)) return false;
        seen.add(id);
        return true;
      });
      merged.sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''));
      setContacts(
        merged.slice(0, 20).map((r) => ({ id: r.id, name: r.name ?? '', phone: r.phone ?? '' }))
      );
    }).then(undefined, (err: unknown) => {
      log.warn('Failed to search contact options (rejeição):', err);
    });
  }, [open, scope, contactSearch]);

  return { companies, jobTitles, queues, agents, contacts };
}
