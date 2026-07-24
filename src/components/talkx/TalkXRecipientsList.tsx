import React from 'react';
import { CheckCircle2, XCircle, Clock, Loader2, SkipForward } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { queryKeys } from '@/services/api/queryKeys';
import { useQuery } from '@tanstack/react-query';
import { safeClient } from '@/integrations/supabase/safeClient';
import { motion } from 'framer-motion';
import type { TalkXRecipient } from '@/hooks/useTalkX';

const STATUS_MAP: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  pending: { label: 'Pendente', icon: Clock, color: 'text-muted-foreground' },
  sending: { label: 'Enviando', icon: Loader2, color: 'text-primary' },
  sent: { label: 'Enviada', icon: CheckCircle2, color: 'text-primary' },
  delivered: { label: 'Entregue', icon: CheckCircle2, color: 'text-accent-foreground' },
  failed: { label: 'Falhou', icon: XCircle, color: 'text-destructive' },
  skipped: { label: 'Pulado', icon: SkipForward, color: 'text-muted-foreground' },
};

interface Props {
  campaignId: string;
}

/** Talk XRecipients List component for the talkx section. */
export function TalkXRecipientsList({ campaignId }: Props) {
  const { data: recipients = [], isLoading } = useQuery({
    queryKey: queryKeys.talkx.recipientsListForCampaign(campaignId),
    queryFn: async () => {
      const { data, error } = await safeClient.from<TalkXRecipient>('talkx_recipients', (q) =>
        q
          .select('*, contacts:contact_id(name, nickname, phone, company, avatar_url)')
          .eq('campaign_id', campaignId)
          .order('created_at', { ascending: true })
      );
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!campaignId,
    refetchInterval: 5000,
    staleTime: 4_000,
  });

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex animate-pulse items-center gap-3 p-2.5">
            <div className="h-8 w-8 rounded-full bg-muted" />
            <div className="flex-1 space-y-1.5">
              <div className="h-3.5 w-2/3 rounded bg-muted" />
              <div className="h-2.5 w-1/3 rounded bg-muted" />
            </div>
            <div className="h-5 w-16 rounded bg-muted" />
          </div>
        ))}
      </div>
    );
  }

  if (recipients.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        Nenhum destinatário adicionado
      </p>
    );
  }

  return (
    <div className="space-y-1">
      {recipients.map((r, index) => {
        const cfg = STATUS_MAP[r.status] || STATUS_MAP.pending;
        const Icon = cfg.icon;

        return (
          <motion.div
            key={r.id}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: Math.min(index * 0.03, 0.5) }}
            className="flex items-center gap-3 rounded-xl p-2.5 transition-colors hover:bg-muted/50"
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-xs font-semibold text-muted-foreground">
              {r.contacts?.avatar_url ? (
                <img src={r.contacts.avatar_url} alt="" className="h-full w-full object-cover" />
              ) : (
                (r.contacts?.name || '?')[0].toUpperCase()
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">
                {r.contacts?.name || 'Desconhecido'}
                {r.contacts?.nickname && (
                  <span className="ml-1 text-muted-foreground">({r.contacts.nickname})</span>
                )}
              </p>
              {r.personalized_message && (
                <p className="truncate text-xs text-muted-foreground">{r.personalized_message}</p>
              )}
              {r.error_message && (
                <p className="truncate text-xs text-destructive">{r.error_message}</p>
              )}
            </div>
            <Badge variant="outline" className={`shrink-0 gap-1 ${cfg.color}`}>
              <Icon className={`h-3 w-3 ${r.status === 'sending' ? 'animate-spin' : ''}`} />
              {cfg.label}
            </Badge>
          </motion.div>
        );
      })}
    </div>
  );
}