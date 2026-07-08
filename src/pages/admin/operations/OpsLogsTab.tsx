// @ts-nocheck — strict-mode retrofit pendente (ver docs/STRICT_MODE_BACKLOG.md)
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { RefreshCw, Search } from "lucide-react";
import { toast } from "sonner";

const ENTITY_TYPES = [
  { value: "all", label: "Todas as entidades" },
  { value: "service_channel", label: "Canais" },
  { value: "queue", label: "Filas" },
  { value: "channel_queue", label: "Vínculo canal↔fila" },
  { value: "sticky_assignment", label: "Sticky" },
  { value: "message_reaction", label: "Reações (Analytics)" },
];

const PML_STATUS = [
  { value: "all", label: "Todos os status" },
  { value: "delivered", label: "Entregue" },
  { value: "pending", label: "Pendente" },
  { value: "failed", label: "Falha" },
  { value: "error", label: "Erro" },
];

type AuditRow = {
  id: string;
  user_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  created_at: string;
  details: unknown;
};

type PmlRow = {
  id: string;
  provider: string;
  instance_name: string | null;
  direction: string;
  remote_jid: string | null;
  delivery_status: string | null;
  http_status: number | null;
  error_message: string | null;
  received_at: string;
};

export function OpsLogsTab() {
  return (
    <Tabs defaultValue="audit" className="w-full">
      <TabsList>
        <TabsTrigger value="audit">Configuração (Audit)</TabsTrigger>
        <TabsTrigger value="pml">Mensageria (PML)</TabsTrigger>
      </TabsList>
      <TabsContent value="audit" className="mt-4">
        <AuditPanel />
      </TabsContent>
      <TabsContent value="pml" className="mt-4">
        <PmlPanel />
      </TabsContent>
    </Tabs>
  );
}

function AuditPanel() {
  const [entity, setEntity] = useState("all");
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    let q = supabase
      .from('audit_logs')
      .select("id,user_id,action,entity_type,entity_id,created_at,details")
      .order("created_at", { ascending: false })
      .limit(100);
    if (entity === "all") {
      q = q.in("entity_type", [
        "service_channel",
        "queue",
        "channel_queue",
        "sticky_assignment",
        "message_reaction",
      ]);
    } else {
      q = q.eq("entity_type", entity);
    }
    if (search.trim()) q = q.ilike("action", `%${search.trim()}%`);
    const { data, error } = await q;
    if (error) toast.error("Erro ao carregar audit: " + error.message);
    setRows((data as AuditRow[]) ?? []);
    setLoading(false);
  }, [entity, search]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3 flex-wrap">
        <CardTitle className="text-base">Eventos de configuração</CardTitle>
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={entity} onValueChange={setEntity}>
            <SelectTrigger className="w-[200px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ENTITY_TYPES.map((e) => (
                <SelectItem key={e.value} value={e.value}>
                  {e.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="relative">
            <Search className="h-3.5 w-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar ação..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void load(); }}
              className="pl-7 w-[180px]"
            />
          </div>
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-40" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Quando</TableHead>
                <TableHead>Entidade</TableHead>
                <TableHead>Ação</TableHead>
                <TableHead>Entity ID</TableHead>
                <TableHead>Usuário</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">
                    Nenhum evento encontrado
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-xs whitespace-nowrap">
                      {new Date(r.created_at).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{r.entity_type}</Badge>
                    </TableCell>
                    <TableCell className="font-medium">{r.action}</TableCell>
                    <TableCell className=" text-xs">
                      {r.entity_id?.slice(0, 8) ?? "—"}
                    </TableCell>
                    <TableCell className=" text-xs">
                      {r.user_id?.slice(0, 8) ?? "system"}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function PmlPanel() {
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<PmlRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    let q = supabase
      .from('provider_message_log')
      .select(
        "id,provider,instance_name,direction,remote_jid,delivery_status,http_status,error_message,received_at",
      )
      .order("received_at", { ascending: false })
      .limit(100);
    if (status !== "all") q = q.eq("delivery_status", status);
    if (search.trim()) q = q.ilike("instance_name", `%${search.trim()}%`);
    const { data, error } = await q;
    if (error) toast.error("Erro ao carregar PML: " + error.message);
    setRows((data as PmlRow[]) ?? []);
    setLoading(false);
  }, [status, search]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3 flex-wrap">
        <CardTitle className="text-base">Eventos de mensageria</CardTitle>
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PML_STATUS.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="relative">
            <Search className="h-3.5 w-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar canal..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void load(); }}
              className="pl-7 w-[180px]"
            />
          </div>
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-40" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Quando</TableHead>
                <TableHead>Canal</TableHead>
                <TableHead>Direção</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>HTTP</TableHead>
                <TableHead>Erro</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    Nenhum evento encontrado
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-xs whitespace-nowrap">
                      {new Date(r.received_at).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium">{r.instance_name ?? "—"}</span>
                        <span className="text-xs text-muted-foreground">{r.provider}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={r.direction === "inbound" ? "secondary" : "outline"}>
                        {r.direction}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          r.delivery_status === "delivered"
                            ? "default"
                            : r.delivery_status === "failed" || r.delivery_status === "error"
                            ? "destructive"
                            : "outline"
                        }
                      >
                        {r.delivery_status ?? "—"}
                      </Badge>
                    </TableCell>
                    <TableCell className="tabular-nums">{r.http_status ?? "—"}</TableCell>
                    <TableCell className="text-xs text-destructive max-w-[280px] truncate">
                      {r.error_message ?? "—"}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}