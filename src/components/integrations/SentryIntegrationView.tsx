import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { Bug, Loader2, Lock, RefreshCw, Send, Wifi, WifiOff } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { FunctionsHttpError } from '@supabase/supabase-js';

/**
 * Sentry Integration View — contrato REAL (G3).
 *
 * Sem mockErrors: o estado vem de `zapp.sentry_config` via edge
 * `zapp-sentry-sync` (único caminho de leitura/escrita). A UI é honesta:
 *   - Badge Ativo/Inativo/Indisponível conforme o estado real persistido.
 *   - DSN nunca aparece em claro (edge devolve `dsn_masked`).
 *   - Escrita e evento de teste exigem admin/supervisor (403 honesto caso
 *     contrário). Issues/eventos são vistos no Sentry (sentry.io) — esta tela
 *     apenas configura o monitoramento.
 */

interface SentryPublicConfig {
  enabled: boolean;
  dsn_configured: boolean;
  dsn_masked: string;
  environment: string;
  traces_sample_rate: number;
  replays_session_sample_rate: number;
  replays_on_error_sample_rate: number;
  last_test_sent_at: string | null;
  updated_at: string | null;
  updated_by: string | null;
  can_manage: boolean;
}

interface SentrySyncResponse {
  ok: boolean;
  config?: SentryPublicConfig;
  saved?: boolean;
  test?: { sent: boolean; event_id?: string };
}

type LoadState = 'loading' | 'ready' | 'error';

const formatDate = (iso: string | null): string =>
  iso ? new Date(iso).toLocaleString('pt-BR') : '—';

