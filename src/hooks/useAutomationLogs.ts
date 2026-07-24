import { useCallback, useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { safeClient } from '@/integrations/supabase/safeClient';
import { useToast } from '@/hooks/use-toast';
import type { ExecutionRow, RuleLite, AutomationStatus } from '@/pages/admin/automationLogsHelpers';
import { PAGE_SIZE } from '@/pages/admin/automationLogsHelpers';

/** Automation Logs Filters. */
export interface AutomationLogsFilters {
  filterRule: string;
  filterStatus: string;
  filterJid: string;
  filterFrom: string;
  filterTo: string;
  page: number;
}

/** use Automation Logs. */
export function useAutomationLogs(filters: AutomationLogsFilters) {
  const { filterRule, filterStatus, filterJid, filterFrom, filterTo, page } = filters;
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const logsKey = ['automation-logs', page, filterRule, filterStatus, filterJid, filterFrom, filterTo] as const;
  const rulesKey = ['automation-rules'] as const;

  const { data: rows = [], isLoading: loading } = useQuery({
    queryKey: logsKey,
    queryFn: async () => {
      const { data, error } = await safeClient.from<ExecutionRow>('automation_executions', (q) => {
        let query = q
          .select('*')
          .order('created_at', { ascending: false })
          .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
        if (filterRule !== 'all') query = query.eq('rule_id', filterRule);
        if (filterStatus !== 'all') query = query.eq('status', filterStatus as AutomationStatus);
        if (filterJid.trim()) query = query.ilike('remote_jid', `%${filterJid.trim()}%`);
        if (filterFrom) query = query.gte('created_at', new Date(filterFrom).toISOString());
        if (filterTo) {
          const to = new Date(filterTo);
          to.setHours(23, 59, 59, 999);
          query = query.lte('created_at', to.toISOString());
        }
        return query;
      });
      if (error) {
        const isMissing =
          error.message?.includes('does not exist') || (error as { code?: string }).code === '42P01';
        if (!isMissing) {
          toast({ title: 'Erro', description: error.message, variant: 'destructive' });
        }
        return [] as ExecutionRow[];
      }
      return (data ?? []) as ExecutionRow[];
    },
    staleTime: 30_000,
  });

  const { data: rules = [] } = useQuery({
    queryKey: rulesKey,
    queryFn: async () => {
      const { data } = await supabase.from('automations').select('id,name').order('name');
      return (data ?? []) as RuleLite[];
    },
    staleTime: 60_000,
  });

  // Realtime: invalidate current page's logs on any execution change
  useEffect(() => {
    const ch = supabase
      .channel('automation-executions-audit')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'automation_executions' },
        () => {
          if (page === 0) {
            void queryClient.invalidateQueries({
              queryKey: ['automation-logs', page, filterRule, filterStatus, filterJid, filterFrom, filterTo],
            });
          }
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [page, filterRule, filterStatus, filterJid, filterFrom, filterTo, queryClient]);

  const ruleNameById = useMemo(() => Object.fromEntries(rules.map((r) => [r.id, r.name])), [rules]);

  const load = useCallback(
    () =>
      queryClient.invalidateQueries({
        queryKey: ['automation-logs', page, filterRule, filterStatus, filterJid, filterFrom, filterTo],
      }),
    [queryClient, page, filterRule, filterStatus, filterJid, filterFrom, filterTo]
  );

  return { rows, rules, ruleNameById, loading, load };
}
