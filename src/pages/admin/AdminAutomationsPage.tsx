import { useMemo, useState } from 'react';
import {
  useAdminAutomations,
  TRIGGER_LABEL,
  EMPTY_RULE,
  type Rule,
} from '@/hooks/admin/useAdminAutomations';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import {
  Plus,
  Pencil,
  Trash2,
  Sparkles,
  Tag,
  Send,
  Clock,
  AlertTriangle,
  Building2,
  Radio,
} from 'lucide-react';
import { AutomationRuleDialog } from './AutomationRuleDialog';

export default function AdminAutomationsPage() {
  const {
    rules,
    channels,
    departments,
    loading,
    save: hookSave,
    remove,
    toggleActive,
    adjustPriority,
    channelMap,
    deptMap,
  } = useAdminAutomations();

  const [editing, setEditing] = useState<Rule | null>(null);
  const [open, setOpen] = useState(false);

  const [filterChannel, setFilterChannel] = useState<string>('all');
  const [filterDepartment, setFilterDepartment] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');

  const filtered = useMemo(() => {
    return rules.filter((r) => {
      if (filterChannel !== 'all' && (r.channel_id ?? 'none') !== filterChannel) return false;
      if (filterDepartment !== 'all' && (r.department_id ?? 'none') !== filterDepartment)
        return false;
      if (filterStatus === 'active' && !r.is_active) return false;
      if (filterStatus === 'inactive' && r.is_active) return false;
      return true;
    });
  }, [rules, filterChannel, filterDepartment, filterStatus]);

  const startNew = () => {
    setEditing({ ...(EMPTY_RULE as Rule), id: '' });
    setOpen(true);
  };

  const startEdit = (r: Rule) => {
    const cloned = JSON.parse(JSON.stringify(r)) as Rule;
    cloned.actions = {
      ...EMPTY_RULE.actions,
      ...(cloned.actions ?? {}),
      escalate_sla: {
        ...EMPTY_RULE.actions.escalate_sla,
        ...(cloned.actions?.escalate_sla ?? {}),
      },
    };
    setEditing(cloned);
    setOpen(true);
  };

  const save = async () => {
    const ok = await hookSave(editing);
    if (ok) {
      setOpen(false);
      setEditing(null);
    }
  };

  return (
    <div className="container mx-auto max-w-6xl p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <Sparkles className="h-5 w-5 text-primary" /> Automações por gatilho
          </h1>
          <p className="text-sm text-muted-foreground">
            Regras por canal e filial: sugestão de resposta com IA, aplicação de tag e escalonamento
            de SLA.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <a href="/admin/automations/logs">
            <Button variant="outline" size="sm">
              Audit trail
            </Button>
          </a>
          <Button onClick={startNew}>
            <Plus className="mr-1 h-4 w-4" /> Nova regra
          </Button>
        </div>
      </div>

      {/* Filtros */}
      <Card className="mb-4 flex flex-wrap items-end gap-3 p-3">
        <div className="min-w-[180px]">
          <Label className="text-xs" htmlFor="filter-channel">
            Canal
          </Label>
          <Select value={filterChannel} onValueChange={setFilterChannel}>
            <SelectTrigger id="filter-channel">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os canais</SelectItem>
              <SelectItem value="none">Sem canal (global)</SelectItem>
              {channels.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="min-w-[180px]">
          <Label className="text-xs" htmlFor="filter-department">
            Filial / Departamento
          </Label>
          <Select value={filterDepartment} onValueChange={setFilterDepartment}>
            <SelectTrigger id="filter-department">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              <SelectItem value="none">Sem filial (global)</SelectItem>
              {departments.map((d) => (
                <SelectItem key={d.id} value={d.id}>
                  {d.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="min-w-[140px]">
          <Label className="text-xs" htmlFor="filter-status">
            Status
          </Label>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger id="filter-status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              <SelectItem value="active">Ativas</SelectItem>
              <SelectItem value="inactive">Inativas</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="ml-auto text-xs text-muted-foreground">
          {filtered.length} de {rules.length} regras
        </div>
      </Card>

      <div className="space-y-3">
        {loading && (
          <p role="status" aria-live="polite" className="text-muted-foreground">
            Carregando…
          </p>
        )}
        {!loading && filtered.length === 0 && (
          <Card className="p-8 text-center text-muted-foreground">
            Nenhuma regra com esses filtros.
          </Card>
        )}
        {filtered.map((r) => (
          <Card key={r.id} className="p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <h3 className="truncate font-medium">{r.name}</h3>
                  <Badge variant={r.is_active ? 'default' : 'secondary'}>
                    {r.is_active ? 'Ativa' : 'Inativa'}
                  </Badge>
                  <Badge variant="outline">{TRIGGER_LABEL[r.trigger_type]}</Badge>
                  <Badge variant="outline" className="text-xs">
                    Prioridade {r.priority}
                  </Badge>
                  <Badge variant="outline" className="text-xs">
                    <Clock className="mr-1 h-3 w-3" />
                    cooldown {r.cooldown_seconds}s
                  </Badge>
                  {r.channel_id && channelMap[r.channel_id] && (
                    <Badge variant="outline" className="text-xs">
                      <Radio className="mr-1 h-3 w-3" />
                      {channelMap[r.channel_id]}
                    </Badge>
                  )}
                  {r.department_id && deptMap[r.department_id] && (
                    <Badge variant="outline" className="text-xs">
                      <Building2 className="mr-1 h-3 w-3" />
                      {deptMap[r.department_id]}
                    </Badge>
                  )}
                </div>
                {r.description && (
                  <p className="mb-2 text-sm text-muted-foreground">{r.description}</p>
                )}
                <div className="flex flex-wrap gap-1 text-xs">
                  {r.actions?.suggest_reply && (
                    <Badge variant="secondary">
                      <Sparkles className="mr-1 h-3 w-3" />
                      Sugerir
                    </Badge>
                  )}
                  {r.actions?.auto_send && (
                    <Badge variant="secondary">
                      <Send className="mr-1 h-3 w-3" />
                      Auto-enviar
                    </Badge>
                  )}
                  {Array.isArray(r.actions?.apply_tags) && r.actions.apply_tags.length > 0 && (
                    <Badge variant="secondary">
                      <Tag className="mr-1 h-3 w-3" />
                      {r.actions.apply_tags.join(', ')}
                    </Badge>
                  )}
                  {r.actions?.escalate_sla?.enabled && (
                    <Badge variant="destructive">
                      <AlertTriangle className="mr-1 h-3 w-3" />
                      SLA → {r.actions.escalate_sla.level ?? 'high'}
                    </Badge>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => adjustPriority(r, -10)}
                  aria-label="Subir prioridade"
                >
                  ↑
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => adjustPriority(r, 10)}
                  aria-label="Descer prioridade"
                >
                  ↓
                </Button>
                <Switch checked={r.is_active} onCheckedChange={() => toggleActive(r)} />
                <Button
                  aria-label="Editar regra"
                  size="icon"
                  variant="ghost"
                  onClick={() => startEdit(r)}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  aria-label="Remover regra"
                  size="icon"
                  variant="ghost"
                  onClick={() => confirm('Remover esta regra?') && remove(r.id)}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            </div>
          </Card>
        ))}
      </div>

      <AutomationRuleDialog
        open={open}
        onOpenChange={setOpen}
        editing={editing}
        setEditing={setEditing}
        onSave={save}
        channels={channels}
        departments={departments}
      />
    </div>
  );
}
