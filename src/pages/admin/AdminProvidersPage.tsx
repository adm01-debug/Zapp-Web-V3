import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Activity, Plus, RefreshCw, Trash2, Zap, Clock, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { useProviderPanel, ProviderRow, ProviderType } from '@/hooks/useProviderPanel';
import { cn } from '@/lib/utils';

const STATUS_STYLES: Record<ProviderRow['status'], string> = {
  online: 'bg-success/15 text-success border-success/30',
  degraded: 'bg-warning/15 text-warning border-warning/30',
  offline: 'bg-destructive/15 text-destructive border-destructive/30',
  unknown: 'bg-muted text-muted-foreground border-border',
};

const STATUS_ICON: Record<ProviderRow['status'], React.ReactNode> = {
  online: <CheckCircle2 className="h-3.5 w-3.5" />,
  degraded: <AlertTriangle className="h-3.5 w-3.5" />,
  offline: <AlertTriangle className="h-3.5 w-3.5" />,
  unknown: <Clock className="h-3.5 w-3.5" />,
};

const TYPE_LABEL: Record<ProviderType, string> = {
  evolution: 'Evolution API',
  wppconnect: 'WPPConnect',
  baileys: 'Baileys',
  custom: 'Custom HTTP',
};

/** Admin Providers Page. */
export const AdminProvidersPage = () => {
  const {
    rows, logs, loading, selectedProviderId, setSelectedProviderId,
    refetch, upsertProvider, deleteProvider, runHealthcheck,
  } = useProviderPanel();
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<Partial<ProviderRow> & { auth_token?: string } | null>(null);

  const openCreate = () => {
    setEditing({ provider_type: 'evolution', is_active: true, priority: 10, base_url: '', name: '' });
    setEditorOpen(true);
  };

  const openEdit = (row: ProviderRow) => {
    setEditing({ ...row, auth_token: '' });
    setEditorOpen(true);
  };

  const save = async () => {
    if (!editing?.name || !editing?.base_url) return;
    const ok = await upsertProvider({
      id: editing.provider_id,
      ...editing,
    });
    if (ok) setEditorOpen(false);
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Provedores & Fallback</h1>
          <p className="text-sm text-muted-foreground">
            Configure provedores (Evolution / WPPConnect / Baileys), monitore status e veja logs por sessão.
            Health-check automático a cada 2 minutos.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={refetch} className="gap-2">
            <RefreshCw className="h-4 w-4" /> Atualizar
          </Button>
          <Button variant="outline" onClick={runHealthcheck} className="gap-2">
            <Activity className="h-4 w-4" /> Health-check agora
          </Button>
          <Button onClick={openCreate} className="gap-2">
            <Plus className="h-4 w-4" /> Novo provedor
          </Button>
        </div>
      </div>

      {/* Cards de provedores */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-44" />)}
        </div>
      ) : rows.length === 0 ? (
        <Card className="rounded-2xl">
          <CardContent className="py-16 text-center">
            <Activity className="h-12 w-12 mx-auto text-muted-foreground/40 mb-3" />
            <p className="text-sm text-muted-foreground">Nenhum provedor configurado.</p>
            <Button onClick={openCreate} className="mt-4 gap-2">
              <Plus className="h-4 w-4" /> Cadastrar primeiro provedor
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {rows.map(p => (
            <Card
              key={p.provider_id}
              className={cn(
                'rounded-2xl cursor-pointer transition-all hover:shadow-md',
                selectedProviderId === p.provider_id && 'ring-2 ring-primary',
              )}
              onClick={() => setSelectedProviderId(p.provider_id === selectedProviderId ? null : p.provider_id)}
            >
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <CardTitle className="text-base">{p.name}</CardTitle>
                    <p className="text-xs text-muted-foreground">{TYPE_LABEL[p.provider_type]}</p>
                  </div>
                  <Badge variant="outline" className={cn('gap-1', STATUS_STYLES[p.status])}>
                    {STATUS_ICON[p.status]} {p.status}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="text-xs  text-muted-foreground truncate">{p.base_url}</div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <Stat label="Sessões" value={p.open_sessions} />
                  <Stat label="Ativo em" value={p.routes_active} />
                  <Stat label="Erros 24h" value={p.errors_24h} tone={p.errors_24h > 0 ? 'destructive' : 'default'} />
                </div>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>
                    Latência: {p.last_ping_latency_ms ? `${p.last_ping_latency_ms}ms` : '—'}
                  </span>
                  <span>
                    {p.last_ping_at ? new Date(p.last_ping_at).toLocaleTimeString() : 'sem ping'}
                  </span>
                </div>
                {p.last_error && (
                  <p className="text-xs text-destructive truncate" title={p.last_error}>
                    ⚠ {p.last_error}
                  </p>
                )}
                <div className="flex items-center justify-between pt-2 border-t">
                  <Badge variant="secondary" className="text-xs">prioridade {p.priority}</Badge>
                  <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                    <Button size="sm" variant="ghost" onClick={() => openEdit(p)}>Editar</Button>
                    <Button size="sm" variant="ghost" className="text-destructive"
                      onClick={() => { if (confirm(`Remover ${p.name}?`)) deleteProvider(p.provider_id); }}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Logs por sessão */}
      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Zap className="h-4 w-4" />
            Timeline de eventos {selectedProviderId ? '(filtrado)' : '(todos)'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {logs.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Sem eventos registrados ainda.</p>
          ) : (
            <div className="space-y-1 max-h-[420px] overflow-y-auto">
              {logs.map(l => (
                <div
                  key={l.log_id}
                  className={cn(
                    'flex items-start gap-3 px-3 py-2 rounded-lg text-sm border-l-2',
                    l.level === 'error' && 'border-destructive bg-destructive/5',
                    l.level === 'warn' && 'border-warning bg-warning/5',
                    l.level === 'info' && 'border-primary/40 bg-muted/30',
                  )}
                >
                  <span className="text-xs  text-muted-foreground shrink-0 w-20">
                    {new Date(l.created_at).toLocaleTimeString()}
                  </span>
                  <Badge variant="outline" className="text-xs shrink-0">{l.event}</Badge>
                  <span className="text-xs text-muted-foreground shrink-0 w-32 truncate">{l.provider_name}</span>
                  <span className="text-xs flex-1 truncate">{l.message ?? '—'}</span>
                  {l.latency_ms != null && (
                    <span className="text-xs  text-muted-foreground shrink-0">{l.latency_ms}ms</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Editor */}
      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing?.provider_id ? 'Editar provedor' : 'Novo provedor'}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="provider-name">Nome</Label>
                <Input
                  id="provider-name"
                  value={editing.name ?? ''}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                  placeholder="Ex.: Evolution Principal"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="provider-type">Tipo</Label>
                <Select
                  value={editing.provider_type ?? 'evolution'}
                  onValueChange={(v) => setEditing({ ...editing, provider_type: v as ProviderType  /* ignore-audit: Select/Tabs value string narrowed to union; developer controls option values */})}
                >
                  <SelectTrigger id="provider-type"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="evolution">Evolution API</SelectItem>
                    <SelectItem value="wppconnect">WPPConnect</SelectItem>
                    <SelectItem value="baileys">Baileys</SelectItem>
                    <SelectItem value="custom">Custom HTTP</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="provider-base-url">URL base</Label>
                <Input
                  id="provider-base-url"
                  value={editing.base_url ?? ''}
                  onChange={(e) => setEditing({ ...editing, base_url: e.target.value })}
                  placeholder="https://evolution.exemplo.com"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="provider-auth-token">Token / API key {editing.provider_id && <span className="text-xs text-muted-foreground">(deixe em branco para manter)</span>}</Label>
                <Input
                  id="provider-auth-token"
                  type="password"
                  value={editing.auth_token ?? ''}
                  onChange={(e) => setEditing({ ...editing, auth_token: e.target.value })}
                  placeholder="•••••••••"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="provider-priority">Prioridade (menor = primeiro)</Label>
                  <Input
                    id="provider-priority"
                    type="number"
                    value={editing.priority ?? 10}
                    onChange={(e) => setEditing({ ...editing, priority: Number(e.target.value) })}
                  />
                </div>
                <div className="flex items-center justify-between pt-7">
                  <Label htmlFor="active">Ativo</Label>
                  <Switch
                    id="active"
                    checked={editing.is_active ?? true}
                    onCheckedChange={(v) => setEditing({ ...editing, is_active: v })}
                  />
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditorOpen(false)}>Cancelar</Button>
            <Button onClick={save}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

function Stat({ label, value, tone = 'default' }: { label: string; value: number; tone?: 'default' | 'destructive' }) {
  return (
    <div className="rounded-lg bg-muted/30 p-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn('text-lg font-bold tabular-nums', tone === 'destructive' && value > 0 && 'text-destructive')}>
        {value}
      </p>
    </div>
  );
}

export default AdminProvidersPage;
