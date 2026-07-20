import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle2, XCircle, Loader2, RefreshCw, Database, Wifi, Shield } from "lucide-react";
import { useBackendDiagnostics, type PingResult } from "@/hooks/useBackendDiagnostics";

function extractProjectRef(url: string | undefined): string {
  if (!url) return "—";
  const match = url.match(/https?:\/\/([a-z0-9]+)\.supabase\.co/i);
  return match?.[1] ?? "—";
}

function detectBackendType(url: string | undefined): { label: string; tone: "default" | "secondary" } {
  if (!url) return { label: "Desconhecido", tone: "secondary" };
  if (url.includes(".supabase.co")) return { label: "Lovable Cloud (gerenciado)", tone: "default" };
  if (url.includes("localhost") || url.includes("127.0.0.1")) return { label: "Supabase Local", tone: "secondary" };
  return { label: "Supabase Self-hosted / Externo", tone: "secondary" };
}

/** Backend Diagnostics. */
export default function BackendDiagnostics() {
  const { restPing, authPing, dbPing, hasSession, runChecks, supabaseUrl, anonKey } =
    useBackendDiagnostics();

  const projectRef = extractProjectRef(supabaseUrl);
  const backend = detectBackendType(supabaseUrl);

  return (
    <div className="container max-w-3xl mx-auto p-6 space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Diagnóstico do Backend</h1>
          <p className="text-sm text-muted-foreground">Instância conectada e status da conexão em tempo real.</p>
        </div>
        <Button variant="outline" size="sm" onClick={runChecks}>
          <RefreshCw className="h-4 w-4 mr-2" /> Reexecutar
        </Button>
      </header>

      <Card className="p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Database className="h-4 w-4 text-primary" />
          <h2 className="font-medium">Instância</h2>
        </div>
        <Row label="Tipo de backend" value={<Badge variant={backend.tone}>{backend.label}</Badge>} />
        <Row label="VITE_SUPABASE_URL" value={<code className="text-xs break-all">{supabaseUrl ?? "não definido"}</code>} />
        <Row label="Project Ref" value={<code className="text-xs">{projectRef}</code>} />
        <Row label="Anon key" value={<code className="text-xs">{anonKey ? `${anonKey.slice(0, 12)}…${anonKey.slice(-6)}` : "não definida"}</code>} />
        <Row label="Modo" value={<code className="text-xs">{import.meta.env.MODE}</code>} />
      </Card>

      <Card className="p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Wifi className="h-4 w-4 text-primary" />
          <h2 className="font-medium">Conectividade</h2>
        </div>
        <PingRow label="REST API (/rest/v1/)" result={restPing} />
        <PingRow label="Auth (getSession)" result={authPing} />
        <PingRow label="Database (select profiles)" result={dbPing} />
      </Card>

      <Card className="p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Shield className="h-4 w-4 text-primary" />
          <h2 className="font-medium">Sessão</h2>
        </div>
        <Row
          label="Usuário autenticado"
          value={
            hasSession === null ? (
              <span className="text-muted-foreground">—</span>
            ) : hasSession ? (
              <Badge>Sim</Badge>
            ) : (
              <Badge variant="secondary">Não</Badge>
            )
          }
        />
      </Card>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right max-w-[60%]">{value}</span>
    </div>
  );
}

function PingRow({ label, result }: { label: string; result: PingResult }) {
  const icon =
    result.status === "checking" ? (
      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
    ) : result.status === "ok" ? (
      <CheckCircle2 className="h-4 w-4 text-emerald-500" />
    ) : result.status === "error" ? (
      <XCircle className="h-4 w-4 text-destructive" />
    ) : null;

  return (
    <div className="flex items-center justify-between gap-4 text-sm">
      <span className="flex items-center gap-2">
        {icon}
        {label}
      </span>
      <span className="text-right">
        {result.status === "ok" && <span className="text-emerald-600 dark:text-emerald-400">OK · {result.latencyMs}ms</span>}
        {result.status === "error" && <span className="text-destructive">{result.error ?? "falha"}</span>}
        {result.status === "checking" && <span className="text-muted-foreground">verificando…</span>}
        {result.status === "idle" && <span className="text-muted-foreground">—</span>}
      </span>
    </div>
  );
}
