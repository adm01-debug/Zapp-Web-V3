import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  getWhatsAppMode,
  invalidateWhatsAppModeCache,
  getCloudWebhookUrl,
  type WhatsAppMode,
} from "@/lib/whatsappAdapter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import {
  Copy, Loader2, ShieldCheck, Zap, AlertTriangle, CheckCircle2,
  XCircle, ExternalLink, RefreshCw, Activity,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

interface PingRow { kind: string; meta: Record<string, unknown>; created_at: string }
interface VerifyResult {
  verifyTokenConfigured: boolean;
  webhookUrl: string;
  handshake: { status: "pass" | "fail" | "skip"; httpStatus?: number; echoMatches?: boolean; durationMs?: number; error?: string };
  delivery: {
    status: "pass" | "warn";
    lastEventAt: string | null;
    lastHandshakeAt: string | null;
    counts24h: { handshake: number; event: number; invalid_signature: number; invalid_token: number };
    message: string;
    recent: PingRow[];
  };
  checkedAt: string;
}

interface SecretStatus {
  name: string;
  configured: boolean;
  length: number;
}

const SECRET_DOCS: Record<string, { label: string; description: string; where: string }> = {
  WHATSAPP_CLOUD_PHONE_NUMBER_ID: {
    label: "Phone Number ID",
    description: "ID do número do WhatsApp Business no Meta.",
    where: "Meta for Developers → seu app → WhatsApp → API Setup → Phone number ID",
  },
  WHATSAPP_CLOUD_ACCESS_TOKEN: {
    label: "Access Token",
    description: "Token permanente do System User com permissão whatsapp_business_messaging.",
    where: "Business Manager → Configurações de Negócios → Usuários do Sistema → Gerar token",
  },
  WHATSAPP_CLOUD_WEBHOOK_VERIFY_TOKEN: {
    label: "Webhook Verify Token",
    description: "String secreta que a Meta usa no handshake (GET /webhook).",
    where: "Você define livremente (ex.: UUID). Cole o mesmo valor no painel do app Meta.",
  },
  WHATSAPP_CLOUD_APP_SECRET: {
    label: "App Secret",
    description: "Chave secreta do app — usada para validar X-Hub-Signature-256 nos webhooks.",
    where: "Meta for Developers → seu app → Configurações → Básico → Chave secreta",
  },
};

