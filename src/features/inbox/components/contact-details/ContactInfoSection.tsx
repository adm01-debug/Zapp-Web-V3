import { queryKeys } from '@/services/api/queryKeys';
import { useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  Phone,
  Mail,
  Calendar,
  Building,
  Briefcase,
  Pencil,
  Check,
  X,
  Plus,
  Copy,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';
import { EnrichedContactData } from '@/hooks/useContactEnrichedData';
import { dbFrom } from '@/integrations/datasource/db';

interface ContactInfoSectionProps {
  contact: {
    id: string;
    phone: string;
    email?: string;
    createdAt: Date;
  };
  enrichedData: EnrichedContactData | null | undefined;
}

interface EditableFieldProps {
  value: string;
  icon: React.ReactNode;
  onSave: (value: string) => Promise<void>;
  placeholder?: string;
  label: string;
}

function EditableField({ value, icon, onSave, placeholder, label }: EditableFieldProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);

  const handleSave = useCallback(async () => {
    if (draft.trim() === value) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      await onSave(draft.trim());
      toast.success('Campo atualizado!');
      setEditing(false);
    } catch {
      toast.error('Erro ao salvar');
    } finally {
      setSaving(false);
    }
  }, [draft, value, onSave]);

  if (editing) {
    return (
      <div className="flex items-center gap-1.5 rounded-lg bg-muted/30 p-1.5">
        <div className="pl-1 text-primary">{icon}</div>
        <Input
          variant="ghost"
          inputSize="sm"
          className="h-7 flex-1 text-sm"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSave();
            if (e.key === 'Escape') setEditing(false);
          }}
          autoFocus
          disabled={saving}
          placeholder={placeholder}
        />
        <Button
          aria-label="Salvar"
          variant="ghost"
          size="icon"
          className="h-6 w-6 text-primary hover:bg-primary/10"
          onClick={handleSave}
          disabled={saving}
        >
          <Check className="h-3 w-3" />
        </Button>
        <Button
          aria-label="Cancelar edição"
          variant="ghost"
          size="icon"
          className="h-6 w-6 text-destructive hover:bg-destructive/10"
          onClick={() => {
            setDraft(value);
            setEditing(false);
          }}
        >
          <X className="h-3 w-3" />
        </Button>
      </div>
    );
  }

  // Empty state — show as discrete add button
  if (!value) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="group flex w-full items-center gap-2 rounded-lg p-2 text-xs text-muted-foreground/60 transition-all hover:bg-primary/5 hover:text-primary"
      >
        <span className="text-muted-foreground/40 transition-colors group-hover:text-primary">
          {icon}
        </span>
        <Plus className="h-3 w-3" />
        <span>{placeholder || `Adicionar ${label}`}</span>
      </button>
    );
  }

  return (
    <div className="group flex cursor-pointer items-center justify-between gap-2 rounded-lg bg-background/40 p-2.5 text-sm transition-colors hover:bg-muted/30">
      <div className="flex min-w-0 items-center gap-2.5">
        <span className="shrink-0 text-primary">{icon}</span>
        <span className="truncate text-foreground">{value}</span>
      </div>
      <Button
        aria-label={`Editar ${label}`}
        variant="ghost"
        size="icon"
        className="h-6 w-6 shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
        onClick={() => setEditing(true)}
      >
        <Pencil className="h-3 w-3 text-muted-foreground" />
      </Button>
    </div>
  );
}

export function ContactInfoSection({ contact, enrichedData }: ContactInfoSectionProps) {
  const queryClient = useQueryClient();

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copiado!`);
  };

  const updateContact = useCallback(
    async (field: string, value: string) => {
      const { error } = await dbFrom('contacts')
        .update({ [field]: value })
        .eq('id', contact.id);
      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: queryKeys.contactDetails.enriched(contact.id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.contactDetails.aiTags(contact.id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.sla.contact(contact.id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.contactDetails.localId(contact.id) });
    },
    [contact.id, queryClient]
  );

  return (
    <div className="space-y-1.5">
      {/* Phone — always visible, copyable */}
      <button
        type="button"
        aria-label={`Copiar telefone ${contact.phone}`}
        className="group flex w-full cursor-pointer items-center justify-between gap-2 rounded-lg bg-background/40 p-2.5 text-sm transition-colors hover:bg-muted/30"
        onClick={() => copyToClipboard(contact.phone, 'Telefone')}
      >
        <div className="flex items-center gap-2.5">
          <Phone className="h-4 w-4 text-primary" />
          <span className="text-xs text-foreground">{contact.phone}</span>
        </div>
        <Copy className="h-3 w-3 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
      </button>

      {/* Email & Company in grid when both have values */}
      <div className="grid grid-cols-1 gap-1.5">
        <EditableField
          value={contact.email || ''}
          icon={<Mail className="h-4 w-4" />}
          onSave={(v) => updateContact('email', v)}
          placeholder="Adicionar email"
          label="email"
        />

        <div className="grid grid-cols-2 gap-1.5">
          <EditableField
            value={enrichedData?.company || ''}
            icon={<Building className="h-4 w-4" />}
            onSave={(v) => updateContact('company', v)}
            placeholder="Empresa"
            label="empresa"
          />
          <EditableField
            value={enrichedData?.job_title || ''}
            icon={<Briefcase className="h-4 w-4" />}
            onSave={(v) => updateContact('job_title', v)}
            placeholder="Cargo"
            label="cargo"
          />
        </div>
      </div>

      {/* Client since */}
      <div className="flex items-center gap-2.5 rounded-lg bg-muted/10 p-2 text-xs text-muted-foreground">
        <Calendar className="h-3.5 w-3.5 text-primary" />
        <span>Cliente desde {format(contact.createdAt, "MMM 'de' yyyy", { locale: ptBR })}</span>
      </div>
    </div>
  );
}
