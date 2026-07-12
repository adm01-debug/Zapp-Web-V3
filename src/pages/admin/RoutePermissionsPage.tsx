import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Save, Plus, Trash2, Lock, Search, Shield } from 'lucide-react';
import type { AppRole } from '@/features/auth';
import { useRoutePermissions, ALL_ROLES } from '@/hooks/admin/useRoutePermissions';

const ROLE_LABELS: Record<AppRole, string> = {
  dev: 'Dev',
  admin: 'Admin',
  manager: 'Gestor',
  supervisor: 'Supervisor',
  agent: 'Agente',
};

export default function RoutePermissionsPage() {
  const _toast = useToast();
  const [filter, setFilter] = useState('');
  const [dirty, setDirty] = useState<Record<string, AppRole[]>>({});
  const [newOpen, setNewOpen] = useState(false);
  const [newPath, setNewPath] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newRoles, setNewRoles] = useState<AppRole[]>([]);
  const { rows, loading, savingPath, _load, saveRow, deleteRow, createRow } = useRoutePermissions();

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) => r.path.toLowerCase().includes(q) || (r.description ?? '').toLowerCase().includes(q)
    );
  }, [rows, filter]);

  function getRolesFor(path: string): AppRole[] {
    if (path in dirty) return dirty[path];
    return rows.find((r) => r.path === path)?.allowed_roles ?? [];
  }

  function toggleRole(path: string, role: AppRole) {
    const current = getRolesFor(path);
    const next = current.includes(role) ? current.filter((r) => r !== role) : [...current, role];
    setDirty((d) => ({ ...d, [path]: next }));
  }

  function isDirty(path: string) {
    if (!(path in dirty)) return false;
    const original = rows.find((r) => r.path === path)?.allowed_roles ?? [];
    const current = dirty[path];
    if (original.length !== current.length) return true;
    const a = new Set(original);
    return current.some((r) => !a.has(r)) || original.some((r) => !current.includes(r));
  }

  return (
    <div className="container mx-auto max-w-6xl space-y-6 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <Shield className="h-6 w-6 text-primary" />
            Permissões de Rota
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Controle quais papéis podem acessar cada rota do sistema. Sem papéis marcados = qualquer
            usuário autenticado.
            <br />
            <span className="text-xs">
              Usuários com papel <strong>dev</strong> sempre têm acesso a todas as rotas
              configuradas, exceto as exclusivas de sistema.
            </span>
            <br />
            <span className="text-xs font-semibold text-primary">Matriz de Acesso por Role:</span>
            <div className="mt-2 grid grid-cols-2 gap-2 rounded-md border bg-secondary/50 p-3 text-[10px] md:grid-cols-5">
              <div className="flex flex-col gap-1">
                <span className="border-b pb-1 font-bold">DEV</span>
                <span>• Diagnóstico Raw</span>
                <span>• Logs de Auditoria</span>
                <span>• DB Explorer</span>
                <span>• Full System Access</span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="border-b pb-1 font-bold text-destructive-foreground">ADMIN</span>
                <span>• Gestão de Roles</span>
                <span>• Permissões Rotas</span>
                <span>• Config. Globais</span>
                <span>• Stress Test</span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="border-b pb-1 font-bold text-warning-foreground">MANAGER</span>
                <span>• Relatórios Avançados</span>
                <span>• Gestão Equipes</span>
                <span>• Dashboard SLA</span>
                <span>• Supervisão Chat</span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="border-b pb-1 font-bold text-primary">SUPERVISOR</span>
                <span>• Monitoramento</span>
                <span>• Canais & Filas</span>
                <span>• Logs WhatsApp</span>
                <span>• Histórico SLA</span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="border-b pb-1 font-bold text-muted-foreground">AGENT</span>
                <span>• Inbox (Chat)</span>
                <span>• Contatos</span>
                <span>• SLA Alert (Rec.)</span>
                <span>• Histórico Básico</span>
              </div>
            </div>
          </p>
        </div>
        <Dialog open={newOpen} onOpenChange={setNewOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-1 h-4 w-4" /> Nova rota
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Cadastrar nova rota</DialogTitle>
              <DialogDescription>
                Informe o path exato (ex: /admin/nova-tela). Use :param para segmentos dinâmicos.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <Input
                placeholder="/admin/exemplo"
                value={newPath}
                onChange={(e) => setNewPath(e.target.value)}
              />
              <Input
                placeholder="Descrição (opcional)"
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
              />
              <div className="flex flex-wrap gap-3">
                {ALL_ROLES.map((r) => (
                  <label key={r} className="flex cursor-pointer items-center gap-2 text-sm">
                    <Checkbox
                      checked={newRoles.includes(r)}
                      onCheckedChange={(v) =>
                        setNewRoles((prev) => (v ? [...prev, r] : prev.filter((x) => x !== r)))
                      }
                    />
                    {ROLE_LABELS[r]}
                  </label>
                ))}
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setNewOpen(false)}>
                Cancelar
              </Button>
              <Button
                onClick={() => {
                  void (async () => {
                    if (await createRow(newPath, newRoles, newDesc)) {
                      setNewOpen(false);
                      setNewPath('');
                      setNewDesc('');
                      setNewRoles([]);
                    }
                  })();
                }}
              >
                Cadastrar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Rotas registradas</CardTitle>
          <CardDescription>
            Mudanças entram em vigor imediatamente para novas navegações.
          </CardDescription>
          <div className="relative mt-2">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Filtrar por path ou descrição…"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[220px]">Rota</TableHead>
                    {ALL_ROLES.map((r) => (
                      <TableHead key={r} className="text-center">
                        {ROLE_LABELS[r]}
                      </TableHead>
                    ))}
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((row) => {
                    const current = getRolesFor(row.path);
                    const changed = isDirty(row.path);
                    return (
                      <TableRow key={row.path}>
                        <TableCell>
                          <div className="text-sm">{row.path}</div>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            {row.description}
                            {row.is_system && (
                              <Badge variant="outline" className="text-[10px]">
                                <Lock className="mr-1 h-3 w-3" /> sistema
                              </Badge>
                            )}
                            {current.length === 0 && (
                              <Badge variant="secondary" className="text-[10px]">
                                qualquer autenticado
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        {ALL_ROLES.map((r) => (
                          <TableCell key={r} className="text-center">
                            <Checkbox
                              checked={current.includes(r)}
                              onCheckedChange={() => toggleRole(row.path, r)}
                            />
                          </TableCell>
                        ))}
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              size="sm"
                              variant={changed ? 'default' : 'outline'}
                              disabled={!changed || savingPath === row.path}
                              onClick={() => void saveRow(row.path, getRolesFor(row.path))}
                            >
                              <Save className="mr-1 h-3.5 w-3.5" />
                              Salvar
                            </Button>
                            {!row.is_system && (
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => deleteRow(row.path)}
                                aria-label="Remover"
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {filtered.length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={ALL_ROLES.length + 2}
                        className="py-8 text-center text-muted-foreground"
                      >
                        Nenhuma rota encontrada.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
