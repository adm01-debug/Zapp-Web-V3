import { useEffect, useMemo, useState } from "react";
import { useMountedRef } from '@/hooks/useMountedRef';
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import {
  Plus, Pencil, Pause, Play, PowerOff, Eraser, MessageSquare,
  Instagram, Send, Mail, Globe, Search, Facebook,
} from "lucide-react";
import { EvolutionFallbackStatusCard } from "@/features/admin";
import { getLogger } from "@/lib/logger";
const log = getLogger("AdminChannelsPage");

const CHANNEL_TYPES = [
  { value: "whatsapp", label: "WhatsApp", icon: MessageSquare },
  { value: "instagram", label: "Instagram", icon: Instagram },
  { value: "messenger", label: "Messenger", icon: Facebook },
  { value: "telegram", label: "Telegram", icon: Send },
  { value: "webchat", label: "Webchat", icon: Globe },
  { value: "email", label: "Email", icon: Mail },
] as const;

const ROUTING_MODES = [
  { value: "manual", label: "Manual (Sem dono)" },
  { value: "sticky", label: "Sticky (último agente)" },
  { value: "rules", label: "Regras (carteira)" },
  { value: "round_robin", label: "Round-robin" },
] as const;

type ChannelStatus = "active" | "paused" | "disabled";

interface ServiceChannel {
  id: string;
  name: string;
  display_name: string | null;
  channel_type: string;
  whatsapp_connection_id: string | null;
  default_queue_id: string | null;
  routing_mode: string;
  sticky_enabled: boolean;
  sticky_ttl_hours: number;
  status: ChannelStatus;
  is_default: boolean;
  description: string | null;
  color: string;
  paused_at: string | null;
  paused_reason: string | null;
  disabled_at: string | null;
  disabled_reason: string | null;
}

interface QueueOption { id: string; name: string; color: string }
interface WppConnOption { id: string; name: string; phone_number: string }

const STATUS_BADGE: Record<ChannelStatus, { label: string; variant: "default" | "secondary" | "destructive" }> = {
  active: { label: "Ativo", variant: "default" },
  paused: { label: "Pausado", variant: "secondary" },
  disabled: { label: "Desativado", variant: "destructive" },
};

function emptyChannel(): Partial<ServiceChannel> {
  return {
    name: "",
    channel_type: "whatsapp",
    routing_mode: "manual",
    sticky_enabled: false,
    sticky_ttl_hours: 24,
    is_default: false,
    color: "#3B82F6",
  };
}

