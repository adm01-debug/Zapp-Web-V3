import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, QrCode, Stethoscope, RefreshCw, Loader2, Activity } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { evolutionInstanceName } from '@/lib/evolutionInstance';

interface DegradedConnection {
  id: string;
  instance_id?: string | null;
  instance_name?: string | null;
  name?: string | null;
  phone_number?: string | null;
  health_status?: string | null;
  health_response_ms?: number | null;
  last_health_check?: string | null;
}

interface Props {
  connections: DegradedConnection[];
  onShowQrCode: (connection: Pick<DegradedConnection, 'id' | 'instance_id' | 'name'>) => void;
}

/** Latency tier helper for the chip color. */
function latencyTier(ms?: number | null): { label: string; tone: string } | null {
  if (ms == null) return null;
  if (ms < 300) return { label: `${ms}ms`, tone: 'text-primary bg-primary/10 border-primary/20' };
  if (ms < 800) return { label: `${ms}ms`, tone: 'text-warning-foreground bg-warning/10 border-warning/30' };
  return { label: `${ms}ms`, tone: 'text-destructive-foreground bg-destructive/10 border-destructive/30' };
}

/** Quick-actions block for degraded instances: diagnostics, QR regen, revalidate now. */
export function DegradedQuickActions({ connections, onShowQrCode }: Props) {
  const [revalidating, setRevalidating] = useState<string | null>(null);

  const degraded = connections.filter((c) => c.health_status === 'degraded');
  if (degraded.length === 0) return null;

  const goToDiagnostics = () => {
    window.dispatchEvent(new CustomEvent('navigate-view', { detail: 'diagnostics' }));
  };

  const handleRevalidate = async (conn: DegradedConnection) => {
    setRevalidating(conn.id);
    try {
      // Evolution roteia por nome de instância — nunca enviar o UUID (instance_id).
      const { error } = await supabase.functions.invoke('connection-health-check', {
        body: { connectionId: conn.id, instanceName: evolutionInstanceName(conn) ?? undefined },
      });
      if (error) throw error;
      toast({ title: 'Verificação concluída', description: `Verificação de "${conn.name || conn.instance_id}" concluída.` });
    } catch (e: unknown) {
      toast({
        title: 'Falha na verificação',
        description: e instanceof Error ? e.message : 'Erro desconhecido',
        variant: 'destructive',
      });
    } finally {
      setRevalidating(null);
    }
  };

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
      <Card className="relative overflow-hidden border-warning/40 bg-gradient-to-br from-warning/[0.06] via-card to-card shadow-lg shadow-warning/5">
        {/* Accent bar */}
        <span aria-hidden className="absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-warning via-warning/70 to-warning/30" />

        <CardContent className="p-5 space-y-4 pl-6">
          {/* Header */}
          <div className="flex items-start gap-3">
            <div className="shrink-0 mt-0.5 w-9 h-9 rounded-full bg-warning/15 flex items-center justify-center ring-1 ring-warning/30">
              <AlertTriangle className="w-4 h-4 text-warning-foreground" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm font-semibold tracking-tight">Atenção necessária</h3>
                <Badge variant="outline" className="text-[10px] h-5 px-1.5 border-warning/40 bg-warning/10 text-warning-foreground">
                  {degraded.length === 1 ? '1 conexão instável' : `${degraded.length} conexões instáveis`}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                Estas instâncias apresentaram instabilidade na última verificação. Recomendamos verificar para evitar perda de mensagens.
              </p>
            </div>
          </div>

          {/* List */}
          <ul className="space-y-2">
            {degraded.map((conn) => {
              const latency = latencyTier(conn.health_response_ms);
              const isLoading = revalidating === conn.id;
              return (
                <li
                  key={conn.id}
                  className="group rounded-xl border border-border/60 bg-background/40 hover:bg-background/70 hover:border-border transition-all px-3 py-2.5"
                >
                  <div className="flex items-center gap-3 flex-wrap">
                    {/* Pulse dot + identity */}
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <span className="relative flex h-2.5 w-2.5 shrink-0">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-warning opacity-60" />
                        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-warning" />
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate leading-tight">{conn.name || conn.instance_id}</p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="text-[11px] text-muted-foreground truncate">
                            {conn.phone_number || conn.instance_id}
                          </span>
                          {latency && (
                            <Badge variant="outline" className={cn('text-[10px] h-4 px-1.5 font-mono gap-1', latency.tone)}>
                              <Activity className="w-2.5 h-2.5" />
                              {latency.label}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={goToDiagnostics}
                        className="h-8 px-2.5 text-xs hover:bg-muted"
                      >
                        <Stethoscope className="w-3.5 h-3.5 mr-1.5" />
                        Diagnósticos
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onShowQrCode({ id: conn.id, instance_id: conn.instance_id, name: conn.name })}
                        disabled={!conn.instance_id}
                        className="h-8 px-2.5 text-xs"
                      >
                        <QrCode className="w-3.5 h-3.5 mr-1.5" />
                        Gerar QR
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => handleRevalidate(conn)}
                        disabled={isLoading}
                        className="h-8 px-3 text-xs bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm shadow-primary/20"
                      >
                        {isLoading ? (
                          <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                        ) : (
                          <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                        )}
                        Verificar agora
                      </Button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>
    </motion.div>
  );
}
