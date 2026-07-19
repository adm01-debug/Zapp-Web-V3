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
import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { AlertTriangle, Save, Loader2, User, Building2, Mail, Tag, GitMerge } from 'lucide-react';
import { sanitizeText } from '@/lib/sanitize';
import { ContactPhoneManager, PhoneEntry } from './ContactPhoneManager';
import { ContactConsentManager, ConsentData } from './ContactConsentManager';
import { ContactMergeDialog, ContactForMerge } from './ContactMergeDialog';
import { ConflictResolutionDialog } from './ConflictResolutionDialog';
import { useContactFormV3 } from './useContactFormV3';

// ── Types ──────────────────────────────────────────────────────────────────

/** Contact V3 Form Data interface definition. */
export interface ContactV3FormData {
  id?: string;
  name: string;
  phone: string;
  phone_numbers: PhoneEntry[];
  email: string;
  company: string;
  tags: string[];
  notes: string;
  version?: number;
  consent?: Partial<ConsentData>;
}

interface ContactFormV3Props {
  workspaceId: string;
  initial?: Partial<ContactV3FormData>;
  onSaved: (contact: ContactV3FormData) => void;
  onCancel?: () => void;
  mode?: 'create' | 'edit';
}

// ── Component ──────────────────────────────────────────────────────────────

/** Contact Form V3 constant. */
export const ContactFormV3: React.FC<ContactFormV3Props> = ({
  workspaceId,
  initial,
  onSaved,
  onCancel,
  mode = 'create',
}) => {
  const {
    form,
    tagInput,
    setTagInput,
    dirty,
    conflict,
    conflictOpen,
    setConflictOpen,
    mergeTarget,
    setMergeTarget,
    mergeOpen,
    setMergeOpen,
    loadingMergeTarget,
    hasDuplicates,
    duplicates,
    checking,
    isSaving,
    phoneValidation,
    update,
    addTag,
    removeTag,
    doSave,
    handlePhoneBlur,
    updateConsent,
    handleMergeComplete,
    handleConflictKeepMine,
    handleConflictTakeTheirs,
  } = useContactFormV3({ workspaceId, initial, mode, onSaved, onCancel });

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
                onClick={() => {
                  setMergeTarget(duplicates[0] as unknown as ContactForMerge);
                  setMergeOpen(true);
                }} // ignore-audit — PotentialDuplicate lacks company/tags/channel; merge dialog handles missing fields with fallbacks
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
        {form.phone && !phoneValidation.valid && (
          <p className="text-xs text-muted-foreground">{phoneValidation.error}</p>
        )}
        {form.phone && phoneValidation.valid && (
          <p className="text-xs text-primary">
            ✓ {phoneValidation.formatted} (
            {phoneValidation.type === 'mobile'
              ? 'Celular'
              : phoneValidation.type === 'landline'
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
          onUpdated={updateConsent}
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
            notes: form.notes || null,
            channel: null,
            avatar_url: null,
            created_at: new Date().toISOString(),
          }}
          secondaryContact={mergeTarget}
          onMergeComplete={handleMergeComplete}
        />
      )}

      {/* Conflict Resolution Dialog */}
      {conflict && (
        <ConflictResolutionDialog
          open={conflictOpen}
          conflict={conflict}
          onKeepMine={handleConflictKeepMine}
          onTakeTheirs={handleConflictTakeTheirs}
          onCancel={() => setConflictOpen(false)}
        />
      )}
    </div>
  );
};

/** Default export. */
export default ContactFormV3;
