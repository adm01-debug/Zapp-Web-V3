// @ts-nocheck
import { useState, useEffect } from 'react';
import { useMountedRef } from '@/hooks/useMountedRef';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import {
  Zap,
  MessageSquare,
  ArrowRight,
  Calendar,
  TrendingUp,
  UserCheck,
  AlertTriangle,
  CheckCircle2,
  Clock,
} from 'lucide-react';
import { motion } from 'framer-motion';

interface NextAction {
  type: string;
  label: string;
  description: string;
  priority: 'high' | 'medium' | 'low';
  icon: typeof Zap;
  action?: () => void;
}

interface NextBestActionProps {
  contactId: string;
  contactName: string;
}

export function NextBestActionEngine({ contactId, contactName }: NextBestActionProps) {
  const [actions, setActions] = useState<NextAction[]>([]);
  const [loading, setLoading] = useState(true);
  const mountedRef = useMountedRef();

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      setLoading(true);
      const suggestedActions: NextAction[] = [];

      const { data: lastMsg } = await supabase
        .from('messages')
        .select('created_at, sender')
        .eq('contact_id', contactId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (lastMsg) {
        const hoursSinceLastMsg =
          (Date.now() - new Date(lastMsg.created_at).getTime()) / (1000 * 60 * 60);

        if (lastMsg.sender === 'contact' && hoursSinceLastMsg > 1) {
          suggestedActions.push({
            type: 'respond',
            label: 'Responder agora',
            description: `${contactName} aguarda resposta há ${Math.round(hoursSinceLastMsg)}h`,
            priority: hoursSinceLastMsg > 4 ? 'high' : 'medium',
            icon: MessageSquare,
          });
        }

        if (lastMsg.sender === 'agent' && hoursSinceLastMsg > 24) {
          suggestedActions.push({
            type: 'follow_up',
            label: 'Enviar follow-up',
            description: 'Sem resposta do cliente há mais de 24h',
            priority: 'medium',
            icon: Calendar,
          });
        }
      }

      const { count: pendingTasks } = await supabase
        .from('conversation_tasks')
        .select('id', { count: 'exact', head: true })
        .eq('contact_id', contactId)
        .eq('status', 'pending');

      if (pendingTasks && pendingTasks > 0) {
        suggestedActions.push({
          type: 'complete_tasks',
          label: `Completar ${pendingTasks} tarefa(s)`,
          description: 'Tarefas pendentes neste contato',
          priority: 'medium',
          icon: CheckCircle2,
        });
      }

      const { data: slaData } = await supabase
        .from('conversation_sla')
        .select('first_response_breached, resolution_breached')
        .eq('contact_id', contactId)
        .maybeSingle();

      if (slaData?.first_response_breached || slaData?.resolution_breached) {
        suggestedActions.push({
          type: 'escalate',
          label: 'Escalar para supervisor',
          description: 'SLA estourado - requer atenção imediata',
          priority: 'high',
          icon: AlertTriangle,
        });
      }

      const { data: memory } = await supabase
        .from('conversation_memory')
        .select('pending_items, promises_made')
        .eq('contact_id', contactId)
        .maybeSingle();

      if (memory) {
        const pending = Array.isArray(memory.pending_items) ? memory.pending_items : [];
        const promises = Array.isArray(memory.promises_made) ? memory.promises_made : [];
        if (pending.length > 0) {
          suggestedActions.push({
            type: 'resolve_pending',
            label: `Resolver ${pending.length} pendência(s)`,
            description: String(pending[0] || 'Itens pendentes registrados'),
            priority: 'medium',
            icon: Clock,
          });
        }
        if (promises.length > 0) {
          suggestedActions.push({
            type: 'fulfill_promise',
            label: 'Cumprir promessa feita',
            description: String(promises[0] || 'Promessa registrada ao cliente'),
            priority: 'high',
            icon: UserCheck,
          });
        }
      }

      if (suggestedActions.length === 0) {
        suggestedActions.push({
          type: 'upsell',
          label: 'Explorar oportunidade',
          description: 'Sem ações urgentes. Considere oferecer novos produtos/serviços.',
          priority: 'low',
          icon: TrendingUp,
        });
      }

      const priorityOrder = { high: 0, medium: 1, low: 2 };
      suggestedActions.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

      if (cancelled || !mountedRef.current) return;
      setActions(suggestedActions);
      setLoading(false);
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [contactId, contactName]);

  const priorityColors = {
    high: 'border-destructive/30 bg-destructive/5',
    medium: 'border-warning/30 bg-warning/5',
    low: 'border-primary/30 bg-primary/5',
  };

  const priorityBadge = {
    high: 'bg-destructive/10 text-destructive',
    medium: 'bg-warning/10 text-warning',
    low: 'bg-primary/10 text-primary',
  };

  if (loading) {
    return (
      <div className="space-y-2">
        {[1, 2].map((i) => (
          <div key={i} className="h-16 animate-pulse rounded-xl bg-muted/20" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="mb-2 flex items-center gap-2">
        <Zap className="h-4 w-4 text-primary" />
        <span className="text-sm font-medium">Próxima Melhor Ação</span>
      </div>
      {actions.map((action, idx) => {
        const Icon = action.icon;
        return (
          <motion.div
            key={action.type}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: idx * 0.1 }}
            className={`rounded-xl border p-3 ${priorityColors[action.priority]} cursor-pointer transition-shadow hover:shadow-sm`}
          >
            <div className="flex items-start gap-2">
              <Icon className="mt-0.5 h-4 w-4 shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{action.label}</span>
                  <Badge
                    variant="outline"
                    className={`text-[9px] ${priorityBadge[action.priority]}`}
                  >
                    {action.priority === 'high'
                      ? 'Urgente'
                      : action.priority === 'medium'
                        ? 'Normal'
                        : 'Baixa'}
                  </Badge>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">{action.description}</p>
              </div>
              <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}
