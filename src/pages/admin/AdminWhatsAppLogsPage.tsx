// @ts-nocheck
import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { RefreshCw, Search, AlertTriangle, CheckCircle2, Webhook, Send } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { whatsapp } from "@/lib/whatsappAdapter";

type ModeFilter = "all" | "official" | "unofficial";

const OFFICIAL_PROVIDERS = ["whatsapp_cloud", "cloud", "meta", "whatsapp-cloud"];
const UNOFFICIAL_PROVIDERS = ["evolution", "baileys", "evolution-api"];
const OFFICIAL_CHANNELS = ["whatsapp_cloud", "cloud", "official"];
const UNOFFICIAL_CHANNELS = ["evolution", "whatsapp", "unofficial"];

// ----- Types ----------------------------------------------------------------
interface SendLogRow {
  id: string;
  provider: string;
  instance_name: string;
  direction: string;
  remote_jid: string;
  delivery_status: string;
  http_status: number | null;
  error_code: string | null;
  error_message: string | null;
  received_at: string;
  delivered_at: string | null;
}

interface WebhookPingRow {
  id: string;
  kind: string;
  meta: Record<string, unknown> | null;
  created_at: string;
}

interface ErrorLogRow {
  id: string;
  instance_name: string;
  channel_type: string | null;
  remote_jid: string | null;
  error_code: string | null;
  error_message: string | null;
  http_status: number | null;
  retry_count: number;
  occurred_at: string;
}

// ----- Helpers --------------------------------------------------------------
function fmtTime(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "medium" });
}

function modeOfProvider(provider: string | null | undefined): ModeFilter {
  if (!provider) return "all";
  const p = provider.toLowerCase();
  if (OFFICIAL_PROVIDERS.includes(p)) return "official";
  if (UNOFFICIAL_PROVIDERS.includes(p)) return "unofficial";
  return "all";
}

function modeBadge(mode: ModeFilter) {
  if (mode === "official") return <Badge variant="default" className="bg-primary hover:bg-primary">Cloud API</Badge>;
  if (mode === "unofficial") return <Badge variant="secondary">Evolution</Badge>;
  return <Badge variant="outline">—</Badge>;
}

function statusBadge(s: string) {
  const ok = ["delivered", "read", "sent", "received"].includes(s);
  const warn = ["pending", "queued", "routing"].includes(s);
  if (ok) return <Badge variant="outline" className="border-primary text-primary">{s}</Badge>;
  if (warn) return <Badge variant="outline" className="border-warning text-warning-foreground">{s}</Badge>;
  return <Badge variant="destructive">{s}</Badge>;
}

// ----- Hooks ----------------------------------------------------------------
function useWhatsAppLogs(mode: ModeFilter, search: string) {
  const [sends, setSends] = useState<SendLogRow[]>([]);
  const [pings, setPings] = useState<WebhookPingRow[]>([]);
  const [errors, setErrors] = useState<ErrorLogRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        // Envios
        let sendQ = supabase
          .from('provider_message_log')
          .select("id,provider,instance_name,direction,remote_jid,delivery_status,http_status,error_code,error_message,received_at,delivered_at")
          .order("received_at", { ascending: false })
          .limit(150);
        if (mode === "official") sendQ = sendQ.in("provider", OFFICIAL_PROVIDERS);
        if (mode === "unofficial") sendQ = sendQ.in("provider", UNOFFICIAL_PROVIDERS);
        if (search) sendQ = sendQ.or(`remote_jid.ilike.%${search}%,error_code.ilike.%${search}%,error_message.ilike.%${search}%`);

        // Webhooks Cloud (sempre busca; filtramos no client por modo)
        const pingQ = supabase
          .from('whatsapp_cloud_webhook_pings')
          .select("id,kind,meta,created_at")
          .order("created_at", { ascending: false })
          .limit(150);

        // Erros
        let errQ = supabase
          .from('dispatch_error_logs')
          .select("id,instance_name,channel_type,remote_jid,error_code,error_message,http_status,retry_count,occurred_at")
          .order("occurred_at", { ascending: false })
          .limit(150);
        if (mode === "official") errQ = errQ.in("channel_type", OFFICIAL_CHANNELS);
        if (mode === "unofficial") errQ = errQ.in("channel_type", UNOFFICIAL_CHANNELS);
        if (search) errQ = errQ.or(`remote_jid.ilike.%${search}%,error_code.ilike.%${search}%,error_message.ilike.%${search}%`);

        const [sR, pR, eR] = await Promise.all([sendQ, pingQ, errQ]);
        if (cancelled) return;
        setSends((sR.data ?? []) as SendLogRow[]);
        // Webhook Cloud só faz sentido no modo oficial; no não-oficial fica vazio.
        setPings(mode === "unofficial" ? [] : ((pR.data ?? []) as WebhookPingRow[]));
        setErrors((eR.data ?? []) as ErrorLogRow[]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [mode, search, refreshKey]);

  return { sends, pings, errors, loading, refresh: () => setRefreshKey((k) => k + 1) };
}

