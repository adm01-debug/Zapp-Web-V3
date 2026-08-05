import { useState } from 'react';
import { Plus, Trash2, Pencil, Loader2, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  useEmailTemplates,
  type EmailTemplate,
  type EmailTemplateInput,
} from '@/hooks/email/useEmailTemplates';
import { toast } from 'sonner';

/**
 * EmailTemplatesSettings — Gestão de templates de e-mail (EMAIL-09).
 * CRUD em email_templates, no padrão dos demais painéis de SettingsView.
 * Os templates ficam disponíveis na barra de resposta de e-mail
 * (EmailChatReplyBar) via botão de inserção.
 */

const EMPTY_FORM: EmailTemplateInput = { name: '', subject: '', body: '', category: '' };

export function EmailTemplatesSettings() {
  const { templates, isLoading, saveTemplate, removeTemplate } = useEmailTemplates();

  const [showDialog, setShowDialog] = useState(false);
  const [editing, setEditing] = useState<EmailTemplate | null>(null);
  const [form, setForm] = useState<EmailTemplateInput>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const openNew = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setShowDialog(true);
  };

  const openEdit = (tpl: EmailTemplate) => {
    setEditing(tpl);
    setForm({
      name: tpl.name ?? '',
      subject: tpl.subject ?? '',
      body: tpl.body ?? '',
      category: tpl.category ?? '',
    });
    setShowDialog(true);
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.body.trim()) {
      toast.error('Informe nome e conteúdo do template');
      return;
    }
    setSaving(true);
    const res = await saveTemplate(editing?.id ?? null, {
      name: form.name.trim(),
      subject: form.subject?.trim() || undefined,
      body: form.body,
      category: form.category?.trim() || undefined,
    });
    setSaving(false);
    if (res.error) {
      toast.error(`Falha ao salvar template: ${res.error}`);
      return;
    }
    toast.success(editing ? 'Template atualizado' : 'Template criado');
    setShowDialog(false);
    setForm(EMPTY_FORM);
    setEditing(null);
  };

  const handleRemove = async (tpl: EmailTemplate) => {
    if (!tpl.id) return;
    if (!window.confirm(`Excluir o template "${tpl.name}"?`)) return;
    const res = await removeTemplate(tpl.id);
    if (res.error) toast.error(`Falha ao excluir: ${res.error}`);
    else toast.success('Template excluído');
  };

  return (
    <div className="space-y-5 rounded-xl border border-border bg-card p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-bold tracking-tight">Templates de e-mail</h3>
          <p className="text-xs text-muted-foreground">
            Modelos reutilizáveis de resposta. Disponíveis na barra de resposta de e-mail para
            inserção rápida.
          </p>
        </div>
        <Button size="sm" onClick={openNew}>
          <Plus className="mr-1 h-4 w-4" /> Novo template
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando templates…
        </div>
      ) : templates.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-6 text-center text-sm text-muted-foreground">
          <FileText className="h-8 w-8 opacity-30" />
          <p>Nenhum template de e-mail cadastrado.</p>
          <p className="text-xs">
            Crie modelos de resposta para agilizar o atendimento por e-mail.
          </p>
        </div>
      ) : (
        <ScrollArea className="max-h-[380px]">
          <div className="space-y-2 pr-3">
            {templates.map((tpl) => (
              <div
                key={tpl.id}
                className="flex items-start justify-between gap-3 rounded-lg border border-border/60 bg-muted/20 p-3"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-semibold">{tpl.name}</span>
                    {tpl.category && (
                      <Badge variant="secondary" className="text-[9px]">
                        {tpl.category}
                      </Badge>
                    )}
                  </div>
                  {tpl.subject && (
                    <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                      Assunto: {tpl.subject}
                    </p>
                  )}
                  <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{tpl.body}</p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    aria-label="Editar template"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => openEdit(tpl)}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    aria-label="Excluir template"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-destructive hover:text-destructive"
                    onClick={() => handleRemove(tpl)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      )}

      {/* ── Dialog novo/editar ────────────────────────────────────── */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar template' : 'Novo template de e-mail'}</DialogTitle>
            <DialogDescription>
              O corpo do template pode conter HTML simples (parágrafos, listas, links).
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="tpl-name">Nome *</Label>
                <Input
                  id="tpl-name"
                  className="h-9 text-xs"
                  placeholder="Ex.: Resposta inicial"
                  value={form.name}
                  onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tpl-category">Categoria</Label>
                <Input
                  id="tpl-category"
                  className="h-9 text-xs"
                  placeholder="Ex.: Comercial, Suporte"
                  value={form.category ?? ''}
                  onChange={(e) => setForm((prev) => ({ ...prev, category: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tpl-subject">Assunto (opcional)</Label>
              <Input
                id="tpl-subject"
                className="h-9 text-xs"
                placeholder="Assunto padrão do template"
                value={form.subject ?? ''}
                onChange={(e) => setForm((prev) => ({ ...prev, subject: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tpl-body">Conteúdo *</Label>
              <textarea
                id="tpl-body"
                rows={7}
                className="scrollbar-thin w-full resize-none rounded-lg border border-border/60 bg-background p-3 text-xs leading-relaxed outline-none focus:border-primary/40 focus:ring-1 focus:ring-primary/20"
                placeholder={'Olá,\n\nAqui está a informação solicitada...\n\nAtenciosamente.'}
                value={form.body}
                onChange={(e) => setForm((prev) => ({ ...prev, body: e.target.value }))}
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" size="sm" onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
              {editing ? 'Salvar alterações' : 'Criar template'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
