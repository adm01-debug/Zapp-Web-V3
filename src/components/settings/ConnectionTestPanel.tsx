import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { CheckCircle2, XCircle, AlertTriangle, MinusCircle, Plug, Loader2, Copy } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { getWhatsAppMode, type WhatsAppMode } from "@/lib/whatsappAdapter";

type Status = "pass" | "warn" | "fail" | "skip";
interface Check {
  id: string;
  label: string;
  status: Status;
  detail?: string;
  durationMs?: number;
}
interface TestResult {
  mode: WhatsAppMode;
  overall: Status;
  summary: Partial<Record<Status, number>>;
  durationMs: number;
  checks: Check[];
  webhookUrl: string;
}

const STATUS_META: Record<Status, { icon: typeof CheckCircle2; cls: string; label: string }> = {
  pass: { icon: CheckCircle2, cls: "text-primary", label: "OK" },
  warn: { icon: AlertTriangle, cls: "text-warning-foreground", label: "Atenção" },
  fail: { icon: XCircle, cls: "text-destructive", label: "Falha" },
  skip: { icon: MinusCircle, cls: "text-muted-foreground", label: "Ignorado" },
};

export function ConnectionTestPanel() {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<TestResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runTest = async () => {
    setRunning(true);
    setError(null);
    try {
      const mode = await getWhatsAppMode(true);
      const { data, error: invokeErr } = await supabase.functions.invoke("connection-test", {
        body: { mode },
      });
      if (invokeErr) throw invokeErr;
      setResult(data as TestResult); // ignore-audit: supabase.functions.invoke returns unknown
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      toast.error("Falha ao executar teste de conexão");
    } finally {
      setRunning(false);
    }
  };

  const copyWebhook = () => {
    if (!result?.webhookUrl) return;
    navigator.clipboard.writeText(result.webhookUrl);
    toast.success("URL do webhook copiada");
  };

  return (
    <Card className="border border-secondary/20 bg-card">
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Plug className="w-5 h-5 text-primary" />
              Teste de Conexão
            </CardTitle>
            <CardDescription>
              Verifica credenciais, permissões do provedor e entrega de webhook para o modo ativo.
            </CardDescription>
          </div>
          <Button onClick={runTest} disabled={running} size="sm">
            {running ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Testando…
              </>
            ) : (
              "Executar teste"
            )}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {running && !result && (
          <div className="space-y-2">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        )}

        {error && (
          <Alert variant="destructive">
            <AlertTitle>Erro</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {result && (
          <>
            <div className="flex flex-wrap items-center gap-2 p-3 rounded-lg border border-border/30 bg-muted/20">
              <Badge variant={result.overall === "pass" ? "default" : result.overall === "warn" ? "secondary" : "destructive"}>
                {STATUS_META[result.overall].label}
              </Badge>
              <Badge variant="outline">Modo: {result.mode === "official" ? "Oficial (Meta)" : "Não-oficial (Evolution)"}</Badge>
              <span className="text-xs text-muted-foreground">
                {result.checks.length} verificações em {result.durationMs} ms
              </span>
              <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
                <span className=" truncate max-w-[260px]" title={result.webhookUrl}>
                  {result.webhookUrl}
                </span>
                <Button aria-label="Copiar webhook" size="icon" variant="ghost" className="h-6 w-6" onClick={copyWebhook}>
                  <Copy className="h-3 w-3" />
                </Button>
              </div>
            </div>

            <ul className="space-y-2">
              {result.checks.map((c) => {
                const meta = STATUS_META[c.status];
                const Icon = meta.icon;
                return (
                  <li
                    key={c.id}
                    className="flex items-start gap-3 p-3 rounded-lg border border-border/20 hover:bg-muted/10 transition-colors"
                  >
                    <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${meta.cls}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium">{c.label}</p>
                        {typeof c.durationMs === "number" && (
                          <span className="text-xs text-muted-foreground">{c.durationMs} ms</span>
                        )}
                      </div>
                      {c.detail && (
                        <p className="text-xs text-muted-foreground mt-1 break-words">{c.detail}</p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </>
        )}

        {!result && !running && !error && (
          <p className="text-xs text-muted-foreground">
            Clique em <strong>Executar teste</strong> para validar a integração WhatsApp do workspace.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