// ----- Page -----------------------------------------------------------------
export default function AdminWhatsAppLogsPage() {
  const [mode, setMode] = useState<ModeFilter>("all");
  const [search, setSearch] = useState("");
  const [activeMode, setActiveMode] = useState<string>("…");
  const { sends, pings, errors, loading, refresh } = useWhatsAppLogs(mode, search);

  useEffect(() => {
    whatsapp.resolveTransport().then((r) => {
      setActiveMode(`${r.requestedMode}${r.degraded ? " (degraded → evolution)" : ""}`);
    }).catch(() => setActiveMode("desconhecido"));
  }, []);

  const counts = useMemo(() => ({
    sends: sends.length,
    pings: pings.length,
    errors: errors.length,
  }), [sends, pings, errors]);

  return (
    <div className="container mx-auto p-6 space-y-6 max-w-7xl">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Logs WhatsApp</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Envios, webhooks e erros de integração. Modo ativo: <span className=" text-foreground">{activeMode}</span>
          </p>
        </div>
        <div className="flex gap-2 items-center flex-wrap">
          <Select value={mode} onValueChange={(v) => setMode(v as ModeFilter)}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Filtrar por modo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os modos</SelectItem>
              <SelectItem value="official">Oficial (Cloud API)</SelectItem>
              <SelectItem value="unofficial">Não-oficial (Evolution)</SelectItem>
            </SelectContent>
          </Select>
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="JID, código ou erro…"
              className="pl-8 w-[260px]"
            />
          </div>
          <Button variant="outline" size="icon" onClick={refresh} aria-label="Atualizar">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      <Tabs defaultValue="sends" className="space-y-4">
        <TabsList>
          <TabsTrigger value="sends" className="gap-2">
            <Send className="h-4 w-4" /> Envios <Badge variant="secondary">{counts.sends}</Badge>
          </TabsTrigger>
          <TabsTrigger value="webhooks" className="gap-2">
            <Webhook className="h-4 w-4" /> Webhooks <Badge variant="secondary">{counts.pings}</Badge>
          </TabsTrigger>
          <TabsTrigger value="errors" className="gap-2">
            <AlertTriangle className="h-4 w-4" /> Erros <Badge variant="secondary">{counts.errors}</Badge>
          </TabsTrigger>
        </TabsList>

        {/* ---------- Envios ---------- */}
        <TabsContent value="sends">
          <Card>
            <CardHeader>
              <CardTitle>Envios e recebimentos</CardTitle>
              <CardDescription>provider_message_log — últimas 150 entradas.</CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <Skeleton className="h-64" />
              ) : sends.length === 0 ? (
                <EmptyState mode={mode} kind="envios" />
              ) : (
                <ScrollArea className="h-[60vh]">
                  <table className="w-full text-sm">
                    <thead className="text-left text-muted-foreground border-b">
                      <tr>
                        <th className="py-2 pr-3">Quando</th>
                        <th className="py-2 pr-3">Modo</th>
                        <th className="py-2 pr-3">Instância</th>
                        <th className="py-2 pr-3">Direção</th>
                        <th className="py-2 pr-3">JID</th>
                        <th className="py-2 pr-3">Status</th>
                        <th className="py-2 pr-3">HTTP</th>
                        <th className="py-2 pr-3">Erro</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sends.map((r) => (
                        <tr key={r.id} className="border-b hover:bg-muted/50">
                          <td className="py-2 pr-3 whitespace-nowrap">{fmtTime(r.received_at)}</td>
                          <td className="py-2 pr-3">{modeBadge(modeOfProvider(r.provider))}</td>
                          <td className="py-2 pr-3  text-xs">{r.instance_name}</td>
                          <td className="py-2 pr-3">{r.direction}</td>
                          <td className="py-2 pr-3  text-xs truncate max-w-[180px]">{r.remote_jid}</td>
                          <td className="py-2 pr-3">{statusBadge(r.delivery_status)}</td>
                          <td className="py-2 pr-3">{r.http_status ?? "—"}</td>
                          <td className="py-2 pr-3 text-destructive truncate max-w-[260px]">{r.error_code ?? r.error_message ?? ""}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ---------- Webhooks ---------- */}
        <TabsContent value="webhooks">
          <Card>
            <CardHeader>
              <CardTitle>Webhooks Cloud API</CardTitle>
              <CardDescription>
                whatsapp_cloud_webhook_pings — handshakes, eventos e falhas de assinatura.
                {mode === "unofficial" && " (Indisponível no modo não-oficial — use os logs do Evolution.)"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <Skeleton className="h-64" />
              ) : pings.length === 0 ? (
                <EmptyState mode={mode} kind="webhooks" />
              ) : (
                <ScrollArea className="h-[60vh]">
                  <table className="w-full text-sm">
                    <thead className="text-left text-muted-foreground border-b">
                      <tr>
                        <th className="py-2 pr-3">Quando</th>
                        <th className="py-2 pr-3">Tipo</th>
                        <th className="py-2 pr-3">Detalhes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pings.map((p) => (
                        <tr key={p.id} className="border-b hover:bg-muted/50 align-top">
                          <td className="py-2 pr-3 whitespace-nowrap">{fmtTime(p.created_at)}</td>
                          <td className="py-2 pr-3">{kindBadge(p.kind)}</td>
                          <td className="py-2 pr-3  text-xs">
                            <pre className="whitespace-pre-wrap break-all max-w-[600px]">{JSON.stringify(p.meta ?? {}, null, 0)}</pre>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ---------- Erros ---------- */}
        <TabsContent value="errors">
          <Card>
            <CardHeader>
              <CardTitle>Erros de integração</CardTitle>
              <CardDescription>dispatch_error_logs — falhas no despacho de mensagens.</CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <Skeleton className="h-64" />
              ) : errors.length === 0 ? (
                <EmptyState mode={mode} kind="erros" />
              ) : (
                <ScrollArea className="h-[60vh]">
                  <table className="w-full text-sm">
                    <thead className="text-left text-muted-foreground border-b">
                      <tr>
                        <th className="py-2 pr-3">Quando</th>
                        <th className="py-2 pr-3">Canal</th>
                        <th className="py-2 pr-3">Instância</th>
                        <th className="py-2 pr-3">JID</th>
                        <th className="py-2 pr-3">Código</th>
                        <th className="py-2 pr-3">HTTP</th>
                        <th className="py-2 pr-3">Tentativas</th>
                        <th className="py-2 pr-3">Mensagem</th>
                      </tr>
                    </thead>
                    <tbody>
                      {errors.map((r) => (
                        <tr key={r.id} className="border-b hover:bg-muted/50">
                          <td className="py-2 pr-3 whitespace-nowrap">{fmtTime(r.occurred_at)}</td>
                          <td className="py-2 pr-3">{r.channel_type ?? "—"}</td>
                          <td className="py-2 pr-3  text-xs">{r.instance_name}</td>
                          <td className="py-2 pr-3  text-xs truncate max-w-[180px]">{r.remote_jid ?? "—"}</td>
                          <td className="py-2 pr-3"><Badge variant="destructive">{r.error_code ?? "?"}</Badge></td>
                          <td className="py-2 pr-3">{r.http_status ?? "—"}</td>
                          <td className="py-2 pr-3">{r.retry_count}</td>
                          <td className="py-2 pr-3 truncate max-w-[320px]">{r.error_message}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function kindBadge(kind: string) {
  if (kind === "handshake") return <Badge className="bg-primary hover:bg-primary"><CheckCircle2 className="h-3 w-3 mr-1" />handshake</Badge>;
  if (kind === "event") return <Badge variant="secondary">event</Badge>;
  if (kind === "invalid_signature") return <Badge variant="destructive">invalid_signature</Badge>;
  if (kind === "invalid_token") return <Badge variant="destructive">invalid_token</Badge>;
  return <Badge variant="outline">{kind}</Badge>;
}

function EmptyState({ mode, kind }: { mode: ModeFilter; kind: string }) {
  return (
    <div className="text-center py-12 text-muted-foreground text-sm">
      Nenhum {kind} encontrado{mode !== "all" ? ` no modo ${mode === "official" ? "oficial" : "não-oficial"}` : ""}.
    </div>
  );
}