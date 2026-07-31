/**
 * Presets de filtros da Inbox: salvar a combinação atual, aplicar, editar e remover.
 *
 * Implementação nativa (botão + painel absoluto) para manter consistência com
 * o FailureCategoryFilter e evitar loops de composição do Radix no sidebar.
 */
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Bookmark, Plus, Trash2, ChevronDown, Pencil, Check, X, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  PRESET_NAME_MAX_LENGTH,
  validatePresetName,
  type InboxFilterPreset,
  type InboxFilterPresetInput,
} from '../hooks/inboxFilterPresets';
import type { MainTab, SubTab } from './TicketTabs';


interface Props {
  presets: InboxFilterPreset[];
  onApply: (preset: InboxFilterPreset) => void;
  onSave: (name: string) => void;
  onDelete: (id: string) => void;
  onUpdate: (id: string, changes: Partial<InboxFilterPresetInput>) => void;
  onUpdateWithCurrent: (id: string) => void;
}

const MAIN_TAB_OPTIONS: { value: MainTab; label: string }[] = [
  { value: 'open', label: 'Abertos' },
  { value: 'resolved', label: 'Resolvidos' },
  { value: 'unread', label: 'Não lidas' },
  { value: 'search', label: 'Busca' },
];

const SUB_TAB_OPTIONS: { value: SubTab; label: string }[] = [
  { value: 'waiting', label: 'Aguardando' },
  { value: 'attending', label: 'Atendendo' },
];

const selectClass =
  'h-7 w-full rounded-md border border-border/60 bg-background px-1.5 text-[11px] focus:outline-none focus:ring-1 focus:ring-ring';

