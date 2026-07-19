import { useCallback, useEffect, useMemo, useState } from 'react';
import { useMountedRef } from '@/hooks/useMountedRef';
import { supabase } from '@/integrations/supabase/client';
import { safeClient } from '@/integrations/supabase/safeClient';
import { useToast } from '@/hooks/use-toast';
import type { ExecutionRow, RuleLite, AutomationStatus } from './automationLogsHelpers';
import { PAGE_SIZE } from './automationLogsHelpers';

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
  const [rows, setRows] = useState<ExecutionRow[]>([]);
  const [rules, setRules] = useState<RuleLite[]>([]);
  const [loading, setLoading] = useState(false);
  const mountedRef = useMountedRef();

  const load = useCallback(async () => {
    setLoading(true);
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
    if (!mountedRef.current) return;
    if (error) {
      const isMissing =
        error.message?.includes('does not exist') || (error as { code?: string }).code === '42P01';
      if (!isMissing) {
        toast({ title: 'Erro', description: error.message, variant: 'destructive' });
      }
      setRows([]);
    } else {
      setRows((data ?? []) as ExecutionRow[]);
    }
    setLoading(false);
  }, [page, filterRule, filterStatus, filterJid, filterFrom, filterTo, toast, mountedRef]);

  useEffect(() => {
    supabase
      .from('automations')
      .select('id,name')
      .order('name')
      .then(({ data }) => {
        if (mountedRef.current) setRules((data ?? []) as RuleLite[]);
      });
  }, [mountedRef]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const ch = supabase
      .channel('automation-executions-audit')
      .on(
        'postgres_changes',
        { event: '*', schema: 'zapp', table: 'automation_executions' },
        () => {
          if (page === 0) void load();
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [page, load]);

  const ruleNameById = useMemo(() => Object.fromEntries(rules.map((r) => [r.id, r.name])), [rules]);

  return { rows, rules, ruleNameById, loading, load };
}
