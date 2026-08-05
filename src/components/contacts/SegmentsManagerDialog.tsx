/**
 * SegmentsManagerDialog — UI de segmentos de contato (CONTATOS-07).
 *
 * Lista segmentos de zapp.contact_segments (via useContactSegments), permite
 * criar/editar/excluir. Como a RLS atual só permite SELECT (auth_secure_190),
 * as mutações falham com aviso claro orientando a migration necessária — a UI
 * degrada com elegância (leitura funcional, escrita sinalizada).
 */
import { useState, useCallback } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { Loader2, Plus, Pencil, Trash2, Tags, ShieldAlert, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  useContactSegments, SEGMENTS_RLS_HINT,
  type ContactSegment,
} from '@/hooks/contacts/useContactSegments';

interface SegmentsManagerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface SegmentDraft {
  name: string;
  description: string;
}

const EMPTY_DRAFT: SegmentDraft = { name: '', description: '' };

/** Segments Manager Dialog component for the contacts section. */
export function SegmentsManagerDialog({ open, onOpenChange }: SegmentsManagerDialogProps) {
  const { segments, loading, loadError, refresh, createSegment, updateSegment, deleteSegment } =
    useContactSegments();

  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<SegmentDraft>(EMPTY_DRAFT);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<SegmentDraft>(EMPTY_DRAFT);
  const [rlsHintVisible, setRlsHintVisible] = useState(false);

  const handleCreate = useCallback(async () => {
    if (!draft.name.trim()) {
      toast.error('Informe um nome para o segmento.');
      return;
    }
    setSaving(true);
    const result = await createSegment({ name: draft.name, description: draft.description });
    setSaving(false);
    if (result.error) {
      if (result.rlsBlocked) {
        setRlsHintVisible(true);
        toast.error('Sem permissão de escrita: RLS só permite SELECT em contact_segments.');
      } else {
        toast.error(result.error);
      }
      return;
    }
    toast.success(`Segmento "${draft.name.trim()}" criado!`);
    setDraft(EMPTY_DRAFT);
    setCreating(false);
  }, [draft, createSegment]);

  const startEdit = useCallback((segment: ContactSegment) => {
    setEditingId(segment.id);
    setEditDraft({ name: segment.name, description: segment.description ?? '' });
  }, []);

  const handleSaveEdit = useCallback(async () => {
    if (!editingId) return;
    if (!editDraft.name.trim()) {
      toast.error('O nome do segmento não pode ficar vazio.');
      return;
    }
    setSaving(true);
    const result = await updateSegment(editingId, {
      name: editDraft.name,
      description: editDraft.description,
    });
    setSaving(false);
    if (result.error) {
      if (result.rlsBlocked) {
        setRlsHintVisible(true);
        toast.error('Sem permissão de escrita: RLS só permite SELECT em contact_segments.');
      } else {
        toast.error(result.error);
      }
      return;
    }
    toast.success('Segmento atualizado!');
    setEditingId(null);
  }, [editingId, editDraft, updateSegment]);

  const handleDelete = useCallback(
    async (segment: ContactSegment) => {
      if (segment.is_system) {
        toast.error('Segmentos do sistema não podem ser excluídos.');
        return;
      }
      setSaving(true);
      const result = await deleteSegment(segment.id);
      setSaving(false);
      if (result.error) {
        if (result.rlsBlocked) {
          setRlsHintVisible(true);
          toast.error('Sem permissão de escrita: RLS só permite SELECT em contact_segments.');
        } else {
          toast.error(result.error);
        }
        return;
      }
      toast.success(`Segmento "${segment.name}" excluído.`);
    },
    [deleteSegment]
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-xl overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Tags className="h-5 w-5 text-primary" />
            Segmentos de Contato
          </DialogTitle>
          <DialogDescription>
            Segmentos locais (zapp.contact_segments) usados para agrupar contatos.
          </DialogDescription>
        </DialogHeader>

        {rlsHintVisible && (
          <Alert variant="destructive" className="mb-2">
            <ShieldAlert className="h-4 w-4" />
            <AlertTitle>Escrita bloqueada pela RLS</AlertTitle>
            <AlertDescription className="text-xs">{SEGMENTS_RLS_HINT}</AlertDescription>
          </Alert>
        )}

        {creating && (
          <div className="space-y-3 rounded-lg border p-3">
            <div className="grid grid-cols-1 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="seg-name">Nome *</Label>
                <Input
                  id="seg-name"
                  value={draft.name}
                  onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                  placeholder="Ex.: Clientes VIP"
                  maxLength={200}
                  autoFocus
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="seg-desc">Descrição</Label>
                <Input
                  id="seg-desc"
                  value={draft.description}
                  onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
                  placeholder="Descrição opcional do segmento"
                  maxLength={500}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => { setCreating(false); setDraft(EMPTY_DRAFT); }}>
                Cancelar
              </Button>
              <Button size="sm" onClick={handleCreate} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                Criar segmento
              </Button>
            </div>
          </div>
        )}

        <ScrollArea className="max-h-[45vh] pr-3">
          {loading ? (
            <div className="space-y-2 py-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : loadError ? (
            <Alert variant="destructive">
              <AlertTitle>Falha ao carregar segmentos</AlertTitle>
              <AlertDescription className="text-xs">{loadError}</AlertDescription>
            </Alert>
          ) : segments.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Nenhum segmento cadastrado ainda.
            </p>
          ) : (
            <ul className="divide-y">
              {segments.map((segment) => (
                <li key={segment.id} className="flex items-start justify-between gap-3 py-2.5">
                  {editingId === segment.id ? (
                    <div className="flex-1 space-y-2">
                      <Input
                        value={editDraft.name}
                        onChange={(e) => setEditDraft((d) => ({ ...d, name: e.target.value }))}
                        maxLength={200}
                      />
                      <Input
                        value={editDraft.description}
                        onChange={(e) => setEditDraft((d) => ({ ...d, description: e.target.value }))}
                        placeholder="Descrição"
                        maxLength={500}
                      />
                      <div className="flex gap-2">
                        <Button size="sm" onClick={handleSaveEdit} disabled={saving}>
                          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Salvar
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => setEditingId(null)}>
                          Cancelar
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="truncate text-sm font-medium">{segment.name}</span>
                          {segment.is_system && (
                            <Badge variant="secondary" className="text-[10px]">sistema</Badge>
                          )}
                          {typeof segment.contact_count === 'number' && (
                            <Badge variant="outline" className="text-[10px]">
                              {segment.contact_count} contato(s)
                            </Badge>
                          )}
                        </div>
                        {segment.description && (
                          <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                            {segment.description}
                          </p>
                        )}
                        <p className="mt-0.5 text-[10px] text-muted-foreground/70">
                          Criado em{' '}
                          {format(new Date(segment.created_at), 'dd/MM/yyyy HH:mm', { locale: ptBR })}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          title="Editar segmento"
                          onClick={() => startEdit(segment)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 hover:text-destructive"
                          title={segment.is_system ? 'Segmentos do sistema não podem ser excluídos' : 'Excluir segmento'}
                          disabled={segment.is_system}
                          onClick={() => handleDelete(segment)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </ScrollArea>

        <DialogFooter className="gap-2">
          <Button variant="outline" size="sm" onClick={() => refresh()} disabled={loading}>
            <RefreshCw className="h-4 w-4" />
            Atualizar
          </Button>
          <Button size="sm" onClick={() => { setCreating(true); setRlsHintVisible(false); }}>
            <Plus className="h-4 w-4" />
            Novo segmento
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default SegmentsManagerDialog;
