import { useState } from 'react';
import { toast } from 'sonner';
import { useDepartmentsAdmin, type Department } from '@/hooks/admin/useDepartmentsAdmin';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Loader2, Plus, Pencil, Trash2, Building2 } from 'lucide-react';
import { Label } from '@/components/ui/label';


function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

/** Departments Page. */
export default function DepartmentsPage() {
  const { departments, loading, saving, save, removeDepartment } = useDepartmentsAdmin();
  const [showDialog, setShowDialog] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<Department | null>(null);

  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [description, setDescription] = useState('');
  const [isActive, setIsActive] = useState(true);

  const resetForm = () => {
    setEditingId(null);
    setName('');
    setSlug('');
    setDescription('');
    setIsActive(true);
  };

  const openCreate = () => {
    resetForm();
    setShowDialog(true);
  };

  const openEdit = (dept: Department) => {
    setEditingId(dept.id);
    setName(dept.name);
    setSlug(dept.slug);
    setDescription(dept.description ?? '');
    setIsActive(dept.is_active);
    setShowDialog(true);
  };

  const handleSave = async () => {
    const trimmedName = name.trim();
    const finalSlug = slug.trim() || slugify(trimmedName);

    if (!trimmedName) {
      toast.error('Nome é obrigatório');
      return;
    }
    if (!finalSlug) {
      toast.error('Identificador (slug) inválido');
      return;
    }

    const payload = {
      name: trimmedName,
      slug: finalSlug,
      description: description.trim() || null,
      is_active: isActive,
    };

    const ok = await save(payload, editingId);
    if (ok) {
      setShowDialog(false);
      resetForm();
    }
  };

  const handleDelete = async () => {
    if (!toDelete) return;
    if (await removeDepartment(toDelete.id)) setToDelete(null);
  };

  return (
    <div className="container mx-auto max-w-5xl p-6">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Building2 className="h-6 w-6 text-primary" aria-hidden="true" />
            Departamentos
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Organize sua equipe em departamentos. Supervisores enxergam apenas conversas e contatos
            do próprio departamento.
          </p>
        </div>
        <Button onClick={openCreate} className="gap-2">
          <Plus className="h-4 w-4" aria-hidden="true" />
          Novo departamento
        </Button>
      </header>

      {loading ? (
        <div className="flex items-center justify-center py-16" role="status">
          <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden="true" />
          <span className="sr-only">Carregando departamentos…</span>
        </div>
      ) : departments.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Nenhum departamento cadastrado ainda.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {departments.map((dept) => (
            <Card key={dept.id} className={dept.is_active ? '' : 'opacity-60'}>
              <CardHeader className="pb-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <CardTitle className="flex items-center gap-2 text-lg">
                      {dept.name}
                      {!dept.is_active && (
                        <Badge variant="outline" className="text-xs">
                          Inativo
                        </Badge>
                      )}
                    </CardTitle>
                    <CardDescription className="flex items-center gap-2">
                      <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{dept.slug}</code>
                      <span
                        className="text-xs"
                        title={dept.member_count === undefined ? 'Não foi possível carregar a contagem de membros' : undefined}
                      >
                        {dept.member_count === undefined
                          ? '— membros'
                          : `${dept.member_count} ${dept.member_count === 1 ? 'membro' : 'membros'}`}
                      </span>
                    </CardDescription>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => openEdit(dept)}
                      aria-label={`Editar ${dept.name}`}
                    >
                      <Pencil className="h-4 w-4" aria-hidden="true" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setToDelete(dept)}
                      aria-label={`Remover ${dept.name}`}
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              {dept.description && (
                <CardContent className="pt-0 text-sm text-muted-foreground">
                  {dept.description}
                </CardContent>
              )}
            </Card>
          ))}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={showDialog} onOpenChange={(o) => !o && resetForm()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? 'Editar departamento' : 'Novo departamento'}</DialogTitle>
            <DialogDescription>
              Departamentos limitam o que cada supervisor enxerga no inbox e no CRM.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="dept-name">Nome</Label>
              <Input
                id="dept-name"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (!editingId) setSlug(slugify(e.target.value));
                }}
                placeholder="Ex: Comercial"
                maxLength={100}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="dept-slug">Identificador (slug)</Label>
              <Input
                id="dept-slug"
                value={slug}
                onChange={(e) => setSlug(slugify(e.target.value))}
                placeholder="comercial"
                maxLength={60}
              />
              <p className="text-xs text-muted-foreground">
                Usado internamente. Apenas letras minúsculas, números e hífen.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="dept-desc">Descrição (opcional)</Label>
              <Textarea
                id="dept-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="O que esse departamento faz?"
                rows={3}
                maxLength={500}
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="dept-active">Ativo</Label>
                <p className="text-xs text-muted-foreground">
                  Departamentos inativos não aparecem em seletores.
                </p>
              </div>
              <Switch id="dept-active" checked={isActive} onCheckedChange={setIsActive} />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowDialog(false);
                resetForm();
              }}
              disabled={saving}
            >
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover departamento?</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja remover o departamento <strong>{toDelete?.name}</strong>? Os
              usuários atualmente vinculados ficarão sem departamento e essa ação não pode ser
              desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={saving}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
