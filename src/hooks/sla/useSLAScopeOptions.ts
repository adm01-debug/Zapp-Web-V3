import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { SLARuleScope } from '@/features/sla';

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
          const unique = [...new Set((data ?? []).map((r) => r.company as string))].sort();
          setCompanies(unique);
        });
    }

    if (scope === 'job_title') {
      void supabase
        .from('contacts')
        .select('job_title')
        .not('job_title', 'is', null)
        .then(({ data }) => {
          const unique = [...new Set((data ?? []).map((r) => r.job_title as string))].sort();
          setJobTitles(unique);
        });
    }

    if (scope === 'queue') {
      void supabase
        .from('queues')
        .select('id, name')
        .order('name')
        .then(({ data }) => {
          setQueues((data ?? []) as QueueOption[]);
        });
    }

    if (scope === 'agent') {
      void supabase
        .from('agents')
        .select('id, name')
        .order('name')
        .then(({ data }) => {
          setAgents((data ?? []) as AgentOption[]);
        });
    }
  }, [open, scope]);

  useEffect(() => {
    if (!open || scope !== 'contact') return;
    if (!contactSearch.trim()) {
      setContacts([]);
      return;
    }
    const q = contactSearch.trim();
    void supabase
      .from('contacts')
      .select('id, name, phone')
      .or(`name.ilike.%${q}%,phone.ilike.%${q}%`)
      .limit(20)
      .then(({ data }) => {
        setContacts((data ?? []) as ContactOption[]);
      });
  }, [open, scope, contactSearch]);

  return { companies, jobTitles, queues, agents, contacts };
}
