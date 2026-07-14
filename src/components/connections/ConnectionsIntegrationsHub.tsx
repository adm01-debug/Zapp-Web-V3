import { useUserRole } from '@/features/auth';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Link2, Plug, Database } from 'lucide-react';
import { ConnectionsView } from '@/components/connections/ConnectionsView';
import { IntegrationsHub } from '@/components/integrations/IntegrationsHub';
import { BridgeSupabaseView } from '@/components/connections/BridgeSupabaseView';
import { useHubTabNavigation } from '@/hooks/connections/useHubTabNavigation';
import { HubTab } from './types';

/**
 * Hub unificado de Conexões + Integrações.
 * Refatorado para seguir Clean Code: lógica de navegação extraída para hook.
 */
export function ConnectionsIntegrationsHub() {
  const { isDev } = useUserRole();
  const { tab, setTab } = useHubTabNavigation({ isDev });

  return (
    <div className="flex flex-col h-full">
      <Header tab={tab} onTabChange={(v) => setTab(v as HubTab /* ignore-audit: Tabs value string narrowed to HubTab; developer controls tab values */)} isDev={isDev} />
      <Content tab={tab} isDev={isDev} />
    </div>
  );
}

function Header({ tab, onTabChange, isDev }: { tab: HubTab; onTabChange: (v: string) => void; isDev: boolean }) {
  return (
    <div className="px-6 pt-6 pb-2 border-b border-border/40">
      <h1 className="font-display text-2xl font-bold text-foreground mb-1">
        Conexões & Integrações
      </h1>
      <p className="text-muted-foreground text-sm mb-4">
        Gerencie canais de WhatsApp, integrações externas e a ponte Supabase ↔ Evolution API.
      </p>

      <Tabs value={tab} onValueChange={onTabChange} className="w-full">
        <TabsList>
          <TabsTrigger value="connections" className="gap-2">
            <Link2 className="w-4 h-4" />
            Conexões
          </TabsTrigger>
          <TabsTrigger value="integrations" className="gap-2">
            <Plug className="w-4 h-4" />
            Integrações
          </TabsTrigger>
          {isDev && (
            <TabsTrigger value="bridge" className="gap-2">
              <Database className="w-4 h-4" />
              Ponte Supabase
            </TabsTrigger>
          )}
        </TabsList>
      </Tabs>
    </div>
  );
}

function Content({ tab, isDev }: { tab: string; isDev: boolean }) {
  return (
    <div className="flex-1 overflow-auto">
      {tab === 'connections' && <ConnectionsView />}
      {tab === 'integrations' && <IntegrationsHub />}
      {tab === 'bridge' && isDev && <BridgeSupabaseView />}
      {tab === 'bridge' && !isDev && (
        <div className="p-8 text-center text-muted-foreground">
          Acesso restrito a desenvolvedores.
        </div>
      )}
    </div>
  );
}
