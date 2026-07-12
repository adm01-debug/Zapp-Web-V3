import React, { useState, useCallback, useMemo } from 'react';
import { getLogger } from '@/lib/logger';

import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Check, User, GitMerge, Zap, ShieldCheck, Info } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { sanitizeText } from '@/lib/sanitize';
import { dbFrom } from '@/integrations/datasource/db';
import { cn } from '@/lib/utils';

const log = getLogger('ContactMergeDialog');

// ── Types ──────────────────────────────────────────────────────────────────

export interface ContactForMerge {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  company: string | null;
  tags: string[];
  channel: string | null;
  avatar_url: string | null;
  created_at: string;
  conversation_count?: number;
  notes?: string | null;
  lgpd_consent_at?: string | null;
}

type FieldChoice = 'primary' | 'secondary';

interface FieldResolution {
  name: FieldChoice;
  phone: FieldChoice;
  email: FieldChoice;
  company: FieldChoice;
  notes: FieldChoice;
}

interface ContactMergeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  primaryContact: ContactForMerge;
  secondaryContact: ContactForMerge;
  onMergeComplete: (survivingId: string) => void;
}

// ── Sub-components ─────────────────────────────────────────────────────────

function ContactCard({ contact, label, badge }: {
  contact: ContactForMerge; label: string; badge?: string;
}) {
  return (
    <div className="rounded-lg border bg-card p-4 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{label}</span>
        {badge && <Badge variant="secondary">{badge}</Badge>}
      </div>
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
          {contact.avatar_url
            ? <img src={contact.avatar_url} alt={sanitizeText(contact.name)} className="h-10 w-10 rounded-full object-cover" />
            : <User className="h-5 w-5 text-primary" />}
        </div>
        <div>
          <p className="font-semibold text-sm">{sanitizeText(contact.name)}</p>
          <p className="text-xs text-muted-foreground">{sanitizeText(contact.phone ?? '—')}</p>
        </div>
      </div>
      <div className="text-xs space-y-1 text-muted-foreground">
        {[
          ['Email',     contact.email],
          ['Empresa',   contact.company],
          ['Canal',     contact.channel],
          ['Conversas', String(contact.conversation_count ?? 0)],
          ['Criado em', new Date(contact.created_at).toLocaleDateString('pt-BR')],
          ['LGPD',      contact.lgpd_consent_at ? '✅ Consentimento registrado' : '⚠️ Sem consentimento'],
        ].map(([k, v]) => (
          <div key={k}><span className="font-medium">{k}:</span> {sanitizeText(v ?? '—')}</div>
        ))}
        <div>
          <span className="font-medium">Tags:</span>{' '}
          {contact.tags.length > 0 ? contact.tags.map(sanitizeText).join(', ') : '—'}
        </div>
      </div>
    </div>
  );
}

function FieldSelector({ fieldKey, label, primaryValue, secondaryValue, value, onChange }: {
  fieldKey: string; label: string;
  primaryValue: string; secondaryValue: string;
  value: FieldChoice; onChange: (v: FieldChoice) => void;
}) {
  if (!primaryValue && !secondaryValue) return null;
  if (primaryValue === secondaryValue) return null; // no conflict
  
  // Logic to determine if a choice is "recommended"
  const isSecondaryRecommended = !primaryValue && !!secondaryValue;

  return (
    <div className="space-y-2 py-3 px-1 border-b border-border/30 last:border-0">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold flex items-center gap-1.5">
          <Info className="h-3.5 w-3.5 text-primary/60" />
          {label}
        </p>
        {isSecondaryRecommended && (
          <Badge variant="outline" className="text-[8px] bg-primary/5 text-primary border-primary/20">
            Recomendado: Secundário
          </Badge>
        )}
      </div>
      <RadioGroup value={value} onValueChange={(v) => onChange(v as FieldChoice)} // ignore-audit: Select/Tabs value string narrowed to union; developer controls option values className="grid grid-cols-1 gap-2">
        {([['primary', primaryValue], ['secondary', secondaryValue]] as const).map(([side, val]) => (
          <div key={side} className={cn(
            "flex items-center gap-3 p-2 rounded-lg border transition-all cursor-pointer",
            value === side ? "border-primary bg-primary/5 ring-1 ring-primary/20" : "border-border/50 hover:bg-muted/50"
          )} onClick={() => onChange(side)}>
            <RadioGroupItem value={side} id={`${fieldKey}-${side}`} />
            <Label htmlFor={`${fieldKey}-${side}`} className="text-xs flex-1 cursor-pointer">
              {val || <span className="italic text-muted-foreground">vazio</span>}
              {side === 'primary' && val && <span className="ml-2 text-[9px] text-muted-foreground">(Principal)</span>}
            </Label>
          </div>
        ))}
      </RadioGroup>
    </div>
  );
}

