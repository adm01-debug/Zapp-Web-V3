import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { Switch } from '@/components/ui/switch';
import { Plus } from 'lucide-react';
import { ALGO_LABEL, type Queue, type DistAlgo } from '@/hooks/admin/useAdminQueues';

interface Department {
  id: string;
  name: string;
}

interface Props {
  open: boolean;
  editing: Partial<Queue> | null;
  queues: Queue[];
  departments: Department[];
  onNew: () => void;
  onClose: () => void;
  onChange: (q: Partial<Queue>) => void;
  onSave: () => void;
}

/** Queue Edit Dialog. */
export function QueueEditDialog({
  open,
  editing,
  queues,
  departments,
  onNew,
  onClose,
  onChange,
  onSave,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogTrigger asChild>
        <Button onClick={onNew}>
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
              onChange={(e) => onChange({ ...(editing ?? {}), name: e.target.value })}
            />
          </div>
          <div>
            <Label htmlFor="queue-description">Descrição</Label>
            <Input
              id="queue-description"
              value={editing?.description ?? ''}
              onChange={(e) => onChange({ ...(editing ?? {}), description: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="queue-color">Cor</Label>
              <Input
                id="queue-color"
                type="color"
                value={editing?.color ?? '#3B82F6'}
                onChange={(e) => onChange({ ...(editing ?? {}), color: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="queue-priority">Prioridade</Label>
              <Input
                id="queue-priority"
                type="number"
                value={editing?.priority ?? 0}
                onChange={(e) => onChange({ ...(editing ?? {}), priority: Number(e.target.value) })}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="queue-algorithm">Algoritmo de distribuição</Label>
              <Select
                value={editing?.distribution_algorithm ?? 'least_busy'}
                onValueChange={(v) =>
                  onChange({ ...(editing ?? {}), distribution_algorithm: v as DistAlgo })
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
                  onChange({ ...(editing ?? {}), department_id: v === 'none' ? null : v })
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
                  onChange({
                    ...(editing ?? {}),
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
                  onChange({
                    ...(editing ?? {}),
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
                  onChange({
                    ...(editing ?? {}),
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
                onChange({ ...(editing ?? {}), overflow_queue_id: v === 'none' ? null : v })
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
                onChange({ ...(editing ?? {}), max_wait_time_minutes: Number(e.target.value) })
              }
            />
          </div>

          <div className="flex items-center justify-between">
            <Label htmlFor="queue-is-active">Ativa</Label>
            <Switch
              id="queue-is-active"
              checked={editing?.is_active ?? true}
              onCheckedChange={(v) => onChange({ ...(editing ?? {}), is_active: v })}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={onSave}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
