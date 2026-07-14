import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Copy, Loader2, ShieldCheck, Zap } from 'lucide-react';
import { useAdminWhatsAppMode } from './useAdminWhatsAppMode';
import { AdminWhatsAppWebhookVerifyCard } from './AdminWhatsAppWebhookVerifyCard';
import { AdminWhatsAppSecretsCard } from './AdminWhatsAppSecretsCard';

export default function AdminWhatsAppModePage() {
  const {
    mode,
    loading,
    saving,
    secrets,
    secretsLoading,
    verify,
    verifyLoading,
    webhookUrl,
    allConfigured,
    missingCount,
    refreshSecrets,
    runVerify,
    handleToggle,
    copy,
  } = useAdminWhatsAppMode();

  return (
    <div className="container mx-auto space-y-6 p-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Modo de WhatsApp</h1>
        <p className="text-sm text-muted-foreground">
          Define como mensagens são enviadas e recebidas, e configura as credenciais do modo
          oficial.
        </p>
      </header>

      {/* Mode selector */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                {mode === 'official' ? (
                  <ShieldCheck className="h-5 w-5 text-primary" />
                ) : (
                  <Zap className="h-5 w-5 text-primary" />
                )}
                Modo ativo:{' '}
                <Badge variant={mode === 'official' ? 'default' : 'secondary'}>
                  {mode === 'official' ? 'Oficial (Cloud API)' : 'Não-oficial (Evolution)'}
                </Badge>
              </CardTitle>
              <CardDescription>
                A alternância afeta envios, webhooks e templates em tempo real.
              </CardDescription>
            </div>
            <div className="flex items-center gap-3">
              {(loading || saving) && (
                <span
                  role="status"
                  aria-live="polite"
                  aria-label={saving ? 'Salvando' : 'Carregando'}
                >
                  <Loader2
                    className="h-4 w-4 animate-spin text-muted-foreground"
                    aria-hidden="true"
                  />
                </span>
              )}
              <Switch
                checked={mode === 'official'}
                disabled={loading || saving}
                onCheckedChange={handleToggle}
                aria-label="Alternar modo oficial"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2 rounded-lg border p-4">
              <h3 className="flex items-center gap-2 font-medium">
                <Zap className="h-4 w-4" /> Não-oficial (Evolution)
              </h3>
              <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                <li>Envio via Evolution proxy (instância wpp2)</li>
                <li>
                  Webhook: <code>/functions/v1/evolution-webhook</code>
                </li>
                <li>Sem limites de templates / janelas 24h</li>
              </ul>
            </div>
            <div className="space-y-2 rounded-lg border p-4">
              <h3 className="flex items-center gap-2 font-medium">
                <ShieldCheck className="h-4 w-4" /> Oficial (Cloud API)
              </h3>
              <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                <li>Envio direto à Graph API da Meta</li>
                <li>
                  Webhook: <code>/functions/v1/whatsapp-cloud-webhook</code>
                </li>
                <li>Suporta templates aprovados e janela 24h</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Webhook URL — only in official mode */}
      {mode === 'official' && (
        <Card>
          <CardHeader>
            <CardTitle>Configuração no Meta Business</CardTitle>
            <CardDescription>
              Cole estes valores no painel do app WhatsApp Business no Meta Developers.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Callback URL do Webhook</Label>
              <div className="flex gap-2">
                <Input readOnly value={webhookUrl} className="text-xs" />
                <Button
                  aria-label="Copiar URL do webhook"
                  variant="outline"
                  size="icon"
                  onClick={() => copy(webhookUrl)}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Cole no campo "Callback URL" e use o mesmo Verify Token configurado abaixo.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <AdminWhatsAppWebhookVerifyCard
        verify={verify}
        verifyLoading={verifyLoading}
        onRunVerify={runVerify}
      />

      <AdminWhatsAppSecretsCard
        secrets={secrets}
        secretsLoading={secretsLoading}
        allConfigured={allConfigured}
        missingCount={missingCount}
        onRefreshSecrets={refreshSecrets}
      />
    </div>
  );
}
