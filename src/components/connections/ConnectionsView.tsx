import { useState, useEffect, useRef } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { motion, AnimatePresence } from 'framer-motion';
import { StaggeredList, StaggeredItem } from '@/components/ui/motion';
import { FloatingParticles } from '@/components/dashboard/FloatingParticles';
import { AuroraBorealis } from '@/components/effects/AuroraBorealis';
import { EmptyState } from '@/components/ui/empty-state';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PhoneInput } from '@/components/ui/phone-input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Smartphone, Plus, QrCode, Loader2, CheckCircle2, XCircle, AlertCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { BusinessHoursDialog } from './BusinessHoursDialog';
import { ConnectionQueuesDialog } from './ConnectionQueuesDialog';
import { InstanceSettingsDialog } from './InstanceSettingsDialog';
import { IntegrationsPanel } from './IntegrationsPanel';
import { NumberReputationMonitor } from './NumberReputationMonitor';
import { ConnectionCard } from './ConnectionCard';
import { DegradedQuickActions } from './DegradedQuickActions';
import { QrCountdown } from './QrCountdown';
import { QrTtlBadge } from './QrTtlBadge';
import { QrAttemptHistory } from './QrAttemptHistory';
import { RefreshQrButton } from './RefreshQrButton';
import { IdempotencyMissBanner } from './IdempotencyMissBanner';
import { useConnectionsManager } from '@/features/connections';
import { useEvolutionAutoSync } from '@/hooks/useEvolutionAutoSync';
import { useEvolutionAutoReconnect } from '@/hooks/useEvolutionAutoReconnect';
import { evolutionInstanceName } from '@/lib/evolutionInstance';

