/**
 * EditContactDialog.tsx — v3.0
 * Full contact editing with:
 * - Optimistic locking via update_contact_versioned()
 * - ConflictResolutionDialog for concurrent edits
 * - AuditLogPanel for LGPD change history
 * - ContactConsentManager for LGPD consent
 * - ContactPhoneManager for multiple phones
 * - useRetryOperation for network resilience
 */
import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { Save, Loader2, User, Shield, History } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { sanitizeText, sanitizeHtml } from '@/lib/sanitize';
import { validatePhone } from '@/lib/phoneUtils';
import { useRetryOperation } from '@/hooks/useRetryOperation';
import { ContactPhoneManager, PhoneEntry } from '@/components/contacts/ContactPhoneManager';
import { ContactConsentManager } from '@/components/contacts/ContactConsentManager';
import { AuditLogPanel } from '@/components/contacts/AuditLogPanel';
import {
  ConflictResolutionDialog,
  ConflictInfo,
} from '@/components/contacts/ConflictResolutionDialog';
import { dbFrom } from '@/integrations/datasource/db';

// ── Types ──────────────────────────────────────────────────────────────────

interface ContactData {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  company: string | null;
  notes: string | null;
  tags: string[];
  phone_numbers: PhoneEntry[];
  version: number;
  lgpd_consent_at: string | null;
  lgpd_consent_channel: string | null;
  lgpd_opt_out_at: string | null;
  lgpd_marketing_consent: boolean;
  lgpd_data_sharing: boolean;
  lgpd_profiling: boolean;
}

interface EditContactDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  contact: ContactData;
  onSaved?: (updated: ContactData) => void;
}

// ── Component ──────────────────────────────────────────────────────────────

