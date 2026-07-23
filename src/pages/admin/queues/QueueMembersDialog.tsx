import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { X } from 'lucide-react';
import type { Queue } from '@/hooks/admin/useAdminQueues';

interface QueueSkill {
  id: string;
  queue_id: string;
  skill_name: string;
  min_level: number;
}

interface ChannelQueue {
  id: string;
  queue_id: string;
  channel_id: string;
  is_active: boolean;
  priority: number;
}

interface Channel {
  id: string;
  name: string;
  channel_type: string;
  default_queue_id: string | null;
}

interface QueueMember {
  id: string;
  queue_id: string;
  profile_id: string;
  profile?: { name: string };
}

interface Profile {
  id: string;
  name: string;
}

interface Props {
  memberDialog: Queue | null;
  members: QueueMember[];
  profiles: Profile[];
  channels: Channel[];
  channelQueues: ChannelQueue[];
  skills: QueueSkill[];
  newMemberId: string;
  setNewMemberId: (v: string) => void;
  newChannelId: string;
  setNewChannelId: (v: string) => void;
  newSkill: { name: string; level: number };
  setNewSkill: (s: { name: string; level: number }) => void;
  onClose: () => void;
  onAddMember: () => void;
  onRemoveMember: (id: string) => void;
  onLinkChannel: () => void;
  onUnlinkChannel: (channelId: string) => void;
  onAddSkill: () => void;
  onRemoveSkill: (id: string) => void;
}

/** Queue Members Dialog. */
export function QueueMembersDialog({
  memberDialog,
  members,
  profiles,
  channels,
  channelQueues,
  skills,
  newMemberId,
  setNewMemberId,
  newChannelId,
  setNewChannelId,
  newSkill,
  setNewSkill,
  onClose,
  onAddMember,
  onRemoveMember,
  onLinkChannel,
  onUnlinkChannel,
  onAddSkill,
  onRemoveSkill,
}: Props) {
  return (
    <Dialog open={!!memberDialog} onOpenChange={(o) => !o && onClose()}>
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
                <Button onClick={onAddMember} disabled={!newMemberId}>
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
                      <Button
                        aria-label="Remover membro da fila"
                        size="icon"
                        variant="ghost"
                        onClick={() => onRemoveMember(m.id)}
                      >
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
                <Button onClick={onLinkChannel} disabled={!newChannelId}>
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
                          onClick={() => onUnlinkChannel(cq.channel_id)}
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
                <Button onClick={onAddSkill} disabled={!newSkill.name.trim()}>
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
                      <Button
                        aria-label="Remover habilidade da fila"
                        size="icon"
                        variant="ghost"
                        onClick={() => onRemoveSkill(s.id)}
                      >
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
  );
}
