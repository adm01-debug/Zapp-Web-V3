/**
 * AdminStressTestPage — painel admin para teste de carga multimídia do WhatsApp.
 *
 * Dispara N envios reais para um destino, alternando entre todos os tipos de mídia
 * suportados pelo hub `evolution-api`. Salva o histórico em `stress_test_runs`.
 *
 * Salvaguardas:
 *  - Confirmação dupla com palavra-chave antes de iniciar
 *  - Botão Parar sempre disponível durante a execução
 *  - Política de falha configurável (padrão: parar na 1ª)
 *  - Persistência do log para auditoria
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertTriangle,
  Play,
  Square,
  CheckCircle2,
  XCircle,
  Loader2,
  Download,
  ShieldCheck,
  ShieldAlert,
  Activity,
} from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useEvolutionApi } from '@/hooks/useEvolutionApi';
import { runStressTest, type RunSummary } from '@/lib/stressTest/runner';
import {
  ALL_STRESS_TYPES,
  STRESS_TYPE_LABEL,
  type StressResult,
  type StressRunStatus,
  type StressTaskType,
} from '@/lib/stressTest/types';
import { buildBalancedPlan, preloadLibraries, sampleFor } from '@/lib/stressTest/mediaSamplers';
import { checkUrlAccessibility } from '@/lib/stressTest/accessibilityChecker';
import { getLogger } from '@/lib/logger';
import { cn } from '@/lib/utils';

const log = getLogger('AdminStressTest');

const DEFAULT_PHONE = '5564984450900';
const DEFAULT_INSTANCE = 'wpp2';

export default function AdminStressTestPage() {
  // Form
  const [phone, setPhone] = useState(DEFAULT_PHONE);
  const [instance, setInstance] = useState(DEFAULT_INSTANCE);
  const [total, setTotal] = useState(200);
  const [intervalSec, setIntervalSec] = useState(5);
  const [failurePolicy, setFailurePolicy] = useState<'stop_first' | 'continue' | 'stop_after_n'>(
    'stop_first'
  );
  const [agentCount, setAgentCount] = useState(1);
  const [targetQueue, setTargetQueue] = useState<string | null>(null);
  const [simulateTokenExpiration, setSimulateTokenExpiration] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Data
  const [queues, setQueues] = useState<any[]>([]);

  // Run state
  const [status, setStatus] = useState<StressRunStatus>('idle');
  const [results, setResults] = useState<StressResult[]>([]);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [runId, setRunId] = useState<string | null>(null);
  const [startTime, setStartTime] = useState<number>(0);
  const [throughputData, setThroughputData] = useState<{ time: string; msgSec: number }[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const fetchQueues = async () => {
      const { data } = await supabase.from('queues').select('id, name').order('name');
      setQueues(data || []);
    };
    void fetchQueues();
  }, []);

  const evo = useEvolutionApi();

  const sent = results.filter((r) => r.status === 'ok').length;
  const failed = results.filter((r) => r.status === 'fail').length;
  const etaMin = useMemo(() => Math.ceil((total * (intervalSec + 1)) / 60), [total, intervalSec]);

  // ── Dispatcher ─────────────────────────────────────────────
  const dispatch = useCallback(
    async ({
      type,
      idx,
      phone,
      instance,
    }: {
      type: StressTaskType;
      idx: number;
      phone: string;
      instance: string;
    }) => {
      const sample = await sampleFor(type, idx);
      let result: any;
      let accessibility: StressResult['accessibility'] | undefined;

      // Check media accessibility if URL exists
      if (sample.url) {
        let testUrl = sample.url;
        // Simulate private URL with tokens if enabled
        if (simulateTokenExpiration) {
          // Randomly expire 10% of tokens
          const isExpired = Math.random() < 0.1;
          testUrl +=
            (testUrl.includes('?') ? '&' : '?') +
            `token=${isExpired ? 'expired_test' : 'valid_test'}&expires=${Date.now() + 3600000}`;
        }

        const acc = await checkUrlAccessibility(testUrl);
        accessibility = {
          reachable: acc.reachable,
          latencyMs: acc.latencyMs,
          error: acc.error,
        };
      }

      switch (type) {
        case 'text':
          result = await evo.sendTextMessage(instance, phone, sample.text!, {
            idempotencyKey: `stress_${idx}_${Date.now()}`,
          });
          break;
        case 'image':
          result = await evo.sendMediaMessage({
            instanceName: instance,
            number: phone,
            mediatype: 'image',
            mimetype: 'image/jpeg',
            media: sample.url!,
            fileName: sample.fileName,
            caption: sample.caption,
            idempotencyKey: `stress_${idx}_${Date.now()}`,
          } as any);
          break;
        case 'video':
          result = await evo.sendMediaMessage({
            instanceName: instance,
            number: phone,
            mediatype: 'video',
            mimetype: 'video/mp4',
            media: sample.url!,
            fileName: sample.fileName,
            caption: sample.caption,
            idempotencyKey: `stress_${idx}_${Date.now()}`,
          } as any);
          break;
        case 'document':
          result = await evo.sendMediaMessage({
            instanceName: instance,
            number: phone,
            mediatype: 'document',
            mimetype: 'application/pdf',
            media: sample.url!,
            fileName: sample.fileName,
            caption: sample.caption,
            idempotencyKey: `stress_${idx}_${Date.now()}`,
          } as any);
          break;
        case 'audio_voice':
        case 'audio_meme':
          result = await evo.sendAudioMessage(instance, phone, sample.url!, {
            encoding: true,
            idempotencyKey: `stress_${idx}_${Date.now()}`,
          });
          break;
        case 'sticker':
          result = await evo.sendStickerMessage(instance, phone, sample.url!, {
            idempotencyKey: `stress_${idx}_${Date.now()}`,
          });
          break;
        case 'location':
          result = await evo.sendLocationMessage({
            instanceName: instance,
            number: phone,
            latitude: sample.latitude,
            longitude: sample.longitude,
            name: sample.name,
            idempotencyKey: `stress_${idx}_${Date.now()}`,
          } as any);
          break;
      }
      const messageId = result?.key?.id ?? result?.messageId ?? result?.id;
      return { messageId, detail: sample.detail, accessibility };
    },
    [evo]
  );

  // ── Persist incremental updates to stress_test_runs ───────
  const persistRun = useCallback(
    async (
      id: string,
      partial: Partial<{
        status: string;
        ended_at: string;
        total_sent: number;
        total_failed: number;
        results: StressResult[];
        abort_reason: string;
        metrics_summary: any;
      }>
    ) => {
      try {
        await (supabase as any)
          .from('stress_test_runs')
          .update(partial as any)
          .eq('id', id);
      } catch (e) {
        log.warn('Falha ao persistir progresso', e);
      }
    },
    []
  );

  // ── Start ─────────────────────────────────────────────────
  const startRun = useCallback(async () => {
    setConfirmOpen(false);
    setConfirmText('');
    setResults([]);
    setProgress({ done: 0, total });
    setStatus('running');
    const start = performance.now();
    setStartTime(start);
    const startTimeManual = start; // local for closure

    try {
      // Falha cedo se a biblioteca não tem stickers/áudios memes.
      await preloadLibraries();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Erro ao carregar bibliotecas';
      toast.error(msg);
      setStatus('failed');
      return;
    }

    const { data: userResp } = await supabase.auth.getUser();
    const userId = userResp.user?.id;
    if (!userId) {
      toast.error('Sessão inválida — faça login novamente.');
      setStatus('idle');
      return;
    }

    // Cria o registro do run
    const { data: insertData, error: insertErr } = await (supabase as any)
      .from('stress_test_runs')
      .insert({
        started_by: userId,
        target_phone: phone,
        instance_name: instance,
        total_planned: total,
        status: 'running',
      })
      .select('id')
      .single();

    if (insertErr || !insertData) {
      toast.error(
        `Não foi possível criar o registro do teste: ${insertErr?.message ?? 'desconhecido'}`
      );
      setStatus('failed');
      return;
    }

    const id = insertData.id;
    setRunId(id);

    const plan = buildBalancedPlan(total, ALL_STRESS_TYPES);
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    const collected: StressResult[] = [];
    let lastPersist = 0;

    const summary: RunSummary = await runStressTest({
      plan,
      phone,
      instance,
      intervalMs: intervalSec * 1000,
      concurrency: agentCount,
      failurePolicy,
      failureThreshold: 5,
      signal: ctrl.signal,
      dispatch: async (args) => {
        const start = performance.now();
        try {
          const res = await dispatch(args);
          const latency = Math.round(performance.now() - start);

          // Log metrics to DB for throughput/latency analysis
          void (supabase as any).from('stress_test_metrics').insert({
            run_id: id,
            task_type: args.type,
            latency_ms: latency,
            status: 'success',
          });

          return res;
        } catch (err) {
          const latency = Math.round(performance.now() - start);
          void (supabase as any).from('stress_test_metrics').insert({
            run_id: id,
            task_type: args.type,
            latency_ms: latency,
            status: 'failed',
            error_message: err instanceof Error ? err.message : String(err),
          });
          throw err;
        }
      },
      onResult: (r) => {
        collected.push(r);
        setResults((prev) => [r, ...prev].slice(0, 250));

        // Update throughput data for chart
        const elapsed = (performance.now() - startTimeManual) / 1000;
        if (elapsed > 0) {
          setThroughputData((prev) => {
            const last = prev[prev.length - 1];
            const currentMsgSec = Number((collected.length / elapsed).toFixed(2));
            // Only add data every ~1 second
            if (!last || Date.now() - new Date(`2026-05-06T${last.time}`).getTime() > 1000) {
              return [
                ...prev,
                { time: new Date().toLocaleTimeString('pt-BR'), msgSec: currentMsgSec },
              ].slice(-30);
            }
            return prev;
          });
        }

        // Persiste a cada 5 envios pra reduzir tráfego
        if (collected.length - lastPersist >= 5) {
          lastPersist = collected.length;
          void persistRun(id, {
            total_sent: collected.filter((x) => x.status === 'ok').length,
            total_failed: collected.filter((x) => x.status === 'fail').length,
            results: collected,
          });
        }
      },
      onProgress: (done, t) => setProgress({ done, total: t }),
    });

    setStatus(summary.status);
    abortRef.current = null;

    // Aggregate metrics for final report
    const { data: metrics } = await (supabase as any)
      .from('stress_test_metrics')
      .select('latency_ms, status')
      .eq('run_id', id);

    const latencies = metrics?.map((m) => m.latency_ms).sort((a, b) => a - b) || [];
    const avgLatency =
      latencies.length > 0
        ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)
        : 0;
    const p95Latency = latencies[Math.floor(latencies.length * 0.95)] || 0;
    const throughput =
      latencies.length > 0
        ? Number((latencies.length / ((performance.now() - startTimeManual) / 1000)).toFixed(2))
        : 0;

    await persistRun(id, {
      status: summary.status,
      ended_at: new Date().toISOString(),
      total_sent: summary.totalSent,
      total_failed: summary.totalFailed,
      results: collected,
      abort_reason: summary.abortReason,
      metrics_summary: {
        avg_latency: avgLatency,
        p95_latency: p95Latency,
        throughput_msg_sec: throughput,
        success_rate: metrics?.length
          ? (metrics.filter((m) => m.status === 'success').length / metrics.length) * 100
          : 0,
      },
    });

    if (summary.status === 'completed') {
      toast.success(`Teste concluído: ${summary.totalSent}/${total} enviados`);
    } else if (summary.status === 'aborted') {
      toast.message('Teste cancelado pelo operador');
    } else {
      toast.error(`Teste interrompido: ${summary.abortReason ?? 'falha'}`);
    }
  }, [dispatch, failurePolicy, instance, intervalSec, persistRun, phone, total, agentCount]);

  const downloadReport = useCallback(() => {
    if (results.length === 0) return;

    const reportData = results.map((r) => ({
      Timestamp: new Date(r.ts).toISOString(),
      Index: r.idx + 1,
      Type: STRESS_TYPE_LABEL[r.type],
      Status: r.status,
      LatencyMs: r.ms,
      MessageId: r.messageId || '',
      Accessibility: r.accessibility?.reachable ? 'OK' : r.accessibility ? 'FAIL' : 'N/A',
      AccLatencyMs: r.accessibility?.latencyMs || '',
      Error: r.error || '',
      Detail: r.detail || '',
    }));

    const csvRows = [
      Object.keys(reportData[0]).join(','),
      ...reportData.map((row) =>
        Object.values(row)
          .map((v) => `"${v}"`)
          .join(',')
      ),
    ];

    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `stress-test-report-${new Date().toISOString()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success('Relatório gerado com sucesso');
  }, [results]);

  const handleStop = () => {
    abortRef.current?.abort();
  };

  // Limpa abort se desmontar
  useEffect(() => () => abortRef.current?.abort(), []);

  const isRunning = status === 'running';

  return (
    <div className="container mx-auto max-w-5xl space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Stress Test — WhatsApp Multi-mídia</h1>
        <p className="mt-1 text-muted-foreground">
          Dispara mensagens reais de todos os tipos suportados para validar a integração
          ponta-a-ponta.
        </p>
      </div>

      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Atenção</AlertTitle>
        <AlertDescription>
          Este teste envia mensagens <strong>reais</strong> via Evolution API. Use apenas em
          destinos consentidos. Volume alto pode disparar bloqueio anti-spam da Meta na instância.
        </AlertDescription>
      </Alert>

      {throughputData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <Activity className="h-4 w-4" /> Vazão em tempo real (msg/s)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[200px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={throughputData}>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    vertical={false}
                    stroke="hsl(var(--muted-foreground)/0.1)"
                  />
                  <XAxis dataKey="time" hide />
                  <YAxis fontSize={10} stroke="hsl(var(--muted-foreground))" />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--background))',
                      borderColor: 'hsl(var(--border))',
                      fontSize: '12px',
                    }}
                    itemStyle={{ color: 'hsl(var(--primary))' }}
                  />
                  <Line
                    type="monotone"
                    dataKey="msgSec"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    dot={false}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Configuração</CardTitle>
          <CardDescription>
            Ajuste antes de iniciar — durante a execução os campos ficam travados.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="phone">Número de destino (E.164 sem +)</Label>
            <Input
              id="phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
              disabled={isRunning}
              placeholder="5564984450900"
            />
            <p className="text-xs text-muted-foreground">
              Ex.: 5564984450900 (Brasil + DDD + número)
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="instance">Instância</Label>
            <Input
              id="instance"
              value={instance}
              onChange={(e) => setInstance(e.target.value)}
              disabled={isRunning}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="queue">Fila (Opcional - Simula Atendentes da Fila)</Label>
            <Select
              value={targetQueue || 'none'}
              onValueChange={(v) => setTargetQueue(v === 'none' ? null : v)}
              disabled={isRunning}
            >
              <SelectTrigger id="queue">
                <SelectValue placeholder="Selecione uma fila..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Nenhuma (Alvo Direto)</SelectItem>
                {queues.map((q) => (
                  <SelectItem key={q.id} value={q.id}>
                    {q.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Se selecionada, o teste simula a carga sendo processada por agentes dessa fila.
            </p>
          </div>

          <div className="flex items-center space-x-2 rounded-lg border bg-muted/20 p-2 md:col-span-2">
            <input
              type="checkbox"
              id="token-sim"
              checked={simulateTokenExpiration}
              onChange={(e) => setSimulateTokenExpiration(e.target.checked)}
              disabled={isRunning}
              className="h-4 w-4 rounded border-muted text-primary focus:ring-primary"
            />
            <Label htmlFor="token-sim" className="cursor-pointer">
              Simular Expiração de Tokens (Mídias Privadas)
            </Label>
            <p className="ml-auto text-[10px] text-muted-foreground">
              Injeta tokens aleatoriamente expirados para testar resiliência de leitura.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="total">Total de envios</Label>
            <Input
              id="total"
              type="number"
              min={8}
              max={500}
              value={total}
              onChange={(e) => setTotal(Math.max(8, Math.min(500, Number(e.target.value) || 8)))}
              disabled={isRunning}
            />
            <p className="text-xs text-muted-foreground">
              8 tipos × {Math.floor(total / 8)} cada (resto rotaciona)
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="interval">Intervalo entre envios (segundos)</Label>
            <Input
              id="interval"
              type="number"
              min={1}
              max={60}
              value={intervalSec}
              onChange={(e) =>
                setIntervalSec(Math.max(1, Math.min(60, Number(e.target.value) || 5)))
              }
              disabled={isRunning}
            />
            <p className="text-xs text-muted-foreground">
              Mínimo recomendado: 3-5s para evitar ban
            </p>
          </div>

          <div className="space-y-2 md:col-span-2">
            <div className="flex items-center justify-between">
              <Label>Política em caso de falha</Label>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="h-6 px-2 text-xs"
              >
                {showAdvanced ? 'Esconder Avançado' : 'Configurações Avançadas'}
              </Button>
            </div>
            <Select
              value={failurePolicy}
              onValueChange={(v: any) => setFailurePolicy(v)}
              disabled={isRunning}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="stop_first">Parar imediatamente na 1ª falha</SelectItem>
                <SelectItem value="continue">Continuar — só registrar o erro</SelectItem>
                <SelectItem value="stop_after_n">Parar se 5 falhas seguidas</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {showAdvanced && (
            <div className="space-y-2 rounded-lg border bg-muted/30 p-4 md:col-span-2">
              <Label htmlFor="agentCount">Simular Múltiplos Atendentes (Paralelismo)</Label>
              <Input
                id="agentCount"
                type="number"
                min={1}
                max={5}
                value={agentCount}
                onChange={(e) =>
                  setAgentCount(Math.max(1, Math.min(5, Number(e.target.value) || 1)))
                }
                disabled={isRunning}
              />
              <p className="text-xs text-muted-foreground">
                Divide o lote entre {agentCount} "threads" de envio simultâneo.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Execução</CardTitle>
          <CardDescription>
            ETA: ~{etaMin} min &middot; {ALL_STRESS_TYPES.length} tipos:{' '}
            {ALL_STRESS_TYPES.map((t) => STRESS_TYPE_LABEL[t]).join(' · ')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            {!isRunning ? (
              <Button onClick={() => setConfirmOpen(true)} size="lg">
                <Play className="mr-2 h-4 w-4" /> Iniciar teste
              </Button>
            ) : (
              <Button onClick={handleStop} size="lg" variant="destructive">
                <Square className="mr-2 h-4 w-4" /> Parar agora
              </Button>
            )}
            <StatusBadge status={status} />
            {isRunning && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          </div>

          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="font-medium">Progresso</span>
              <span className="tabular-nums text-muted-foreground">
                {progress.done}/{progress.total} (
                {progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0}%)
              </span>
            </div>
            <Progress value={progress.total > 0 ? (progress.done / progress.total) * 100 : 0} />
            <div className="flex flex-wrap gap-x-6 gap-y-2 pt-1 text-sm">
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-success" /> Sucesso:{' '}
                <strong className="tabular-nums">{sent}</strong>
              </span>
              <span className="flex items-center gap-1.5">
                <XCircle className="h-4 w-4 text-destructive" /> Falhas:{' '}
                <strong className="tabular-nums">{failed}</strong>
              </span>
              {results.some((r) => r.accessibility) && (
                <span className="flex items-center gap-1.5">
                  <ShieldCheck className="h-4 w-4 text-primary" /> Acesso OK:{' '}
                  <strong className="tabular-nums">
                    {results.filter((r) => r.accessibility?.reachable).length}
                  </strong>
                </span>
              )}
              {results.length > 0 && (
                <>
                  <span className="border-l pl-4 text-muted-foreground">
                    Latência Avg:{' '}
                    <strong>
                      {Math.round(results.reduce((acc, r) => acc + r.ms, 0) / results.length)}ms
                    </strong>
                  </span>
                  <span className="border-l pl-4 text-muted-foreground">
                    Throughput:{' '}
                    <strong>
                      {(progress.done / ((performance.now() - startTime) / 1000)).toFixed(2)} msg/s
                    </strong>
                  </span>
                </>
              )}
            </div>
            {status !== 'idle' && !isRunning && (
              <div className="pt-4">
                <Button variant="outline" size="sm" onClick={downloadReport}>
                  <Download className="mr-2 h-4 w-4" /> Baixar Relatório Completo (.csv)
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Log ao vivo</CardTitle>
          <CardDescription>Últimos 250 envios (mais recente no topo)</CardDescription>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[400px] rounded-md border bg-muted/20 p-2">
            {results.length === 0 ? (
              <p className="py-12 text-center text-sm text-muted-foreground">Nenhum envio ainda.</p>
            ) : (
              <ul className="space-y-1 text-xs">
                {results.map((r) => (
                  <li
                    key={`${r.idx}-${r.ts}`}
                    className={cn(
                      'flex gap-2 rounded px-2 py-1',
                      r.status === 'ok' ? 'text-foreground' : 'bg-destructive/5 text-destructive'
                    )}
                  >
                    <span className="shrink-0 tabular-nums text-muted-foreground">
                      {new Date(r.ts).toLocaleTimeString('pt-BR')}
                    </span>
                    <span className="shrink-0">{r.status === 'ok' ? '✅' : '❌'}</span>
                    <span className="shrink-0 tabular-nums">
                      #{String(r.idx + 1).padStart(3, '0')}
                    </span>
                    <span className="w-24 shrink-0">{STRESS_TYPE_LABEL[r.type]}</span>
                    <span className="shrink-0 tabular-nums text-muted-foreground">{r.ms}ms</span>
                    {r.accessibility && (
                      <span
                        className="shrink-0"
                        title={
                          r.accessibility.reachable
                            ? 'URL acessível'
                            : `Erro de acesso: ${r.accessibility.error}`
                        }
                      >
                        {r.accessibility.reachable ? (
                          <ShieldCheck className="h-3 w-3 text-primary" />
                        ) : (
                          <ShieldAlert className="h-3 w-3 text-destructive" />
                        )}
                      </span>
                    )}
                    <span className="truncate">{r.error ?? r.detail ?? ''}</span>
                  </li>
                ))}
              </ul>
            )}
          </ScrollArea>
        </CardContent>
      </Card>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" /> Confirmação obrigatória
            </DialogTitle>
            <DialogDescription className="space-y-2 pt-2">
              <span className="block">
                Você está prestes a enviar <strong>{total} mensagens reais</strong> para o número{' '}
                <strong>{phone}</strong> via instância <strong>{instance}</strong>.
              </span>
              <span className="block text-warning-foreground dark:text-warning-foreground">
                Risco: bloqueio anti-spam da Meta na instância. Tempo estimado: ~{etaMin} min.
              </span>
              <span className="block pt-2">
                Para confirmar, digite{' '}
                <code className="rounded bg-muted px-1.5 py-0.5">CONFIRMAR</code> abaixo:
              </span>
            </DialogDescription>
          </DialogHeader>
          <Input
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder="Digite CONFIRMAR"
            autoFocus
          />
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setConfirmOpen(false);
                setConfirmText('');
              }}
            >
              Cancelar
            </Button>
            <Button variant="destructive" disabled={confirmText !== 'CONFIRMAR'} onClick={startRun}>
              Iniciar envio
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {(status === 'completed' || status === 'failed' || status === 'aborted') &&
        results.length > 0 && (
          <Card className="border-primary/20 bg-primary/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-primary" /> Relatório para Time Comercial
              </CardTitle>
              <CardDescription>Análise agregada de falhas e eventos do teste.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-3">
                <div className="rounded-lg border bg-background p-4">
                  <p className="text-xs uppercase text-muted-foreground">
                    Custo Estimado Desperdiçado
                  </p>
                  <p className="text-2xl font-bold text-destructive">
                    R$ {(results.filter((r) => r.status === 'fail').length * 0.15).toFixed(2)}
                  </p>
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    Baseado em R$ 0,15 por tentativa falha (WA API + Hub)
                  </p>
                </div>
                <div className="rounded-lg border bg-background p-4">
                  <p className="text-xs uppercase text-muted-foreground">
                    Ponto de Estrangulamento
                  </p>
                  <p className="text-xl font-bold">
                    {results.filter((r) => r.status === 'fail').length > 0
                      ? results.find((r) => r.status === 'fail')?.type === 'image' ||
                        results.find((r) => r.status === 'fail')?.type === 'video'
                        ? 'Processamento de Mídia'
                        : 'Latência de Rede / Instância'
                      : 'Nenhum Detectado'}
                  </p>
                </div>
                <div className="rounded-lg border bg-background p-4">
                  <p className="text-xs uppercase text-muted-foreground">Confiabilidade Mídia</p>
                  <p className="text-2xl font-bold text-primary">
                    {results.filter((r) => r.accessibility).length > 0
                      ? `${Math.round((results.filter((r) => r.accessibility?.reachable).length / results.filter((r) => r.accessibility).length) * 100)}%`
                      : '100%'}
                  </p>
                </div>
              </div>

              <div className="rounded-lg border bg-background p-4">
                <h4 className="mb-2 flex items-center gap-2 font-semibold">
                  <ShieldAlert className="h-4 w-4 text-warning" /> Recomendações Estratégicas
                </h4>
                <ul className="list-disc space-y-2 pl-5 text-sm text-muted-foreground">
                  {results.filter((r) => r.status === 'fail').length > results.length * 0.1 ? (
                    <li className="font-medium text-destructive">
                      Urgente: Taxa de erro acima de 10%. Reduzir volume de outbound ou trocar
                      instância.
                    </li>
                  ) : (
                    <li>Instância estável para o volume atual. Possibilidade de escalar em 20%.</li>
                  )}
                  {results.filter((r) => r.accessibility && !r.accessibility.reachable).length >
                    0 && (
                    <li>
                      Detectada falha em{' '}
                      {results.filter((r) => r.accessibility && !r.accessibility.reachable).length}{' '}
                      arquivos de mídia. Verificar permissões do bucket privado.
                    </li>
                  )}
                  <li>Manter intervalo de {intervalSec}s para evitar flagging de spam.</li>
                </ul>
              </div>

              <Button onClick={downloadReport} className="w-full gap-2">
                <Download className="h-4 w-4" /> Exportar Relatório Consolidado para Comercial
              </Button>
            </CardContent>
          </Card>
        )}
    </div>
  );
}

function StatusBadge({ status }: { status: StressRunStatus }) {
  switch (status) {
    case 'idle':
      return <Badge variant="secondary">Pronto</Badge>;
    case 'running':
      return <Badge>Rodando…</Badge>;
    case 'completed':
      return <Badge variant="success">Concluído</Badge>;
    case 'aborted':
      return <Badge variant="warning">Cancelado</Badge>;
    case 'failed':
      return <Badge variant="destructive">Interrompido por falha</Badge>;
  }
}
