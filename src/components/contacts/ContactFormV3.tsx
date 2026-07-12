/**
 * ContactFormV3.tsx
 * Complete contact form integrating ALL v3.0 improvements:
 * - Real-time duplicate detection with merge prompt
 * - Multiple phone numbers (ContactPhoneManager)
 * - LGPD consent management
 * - Phone normalization + validation
 * - XSS-safe field rendering
 * - Optimistic locking (versioned saves)
 * - Retry on network failure
 * - Conflict resolution on concurrent edit
 */
import React, { useState, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { AlertTriangle, Save, Loader2, User, Building2, Mail, Tag, GitMerge } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { sanitizeText } from '@/lib/sanitize';
import { validatePhoneDetailed } from '@/lib/phoneUtils';
import { useContactDuplicateDetector } from './useContactDuplicateDetector';
import { useRetryOperation } from '@/hooks/useRetryOperation';
import { ContactPhoneManager, PhoneEntry } from './ContactPhoneManager';
import { ContactConsentManager, ConsentData } from './ContactConsentManager';
import { ContactMergeDialog, ContactForMerge } from './ContactMergeDialog';
import { ConflictResolutionDialog, ConflictInfo } from './ConflictResolutionDialog';
import { dbFrom, dbRpc } from '@/integrations/datasource/db';
import { RPC } from '@/integrations/datasource/rpcCatalog';

// ── Types ──────────────────────────────────────────────────────────────────

export interface ContactV3FormData {
  id?: string;
  name: string;
  phone: string; // primary phone (legacy compat)
  phone_numbers: PhoneEntry[]; // all phones
  email: string;
  company: string;
  tags: string[];
  notes: string;
  version?: number; // optimistic locking
  consent?: Partial<ConsentData>;
}

interface ContactFormV3Props {
  workspaceId: string;
  initial?: Partial<ContactV3FormData>;
  onSaved: (contact: ContactV3FormData) => void;
  onCancel?: () => void;
  mode?: 'create' | 'edit';
}

// ── Helpers ────────────────────────────────────────────────────────────────

const EMPTY_FORM: ContactV3FormData = {
  name: '',
  phone: '',
  phone_numbers: [],
  email: '',
  company: '',
  tags: [],
  notes: '',
};

// ── Component ──────────────────────────────────────────────────────────────

export const ContactFormV3: React.FC<ContactFormV3Props> = ({
  workspaceId,
  initial,
  onSaved,
  onCancel,
  mode = 'create',
}) => {
  const { toast } = useToast();
  const [form, setForm] = useState<ContactV3FormData>({ ...EMPTY_FORM, ...initial });
  const [tagInput, setTagInput] = useState('');
  const [dirty, setDirty] = useState(false);

  // Conflict resolution state
  const [conflict, setConflict] = useState<ConflictInfo | null>(null);
  const [conflictOpen, setConflictOpen] = useState(false);

  // Merge dialog state
  const [mergeTarget, setMergeTarget] = useState<ContactForMerge | null>(null);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [loadingMergeTarget, setLoadingMergeTarget] = useState(false);

  // `duplicates` (useContactDuplicateDetector) só traz um projeto raso
  // (id/name/phone/email/avatar_url) para a busca em tempo real — não tem
  // `tags`/`created_at`/`company`/etc. que ContactForMerge exige. Abrir o
  // dialog de mesclagem direto com esse objeto (via cast) faz
  // `contact.tags.length` estourar em runtime. Buscamos o registro completo
  // antes de abrir, para a decisão de mesclagem não usar dados forjados.
  const openMergeDialog = useCallback(
    async (duplicateId: string) => {
      setLoadingMergeTarget(true);
      try {
        const { data, error } = await dbFrom('contacts')
          .select(
            'id, name, phone, email, company, tags, channel_type, avatar_url, created_at, notes'
          )
          .eq('id', duplicateId)
          .single();
        if (error || !data) {
          toast({
            title: 'Erro ao carregar contato',
            description: 'Não foi possível carregar os dados do contato duplicado.',
            variant: 'destructive',
          });
          return;
        }
        setMergeTarget({
          id: data.id,
          name: data.name,
          phone: data.phone,
          email: data.email,
          company: data.company,
          tags: data.tags ?? [],
          channel: data.channel_type,
          avatar_url: data.avatar_url,
          created_at: data.created_at,
          notes: data.notes,
        });
        setMergeOpen(true);
      } finally {
        setLoadingMergeTarget(false);
      }
    },
    [toast]
  );

  // Hooks
  const { withRetry, loading: retrying } = useRetryOperation(3, 500);
  const { hasDuplicates, duplicates, checking, checkDuplicates } = useContactDuplicateDetector({
    workspaceId,
    excludeId: form.id,
    debounceMs: 600,
  });

  // Check duplicates when phone or email changes
  useEffect(() => {
    if (form.phone || form.email) {
      checkDuplicates(form.phone, form.email, form.name);
    }
  }, [form.phone, form.email, form.name, checkDuplicates]);

  const update = useCallback(
    <K extends keyof ContactV3FormData>(key: K, value: ContactV3FormData[K]) => {
      setForm((prev) => ({ ...prev, [key]: value }));
      setDirty(true);
    },
    []
  );

  const addTag = useCallback(() => {
    const tag = tagInput.trim();
    if (tag && !form.tags.includes(tag)) {
      update('tags', [...form.tags, tag]);
      setTagInput('');
    }
  }, [tagInput, form.tags, update]);

  const removeTag = useCallback(
    (tag: string) => {
      update(
        'tags',
        form.tags.filter((t) => t !== tag)
      );
    },
    [form.tags, update]
  );

  // ── Save logic ─────────────────────────────────────────────────────────

  const doSave = useCallback(
    async (forceOverwrite = false) => {
      // Validate
      if (!form.name.trim() && !form.phone.trim() && !form.email.trim()) {
        toast({ title: 'Preencha ao menos nome, telefone ou e-mail.', variant: 'destructive' });
        return;
      }

      // Phone validation
      if (form.phone) {
        const phoneResult = validatePhoneDetailed(form.phone);
        if (!phoneResult.valid) {
          toast({ title: `Telefone inválido: ${phoneResult.error}`, variant: 'destructive' });
          return;
        }
      }

      await withRetry(async () => {
        const payload = {
          name: sanitizeText(form.name),
          phone: form.phone || null,
          phone_numbers: form.phone_numbers,
          email: form.email?.toLowerCase().trim() || null,
          company: sanitizeText(form.company) || null,
          tags: form.tags,
          notes: form.notes || null,
          workspace_id: workspaceId,
          updated_at: new Date().toISOString(),
        };

        if (mode === 'edit' && form.id && !forceOverwrite) {
          // Versioned update (optimistic locking)
          const { data, error } = await dbRpc(RPC.updateContactVersioned, {
            p_contact_id: form.id,
            p_expected_version: form.version ?? 1,
            p_updates: payload,
          });

          if (error) throw error;

          const result = (data ?? {}) as Record<string, unknown>;
          if (result?.error === 'CONFLICT') {
            setConflict(result as unknown as ConflictInfo);
            setConflictOpen(true);
            return;
          }

          // Update local version
          setForm((prev) => ({
            ...prev,
            version: (result?.version as number | undefined) ?? prev.version,
          }));
        } else if (mode === 'edit' && form.id && forceOverwrite) {
          // Force overwrite after conflict resolution
          const { error } = await dbFrom('contacts').update(payload).eq('id', form.id);
          if (error) throw error;
        } else {
          // Insert new contact
          const { data, error } = await dbFrom('contacts')
            .insert({ ...payload, created_at: new Date().toISOString() })
            .select()
            .single();

          if (error) throw error;
          setForm((prev) => ({ ...prev, id: data.id, version: 1 }));
        }

        toast({
          title: mode === 'create' ? '✅ Contato criado!' : '✅ Contato salvo!',
          duration: 3_000,
        });
        setDirty(false);
        onSaved(form);
      }, 'Salvar contato');
    },
    [form, mode, workspaceId, withRetry, toast, onSaved]
  );

  // ── Phone normalization on blur ───────────────────────────────────────

  const handlePhoneBlur = () => {
    if (!form.phone) return;
    const result = validatePhoneDetailed(form.phone);
    if (result.valid && result.normalized) {
      update('phone', result.normalized);
    }
  };

  const isSaving = retrying;

  return (
    <div className="space-y-6">
      {/* Duplicate warning */}
      {hasDuplicates && !checking && (
        <Alert className="border-warning bg-warning">
          <AlertTriangle className="h-4 w-4 text-warning-foreground" />
          <AlertDescription className="text-sm text-warning-foreground">
            <strong>{duplicates.length} contato(s) similar(es) encontrado(s).</strong>{' '}
            {duplicates
              .slice(0, 2)
              .map((d) => sanitizeText(d.name))
              .join(', ')}
            {duplicates[0] && (
              <Button
                variant="link"
                size="sm"
                disabled={loadingMergeTarget}
                onClick={() => void openMergeDialog(duplicates[0].id)}
                className="ml-2 h-auto p-0 text-warning-foreground underline"
              >
                <GitMerge className="mr-1 h-3.5 w-3.5" />
                {loadingMergeTarget ? 'Carregando…' : 'Mesclar'}
              </Button>
            )}
          </AlertDescription>
        </Alert>
      )}

      {/* Name */}
      <div className="space-y-1.5">
        <Label htmlFor="name" className="flex items-center gap-1">
          <User className="h-3.5 w-3.5 text-muted-foreground" />
          Nome
        </Label>
        <Input
          id="name"
          value={form.name}
          onChange={(e) => update('name', e.target.value)}
          placeholder="Nome completo do contato"
          maxLength={500}
          autoComplete="name"
        />
      </div>

      {/* Phone (primary) */}
      <div className="space-y-1.5">
        <Label htmlFor="phone">Telefone principal</Label>
        <div className="relative">
          <Input
            id="phone"
            type="tel"
            value={form.phone}
            onChange={(e) => update('phone', e.target.value)}
            onBlur={handlePhoneBlur}
            placeholder="(11) 99999-9999"
            className={` ${hasDuplicates && duplicates.some((d) => d.match_field === 'phone') ? 'border-warning' : ''}`}
            autoComplete="tel"
          />
          {checking && (
            <div className="absolute right-2.5 top-2.5">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          )}
        </div>
        {form.phone && !validatePhoneDetailed(form.phone).valid && (
          <p className="text-xs text-muted-foreground">{validatePhoneDetailed(form.phone).error}</p>
        )}
        {form.phone && validatePhoneDetailed(form.phone).valid && (
          <p className="text-xs text-primary">
            ✓ {validatePhoneDetailed(form.phone).formatted} (
            {validatePhoneDetailed(form.phone).type === 'mobile'
              ? 'Celular'
              : validatePhoneDetailed(form.phone).type === 'landline'
                ? 'Fixo'
                : 'Internacional'}
            )
          </p>
        )}
      </div>

      {/* Additional phone numbers */}
      <ContactPhoneManager
        phones={form.phone_numbers}
        onChange={(phones) => update('phone_numbers', phones)}
      />

      {/* Email */}
      <div className="space-y-1.5">
        <Label htmlFor="email" className="flex items-center gap-1">
          <Mail className="h-3.5 w-3.5 text-muted-foreground" />
          E-mail
        </Label>
        <Input
          id="email"
          type="email"
          value={form.email}
          onChange={(e) => update('email', e.target.value)}
          placeholder="email@exemplo.com.br"
          className={
            hasDuplicates && duplicates.some((d) => d.match_field === 'email')
              ? 'border-warning'
              : ''
          }
          autoComplete="email"
        />
      </div>

      {/* Company */}
      <div className="space-y-1.5">
        <Label htmlFor="company" className="flex items-center gap-1">
          <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
          Empresa
        </Label>
        <Input
          id="company"
          value={form.company}
          onChange={(e) => update('company', e.target.value)}
          placeholder="Nome da empresa"
          maxLength={300}
          autoComplete="organization"
        />
      </div>

      {/* Tags */}
      <div className="space-y-1.5">
        <Label className="flex items-center gap-1">
          <Tag className="h-3.5 w-3.5 text-muted-foreground" />
          Tags
        </Label>
        <div className="flex gap-2">
          <Input
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addTag();
              }
            }}
            placeholder="Digite e pressione Enter"
            className="flex-1"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addTag}
            disabled={!tagInput.trim()}
          >
            Adicionar
          </Button>
        </div>
        {form.tags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {form.tags.map((tag) => (
              <Badge key={tag} variant="secondary" className="gap-1">
                {sanitizeText(tag)}
                <button
                  type="button"
                  onClick={() => removeTag(tag)}
                  className="hover:text-destructive"
                >
                  ×
                </button>
              </Badge>
            ))}
          </div>
        )}
      </div>

      {/* Notes */}
      <div className="space-y-1.5">
        <Label htmlFor="notes">Notas internas</Label>
        <Textarea
          id="notes"
          value={form.notes}
          onChange={(e) => update('notes', e.target.value)}
          placeholder="Observações sobre o contato..."
          rows={3}
          maxLength={5000}
        />
        <p className="text-right text-xs text-muted-foreground">{form.notes.length}/5000</p>
      </div>

      <Separator />

      {/* LGPD Consent (edit mode only) */}
      {mode === 'edit' && form.id && (
        <ContactConsentManager
          contactId={form.id}
          contactName={form.name}
          consentData={{
            lgpd_consent_at: form.consent?.lgpd_consent_at ?? null,
            lgpd_consent_channel: form.consent?.lgpd_consent_channel ?? null,
            lgpd_opt_out_at: form.consent?.lgpd_opt_out_at ?? null,
            lgpd_marketing_consent: form.consent?.lgpd_marketing_consent ?? false,
            lgpd_data_sharing: form.consent?.lgpd_data_sharing ?? false,
            lgpd_profiling: form.consent?.lgpd_profiling ?? false,
          }}
          onUpdated={(updated) =>
            setForm((prev) => ({ ...prev, consent: { ...prev.consent, ...updated } }))
          }
        />
      )}

      {/* Action buttons */}
      <div className="flex justify-end gap-2 pt-2">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel} disabled={isSaving}>
            Cancelar
          </Button>
        )}
        <Button
          type="button"
          onClick={() => doSave(false)}
          disabled={isSaving || !dirty}
          className="min-w-[120px] gap-2"
        >
          {isSaving ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Salvando...
            </>
          ) : (
            <>
              <Save className="h-4 w-4" />
              {mode === 'create' ? 'Criar Contato' : 'Salvar'}
            </>
          )}
        </Button>
      </div>

      {/* Merge Dialog */}
      {mergeTarget && form.id && (
        <ContactMergeDialog
          open={mergeOpen}
          onOpenChange={setMergeOpen}
          primaryContact={{
            id: form.id,
            name: form.name,
            phone: form.phone,
            email: form.email,
            company: form.company,
            tags: form.tags,
            channel: null,
            avatar_url: null,
            created_at: new Date().toISOString(),
          }}
          secondaryContact={mergeTarget}
          onMergeComplete={() => {
            setMergeOpen(false);
            onSaved(form);
          }}
        />
      )}

      {/* Conflict Resolution Dialog */}
      {conflict && (
        <ConflictResolutionDialog
          open={conflictOpen}
          conflict={conflict}
          onKeepMine={() => {
            setConflictOpen(false);
            doSave(true);
          }}
          onTakeTheirs={() => {
            setConflictOpen(false);
            onCancel?.();
          }}
          onCancel={() => setConflictOpen(false)}
        />
      )}
    </div>
  );
};

export default ContactFormV3;