export function ConnectionsView() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [showDiagnostic, setShowDiagnostic] = useState(false);

  const maskSensitiveData = (obj: unknown) => {
    if (!obj || typeof obj !== 'object') return null;
    const masked = { ...(obj as Record<string, unknown>) };
    const sensitiveKeys = ['apikey', 'key', 'token', 'password', 'secret', 'base64', 'qr', 'qrcode', 'authorization', 'session', 'cookie'];

    const maskValue = (o: unknown): unknown => {
      if (typeof o !== 'object' || o === null) return o;
      const record = o as Record<string, unknown>;
      for (const key in record) {
        if (sensitiveKeys.some(sk => key.toLowerCase().includes(sk))) {
          if (typeof record[key] === 'string') {
            record[key] = (record[key] as string).length > 10 ? `${(record[key] as string).substring(0, 4)}...${(record[key] as string).substring((record[key] as string).length - 4)}` : '****';
          } else {
            record[key] = '****';
          }
        } else if (typeof record[key] === 'object') {
          maskValue(record[key]);
        }
      }
      return record;
    };

    return maskValue(JSON.parse(JSON.stringify(masked))); // Deep clone before masking
  };
  const {
    connections, loading,
    isAddDialogOpen, setIsAddDialogOpen,
    qrCodeDialog, newConnection, setNewConnection, isCreating,
    syncingHistory, setSyncingHistory, evolutionLoading,
    handleShowQrCode, handleRefreshQrCode,
    handleCopyId, handleDisconnect, handleSetDefault, handleSetApiType, handleDelete, closeQrDialog,
    handleAddConnection,
  } = useConnectionsManager();

  // Auto-sync Evolution instances not yet in whatsapp_connections
  useEvolutionAutoSync();
  useEvolutionAutoReconnect();

  const [businessHoursDialog, setBusinessHoursDialog] = useState({ open: false, connectionId: '', connectionName: '' });
  const [queuesDialog, setQueuesDialog] = useState({ open: false, connectionId: '', connectionName: '' });
  const [settingsDialog, setSettingsDialog] = useState({ open: false, instanceName: '', connectionName: '' });
  const [integrationsDialog, setIntegrationsDialog] = useState({ open: false, instanceName: '', connectionName: '' });

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
      // Clean URL so refreshing doesn't reopen the dialog unexpectedly.
      const url = new URL(window.location.href);
      url.searchParams.delete('qr');
      url.searchParams.delete('view');
      window.history.replaceState({}, '', url.toString());
    }
  }, [connections, loading, handleShowQrCode]);

  const handleSyncHistory = async (connection: { id: string; instance_id?: string | null; instance_name?: string | null }) => {
    const evoName = evolutionInstanceName(connection);
    if (!evoName) { toast({ title: 'Conexão sem nome de instância', description: 'Configure um nome válido antes de sincronizar.', variant: 'destructive' }); return; }
    setSyncingHistory(connection.id);
    toast({ title: 'Sincronizando histórico...', description: 'Isso pode levar alguns minutos.' });
    try {
      const { data, error } = await supabase.functions.invoke('evolution-sync', {
        body: { action: 'sync-all-messages', instanceName: evoName },
      });
      if (error) throw error;
      toast({ title: 'Sincronização concluída!', description: `${data?.totalSynced || 0} mensagens sincronizadas de ${data?.totalContacts || 0} contatos.` });
    } catch (e: unknown) {
      toast({ title: 'Erro na sincronização', description: e instanceof Error ? e.message : 'Erro desconhecido', variant: 'destructive' });
    } finally { setSyncingHistory(null); }
  };

  return (
    <div className="p-6 space-y-6 overflow-y-auto h-full relative bg-background">
      <AuroraBorealis /><FloatingParticles />
      
      <PageHeader title="Conexões WhatsApp" subtitle="Gerencie suas conexões WhatsApp"
        breadcrumbs={[{ label: 'Configurações' }, { label: 'Conexões' }]}
        actions={
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild><Button className="bg-whatsapp hover:bg-whatsapp-dark text-primary-foreground"><Plus className="w-4 h-4 mr-2" />Conectar WhatsApp</Button></DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader><DialogTitle>Conectar WhatsApp</DialogTitle><DialogDescription>Configure os dados da conexão</DialogDescription></DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="space-y-2"><Label>Nome (identificação interna)</Label><Input aria-label="Nome da conexão (identificação interna)" placeholder="Ex: Vendas, SAC, Financeiro" value={newConnection.name} onChange={(e) => setNewConnection({ ...newConnection, name: e.target.value })} /></div>
                <div className="space-y-2"><Label>Número do celular</Label><PhoneInput value={newConnection.phone_number} onChange={(formatted) => setNewConnection({ ...newConnection, phone_number: formatted })} /></div>
                <div className="space-y-2">
                  <Label>Método de conexão</Label>
                  <Select
                    value={newConnection.api_type}
                    onValueChange={(v) => setNewConnection({ ...newConnection, api_type: v as 'evolution' | 'official'  /* ignore-audit: Select/Tabs value string narrowed to union; developer controls option values */})}
                  >
                    <SelectTrigger><SelectValue placeholder="Como deseja conectar?" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="evolution">
                        <div className="flex flex-col items-start">
                          <span className="font-medium">Não-oficial (Evolution API)</span>
                          <span className="text-xs text-muted-foreground">Conexão via QR Code (WhatsApp Web)</span>
                        </div>
                      </SelectItem>
                      <SelectItem value="official">
                        <div className="flex flex-col items-start">
                          <span className="font-medium">Oficial (WhatsApp Cloud API)</span>
                          <span className="text-xs text-muted-foreground">Autenticação via Meta — sem QR Code</span>
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  {newConnection.api_type === 'official' && (
                    <p className="text-xs text-muted-foreground">
                      A API oficial não usa QR Code. Após criar, configure as credenciais (Phone Number ID, Access Token) nas configurações da conexão.
                    </p>
                  )}
                </div>
                <div className="flex justify-end gap-2 pt-4">
                  <Button variant="outline" onClick={() => setIsAddDialogOpen(false)} disabled={isCreating}>Cancelar</Button>
                  <Button onClick={handleAddConnection} className="bg-whatsapp hover:bg-whatsapp-dark" disabled={isCreating}>
                    {isCreating ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Criando...</> : 'Adicionar'}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        }
      />

      {/* QR Code Dialog */}
      <Dialog open={qrCodeDialog.open} onOpenChange={(open) => !open && closeQrDialog()}>
        <DialogContent className="sm:max-w-md text-center">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-center gap-2" data-testid="qr-dialog-title">
              {qrCodeDialog.status === 'connected' ? <><CheckCircle2 className="w-5 h-5 text-status-online" />Conectado!</> :
               qrCodeDialog.status === 'error' ? <><XCircle className="w-5 h-5 text-destructive" />Erro</> :
               <><QrCode className="w-5 h-5" />Escanear QR Code - {qrCodeDialog.connectionName}</>}
            </DialogTitle>
          </DialogHeader>
          <div className="py-6 space-y-6">
            {qrCodeDialog.status === 'loading' && (
              <div className="w-64 h-64 mx-auto bg-muted rounded-xl flex flex-col items-center justify-center p-6 gap-4 text-center">
                <Loader2 className="w-12 h-12 animate-spin text-muted-foreground" />
                <div className="space-y-1.5">
                  <p className="text-sm font-medium animate-pulse" data-testid="reconnect-step-loading">Iniciando sessão...</p>
                  <p className="text-[10px] text-muted-foreground" data-testid="reconnect-step-label">Etapa 1 de 3: Autenticando com a Evolution API</p>
                </div>
              </div>
            )}
            {qrCodeDialog.status === 'pending' && qrCodeDialog.qrCode && (
              <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="w-64 h-64 mx-auto bg-background rounded-xl p-2 flex items-center justify-center" data-testid="qr-code-container">
                <img src={qrCodeDialog.qrCode.startsWith('data:') ? qrCodeDialog.qrCode : `data:image/png;base64,${qrCodeDialog.qrCode}`} alt="QR Code" className="w-full h-full object-contain" data-testid="qr-code-image" />
              </motion.div>
            )}
            {qrCodeDialog.status === 'connected' && (
              <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="w-64 h-64 mx-auto bg-status-online/10 rounded-xl flex flex-col items-center justify-center">
                <CheckCircle2 className="w-20 h-20 text-status-online mb-4" /><p className="text-lg font-medium text-status-online">WhatsApp Conectado!</p>
              </motion.div>
            )}
            {qrCodeDialog.status === 'error' && (
              <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="w-64 h-64 mx-auto bg-destructive/10 rounded-xl flex flex-col items-center justify-center p-4">
                <AlertCircle className="w-16 h-16 text-destructive mb-4" /><p role="alert" className="text-sm text-destructive text-center">{qrCodeDialog.errorMessage}</p>
              </motion.div>
            )}
            {(qrCodeDialog.status === 'pending' || qrCodeDialog.status === 'error' || qrCodeDialog.status === 'loading') && (
              <RefreshQrButton
                onRefresh={handleRefreshQrCode}
                loading={evolutionLoading || qrCodeDialog.status === 'loading'}
                status={qrCodeDialog.status}
                label={qrCodeDialog.status === 'pending' ? 'Gerar novo QR' : 'Gerar novo código'}
              />
            )}
            {qrCodeDialog.status === 'connected' && <Button onClick={closeQrDialog}>Fechar</Button>}

            <div className="pt-4 border-t border-muted/30">
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => setShowDiagnostic(!showDiagnostic)} 
                className="text-[10px] text-muted-foreground hover:text-primary gap-1"
              >
                {showDiagnostic ? 'Ocultar Diagnóstico' : 'Ver Diagnóstico Técnico'}
              </Button>
              
              <AnimatePresence>
                {showDiagnostic && (
                  <motion.div 
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden mt-2"
                  >
                    <div className="bg-muted/50 rounded-lg p-3 text-left space-y-2">
                      <p className="text-[10px] font-bold uppercase text-muted-foreground">Payload Evolution API (Mascarado)</p>
                      <pre className="text-[9px] font-mono bg-black/5 p-2 rounded overflow-x-auto max-h-40">
                        {JSON.stringify(maskSensitiveData(qrCodeDialog.rawPayload), null, 2)}
                      </pre>
                      <p className="text-[8px] text-muted-foreground italic">
                        * Dados sensíveis como chaves de API e strings Base64 foram ocultados por segurança.
                      </p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {qrCodeDialog.connectionId && (
              <QrAttemptHistory
                connectionId={qrCodeDialog.connectionId}
                refreshKey={`${qrCodeDialog.attemptId ?? 'none'}:${qrCodeDialog.status}`}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>

      <IdempotencyMissBanner />

      <div className="flex flex-col md:flex-row gap-4 items-end md:items-center justify-between mb-4">
        <div className="flex flex-1 gap-2 w-full md:max-w-md">
          <Input 
            placeholder="Buscar por nome ou ID..." 
            value={search} 
            onChange={(e) => setSearch(e.target.value)}
            className="bg-card border-secondary/20"
          />
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[180px] bg-card border-secondary/20">
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

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { label: 'Total de Conexões', value: connections.length, color: 'text-primary', sub: connections.length + ' instância' + (connections.length !== 1 ? 's' : '') + ' configurada' + (connections.length !== 1 ? 's' : '') },
          { label: 'Online', value: connections.filter(c => c.status === 'connected').length, color: 'text-primary', sub: connections.filter(c => c.status === 'connected').length > 0 ? 'Recebendo mensagens' : 'Nenhuma ativa' },
          { label: 'Ações necessárias', value: connections.filter(c => c.status !== 'connected').length, color: connections.filter(c => c.status !== 'connected').length > 0 ? 'text-destructive-foreground' : 'text-primary', sub: connections.filter(c => c.status !== 'connected').length > 0 ? 'Precisam reconectar' : 'Tudo funcionando ✔' },
        ].map((stat, i) => (
          <motion.div key={stat.label} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }}>
            <Card className="border border-secondary/20 bg-card "><CardContent className="p-4"><p className="text-sm text-muted-foreground">{stat.label}</p><p className={cn('text-3xl font-bold', stat.color)}>{stat.value}</p>{stat.sub && <p className='text-xs text-muted-foreground mt-1'>{stat.sub}</p>}</CardContent></Card>
          </motion.div>
        ))}
      </div>

      <DegradedQuickActions connections={connections} onShowQrCode={handleShowQrCode} />

      {/* Connections List */}
      {loading ? (
        <div className="flex items-center justify-center py-8 text-muted-foreground"><Loader2 className="w-6 h-6 animate-spin mr-2" />Carregando conexões...</div>
      ) : connections.length === 0 ? (
        <EmptyState icon={Smartphone} title="Conecte seu WhatsApp" description="Em poucos passos você estará recebendo e respondendo mensagens dos seus clientes." illustration="inbox" actionLabel="Conectar WhatsApp" onAction={() => setIsAddDialogOpen(true)} />
      ) : (
        <StaggeredList className="space-y-4">
          {connections
            .filter(c => {
              const matchesSearch = c.name.toLowerCase().includes(search.toLowerCase()) || 
                                   (c.instance_id || '').toLowerCase().includes(search.toLowerCase());
              const matchesStatus = statusFilter === 'all' || c.status === statusFilter;
              return matchesSearch && matchesStatus;
            })
            .map((connection) => (
            <StaggeredItem key={connection.id}>
              <ConnectionCard
                connection={connection} syncingHistory={syncingHistory}
                onShowQrCode={handleShowQrCode} onCopyId={handleCopyId} onDisconnect={handleDisconnect}
                onSetDefault={handleSetDefault} onSetApiType={handleSetApiType} onDelete={handleDelete}
                onBusinessHours={(id, name) => setBusinessHoursDialog({ open: true, connectionId: id, connectionName: name })}
                onQueues={(id, name) => setQueuesDialog({ open: true, connectionId: id, connectionName: name })}
                onSettings={(inst, name) => setSettingsDialog({ open: true, instanceName: inst, connectionName: name })}
                onIntegrations={(inst, name) => setIntegrationsDialog({ open: true, instanceName: inst, connectionName: name })}
                onSyncHistory={handleSyncHistory}
              />
            </StaggeredItem>
          ))}
        </StaggeredList>
      )}

      <BusinessHoursDialog open={businessHoursDialog.open} onOpenChange={(open) => setBusinessHoursDialog(prev => ({ ...prev, open }))} connectionId={businessHoursDialog.connectionId} connectionName={businessHoursDialog.connectionName} />
      <ConnectionQueuesDialog open={queuesDialog.open} onOpenChange={(open) => setQueuesDialog(prev => ({ ...prev, open }))} connectionId={queuesDialog.connectionId} connectionName={queuesDialog.connectionName} />
      <InstanceSettingsDialog open={settingsDialog.open} onOpenChange={(open) => setSettingsDialog(prev => ({ ...prev, open }))} instanceName={settingsDialog.instanceName} connectionName={settingsDialog.connectionName} connectionId={connections.find(c => c.instance_name === settingsDialog.instanceName || c.instance_id === settingsDialog.instanceName)?.id} />
      <IntegrationsPanel open={integrationsDialog.open} onOpenChange={(open) => setIntegrationsDialog(prev => ({ ...prev, open }))} instanceName={integrationsDialog.instanceName} connectionName={integrationsDialog.connectionName} />
      <NumberReputationMonitor />
    </div>
  );
}
