import { queryKeys } from '@/services/api/queryKeys';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { LayoutGrid } from 'lucide-react';
import { motion } from 'framer-motion';
import { SCOPE_TABS } from './sla/sla-utils';
import { ScopeRulesList } from './sla/ScopeRulesList';
import { SLARuleScope } from '@/features/sla';

export function SLARulesManager() {
  // Fetch rule counts per scope in a single query
  const { data: ruleCounts = {} } = useQuery({
    queryKey: queryKeys.sla.rulesCounts(),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sla_rules')
        .select('contact_id, company, job_title, contact_type, queue_id, agent_id');
      if (error) throw error;

      const counts: Record<SLARuleScope, number> = {
        contact: 0,
        company: 0,
        job_title: 0,
        contact_type: 0,
        queue: 0,
        agent: 0,
      };

      for (const row of data || []) {
        if (row.contact_id) counts.contact++;
        else if (row.company) counts.company++;
        else if (row.job_title) counts.job_title++;
        else if (row.contact_type) counts.contact_type++;
        else if (row.queue_id) counts.queue++;
        else if (row.agent_id) counts.agent++;
      }

      return counts;
    },
    staleTime: 300_000,
  });

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <Card className="overflow-hidden rounded-2xl border-border/50 bg-card/50">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base font-extrabold">
            <LayoutGrid className="h-5 w-5 text-primary" />
            Regras Granulares de SLA
          </CardTitle>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Configure prazos específicos por cliente, empresa, cargo, tipo, fila ou agente. Regras
            mais específicas sobrescrevem as genéricas automaticamente.
          </p>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="contact" className="w-full">
            <TabsList className="flex h-auto w-full flex-wrap gap-1 rounded-xl bg-muted/50 p-1">
              {SCOPE_TABS.map((tab) => {
                const count = ruleCounts[tab.value] || 0;
                return (
                  <TabsTrigger
                    key={tab.value}
                    value={tab.value}
                    className="flex items-center gap-1.5 rounded-lg text-xs data-[state=active]:bg-background data-[state=active]:shadow-sm"
                  >
                    <tab.icon className="h-3.5 w-3.5" />
                    {tab.label}
                    {count > 0 && (
                      <Badge
                        variant="secondary"
                        className="h-4 min-w-4 rounded-full px-1 text-[9px] font-bold"
                      >
                        {count}
                      </Badge>
                    )}
                  </TabsTrigger>
                );
              })}
            </TabsList>
            {SCOPE_TABS.map((tab) => (
              <TabsContent key={tab.value} value={tab.value}>
                <ScopeRulesList scope={tab.value} />
              </TabsContent>
            ))}
          </Tabs>
        </CardContent>
      </Card>
    </motion.div>
  );
}
