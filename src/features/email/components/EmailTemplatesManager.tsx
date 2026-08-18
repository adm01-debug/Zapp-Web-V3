import { useState } from 'react';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, Mail, FileText, RefreshCw } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

import {
  useEmailTemplates,
  type EmailTemplate,
  type EmailTemplateInput,
} from '@/hooks/useEmailTemplates';

// ──────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ──────────────────────────────────────────────────────────────────────────

const CATEGORIES = [
  { value: 'transactional', label: 'Transacional' },
  { value: 'marketing', label: 'Marketing' },
  { value: 'notification', label: 'Notificação' },
  { value: 'other', label: 'Outro' },
] as const;

const CATEGORY_BADGE_VARIANT: Record<string, string> = {
  transactional: 'bg-primary text-primary dark:bg-primary/30 dark:text-primary',
  marketing: 'bg-accent text-accent dark:bg-accent/30 dark:text-accent',
  notification: 'bg-warning text-warning dark:bg-warning/30 dark:text-warning',
  other: 'bg-muted text-muted dark:bg-muted dark:text-muted',
};

const CATEGORY_LABELS: Record<string, string> = {
  transactional: 'Transacional',
  marketing: 'Marketing',
  notification: 'Notificação',
  other: 'Outro',
};

// ──────────────────────────────────────────────────────────────────────────
// EMPTY FORM
// ──────────────────────────────────────────────────────────────────────────

const emptyForm = (): EmailTemplateInput => ({
  name: '',
  subject: '',
  body: '',
  category: 'other',
});

// ──────────────────────────────────────────────────────────────────────────
// COMPONENT
// ──────────────────────────────────────────────────────────────────────────

/**
 * EmailTemplatesManager
 * Full CRUD UI for the email_templates table.
 * Provides a table listing with name, category badge, subject preview,
 * and edit/delete actions. Uses a Dialog for create/edit and an
 * AlertDialog for delete confirmation.
 */
