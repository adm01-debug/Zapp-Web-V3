import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Database, Globe, Webhook, Cpu, Plus, Activity } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { runConnectionDiagnostics } from '@/lib/diagnostics';
import { AnimatePresence } from 'framer-motion';
import { useConnections } from './useConnections';
import { ConnectionsExternalDbTab } from './connections/ConnectionsExternalDbTab';
import { ConnectionsIntegrationsTab } from './connections/ConnectionsIntegrationsTab';
import { ConnectionsWebhooksTab } from './connections/ConnectionsWebhooksTab';
import { ConnectionsMcpTab } from './connections/ConnectionsMcpTab';

/** Admin Connections Page. */
export default function AdminConnectionsPage() {
  const {
    activeTab,
    handleTabChange,
    externalUrl,
    externalKey,
    editOpen,
    draftUrl,
    setDraftUrl,
    draftKey,
    setDraftKey,
    testing,
    saving,
    saveError,
    isAdmin,
    openEditor,
    cancelEdit,
    testConnection,
    saveCredentials,
  } = useConnections();

  return (
    <div className="min-h-full space-y-8 bg-background p-8 duration-1000 animate-in fade-in">
      <PageHeader
        title="Módulo de Conexão"
        subtitle="Gerencie integrações externas, webhooks e conectores inteligentes"
        breadcrumbs={[{ label: 'Admin' }, { label: 'Conexão' }]}
        actions={
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={async () => {
                try {
                  toast({
                    title: 'Iniciando Diagnóstico',
                    description: 'Verificando fluxo completo...',
                  });
                  const res = await runConnectionDiagnostics();
                  const fails = (
                    res.steps as Array<{ step: string; status: string; details: unknown }>
                  ).filter((s) => s.status === 'fail');
                  if (fails.length > 0) {
                    toast({
                      title: 'Falha no Diagnóstico',
                      description: `${fails.length} etapa(s) falharam. Verifique o console.`,
                      variant: 'destructive',
                    });
                  } else {
                    toast({ title: 'Diagnóstico OK', description: 'Fluxo validado com sucesso.' });
                  }
                } catch {
                  toast({
                    title: 'Erro no Diagnóstico',
                    description: 'Não foi possível executar o diagnóstico.',
                    variant: 'destructive',
                  });
                }
              }}
              className="gap-2"
            >
              <Activity className="h-4 w-4" /> Diagnóstico
            </Button>
            <Button className="bg-primary hover:bg-primary/90">
              <Plus className="mr-2 h-4 w-4" /> Nova Conexão
            </Button>
          </div>
        }
      />

      <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
        <TabsList className="mb-8 h-auto w-full flex-wrap gap-1 rounded-2xl border border-border/20 bg-muted/30 p-1.5 backdrop-blur-md md:w-fit">
          <TabsTrigger
            value="external-db"
            className="gap-2 rounded-xl px-6 py-2.5 transition-all duration-300 data-[state=active]:bg-background data-[state=active]:text-primary data-[state=active]:shadow-lg"
          >
            <Database className="h-4 w-4" /> Banco Externo
          </TabsTrigger>
          <TabsTrigger
            value="integrations"
            className="gap-2 rounded-xl px-6 py-2.5 transition-all duration-300 data-[state=active]:bg-background data-[state=active]:text-primary data-[state=active]:shadow-lg"
          >
            <Globe className="h-4 w-4" /> Integrações
          </TabsTrigger>
          <TabsTrigger
            value="webhooks"
            className="gap-2 rounded-xl px-6 py-2.5 transition-all duration-300 data-[state=active]:bg-background data-[state=active]:text-primary data-[state=active]:shadow-lg"
          >
            <Webhook className="h-4 w-4" /> Webhooks
          </TabsTrigger>
          <TabsTrigger
            value="mcp"
            className="gap-2 rounded-xl px-6 py-2.5 transition-all duration-300 data-[state=active]:bg-background data-[state=active]:text-primary data-[state=active]:shadow-lg"
          >
            <Cpu className="h-4 w-4" /> MCP
          </TabsTrigger>
        </TabsList>

        <AnimatePresence mode="wait">
          <TabsContent value="external-db">
            <ConnectionsExternalDbTab
              editOpen={editOpen}
              draftUrl={draftUrl}
              setDraftUrl={setDraftUrl}
              draftKey={draftKey}
              setDraftKey={setDraftKey}
              testing={testing}
              saving={saving}
              saveError={saveError}
              isAdmin={isAdmin}
              openEditor={openEditor}
              cancelEdit={cancelEdit}
              testConnection={testConnection}
              saveCredentials={saveCredentials}
              externalUrl={externalUrl}
              externalKey={externalKey}
            />
          </TabsContent>

          <TabsContent value="integrations">
            <ConnectionsIntegrationsTab />
          </TabsContent>

          <TabsContent value="webhooks">
            <ConnectionsWebhooksTab />
          </TabsContent>

          <TabsContent value="mcp">
            <ConnectionsMcpTab />
          </TabsContent>
        </AnimatePresence>
      </Tabs>
    </div>
  );
}
