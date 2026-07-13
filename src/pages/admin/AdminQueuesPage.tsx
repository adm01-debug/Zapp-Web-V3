/* eslint-disable @typescript-eslint/no-non-null-assertion */
// editing! assertions are safe here: fields are only rendered when editing !== null (controlled by Dialog open state)
import {
  useAdminQueues,
  ALGO_LABEL,
  type Queue,
  type DistAlgo,
} from '@/hooks/admin/useAdminQueues';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Plus, Pencil, Trash2, Users, X, Pause, Play, Radio } from 'lucide-react';

export default function AdminQueuesPage() {
  const {
    queues, members, skills, profiles, departments, channels, channelQueues, loading,
    editing, setEditing, memberDialog, setMemberDialog,
    newSkill, setNewSkill, newMemberId, setNewMemberId, newChannelId, setNewChannelId,
    save, remove, togglePause, addMember, removeMember, addSkill, removeSkill, linkChannel, unlinkChannel,
  } = useAdminQueues();

  return (
    <div className="container mx-auto space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Filas de Atendimento</h1>
          <p className="text-muted-foreground">
            Capacidade, status, distribuição e vínculo a canais de atendimento.
          </p>
        </div>
        <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
          <DialogTrigger asChild>
            <Button
              onClick={() =>
                setEditing({
                  is_active: true,
                  color: '#3B82F6',
                  priority: 0,
                  max_wait_time_minutes: 30,
                  status: 'active' as Queue['status'],
                  distribution_algorithm: 'least_busy' as DistAlgo,
                })
              }
            >
              <Plus className="mr-2 h-4 w-4" /> Nova fila
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-xl">
            <DialogHeader>
              <DialogTitle>{editing?.id ? 'Editar fila' : 'Nova fila'}</DialogTitle>
            </DialogHeader>
            <div className="max-h-[70vh] space-y-4 overflow-y-auto pr-2">
              <div>
                <Label htmlFor="queue-name">Nome</Label>
                <Input
                  id="queue-name"
                  value={editing?.name ?? ''}
                  onChange={(e) => setEditing({ ...editing!, name: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="queue-description">Descrição</Label>
                <Input
                  id="queue-description"
                  value={editing?.description ?? ''}
                  onChange={(e) => setEditing({ ...editing!, description: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="queue-color">Cor</Label>
                  <Input
                    id="queue-color"
                    type="color"
                    value={editing?.color ?? '#3B82F6'}
                    onChange={(e) => setEditing({ ...editing!, color: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="queue-priority">Prioridade</Label>
                  <Input
                    id="queue-priority"
                    type="number"
                    value={editing?.priority ?? 0}
                    onChange={(e) => setEditing({ ...editing!, priority: Number(e.target.value) })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="queue-algorithm">Algoritmo de distribuição</Label>
                  <Select
                    value={editing?.distribution_algorithm ?? 'least_busy'}
                    onValueChange={(v) =>
                      setEditing({ ...editing!, distribution_algorithm: v as DistAlgo })
                    }
                  >
                    <SelectTrigger id="queue-algorithm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(ALGO_LABEL) as DistAlgo[]).map((k) => (
                        <SelectItem key={k} value={k}>
                          {ALGO_LABEL[k]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="queue-department">Departamento (elegibilidade)</Label>
                  <Select
                    value={editing?.department_id ?? 'none'}
                    onValueChange={(v) =>
                      setEditing({ ...editing!, department_id: v === 'none' ? null : v })
                    }
                  >
                    <SelectTrigger id="queue-department">
                      <SelectValue placeholder="Todos" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Todos os agentes</SelectItem>
                      {departments.map((d) => (
                        <SelectItem key={d.id} value={d.id}>
                          {d.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label htmlFor="queue-max-size">Tamanho máx. da fila</Label>
                  <Input
                    id="queue-max-size"
                    type="number"
                    placeholder="Ilimitado"
                    value={editing?.max_queue_size ?? ''}
                    onChange={(e) =>
                      setEditing({
                        ...editing!,
                        max_queue_size: e.target.value ? Number(e.target.value) : null,
                      })
                    }
                  />
                </div>
                <div>
                  <Label htmlFor="queue-max-wait-seconds">Espera máx. (s)</Label>
                  <Input
                    id="queue-max-wait-seconds"
                    type="number"
                    placeholder="Ilimitado"
                    value={editing?.max_wait_seconds ?? ''}
                    onChange={(e) =>
                      setEditing({
                        ...editing!,
                        max_wait_seconds: e.target.value ? Number(e.target.value) : null,
                      })
                    }
                  />
                </div>
                <div>
                  <Label htmlFor="queue-max-per-agent">Máx. por agente</Label>
                  <Input
                    id="queue-max-per-agent"
                    type="number"
                    placeholder="Sem limite"
                    value={editing?.max_per_queue_per_agent ?? ''}
                    onChange={(e) =>
                      setEditing({
                        ...editing!,
                        max_per_queue_per_agent: e.target.value ? Number(e.target.value) : null,
                      })
                    }
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="queue-overflow">Fila de overflow</Label>
                <Select
                  value={editing?.overflow_queue_id ?? 'none'}
                  onValueChange={(v) =>
                    setEditing({ ...editing!, overflow_queue_id: v === 'none' ? null : v })
                  }
                >
                  <SelectTrigger id="queue-overflow">
                    <SelectValue placeholder="Nenhuma" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nenhuma</SelectItem>
                    {queues
                      .filter((q) => q.id !== editing?.id)
                      .map((q) => (
                        <SelectItem key={q.id} value={q.id}>
                          {q.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="queue-max-wait-minutes">Tempo máx. de espera legado (min)</Label>
                <Input
                  id="queue-max-wait-minutes"
                  type="number"
                  value={editing?.max_wait_time_minutes ?? 30}
                  onChange={(e) =>
                    setEditing({ ...editing!, max_wait_time_minutes: Number(e.target.value) })
                  }
                />
              </div>

              <div className="flex items-center justify-between">
                <Label htmlFor="queue-is-active">Ativa</Label>
                <Switch
                  id="queue-is-active"
                  checked={editing?.is_active ?? true}
                  onCheckedChange={(v) => setEditing({ ...editing!, is_active: v })}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditing(null)}>
                Cancelar
              </Button>
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
            const isPaused = q.status === 'paused';
            return (
              <Card key={q.id} className={isPaused ? 'border-warning/40 opacity-70' : undefined}>
                <CardHeader className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-center">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <span className="h-3 w-3 rounded-full" style={{ background: q.color }} />
                      {q.name}
                      <Badge
                        variant={isPaused ? 'secondary' : 'default'}
                        className="h-auto max-w-[120px] whitespace-normal break-words py-0.5"
                      >
                        {isPaused ? 'Pausada' : 'Ativa'}
                      </Badge>
                      <Badge
                        variant="outline"
                        className="h-auto max-w-[150px] whitespace-normal break-words py-0.5"
                      >
                        {ALGO_LABEL[q.distribution_algorithm] ?? q.distribution_algorithm}
                      </Badge>
                      <Badge
                        variant="outline"
                        className="h-auto whitespace-normal break-words py-0.5"
                      >
                        prioridade {q.priority}
                      </Badge>
                    </CardTitle>
                    {q.description && (
                      <p className="mt-1 text-sm text-muted-foreground">{q.description}</p>
                    )}
                    {isPaused && q.paused_reason && (
                      <p className="mt-1 text-xs text-warning">Motivo: {q.paused_reason}</p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => void togglePause(q)}>
                      {isPaused ? (
                        <>
                          <Play className="mr-1 h-4 w-4" />
                          Retomar
                        </>
                      ) : (
                        <>
                          <Pause className="mr-1 h-4 w-4" />
                          Pausar
                        </>
                      )}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setMemberDialog(q)}>
                      <Users className="mr-1 h-4 w-4" /> Membros & Canais
                    </Button>
                    <Button aria-label="Editar fila" size="icon" variant="ghost" onClick={() => setEditing(q)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button aria-label="Excluir fila" size="icon" variant="ghost" onClick={() => void remove(q.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline">{qMembers.length} membros</Badge>
                    <Badge variant="outline">
                      <Radio className="mr-1 h-3 w-3" />
                      {qChannels.length + defaultIn.length} canais
                    </Badge>
                    {q.max_queue_size && (
                      <Badge variant="outline">máx fila: {q.max_queue_size}</Badge>
                    )}
                    {q.max_wait_seconds && (
                      <Badge variant="outline">espera: {q.max_wait_seconds}s</Badge>
                    )}
                    {q.max_per_queue_per_agent && (
                      <Badge variant="outline">/agente: {q.max_per_queue_per_agent}</Badge>
                    )}
                    {qSkills.map((s) => (
                      <Badge key={s.id} variant="secondary">
                        {s.skill_name} (≥{s.min_level})
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            );
          })}
          {queues.length === 0 && (
            <p className="py-12 text-center text-muted-foreground">Nenhuma fila criada.</p>
          )}
        </div>
      )}

      <Dialog open={!!memberDialog} onOpenChange={(o) => !o && setMemberDialog(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{memberDialog?.name} — Membros, Skills & Canais</DialogTitle>
          </DialogHeader>
          {memberDialog && (
            <div className="max-h-[70vh] space-y-6 overflow-y-auto pr-2">
              <section>
                <h3 className="mb-2 font-semibold">Membros</h3>
                <div className="mb-3 flex gap-2">
                  <Select value={newMemberId} onValueChange={setNewMemberId}>
                    <SelectTrigger className="flex-1">
                      <SelectValue placeholder="Adicionar agente" />
                    </SelectTrigger>
                    <SelectContent>
                      {profiles
                        .filter(
                          (p) =>
                            !members.some(
                              (m) => m.queue_id === memberDialog.id && m.profile_id === p.id
                            )
                        )
                        .map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                  <Button onClick={addMember} disabled={!newMemberId}>
                    Adicionar
                  </Button>
                </div>
                <div className="space-y-1">
                  {members
                    .filter((m) => m.queue_id === memberDialog.id)
                    .map((m) => (
                      <div
                        key={m.id}
                        className="flex items-center justify-between rounded bg-muted/30 px-3 py-2"
                      >
                        <span>{m.profile?.name ?? m.profile_id}</span>
                        <Button aria-label="Remover membro da fila" size="icon" variant="ghost" onClick={() => void removeMember(m.id)}>
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                </div>
              </section>

              <section>
                <h3 className="mb-2 font-semibold">Canais vinculados</h3>
                <div className="mb-3 flex gap-2">
                  <Select value={newChannelId} onValueChange={setNewChannelId}>
                    <SelectTrigger className="flex-1">
                      <SelectValue placeholder="Vincular canal" />
                    </SelectTrigger>
                    <SelectContent>
                      {channels
                        .filter(
                          (c) =>
                            !channelQueues.some(
                              (cq) => cq.queue_id === memberDialog.id && cq.channel_id === c.id
                            )
                        )
                        .map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.name} ({c.channel_type})
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                  <Button onClick={linkChannel} disabled={!newChannelId}>
                    Vincular
                  </Button>
                </div>
                <div className="space-y-1">
                  {channels
                    .filter((c) => c.default_queue_id === memberDialog.id)
                    .map((c) => (
                      <div
                        key={`def-${c.id}`}
                        className="flex items-center justify-between rounded bg-primary/5 px-3 py-2"
                      >
                        <span>
                          {c.name}{' '}
                          <Badge variant="default" className="ml-2">
                            default do canal
                          </Badge>
                        </span>
                        <span className="text-xs text-muted-foreground">
                          configurado em /admin/channels
                        </span>
                      </div>
                    ))}
                  {channelQueues
                    .filter((cq) => cq.queue_id === memberDialog.id)
                    .map((cq) => {
                      const ch = channels.find((c) => c.id === cq.channel_id);
                      return (
                        <div
                          key={cq.id}
                          className="flex items-center justify-between rounded bg-muted/30 px-3 py-2"
                        >
                          <span>
                            {ch?.name ?? cq.channel_id}
                            <Badge variant="outline" className="ml-2">
                              prioridade {cq.priority}
                            </Badge>
                            {!cq.is_active && (
                              <Badge variant="secondary" className="ml-2">
                                inativo
                              </Badge>
                            )}
                          </span>
                          <Button
                            size="icon"
                            variant="ghost"
                            aria-label="Remover canal da fila"
                            onClick={() => void unlinkChannel(cq.channel_id)}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      );
                    })}
                </div>
              </section>

              <section>
                <h3 className="mb-2 font-semibold">Skills exigidas</h3>
                <div className="mb-3 flex gap-2">
                  <Input
                    aria-label="Nome da habilidade"
                    placeholder="Ex.: vendas, suporte, ingles"
                    value={newSkill.name}
                    onChange={(e) => setNewSkill({ ...newSkill, name: e.target.value })}
                  />
                  <Input
                    aria-label="Nível mínimo da habilidade (1–5)"
                    type="number"
                    min={1}
                    max={5}
                    className="w-20"
                    value={newSkill.level}
                    onChange={(e) => setNewSkill({ ...newSkill, level: Number(e.target.value) })}
                  />
                  <Button onClick={addSkill} disabled={!newSkill.name.trim()}>
                    Adicionar
                  </Button>
                </div>
                <div className="space-y-1">
                  {skills
                    .filter((s) => s.queue_id === memberDialog.id)
                    .map((s) => (
                      <div
                        key={s.id}
                        className="flex items-center justify-between rounded bg-muted/30 px-3 py-2"
                      >
                        <span>
                          {s.skill_name}{' '}
                          <Badge variant="outline" className="ml-2">
                            nível ≥ {s.min_level}
                          </Badge>
                        </span>
                        <Button aria-label="Remover habilidade da fila" size="icon" variant="ghost" onClick={() => void removeSkill(s.id)}>
                          <X className="h-4 w-4" />
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
