import React, { useState } from 'react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Shield, AlertTriangle, CheckCircle2, XCircle, Info } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { sanitizeText } from '@/lib/sanitize';
import { dbFrom } from '@/integrations/datasource/db';
import { getLogger } from '@/lib/logger';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

const log = getLogger('ContactConsentManager');

// ── Types ──────────────────────────────────────────────────────────────────

/** Consent Data component for the contacts section. */
export interface ConsentData {
  lgpd_consent_at:        string | null;
  lgpd_consent_channel:   string | null; // 'whatsapp' | 'email' | 'form' | 'phone' | 'manual'
  lgpd_opt_out_at:        string | null;
  lgpd_marketing_consent: boolean;
  lgpd_data_sharing:      boolean;
  lgpd_profiling:         boolean;
}

interface ContactConsentManagerProps {
  contactId:     string;
  contactName:   string;
  consentData:   ConsentData;
  readonly?:     boolean;
  onUpdated?:    (updated: Partial<ConsentData>) => void;
}

const CHANNEL_LABELS: Record<string, string> = {
  whatsapp: 'WhatsApp',
  email:    'E-mail',
  form:     'Formulário Web',
  phone:    'Telefone',
  manual:   'Registro Manual',
};

// ── Component ──────────────────────────────────────────────────────────────

/** Contact Consent Manager component for the contacts section. */
export const ContactConsentManager: React.FC<ContactConsentManagerProps> = ({
  contactId,
  contactName,
  consentData,
  readonly = false,
  onUpdated,
}) => {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [local, setLocal] = useState<ConsentData>(consentData);

  const hasConsent = !!local.lgpd_consent_at && !local.lgpd_opt_out_at;
  const hasOptedOut = !!local.lgpd_opt_out_at;

  const saveConsent = async (updates: Partial<ConsentData>) => {
    setSaving(true);
    try {
      const { error } = await dbFrom('contacts')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', contactId);

      if (error) throw error;

      const next = { ...local, ...updates };
      setLocal(next);
      onUpdated?.(updates);

      toast({
        title: '✅ Consentimento atualizado',
        description: `Preferências de "${sanitizeText(contactName)}" salvas com sucesso.`,
        duration: 3_000,
      });
    } catch (err) {
      log.error('Failed to update consent', err);
      toast({
        title: '❌ Erro ao salvar consentimento',
        description: 'Tente novamente.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const grantConsent = () => {
    const updates: Partial<ConsentData> = {
      lgpd_consent_at:      new Date().toISOString(),
      lgpd_consent_channel: 'manual',
      lgpd_opt_out_at:      null,
    };
    saveConsent(updates);
  };

  const revokeConsent = () => {
    const updates: Partial<ConsentData> = {
      lgpd_opt_out_at:        new Date().toISOString(),
      lgpd_marketing_consent: false,
      lgpd_data_sharing:      false,
      lgpd_profiling:         false,
    };
    saveConsent(updates);
  };

  const togglePref = (field: 'lgpd_marketing_consent' | 'lgpd_data_sharing' | 'lgpd_profiling') => {
    if (!hasConsent || readonly) return;
    saveConsent({ [field]: !local[field] });
  };

  return (
    <div className="space-y-4 rounded-lg border p-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield className="h-4 w-4 text-primary" />
          <span className="font-semibold text-sm">LGPD / Consentimento</span>
        </div>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Info className="h-4 w-4 text-muted-foreground cursor-help" />
            </TooltipTrigger>
            <TooltipContent className="max-w-[280px] text-xs">
              Conforme a Lei Geral de Proteção de Dados (LGPD — Lei 13.709/2018), o contato
              deve consentir explicitamente com o uso de seus dados pessoais.
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      {/* Consent Status Badge */}
      <div className="flex items-center gap-2">
        {hasConsent ? (
          <Badge className="gap-1 bg-primary text-primary-foreground border-primary">
            <CheckCircle2 className="h-3 w-3" />
            Consentimento registrado
          </Badge>
        ) : hasOptedOut ? (
          <Badge variant="destructive" className="gap-1">
            <XCircle className="h-3 w-3" />
            Opt-out registrado
          </Badge>
        ) : (
          <Badge variant="outline" className="gap-1 text-warning-foreground border-warning bg-warning">
            <AlertTriangle className="h-3 w-3" />
            Sem consentimento
          </Badge>
        )}
      </div>

      {/* Consent details */}
      {local.lgpd_consent_at && (
        <div className="text-xs text-muted-foreground space-y-0.5">
          <p>
            <span className="font-medium">Concedido em:</span>{' '}
            {new Date(local.lgpd_consent_at).toLocaleString('pt-BR')}
          </p>
          {local.lgpd_consent_channel && (
            <p>
              <span className="font-medium">Canal:</span>{' '}
              {CHANNEL_LABELS[sanitizeText(local.lgpd_consent_channel)] ?? sanitizeText(local.lgpd_consent_channel)}
            </p>
          )}
          {local.lgpd_opt_out_at && (
            <p className="text-destructive-foreground">
              <span className="font-medium">Revogado em:</span>{' '}
              {new Date(local.lgpd_opt_out_at).toLocaleString('pt-BR')}
            </p>
          )}
        </div>
      )}

      <Separator />

      {/* Granular consent toggles */}
      <div className="space-y-3">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Finalidades específicas
        </p>

        {(
          [
            ['lgpd_marketing_consent', 'Marketing e comunicações comerciais'],
            ['lgpd_data_sharing',      'Compartilhamento com parceiros'],
            ['lgpd_profiling',         'Perfilamento e personalização'],
          ] as const
        ).map(([field, label]) => (
          <div key={field} className="flex items-center justify-between">
            <Label htmlFor={field} className="text-sm cursor-pointer flex-1">
              {label}
            </Label>
            <Switch
              id={field}
              checked={local[field]}
              disabled={saving || !hasConsent || readonly || hasOptedOut}
              onCheckedChange={() => togglePref(field)}
            />
          </div>
        ))}
      </div>

      {/* Action buttons */}
      {!readonly && (
        <div className="flex gap-2 pt-1">
          {!hasConsent && !hasOptedOut && (
            <Button size="sm" onClick={grantConsent} disabled={saving} className="flex-1">
              {saving ? 'Salvando...' : '✅ Registrar Consentimento'}
            </Button>
          )}
          {hasConsent && !hasOptedOut && (
            <Button
              size="sm"
              variant="destructive"
              onClick={revokeConsent}
              disabled={saving}
              className="flex-1"
            >
              {saving ? 'Salvando...' : '🚫 Revogar Consentimento'}
            </Button>
          )}
          {hasOptedOut && (
            <p className="text-xs text-muted-foreground italic">
              Contato solicitou opt-out. Para reativar, o contato deve consentir novamente.
            </p>
          )}
        </div>
      )}
    </div>
  );
};

export default ContactConsentManager;
