import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { SLARuleScope } from '@/features/sla';

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
        .then(({ data }) => {
          const rows = (data ?? []) as Array<{ company: string | null }>;
          const unique = [...new Set(rows.map((r) => r.company).filter((v): v is string => !!v))].sort();
          setCompanies(unique);
        });
    }

    if (scope === 'job_title') {
      void supabase
        .from('contacts')
        .select('job_title')
        .not('job_title', 'is', null)
        .then(({ data }) => {
          const rows = (data ?? []) as Array<{ job_title: string | null }>;
          const unique = [...new Set(rows.map((r) => r.job_title).filter((v): v is string => !!v))].sort();
          setJobTitles(unique);
        });
    }

    if (scope === 'queue') {
      void supabase
        .from('queues')
        .select('id, name')
        .order('name')
        .then(({ data }) => {
          setQueues(((data ?? []) as unknown as QueueOption[]));
        });
    }

    if (scope === 'agent') {
      void supabase
        .from('profiles')
        .select('id, name')
        .order('name')
        .then(({ data }) => {
          setAgents(((data ?? []) as unknown as AgentOption[]));
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
        ...((nameRes.data ?? []) as unknown as ContactRow[]),
        ...((phoneRes.data ?? []) as unknown as ContactRow[]),
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
    });
  }, [open, scope, contactSearch]);

  return { companies, jobTitles, queues, agents, contacts };
}