export function EmailTemplatesManager() {
  const { templates, loading, error, fetchTemplates, createTemplate, updateTemplate, deleteTemplate } =
    useEmailTemplates();

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<EmailTemplate | null>(null);
  const [form, setForm] = useState<EmailTemplateInput>(emptyForm());
  const [saving, setSaving] = useState(false);

  // Delete confirmation state
  const [deleteTarget, setDeleteTarget] = useState<EmailTemplate | null>(null);
  const [deleting, setDeleting] = useState(false);

  // ── Helpers ─────────────────────────────────────────────────────────────

  const openCreate = () => {
    setEditingTemplate(null);
    setForm(emptyForm());
    setDialogOpen(true);
  };

  const openEdit = (tpl: EmailTemplate) => {
    setEditingTemplate(tpl);
    setForm({
      name: tpl.name,
      subject: tpl.subject,
      body: tpl.body,
      category: tpl.category,
    });
    setDialogOpen(true);
  };

  const closeDialog = () => {
    setDialogOpen(false);
    setEditingTemplate(null);
    setForm(emptyForm());
  };

  const patchForm = (patch: Partial<EmailTemplateInput>) =>
    setForm((prev) => ({ ...prev, ...patch }));

  // ── Save (create / update) ───────────────────────────────────────────────

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error('O nome do template é obrigatório.');
      return;
    }
    if (!form.subject.trim()) {
      toast.error('O assunto é obrigatório.');
      return;
    }
    if (!form.body.trim()) {
      toast.error('O corpo do email é obrigatório.');
      return;
    }

    setSaving(true);
    try {
      if (editingTemplate) {
        const { error: err } = await updateTemplate(editingTemplate.id, form);
        if (err) {
          toast.error(`Erro ao atualizar template: ${err}`);
          return;
        }
        toast.success('Template atualizado com sucesso.');
      } else {
        const { error: err } = await createTemplate(form);
        if (err) {
          toast.error(`Erro ao criar template: ${err}`);
          return;
        }
        toast.success('Template criado com sucesso.');
      }
      closeDialog();
    } finally {
      setSaving(false);
    }
  };

  // ── Delete ───────────────────────────────────────────────────────────────

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const { error: err } = await deleteTemplate(deleteTarget.id);
      if (err) {
        toast.error(`Erro ao excluir template: ${err}`);
        return;
      }
      toast.success(`Template "${deleteTarget.name}" excluído.`);
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Mail className="h-5 w-5" />
            Templates de Email
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => void fetchTemplates()}
              disabled={loading}
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Atualizar
            </Button>
            <Button size="sm" className="gap-1.5" onClick={openCreate}>
              <Plus className="h-4 w-4" />
              Novo Template
            </Button>
          </div>
        </CardHeader>

        <CardContent>
          {error && (
            <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <div className="rounded-md border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th scope="col" className="px-4 py-3 text-left font-medium">
                    Nome
                  </th>
                  <th scope="col" className="px-4 py-3 text-left font-medium">
                    Categoria
                  </th>
                  <th scope="col" className="hidden px-4 py-3 text-left font-medium md:table-cell">
                    Assunto
                  </th>
                  <th scope="col" className="hidden px-4 py-3 text-left font-medium lg:table-cell">
                    Criado em
                  </th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">
                    Ações
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {loading ? (
                  Array.from({ length: 4 }).map((_, i) => (
                    <tr key={i}>
                      <td className="px-4 py-3">
                        <Skeleton className="h-4 w-32" />
                      </td>
                      <td className="px-4 py-3">
                        <Skeleton className="h-5 w-24 rounded-full" />
                      </td>
                      <td className="hidden px-4 py-3 md:table-cell">
                        <Skeleton className="h-4 w-48" />
                      </td>
                      <td className="hidden px-4 py-3 lg:table-cell">
                        <Skeleton className="h-4 w-24" />
                      </td>
                      <td className="px-4 py-3">
                        <Skeleton className="ml-auto h-8 w-16" />
                      </td>
                    </tr>
                  ))
                ) : templates.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-4 py-10 text-center italic text-muted-foreground"
                    >
                      <div className="flex flex-col items-center gap-2">
                        <FileText className="h-8 w-8 text-muted-foreground/50" />
                        <span>Nenhum template encontrado.</span>
                        <Button variant="outline" size="sm" onClick={openCreate}>
                          <Plus className="mr-1.5 h-3.5 w-3.5" />
                          Criar primeiro template
                        </Button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  templates.map((tpl) => (
                    <tr key={tpl.id} className="hover:bg-muted/30">
                      <td className="px-4 py-3 font-medium">{tpl.name}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                            CATEGORY_BADGE_VARIANT[tpl.category] ??
                            CATEGORY_BADGE_VARIANT['other']
                          }`}
                        >
                          {CATEGORY_LABELS[tpl.category] ?? tpl.category}
                        </span>
                      </td>
                      <td className="hidden max-w-[260px] truncate px-4 py-3 text-muted-foreground md:table-cell">
                        {tpl.subject}
                      </td>
                      <td className="hidden px-4 py-3 text-muted-foreground lg:table-cell">
                        {new Date(tpl.created_at).toLocaleDateString('pt-BR')}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            aria-label="Editar template"
                            onClick={() => openEdit(tpl)}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            aria-label="Excluir template"
                            onClick={() => setDeleteTarget(tpl)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {!loading && templates.length > 0 && (
            <p className="mt-2 text-xs text-muted-foreground">
              {templates.length} template{templates.length !== 1 ? 's' : ''} cadastrado
              {templates.length !== 1 ? 's' : ''}.
            </p>
          )}
        </CardContent>
      </Card>

      {/* ── Create / Edit Dialog ─────────────────────────────────────────── */}
      <Dialog open={dialogOpen} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent className="sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle>
              {editingTemplate ? 'Editar Template' : 'Novo Template de Email'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Name */}
            <div className="space-y-1.5">
              <Label htmlFor="tpl-name">Nome *</Label>
              <Input
                id="tpl-name"
                placeholder="Ex: Boas-vindas ao cliente"
                value={form.name}
                onChange={(e) => patchForm({ name: e.target.value })}
              />
            </div>

            {/* Category */}
            <div className="space-y-1.5">
              <Label htmlFor="tpl-category">Categoria *</Label>
              <Select value={form.category} onValueChange={(v) => patchForm({ category: v })}>
                <SelectTrigger id="tpl-category">
                  <SelectValue placeholder="Selecione a categoria" />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((cat) => (
                    <SelectItem key={cat.value} value={cat.value}>
                      {cat.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Subject */}
            <div className="space-y-1.5">
              <Label htmlFor="tpl-subject">Assunto *</Label>
              <Input
                id="tpl-subject"
                placeholder="Ex: Bem-vindo à nossa plataforma!"
                value={form.subject}
                onChange={(e) => patchForm({ subject: e.target.value })}
              />
            </div>

            {/* Body */}
            <div className="space-y-1.5">
              <Label htmlFor="tpl-body">Corpo do Email *</Label>
              <Textarea
                id="tpl-body"
                placeholder="Escreva o conteúdo do email aqui..."
                rows={6}
                value={form.body}
                onChange={(e) => patchForm({ body: e.target.value })}
                className="resize-y"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeDialog} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={() => void handleSave()} disabled={saving}>
              {saving ? 'Salvando...' : editingTemplate ? 'Salvar Alterações' : 'Criar Template'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirmation AlertDialog ──────────────────────────────── */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir template?</AlertDialogTitle>
            <AlertDialogDescription>
              O template{' '}
              <strong className="text-foreground">{deleteTarget?.name}</strong> será excluído
              permanentemente. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => void handleDelete()}
              disabled={deleting}
            >
              {deleting ? 'Excluindo...' : 'Excluir'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