export const EditContactDialog: React.FC<EditContactDialogProps> = ({
  open,
  onOpenChange,
  contact,
  onSaved,
}) => {
  const { toast } = useToast();
  const { withRetry, loading: retryLoading } = useRetryOperation(3, 500);

  // Form state
  const [name, setName] = useState(contact.name);
  const [email, setEmail] = useState(contact.email ?? '');
  const [company, setCompany] = useState(contact.company ?? '');
  const [notes, setNotes] = useState(contact.notes ?? '');
  const [phoneNumbers, setPhoneNumbers] = useState<PhoneEntry[]>(
    contact.phone_numbers?.length > 0
      ? contact.phone_numbers
      : contact.phone
        ? [{ number: contact.phone, type: 'mobile', is_whatsapp: true, is_primary: true }]
        : []
  );

  // Conflict resolution state
  const [conflictOpen, setConflictOpen] = useState(false);
  const [conflict, setConflict] = useState<ConflictInfo | null>(null);
  const [_pendingData, setPendingData] = useState<Record<string, unknown> | null>(null);

  // Reset form when contact changes (use contact.id to avoid infinite re-render loop — #310)
  useEffect(() => {
    setName(contact.name);
    setEmail(contact.email ?? '');
    setCompany(contact.company ?? '');
    setNotes(contact.notes ?? '');
    setPhoneNumbers(
      contact.phone_numbers?.length > 0
        ? contact.phone_numbers
        : contact.phone
          ? [
              {
                number: contact.phone,
                type: 'mobile' as const,
                is_whatsapp: true,
                is_primary: true,
              },
            ]
          : []
    );
  }, [contact.id]);

  const buildUpdateData = () => ({
    name: sanitizeText(name).trim(),
    email: email.trim() || null,
    company: sanitizeText(company).trim() || null,
    notes: sanitizeHtml(notes).trim() || null,
    phone_numbers: phoneNumbers,
    phone: phoneNumbers.find((p) => p.is_primary)?.number ?? null,
  });

  const saveWithVersionCheck = async (force = false) => {
    const data = buildUpdateData();

    if (!data.name) {
      toast({ title: 'Nome obrigatório', variant: 'destructive' });
      return;
    }

    // Validate primary phone if present
    const primaryPhone = phoneNumbers.find((p) => p.is_primary);
    if (primaryPhone) {
      const validation = validatePhone(primaryPhone.number);
      if (!validation.valid) {
        toast({ title: `Telefone inválido: ${validation.error}`, variant: 'destructive' });
        return;
      }
    }

    try {
      await withRetry(async () => {
        if (force) {
          // Force update ignoring version (admin override)
          const { error: updateError } = await dbFrom('contacts')
            .update({ ...data, updated_at: new Date().toISOString() })
            .eq('id', contact.id);
          if (updateError) throw updateError;
        } else {
          // Use versioned update to detect concurrent edits
          const { data: result, error: rpcError } = await (supabase as any).rpc(
            'update_contact_versioned',
            {
              p_contact_id: contact.id,
              p_expected_version: contact.version,
              p_updates: data,
            }
          );

          if (rpcError) throw rpcError;

          const r = result as any;
          if (r?.error === 'CONFLICT') {
            setPendingData(data);
            setConflict(r as ConflictInfo);
            setConflictOpen(true);
            return;
          }
        }

        toast({ title: '✅ Contato atualizado!', duration: 3000 });
        onSaved?.({ ...contact, ...data, version: (contact.version ?? 0) + 1 });
        onOpenChange(false);
      }, 'Salvar contato');
    } catch (err) {
      toast({
        title: 'Erro ao salvar',
        description: String(err),
        variant: 'destructive',
      });
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <User className="h-5 w-5 text-primary" />
              Editar Contato
            </DialogTitle>
            <DialogDescription>{sanitizeText(contact.name)}</DialogDescription>
          </DialogHeader>

          <Tabs defaultValue="info">
            <TabsList className="mb-4">
              <TabsTrigger value="info" className="gap-1">
                <User className="h-3.5 w-3.5" />
                Informações
              </TabsTrigger>
              <TabsTrigger value="consent" className="gap-1">
                <Shield className="h-3.5 w-3.5" />
                LGPD
              </TabsTrigger>
              <TabsTrigger value="history" className="gap-1">
                <History className="h-3.5 w-3.5" />
                Histórico
              </TabsTrigger>
            </TabsList>

            {/* ── Info Tab ───────────────────────────────────────────────── */}
            <TabsContent value="info" className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <Label htmlFor="name">Nome *</Label>
                  <Input
                    id="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Nome completo"
                    maxLength={500}
                  />
                </div>
                <div>
                  <Label htmlFor="email">E-mail</Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="email@exemplo.com"
                  />
                </div>
                <div>
                  <Label htmlFor="company">Empresa</Label>
                  <Input
                    id="company"
                    value={company}
                    onChange={(e) => setCompany(e.target.value)}
                    placeholder="Nome da empresa"
                  />
                </div>
              </div>

              <Separator />

              {/* Phone manager */}
              <ContactPhoneManager phones={phoneNumbers} onChange={setPhoneNumbers} />

              <Separator />

              {/* Notes */}
              <div>
                <Label htmlFor="notes">Notas internas</Label>
                <textarea
                  id="notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Observações sobre o contato..."
                  rows={3}
                  className="min-h-[80px] w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>
            </TabsContent>

            {/* ── LGPD Tab ───────────────────────────────────────────────── */}
            <TabsContent value="consent">
              <ContactConsentManager
                contactId={contact.id}
                contactName={sanitizeText(contact.name)}
                consentData={{
                  lgpd_consent_at: contact.lgpd_consent_at,
                  lgpd_consent_channel: contact.lgpd_consent_channel,
                  lgpd_opt_out_at: contact.lgpd_opt_out_at,
                  lgpd_marketing_consent: contact.lgpd_marketing_consent,
                  lgpd_data_sharing: contact.lgpd_data_sharing,
                  lgpd_profiling: contact.lgpd_profiling,
                }}
              />
            </TabsContent>

            {/* ── History Tab ────────────────────────────────────────────── */}
            <TabsContent value="history">
              <AuditLogPanel contactId={contact.id} maxEntries={30} />
            </TabsContent>
          </Tabs>

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={retryLoading}>
              Cancelar
            </Button>
            <Button
              onClick={() => saveWithVersionCheck(false)}
              disabled={retryLoading}
              className="gap-2"
            >
              {retryLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              {retryLoading ? 'Salvando...' : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Conflict resolution */}
      {conflict && (
        <ConflictResolutionDialog
          open={conflictOpen}
          conflict={conflict}
          onKeepMine={() => {
            setConflictOpen(false);
            saveWithVersionCheck(true);
          }}
          onTakeTheirs={() => {
            setConflictOpen(false);
            onOpenChange(false);
            toast({ title: 'ℹ️ Recarregando versão mais recente...', duration: 3000 });
          }}
          onCancel={() => setConflictOpen(false)}
        />
      )}
    </>
  );
};

export default EditContactDialog;
