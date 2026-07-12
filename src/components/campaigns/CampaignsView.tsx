import { useState, lazy, Suspense } from 'react';
import { useCampaigns, Campaign } from '@/hooks/useCampaigns';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Megaphone,
  Plus,
  Play,
  Pause,
  Trash2,
  Edit2,
  Send,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Users,
  Loader2,
  Eye,
} from 'lucide-react';
import { CampaignCreateDialog } from './CampaignCreateDialog';

const CampaignABTesting = lazy(() =>
  import('./CampaignABTesting').then((m) => ({ default: m.CampaignABTesting }))
);
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const statusConfig: Record<
  string,
  { label: string; color: string; icon: React.ComponentType<{ className?: string }> }
> = {
  draft: { label: 'Rascunho', color: 'bg-muted text-muted-foreground', icon: Edit2 },
  scheduled: { label: 'Agendada', color: 'bg-info/20 text-info', icon: Clock },
  sending: { label: 'Enviando', color: 'bg-warning/20 text-warning', icon: Send },
  completed: { label: 'Concluída', color: 'bg-success/20 text-success', icon: CheckCircle2 },
  cancelled: { label: 'Cancelada', color: 'bg-destructive/20 text-destructive', icon: XCircle },
  paused: { label: 'Pausada', color: 'bg-warning/20 text-warning', icon: Pause },
};

