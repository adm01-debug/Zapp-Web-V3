import { useState } from 'react';
import { useGlobalSettings } from '@/hooks/useGlobalSettings';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import {
  Plug,
  Eye,
  EyeOff,
  Save,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Activity,
} from 'lucide-react';
import { toast } from 'sonner';
import { useEvolutionApi } from '@/hooks/useEvolutionApi';
import { useEvolutionAutoSync } from '@/hooks/useEvolutionAutoSync';
import { cn } from '@/lib/utils';

interface KeyField {
  key: string;
  label: string;
  description: string;
  placeholder: string;
}

const INTEGRATION_KEYS: KeyField[] = [
  {
    key: 'evolution_api_url',
    label: 'Evolution API URL',
    description: 'URL base da sua instância Evolution API (ex: https://api.evolution.com)',
    placeholder: 'https://...',
  },
  {
    key: 'evolution_api_token',
    label: 'Evolution Global Apikey',
    description: 'Token global de autenticação (Global Apikey) do seu servidor Evolution',
    placeholder: '...',
  },
  {
    key: 'elevenlabs_api_key',
    label: 'ElevenLabs API Key',
    description: 'Chave para geração de voz (TTS), efeitos sonoros e conversão de voz',
    placeholder: 'xi-...',
  },
];

export function IntegrationKeysSection() {
  const { isLoading, getSetting, addSetting } = useGlobalSettings();
  const { listInstances } = useEvolutionApi();
  const [visibleKeys, setVisibleKeys] = useState<Record<string, boolean>>({});
  const [editValues, setEditValues] = useState<Record<string, string>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [testingConnection, setTestingConnection] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
    details?: { instances: number; status: string; version?: string };
  } | null>(null);
  const [detectedInstances, setDetectedInstances] = useState<any[]>([]);

  const { syncAll } = useEvolutionAutoSync();

  const toggleVisibility = (key: string) => {
    setVisibleKeys((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleChange = (key: string, value: string) => {
    setEditValues((prev) => ({ ...prev, [key]: value }));
  };

  const handleTestConnection = async () => {
    setTestingConnection(true);
    setTestResult(null);
    try {
      // Test by listing instances - simple GET call that requires authentication
      const result = await listInstances();
      if (Array.isArray(result) || (result && typeof result === 'object')) {
        const instances = Array.isArray(result) ? result : [];
        const count = instances.length;
        setDetectedInstances(instances);

        setTestResult({
          success: true,
          message: `Conexão estabelecida com sucesso!`,
          details: {
            instances: count,
            status: 'Online',
            version: 'v2.x (Auto-detected)',
          },
        });

        // Trigger a background sync if we have a valid connection
        syncAll();
        toast.success('Teste de conexão bem sucedido!');
      } else {
        throw new Error('Resposta inválida da API');
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Falha na conexão';
      setTestResult({ success: false, message: msg });
      toast.error(`Falha no teste: ${msg}`);
    } finally {
      setTestingConnection(false);
    }
  };

  const handleSave = async (key: string) => {
    const value = editValues[key];
    if (!value || value.trim() === '') {
      toast.error('Insira um valor válido');
      return;
    }
    setSavingKey(key);
    try {
      await addSetting(key, value.trim(), INTEGRATION_KEYS.find((k) => k.key === key)?.description);
      setEditValues((prev) => ({ ...prev, [key]: '' }));
      toast.success('Chave salva com sucesso');
    } catch {
      toast.error('Erro ao salvar chave');
    } finally {
      setSavingKey(null);
    }
  };

  if (isLoading) {
    return (
      <Card className="border border-secondary/20 bg-card">
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-64" />
        </CardHeader>
        <CardContent className="space-y-4">
          {[1].map((i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border border-secondary/20 bg-card transition-all hover:border-secondary/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Plug className="h-5 w-5 text-primary" />
          Chaves de Integração
        </CardTitle>
        <CardDescription>
          Gerencie as API Keys de serviços externos integrados ao sistema
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {INTEGRATION_KEYS.map(({ key, label, description, placeholder }) => {
          const currentValue = getSetting(key);
          const isConfigured = !!currentValue && currentValue.trim() !== '';
          const editValue = editValues[key] ?? '';
          const isVisible = visibleKeys[key];
          const isSaving = savingKey === key;

          return (
            <div
              key={key}
              className="space-y-3 rounded-lg border border-border/30 p-4 transition-colors hover:bg-muted/10"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Label className="text-sm font-medium">{label}</Label>
                  {isConfigured ? (
                    <Badge
                      variant="outline"
                      className="gap-1 border-success/30 text-xs text-success"
                    >
                      <CheckCircle2 className="h-3 w-3" />
                      Configurada
                    </Badge>
                  ) : (
                    <Badge
                      variant="outline"
                      className="gap-1 border-warning/30 text-xs text-warning"
                    >
                      <AlertCircle className="h-3 w-3" />
                      Não configurada
                    </Badge>
                  )}
                </div>
              </div>
              <p className="text-xs text-muted-foreground">{description}</p>

              {isConfigured && (
                <div className="flex items-center gap-2">
                  <Input
                    type={isVisible ? 'text' : 'password'}
                    value={currentValue}
                    readOnly
                    className="h-8 bg-muted/30 text-sm"
                  />
                  <Button
                    aria-label={isVisible ? 'Ocultar chave' : 'Mostrar chave'}
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0"
                    onClick={() => toggleVisibility(key)}
                  >
                    {isVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
              )}

              <div className="flex items-center gap-2">
                <Input
                  type="password"
                  value={editValue}
                  onChange={(e) => handleChange(key, e.target.value)}
                  placeholder={isConfigured ? 'Nova chave para substituir...' : placeholder}
                  className="h-8 text-sm"
                />
                <Button
                  size="sm"
                  className="h-8 shrink-0 gap-1"
                  disabled={!editValue.trim() || isSaving}
                  onClick={() => handleSave(key)}
                >
                  <Save className="h-3.5 w-3.5" />
                  {isSaving ? 'Salvando...' : 'Salvar'}
                </Button>
              </div>
            </div>
          );
        })}
        <div className="border-t border-border/30 pt-4">
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <h4 className="text-sm font-medium">Diagnóstico de Conexão</h4>
                <p className="text-xs text-muted-foreground">
                  Valide se a plataforma consegue se comunicar com o servidor Evolution
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={handleTestConnection}
                disabled={
                  testingConnection ||
                  !getSetting('evolution_api_url') ||
                  !getSetting('evolution_api_token')
                }
              >
                {testingConnection ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <Activity className="h-4 w-4" />
                )}
                Testar Evolution
              </Button>
            </div>

            {testResult && (
              <div
                className={cn(
                  'flex flex-col gap-3 rounded-xl border p-4 text-sm animate-in fade-in slide-in-from-top-2',
                  testResult.success
                    ? 'border-success/20 bg-success/5 text-success'
                    : 'border-destructive/20 bg-destructive/5 text-destructive'
                )}
              >
                <div className="flex items-start gap-3">
                  {testResult.success ? (
                    <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
                  ) : (
                    <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
                  )}
                  <div className="flex-1">
                    <p className="text-sm font-bold">
                      {testResult.success ? 'Conexão Ativa' : 'Erro na Conexão'}
                    </p>
                    <p className="mt-0.5 text-xs leading-relaxed opacity-80">
                      {testResult.message}
                    </p>
                  </div>
                </div>

                {testResult.success && testResult.details && (
                  <div className="grid grid-cols-2 gap-2 border-t border-success/10 pt-2">
                    <div className="space-y-0.5">
                      <p className="text-[10px] uppercase tracking-wider opacity-60">Instâncias</p>
                      <p className="text-xs">{testResult.details.instances}</p>
                    </div>
                    <div className="space-y-0.5">
                      <p className="text-[10px] uppercase tracking-wider opacity-60">Status</p>
                      <p className="text-xs">{testResult.details.status}</p>
                    </div>
                    <div className="space-y-0.5">
                      <p className="text-[10px] uppercase tracking-wider opacity-60">Versão API</p>
                      <p className="text-xs">{testResult.details.version}</p>
                    </div>
                    <div className="space-y-0.5">
                      <p className="text-[10px] uppercase tracking-wider opacity-60">Auto-Sync</p>
                      <p className="text-xs text-success">Habilitado</p>
                    </div>
                  </div>
                )}
              </div>
            )}
            {testResult && testResult.success && detectedInstances.length > 0 && (
              <div className="mt-4 space-y-2 border-t border-border/30 pt-4">
                <h5 className="mb-3 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  Instâncias Detectadas
                </h5>
                <div className="grid gap-2">
                  {detectedInstances.map((inst, idx) => {
                    const status = inst.instance?.status || 'unknown';
                    const isOnline = status === 'open';
                    const name = inst.instance?.instanceName || 'Sem nome';
                    const number = inst.instance?.number || 'Não vinculado';

                    return (
                      <div
                        key={idx}
                        className="group flex items-center justify-between rounded-xl border border-border/10 bg-muted/20 p-3 transition-all hover:bg-muted/30"
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className={cn(
                              'h-2.5 w-2.5 rounded-full',
                              isOnline
                                ? 'bg-success shadow-[0_0_8px_hsl(var(--success))]'
                                : 'bg-muted-foreground/30'
                            )}
                          />
                          <div className="flex flex-col">
                            <span className="text-xs font-bold text-foreground">{name}</span>
                            <span className="text-[10px] text-muted-foreground">{number}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge
                            variant="outline"
                            className={cn(
                              'h-5 border-0 px-1.5 text-[9px] font-bold uppercase tracking-tight shadow-none',
                              isOnline
                                ? 'bg-success/10 text-success'
                                : 'bg-muted/10 text-muted-foreground'
                            )}
                          >
                            {isOnline ? 'Online' : 'Offline'}
                          </Badge>
                          <span className="text-[10px] text-muted-foreground/40 transition-colors group-hover:text-muted-foreground/60">
                            v2.x
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
