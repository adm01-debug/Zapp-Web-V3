import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { TRIGGER_LABEL, type Rule, type TriggerType } from '@/hooks/admin/useAdminAutomations';
import { TriggerConfigFields, AutomationActionsFields } from './automationRuleDialogParts';

interface Channel {
  id: string;
  name: string;
}

interface Department {
  id: string;
  name: string;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: Rule | null;
  setEditing: (r: Rule) => void;
  onSave: () => Promise<void>;
  channels: Channel[];
  departments: Department[];
}

/** Automation Rule Dialog. */
export function AutomationRuleDialog({
  open,
  onOpenChange,
  editing,
  setEditing,
  onSave,
  channels,
  departments,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing?.id ? 'Editar regra' : 'Nova regra'}</DialogTitle>
        </DialogHeader>

        {editing && (
          <div className="space-y-4">
            <div>
              <Label htmlFor="auto-name">Nome</Label>
              <Input
                id="auto-name"
                value={editing.name}
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="auto-description">Descrição</Label>
              <Textarea
                id="auto-description"
                rows={2}
                value={editing.description ?? ''}
                onChange={(e) => setEditing({ ...editing, description: e.target.value })}
              />
            </div>

            {/* Escopo */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="auto-channel">Canal (opcional)</Label>
                <Select
                  value={editing.channel_id ?? 'none'}
                  onValueChange={(v) =>
                    setEditing({ ...editing, channel_id: v === 'none' ? null : v })
                  }
                >
                  <SelectTrigger id="auto-channel">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Todos os canais</SelectItem>
                    {channels.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="auto-department">Filial / Departamento (opcional)</Label>
                <Select
                  value={editing.department_id ?? 'none'}
                  onValueChange={(v) =>
                    setEditing({ ...editing, department_id: v === 'none' ? null : v })
                  }
                >
                  <SelectTrigger id="auto-department">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Todas as filiais</SelectItem>
                    {departments.map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="auto-trigger">Gatilho</Label>
                <Select
                  value={editing.trigger_type}
                  onValueChange={(v: TriggerType) =>
                    setEditing({ ...editing, trigger_type: v, trigger_config: {} })
                  }
                >
                  <SelectTrigger id="auto-trigger">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(TRIGGER_LABEL).map(([k, v]) => (
                      <SelectItem key={k} value={k}>
                        {v}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="auto-priority">Prioridade (menor = primeiro)</Label>
                <Input
                  id="auto-priority"
                  type="number"
                  value={editing.priority}
                  onChange={(e) =>
                    setEditing({ ...editing, priority: Number(e.target.value) || 100 })
                  }
                />
              </div>
            </div>

            <TriggerConfigFields editing={editing} setEditing={setEditing} />
            <AutomationActionsFields editing={editing} setEditing={setEditing} />
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={onSave}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
