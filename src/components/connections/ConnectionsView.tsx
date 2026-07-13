import { useEffect, useRef } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { StaggeredList, StaggeredItem } from '@/components/ui/motion';
import { FloatingParticles } from '@/components/dashboard/FloatingParticles';
import { AuroraBorealis } from '@/components/effects/AuroraBorealis';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Smartphone, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { BusinessHoursDialog } from './BusinessHoursDialog';
import { ConnectionQueuesDialog } from './ConnectionQueuesDialog';
import { InstanceSettingsDialog } from './InstanceSettingsDialog';
import { IntegrationsPanel } from './IntegrationsPanel';
import { NumberReputationMonitor } from './NumberReputationMonitor';
import { ConnectionCard } from './ConnectionCard';
import { DegradedQuickActions } from './DegradedQuickActions';
import { IdempotencyMissBanner } from './IdempotencyMissBanner';
import { AddConnectionDialog } from './AddConnectionDialog';
import { QrCodeDialog } from './QrCodeDialog';
import { ConnectionsStats } from './ConnectionsStats';
import { useConnectionsManager, type WhatsAppConnection } from '@/features/connections';
import { useEvolutionAutoSync } from '@/hooks/useEvolutionAutoSync';
import { useEvolutionAutoReconnect } from '@/hooks/useEvolutionAutoReconnect';
import { evolutionInstanceName } from '@/lib/evolutionInstance';
import type { DegradedConnection } from './DegradedQuickActions';
import { useState } from 'react';

/** Type guard: distingue WhatsAppConnection (payload completo) de DegradedConnection (payload parcial). */
function isWhatsAppConnection(c: DegradedConnection | WhatsAppConnection): c is WhatsAppConnection {
  return (
    typeof (c as WhatsAppConnection).phone_number === 'string' &&
    typeof (c as WhatsAppConnection).status === 'string' &&
    typeof (c as WhatsAppConnection).is_default === 'boolean' &&
    'qr_code' in c
  );
}

