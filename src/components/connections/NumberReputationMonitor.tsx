// @ts-nocheck
import { useState, useEffect } from 'react';
import { useMountedRef } from '@/hooks/useMountedRef';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Shield, Flame, Thermometer } from 'lucide-react';
import { toast } from 'sonner';
import { motion } from 'framer-motion';

interface ReputationData {
  id: string;
  whatsapp_connection_id: string;
  health_score: number;
  messages_sent_today: number;
  failures_today: number;
  complaints_count: number;
  warmup_status: string;
  warmup_day: number | null;
  daily_limit: number | null;
}

interface ConnectionInfo {
  id: string;
  instance_id: string;
  phone_number: string | null;
}

/**
 * Number Reputation Monitor — hides itself entirely when no data exists.
 * Only shows when there are actual reputation records to display.
 */
export function NumberReputationMonitor() {
  const [reputations, setReputations] = useState<
    (ReputationData & { connection?: ConnectionInfo })[]
  >([]);
  const [loading, setLoading] = useState(true);
  const mountedRef = useMountedRef();

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    const { data: reps } = await supabase.from('number_reputation').select('*');
    if (!mountedRef.current) return;
    const { data: connections } = await supabase
      .from('whatsapp_connections')
      .select('id, instance_id, phone_number');
    if (!mountedRef.current) return;
    if (reps && connections) {
      setReputations(
        reps.map((r) => ({
          ...r,
          connection: connections.find((c) => c.id === r.whatsapp_connection_id) as
            ConnectionInfo | undefined,
        }))
      );
    }
    setLoading(false);
  };

  const startWarmup = async (id: string) => {
    await supabase
      .from('number_reputation')
      .update({ warmup_status: 'active', warmup_day: 1, daily_limit: 20 })
      .eq('id', id);
    toast.success('Aquecimento iniciado');
    loadData();
  };

  const getHealthColor = (score: number) =>
    score >= 80 ? 'text-status-online' : score >= 50 ? 'text-warning' : 'text-destructive';
  const getHealthBg = (score: number) =>
    score >= 80 ? 'bg-status-online/10' : score >= 50 ? 'bg-warning/10' : 'bg-destructive/10';

  const warmupLabels: Record<string, string> = {
    none: 'Sem aquecimento',
    active: 'Em aquecimento',
    completed: 'Aquecido',
    paused: 'Pausado',
  };

  // Hide entirely when no data — no empty state card taking space
  if (!loading && reputations.length === 0) return null;
  if (loading) return null;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Shield className="h-5 w-5 text-primary" />
          Saúde dos Números
        </h2>
        <p className="text-sm text-muted-foreground">Reputação e aquecimento das suas conexões</p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {reputations.map((rep, idx) => (
          <motion.div
            key={rep.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.1 }}
          >
            <Card className="transition-shadow hover:shadow-md">
              <CardContent className="space-y-3 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">
                      {rep.connection?.instance_id || 'Instância'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {rep.connection?.phone_number || 'N/A'}
                    </p>
                  </div>
                  <div
                    className={`flex h-12 w-12 items-center justify-center rounded-xl ${getHealthBg(rep.health_score)}`}
                  >
                    <span className={`text-lg font-bold ${getHealthColor(rep.health_score)}`}>
                      {rep.health_score}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div className="text-center">
                    <p className="text-lg font-bold">{rep.messages_sent_today}</p>
                    <p className="text-[10px] text-muted-foreground">Enviadas</p>
                  </div>
                  <div className="text-center">
                    <p className="text-lg font-bold text-destructive">{rep.failures_today}</p>
                    <p className="text-[10px] text-muted-foreground">Falhas</p>
                  </div>
                  <div className="text-center">
                    <p className="text-lg font-bold text-warning">{rep.complaints_count}</p>
                    <p className="text-[10px] text-muted-foreground">Reclamações</p>
                  </div>
                </div>

                <div className="flex items-center justify-between border-t border-border/30 pt-2">
                  <div className="flex items-center gap-1.5">
                    <Thermometer className="h-3.5 w-3.5 text-muted-foreground" />
                    <Badge variant="outline" className="text-[10px]">
                      {warmupLabels[rep.warmup_status] || rep.warmup_status}
                      {rep.warmup_day ? ` (Dia ${rep.warmup_day})` : ''}
                    </Badge>
                  </div>
                  {rep.warmup_status === 'none' && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-6 text-[10px]"
                      onClick={() => startWarmup(rep.id)}
                    >
                      <Flame className="mr-1 h-3 w-3" />
                      Aquecer
                    </Button>
                  )}
                </div>

                {rep.daily_limit && (
                  <div className="space-y-1">
                    <div className="flex justify-between text-[10px] text-muted-foreground">
                      <span>Limite diário</span>
                      <span>
                        {rep.messages_sent_today}/{rep.daily_limit}
                      </span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted/30">
                      <div
                        className={`h-full rounded-full transition-all ${rep.messages_sent_today / rep.daily_limit > 0.9 ? 'bg-destructive' : rep.messages_sent_today / rep.daily_limit > 0.7 ? 'bg-warning' : 'bg-primary'}`}
                        style={{
                          width: `${Math.min(100, (rep.messages_sent_today / rep.daily_limit) * 100)}%`,
                        }}
                      />
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>
    </div>
  );
}