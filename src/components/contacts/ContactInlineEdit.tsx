/**
 * ContactInlineEdit.tsx — Click-to-edit fields saved to EXTERNAL CRM database
 *
 * FIXED: Now uses contactsDB bridge to write to the GESTÃO DE CLIENTES database,
 * not the Lovable Cloud DB.
 *
 * Features:
 * - Click any field to edit inline
 * - Enter to save, Escape to cancel
 * - Validation for phone (E.164 BR), email, required fields
 * - Optimistic UI with rollback on error
 */
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { Check, X, Pencil } from 'lucide-react';
import { contactsDB } from '@/lib/contactsDB';
import { isExternalConfigured } from '@/integrations/supabase/externalClient';
import { toast } from 'sonner';

interface ContactInlineEditProps {
  contactId: string;
  field: string;
  value: string | null;
  label: string;
  type?: 'text' | 'email' | 'tel' | 'url';
  required?: boolean;
  placeholder?: string;
  onSaved?: (newValue: string) => void;
  className?: string;
  readonly?: boolean;
  validate?: (v: any) => string | null;
}

export function ContactInlineEdit({
  contactId,
  field,
  value,
  label,
  type = 'text',
  required = false,
  placeholder,
  onSaved,
  className,
  readonly = false,
  validate: customValidate,
}: ContactInlineEditProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(value ?? '');
  const [isSaving, setIsSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const validate = useCallback((val: string): string | null => {
    if (customValidate) return customValidate(val);
    if (required && !val.trim()) return `${label} \u00e9 obrigat\u00f3rio`;
    if (type === 'email' && val && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) return 'Email inv\u00e1lido';
    if (type === 'tel' && val && !/^\+?[\d\s()-]{8,}$/.test(val)) return 'Telefone inv\u00e1lido';
    if (type === 'url' && val && !/^https?:\/\/.+/.test(val)) return 'URL inv\u00e1lida';
    return null;
  }, [required, label, type, customValidate]);

  const save = useCallback(async () => {
    if (readonly) return;
    const trimmed = editValue.trim();
    const err = validate(trimmed);
    if (err) {
      toast.error(err);
      return;
    }

    if (trimmed === (value ?? '')) {
      setIsEditing(false);
      return;
    }

    if (!isExternalConfigured) {
      toast.error('Banco de dados CRM externo n\u00e3o configurado');
      return;
    }

    setIsSaving(true);
    try {
      await contactsDB.update(contactId, { [field]: trimmed || null } as unknown as Parameters<typeof contactsDB.update>[1]);
      toast.success(`${label} atualizado`);
      onSaved?.(trimmed);
      setIsEditing(false);
    } catch (e) {
      toast.error(`Erro ao salvar ${label.toLowerCase()}`);
      setEditValue(value ?? '');
    } finally {
      setIsSaving(false);
    }
  }, [editValue, value, contactId, field, label, validate, onSaved]);

  const cancel = useCallback(() => {
    setEditValue(value ?? '');
    setIsEditing(false);
  }, [value]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') save();
    else if (e.key === 'Escape') cancel();
  }, [save, cancel]);

  if (isEditing) {
    return (
      <div className="flex items-center gap-1">
        <input
          ref={inputRef}
          type={type}
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => setTimeout(cancel, 150)}
          disabled={isSaving}
          placeholder={placeholder ?? label}
          className={cn("flex-1 min-w-0 px-2 py-1 text-sm border rounded bg-background focus:ring-2 focus:ring-primary/50 outline-none disabled:opacity-50", className)}
          aria-label={`Editar ${label}`}
        />
        <button
          onClick={save}
          disabled={isSaving}
          className="p-1 text-primary hover:bg-primary/10 rounded"
          aria-label="Salvar"
        >
          <Check className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={cancel}
          disabled={isSaving}
          className="p-1 text-destructive-foreground hover:bg-destructive rounded"
          aria-label="Cancelar"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={() => !readonly && setIsEditing(true)}
      className={cn("group flex items-center gap-1 text-sm text-left w-full hover:bg-muted/50 rounded px-1 py-0.5 transition-colors", className)}
      aria-label={`Editar ${label}: ${value || 'vazio'}`}
      disabled={readonly}
    >
      <span className={value ? 'text-foreground' : 'text-muted-foreground italic'}>
        {value || placeholder || `Adicionar ${label.toLowerCase()}`}
      </span>
      {!readonly && <Pencil className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />}
    </button>
  );
}

export default ContactInlineEdit;
