import { useEffect, useMemo, useState } from "react";
import { useAdminChannels, type ServiceChannel, type ChannelStatus } from '@/hooks/admin/useAdminChannels';
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
import { log } from "@/lib/logger";

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
  const [editing, setEditing] = useState<Partial<ServiceChannel> | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [actionDialog, setActionDialog] = useState<
    | { kind: "pause" | "disable" | "purge"; channel: ServiceChannel }
    | null
  >(null);
  const [actionReason, setActionReason] = useState("");

  const { channels, filteredChannels, queues, wppConns, loading, load, save, runAction, reactivate } = useAdminChannels(statusFilter, search);

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
            <Label htmlFor="channel-search" className="text-xs">Buscar</Label>
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                id="channel-search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && load()}
                placeholder="Nome do canal…"
                className="pl-8"
              />
            </div>
          </div>
          <div className="w-[180px]">
            <Label htmlFor="channel-status-filter" className="text-xs">Status</Label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger id="channel-status-filter"><SelectValue /></SelectTrigger>
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
                <Label htmlFor="ch-name">Nome *</Label>
                <Input id="ch-name" value={editing.name ?? ""} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
              </div>
              <div>
                <Label htmlFor="ch-display-name">Nome de exibição</Label>
                <Input id="ch-display-name" value={editing.display_name ?? ""} onChange={(e) => setEditing({ ...editing, display_name: e.target.value })} />
              </div>
              <div>
                <Label htmlFor="ch-type">Tipo</Label>
                <Select value={editing.channel_type ?? "whatsapp"} onValueChange={(v) => setEditing({ ...editing, channel_type: v })}>
                  <SelectTrigger id="ch-type"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CHANNEL_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {editing.channel_type === "whatsapp" && (
                <div>
                  <Label htmlFor="ch-wpp-conn">Conexão WhatsApp</Label>
                  <Select
                    value={editing.whatsapp_connection_id ?? "none"}
                    onValueChange={(v) => setEditing({ ...editing, whatsapp_connection_id: v === "none" ? null : v })}
                  >
                    <SelectTrigger id="ch-wpp-conn"><SelectValue /></SelectTrigger>
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
                <Label htmlFor="ch-default-queue">Fila padrão</Label>
                <Select
                  value={editing.default_queue_id ?? "none"}
                  onValueChange={(v) => setEditing({ ...editing, default_queue_id: v === "none" ? null : v })}
                >
                  <SelectTrigger id="ch-default-queue"><SelectValue /></SelectTrigger>
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
                <Label htmlFor="ch-routing-mode">Modo de roteamento</Label>
                <Select value={editing.routing_mode ?? "manual"} onValueChange={(v) => setEditing({ ...editing, routing_mode: v })}>
                  <SelectTrigger id="ch-routing-mode"><SelectValue /></SelectTrigger>
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
                    <Label htmlFor="ch-sticky-enabled" className="text-sm font-semibold">Sticky agent</Label>
                    <p className="text-xs text-muted-foreground">
                      Mantém o contato com o último atendente que falou com ele.
                    </p>
                  </div>
                  <Switch
                    id="ch-sticky-enabled"
                    checked={!!editing.sticky_enabled}
                    onCheckedChange={(v) => setEditing({ ...editing, sticky_enabled: v })}
                  />
                </div>
                {editing.sticky_enabled && (
                  <div>
                    <Label htmlFor="ch-sticky-ttl" className="text-xs">TTL (horas)</Label>
                    <Input
                      id="ch-sticky-ttl"
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
                <Label htmlFor="ch-color">Cor</Label>
                <Input id="ch-color" type="color" value={editing.color ?? "#3B82F6"} onChange={(e) => setEditing({ ...editing, color: e.target.value })} />
              </div>
              <div>
                <Label htmlFor="ch-description">Descrição</Label>
                <Textarea id="ch-description" value={editing.description ?? ""} onChange={(e) => setEditing({ ...editing, description: e.target.value })} rows={2} />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="ch-is-default">Padrão para este tipo</Label>
                <Switch id="ch-is-default" checked={!!editing.is_default} onCheckedChange={(v) => setEditing({ ...editing, is_default: v })} />
              </div>
            </div>
          )}

          <SheetFooter className="gap-2">
            <Button variant="outline" onClick={() => setEditing(null)}>Cancelar</Button>
            <Button onClick={() => { void (async () => { if (await save(editing)) setEditing(null); })(); }}>Salvar</Button>
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
              <Label htmlFor="action-reason" className="text-xs">Motivo (opcional, fica no audit log)</Label>
              <Textarea id="action-reason" value={actionReason} onChange={(e) => setActionReason(e.target.value)} rows={2} placeholder="Ex.: manutenção programada" />
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => { void (async () => { if (await runAction(actionDialog, actionReason)) { setActionDialog(null); setActionReason(""); } })(); }}>
              {actionDialog?.kind === "purge" ? "Limpar" : "Confirmar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
