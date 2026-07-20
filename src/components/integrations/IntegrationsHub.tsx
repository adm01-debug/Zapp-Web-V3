import { useState } from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Zap, Bug, ArrowRight, Building2, Wifi } from 'lucide-react';
import { N8nIntegrationView } from './N8nIntegrationView';
import { SentryIntegrationView } from './SentryIntegrationView';
import { BitrixIntegrationView } from './BitrixIntegrationView';
import { EvolutionApiIntegrationView } from './EvolutionApiIntegrationView';

type IntegrationView = 'hub' | 'n8n' | 'sentry' | 'bitrix24' | 'evolution-api';

const integrations = [
  {
    id: 'evolution-api' as const,
    name: 'Evolution API',
    description: 'Conexão com WhatsApp via Evolution API. Configure URL e chave de acesso.',
    icon: Wifi,
    color: 'bg-whatsapp',
    status: 'available' as const,
  },
  {
    id: 'n8n' as const,
    name: 'n8n',
    description: 'Automação de workflows via webhooks. Conecte eventos do sistema a fluxos n8n.',
    icon: Zap,
    color: 'bg-warning',
    status: 'available' as const,
  },
  {
    id: 'sentry' as const,
    name: 'Sentry',
    description: 'Monitoramento de erros, performance e session replays em tempo real.',
    icon: Bug,
    color: 'bg-[hsl(255_35%_27%)]',
    status: 'available' as const,
  },
  {
    id: 'bitrix24' as const,
    name: 'Bitrix24',
    description: 'CRM completo com sincronização de leads, contatos, negócios e telefonia VoIP.',
    icon: Building2,
    color: 'bg-[hsl(193_92%_58%)]',
    status: 'available' as const,
  },
];

/** Integrations Hub component for the integrations section. */
export function IntegrationsHub() {
  const [currentView, setCurrentView] = useState<IntegrationView>('hub');

  if (currentView === 'evolution-api') return (
    <div>
      <div className="p-4 pb-0">
        <Button variant="ghost" size="sm" onClick={() => setCurrentView('hub')}>← Voltar</Button>
      </div>
      <EvolutionApiIntegrationView />
    </div>
  );

  if (currentView === 'n8n') return (
    <div>
      <div className="p-4 pb-0">
        <Button variant="ghost" size="sm" onClick={() => setCurrentView('hub')}>← Voltar</Button>
      </div>
      <N8nIntegrationView />
    </div>
  );

  if (currentView === 'sentry') return (
    <div>
      <div className="p-4 pb-0">
        <Button variant="ghost" size="sm" onClick={() => setCurrentView('hub')}>← Voltar</Button>
      </div>
      <SentryIntegrationView />
    </div>
  );

  if (currentView === 'bitrix24') return (
    <div>
      <div className="p-4 pb-0">
        <Button variant="ghost" size="sm" onClick={() => setCurrentView('hub')}>← Voltar</Button>
      </div>
      <BitrixIntegrationView />
    </div>
  );

  return (
    <div className="space-y-6 p-6 max-w-4xl mx-auto">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="font-display text-2xl font-bold text-foreground">Integrações</h1>
        <p className="text-muted-foreground text-sm">Conecte ferramentas externas ao seu sistema</p>
      </motion.div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {integrations.map((integration, i) => (
          <motion.div key={integration.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }}>
            <Card className="border-secondary/30 hover:border-primary/30 transition-colors h-full">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-lg ${integration.color} flex items-center justify-center`}>
                      <integration.icon className="w-5 h-5 text-foreground" />
                    </div>
                    <div>
                      <CardTitle className="text-base">{integration.name}</CardTitle>
                    </div>
                  </div>
                  <Badge variant="outline" className="text-[10px]">
                    {integration.status === 'available' ? 'Disponível' : integration.status}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-xs mb-4">{integration.description}</CardDescription>
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full"
                  onClick={() => setCurrentView(integration.id)}
                >
                  Configurar <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
                </Button>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