export default function AdminChannelsPage() {
  const { toast } = useToast();
  const [channels, setChannels] = useState<ServiceChannel[]>([]);
  const [queues, setQueues] = useState<QueueOption[]>([]);
  const [wppConns, setWppConns] = useState<WppConnOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Partial<ServiceChannel> | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [actionDialog, setActionDialog] = useState<
    | { kind: "pause" | "disable" | "purge"; channel: ServiceChannel }
    | null
  >(null);
  const [actionReason, setActionReason] = useState("");

  const mountedRef = useMountedRef();

  const load = async () => {
    setLoading(true);
    try {
      const [chRes, qRes, wRes] = await Promise.all([
        (supabase.rpc as never as (n: string, args?: Record<string, unknown>) => Promise<{ data: ServiceChannel[] | null; error: { message: string } | null }>)(
          "rpc_list_service_channels",
          {
            p_status: statusFilter === "all" ? null : statusFilter,
            p_search: search.trim() || null,
          },
        ),
        supabase.from('queues').select("id,name,color").order("name"),
        supabase.from('whatsapp_connections').select("id,name,phone_number").order("name"),
      ]);
      if (!mountedRef.current) return;
      if (chRes.error) throw new Error(chRes.error.message);
      setChannels((chRes.data ?? []) as ServiceChannel[]);
      setQueues((qRes.data ?? []) as QueueOption[]);
      setWppConns((wRes.data ?? []) as WppConnOption[]);
    } catch (e) {
      log.error("Load service channels failed", e);
      toast({ title: "Erro ao carregar canais", description: (e as Error).message, variant: "destructive" });
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  };

  useEffect(() => { load();   }, [statusFilter]);

  const filteredChannels = useMemo(() => {
    if (!search.trim()) return channels;
    const q = search.toLowerCase();
    return channels.filter((c) =>
      c.name.toLowerCase().includes(q) ||
      (c.display_name?.toLowerCase().includes(q) ?? false),
    );
  }, [channels, search]);

  const save = async () => {
    if (!editing) return;
    if (!editing.name?.trim()) {
      toast({ title: "Nome é obrigatório", variant: "destructive" });
      return;
    }
    try {
      const { error } = await (supabase.rpc as never as (n: string, args: Record<string, unknown>) => Promise<{ error: { message: string } | null }>)(
        "rpc_upsert_service_channel",
        {
          p_id: editing.id ?? null,
          p_name: editing.name.trim(),
          p_display_name: editing.display_name?.trim() || null,
          p_channel_type: editing.channel_type ?? "whatsapp",
          p_whatsapp_connection_id: editing.whatsapp_connection_id ?? null,
          p_default_queue_id: editing.default_queue_id ?? null,
          p_routing_mode: editing.routing_mode ?? "manual",
          p_sticky_enabled: !!editing.sticky_enabled,
          p_sticky_ttl_hours: editing.sticky_ttl_hours ?? 24,
          p_is_default: !!editing.is_default,
          p_description: editing.description?.trim() || null,
          p_color: editing.color ?? "#3B82F6",
        },
      );
      if (error) throw new Error(error.message);
      toast({ title: editing.id ? "Canal atualizado" : "Canal criado" });
      setEditing(null);
      load();
    } catch (e) {
      toast({ title: "Erro ao salvar", description: (e as Error).message, variant: "destructive" });
    }
  };

  const runAction = async () => {
    if (!actionDialog) return;
    const { kind, channel } = actionDialog;
    try {
      const rpcName =
        kind === "pause" ? "rpc_pause_service_channel" :
        kind === "disable" ? "rpc_disable_service_channel" :
        "rpc_purge_channel_sticky";
      const args: Record<string, unknown> =
        kind === "purge"
          ? { p_id: channel.id }
          : { p_id: channel.id, p_reason: actionReason.trim() || null };
      const { error } = await (supabase.rpc as never as (n: string, a: Record<string, unknown>) => Promise<{ error: { message: string } | null }>)(rpcName, args);
      if (error) throw new Error(error.message);
      toast({
        title:
          kind === "pause" ? "Canal pausado" :
          kind === "disable" ? "Canal desativado" :
          "Sticky removido",
      });
      setActionDialog(null);
      setActionReason("");
      load();
    } catch (e) {
      toast({ title: "Erro", description: (e as Error).message, variant: "destructive" });
    }
  };

  const reactivate = async (channel: ServiceChannel) => {
    try {
      const { error } = await (supabase.rpc as never as (n: string, a: Record<string, unknown>) => Promise<{ error: { message: string } | null }>)(
        "rpc_reactivate_service_channel",
        { p_id: channel.id },
      );
      if (error) throw new Error(error.message);
      toast({ title: "Canal reativado" });
      load();
    } catch (e) {
      toast({ title: "Erro", description: (e as Error).message, variant: "destructive" });
    }
  };

  const channelIcon = (type: string) => {
    const found = CHANNEL_TYPES.find((t) => t.value === type);
    const Icon = found?.icon ?? MessageSquare;
    return <Icon className="w-4 h-4" />;
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold">Canais de Atendimento</h1>
          <p className="text-muted-foreground">
            Crie, edite, pause ou desative canais. Configure fila padrão e sticky agent por canal.
          </p>
        </div>
        <Button onClick={() => setEditing(emptyChannel())}>
          <Plus className="w-4 h-4 mr-2" /> Novo canal
        </Button>
      </div>

      <EvolutionFallbackStatusCard />

      {/* Filtros */}
      <Card>
        <CardContent className="pt-6 flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[220px]">
            <Label className="text-xs">Buscar</Label>
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && load()}
                placeholder="Nome do canal…"
                className="pl-8"
              />
            </div>
          </div>
          <div className="w-[180px]">
            <Label className="text-xs">Status</Label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="active">Ativos</SelectItem>
                <SelectItem value="paused">Pausados</SelectItem>
                <SelectItem value="disabled">Desativados</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button variant="outline" onClick={load}>Atualizar</Button>
        </CardContent>
      </Card>

      {loading ? (
        <p className="text-muted-foreground py-8 text-center">Carregando…</p>
      ) : filteredChannels.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Nenhum canal encontrado.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {filteredChannels.map((ch) => {
            const queue = queues.find((q) => q.id === ch.default_queue_id);
            const wpp = wppConns.find((w) => w.id === ch.whatsapp_connection_id);
            const statusInfo = STATUS_BADGE[ch.status];
            return (
              <Card key={ch.id}>
                <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-3">
                  <div className="flex items-center gap-3">
                    <span
                      className="w-9 h-9 rounded-full grid place-items-center text-foreground"
                      style={{ backgroundColor: ch.color }}
                      aria-hidden
                    >
                      {channelIcon(ch.channel_type)}
                    </span>
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        {ch.display_name || ch.name}
                        {ch.is_default && <Badge variant="outline">padrão</Badge>}
                        <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
                      </CardTitle>
                      <p className="text-xs text-muted-foreground">
                        {ch.channel_type} • {wpp ? `${wpp.name} (${wpp.phone_number})` : "sem conexão WhatsApp"}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <Button size="sm" variant="outline" onClick={() => setEditing(ch)}>
                      <Pencil className="w-4 h-4 mr-1" /> Editar
                    </Button>
                    {ch.status === "active" && (
                      <>
                        <Button size="sm" variant="outline" onClick={() => { setActionDialog({ kind: "pause", channel: ch }); setActionReason(""); }}>
                          <Pause className="w-4 h-4 mr-1" /> Pausar
                        </Button>
                        <Button size="sm" variant="destructive" onClick={() => { setActionDialog({ kind: "disable", channel: ch }); setActionReason(""); }}>
                          <PowerOff className="w-4 h-4 mr-1" /> Desativar
                        </Button>
                      </>
                    )}
                    {ch.status !== "active" && (
                      <Button size="sm" variant="default" onClick={() => reactivate(ch)}>
                        <Play className="w-4 h-4 mr-1" /> Reativar
                      </Button>
                    )}
                    {ch.sticky_enabled && (
                      <Button size="sm" variant="ghost" onClick={() => setActionDialog({ kind: "purge", channel: ch })}>
                        <Eraser className="w-4 h-4 mr-1" /> Limpar sticky
                      </Button>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="grid sm:grid-cols-3 gap-4 text-sm">
                  <div>
                    <Label className="text-xs text-muted-foreground">Fila padrão</Label>
                    <p className="font-medium">
                      {queue ? (
                        <span className="inline-flex items-center gap-1">
                          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: queue.color }} />
                          {queue.name}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">Sem fila</span>
                      )}
                    </p>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Roteamento</Label>
                    <p className="font-medium">
                      {ROUTING_MODES.find((r) => r.value === ch.routing_mode)?.label ?? ch.routing_mode}
                    </p>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Sticky agent</Label>
                    <p className="font-medium">
                      {ch.sticky_enabled ? `Ativo • TTL ${ch.sticky_ttl_hours}h` : "Desligado"}
                    </p>
                  </div>
                  {ch.status === "paused" && ch.paused_reason && (
                    <p className="sm:col-span-3 text-xs text-muted-foreground">
                      Pausado: {ch.paused_reason}
                    </p>
                  )}
                  {ch.status === "disabled" && ch.disabled_reason && (
                    <p className="sm:col-span-3 text-xs text-muted-foreground">
                      Desativado: {ch.disabled_reason}
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Sheet criar/editar */}
      <Sheet open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{editing?.id ? "Editar canal" : "Novo canal"}</SheetTitle>
            <SheetDescription>
              Configure o canal, sua fila padrão e a política de sticky agent.
            </SheetDescription>
          </SheetHeader>

          {editing && (
            <div className="space-y-4 py-4">
              <div>
                <Label>Nome *</Label>
                <Input value={editing.name ?? ""} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
              </div>
              <div>
                <Label>Nome de exibição</Label>
                <Input value={editing.display_name ?? ""} onChange={(e) => setEditing({ ...editing, display_name: e.target.value })} />
              </div>
              <div>
                <Label>Tipo</Label>
                <Select value={editing.channel_type ?? "whatsapp"} onValueChange={(v) => setEditing({ ...editing, channel_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CHANNEL_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {editing.channel_type === "whatsapp" && (
                <div>
                  <Label>Conexão WhatsApp</Label>
                  <Select
                    value={editing.whatsapp_connection_id ?? "none"}
                    onValueChange={(v) => setEditing({ ...editing, whatsapp_connection_id: v === "none" ? null : v })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— nenhuma —</SelectItem>
                      {wppConns.map((w) => (
                        <SelectItem key={w.id} value={w.id}>{w.name} ({w.phone_number})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div>
                <Label>Fila padrão</Label>
                <Select
                  value={editing.default_queue_id ?? "none"}
                  onValueChange={(v) => setEditing({ ...editing, default_queue_id: v === "none" ? null : v })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sem fila padrão</SelectItem>
                    {queues.map((q) => (
                      <SelectItem key={q.id} value={q.id}>{q.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">
                  Regras de carteira (Configurações &gt; Regras) podem sobrescrever este padrão.
                </p>
              </div>
              <div>
                <Label>Modo de roteamento</Label>
                <Select value={editing.routing_mode ?? "manual"} onValueChange={(v) => setEditing({ ...editing, routing_mode: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ROUTING_MODES.map((m) => (
                      <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="rounded-md border p-3 space-y-3 bg-muted/30">
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-sm font-semibold">Sticky agent</Label>
                    <p className="text-xs text-muted-foreground">
                      Mantém o contato com o último atendente que falou com ele.
                    </p>
                  </div>
                  <Switch
                    checked={!!editing.sticky_enabled}
                    onCheckedChange={(v) => setEditing({ ...editing, sticky_enabled: v })}
                  />
                </div>
                {editing.sticky_enabled && (
                  <div>
                    <Label className="text-xs">TTL (horas)</Label>
                    <Input
                      type="number"
                      min={1}
                      max={720}
                      value={editing.sticky_ttl_hours ?? 24}
                      onChange={(e) => setEditing({ ...editing, sticky_ttl_hours: Math.max(1, Math.min(720, Number(e.target.value) || 24)) })}
                    />
                  </div>
                )}
              </div>

              <div>
                <Label>Cor</Label>
                <Input type="color" value={editing.color ?? "#3B82F6"} onChange={(e) => setEditing({ ...editing, color: e.target.value })} />
              </div>
              <div>
                <Label>Descrição</Label>
                <Textarea value={editing.description ?? ""} onChange={(e) => setEditing({ ...editing, description: e.target.value })} rows={2} />
              </div>
              <div className="flex items-center justify-between">
                <Label>Padrão para este tipo</Label>
                <Switch checked={!!editing.is_default} onCheckedChange={(v) => setEditing({ ...editing, is_default: v })} />
              </div>
            </div>
          )}

          <SheetFooter className="gap-2">
            <Button variant="outline" onClick={() => setEditing(null)}>Cancelar</Button>
            <Button onClick={save}>Salvar</Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* Confirmação de ações destrutivas */}
      <AlertDialog open={!!actionDialog} onOpenChange={(o) => { if (!o) { setActionDialog(null); setActionReason(""); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {actionDialog?.kind === "pause" && "Pausar canal?"}
              {actionDialog?.kind === "disable" && "Desativar canal?"}
              {actionDialog?.kind === "purge" && "Limpar sticky deste canal?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {actionDialog?.kind === "pause" && "O canal some da UI principal mas a conexão continua recebendo mensagens em background. Pode ser reativado a qualquer momento."}
              {actionDialog?.kind === "disable" && "O canal será desativado E a conexão WhatsApp será marcada como desconectada. Você precisará reconectar (QR Code) para voltar a usar."}
              {actionDialog?.kind === "purge" && "Todos os vínculos sticky deste canal serão removidos. Próximas mensagens entram pelo modo de roteamento configurado."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {actionDialog?.kind !== "purge" && (
            <div className="py-2">
              <Label className="text-xs">Motivo (opcional, fica no audit log)</Label>
              <Textarea value={actionReason} onChange={(e) => setActionReason(e.target.value)} rows={2} placeholder="Ex.: manutenção programada" />
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={runAction}>
              {actionDialog?.kind === "purge" ? "Limpar" : "Confirmar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