export function ConnectionsView() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [businessHoursDialog, setBusinessHoursDialog] = useState({
    open: false,
    connectionId: '',
    connectionName: '',
  });
  const [queuesDialog, setQueuesDialog] = useState({
    open: false,
    connectionId: '',
    connectionName: '',
  });
  const [settingsDialog, setSettingsDialog] = useState({
    open: false,
    instanceName: '',
    connectionName: '',
  });
  const [integrationsDialog, setIntegrationsDialog] = useState({
    open: false,
    instanceName: '',
    connectionName: '',
  });

  const {
    connections,
    loading,
    isAddDialogOpen,
    setIsAddDialogOpen,
    qrCodeDialog,
    newConnection,
    setNewConnection,
    isCreating,
    syncingHistory,
    setSyncingHistory,
    evolutionLoading,
    handleShowQrCode,
    handleRefreshQrCode,
    handleCopyId,
    handleDisconnect,
    handleSetDefault,
    handleSetApiType,
    handleDelete,
    closeQrDialog,
    handleAddConnection,
  } = useConnectionsManager();

  useEvolutionAutoSync();
  useEvolutionAutoReconnect();

  // Deep-link: ?qr=<instance_id> auto-opens the QR dialog for that instance.
  const deepLinkHandledRef = useRef(false);
  useEffect(() => {
    if (deepLinkHandledRef.current || loading || connections.length === 0) return;
    const params = new URLSearchParams(window.location.search);
    const targetInstance = params.get('qr');
    if (!targetInstance) return;
    const conn = connections.find((c) => c.instance_id === targetInstance);
    if (conn) {
      deepLinkHandledRef.current = true;
      handleShowQrCode(conn);
      const url = new URL(window.location.href);
      url.searchParams.delete('qr');
      url.searchParams.delete('view');
      window.history.replaceState({}, '', url.toString());
    }
  }, [connections, loading, handleShowQrCode]);

  const handleSyncHistory = async (connection: {
    id: string;
    instance_id?: string | null;
    instance_name?: string | null;
  }) => {
    const evoName = evolutionInstanceName(connection);
    if (!evoName) {
      toast({
        title: 'Conexão sem nome de instância',
        description: 'Configure um nome válido antes de sincronizar.',
        variant: 'destructive',
      });
      return;
    }
    setSyncingHistory(connection.id);
    toast({ title: 'Sincronizando histórico...', description: 'Isso pode levar alguns minutos.' });
    try {
      const { data, error } = await supabase.functions.invoke('evolution-sync', {
        body: { action: 'sync-all-messages', instanceName: evoName },
      });
      if (error) throw error;
      toast({
        title: 'Sincronização concluída!',
        description: `${data?.totalSynced || 0} mensagens sincronizadas de ${data?.totalContacts || 0} contatos.`,
      });
    } catch (e: unknown) {
      toast({
        title: 'Erro na sincronização',
        description: e instanceof Error ? e.message : 'Erro desconhecido',
        variant: 'destructive',
      });
    } finally {
      setSyncingHistory(null);
    }
  };

  const filteredConnections = connections.filter((c) => {
    const matchesSearch =
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      (c.instance_id || '').toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === 'all' || c.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="relative h-full space-y-6 overflow-y-auto bg-background p-6">
      <AuroraBorealis />
      <FloatingParticles />

      <PageHeader
        title="Conexões WhatsApp"
        subtitle="Gerencie suas conexões WhatsApp"
        breadcrumbs={[{ label: 'Configurações' }, { label: 'Conexões' }]}
        actions={
          <AddConnectionDialog
            open={isAddDialogOpen}
            onOpenChange={setIsAddDialogOpen}
            newConnection={newConnection}
            onNewConnectionChange={setNewConnection}
            isCreating={isCreating}
            onAdd={handleAddConnection}
          />
        }
      />

      <QrCodeDialog
        open={qrCodeDialog.open}
        onClose={closeQrDialog}
        dialog={qrCodeDialog}
        evolutionLoading={evolutionLoading}
        onRefresh={handleRefreshQrCode}
      />

      <IdempotencyMissBanner />

      <div className="mb-4 flex flex-col items-end justify-between gap-4 md:flex-row md:items-center">
        <div className="flex w-full flex-1 gap-2 md:max-w-md">
          <Input
            placeholder="Buscar por nome ou ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="border-secondary/20 bg-card"
          />
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[180px] border-secondary/20 bg-card">
              <SelectValue placeholder="Filtrar status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os status</SelectItem>
              <SelectItem value="connected">Online</SelectItem>
              <SelectItem value="pending">Aguardando QR</SelectItem>
              <SelectItem value="disconnected">Desconectado</SelectItem>
              <SelectItem value="disconnecting">Desconectando</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <ConnectionsStats connections={connections} />

      <DegradedQuickActions
        connections={connections}
        onShowQrCode={(c) => {
          if (isWhatsAppConnection(c)) {
            void handleShowQrCode(c);
            return;
          }
          const full = connections.find((conn) => conn.id === c.id);
          if (full) {
            void handleShowQrCode(full);
            return;
          }
          toast({
            title: 'Conexão não encontrada',
            description: 'Não foi possível localizar a instância na lista atual.',
            variant: 'destructive',
          });
        }}
      />

      {loading ? (
        <div className="flex items-center justify-center py-8 text-muted-foreground">
          <Loader2 className="mr-2 h-6 w-6 animate-spin" />
          Carregando conexões...
        </div>
      ) : connections.length === 0 ? (
        <EmptyState
          icon={Smartphone}
          title="Conecte seu WhatsApp"
          description="Em poucos passos você estará recebendo e respondendo mensagens dos seus clientes."
          illustration="inbox"
          actionLabel="Conectar WhatsApp"
          onAction={() => setIsAddDialogOpen(true)}
        />
      ) : (
        <StaggeredList className="space-y-4">
          {filteredConnections.map((connection) => (
            <StaggeredItem key={connection.id}>
              <ConnectionCard
                connection={connection}
                syncingHistory={syncingHistory}
                onShowQrCode={handleShowQrCode}
                onCopyId={handleCopyId}
                onDisconnect={handleDisconnect}
                onSetDefault={handleSetDefault}
                onSetApiType={handleSetApiType}
                onDelete={handleDelete}
                onBusinessHours={(id, name) =>
                  setBusinessHoursDialog({ open: true, connectionId: id, connectionName: name })
                }
                onQueues={(id, name) =>
                  setQueuesDialog({ open: true, connectionId: id, connectionName: name })
                }
                onSettings={(inst, name) =>
                  setSettingsDialog({ open: true, instanceName: inst, connectionName: name })
                }
                onIntegrations={(inst, name) =>
                  setIntegrationsDialog({ open: true, instanceName: inst, connectionName: name })
                }
                onSyncHistory={handleSyncHistory}
              />
            </StaggeredItem>
          ))}
        </StaggeredList>
      )}

      <BusinessHoursDialog
        open={businessHoursDialog.open}
        onOpenChange={(open) => setBusinessHoursDialog((prev) => ({ ...prev, open }))}
        connectionId={businessHoursDialog.connectionId}
        connectionName={businessHoursDialog.connectionName}
      />
      <ConnectionQueuesDialog
        open={queuesDialog.open}
        onOpenChange={(open) => setQueuesDialog((prev) => ({ ...prev, open }))}
        connectionId={queuesDialog.connectionId}
        connectionName={queuesDialog.connectionName}
      />
      <InstanceSettingsDialog
        open={settingsDialog.open}
        onOpenChange={(open) => setSettingsDialog((prev) => ({ ...prev, open }))}
        instanceName={settingsDialog.instanceName}
        connectionName={settingsDialog.connectionName}
        connectionId={
          connections.find(
            (c) =>
              c.instance_name === settingsDialog.instanceName ||
              c.instance_id === settingsDialog.instanceName
          )?.id
        }
      />
      <IntegrationsPanel
        open={integrationsDialog.open}
        onOpenChange={(open) => setIntegrationsDialog((prev) => ({ ...prev, open }))}
        instanceName={integrationsDialog.instanceName}
        connectionName={integrationsDialog.connectionName}
      />
      <NumberReputationMonitor />
    </div>
  );
}