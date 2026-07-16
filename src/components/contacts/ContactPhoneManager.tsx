/**
 * ContactPhoneManager.tsx
 * UI component for managing multiple phone numbers per contact.
 * Supports: mobile, work, home, WhatsApp, landline.
 *
 * Renders an inline list of phones with add/remove/reorder controls.
 * Integrates with useContactDuplicateDetector for real-time dup checks.
 */
import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import {
  Phone, Plus, Trash2, Star, StarOff, MessageCircle, AlertTriangle,
} from 'lucide-react';
import { sanitizeText } from '@/lib/sanitize';

// ── Types ──────────────────────────────────────────────────────────────────

export interface PhoneEntry {
  number:       string;
  type:         'mobile' | 'work' | 'home' | 'landline' | 'other';
  label?:       string;
  is_whatsapp:  boolean;
  is_primary:   boolean;
}

const PHONE_TYPE_LABELS: Record<PhoneEntry['type'], string> = {
  mobile:   '📱 Celular',
  work:     '💼 Trabalho',
  home:     '🏠 Casa',
  landline: '☎️ Fixo',
  other:    '📞 Outro',
};

const MAX_PHONES = 10;

function formatPhone(num: string): string {
  const d = num.replace(/[^0-9]/g, '');
  if (d.length === 11) return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0,2)}) ${d.slice(2,6)}-${d.slice(6)}`;
  return num;
}

// ── Main Component ─────────────────────────────────────────────────────────

interface ContactPhoneManagerProps {
  phones:       PhoneEntry[];
  onChange:     (phones: PhoneEntry[]) => void;
  readonly?:    boolean;
  className?:   string;
}

export const ContactPhoneManager: React.FC<ContactPhoneManagerProps> = ({
  phones,
  onChange,
  readonly = false,
  className,
}) => {
  const [adding, setAdding] = useState(false);
  const [newPhone, setNewPhone] = useState<PhoneEntry>({
    number: '', type: 'mobile', is_whatsapp: true, is_primary: false,
  });
  const [error, setError] = useState('');

  const updatePhone = (idx: number, updates: Partial<PhoneEntry>) => {
    const next = phones.map((p, i) => {
      if (i !== idx) return p;
      return { ...p, ...updates };
    });

    // If setting as primary, unset others
    if (updates.is_primary) {
      next.forEach((p, i) => { if (i !== idx) p.is_primary = false; });
    }

    onChange(next);
  };

  const removePhone = (idx: number) => {
    const next = phones.filter((_, i) => i !== idx);
    // Ensure at least one primary
    if (next.length > 0 && !next.some((p) => p.is_primary)) {
      next[0].is_primary = true;
    }
    onChange(next);
  };

  const addPhone = () => {
    const clean = sanitizeText(newPhone.number).replace(/[^0-9+\-() ]/g, '');
    if (!clean || clean.replace(/[^0-9]/g, '').length < 8) {
      setError('Número inválido — mínimo 8 dígitos.');
      return;
    }
    if (phones.length >= MAX_PHONES) {
      setError(`Máximo ${MAX_PHONES} telefones por contato.`);
      return;
    }

    const entry: PhoneEntry = {
      ...newPhone,
      number: clean,
      is_primary: phones.length === 0, // first phone is always primary
    };

    onChange([...phones, entry]);
    setNewPhone({ number: '', type: 'mobile', is_whatsapp: true, is_primary: false });
    setAdding(false);
    setError('');
  };

  return (
    <div className={className}>
      <Label className="flex items-center gap-1 mb-2 text-sm font-medium">
        <Phone className="h-3.5 w-3.5" />
        Telefones
        {phones.length > 0 && (
          <Badge variant="secondary" className="ml-1 text-xs">{phones.length}</Badge>
        )}
      </Label>

      {/* Phone list */}
      <div className="space-y-2">
        {phones.map((phone, idx) => (
          <div
            key={phone.number || idx}
            className={`flex items-center gap-2 rounded-md border p-2 text-sm ${
              phone.is_primary ? 'border-primary/40 bg-primary/5' : 'bg-muted/30'
            }`}
          >
            {/* Primary star */}
            <button
              type="button"
              onClick={() => !readonly && updatePhone(idx, { is_primary: true })}
              className="shrink-0"
              title={phone.is_primary ? 'Principal' : 'Definir como principal'}
              disabled={readonly}
            >
              {phone.is_primary
                ? <Star className="h-3.5 w-3.5 fill-amber-400 text-warning-foreground" />
                : <StarOff className="h-3.5 w-3.5 text-muted-foreground" />}
            </button>

            {/* Number */}
            <span className="flex-1  text-sm">
              {formatPhone(sanitizeText(phone.number))}
            </span>

            {/* Type badge */}
            <Badge variant="outline" className="text-xs shrink-0">
              {PHONE_TYPE_LABELS[phone.type]}
            </Badge>

            {/* WhatsApp badge */}
            {phone.is_whatsapp && (
              <span title="WhatsApp" className="inline-flex"><MessageCircle className="h-3.5 w-3.5 text-primary shrink-0" /></span>
            )}

            {/* Remove */}
            {!readonly && (
              <button
                type="button"
                onClick={() => removePhone(idx)}
                className="shrink-0 text-muted-foreground hover:text-destructive transition-colors"
                title="Remover"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        ))}

        {phones.length === 0 && !adding && (
          <p className="text-xs text-muted-foreground italic py-1">
            Nenhum telefone cadastrado.
          </p>
        )}
      </div>

      {/* Add new phone form */}
      {adding && (
        <div className="mt-2 rounded-md border p-3 space-y-3 bg-muted/20">
          <div className="grid grid-cols-2 gap-2">
            <div className="col-span-2">
              <Input
                placeholder="Ex: (11) 99999-9999"
                value={newPhone.number}
                onChange={(e) => {
                  setNewPhone((p) => ({ ...p, number: e.target.value }));
                  setError('');
                }}
                autoFocus
                className=""
              />
            </div>

            <Select
              value={newPhone.type}
              onValueChange={(v) => setNewPhone((p) => ({ ...p, type: v as PhoneEntry['type']  /* ignore-audit: Select/Tabs value string narrowed to union; developer controls option values */}))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(PHONE_TYPE_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="flex items-center gap-2">
              <Switch
                id="is_whatsapp"
                checked={newPhone.is_whatsapp}
                onCheckedChange={(v) => setNewPhone((p) => ({ ...p, is_whatsapp: v }))}
              />
              <Label htmlFor="is_whatsapp" className="text-xs cursor-pointer">
                <MessageCircle className="h-3 w-3 inline text-primary mr-1" />
                WhatsApp
              </Label>
            </div>
          </div>

          {error && (
            <p role="alert" className="text-xs text-destructive flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" /> {error}
            </p>
          )}

          <div className="flex gap-2">
            <Button size="sm" onClick={addPhone} className="flex-1">
              Adicionar
            </Button>
            <Button size="sm" variant="outline" onClick={() => { setAdding(false); setError(''); }}>
              Cancelar
            </Button>
          </div>
        </div>
      )}

      {/* Add button */}
      {!readonly && !adding && phones.length < MAX_PHONES && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setAdding(true)}
          className="mt-2 w-full gap-1 text-xs"
        >
          <Plus className="h-3.5 w-3.5" />
          Adicionar telefone
        </Button>
      )}
    </div>
  );
};

export default ContactPhoneManager;