/** Sentry Integration View component for the integrations section. */
export function SentryIntegrationView() {
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [config, setConfig] = useState<SentryPublicConfig | null>(null);
  const [dsnInput, setDsnInput] = useState('');
  const [environment, setEnvironment] = useState('production');
  const [enabled, setEnabled] = useState(false);
  const [tracesRate, setTracesRate] = useState('0.1');
  const [replaysSessionRate, setReplaysSessionRate] = useState('0.01');
  const [replaysOnErrorRate, setReplaysOnErrorRate] = useState('1');
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  const applyConfig = useCallback((cfg: SentryPublicConfig) => {
    setConfig(cfg);
    setDsnInput('');
    setEnvironment(cfg.environment);
    setEnabled(cfg.enabled);
    setTracesRate(String(cfg.traces_sample_rate));
    setReplaysSessionRate(String(cfg.replays_session_sample_rate));
    setReplaysOnErrorRate(String(cfg.replays_on_error_sample_rate));
    setLoadState('ready');
  }, []);

  const loadConfig = useCallback(async () => {
    setLoadState('loading');
    const { data, error } = await supabase.functions.invoke<SentrySyncResponse>('zapp-sentry-sync');
    if (error || !data?.ok || !data.config) {
      setLoadState('error');
      return;
    }
    applyConfig(data.config);
  }, [applyConfig]);

  useEffect(() => {
    void loadConfig();
  }, [loadConfig]);

  const canManage = config?.can_manage ?? false;
  const isActive = Boolean(config?.enabled && config?.dsn_configured);

  const handleSave = async () => {
    if (!canManage) {
      toast.error('Sem permissão: apenas administradores podem alterar a configuração do Sentry');
      return;
    }
    setSaving(true);
    try {
      // DSN vazio no input = manter o atual (não apagar por engano).
      const payload: Record<string, unknown> = {
        enabled,
        environment,
        traces_sample_rate: Number(tracesRate),
        replays_session_sample_rate: Number(replaysSessionRate),
        replays_on_error_sample_rate: Number(replaysOnErrorRate),
      };
      if (dsnInput.trim() !== '') {
        payload.dsn = dsnInput.trim();
      }

      const { data, error } = await supabase.functions.invoke<SentrySyncResponse>(
        'zapp-sentry-sync',
        { body: payload },
      );
      if (error) {
        const status = error instanceof FunctionsHttpError ? error.context?.status ?? 0 : 0;
        if (status === 403) {
          toast.error('Sem permissão: apenas administradores podem alterar a configuração do Sentry');
        } else if (status === 400 || status === 422) {
          toast.error('Configuração inválida: verifique o DSN e os valores (0–1)');
        } else {
          toast.error('Falha ao salvar: edge zapp-sentry-sync indisponível');
        }
        return;
      }
      if (data?.config) applyConfig(data.config);
      toast.success('Configuração do Sentry salva');
    } finally {
      setSaving(false);
    }
  };

  const handleClearDsn = async () => {
    if (!canManage) return;
    setSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke<SentrySyncResponse>(
        'zapp-sentry-sync',
        { body: { dsn: '', enabled: false } },
      );
      if (error) {
        toast.error('Falha ao desativar: edge zapp-sentry-sync indisponível');
        return;
      }
      if (data?.config) applyConfig(data.config);
      toast.success('Sentry desativado (DSN removido)');
    } finally {
      setSaving(false);
    }
  };

  const handleTestEvent = async () => {
    if (!canManage) {
      toast.error('Sem permissão: apenas administradores podem enviar evento de teste');
      return;
    }
    setTesting(true);
    try {
      const { data, error } = await supabase.functions.invoke<SentrySyncResponse>(
        'zapp-sentry-sync',
        { body: { action: 'test' } },
      );
      if (error || !data?.ok) {
        toast.error('Falha ao enviar evento de teste (ingest inacessível ou DSN inválido)');
        return;
      }
      if (data.test?.sent) {
        toast.success(`Evento de teste enviado: ${data.test.event_id ?? ''}`);
      }
      if (data.config) applyConfig(data.config);
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="space-y-6 p-6 max-w-4xl mx-auto">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-[hsl(255_35%_27%)]">
            <Bug className="w-5 h-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold text-foreground">Sentry Monitoring</h1>
            <p className="text-muted-foreground text-sm">
              Configuração real do monitoramento de erros — estado persistido no banco
            </p>
          </div>
          <Badge
            variant={loadState === 'error' ? 'destructive' : isActive ? 'default' : 'secondary'}
            className="ml-auto"
          >
            {loadState === 'loading'
              ? 'Carregando…'
              : loadState === 'error'
                ? 'Indisponível'
                : isActive
                  ? 'Ativo'
                  : 'Inativo'}
          </Badge>
        </div>
      </motion.div>

      {loadState === 'loading' && (
        <Card className="border-secondary/30">
          <CardContent className="py-10 flex items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin" />
            Lendo configuração via zapp-sentry-sync…
          </CardContent>
        </Card>
      )}

      {loadState === 'error' && (
        <Card className="border-secondary/30">
          <CardContent className="py-10 text-center space-y-3">
            <WifiOff className="w-8 h-8 mx-auto text-destructive" />
            <p className="text-sm text-muted-foreground">
              Não foi possível ler a configuração (edge <code>zapp-sentry-sync</code> indisponível).
            </p>
            <Button variant="outline" size="sm" onClick={() => void loadConfig()}>
              <RefreshCw className="w-3 h-3 mr-2" /> Tentar novamente
            </Button>
          </CardContent>
        </Card>
      )}

      {loadState === 'ready' && config && (
        <>
          {/* Estado real (sem números falsos) */}
          <Card className="border-secondary/30">
            <CardHeader>
              <CardTitle className="text-base">Status</CardTitle>
              <CardDescription>Estado persistido em zapp.sentry_config</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Monitoramento</span>
                <span className="flex items-center gap-1 font-medium">
                  {isActive ? (
                    <>
                      <Wifi className="w-4 h-4 text-success" /> Ativo
                    </>
                  ) : (
                    <>
                      <WifiOff className="w-4 h-4 text-muted-foreground" /> Desligado
                    </>
                  )}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">DSN</span>
                <span className="font-mono text-xs">
                  {config.dsn_configured ? config.dsn_masked : 'não configurado'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Ambiente</span>
                <span className="font-medium">{config.environment}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Último evento de teste</span>
                <span>{formatDate(config.last_test_sent_at)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Última atualização</span>
                <span>{formatDate(config.updated_at)}</span>
              </div>
              <p className="text-xs text-muted-foreground pt-2 border-t border-secondary/30">
                Issues e eventos são visualizados no Sentry (sentry.io). Esta tela apenas gerencia a
                configuração local.
              </p>
            </CardContent>
          </Card>

          {/* Configuração */}
          <Card className="border-secondary/30">
            <CardHeader>
              <CardTitle className="text-base">Configuração</CardTitle>
              <CardDescription>DSN e opções — salvas via zapp-sentry-sync (admin/supervisor)</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {!canManage && (
                <div className="flex items-center gap-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-foreground">
                  <Lock className="w-3.5 h-3.5" />
                  Somente administradores e supervisores podem alterar esta configuração.
                </div>
              )}
              <div>
                <Label htmlFor="sentry-dsn">DSN</Label>
                <Input
                  id="sentry-dsn"
                  placeholder={
                    config.dsn_configured ? config.dsn_masked : 'https://...@o<org>.ingest.sentry.io/<projeto>'
                  }
                  value={dsnInput}
                  disabled={!canManage}
                  onChange={e => setDsnInput(e.target.value)}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  {config.dsn_configured
                    ? 'Deixe vazio para manter o DSN atual.'
                    : 'Preencher o DSN ativa o monitoramento.'}
                </p>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <Label>Ambiente</Label>
                  <select
                    aria-label="Ambiente"
                    className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm disabled:opacity-50"
                    value={environment}
                    disabled={!canManage}
                    onChange={e => setEnvironment(e.target.value)}
                  >
                    <option value="production">Production</option>
                    <option value="staging">Staging</option>
                    <option value="development">Development</option>
                  </select>
                </div>
                <div>
                  <Label htmlFor="sentry-traces-rate">Traces Rate</Label>
                  <Input
                    id="sentry-traces-rate"
                    type="number"
                    step="0.01"
                    min="0"
                    max="1"
                    value={tracesRate}
                    disabled={!canManage}
                    onChange={e => setTracesRate(e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="sentry-replays-session-rate">Replay Session</Label>
                  <Input
                    id="sentry-replays-session-rate"
                    type="number"
                    step="0.01"
                    min="0"
                    max="1"
                    value={replaysSessionRate}
                    disabled={!canManage}
                    onChange={e => setReplaysSessionRate(e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="sentry-replays-error-rate">Replay on Error</Label>
                  <Input
                    id="sentry-replays-error-rate"
                    type="number"
                    step="0.01"
                    min="0"
                    max="1"
                    value={replaysOnErrorRate}
                    disabled={!canManage}
                    onChange={e => setReplaysOnErrorRate(e.target.value)}
                  />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={enabled}
                  disabled={!canManage || !config.dsn_configured}
                  onCheckedChange={setEnabled}
                  aria-label="Monitoramento ativo"
                />
                <Label className="text-xs">Monitoramento ativo (exige DSN configurado)</Label>
              </div>
              <div className="flex flex-wrap items-center gap-3 pt-1">
                <Button onClick={() => void handleSave()} disabled={!canManage || saving}>
                  {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
                  {saving ? 'Salvando…' : 'Salvar configuração'}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => void handleTestEvent()}
                  disabled={!canManage || testing || !config.dsn_configured}
                >
                  {testing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
                  {testing ? 'Enviando…' : 'Enviar evento de teste'}
                </Button>
                {config.dsn_configured && canManage && (
                  <Button variant="ghost" size="sm" onClick={() => void handleClearDsn()} disabled={saving}>
                    Desativar (limpar DSN)
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
