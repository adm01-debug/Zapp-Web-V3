import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Zap, Save, RefreshCw, Loader2, AlertCircle } from 'lucide-react';
import { n8nSyncConfigure, n8nSyncStatus, type N8nSyncStatus } from '@/lib/adapters/n8nOps';

const STATUS_LABEL: Record<N8nSyncStatus['status'], string> = {
  not_configured: 'Não configurada',
  disabled: 'Desligada',
  configured: 'Configurada',
};

/**
 * N8n Integration View — estado REAL via edge zapp-n8n-sync.
 *
 * Contrato honesto (substitui o stub com setIsConnected local, etapa 72):
 * o badge, o formulário e as mensagens refletem o estado persistido em
 * zapp.n8n_config — nada de conexão simulada. Por padrão a integração está
 * DESLIGADA (status 'not_configured'/'disabled'): nenhum evento é enviado ao
 * n8n até a ativação do pipeline de dispatch.
 */
export function N8nIntegrationView() {
  const [status, setStatus] = useState<N8nSyncStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [baseUrl, setBaseUrl] = useState('');

  const loadStatus = useCallback(async () => {
    setLoading(true);
    const result = await n8nSyncStatus();
    setStatus(result);
    setLoading(false);
    if (!result.ok) {
      toast.error('Não foi possível verificar o estado da integração');
    }
  }, []);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  const handleSave = async () => {
    const url = baseUrl.trim();
    if (!url) {
      toast.error('Informe a URL base do n8n');
      return;
    }
    setSaving(true);
    try {
      const result = await n8nSyncConfigure(url);
      setStatus(result);
      if (!result.ok) {
        toast.error('Falha ao salvar a configuração: ' + (result.error ?? 'erro desconhecido'));
        return;
      }
      toast.success('Configuração salva. A integração permanece desligada até a ativação do pipeline de envio.');
    } catch (err: unknown) {
      toast.error('Erro ao salvar: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setSaving(false);
    }
  };

  const currentStatus = status?.status ?? null;

  return (
    <div className="space-y-6 p-6 max-w-4xl mx-auto">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'var(--gradient-primary)' }}>
            <Zap className="w-5 h-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold text-foreground">Integração n8n</h1>
            <p className="text-muted-foreground text-sm">Conecte workflows de automação via webhooks</p>
          </div>
          <Badge
            variant={currentStatus === 'configured' ? 'default' : currentStatus === 'disabled' ? 'outline' : 'secondary'}
            className="ml-auto"
          >
            {loading
              ? 'Verificando...'
              : currentStatus
                ? STATUS_LABEL[currentStatus]
                : 'Indisponível'}
          </Badge>
        </div>
      </motion.div>

      {/* Estado honesto da integração */}
      {!loading && status && !status.ok && (
        <Card className="border-destructive/40">
          <CardContent className="py-4 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-destructive mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium text-foreground">Não foi possível consultar o estado real da integração</p>
              <p className="text-xs text-muted-foreground mt-1">
                A edge function zapp-n8n-sync não respondeu. Nenhuma alteração local é exibida como conexão.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {!loading && status?.ok && currentStatus === 'not_configured' && (
        <Card className="border-dashed border-secondary/50">
          <CardContent className="py-6 text-center">
            <Zap className="w-8 h-8 mx-auto mb-2 opacity-40" />
            <p className="text-sm font-medium text-foreground">Integração não configurada</p>
            <p className="text-xs text-muted-foreground mt-1 max-w-md mx-auto">
              Nenhuma instância n8n foi cadastrada — nenhum evento do sistema é enviado a fluxos n8n.
              Salve a URL base abaixo para registrar a configuração.
            </p>
          </CardContent>
        </Card>
      )}

      {!loading && status?.ok && currentStatus === 'disabled' && (
        <Card className="border-warning/40">
          <CardContent className="py-4 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-warning mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium text-foreground">Configuração salva, integração desligada</p>
              <p className="text-xs text-muted-foreground mt-1">
                A URL base está registrada, mas <strong>nenhum evento é enviado ao n8n</strong>: o contrato
                permanece desligado (enabled=false) até a ativação do pipeline de dispatch de eventos.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {!loading && status?.ok && currentStatus === 'configured' && (
        <Card className="border-success/40">
          <CardContent className="py-4 flex items-start gap-3">
            <Zap className="w-5 h-5 text-success mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium text-foreground">Integração configurada</p>
              <p className="text-xs text-muted-foreground mt-1">
                Eventos do sistema são enviados aos fluxos da instância cadastrada. Verifique os webhooks no n8n.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Connection Config */}
      <Card className="border-secondary/30">
        <CardHeader>
          <CardTitle className="text-base">Configuração de Conexão</CardTitle>
          <CardDescription>URL base da sua instância n8n</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-3">
            <div className="flex-1">
              <Label htmlFor="n8n-url">URL Base n8n</Label>
              <Input
                id="n8n-url"
                placeholder="https://seu-n8n.example.com"
                value={baseUrl}
                onChange={e => setBaseUrl(e.target.value)}
                disabled={saving}
              />
            </div>
            <Button onClick={handleSave} className="mt-auto" style={{ background: 'var(--gradient-primary)' }} disabled={saving || loading}>
              {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
              Salvar
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Salvar registra a configuração em <code>zapp.n8n_config</code>. A integração só é ativada
            quando o pipeline de envio de eventos existir (contrato real, desligado por padrão).
          </p>
          <div className="flex justify-end">
            <Button variant="ghost" size="sm" onClick={loadStatus} disabled={loading}>
              {loading ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <RefreshCw className="w-3 h-3 mr-1" />}
              Verificar estado
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
