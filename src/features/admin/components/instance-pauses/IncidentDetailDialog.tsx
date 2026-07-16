import { useState } from 'react';
import { queryKeys } from '@/services/api/queryKeys';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { ShieldCheck, AlertTriangle, Globe, KeyRound, Clock } from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';

export interface IncidentPause {
  id: string;
  instance_name: string;
  paused_until: string;
  reason: string;
  trigger_count: number;
  paused_by: string | null;
  auto_paused: boolean;
  created_at: string;
  updated_at: string;
  investigated_at?: string | null;
  investigated_by?: string | null;
  investigation_notes?: string | null;
}

interface AuthEvent {
  id: string;
  instance_name: string;
  reason: 'invalid_signature' | 'auth_401' | 'auth_403';
  source: 'webhook' | 'evolution-api';
  http_status: number | null;
  detail: string | null;
  created_at: string;
}

interface Props {
  pause: IncidentPause | null;
  onClose: () => void;
}

async function invoke<T>(action: string, payload: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.functions.invoke('instance-pause-control', {
    body: { action, ...payload },
  });
  if (error) throw error;
  if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
  return data as T; // ignore-audit: narrows Supabase query result to local interface
}

const reasonIcon = {
  invalid_signature: KeyRound,
  auth_401: ShieldCheck,
  auth_403: ShieldCheck,
} as const;

const reasonLabel = {
  invalid_signature: 'Assinatura inválida',
  auth_401: 'Não autorizado (401)',
  auth_403: 'Proibido (403)',
} as const;

