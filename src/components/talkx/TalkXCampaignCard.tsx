import React from 'react';
import { motion } from 'framer-motion';
import {
  Play, Pause, X, Trash2, Eye, Users, Clock,
  CheckCircle2, XCircle, Loader2, Copy, CalendarClock
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  Tooltip, TooltipContent, TooltipTrigger,
} from '@/components/ui/tooltip';
import type { TalkXCampaign } from '@/hooks/useTalkX';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const STATUS_CONFIG: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; icon: React.ElementType }> = {
  draft: { label: 'Rascunho', variant: 'secondary', icon: Clock },
  scheduled: { label: 'Agendada', variant: 'outline', icon: CalendarClock },
  sending: { label: 'Enviando', variant: 'default', icon: Loader2 },
  paused: { label: 'Pausada', variant: 'outline', icon: Pause },
  completed: { label: 'Concluída', variant: 'default', icon: CheckCircle2 },
  cancelled: { label: 'Cancelada', variant: 'destructive', icon: XCircle },
};

interface Props {
  campaign: TalkXCampaign;
  onEdit: (campaign: TalkXCampaign) => void;
  onView: (campaign: TalkXCampaign) => void;
  onDuplicate: (campaign: TalkXCampaign) => void;
  onStart: (id: string) => void;
  onPause: (id: string) => void;
  onCancel: (id: string) => void;
  onDelete: (id: string) => void;
}

export function TalkXCampaignCard({
  campaign, onEdit, onView, onDuplicate,
  onStart, onPause, onCancel, onDelete,
}: Props) {
  const cfg = STATUS_CONFIG[campaign.status] || STATUS_CONFIG.draft;
  const StatusIcon = cfg.icon;
  const progress = campaign.total_recipients > 0
    ? Math.round(((campaign.sent_count + campaign.failed_count) / campaign.total_recipients) * 100)
    : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      layout
    >
      <Card className="hover:border-primary/30 transition-colors">
        <CardContent className="p-4 md:p-5">
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-3 md:gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <h3 className="font-semibold text-foreground truncate">{campaign.name}</h3>
                <Badge variant={cfg.variant} className="gap-1 shrink-0">
                  <StatusIcon className={`w-3 h-3 ${campaign.status === 'sending' ? 'animate-spin' : ''}`} />
                  {cfg.label}
                </Badge>
                {campaign.scheduled_at && campaign.status === 'scheduled' && (
                  <Badge variant="outline" className="gap-1 shrink-0 text-muted-foreground">
                    <CalendarClock className="w-3 h-3" />
                    {format(new Date(campaign.scheduled_at), "dd/MM HH:mm", { locale: ptBR })}
                  </Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground line-clamp-1 mb-3">
                {campaign.message_template}
              </p>
              <div className="flex items-center gap-3 md:gap-4 text-xs text-muted-foreground flex-wrap">
                <span className="flex items-center gap-1">
                  <Users className="w-3.5 h-3.5" />
                  {campaign.total_recipients}
                </span>
                <span className="flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5 text-primary" />
                  {campaign.sent_count} enviadas
                </span>
                {campaign.failed_count > 0 && (
                  <span className="flex items-center gap-1">
                    <XCircle className="w-3.5 h-3.5 text-destructive" />
                    {campaign.failed_count}
                  </span>
                )}
                <span className="flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" />
                  {campaign.typing_delay_min / 1000}–{campaign.typing_delay_max / 1000}s
                </span>
                {campaign.media_type && (
                  <Badge variant="outline" className="text-[10px] h-4 px-1.5">
                    📎 {campaign.media_type}
                  </Badge>
                )}
                {campaign.created_at && (
                  <span className="text-muted-foreground/60">
                    {format(new Date(campaign.created_at), "dd MMM yyyy", { locale: ptBR })}
                  </span>
                )}
              </div>
              {(campaign.status === 'sending' || campaign.status === 'paused') && campaign.total_recipients > 0 && (
                <div className="mt-3">
                  <Progress value={progress} className="h-2" />
                  <p className="text-[10px] text-muted-foreground mt-1 text-right">
                    {campaign.sent_count + campaign.failed_count} / {campaign.total_recipients} ({progress}%)
                  </p>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex gap-2 shrink-0 flex-wrap">
              {campaign.status === 'draft' && (
                <>
                  <Button size="sm" variant="outline" onClick={() => onEdit(campaign)}>
                    Editar
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button size="sm" disabled={campaign.total_recipients === 0} className="gap-1">
                        <Play className="w-3.5 h-3.5" />
                        Iniciar
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Iniciar campanha?</AlertDialogTitle>
                        <AlertDialogDescription>
                          As mensagens serão enviadas para {campaign.total_recipients} contatos. Esta ação não pode ser desfeita.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={() => onStart(campaign.id)}>
                          Iniciar envio
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button size="icon" variant="ghost" onClick={() => onDuplicate(campaign)} aria-label="Duplicar campanha">
                        <Copy className="w-4 h-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Duplicar</TooltipContent>
                  </Tooltip>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button size="icon" variant="ghost" className="text-destructive" aria-label="Excluir campanha">
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Excluir campanha?</AlertDialogTitle>
                        <AlertDialogDescription>
                          A campanha &ldquo;{campaign.name}&rdquo; será excluída permanentemente.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          onClick={() => onDelete(campaign.id)}
                        >
                          Excluir
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </>
              )}
              {campaign.status === 'sending' && (
                <>
                  <Button size="sm" variant="outline" onClick={() => onPause(campaign.id)} className="gap-1">
                    <Pause className="w-3.5 h-3.5" />
                    Pausar
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button size="sm" variant="destructive" className="gap-1">
                        <X className="w-3.5 h-3.5" />
                        Cancelar
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Cancelar campanha?</AlertDialogTitle>
                        <AlertDialogDescription>
                          O envio será interrompido permanentemente. Mensagens já enviadas não serão afetadas.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Voltar</AlertDialogCancel>
                        <AlertDialogAction
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          onClick={() => onCancel(campaign.id)}
                        >
                          Confirmar cancelamento
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </>
              )}
              {campaign.status === 'paused' && (
                <Button size="sm" onClick={() => onStart(campaign.id)} className="gap-1">
                  <Play className="w-3.5 h-3.5" />
                  Retomar
                </Button>
              )}
              {(campaign.status === 'completed' || campaign.status === 'cancelled') && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button size="icon" variant="ghost" onClick={() => onDuplicate(campaign)} aria-label="Duplicar campanha">
                      <Copy className="w-4 h-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Duplicar</TooltipContent>
                </Tooltip>
              )}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button size="sm" variant="ghost" onClick={() => onView(campaign)} aria-label="Ver detalhes">
                    <Eye className="w-3.5 h-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Ver detalhes</TooltipContent>
              </Tooltip>
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
