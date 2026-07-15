import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { Radio, MessageSquare, ArrowUp, Wifi, WifiOff } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { motion, AnimatePresence } from 'framer-motion';
import { dbFrom } from '@/integrations/datasource/db';

interface TimelineEvent {
  id: string;
  type: 'message_in' | 'message_out' | 'health_ok' | 'health_fail';
  label: string;
  detail: string;
  timestamp: string;
}

const iconMap = {
  message_in: MessageSquare,
  message_out: ArrowUp,
  health_ok: Wifi,
  health_fail: WifiOff,
};

const colorMap = {
  message_in: 'text-primary',
  message_out: 'text-primary',
  health_ok: 'text-primary',
  health_fail: 'text-destructive',
};

export function MonitoringEventTimeline() {
  const [events, setEvents] = useState<TimelineEvent[]>([]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

      const [msgRes, healthRes] = await Promise.all([
        dbFrom('messages')
          .select('id, sender, content, created_at, contact_id')
          .gte('created_at', oneHourAgo)
          .order('created_at', { ascending: false })
          .limit(20),
        supabase
          .from('connection_health_logs')
          .select('id, instance_id, status, checked_at')
          .order('checked_at', { ascending: false })
          .limit(10),
      ]);

      if (cancelled) return;

      const timeline: TimelineEvent[] = [];

      msgRes.data?.forEach(m => {
        timeline.push({
          id: m.id,
          type: m.sender === 'contact' ? 'message_in' : 'message_out',
          label: m.sender === 'contact' ? 'Mensagem Recebida' : 'Mensagem Enviada',
          detail: (m.content || '').slice(0, 60) + ((m.content || '').length > 60 ? '...' : ''),
          timestamp: m.created_at,
        });
      });

      healthRes.data?.forEach(h => {
        const ok = h.status === 'connected' || h.status === 'healthy';
        timeline.push({
          id: h.id,
          type: ok ? 'health_ok' : 'health_fail',
          label: ok ? 'Health OK' : 'Health Falha',
          detail: h.instance_id,
          timestamp: h.checked_at,
        });
      });

      timeline.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      setEvents(timeline.slice(0, 30));
    };

    load();
    const interval = setInterval(load, 15000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Radio className="w-4 h-4 text-primary" />
          Atividade Recente
          <Badge variant="outline" className="text-[10px] ml-auto">{events.length} eventos</Badge>
        </CardTitle>
        <CardDescription>Mensagens e health checks da última hora</CardDescription>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[360px]">
          {events.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-[300px] text-muted-foreground">
              <Radio className="w-10 h-10 mb-2 opacity-20" />
              <p className="text-sm">Nenhuma atividade na última hora</p>
            </div>
          ) : (
            <div className="relative space-y-0">
              <div className="absolute left-[15px] top-2 bottom-2 w-px bg-border" />

              <AnimatePresence initial={false}>
                {events.map((ev) => {
                  const Icon = iconMap[ev.type];
                  return (
                    <motion.div
                      key={ev.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="relative flex items-start gap-3 py-2 pl-1"
                    >
                      <div className="relative z-10 flex items-center justify-center w-[30px] h-[30px] rounded-full bg-background border border-border shrink-0">
                        <Icon className={`w-3.5 h-3.5 ${colorMap[ev.type]}`} />
                      </div>
                      <div className="min-w-0 flex-1 pt-0.5">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium">{ev.label}</span>
                          <span className="text-[10px] text-muted-foreground ml-auto shrink-0">
                            {formatDistanceToNow(new Date(ev.timestamp), { addSuffix: true, locale: ptBR })}
                          </span>
                        </div>
                        <p className="text-[11px] text-muted-foreground truncate mt-0.5">{ev.detail}</p>
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
