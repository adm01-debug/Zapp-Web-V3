import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { safeClient } from '@/integrations/supabase/safeClient';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
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

interface Department {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  member_count?: number;
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

export default function DepartmentsPage() {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showDialog, setShowDialog] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<Department | null>(null);

  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [description, setDescription] = useState('');
  const [isActive, setIsActive] = useState(true);

  const fetchDepartments = useCallback(async () => {
    setLoading(true);
    const { data, error } = await safeClient.from<Department>(
      'departments',
      (q) => q.select('*').order('name'),
    );

    if (error) {
      toast.error('Erro ao carregar departamentos');
      setLoading(false);
      return;
    }

    // Count members per department
    const ids = (data ?? []).map((d) => d.id);
    let counts: Record<string, number> = {};
    if (ids.length) {
      const { data: profilesByDept , error: profilesByDeptErr } = await supabase
        .from('profiles')
        .select('department_id')
        .in('department_id', ids);
      counts = (profilesByDept ?? []).reduce<Record<string, number>>((acc, p) => {
        if (p.department_id) acc[p.department_id] = (acc[p.department_id] ?? 0) + 1;
        return acc;
      }, {});
    }

    setDepartments(
      (data ?? []).map((d) => ({ ...d, member_count: counts[d.id] ?? 0 })),
    );
    setLoading(false);
  }, []);

  useEffect(() => {
    void fetchDepartments();
  }, [fetchDepartments]);

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

    setSaving(true);
    const payload = {
      name: trimmedName,
      slug: finalSlug,
      description: description.trim() || null,
      is_active: isActive,
    };

    const { error } = editingId
      ? await safeClient.from('departments', (q) => q.update(payload).eq('id', editingId))
      : await safeClient.from('departments', (q) => q.insert(payload));

    setSaving(false);

    if (error) {
      toast.error(
        error.message.includes('duplicate')
          ? 'Já existe um departamento com esse nome ou identificador'
          : 'Erro ao salvar departamento',
      );
      return;
    }

    toast.success(editingId ? 'Departamento atualizado' : 'Departamento criado');
    setShowDialog(false);
    resetForm();
    void fetchDepartments();
  };

  const handleDelete = async () => {
    if (!toDelete) return;
    setSaving(true);
    const { error } = await supabase.from('departments').delete().eq('id', toDelete.id);
    setSaving(false);

    if (error) {
      toast.error('Erro ao remover departamento');
      return;
    }

    toast.success('Departamento removido');
    setToDelete(null);
    void fetchDepartments();
  };

  return (
    <div className="container mx-auto p-6 max-w-5xl">
      <header className="flex items-start justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Building2 className="w-6 h-6 text-primary" aria-hidden="true" />
            Departamentos
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Organize sua equipe em departamentos. Supervisores enxergam apenas conversas
            e contatos do próprio departamento.
          </p>
        </div>
        <Button onClick={openCreate} className="gap-2">
          <Plus className="w-4 h-4" aria-hidden="true" />
          Novo departamento
        </Button>
      </header>

      {loading ? (
        <div className="flex items-center justify-center py-16" role="status">
          <Loader2 className="w-8 h-8 animate-spin text-primary" aria-hidden="true" />
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
                <div className="flex items-start justify-between gap-3 flex-wrap">
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
                      <code className="text-xs px-1.5 py-0.5 rounded bg-muted">
                        {dept.slug}
                      </code>
                      <span className="text-xs">
                        {dept.member_count ?? 0}{' '}
                        {dept.member_count === 1 ? 'membro' : 'membros'}
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
                      <Pencil className="w-4 h-4" aria-hidden="true" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setToDelete(dept)}
                      aria-label={`Remover ${dept.name}`}
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="w-4 h-4" aria-hidden="true" />
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
            <DialogTitle>
              {editingId ? 'Editar departamento' : 'Novo departamento'}
            </DialogTitle>
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
              {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" aria-hidden="true" />}
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
              Tem certeza que deseja remover o departamento{' '}
              <strong>{toDelete?.name}</strong>? Os usuários atualmente vinculados ficarão
              sem departamento e essa ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={saving}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" aria-hidden="true" />}
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}