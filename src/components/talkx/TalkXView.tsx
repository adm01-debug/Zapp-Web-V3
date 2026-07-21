// @ts-nocheck
import { useState, useEffect, useMemo, useCallback } from 'react';
import { GenericEmptyState } from '@/components/ui/GenericEmptyState';
import { AnimatePresence } from 'framer-motion';
import {
  Zap,
  Plus,
  Play,
  Eye,
  MessageSquare,
  Send,
  BarChart3,
  CheckCircle2,
  Search,
  Filter,
  ShieldBan,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useTalkX, TalkXCampaign } from '@/hooks/useTalkX';
import { supabase } from '@/integrations/supabase/client';
import { TalkXCampaignEditor } from './TalkXCampaignEditor';
import { TalkXLiveMonitor } from './TalkXLiveMonitor';
import { TalkXCampaignCard } from './TalkXCampaignCard';
import { toast } from 'sonner';
import { TalkXBlacklist } from './TalkXBlacklist';
import { TalkXAnalytics } from './TalkXAnalytics';
import { SectionErrorBoundary } from '@/components/ui/section-error-boundary';

/** Full-page TalkX view for creating, monitoring, and managing mass-message campaigns and the contact blacklist. */
export default function TalkXView() {
  const {
    campaigns,
    isLoading,
    selectedCampaignId,
    setSelectedCampaignId,
    createCampaign,
    deleteCampaign,
    startCampaign,
    pauseCampaign,
    cancelCampaign,
    refetchCampaigns,
  } = useTalkX();

  const [showEditor, setShowEditor] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState<TalkXCampaign | null>(null);
  const [activeTab, setActiveTab] = useState('campaigns');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const filteredCampaigns = useMemo(() => {
    let result = campaigns;
    if (statusFilter !== 'all') {
      result = result.filter((c) => c.status === statusFilter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (c) => c.name.toLowerCase().includes(q) || c.message_template.toLowerCase().includes(q)
      );
    }
    return result;
  }, [campaigns, searchQuery, statusFilter]);

  // Keyboard shortcuts
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'n' && !e.ctrlKey && !e.metaKey && !showEditor) {
        e.preventDefault();
        handleNewCampaign();
      }
    },
    [showEditor]
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  useEffect(() => {
    const channel = supabase
      .channel('talkx-realtime')
      .on('postgres_changes', { event: '*', schema: 'zapp', table: 'talkx_campaigns' }, () => {
        refetchCampaigns();
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [refetchCampaigns]);

  const handleNewCampaign = () => {
    setEditingCampaign(null);
    setShowEditor(false);
    setTimeout(() => setShowEditor(true), 0);
  };

  const handleDuplicate = async (campaign: TalkXCampaign) => {
    try {
      await createCampaign.mutateAsync({
        name: `${campaign.name} (cópia)`,
        message_template: campaign.message_template,
        typing_delay_min: campaign.typing_delay_min,
        typing_delay_max: campaign.typing_delay_max,
        send_interval_min: campaign.send_interval_min,
        send_interval_max: campaign.send_interval_max,
        whatsapp_connection_id: campaign.whatsapp_connection_id,
        media_url: campaign.media_url,
        media_type: campaign.media_type,
      });
      toast.success('Campanha duplicada!');
    } catch {
      toast.error('Erro ao duplicar campanha');
    }
  };

  const handleView = (campaign: TalkXCampaign) => {
    setSelectedCampaignId(campaign.id);
    setActiveTab('monitor');
  };

  if (showEditor) {
    return (
      <TalkXCampaignEditor
        campaign={editingCampaign}
        onClose={() => {
          setShowEditor(false);
          refetchCampaigns();
        }}
      />
    );
  }

  const stats = [
    { label: 'Total', value: campaigns.length, icon: BarChart3, cls: 'text-primary' },
    {
      label: 'Ativas',
      value: campaigns.filter((c) => c.status === 'sending').length,
      icon: Play,
      cls: 'text-primary',
    },
    {
      label: 'Concluídas',
      value: campaigns.filter((c) => c.status === 'completed').length,
      icon: CheckCircle2,
      cls: 'text-accent-foreground',
    },
    {
      label: 'Enviadas',
      value: campaigns.reduce((a, c) => a + c.sent_count, 0),
      icon: Send,
      cls: 'text-primary',
    },
  ];

  return (
    <div className="flex h-full flex-col gap-4 overflow-auto p-4 md:gap-6 md:p-6">
      {/* Header */}
      <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
        <div className="flex items-center gap-3">
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl md:h-12 md:w-12"
            style={{ background: 'var(--gradient-primary)' }}
          >
            <Zap className="h-5 w-5 text-primary-foreground md:h-6 md:w-6" />
          </div>
          <div>
            <h1 className="font-display text-xl font-bold text-foreground md:text-2xl">Talk X</h1>
            <p className="text-xs text-muted-foreground md:text-sm">
              Marketing humanizado com simulação de digitação
            </p>
          </div>
        </div>
        <Button onClick={handleNewCampaign} className="w-full gap-2 sm:w-auto">
          <Plus className="h-4 w-4" />
          Nova Campanha
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {stats.map(({ label, value, icon: Icon, cls }) => (
          <Card key={label} className="border-border/50">
            <CardContent className="flex items-center gap-3 p-3 md:p-4">
              <Icon className={`h-5 w-5 ${cls} shrink-0`} />
              <div className="min-w-0">
                <p className="text-xl font-bold text-foreground md:text-2xl">{value}</p>
                <p className="truncate text-[10px] text-muted-foreground md:text-xs">{label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex min-h-0 flex-1 flex-col">
        <TabsList className="w-full sm:w-auto">
          <TabsTrigger value="campaigns" className="flex-1 gap-2 sm:flex-none">
            <MessageSquare className="h-4 w-4" />
            <span className="hidden sm:inline">Campanhas</span>
          </TabsTrigger>
          <TabsTrigger
            value="monitor"
            className="flex-1 gap-2 sm:flex-none"
            disabled={!selectedCampaignId}
          >
            <Eye className="h-4 w-4" />
            <span className="hidden sm:inline">Monitor</span>
          </TabsTrigger>
          <TabsTrigger value="blacklist" className="flex-1 gap-2 sm:flex-none">
            <ShieldBan className="h-4 w-4" />
            <span className="hidden sm:inline">Opt-out</span>
          </TabsTrigger>
          <TabsTrigger value="analytics" className="flex-1 gap-2 sm:flex-none">
            <BarChart3 className="h-4 w-4" />
            <span className="hidden sm:inline">Analytics</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="campaigns" className="mt-4 flex-1 space-y-4 overflow-auto">
          {/* Search & Filter Bar */}
          {campaigns.length > 0 && (
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  aria-label="Buscar campanhas"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Buscar campanhas... (N para nova)"
                  className="h-9 pl-9 text-sm"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="h-9 w-full sm:w-[160px]">
                  <Filter className="mr-1.5 h-3.5 w-3.5 text-muted-foreground" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos status</SelectItem>
                  <SelectItem value="draft">Rascunho</SelectItem>
                  <SelectItem value="sending">Enviando</SelectItem>
                  <SelectItem value="paused">Pausada</SelectItem>
                  <SelectItem value="completed">Concluída</SelectItem>
                  <SelectItem value="scheduled">Agendada</SelectItem>
                  <SelectItem value="cancelled">Cancelada</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {isLoading ? (
            <div className="grid gap-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Card key={i} className="animate-pulse">
                  <CardContent className="space-y-3 p-4 md:p-5">
                    <div className="flex items-center gap-2">
                      <div className="h-5 w-1/3 rounded bg-muted" />
                      <div className="h-5 w-16 rounded bg-muted" />
                    </div>
                    <div className="h-4 w-2/3 rounded bg-muted" />
                    <div className="flex gap-3">
                      <div className="h-3 w-12 rounded bg-muted" />
                      <div className="h-3 w-20 rounded bg-muted" />
                      <div className="h-3 w-16 rounded bg-muted" />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : campaigns.length === 0 ? (
            <Card className="border-2 border-dashed border-border/50">
              <CardContent className="flex flex-col items-center justify-center gap-4 px-6 py-12 md:py-16">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
                  <Zap className="h-8 w-8 text-primary" />
                </div>
                <div className="text-center">
                  <h3 className="text-lg font-semibold text-foreground">
                    Crie sua primeira campanha Talk X
                  </h3>
                  <p className="mt-1 max-w-md text-sm text-muted-foreground">
                    Envie mensagens personalizadas para vários contatos simulando digitação humana.
                    Use variáveis como {'{{nome}}'}, {'{{apelido}}'} e {'{{empresa}}'}.
                  </p>
                </div>
                <Button onClick={handleNewCampaign} className="mt-2 gap-2">
                  <Plus className="h-4 w-4" />
                  Criar Campanha
                </Button>
              </CardContent>
            </Card>
          ) : filteredCampaigns.length === 0 ? (
            <GenericEmptyState
              icon={Search}
              title="Sem campanhas"
              description="Nenhuma campanha encontrada com os filtros atuais"
              actionLabel="Limpar filtros"
              onAction={() => {
                setSearchQuery('');
                setStatusFilter('all');
              }}
              className="py-8"
            />
          ) : (
            <div className="grid gap-3">
              <AnimatePresence mode="popLayout">
                {filteredCampaigns.map((campaign) => (
                  <TalkXCampaignCard
                    key={campaign.id}
                    campaign={campaign}
                    onEdit={(c) => {
                      setEditingCampaign(c);
                      setShowEditor(true);
                    }}
                    onView={handleView}
                    onDuplicate={handleDuplicate}
                    onStart={startCampaign}
                    onPause={pauseCampaign}
                    onCancel={cancelCampaign}
                    onDelete={(id) => deleteCampaign.mutate(id)}
                  />
                ))}
              </AnimatePresence>
            </div>
          )}
        </TabsContent>

        <TabsContent value="monitor" className="mt-4 flex-1 overflow-auto">
          {selectedCampaignId ? (
            <SectionErrorBoundary sectionName="Monitor ao vivo">
              <TalkXLiveMonitor campaignId={selectedCampaignId} />
            </SectionErrorBoundary>
          ) : (
            <div className="flex items-center justify-center py-20 text-muted-foreground">
              Selecione uma campanha para monitorar
            </div>
          )}
        </TabsContent>

        <TabsContent value="blacklist" className="mt-4 flex-1 overflow-auto">
          <TalkXBlacklist />
        </TabsContent>

        <TabsContent value="analytics" className="mt-4 flex-1 overflow-auto">
          <SectionErrorBoundary sectionName="Analytics de campanhas">
            <TalkXAnalytics campaigns={campaigns} />
          </SectionErrorBoundary>
        </TabsContent>
      </Tabs>
    </div>
  );
}