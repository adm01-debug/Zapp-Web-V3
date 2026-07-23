import { queryKeys } from '@/services/api/queryKeys';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface ContactSLAParams {
  contactId?: string;
  company?: string | null;
  jobTitle?: string | null;
  contactType?: string | null;
  queueId?: string | null;
  agentId?: string | null;
}

/** S L A Matched Level type alias. */
export type SLAMatchedLevel =
  | 'contact'
  | 'company'
  | 'job_title'
  | 'contact_type'
  | 'queue'
  | 'agent'
  | 'global_default'
  | 'system_default';

/** Applicable S L A interface definition. */
export interface ApplicableSLA {
  firstResponseMinutes: number;
  resolutionMinutes: number;
  ruleName: string;
  ruleId: string | null;
  matchedLevel: SLAMatchedLevel;
}

type ActiveSLARule = {
  id: string;
  name: string;
  first_response_minutes: number;
  resolution_minutes: number;
  contact_id: string | null;
  company: string | null;
  job_title: string | null;
  contact_type: string | null;
  queue_id: string | null;
  agent_id: string | null;
};

type SLAConfig = {
  name: string;
  first_response_minutes: number;
  resolution_minutes: number;
};

const SYSTEM_DEFAULT: ApplicableSLA = {
  firstResponseMinutes: 5,
  resolutionMinutes: 60,
  ruleName: 'Padrão do Sistema',
  ruleId: null,
  matchedLevel: 'system_default',
};

// Shared hook — fetches ALL active SLA rules once; React Query deduplicates
// across every useApplicableSLA caller in the same render tree.
/** use Active S L A Rules function. */
export function useActiveSLARules() {
  return useQuery<ActiveSLARule[]>({
    queryKey: queryKeys.sla.rulesActive(),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sla_rules')
        .select(
          'id, name, first_response_minutes, resolution_minutes, contact_id, company, job_title, contact_type, queue_id, agent_id'
        )
        .eq('is_active', true)
        .order('priority', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 60_000,
  });
}

// Shared hook — fetches the single global-default SLA config once.
/** use S L A Default Config function. */
export function useSLADefaultConfig() {
  return useQuery<SLAConfig | null>({
    queryKey: queryKeys.sla.configurationsDefault(),
    queryFn: async () => {
      const { data } = await supabase
        .from('sla_configurations')
        .select('name, first_response_minutes, resolution_minutes')
        .eq('is_active', true)
        .eq('is_default', true)
        .limit(1);
      return data && data.length > 0 ? data[0] : null;
    },
    staleTime: 60_000,
  });
}

/**
 * Resolves the applicable SLA for a contact using a strict hierarchy.
 * Single-pass: iterates rules once, tracking the best match per level.
 * Hierarchy: contact > company > job_title > contact_type > queue > agent
 */
function resolveHierarchy(rules: ActiveSLARule[], params: ContactSLAParams): ApplicableSLA | null {
  let contactMatch: ApplicableSLA | null = null;
  let companyMatch: ApplicableSLA | null = null;
  let jobTitleMatch: ApplicableSLA | null = null;
  let contactTypeMatch: ApplicableSLA | null = null;
  let queueMatch: ApplicableSLA | null = null;
  let agentMatch: ApplicableSLA | null = null;

  const build = (rule: ActiveSLARule, level: SLAMatchedLevel): ApplicableSLA => ({
    firstResponseMinutes: rule.first_response_minutes,
    resolutionMinutes: rule.resolution_minutes,
    ruleName: rule.name,
    ruleId: rule.id,
    matchedLevel: level,
  });

  for (const rule of rules) {
    if (rule.contact_id && rule.contact_id === params.contactId && !contactMatch) {
      contactMatch = build(rule, 'contact');
      break;
    }
    if (!rule.contact_id && rule.company && rule.company === params.company && !companyMatch) {
      companyMatch = build(rule, 'company');
    }
    if (
      !rule.contact_id &&
      !rule.company &&
      rule.job_title &&
      rule.job_title === params.jobTitle &&
      !jobTitleMatch
    ) {
      jobTitleMatch = build(rule, 'job_title');
    }
    if (
      !rule.contact_id &&
      !rule.company &&
      !rule.job_title &&
      rule.contact_type &&
      rule.contact_type === params.contactType &&
      !contactTypeMatch
    ) {
      contactTypeMatch = build(rule, 'contact_type');
    }
    if (!rule.contact_id && rule.queue_id && rule.queue_id === params.queueId && !queueMatch) {
      queueMatch = build(rule, 'queue');
    }
    if (!rule.contact_id && rule.agent_id && rule.agent_id === params.agentId && !agentMatch) {
      agentMatch = build(rule, 'agent');
    }
  }

  return (
    contactMatch ??
    companyMatch ??
    jobTitleMatch ??
    contactTypeMatch ??
    queueMatch ??
    agentMatch ??
    null
  );
}

/**
 * Returns the applicable SLA for a contact.
 *
 * Uses two shared queries (sla-rules-active + sla-configurations-default) that
 * are deduplicated by React Query across all callers — avoids N+1 when this
 * hook is used inside a virtualized conversation list.
 */
export function useApplicableSLA(params: ContactSLAParams) {
  const enabled = !!params.contactId || !!params.company || !!params.queueId || !!params.agentId;

  const { data: rules, isLoading: rulesLoading, error: rulesError } = useActiveSLARules();
  const { data: defaultConfig, isLoading: configLoading } = useSLADefaultConfig();

  return useQuery<ApplicableSLA>({
    queryKey: queryKeys.sla.applicable(params),
    queryFn: (): ApplicableSLA => {
      const match = resolveHierarchy(rules ?? [], params);
      if (match) return match;

      if (defaultConfig) {
        return {
          firstResponseMinutes: defaultConfig.first_response_minutes,
          resolutionMinutes: defaultConfig.resolution_minutes,
          ruleName: defaultConfig.name,
          ruleId: null,
          matchedLevel: 'global_default',
        };
      }

      return SYSTEM_DEFAULT;
    },
    enabled: enabled && !rulesLoading && !configLoading && !rulesError,
    staleTime: 30_000,
  });
}