import { useState, useEffect } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import {
  Database,
  Globe,
  Webhook,
  Cpu,
  Plus,
  Settings,
  Save,
  Trash2,
  RefreshCw,
  AlertCircle,
  ExternalLink,
  ShieldCheck,
  Link,
  Loader2,
  Activity,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { updateRuntimeExternalConfig } from '@/integrations/supabase/externalClient';
import { safeClient } from '@/integrations/supabase/safeClient';
import { toast } from '@/hooks/use-toast';
import { runConnectionDiagnostics } from '@/lib/diagnostics';
import { getLogger } from '@/lib/logger';

const log = getLogger('Connections');
import { motion, AnimatePresence } from 'framer-motion';

const APP_ENV = (import.meta.env.VITE_APP_ENV || 'production') as
  'development' | 'staging' | 'production';

const getInitialConfig = () => {
  switch (APP_ENV) {
    case 'development':
      return {
        url:
          import.meta.env.VITE_DEV_EXTERNAL_SUPABASE_URL || 'https://supabase-dev.atomicabr.com.br',
        key: import.meta.env.VITE_DEV_EXTERNAL_SUPABASE_ANON_KEY || '',
      };
    case 'staging':
      return {
        url:
          import.meta.env.VITE_STAGING_EXTERNAL_SUPABASE_URL ||
          'https://supabase-staging.atomicabr.com.br',
        key: import.meta.env.VITE_STAGING_EXTERNAL_SUPABASE_ANON_KEY || '',
      };
    default:
      return {
        url: import.meta.env.VITE_EXTERNAL_SUPABASE_URL || 'https://supabase.atomicabr.com.br',
        // Anon key must come from the environment — no hardcoded JWT fallback (secret hygiene).
        key: import.meta.env.VITE_EXTERNAL_SUPABASE_ANON_KEY || '',
      };
  }
};

const initialConfig = getInitialConfig();
const DEFAULT_EXTERNAL_URL = initialConfig.url;
const DEFAULT_EXTERNAL_KEY = initialConfig.key;

export default function AdminConnectionsPage() {
  const [activeTab, setActiveTab] = useState('external-db');
  const [connections, setConnections] = useState<any[]>([]);
  const [_loading, setLoading] = useState(true);

  const [externalUrl, setExternalUrl] = useState(DEFAULT_EXTERNAL_URL);
  const [externalKey, setExternalKey] = useState(DEFAULT_EXTERNAL_KEY);
  const [editOpen, setEditOpen] = useState(false);
  const [draftUrl, setDraftUrl] = useState(DEFAULT_EXTERNAL_URL);
  const [draftKey, setDraftKey] = useState(DEFAULT_EXTERNAL_KEY);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);

  const checkAdminStatus = async () => {
    try {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError) throw authError;

      setCurrentUserId(user?.id ?? null);
      if (user?.id) {
        const { data: roles, error: rolesError } = await supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', user.id);

        if (rolesError) throw rolesError;

        const hasAccess = !!roles?.some((r: any) => r.role === 'admin' || r.role === 'dev');
        setIsAdmin(hasAccess);

        if (!hasAccess) {
          log.warn('User logged in without admin/dev permission', { email: user.email });
        }
      } else {
        setIsAdmin(false);
      }
    } catch (e: any) {
      log.error('Error checking roles or connection', e);
      setIsAdmin(false);
      toast({
        title: 'Erro de Conexão ou Acesso',
        description: `Não foi possível validar seu nível de acesso: ${e?.message ?? 'Banco indisponível'}.`,
        variant: 'destructive',
      });
    }
  };

  useEffect(() => {
    void fetchConnections();
    void checkAdminStatus();

    // Revalida ao focar na aba do navegador para garantir que o acesso ainda é válido
    const handleFocus = () => checkAdminStatus();
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, []);

  const handleTabChange = (value: string) => {
    setActiveTab(value);
    void checkAdminStatus();
    void fetchConnections();
  };

  async function fetchConnections() {
    setLoading(true);
    const { data, error } = await safeClient.from<any>('system_connections', (q) =>
      q.select('*').order('created_at', { ascending: false })
    );

    if (!error && data) {
      setConnections(data);
      const fatorX = data.find(
        (c: any) => c.provider === 'supabase_external' || c.name === 'FATOR X'
      );
      if (fatorX?.config?.url && fatorX?.config?.anon_key) {
        setExternalUrl(fatorX.config.url);
        setDraftUrl(fatorX.config.url);
        setExternalKey(fatorX.config.anon_key);
        setDraftKey(fatorX.config.anon_key);

        // Sincroniza o cliente em tempo de execução
        updateRuntimeExternalConfig(fatorX.config.url, fatorX.config.anon_key);
      }
    }
    setLoading(false);
  }

  function openEditor() {
    setDraftUrl(externalUrl);
    setDraftKey(externalKey);
    setEditOpen(true);
  }

  async function testConnection(url: string, key: string): Promise<boolean> {
    if (!url || !key) {
      toast({ title: 'Preencha URL e chave', variant: 'destructive' });
      return false;
    }
    setTesting(true);
    try {
      const res = await fetch(
        `${url.replace(/\/$/, '')}/rest/v1/?apikey=${encodeURIComponent(key)}`,
        {
          headers: { apikey: key, Authorization: `Bearer ${key}` },
        }
      );
      if (res.status < 500) {
        toast({ title: 'Conexão OK', description: `Resposta ${res.status} do endpoint.` });
        return true;
      }
      toast({
        title: 'Falha na conexão',
        description: `HTTP ${res.status}`,
        variant: 'destructive',
      });
      return false;
    } catch (e: any) {
      toast({
        title: 'Erro de rede',
        description: e?.message ?? 'falha desconhecida',
        variant: 'destructive',
      });
      return false;
    } finally {
      setTesting(false);
    }
  }

  async function saveCredentials() {
    if (!draftUrl || !draftKey) {
      toast({
        title: 'Campos obrigatórios',
        description: 'URL e Chave Anon não podem ficar vazios.',
        variant: 'destructive',
      });
      return;
    }

    setSaving(true);
    setSaveError(null);

    if (isAdmin === false) {
      const msg =
        'Você precisa ser admin ou dev para salvar conexões do sistema. Faça login com uma conta com esse nível de acesso.';
      setSaveError(msg);
      toast({ title: 'Sem permissão', description: msg, variant: 'destructive' });
      setSaving(false);
      return;
    }

    const payload: any = {
      name: 'FATOR X',
      provider: 'supabase_external',
      config: { url: draftUrl, anon_key: draftKey },
      is_active: true,
    };

    try {
      const existing: any = connections.find(
        (c: any) => c.provider === 'supabase_external' || c.name === 'FATOR X'
      );
      const insertPayload = currentUserId ? { ...payload, created_by: currentUserId } : payload;

      const { data, error } = await safeClient.from<any>('system_connections', (q) =>
        existing
          ? q.update(payload).eq('id', existing.id).select()
          : q.insert(insertPayload).select()
      );

      if (error) {
        const msg = `Falha na escrita [Provider: ${payload.provider}]: ${error.message}${error.code ? ` (Code: ${error.code})` : ''}`;
        setSaveError(msg);
        toast({ title: 'Erro ao salvar no Supabase', description: msg, variant: 'destructive' });
        return;
      }

      // Se data vier vazio (pode acontecer em RLS falha silenciosa em alguns drivers)
      if (!data || (Array.isArray(data) && data.length === 0)) {
        const msg = `A requisição foi processada, mas nenhum dado foi retornado. Verifique se as permissões de RLS permitem a inserção/atualização.`;
        setSaveError(msg);
        toast({ title: 'Escrita não confirmada', description: msg, variant: 'destructive' });
        return;
      }

      // Validação Pós-Save (SELECT para confirmar persistência no Self-Hosted)
      toast({
        title: 'Confirmando gravação...',
        description: 'Aguardando sincronização do banco.',
      });

      // Pequeno delay para garantir que o banco processou a transação (útil em setups com latência)
      await new Promise((resolve) => setTimeout(resolve, 800));

      const { data: verifyRows, error: verifyError } = await safeClient.from<any>(
        'system_connections',
        (q) =>
          q
            .select('id, updated_at')
            .eq('provider', 'supabase_external')
            .eq('name', 'FATOR X')
            .limit(1)
      );
      const verify = verifyRows?.[0] ?? null;

      if (verifyError || !verify) {
        const msg = `O SELECT de validação falhou: ${verifyError?.message ?? 'Registro não encontrado'}. Tente recarregar a página.`;
        setSaveError(msg);
        toast({ title: 'Confirmação falhou', description: msg, variant: 'destructive' });
        return;
      }

      setExternalUrl(draftUrl);
      setExternalKey(draftKey);
      setEditOpen(false);

      // Atualiza o cliente em tempo de execução imediatamente
      updateRuntimeExternalConfig(draftUrl, draftKey);

      toast({
        title: 'Credenciais salvas e validadas',
        description: `Configuração atualizada via runtime. Redirecionando para Status da Ponte...`,
      });

      setTimeout(() => {
        window.location.href = '/admin/bridge-status';
      }, 1500);

      await fetchConnections();
    } catch (e: any) {
      const msg = `[Exceção] ${e?.message ?? 'Falha desconhecida ao processar a requisição.'}`;
      setSaveError(msg);
      toast({ title: 'Erro inesperado', description: msg, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

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
          {/* External Databases (Supabase) */}
          <TabsContent value="external-db">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
            >
              <div className="grid gap-6 md:grid-cols-2">
                <Card className="overflow-hidden border-border/40 bg-card/40 shadow-xl shadow-primary/5 backdrop-blur-xl transition-all duration-500 hover:border-primary/30">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="flex items-center gap-2">
                        <Database className="h-5 w-5 text-primary" /> SUPABASE SELF HOSTED
                      </CardTitle>
                      <Badge
                        variant="outline"
                        className="border-primary/20 bg-primary/10 text-primary"
                      >
                        Configurado
                      </Badge>
                    </div>
                    <CardDescription>
                      Conecta ao banco VPS que armazena mensagens e contatos WhatsApp
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label>URL da Instância</Label>
                      <Input
                        value={editOpen ? draftUrl : externalUrl}
                        onChange={(e) => setDraftUrl(e.target.value)}
                        readOnly={!editOpen}
                        className="font-mono text-xs"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Chave Anon (Public)</Label>
                      <Input
                        type={editOpen ? 'text' : 'password'}
                        value={
                          editOpen
                            ? draftKey
                            : externalKey
                              ? '•'.repeat(Math.min(externalKey.length, 32))
                              : ''
                        }
                        onChange={(e) => setDraftKey(e.target.value)}
                        readOnly={!editOpen}
                        placeholder={editOpen ? 'eyJhbGciOi...' : ''}
                        className="font-mono text-xs"
                      />
                    </div>
                    {editOpen && (
                      <p className="text-[11px] text-muted-foreground">
                        Editando inline. Após salvar, atualize também os secrets{' '}
                        <code>VITE_EXTERNAL_SUPABASE_URL/KEY</code> e republique para o runtime
                        usar.
                      </p>
                    )}
                    {isAdmin === false && (
                      <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-600">
                        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                        <span>
                          Você não está autenticado como admin. As políticas de segurança bloqueiam
                          a escrita em <code>system_connections</code> para não-admins.
                        </span>
                      </div>
                    )}
                    {saveError && (
                      <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
                        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                        <div className="flex-1 break-all">
                          <strong className="mb-1 block">Falha ao salvar:</strong>
                          {saveError}
                        </div>
                      </div>
                    )}
                    <div className="flex gap-2 pt-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 gap-2"
                        onClick={() =>
                          testConnection(
                            editOpen ? draftUrl : externalUrl,
                            editOpen ? draftKey : externalKey
                          )
                        }
                        disabled={testing}
                      >
                        {testing ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <RefreshCw className="h-4 w-4" />
                        )}{' '}
                        Testar Conexão
                      </Button>
                      {!editOpen ? (
                        <Button size="sm" className="flex-1 gap-2" onClick={openEditor}>
                          <Settings className="h-4 w-4" /> Editar Credenciais
                        </Button>
                      ) : (
                        <>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="gap-2"
                            onClick={() => {
                              setEditOpen(false);
                              setDraftUrl(externalUrl);
                              setDraftKey(externalKey);
                            }}
                            disabled={saving}
                          >
                            Cancelar
                          </Button>
                          <Button
                            size="sm"
                            className="flex-1 gap-2"
                            onClick={saveCredentials}
                            disabled={saving || isAdmin === false}
                          >
                            {saving ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Save className="h-4 w-4" />
                            )}{' '}
                            Salvar
                          </Button>
                        </>
                      )}
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-dashed border-secondary/40 bg-secondary/5">
                  <CardHeader className="text-center">
                    <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                      <Plus className="h-6 w-6 text-muted-foreground" />
                    </div>
                    <CardTitle>Adicionar Novo Banco</CardTitle>
                    <CardDescription>
                      Conecte outro projeto Supabase ou PostgreSQL externo
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex justify-center pb-8">
                    <Button variant="secondary">Configurar Novo Supabase</Button>
                  </CardContent>
                </Card>
              </div>
            </motion.div>
          </TabsContent>

          {/* Integrations (Bitrix24, N8N) */}
          <TabsContent value="integrations">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="grid gap-6 md:grid-cols-2"
            >
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2">
                      <Globe className="h-5 w-5 text-blue-500" /> Bitrix24
                    </CardTitle>
                    <Badge variant="outline">Pendente</Badge>
                  </div>
                  <CardDescription>Sincronização bidirecional de Leads e Negócios</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Webhook URL (Inbound)</Label>
                    <Input placeholder="https://sua-empresa.bitrix24.com.br/rest/1/abc..." />
                  </div>
                  <div className="space-y-2">
                    <Label>Access Token / Key</Label>
                    <Input type="password" placeholder="Digite o token de acesso" />
                  </div>
                  <Button className="w-full gap-2">
                    <Save className="h-4 w-4" /> Salvar Integração Bitrix
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2">
                      <Link className="h-5 w-5 text-orange-500" /> n8n (Workflows)
                    </CardTitle>
                    <Badge variant="outline">Pendente</Badge>
                  </div>
                  <CardDescription>
                    Dispare automações complexas via webhooks do n8n
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>URL de Produção</Label>
                    <Input placeholder="https://n8n.sua-vps.com/webhook/..." />
                  </div>
                  <div className="space-y-2">
                    <Label>Auth Header (API Key)</Label>
                    <Input type="password" placeholder="Header X-N8N-API-KEY" />
                  </div>
                  <Button className="w-full gap-2" variant="secondary">
                    <Save className="h-4 w-4" /> Conectar n8n
                  </Button>
                </CardContent>
              </Card>
            </motion.div>
          </TabsContent>

          {/* Webhooks (Internal Lovable Apps) */}
          <TabsContent value="webhooks">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-6"
            >
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Webhook className="h-5 w-5 text-emerald-500" /> Webhooks Inter-App
                  </CardTitle>
                  <CardDescription>
                    Permita que outros sistemas criados no Lovable se conectem ao ZAPP Web
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="rounded-md border border-secondary/20">
                    <table className="w-full text-sm">
                      <thead className="border-b bg-muted/50">
                        <tr>
                          <th className="px-4 py-3 text-left">Nome do App</th>
                          <th className="px-4 py-3 text-left">Eventos</th>
                          <th className="px-4 py-3 text-left">Status</th>
                          <th className="px-4 py-3 text-right">Ações</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr className="border-b last:border-0">
                          <td className="px-4 py-3 font-medium">CRM-Integrator-App</td>
                          <td className="px-4 py-3">
                            <div className="flex gap-1">
                              <Badge variant="secondary" className="text-[10px]">
                                messages
                              </Badge>
                              <Badge variant="secondary" className="text-[10px]">
                                contacts
                              </Badge>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <Badge className="border-emerald-500/20 bg-emerald-500/10 text-emerald-600">
                              Ativo
                            </Badge>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex justify-end gap-2">
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <Settings className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-destructive"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  <Button className="mt-4 gap-2" variant="outline">
                    <Plus className="h-4 w-4" /> Gerar Novo Webhook de Entrada
                  </Button>
                </CardContent>
              </Card>
            </motion.div>
          </TabsContent>

          {/* MCP Claude */}
          <TabsContent value="mcp">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
            >
              <Card className="border-purple-500/20 bg-purple-500/5">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Cpu className="h-5 w-5 text-purple-500" /> MCP (Model Context Protocol) para
                    Claude
                  </CardTitle>
                  <CardDescription>
                    Permita que instâncias do Claude Desktop ou AI Gateway acessem dados do ZAPP Web
                    diretamente
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-4 rounded-lg border border-purple-500/20 bg-background p-4">
                    <div className="flex items-center justify-between">
                      <h4 className="flex items-center gap-2 font-semibold text-purple-500">
                        <ShieldCheck className="h-4 w-4" /> Endpoint do Servidor MCP
                      </h4>
                      <Badge variant="secondary">Experimental</Badge>
                    </div>
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      Este endpoint expõe ferramentas como `search_contacts`, `list_messages` e
                      `send_whatsapp` diretamente para modelos de linguagem usando o protocolo MCP
                      da Anthropic.
                    </p>
                    <div className="flex items-center gap-2">
                      <Input
                        readOnly
                        value={`${import.meta.env.VITE_SUPABASE_URL ?? ''}/functions/v1/mcp-server`}
                        className="font-mono text-[10px]"
                      />
                      <Button size="icon" variant="ghost">
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <Label>Habilitar Acesso MCP</Label>
                      <Switch defaultChecked />
                    </div>
                    <div className="space-y-2">
                      <Label>Token de Segurança MCP</Label>
                      <div className="flex gap-2">
                        <Input type="password" value="sk_mcp_zapp_********************" readOnly />
                        <Button variant="outline">Regerar</Button>
                      </div>
                    </div>
                  </div>

                  <div className="overflow-x-auto whitespace-pre rounded border border-secondary/20 bg-muted p-3 font-mono text-[10px]">
                    {`"mcpServers": {
  "zapp-web": {
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-http", "https://.../mcp-server"],
    "env": { "ZAPP_API_TOKEN": "SUA_CHAVE_AQUI" }
  }
}`}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          </TabsContent>
        </AnimatePresence>
      </Tabs>
    </div>
  );
}