export function IncidentDetailDialog({ pause, onClose }: Props) {
  const qc = useQueryClient();
  const [notes, setNotes] = useState('');
  const open = !!pause;

  // Janela: do início da pausa até agora (mín. 60min)
  const sinceMin = pause
    ? Math.max(60, Math.ceil((Date.now() - new Date(pause.created_at).getTime()) / 60_000) + 5)
    : 60;

  const eventsQuery = useQuery({
    queryKey: queryKeys.adminOps.incidentEventsDetailed(pause?.id, sinceMin),
    queryFn: () => {
      if (!pause) return Promise.resolve({ items: [] as AuthEvent[] });
      return invoke<{ items: AuthEvent[] }>('recent_events', {
        instance: pause.instance_name,
        since_minutes: sinceMin,
        limit: 50,
      });
    },
    enabled: open,
  });

  const markMut = useMutation({
    mutationFn: () => {
      if (!pause) return Promise.reject(new Error('No active pause'));
      return invoke<{ pause: IncidentPause }>('mark_investigated', {
        pause_id: pause.id,
        notes: notes.trim() || null,
      });
    },
    onSuccess: () => {
      toast.success('Incidente marcado como investigado');
      qc.invalidateQueries({ queryKey: queryKeys.adminOps.instancePauses() });
      setNotes('');
      onClose();
    },
    onError: (e: Error) => toast.error(`Falha: ${e.message}`),
  });

  if (!pause) return null;

  const events = eventsQuery.data?.items ?? [];
  const reasonCounts = events.reduce<Record<string, number>>((acc, e) => {
    acc[e.reason] = (acc[e.reason] ?? 0) + 1;
    return acc;
  }, {});
  const sourceCounts = events.reduce<Record<string, number>>((acc, e) => {
    acc[e.source] = (acc[e.source] ?? 0) + 1;
    return acc;
  }, {});

  const isInvestigated = !!pause.investigated_at;
  const isActive = new Date(pause.paused_until).getTime() > Date.now();

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent size="lg" className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-warning" />
            Incidente de autenticação — <span className=" text-base">{pause.instance_name}</span>
          </DialogTitle>
          <DialogDescription>
            Resumo do incidente, requisições afetadas e marcação de investigação.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Resumo */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <div className="rounded-lg border p-3">
              <div className="text-xs text-muted-foreground">Tipo</div>
              <div className="mt-1">
                {pause.auto_paused
                  ? <Badge variant="destructive">automática</Badge>
                  : <Badge variant="subtle">manual</Badge>}
              </div>
            </div>
            <div className="rounded-lg border p-3">
              <div className="text-xs text-muted-foreground">Status</div>
              <div className="mt-1">
                {isActive
                  ? <Badge variant="warning">ativa</Badge>
                  : <Badge variant="subtle">expirada</Badge>}
              </div>
            </div>
            <div className="rounded-lg border p-3">
              <div className="text-xs text-muted-foreground">Gatilhos</div>
              <div className="mt-1 text-xl font-bold ">{pause.trigger_count}</div>
            </div>
            <div className="rounded-lg border p-3">
              <div className="text-xs text-muted-foreground">Investigado</div>
              <div className="mt-1">
                {isInvestigated
                  ? <Badge variant="success" className="gap-1"><ShieldCheck className="h-3 w-3" />sim</Badge>
                  : <Badge variant="subtle">não</Badge>}
              </div>
            </div>
          </div>

          {/* Detalhes da pausa */}
          <div className="rounded-lg border p-3 space-y-1.5 text-sm">
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">Motivo:</span>
              <code className="text-xs">{pause.reason}</code>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground flex items-center gap-1"><Clock className="h-3 w-3" />Início:</span>
              <span className="text-xs">
                {format(new Date(pause.created_at), "dd/MM/yyyy HH:mm:ss", { locale: ptBR })}
                {' '}({formatDistanceToNow(new Date(pause.created_at), { addSuffix: true, locale: ptBR })})
              </span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground flex items-center gap-1"><Clock className="h-3 w-3" />Termina:</span>
              <span className="text-xs">
                {format(new Date(pause.paused_until), "dd/MM/yyyy HH:mm:ss", { locale: ptBR })}
              </span>
            </div>
            {isInvestigated && (
              <>
                <div className="flex justify-between gap-2 pt-2 border-t">
                  <span className="text-muted-foreground">Investigado em:</span>
                  <span className="text-xs">
                    {format(new Date(pause.investigated_at ?? ''), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                  </span>
                </div>
                {pause.investigation_notes && (
                  <div className="text-xs bg-muted/40 rounded p-2 mt-1">
                    <span className="text-muted-foreground">Notas:</span> {pause.investigation_notes}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Distribuição */}
          <div>
            <h4 className="text-sm font-semibold mb-2">Distribuição (janela do incidente)</h4>
            <div className="flex flex-wrap gap-2">
              {Object.entries(reasonCounts).map(([k, v]) => (
                <Badge key={k} variant="outline" className="text-xs">
                  {reasonLabel[k as keyof typeof reasonLabel] ?? k}: <span className="ml-1 ">{v}</span>
                </Badge>
              ))}
              {Object.entries(sourceCounts).map(([k, v]) => (
                <Badge key={k} variant="subtle" className="text-xs gap-1">
                  <Globe className="h-3 w-3" />{k}: <span className="">{v}</span>
                </Badge>
              ))}
              {events.length === 0 && !eventsQuery.isLoading && (
                <span className="text-xs text-muted-foreground">Sem eventos na janela.</span>
              )}
            </div>
          </div>

          {/* Eventos / requisições */}
          <div>
            <h4 className="text-sm font-semibold mb-2">
              Requisições afetadas <span className="text-muted-foreground font-normal">({events.length})</span>
            </h4>
            {eventsQuery.isLoading ? (
              <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}</div>
            ) : events.length === 0 ? (
              <p className="text-xs text-muted-foreground py-3 text-center border rounded-lg">
                Nenhum evento de autenticação registrado nesta janela.
              </p>
            ) : (
              <div className="rounded-lg border overflow-hidden">
                <div className="max-h-64 overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/40 sticky top-0">
                      <tr className="text-left">
                        <th scope="col" className="px-2 py-1.5 font-medium">Quando</th>
                        <th scope="col" className="px-2 py-1.5 font-medium">Origem</th>
                        <th scope="col" className="px-2 py-1.5 font-medium">Motivo</th>
                        <th scope="col" className="px-2 py-1.5 font-medium">HTTP</th>
                        <th scope="col" className="px-2 py-1.5 font-medium">Detalhe / Path</th>
                      </tr>
                    </thead>
                    <tbody>
                      {events.map((ev) => {
                        const Icon = reasonIcon[ev.reason] ?? ShieldCheck;
                        return (
                          <tr key={ev.id} className="border-t hover:bg-muted/30">
                            <td className="px-2 py-1.5 whitespace-nowrap text-muted-foreground">
                              {format(new Date(ev.created_at), 'HH:mm:ss', { locale: ptBR })}
                            </td>
                            <td className="px-2 py-1.5"><Badge variant="outline" className="text-[10px]">{ev.source}</Badge></td>
                            <td className="px-2 py-1.5">
                              <span className="inline-flex items-center gap-1">
                                <Icon className="h-3 w-3 text-warning" />
                                {ev.reason}
                              </span>
                            </td>
                            <td className="px-2 py-1.5 ">{ev.http_status ?? '—'}</td>
                            <td className="px-2 py-1.5  truncate max-w-[260px]" title={ev.detail ?? ''}>
                              {ev.detail ?? '—'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            <p className="text-[11px] text-muted-foreground mt-1">
              Apenas metadados (sem corpo, sem segredo). Headers/path expostos são os úteis para diagnóstico.
            </p>
          </div>

          {/* Notas de investigação */}
          {!isInvestigated && (
            <div>
              <label className="text-sm font-semibold">Notas (opcional)</label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Ex.: rotação da WEBHOOK_SECRET, credencial Evolution renovada…"
                rows={3}
                className="mt-1"
                maxLength={1000}
              />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Fechar</Button>
          {!isInvestigated && (
            <Button
              onClick={() => markMut.mutate()}
              isLoading={markMut.isPending}
              loadingText="Marcando…"
              variant="success"
            >
              <ShieldCheck className="h-4 w-4 mr-1.5" />
              Marcar como investigado
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