export function CampaignsView() {
  const { campaigns, isLoading, createCampaign, updateCampaign, deleteCampaign } = useCampaigns();
  const [showCreate, setShowCreate] = useState(false);
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);
  const [filter, setFilter] = useState<string>('all');
  const [search, setSearch] = useState('');

  const filtered = campaigns.filter((c) => {
    if (filter !== 'all' && c.status !== filter) return false;
    if (search && !c.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const stats = {
    total: campaigns.length,
    active: campaigns.filter((c) => c.status === 'sending').length,
    completed: campaigns.filter((c) => c.status === 'completed').length,
    totalSent: campaigns.reduce((sum, c) => sum + c.sent_count, 0),
  };

  const getProgress = (campaign: Campaign) => {
    if (campaign.total_contacts === 0) return 0;
    return Math.round((campaign.sent_count / campaign.total_contacts) * 100);
  };

  return (
    <div className="flex h-full flex-col space-y-4 p-4 md:space-y-6 md:p-6">
      {/* Header */}
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h1 className="flex items-center gap-2 font-display text-xl font-bold text-foreground md:text-2xl">
            <Megaphone className="h-6 w-6 text-primary md:h-7 md:w-7" />
            Campanhas
          </h1>
          <p className="mt-1 text-xs text-muted-foreground md:text-sm">
            Envio em massa e broadcast para contatos
          </p>
        </div>
        <Button onClick={() => setShowCreate(true)} className="w-full gap-2 sm:w-auto">
          <Plus className="h-4 w-4" /> Nova Campanha
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
        {[
          { label: 'Total', value: stats.total, icon: Megaphone, color: 'text-primary' },
          { label: 'Ativas', value: stats.active, icon: Play, color: 'text-warning' },
          {
            label: 'Concluídas',
            value: stats.completed,
            icon: CheckCircle2,
            color: 'text-success',
          },
          { label: 'Mensagens Enviadas', value: stats.totalSent, icon: Send, color: 'text-info' },
        ].map((stat) => (
          <Card key={stat.label} className="border-secondary/30">
            <CardContent className="flex items-center gap-3 p-4">
              <div className={cn('rounded-lg bg-secondary/20 p-2', stat.color)}>
                <stat.icon className="h-5 w-5" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{stat.value}</p>
                <p className="text-xs text-muted-foreground">{stat.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <Input
          aria-label="Buscar campanha"
          placeholder="Buscar campanha..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="draft">Rascunho</SelectItem>
            <SelectItem value="scheduled">Agendada</SelectItem>
            <SelectItem value="sending">Enviando</SelectItem>
            <SelectItem value="completed">Concluída</SelectItem>
            <SelectItem value="cancelled">Cancelada</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Campaign List */}
      <ScrollArea className="flex-1">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <Megaphone className="mb-4 h-12 w-12 opacity-30" />
            <p className="font-medium">Nenhuma campanha encontrada</p>
            <p className="text-sm">Crie sua primeira campanha de broadcast</p>
          </div>
        ) : (
          <div className="space-y-3">
            <AnimatePresence mode="popLayout">
              {filtered.map((campaign) => {
                const status = statusConfig[campaign.status] || statusConfig.draft;
                const StatusIcon = status.icon;
                const progress = getProgress(campaign);

                return (
                  <motion.div
                    key={campaign.id}
                    layout
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                  >
                    <Card
                      className="cursor-pointer border-secondary/30 transition-colors hover:border-primary/30"
                      onClick={() => setSelectedCampaign(campaign)}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between">
                          <div className="min-w-0 flex-1">
                            <div className="mb-1 flex items-center gap-2">
                              <h3 className="truncate font-semibold text-foreground">
                                {campaign.name}
                              </h3>
                              <Badge variant="outline" className={cn('text-xs', status.color)}>
                                <StatusIcon className="mr-1 h-3 w-3" />
                                {status.label}
                              </Badge>
                            </div>
                            {campaign.description && (
                              <p className="truncate text-sm text-muted-foreground">
                                {campaign.description}
                              </p>
                            )}
                            <div className="mt-2 flex items-center gap-4 text-xs text-muted-foreground">
                              <span className="flex items-center gap-1">
                                <Users className="h-3 w-3" /> {campaign.total_contacts} contatos
                              </span>
                              <span className="flex items-center gap-1">
                                <Send className="h-3 w-3" /> {campaign.sent_count} enviados
                              </span>
                              {campaign.failed_count > 0 && (
                                <span className="flex items-center gap-1 text-destructive">
                                  <AlertCircle className="h-3 w-3" /> {campaign.failed_count} erros
                                </span>
                              )}
                              <span>
                                {format(new Date(campaign.created_at), 'dd/MM/yyyy HH:mm', {
                                  locale: ptBR,
                                })}
                              </span>
                            </div>
                            {(campaign.status === 'sending' || campaign.status === 'completed') && (
                              <div className="mt-2 flex items-center gap-2">
                                <Progress value={progress} className="h-2 flex-1" />
                                <span className="text-xs text-muted-foreground">{progress}%</span>
                              </div>
                            )}
                          </div>
                          <div
                            className="ml-4 flex items-center gap-1"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {campaign.status === 'draft' && (
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8 text-success hover:text-success"
                                onClick={() =>
                                  updateCampaign.mutate({ id: campaign.id, status: 'sending' })
                                }
                                aria-label="Iniciar campanha"
                              >
                                <Play className="h-4 w-4" />
                              </Button>
                            )}
                            {campaign.status === 'sending' && (
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8 text-warning hover:text-warning"
                                onClick={() =>
                                  updateCampaign.mutate({ id: campaign.id, status: 'paused' })
                                }
                                aria-label="Pausar campanha"
                              >
                                <Pause className="h-4 w-4" />
                              </Button>
                            )}
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8 text-destructive hover:text-destructive"
                              onClick={() => deleteCampaign.mutate(campaign.id)}
                              aria-label="Excluir campanha"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}
      </ScrollArea>

      <CampaignCreateDialog
        open={showCreate}
        onOpenChange={setShowCreate}
        createCampaign={createCampaign}
      />

      {/* Detail Dialog */}
      <Dialog open={!!selectedCampaign} onOpenChange={() => setSelectedCampaign(null)}>
        <DialogContent className="sm:max-w-lg">
          {selectedCampaign && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Eye className="h-5 w-5 text-primary" />
                  {selectedCampaign.name}
                </DialogTitle>
                <DialogDescription>
                  {selectedCampaign.description || 'Sem descrição'}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: 'Total', value: selectedCampaign.total_contacts },
                    { label: 'Enviados', value: selectedCampaign.sent_count },
                    { label: 'Entregues', value: selectedCampaign.delivered_count },
                    { label: 'Lidos', value: selectedCampaign.read_count },
                    { label: 'Falhas', value: selectedCampaign.failed_count },
                    { label: 'Progresso', value: `${getProgress(selectedCampaign)}%` },
                  ].map((item) => (
                    <div key={item.label} className="rounded-lg bg-secondary/20 p-3">
                      <p className="text-xs text-muted-foreground">{item.label}</p>
                      <p className="text-lg font-bold text-foreground">{item.value}</p>
                    </div>
                  ))}
                </div>
                <div className="rounded-lg bg-secondary/10 p-3">
                  <p className="mb-1 text-xs text-muted-foreground">Mensagem</p>
                  <p className="whitespace-pre-wrap text-sm text-foreground">
                    {selectedCampaign.message_content}
                  </p>
                </div>
                <Suspense fallback={<div className="h-20 animate-pulse rounded-xl bg-muted/20" />}>
                  <CampaignABTesting campaignId={selectedCampaign.id} />
                </Suspense>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
