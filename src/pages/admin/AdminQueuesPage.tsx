import { useEffect, useState } from "react";
import { useMountedRef } from '@/hooks/useMountedRef';
import { supabase } from "@/integrations/supabase/client";
import { safeClient } from '@/integrations/supabase/safeClient';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, Users, X, Pause, Play, Radio } from "lucide-react";

type QueueStatus = "active" | "paused" | "archived";
type DistAlgo = "round_robin" | "least_busy" | "longest_idle" | "manual_pull";

interface Queue {
  id: string;
  name: string;
  description: string | null;
  color: string;
  is_active: boolean;
  priority: number;
  max_wait_time_minutes: number;
  status: QueueStatus;
  distribution_algorithm: DistAlgo;
  department_id: string | null;
  max_queue_size: number | null;
  max_wait_seconds: number | null;
  max_per_queue_per_agent: number | null;
  overflow_queue_id: string | null;
  paused_reason: string | null;
}

interface Profile { id: string; name: string; avatar_url: string | null }
interface QueueMember { id: string; queue_id: string; profile_id: string; profile?: Profile }
interface QueueSkill { id: string; queue_id: string; skill_name: string; min_level: number }
interface Department { id: string; name: string }
interface ServiceChannel { id: string; name: string; channel_type: string; default_queue_id: string | null }
interface ChannelQueue { id: string; channel_id: string; queue_id: string; priority: number; is_active: boolean }

const ALGO_LABEL: Record<DistAlgo, string> = {
  round_robin: "Round-robin",
  least_busy: "Menos ocupado",
  longest_idle: "Mais ocioso",
  manual_pull: "Puxar manualmente",
};

