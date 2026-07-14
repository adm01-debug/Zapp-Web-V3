import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Pencil, Trash2, Users, Pause, Play, Radio } from 'lucide-react';
import { ALGO_LABEL, type Queue } from '@/hooks/admin/useAdminQueues';

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

interface Props {
  queue: Queue;
  members: QueueMember[];
  skills: QueueSkill[];
  channelQueues: ChannelQueue[];
  channels: Channel[];
  onTogglePause: (q: Queue) => void;
  onEdit: (q: Queue) => void;
  onRemove: (id: string) => void;
  onMembers: (q: Queue) => void;
}

export function QueueCard({
  queue,
  members,
  skills,
  channelQueues,
  channels,
  onTogglePause,
  onEdit,
  onRemove,
  onMembers,
}: Props) {
  const qMembers = members.filter((m) => m.queue_id === queue.id);
  const qSkills = skills.filter((s) => s.queue_id === queue.id);
  const qChannels = channelQueues.filter((cq) => cq.queue_id === queue.id && cq.is_active);
  const defaultIn = channels.filter((c) => c.default_queue_id === queue.id);
  const isPaused = queue.status === 'paused';

  return (
    <Card className={isPaused ? 'border-warning/40 opacity-70' : undefined}>
      <CardHeader className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-center">
        <div>
          <CardTitle className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-full" style={{ background: queue.color }} />
            {queue.name}
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
              {ALGO_LABEL[queue.distribution_algorithm] ?? queue.distribution_algorithm}
            </Badge>
            <Badge variant="outline" className="h-auto whitespace-normal break-words py-0.5">
              prioridade {queue.priority}
            </Badge>
          </CardTitle>
          {queue.description && (
            <p className="mt-1 text-sm text-muted-foreground">{queue.description}</p>
          )}
          {isPaused && queue.paused_reason && (
            <p className="mt-1 text-xs text-warning">Motivo: {queue.paused_reason}</p>
          )}
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => onTogglePause(queue)}>
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
          <Button size="sm" variant="outline" onClick={() => onMembers(queue)}>
            <Users className="mr-1 h-4 w-4" /> Membros & Canais
          </Button>
          <Button
            aria-label="Editar fila"
            size="icon"
            variant="ghost"
            onClick={() => onEdit(queue)}
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            aria-label="Excluir fila"
            size="icon"
            variant="ghost"
            onClick={() => onRemove(queue.id)}
          >
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
          {queue.max_queue_size && (
            <Badge variant="outline">máx fila: {queue.max_queue_size}</Badge>
          )}
          {queue.max_wait_seconds && (
            <Badge variant="outline">espera: {queue.max_wait_seconds}s</Badge>
          )}
          {queue.max_per_queue_per_agent && (
            <Badge variant="outline">/agente: {queue.max_per_queue_per_agent}</Badge>
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
}
