import { useState } from 'react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ListChecks, Loader2, Plus, Pencil, Trash2, Check, X } from 'lucide-react';
import { useContactCustomFields } from '@/features/contacts';
import { toast } from 'sonner';

interface CustomFieldsSectionProps {
  contactId: string;
}

/**
 * Seção "Campos Customizados" do painel de detalhes do contato (CONTATOS-04).
 * Lista + edição de valores de contact_custom_fields via useContactCustomFields
 * (CRUD: upsert por (contact_id, field_name) e delete por id).
 */
export function CustomFieldsSection({ contactId }: CustomFieldsSectionProps) {
  const { fields, isLoading, addField, removeField } = useContactCustomFields(contactId);

  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newValue, setNewValue] = useState('');
  const [savingAdd, setSavingAdd] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  const handleAdd = async () => {
    const name = newName.trim();
    const value = newValue.trim();
    if (!name || !value) return;
    setSavingAdd(true);
    try {
      await addField(name, value);
      setNewName('');
      setNewValue('');
      setAdding(false);
      toast.success('Campo adicionado!');
    } catch {
      toast.error('Erro ao adicionar campo');
    } finally {
      setSavingAdd(false);
    }
  };

  const handleEditSave = async (fieldId: string, fieldName: string) => {
    const value = editValue.trim();
    if (!value) return;
    setSavingEdit(true);
    try {
      // addField é upsert por (contact_id, field_name) — edição de valor reusa o mesmo caminho.
      await addField(fieldName, value);
      setEditingId(null);
      toast.success('Campo atualizado!');
    } catch {
      toast.error('Erro ao salvar campo');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleRemove = async (fieldId: string) => {
    try {
      await removeField(fieldId);
      toast.success('Campo removido');
    } catch {
      toast.error('Erro ao remover campo');
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-4">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-2" data-testid="custom-fields-section">
      {fields.length === 0 && !adding && (
        <div className="flex flex-col items-center gap-1.5 py-4 text-center">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted/20">
            <ListChecks className="h-5 w-5 text-muted-foreground/30" />
          </div>
          <p className="text-xs text-muted-foreground/60">Nenhum campo customizado</p>
        </div>
      )}

      {fields.map((field, i) => (
        <motion.div
          key={field.id ?? `${field.field_name}-${i}`}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.03 }}
          className="group flex items-center justify-between gap-2 rounded-lg bg-background/40 p-2.5 transition-colors hover:bg-muted/30"
        >
          <div className="min-w-0 flex-1">
            <p className="truncate text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              {field.field_name}
            </p>
            {editingId === field.id ? (
              <div className="mt-1 flex items-center gap-1.5">
                <Input
                  inputSize="sm"
                  className="h-7 flex-1 text-sm"
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void handleEditSave(field.id!, field.field_name);
                    if (e.key === 'Escape') setEditingId(null);
                  }}
                  autoFocus
                  disabled={savingEdit}
                />
                <Button
                  aria-label="Salvar campo"
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-primary hover:bg-primary/10"
                  onClick={() => void handleEditSave(field.id!, field.field_name)}
                  disabled={savingEdit}
                >
                  <Check className="h-3 w-3" />
                </Button>
                <Button
                  aria-label="Cancelar edição"
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-destructive hover:bg-destructive/10"
                  onClick={() => setEditingId(null)}
                  disabled={savingEdit}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            ) : (
              <p className="truncate text-sm text-foreground">{field.field_value}</p>
            )}
          </div>
          {editingId !== field.id && (
            <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
              <Button
                aria-label={`Editar ${field.field_name}`}
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-muted-foreground hover:text-primary"
                onClick={() => {
                  setEditingId(field.id ?? null);
                  setEditValue(field.field_value ?? '');
                }}
              >
                <Pencil className="h-3 w-3" />
              </Button>
              <Button
                aria-label={`Remover ${field.field_name}`}
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-muted-foreground hover:text-destructive"
                onClick={() => {
                  if (field.id) void handleRemove(field.id);
                }}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          )}
        </motion.div>
      ))}

      {adding ? (
        <div className="space-y-1.5 rounded-lg border border-border/30 bg-background/40 p-2">
          <Input
            inputSize="sm"
            placeholder="Nome do campo"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            disabled={savingAdd}
          />
          <Input
            inputSize="sm"
            placeholder="Valor"
            value={newValue}
            onChange={(e) => setNewValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void handleAdd();
              if (e.key === 'Escape') setAdding(false);
            }}
            disabled={savingAdd}
          />
          <div className="flex justify-end gap-1 pt-0.5">
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-xs"
              onClick={() => {
                setAdding(false);
                setNewName('');
                setNewValue('');
              }}
              disabled={savingAdd}
            >
              Cancelar
            </Button>
            <Button
              variant="default"
              size="sm"
              className="h-6 text-xs"
              onClick={() => void handleAdd()}
              disabled={savingAdd || !newName.trim() || !newValue.trim()}
            >
              {savingAdd ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Plus className="mr-1 h-3 w-3" />}
              Adicionar
            </Button>
          </div>
        </div>
      ) : (
        fields.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 border border-dashed border-border/40 text-xs hover:border-primary/30 hover:bg-primary/10 hover:text-primary"
            onClick={() => setAdding(true)}
          >
            <Plus className="mr-1 h-3 w-3" />
            Adicionar campo
          </Button>
        )
      )}
    </div>
  );
}