export default function AdminQueuesPage() {
  const { toast } = useToast();
  const [queues, setQueues] = useState<Queue[]>([]);
  const [members, setMembers] = useState<QueueMember[]>([]);
  const [skills, setSkills] = useState<QueueSkill[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [channels, setChannels] = useState<ServiceChannel[]>([]);
  const [channelQueues, setChannelQueues] = useState<ChannelQueue[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Partial<Queue> | null>(null);
  const [memberDialog, setMemberDialog] = useState<Queue | null>(null);
  const [newSkill, setNewSkill] = useState<{ name: string; level: number }>({ name: "", level: 1 });
  const [newMemberId, setNewMemberId] = useState<string>("");
  const [newChannelId, setNewChannelId] = useState<string>("");

  const mountedRef = useMountedRef();

  const load = async () => {
    setLoading(true);
    const [q, m, s, p, d, c, cq] = await Promise.all([
      safeClient.from<Queue>('queues', (sq) => sq.select("*").order("priority", { ascending: false })),
      supabase.from('queue_members').select("id,queue_id,profile_id,profile:profiles(id,name,avatar_url)"),
      supabase.from('queue_skill_requirements').select("*"),
      supabase.from('profiles').select("id,name,avatar_url").eq("is_active", true).order("name"),
      supabase.from('departments').select("id,name").order("name"),
      safeClient.from<ServiceChannel>('service_channels', (sq) => sq.select("id,name,channel_type,default_queue_id").neq("status", "archived").order("name")),
      safeClient.from<ChannelQueue>('channel_queues', (sq) => sq.select("*")),
    ]);
    if (!mountedRef.current) return;
    setQueues(q.data);
    setMembers((m.data ?? []) as unknown as QueueMember[]);
    setSkills((s.data ?? []) as QueueSkill[]);
    setProfiles((p.data ?? []) as Profile[]);
    setDepartments((d.data ?? []) as Department[]);
    setChannels(c.data);
    setChannelQueues(cq.data);
    setLoading(false);
  };

  useEffect(() => { void load(); }, []);

  const save = async () => {
    if (!editing?.name) {
      toast({ title: "Nome obrigatório", variant: "destructive" });
      return;
    }
    const payload = {
      name: editing.name,
      description: editing.description ?? null,
      color: editing.color ?? "#3B82F6",
      is_active: editing.is_active ?? true,
      priority: editing.priority ?? 0,
      max_wait_time_minutes: editing.max_wait_time_minutes ?? 30,
      distribution_algorithm: editing.distribution_algorithm ?? "least_busy",
      department_id: editing.department_id ?? null,
      max_queue_size: editing.max_queue_size ?? null,
      max_wait_seconds: editing.max_wait_seconds ?? null,
      max_per_queue_per_agent: editing.max_per_queue_per_agent ?? null,
      overflow_queue_id: editing.overflow_queue_id ?? null,
    };
    const queueId = editing.id;
    const { error } = queueId
      ? await safeClient.from('queues', (sq) => sq.update(payload).eq("id", queueId))
      : await safeClient.from('queues', (sq) => sq.insert(payload));
    if (error) {
      toast({ title: "Erro ao salvar fila", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: editing.id ? "Fila atualizada" : "Fila criada" });
    setEditing(null);
    load();
  };

  const remove = async (id: string) => {
    if (!confirm("Excluir esta fila? Membros, regras e vínculos serão removidos.")) return;
    const { error } = await supabase.from('queues').delete().eq("id", id);
    if (error) {
      toast({ title: "Erro ao excluir", description: error.message, variant: "destructive" });
      return;
    }
    load();
  };

  const togglePause = async (q: Queue) => {
    const fn = q.status === "paused" ? "rpc_resume_queue" : "rpc_pause_queue";
    const args = q.status === "paused"
      ? { p_queue_id: q.id }
      : { p_queue_id: q.id, p_reason: prompt("Motivo da pausa (opcional)") || null };
    const { error } = await supabase.rpc(fn as never, args as never);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: q.status === "paused" ? "Fila retomada" : "Fila pausada" });
    load();
  };

  const addMember = async () => {
    if (!memberDialog || !newMemberId) return;
    const { error } = await supabase.from('queue_members').insert({
      queue_id: memberDialog.id, profile_id: newMemberId,
    } as never);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }
    setNewMemberId("");
    load();
  };

  const removeMember = async (id: string) => {
    await supabase.from('queue_members').delete().eq("id", id);
    load();
  };

  const addSkill = async () => {
    if (!memberDialog || !newSkill.name.trim()) return;
    const { error } = await supabase.from('queue_skill_requirements').insert({
      queue_id: memberDialog.id, skill_name: newSkill.name.trim(), min_level: newSkill.level,
    } as never);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }
    setNewSkill({ name: "", level: 1 });
    load();
  };

  const removeSkill = async (id: string) => {
    await supabase.from('queue_skill_requirements').delete().eq("id", id);
    load();
  };

  const linkChannel = async () => {
    if (!memberDialog || !newChannelId) return;
    const { error } = await supabase.rpc("rpc_link_channel_queue" as never, {
      p_channel_id: newChannelId, p_queue_id: memberDialog.id, p_priority: 0, p_is_active: true,
    } as never);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }
    setNewChannelId("");
    load();
  };

  const unlinkChannel = async (channelId: string) => {
    if (!memberDialog) return;
    const { error } = await supabase.rpc("rpc_unlink_channel_queue" as never, {
      p_channel_id: channelId, p_queue_id: memberDialog.id,
    } as never);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }
    load();
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Filas de Atendimento</h1>
          <p className="text-muted-foreground">
            Capacidade, status, distribuição e vínculo a canais de atendimento.
          </p>
        </div>
        <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
          <DialogTrigger asChild>
            <Button onClick={() => setEditing({
              is_active: true, color: "#3B82F6", priority: 0, max_wait_time_minutes: 30,
              status: "active", distribution_algorithm: "least_busy",
            })}>
              <Plus className="w-4 h-4 mr-2" /> Nova fila
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-xl">
            <DialogHeader>
              <DialogTitle>{editing?.id ? "Editar fila" : "Nova fila"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-2">
              <div>
                <Label>Nome</Label>
                <Input value={editing?.name ?? ""} onChange={(e) => setEditing({ ...editing!, name: e.target.value })} />
              </div>
              <div>
                <Label>Descrição</Label>
                <Input value={editing?.description ?? ""} onChange={(e) => setEditing({ ...editing!, description: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Cor</Label>
                  <Input type="color" value={editing?.color ?? "#3B82F6"} onChange={(e) => setEditing({ ...editing!, color: e.target.value })} />
                </div>
                <div>
                  <Label>Prioridade</Label>
                  <Input type="number" value={editing?.priority ?? 0} onChange={(e) => setEditing({ ...editing!, priority: Number(e.target.value) })} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Algoritmo de distribuição</Label>
                  <Select
                    value={editing?.distribution_algorithm ?? "least_busy"}
                    onValueChange={(v) => setEditing({ ...editing!, distribution_algorithm: v as DistAlgo })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(Object.keys(ALGO_LABEL) as DistAlgo[]).map((k) => (
                        <SelectItem key={k} value={k}>{ALGO_LABEL[k]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Departamento (elegibilidade)</Label>
                  <Select
                    value={editing?.department_id ?? "none"}
                    onValueChange={(v) => setEditing({ ...editing!, department_id: v === "none" ? null : v })}
                  >
                    <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Todos os agentes</SelectItem>
                      {departments.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label>Tamanho máx. da fila</Label>
                  <Input type="number" placeholder="Ilimitado"
                    value={editing?.max_queue_size ?? ""}
                    onChange={(e) => setEditing({ ...editing!, max_queue_size: e.target.value ? Number(e.target.value) : null })} />
                </div>
                <div>
                  <Label>Espera máx. (s)</Label>
                  <Input type="number" placeholder="Ilimitado"
                    value={editing?.max_wait_seconds ?? ""}
                    onChange={(e) => setEditing({ ...editing!, max_wait_seconds: e.target.value ? Number(e.target.value) : null })} />
                </div>
                <div>
                  <Label>Máx. por agente</Label>
                  <Input type="number" placeholder="Sem limite"
                    value={editing?.max_per_queue_per_agent ?? ""}
                    onChange={(e) => setEditing({ ...editing!, max_per_queue_per_agent: e.target.value ? Number(e.target.value) : null })} />
                </div>
              </div>

              <div>
                <Label>Fila de overflow</Label>
                <Select
                  value={editing?.overflow_queue_id ?? "none"}
                  onValueChange={(v) => setEditing({ ...editing!, overflow_queue_id: v === "none" ? null : v })}
                >
                  <SelectTrigger><SelectValue placeholder="Nenhuma" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nenhuma</SelectItem>
                    {queues.filter((q) => q.id !== editing?.id).map((q) => (
                      <SelectItem key={q.id} value={q.id}>{q.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Tempo máx. de espera legado (min)</Label>
                <Input type="number" value={editing?.max_wait_time_minutes ?? 30}
                  onChange={(e) => setEditing({ ...editing!, max_wait_time_minutes: Number(e.target.value) })} />
              </div>

              <div className="flex items-center justify-between">
                <Label>Ativa</Label>
                <Switch checked={editing?.is_active ?? true} onCheckedChange={(v) => setEditing({ ...editing!, is_active: v })} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditing(null)}>Cancelar</Button>
              <Button onClick={save}>Salvar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <p className="text-muted-foreground">Carregando…</p>
      ) : (
        <div className="grid gap-4">
          {queues.map((q) => {
            const qMembers = members.filter((m) => m.queue_id === q.id);
            const qSkills = skills.filter((s) => s.queue_id === q.id);
            const qChannels = channelQueues.filter((cq) => cq.queue_id === q.id && cq.is_active);
            const defaultIn = channels.filter((c) => c.default_queue_id === q.id);
            const isPaused = q.status === "paused";
            return (
              <Card key={q.id} className={isPaused ? "opacity-70 border-warning/40" : undefined}>
                <CardHeader className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full" style={{ background: q.color }} />
                      {q.name}
                      <Badge variant={isPaused ? "secondary" : "default"} className="whitespace-normal h-auto py-0.5 break-words max-w-[120px]">
                        {isPaused ? "Pausada" : "Ativa"}
                      </Badge>
                      <Badge variant="outline" className="whitespace-normal h-auto py-0.5 break-words max-w-[150px]">{ALGO_LABEL[q.distribution_algorithm] ?? q.distribution_algorithm}</Badge>
                      <Badge variant="outline" className="whitespace-normal h-auto py-0.5 break-words">prioridade {q.priority}</Badge>
                    </CardTitle>
                    {q.description && <p className="text-sm text-muted-foreground mt-1">{q.description}</p>}
                    {isPaused && q.paused_reason && (
                      <p className="text-xs text-warning mt-1">Motivo: {q.paused_reason}</p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => void togglePause(q)}>
                      {isPaused ? <><Play className="w-4 h-4 mr-1" />Retomar</> : <><Pause className="w-4 h-4 mr-1" />Pausar</>}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setMemberDialog(q)}>
                      <Users className="w-4 h-4 mr-1" /> Membros & Canais
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => setEditing(q)}>
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => void remove(q.id)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline">{qMembers.length} membros</Badge>
                    <Badge variant="outline">
                      <Radio className="w-3 h-3 mr-1" />
                      {qChannels.length + defaultIn.length} canais
                    </Badge>
                    {q.max_queue_size && <Badge variant="outline">máx fila: {q.max_queue_size}</Badge>}
                    {q.max_wait_seconds && <Badge variant="outline">espera: {q.max_wait_seconds}s</Badge>}
                    {q.max_per_queue_per_agent && <Badge variant="outline">/agente: {q.max_per_queue_per_agent}</Badge>}
                    {qSkills.map((s) => (
                      <Badge key={s.id} variant="secondary">{s.skill_name} (≥{s.min_level})</Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            );
          })}
          {queues.length === 0 && (
            <p className="text-muted-foreground text-center py-12">Nenhuma fila criada.</p>
          )}
        </div>
      )}

      <Dialog open={!!memberDialog} onOpenChange={(o) => !o && setMemberDialog(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{memberDialog?.name} — Membros, Skills & Canais</DialogTitle>
          </DialogHeader>
          {memberDialog && (
            <div className="space-y-6 max-h-[70vh] overflow-y-auto pr-2">
              <section>
                <h3 className="font-semibold mb-2">Membros</h3>
                <div className="flex gap-2 mb-3">
                  <Select value={newMemberId} onValueChange={setNewMemberId}>
                    <SelectTrigger className="flex-1"><SelectValue placeholder="Adicionar agente" /></SelectTrigger>
                    <SelectContent>
                      {profiles
                        .filter((p) => !members.some((m) => m.queue_id === memberDialog.id && m.profile_id === p.id))
                        .map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Button onClick={addMember} disabled={!newMemberId}>Adicionar</Button>
                </div>
                <div className="space-y-1">
                  {members.filter((m) => m.queue_id === memberDialog.id).map((m) => (
                    <div key={m.id} className="flex items-center justify-between bg-muted/30 px-3 py-2 rounded">
                      <span>{m.profile?.name ?? m.profile_id}</span>
                      <Button size="icon" variant="ghost" onClick={() => void removeMember(m.id)}>
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </section>

              <section>
                <h3 className="font-semibold mb-2">Canais vinculados</h3>
                <div className="flex gap-2 mb-3">
                  <Select value={newChannelId} onValueChange={setNewChannelId}>
                    <SelectTrigger className="flex-1"><SelectValue placeholder="Vincular canal" /></SelectTrigger>
                    <SelectContent>
                      {channels
                        .filter((c) => !channelQueues.some((cq) => cq.queue_id === memberDialog.id && cq.channel_id === c.id))
                        .map((c) => <SelectItem key={c.id} value={c.id}>{c.name} ({c.channel_type})</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Button onClick={linkChannel} disabled={!newChannelId}>Vincular</Button>
                </div>
                <div className="space-y-1">
                  {channels.filter((c) => c.default_queue_id === memberDialog.id).map((c) => (
                    <div key={`def-${c.id}`} className="flex items-center justify-between bg-primary/5 px-3 py-2 rounded">
                      <span>{c.name} <Badge variant="default" className="ml-2">default do canal</Badge></span>
                      <span className="text-xs text-muted-foreground">configurado em /admin/channels</span>
                    </div>
                  ))}
                  {channelQueues
                    .filter((cq) => cq.queue_id === memberDialog.id)
                    .map((cq) => {
                      const ch = channels.find((c) => c.id === cq.channel_id);
                      return (
                        <div key={cq.id} className="flex items-center justify-between bg-muted/30 px-3 py-2 rounded">
                          <span>
                            {ch?.name ?? cq.channel_id}
                            <Badge variant="outline" className="ml-2">prioridade {cq.priority}</Badge>
                            {!cq.is_active && <Badge variant="secondary" className="ml-2">inativo</Badge>}
                          </span>
                          <Button size="icon" variant="ghost" onClick={() => void unlinkChannel(cq.channel_id)}>
                            <X className="w-4 h-4" />
                          </Button>
                        </div>
                      );
                    })}
                </div>
              </section>

              <section>
                <h3 className="font-semibold mb-2">Skills exigidas</h3>
                <div className="flex gap-2 mb-3">
                  <Input
                    placeholder="Ex.: vendas, suporte, ingles"
                    value={newSkill.name}
                    onChange={(e) => setNewSkill({ ...newSkill, name: e.target.value })}
                  />
                  <Input
                    type="number" min={1} max={5}
                    className="w-20"
                    value={newSkill.level}
                    onChange={(e) => setNewSkill({ ...newSkill, level: Number(e.target.value) })}
                  />
                  <Button onClick={addSkill} disabled={!newSkill.name.trim()}>Adicionar</Button>
                </div>
                <div className="space-y-1">
                  {skills.filter((s) => s.queue_id === memberDialog.id).map((s) => (
                    <div key={s.id} className="flex items-center justify-between bg-muted/30 px-3 py-2 rounded">
                      <span>{s.skill_name} <Badge variant="outline" className="ml-2">nível ≥ {s.min_level}</Badge></span>
                      <Button size="icon" variant="ghost" onClick={() => void removeSkill(s.id)}>
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}