import { useState, useEffect, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useEvolutionApi } from '@/hooks/useEvolutionApi';
import { toast } from 'sonner';
import { Bot, Brain, Workflow, MessageSquare, Zap, Boxes } from 'lucide-react';

import { getLogger } from '@/lib/logger';
import { IntegrationForm } from './integrationsPanelParts';
import {
  typebotFields,
  openaiFields,
  difyFields,
  flowiseFields,
  chatwootFields,
  evolutionBotFields,
} from './integrationsPanelFields';

const log = getLogger('IntegrationsPanel');

interface IntegrationsPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  instanceName: string;
  connectionName: string;
}

export function IntegrationsPanel({
  open,
  onOpenChange,
  instanceName,
  connectionName,
}: IntegrationsPanelProps) {
  const api = useEvolutionApi();

  const [typebot, setTypebot] = useState<Record<string, unknown>>({ enabled: false });
  const [openai, setOpenai] = useState<Record<string, unknown>>({ enabled: false });
  const [dify, setDify] = useState<Record<string, unknown>>({ enabled: false });
  const [flowise, setFlowise] = useState<Record<string, unknown>>({ enabled: false });
  const [chatwoot, setChatwoot] = useState<Record<string, unknown>>({ enabled: false });
  const [evolutionBot, setEvolutionBot] = useState<Record<string, unknown>>({ enabled: false });

  useEffect(() => {
    if (open && instanceName) {
      let cancelled = false;
      void loadAll(() => cancelled);
      return () => {
        cancelled = true;
      };
    }
    return undefined;
  }, [open, instanceName]);

  const loadAll = async (isCancelled: () => boolean = () => false) => {
    const abortController = new AbortController();
    const load = async (
      getter: (n: string, signal?: AbortSignal) => Promise<unknown>,
      setter: (v: Record<string, unknown>) => void
    ) => {
      try {
        const data = await getter(instanceName, abortController.signal);
        if (isCancelled()) return;
        if (data && typeof data === 'object')
          setter({ enabled: true, ...(data as Record<string, unknown>) }); // ignore-audit: narrows Supabase query result to local interface
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return;
        log.error('Unexpected error in IntegrationsPanel:', err);
      }
    };
    try {
      await Promise.allSettled([
        load(api.getTypebot as any, setTypebot),
        load(api.getOpenAI as any, setOpenai),
        load(api.getDify as any, setDify),
        load(api.getFlowise as any, setFlowise),
        load(api.getChatwoot as any, setChatwoot),
        load(api.getEvolutionBot as any, setEvolutionBot),
      ]);
    } finally {
      if (isCancelled()) abortController.abort();
    }
  };

  const handleSaveTypebot = useCallback(async () => {
    try {
      await api.setTypebot({ instanceName, ...typebot } as Parameters<typeof api.setTypebot>[0]);
      toast.success('Typebot configurado!');
    } catch {
      toast.error('Erro');
    }
  }, [api, instanceName, typebot]);

  const handleDeleteTypebot = useCallback(async () => {
    try {
      await api.deleteTypebot(instanceName);
      setTypebot({ enabled: false });
      toast.success('Typebot removido');
    } catch {
      toast.error('Erro');
    }
  }, [api, instanceName]);

  const handleSaveOpenAI = useCallback(async () => {
    try {
      await api.setOpenAI({ instanceName, ...openai } as Parameters<typeof api.setOpenAI>[0]);
      toast.success('OpenAI configurado!');
    } catch {
      toast.error('Erro');
    }
  }, [api, instanceName, openai]);

  const handleDeleteOpenAI = useCallback(async () => {
    try {
      await api.deleteOpenAI(instanceName);
      setOpenai({ enabled: false });
      toast.success('OpenAI removido');
    } catch {
      toast.error('Erro');
    }
  }, [api, instanceName]);

  const handleSaveDify = useCallback(async () => {
    try {
      await api.setDify({ instanceName, ...dify } as Parameters<typeof api.setDify>[0]);
      toast.success('Dify configurado!');
    } catch {
      toast.error('Erro');
    }
  }, [api, instanceName, dify]);

  const handleDeleteDify = useCallback(async () => {
    try {
      await api.deleteDify(instanceName);
      setDify({ enabled: false });
      toast.success('Dify removido');
    } catch {
      toast.error('Erro');
    }
  }, [api, instanceName]);

  const handleSaveFlowise = useCallback(async () => {
    try {
      await api.setFlowise({ instanceName, ...flowise } as Parameters<typeof api.setFlowise>[0]);
      toast.success('Flowise configurado!');
    } catch {
      toast.error('Erro');
    }
  }, [api, instanceName, flowise]);

  const handleDeleteFlowise = useCallback(async () => {
    try {
      await api.deleteFlowise(instanceName);
      setFlowise({ enabled: false });
      toast.success('Flowise removido');
    } catch {
      toast.error('Erro');
    }
  }, [api, instanceName]);

  const handleSaveChatwoot = useCallback(async () => {
    try {
      await api.setChatwoot({ instanceName, ...chatwoot } as Parameters<typeof api.setChatwoot>[0]);
      toast.success('Chatwoot configurado!');
    } catch {
      toast.error('Erro');
    }
  }, [api, instanceName, chatwoot]);

  const handleDeleteChatwoot = useCallback(async () => {
    try {
      await api.deleteChatwoot(instanceName);
      setChatwoot({ enabled: false });
      toast.success('Chatwoot removido');
    } catch {
      toast.error('Erro');
    }
  }, [api, instanceName]);

  const handleSaveEvolutionBot = useCallback(async () => {
    try {
      await api.setEvolutionBot({ instanceName, ...evolutionBot } as Parameters<
        typeof api.setEvolutionBot
      >[0]);
      toast.success('Evolution Bot configurado!');
    } catch {
      toast.error('Erro');
    }
  }, [api, instanceName, evolutionBot]);

  const handleDeleteEvolutionBot = useCallback(async () => {
    try {
      await api.deleteEvolutionBot(instanceName);
      setEvolutionBot({ enabled: false });
      toast.success('Evolution Bot removido');
    } catch {
      toast.error('Erro');
    }
  }, [api, instanceName]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Boxes className="h-5 w-5 text-primary" />
            Integrações — {connectionName}
          </DialogTitle>
          <DialogDescription>
            Configure integrações de IA e automação para esta instância
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="typebot">
          <TabsList className="grid w-full grid-cols-3 lg:grid-cols-6">
            <TabsTrigger value="typebot" className="text-xs">
              <Bot className="mr-1 h-3 w-3" /> Typebot
            </TabsTrigger>
            <TabsTrigger value="openai" className="text-xs">
              <Brain className="mr-1 h-3 w-3" /> OpenAI
            </TabsTrigger>
            <TabsTrigger value="dify" className="text-xs">
              <Workflow className="mr-1 h-3 w-3" /> Dify
            </TabsTrigger>
            <TabsTrigger value="flowise" className="text-xs">
              <Zap className="mr-1 h-3 w-3" /> Flowise
            </TabsTrigger>
            <TabsTrigger value="chatwoot" className="text-xs">
              <MessageSquare className="mr-1 h-3 w-3" /> Chatwoot
            </TabsTrigger>
            <TabsTrigger value="evbot" className="text-xs">
              <Bot className="mr-1 h-3 w-3" /> Ev.Bot
            </TabsTrigger>
          </TabsList>

          <TabsContent value="typebot" className="mt-4">
            <IntegrationForm
              title="Typebot"
              icon={Bot}
              fields={typebotFields}
              values={typebot}
              onChange={(k, v) => setTypebot((prev) => ({ ...prev, [k]: v }))}
              onSave={handleSaveTypebot}
              onDelete={handleDeleteTypebot}
              isLoading={api.isLoading}
            />
          </TabsContent>

          <TabsContent value="openai" className="mt-4">
            <IntegrationForm
              title="OpenAI"
              icon={Brain}
              fields={openaiFields}
              values={openai}
              onChange={(k, v) => setOpenai((prev) => ({ ...prev, [k]: v }))}
              onSave={handleSaveOpenAI}
              onDelete={handleDeleteOpenAI}
              isLoading={api.isLoading}
            />
          </TabsContent>

          <TabsContent value="dify" className="mt-4">
            <IntegrationForm
              title="Dify"
              icon={Workflow}
              fields={difyFields}
              values={dify}
              onChange={(k, v) => setDify((prev) => ({ ...prev, [k]: v }))}
              onSave={handleSaveDify}
              onDelete={handleDeleteDify}
              isLoading={api.isLoading}
            />
          </TabsContent>

          <TabsContent value="flowise" className="mt-4">
            <IntegrationForm
              title="Flowise"
              icon={Zap}
              fields={flowiseFields}
              values={flowise}
              onChange={(k, v) => setFlowise((prev) => ({ ...prev, [k]: v }))}
              onSave={handleSaveFlowise}
              onDelete={handleDeleteFlowise}
              isLoading={api.isLoading}
            />
          </TabsContent>

          <TabsContent value="chatwoot" className="mt-4">
            <IntegrationForm
              title="Chatwoot"
              icon={MessageSquare}
              fields={chatwootFields}
              values={chatwoot}
              onChange={(k, v) => setChatwoot((prev) => ({ ...prev, [k]: v }))}
              onSave={handleSaveChatwoot}
              onDelete={handleDeleteChatwoot}
              isLoading={api.isLoading}
            />
          </TabsContent>

          <TabsContent value="evbot" className="mt-4">
            <IntegrationForm
              title="Evolution Bot"
              icon={Bot}
              fields={evolutionBotFields}
              values={evolutionBot}
              onChange={(k, v) => setEvolutionBot((prev) => ({ ...prev, [k]: v }))}
              onSave={handleSaveEvolutionBot}
              onDelete={handleDeleteEvolutionBot}
              isLoading={api.isLoading}
            />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