/** Inbox Filter Presets control. */
export const InboxFilterPresets = memo(function InboxFilterPresets({
  presets,
  onApply,
  onSave,
  onDelete,
  onUpdate,
  onUpdateWithCurrent,
}: Props) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Partial<InboxFilterPresetInput>>({});
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocDown = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDocDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // Fecha o modo de edição ao fechar o painel, evitando estado órfão.
  useEffect(() => {
    if (!open) {
      setEditingId(null);
      setDraft({});
    }
  }, [open]);

  // Duplicidade no formulário de criação não bloqueia: o preset é sobrescrito.
  const duplicateOnCreate = useMemo(
    () =>
      presets.find((p) => p.name.trim().toLowerCase() === name.trim().toLowerCase()) ?? null,
    [presets, name]
  );

  const saveValidation = useMemo(
    () => validatePresetName(name, presets, duplicateOnCreate?.id),
    [name, presets, duplicateOnCreate]
  );

  const editValidation = useMemo(
    () => validatePresetName(draft.name ?? '', presets, editingId ?? undefined),
    [draft.name, presets, editingId]
  );

  // Só exibe o erro depois que o usuário digitou algo (evita erro no campo vazio).
  const saveError = name.length > 0 ? saveValidation.error : null;
  const editError = editingId && (draft.name ?? '').length > 0 ? editValidation.error : null;

  const handleSave = useCallback(() => {
    if (!saveValidation.ok) return;
    onSave(saveValidation.value);
    setName('');
  }, [saveValidation, onSave]);

  const startEditing = useCallback((preset: InboxFilterPreset) => {
    setEditingId(preset.id);
    setDraft({
      name: preset.name,
      mainTab: preset.mainTab,
      subTab: preset.subTab,
      search: preset.search ?? '',
      showOnlyRetrying: preset.showOnlyRetrying,
    });
  }, []);

  const cancelEditing = useCallback(() => {
    setEditingId(null);
    setDraft({});
  }, []);

  const commitEditing = useCallback(() => {
    if (!editingId || !editValidation.ok) return;
    onUpdate(editingId, { ...draft, name: editValidation.value });
    cancelEditing();
  }, [editingId, draft, editValidation, onUpdate, cancelEditing]);


  return (
    <div ref={containerRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Presets de filtros da caixa de entrada"
        className={cn(
          'flex h-7 items-center gap-1 rounded-md border border-border/60 bg-muted/40 px-2',
          'text-[11px] text-muted-foreground hover:text-foreground focus:outline-none focus:ring-1 focus:ring-ring'
        )}
      >
        <Bookmark className="h-3 w-3 shrink-0" aria-hidden="true" />
        <span className="truncate">Presets</span>
        {presets.length > 0 && (
          <span className="tabular-nums text-[9px] font-medium">{presets.length}</span>
        )}
        <ChevronDown className="h-3 w-3 shrink-0 opacity-60" aria-hidden="true" />
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Presets salvos"
          className={cn(
            'absolute left-0 z-50 mt-1 max-h-[380px] w-[300px] overflow-y-auto',
            'rounded-md border bg-popover p-2 text-popover-foreground shadow-md'
          )}
        >
          <div className="flex items-center gap-1">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value.slice(0, PRESET_NAME_MAX_LENGTH + 1))}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleSave();
                }
              }}
              placeholder="Nome do preset atual"
              aria-label="Nome do novo preset"
              aria-invalid={saveError ? true : undefined}
              aria-describedby={saveError ? 'inbox-preset-name-error' : undefined}
              maxLength={PRESET_NAME_MAX_LENGTH + 1}
              className={cn('h-8 text-[11px]', saveError && 'border-destructive')}
            />
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="h-8 shrink-0 px-2"
              aria-label="Salvar filtros atuais como preset"
              disabled={!saveValidation.ok}
              onClick={handleSave}
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            </Button>
          </div>

          {saveError ? (
            <p
              id="inbox-preset-name-error"
              role="alert"
              className="mt-1 px-0.5 text-[10px] text-destructive"
            >
              {saveError}
            </p>
          ) : duplicateOnCreate ? (
            <p className="mt-1 px-0.5 text-[10px] text-muted-foreground">
              Um preset com esse nome já existe e será substituído.
            </p>
          ) : null}


          <div className="mt-2 space-y-0.5">
            {presets.length === 0 ? (
              <p className="px-1 py-2 text-[11px] text-muted-foreground">
                Nenhum preset salvo ainda.
              </p>
            ) : (
              presets.map((preset) =>
                editingId === preset.id ? (
                  <div
                    key={preset.id}
                    className="space-y-1.5 rounded-sm border border-border/60 bg-muted/30 p-2"
                  >
                    <Input
                      value={draft.name ?? ''}
                      onChange={(e) =>
                        setDraft((d) => ({
                          ...d,
                          name: e.target.value.slice(0, PRESET_NAME_MAX_LENGTH + 1),
                        }))
                      }
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          commitEditing();
                        }
                      }}
                      placeholder="Nome do preset"
                      aria-label={`Renomear preset ${preset.name}`}
                      aria-invalid={editError ? true : undefined}
                      aria-describedby={editError ? 'inbox-preset-edit-error' : undefined}
                      maxLength={PRESET_NAME_MAX_LENGTH + 1}
                      className={cn('h-7 text-[11px]', editError && 'border-destructive')}
                      autoFocus
                    />
                    {editError && (
                      <p
                        id="inbox-preset-edit-error"
                        role="alert"
                        className="px-0.5 text-[10px] text-destructive"
                      >
                        {editError}
                      </p>
                    )}


                    <div className="flex gap-1">
                      <select
                        value={draft.mainTab ?? preset.mainTab}
                        onChange={(e) =>
                          setDraft((d) => ({ ...d, mainTab: e.target.value as MainTab }))
                        }
                        aria-label="Aba do preset"
                        className={selectClass}
                      >
                        {MAIN_TAB_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                      <select
                        value={draft.subTab ?? preset.subTab}
                        onChange={(e) =>
                          setDraft((d) => ({ ...d, subTab: e.target.value as SubTab }))
                        }
                        aria-label="Sub-aba do preset"
                        className={selectClass}
                      >
                        {SUB_TAB_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <Input
                      value={draft.search ?? ''}
                      onChange={(e) => setDraft((d) => ({ ...d, search: e.target.value }))}
                      placeholder="Termo de busca (opcional)"
                      aria-label="Busca do preset"
                      className="h-7 text-[11px]"
                    />

                    <label className="flex items-center gap-1.5 px-0.5 text-[11px] text-muted-foreground">
                      <input
                        type="checkbox"
                        checked={draft.showOnlyRetrying ?? preset.showOnlyRetrying}
                        onChange={(e) =>
                          setDraft((d) => ({ ...d, showOnlyRetrying: e.target.checked }))
                        }
                        className="h-3.5 w-3.5 accent-primary"
                      />
                      Somente com falha/reenvio
                    </label>

                    <div className="flex items-center gap-1 pt-0.5">
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        className="h-7 flex-1 px-2 text-[11px]"
                        disabled={!editValidation.ok}
                        onClick={commitEditing}
                      >
                        <Check className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                        Salvar
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-[11px]"
                        aria-label={`Substituir preset ${preset.name} pelos filtros atuais`}
                        onClick={() => {
                          onUpdateWithCurrent(preset.id);
                          cancelEditing();
                        }}
                      >
                        <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-[11px]"
                        aria-label="Cancelar edição"
                        onClick={cancelEditing}
                      >
                        <X className="h-3.5 w-3.5" aria-hidden="true" />
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div
                    key={preset.id}
                    className="flex items-center gap-1 rounded-sm hover:bg-accent hover:text-accent-foreground"
                  >
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        onApply(preset);
                        setOpen(false);
                      }}
                      className="flex-1 truncate px-2 py-1.5 text-left text-[11px] focus:outline-none"
                    >
                      {preset.name}
                    </button>
                    <button
                      type="button"
                      aria-label={`Editar preset ${preset.name}`}
                      onClick={() => startEditing(preset)}
                      className="rounded-sm p-1 text-muted-foreground hover:text-foreground focus:outline-none"
                    >
                      <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      aria-label={`Remover preset ${preset.name}`}
                      onClick={() => onDelete(preset.id)}
                      className="mr-1 rounded-sm p-1 text-muted-foreground hover:text-destructive focus:outline-none"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  </div>
                )
              )
            )}
          </div>
        </div>
      )}
    </div>
  );
});