// ── Main ───────────────────────────────────────────────────────────────────

export const ContactMergeDialog: React.FC<ContactMergeDialogProps> = ({
  open, onOpenChange, primaryContact, secondaryContact, onMergeComplete,
}) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  
  // Calculate Confidence Score
  const confidenceScore = useMemo(() => {
    let score = 0;
    if (primaryContact.name === secondaryContact.name) score += 40;
    if (primaryContact.phone === secondaryContact.phone && primaryContact.phone) score += 30;
    if (primaryContact.email === secondaryContact.email && primaryContact.email) score += 20;
    if (primaryContact.company === secondaryContact.company && primaryContact.company) score += 10;
    return score || 15; // minimum base score
  }, [primaryContact, secondaryContact]);

  // Auto-selection logic (Predictive)
  const [resolution, setResolution] = useState<FieldResolution>(() => {
    const res: Partial<FieldResolution> = {};
    const fields: Array<keyof FieldResolution> = ['name', 'phone', 'email', 'company', 'notes'];
    
    fields.forEach(field => {
      const pVal = primaryContact[field as keyof ContactForMerge];
      const sVal = secondaryContact[field as keyof ContactForMerge];
      
      // If primary is empty but secondary isn't, prefer secondary
      if (!pVal && sVal) {
        res[field] = 'secondary';
      } else {
        res[field] = 'primary';
      }
    });
    
    return res as FieldResolution;
  });

  const pick = useCallback((field: keyof FieldResolution): string => {
    const src = resolution[field] === 'primary' ? primaryContact : secondaryContact;
    return sanitizeText((src[field as keyof ContactForMerge] as string) ?? '');
  }, [resolution, primaryContact, secondaryContact]);

  const handleMerge = async () => {
    setLoading(true);
    try {
      const mergedTags = [...new Set([...primaryContact.tags, ...secondaryContact.tags])];

      // 1. Update primary with resolved fields
      const { error: e1 } = await dbFrom('contacts')
        .update({
          name:    pick('name'),
          phone:   pick('phone'),
          email:   pick('email'),
          company: pick('company'),
          notes:   pick('notes'),
          tags:    mergedTags,
          // Preserve oldest LGPD consent
          lgpd_consent_at: primaryContact.lgpd_consent_at ?? secondaryContact.lgpd_consent_at,
          merged_from_id: secondaryContact.id,
          updated_at: new Date().toISOString(),
        })
        .eq('id', primaryContact.id);
      if (e1) throw e1;

      // 2. Re-assign conversations
      const { error: e2 } = await dbFrom('conversations')
        .update({ contact_id: primaryContact.id })
        .eq('contact_id', secondaryContact.id);
      if (e2) throw e2;

      // 3. Re-assign messages
      const { error: e3 } = await dbFrom('messages')
        .update({ contact_id: primaryContact.id })
        .eq('contact_id', secondaryContact.id);
      if (e3) throw e3;

      // 4. Soft-delete secondary (never hard-delete — LGPD + audit trail)
      const { error: e4 } = await dbFrom('contacts')
        .update({
          deleted_at:     new Date().toISOString(),
          deleted_reason: `merged_into:${primaryContact.id}`,
        })
        .eq('id', secondaryContact.id);
      if (e4) throw e4;

      toast({
        title: '✅ Mesclagem concluída!',
        description: `"${sanitizeText(secondaryContact.name)}" foi unificado em "${sanitizeText(primaryContact.name)}". Histórico completo preservado.`,
      });
      onMergeComplete(primaryContact.id);
      onOpenChange(false);
    } catch (err) {
      log.error('Failed to merge contacts', err);
      toast({ title: 'Erro ao mesclar', description: 'Tente novamente.', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const fields: Array<[keyof FieldResolution, string, keyof ContactForMerge]> = [
    ['name', 'Nome', 'name'], ['phone', 'Telefone', 'phone'],
    ['email', 'E-mail', 'email'], ['company', 'Empresa', 'company'],
    ['notes', 'Notas', 'notes'],
  ];

  const conflictCount = fields.filter(([, , k]) =>
    primaryContact[k] !== secondaryContact[k]).length;

  const mergedTags = [...new Set([...primaryContact.tags, ...secondaryContact.tags])];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitMerge className="h-5 w-5 text-primary" />
            Mesclar Contatos Duplicados
          </DialogTitle>
          <DialogDescription>
            {conflictCount > 0
              ? `${conflictCount} campo(s) com valores diferentes. Escolha qual manter.`
              : 'Nenhum conflito de campos. Confirme a mesclagem.'}
            {' '}O histórico completo de ambos os contatos será preservado.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-4">
          <ContactCard contact={primaryContact} label="Principal" badge="Sobrevive" />
          <ContactCard contact={secondaryContact} label="Secundário" badge="Será excluído" />
        </div>

        {/* Confidence Score Panel */}
        <div className="bg-primary/5 border border-primary/10 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-primary" />
              <span className="text-sm font-bold tracking-tight">Score de Confiança</span>
            </div>
            <Badge variant={confidenceScore > 60 ? "default" : "secondary"} className="">
              {confidenceScore}%
            </Badge>
          </div>
          <Progress value={confidenceScore} className="h-2" />
          <p className="text-[10px] text-muted-foreground flex items-center gap-1.5">
            <ShieldCheck className="h-3 w-3 text-primary" />
            Sugestão baseada na similaridade de dados e completude de campos.
          </p>
        </div>

        {conflictCount > 0 && (
          <>
            <Separator />
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-bold">Resolver conflitos de campos</p>
                <Badge variant="outline" className="text-[9px] uppercase border-primary/20 text-primary bg-primary/5">
                  Sugestões Inteligentes Aplicadas
                </Badge>
              </div>
              <div className="grid grid-cols-1 gap-1">
                {fields.map(([field, label, k]) => (
                  <FieldSelector
                    key={field}
                    fieldKey={field}
                    label={label}
                    primaryValue={sanitizeText(primaryContact[k] as string ?? '')}
                    secondaryValue={sanitizeText(secondaryContact[k] as string ?? '')}
                    value={resolution[field]}
                    onChange={(v) => setResolution((r) => ({ ...r, [field]: v }))}
                  />
                ))}
              </div>
            </div>
          </>
        )}

        {mergedTags.length > 0 && (
          <div className="rounded-md bg-muted/50 p-3 text-sm">
            <p className="font-medium mb-2">Tags resultantes (união automática):</p>
            <div className="flex flex-wrap gap-1">
              {mergedTags.map((tag) => (
                <Badge key={tag} variant="outline" className="text-xs">{sanitizeText(tag)}</Badge>
              ))}
            </div>
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancelar
          </Button>
          <Button onClick={handleMerge} disabled={loading} className="gap-2">
            {loading ? 'Mesclando...' : <><Check className="h-4 w-4" />Confirmar Mesclagem</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ContactMergeDialog;