export default function AdminWhatsAppModePage() {
  const { toast } = useToast();
  const [mode, setMode] = useState<WhatsAppMode>("unofficial");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [secrets, setSecrets] = useState<SecretStatus[] | null>(null);
  const [secretsLoading, setSecretsLoading] = useState(false);
  const [verify, setVerify] = useState<VerifyResult | null>(null);
  const [verifyLoading, setVerifyLoading] = useState(false);
  const webhookUrl = getCloudWebhookUrl();

  const refresh = useCallback(async () => {
    setLoading(true);
    const m = await getWhatsAppMode(true);
    setMode(m);
    setLoading(false);
  }, []);

  const refreshSecrets = useCallback(async () => {
    setSecretsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("whatsapp-cloud-secrets-status");
      if (error) throw error;
      setSecrets((data as { secrets: SecretStatus[] }).secrets);
    } catch (e) {
      toast({
        title: "Falha ao consultar secrets",
        description: e instanceof Error ? e.message : "Erro desconhecido",
        variant: "destructive",
      });
    } finally {
      setSecretsLoading(false);
    }
  }, [toast]);

  const runVerify = useCallback(async () => {
    setVerifyLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("whatsapp-cloud-webhook-verify");
      if (error) throw error;
      setVerify(data as VerifyResult);
    } catch (e) {
      toast({
        title: "Falha na verificação",
        description: e instanceof Error ? e.message : "Erro desconhecido",
        variant: "destructive",
      });
    } finally {
      setVerifyLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    document.title = "Modo WhatsApp — Configurações";
    void refresh();
    void refreshSecrets();
  }, [refresh, refreshSecrets]);

  const handleToggle = async (checked: boolean) => {
    const next: WhatsAppMode = checked ? "official" : "unofficial";
    setSaving(true);
    try {
      const { error } = await supabase.rpc(
        "rpc_set_whatsapp_mode" as unknown as Parameters<typeof supabase.rpc>[0],
        { p_mode: next } as unknown as Parameters<typeof supabase.rpc>[1],
      );
      if (error) throw error;
      invalidateWhatsAppModeCache();
      setMode(next);
      toast({
        title: "Modo atualizado",
        description: next === "official"
          ? "Sistema agora envia via WhatsApp Cloud API (oficial)."
          : "Sistema agora envia via Evolution API (não-oficial).",
      });
    } catch (e) {
      toast({
        title: "Falha ao atualizar modo",
        description: e instanceof Error ? e.message : "Erro desconhecido",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const copy = async (text: string) => {
    await navigator.clipboard.writeText(text);
    toast({ title: "Copiado", description: text });
  };

  const allConfigured = secrets ? secrets.every((s) => s.configured) : false;
  const missingCount = secrets ? secrets.filter((s) => !s.configured).length : 0;

  return (
    <div className="container mx-auto p-6 space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Modo de WhatsApp</h1>
        <p className="text-sm text-muted-foreground">
          Define como mensagens são enviadas e recebidas, e configura as credenciais do modo oficial.
        </p>
      </header>

      {/* ---- Seletor de modo ---- */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                {mode === "official" ? <ShieldCheck className="h-5 w-5 text-primary" /> : <Zap className="h-5 w-5 text-primary" />}
                Modo ativo:{" "}
                <Badge variant={mode === "official" ? "default" : "secondary"}>
                  {mode === "official" ? "Oficial (Cloud API)" : "Não-oficial (Evolution)"}
                </Badge>
              </CardTitle>
              <CardDescription>A alternância afeta envios, webhooks e templates em tempo real.</CardDescription>
            </div>
            <div className="flex items-center gap-3">
              {(loading || saving) && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
              <Switch
                checked={mode === "official"}
                disabled={loading || saving}
                onCheckedChange={handleToggle}
                aria-label="Alternar modo oficial"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-lg border p-4 space-y-2">
              <h3 className="font-medium flex items-center gap-2"><Zap className="h-4 w-4" /> Não-oficial (Evolution)</h3>
              <ul className="text-sm text-muted-foreground space-y-1 list-disc pl-5">
                <li>Envio via Evolution proxy (instância wpp2)</li>
                <li>Webhook: <code>/functions/v1/evolution-webhook</code></li>
                <li>Sem limites de templates / janelas 24h</li>
              </ul>
            </div>
            <div className="rounded-lg border p-4 space-y-2">
              <h3 className="font-medium flex items-center gap-2"><ShieldCheck className="h-4 w-4" /> Oficial (Cloud API)</h3>
              <ul className="text-sm text-muted-foreground space-y-1 list-disc pl-5">
                <li>Envio direto à Graph API da Meta</li>
                <li>Webhook: <code>/functions/v1/whatsapp-cloud-webhook</code></li>
                <li>Suporta templates aprovados e janela 24h</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ---- Webhook URL ---- */}
      {mode === "official" && (
        <Card>
          <CardHeader>
            <CardTitle>Configuração no Meta Business</CardTitle>
            <CardDescription>Cole estes valores no painel do app WhatsApp Business no Meta Developers.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Callback URL do Webhook</Label>
              <div className="flex gap-2">
                <Input readOnly value={webhookUrl} className=" text-xs" />
                <Button variant="outline" size="icon" onClick={() => copy(webhookUrl)}>
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

      {/* ---- Verificação do Webhook ---- */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5 text-primary" />
                Verificação do Webhook
              </CardTitle>
              <CardDescription>
                Valida o Verify Token (handshake da Meta) e confirma se o webhook está recebendo eventos.
              </CardDescription>
            </div>
            <Button onClick={runVerify} disabled={verifyLoading} size="sm">
              {verifyLoading
                ? <Loader2 className="h-4 w-4 animate-spin mr-2" />
                : <RefreshCw className="h-4 w-4 mr-2" />}
              Executar verificação
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {!verify && !verifyLoading && (
            <p className="text-sm text-muted-foreground">
              Clique em "Executar verificação" para checar o handshake do Verify Token e a entrega de eventos das últimas 24h.
            </p>
          )}

          {verify && (
            <>
              {/* Etapa 1: Handshake */}
              <div className="rounded-lg border p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {verify.handshake.status === "pass" && <CheckCircle2 className="h-4 w-4 text-primary" />}
                    {verify.handshake.status === "fail" && <XCircle className="h-4 w-4 text-destructive" />}
                    {verify.handshake.status === "skip" && <AlertTriangle className="h-4 w-4 text-warning-foreground" />}
                    <span className="text-sm font-medium">1. Handshake do Verify Token</span>
                  </div>
                  <Badge variant={verify.handshake.status === "pass" ? "default" : verify.handshake.status === "skip" ? "secondary" : "destructive"}>
                    {verify.handshake.status === "pass" ? "OK" : verify.handshake.status === "skip" ? "Pulado" : "Falhou"}
                  </Badge>
                </div>
                <div className="text-xs text-muted-foreground space-y-0.5 pl-6">
                  {verify.handshake.status === "pass" && (
                    <p>Echo do challenge confere e HTTP {verify.handshake.httpStatus} em {verify.handshake.durationMs}ms. O token configurado nos secrets bate com o que o webhook valida.</p>
                  )}
                  {verify.handshake.status === "fail" && (
                    <>
                      <p>HTTP {verify.handshake.httpStatus ?? "—"} • echo confere: {String(verify.handshake.echoMatches ?? false)}</p>
                      {verify.handshake.error && <p className="text-destructive">{verify.handshake.error}</p>}
                      <p>Verifique se o secret <code>WHATSAPP_CLOUD_WEBHOOK_VERIFY_TOKEN</code> está igual ao colado no painel do Meta.</p>
                    </>
                  )}
                  {verify.handshake.status === "skip" && <p>{verify.handshake.error}</p>}
                </div>
              </div>

              {/* Etapa 2: Entrega de eventos */}
              <div className="rounded-lg border p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {verify.delivery.status === "pass"
                      ? <CheckCircle2 className="h-4 w-4 text-primary" />
                      : <AlertTriangle className="h-4 w-4 text-warning-foreground" />}
                    <span className="text-sm font-medium">2. Recebimento de eventos (últimas 24h)</span>
                  </div>
                  <div className="flex gap-1.5 flex-wrap">
                    <Badge variant="outline" className="text-[10px]">eventos: {verify.delivery.counts24h.event}</Badge>
                    <Badge variant="outline" className="text-[10px]">handshakes: {verify.delivery.counts24h.handshake}</Badge>
                    {verify.delivery.counts24h.invalid_signature > 0 && (
                      <Badge variant="destructive" className="text-[10px]">assinatura inválida: {verify.delivery.counts24h.invalid_signature}</Badge>
                    )}
                    {verify.delivery.counts24h.invalid_token > 0 && (
                      <Badge variant="destructive" className="text-[10px]">token inválido: {verify.delivery.counts24h.invalid_token}</Badge>
                    )}
                  </div>
                </div>
                <p className="text-xs text-muted-foreground pl-6">{verify.delivery.message}</p>
                {verify.delivery.lastEventAt && (
                  <p className="text-[11px] text-muted-foreground/80 pl-6">
                    Último evento: {formatDistanceToNow(new Date(verify.delivery.lastEventAt), { addSuffix: true, locale: ptBR })}
                  </p>
                )}
              </div>

              {/* Histórico recente */}
              {verify.delivery.recent.length > 0 && (
                <details className="rounded-lg border p-3">
                  <summary className="text-xs font-medium cursor-pointer">Atividade recente (últimos 10 pings)</summary>
                  <ul className="mt-2 space-y-1.5 max-h-48 overflow-y-auto">
                    {verify.delivery.recent.map((p) => (
                      <li key={`${p.kind}-${p.created_at}`} className="text-[11px] flex items-center justify-between gap-2 ">
                        <span className="flex items-center gap-2">
                          <Badge
                            variant={p.kind === "event" ? "default" : p.kind.startsWith("invalid") ? "destructive" : "secondary"}
                            className="text-[9px]"
                          >
                            {p.kind}
                          </Badge>
                          <span className="text-muted-foreground truncate">{JSON.stringify(p.meta).slice(0, 80)}</span>
                        </span>
                        <span className="text-muted-foreground shrink-0">
                          {formatDistanceToNow(new Date(p.created_at), { addSuffix: true, locale: ptBR })}
                        </span>
                      </li>
                    ))}
                  </ul>
                </details>
              )}

              <p className="text-[11px] text-muted-foreground">
                Verificado em {new Date(verify.checkedAt).toLocaleTimeString("pt-BR")}.
              </p>
            </>
          )}
        </CardContent>
      </Card>

      {/* ---- Secrets ---- */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle>Credenciais Cloud API (Secrets)</CardTitle>
              <CardDescription>
                Os valores são guardados como secrets do projeto e nunca aparecem no código.
              </CardDescription>
            </div>
            {secrets && (
              <Badge variant={allConfigured ? "default" : missingCount === secrets.length ? "destructive" : "secondary"}>
                {allConfigured
                  ? "Todas configuradas"
                  : `${secrets.length - missingCount}/${secrets.length} configuradas`}
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {secretsLoading && !secrets && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Verificando secrets…
            </div>
          )}

          {secrets?.map((s) => {
            const doc = SECRET_DOCS[s.name];
            return (
              <div
                key={s.name}
                className="flex items-start justify-between gap-3 p-3 rounded-lg border border-border/30 hover:bg-muted/10 transition-colors"
              >
                <div className="flex items-start gap-3 min-w-0">
                  {s.configured
                    ? <CheckCircle2 className="h-4 w-4 mt-1 text-primary shrink-0" />
                    : <XCircle className="h-4 w-4 mt-1 text-destructive shrink-0" />}
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-medium">{doc?.label ?? s.name}</p>
                      <code className="text-[10px] text-muted-foreground">{s.name}</code>
                      {s.configured && s.length > 0 && (
                        <Badge variant="outline" className="text-[10px]">{s.length} chars</Badge>
                      )}
                    </div>
                    {doc?.description && (
                      <p className="text-xs text-muted-foreground mt-0.5">{doc.description}</p>
                    )}
                    {doc?.where && (
                      <p className="text-[11px] text-muted-foreground/70 mt-1">
                        <strong>Onde encontrar:</strong> {doc.where}
                      </p>
                    )}
                  </div>
                </div>
                <Alert className="hidden" />
              </div>
            );
          })}

          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Como adicionar/atualizar</AlertTitle>
            <AlertDescription className="text-sm space-y-2">
              <p>
                Por motivos de segurança, secrets são editados num formulário protegido fora desta tela.
                Peça ao Lovable para "configurar os secrets do WhatsApp Cloud" — você receberá um modal seguro
                para colar cada valor sem que ele apareça no chat ou no código.
              </p>
              <Button variant="outline" size="sm" onClick={refreshSecrets} disabled={secretsLoading}>
                {secretsLoading ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                Recarregar status
              </Button>
            </AlertDescription>
          </Alert>

          <p className="text-[11px] text-muted-foreground">
            <ExternalLink className="h-3 w-3 inline mr-1" />
            Após salvar/atualizar qualquer secret, as edge functions o utilizam imediatamente — não há rebuild necessário.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
