/**
 * ContactAuditLogPanel.tsx
 * Shows the full audit trail for a single contact.
 * LGPD Art. 37 compliance: who changed what and when.
 *
 * Shows in the contact detail view (tab or accordion section).
 */
import React, { useEffect, useState, useCallback } from 'react';
const log = getLogger('ContactAuditLogPanel');

import { getLogger } from '@/lib/logger';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Shield, Clock, User, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';
import { sanitizeText } from '@/lib/sanitize';
import { dbFrom } from '@/integrations/datasource/db';

// ── Types ──────────────────────────────────────────────────────────────────

interface AuditEntry {
  id:          string;
  action:      'INSERT' | 'UPDATE' | 'DELETE' | 'RESTORE';
  changed_at:  string;
  changed_by:  string | null;
  old_values:  Record<string, unknown> | null;
  new_values:  Record<string, unknown> | null;
  reason:      string | null;
}

const ACTION_CONFIG = {
  INSERT:  { label: 'Criado',    color: 'bg-primary text-primary-foreground border-primary' },
  UPDATE:  { label: 'Editado',   color: 'bg-primary text-primary-foreground border-primary' },
  DELETE:  { label: 'Excluído',  color: 'bg-destructive text-destructive-foreground border-destructive' },
  RESTORE: { label: 'Restaurado', color: 'bg-primary text-primary border-primary' },
};

const FIELD_LABELS: Record<string, string> = {
  name:    'Nome',
  phone:   'Telefone',
  email:   'E-mail',
  company: 'Empresa',
  notes:   'Notas',
  tags:    'Tags',
  lgpd_consent_at: 'Consentimento LGPD',
  lgpd_opt_out_at: 'Opt-out LGPD',
  is_blocked: 'Bloqueado',
  custom_fields: 'Campos personalizados',
};

// ── Sub-components ─────────────────────────────────────────────────────────

function FieldDiff({ fieldKey, oldVal, newVal }: { fieldKey: string; oldVal: unknown; newVal: unknown }) {
  const label = FIELD_LABELS[fieldKey] ?? fieldKey;
  const formatValue = (v: unknown) => {
    if (v === null || v === undefined) return <span className="italic text-muted-foreground">vazio</span>;
    if (typeof v === 'boolean') return v ? 'Sim' : 'Não';
    if (Array.isArray(v)) return v.map(String).join(', ');
    return sanitizeText(String(v));
  };

  return (
    <div className="text-xs">
      <span className="font-medium">{label}:</span>{' '}
      {oldVal !== undefined && (
        <span className="line-through text-muted-foreground mr-1">{formatValue(oldVal)}</span>
      )}
      <span className="text-foreground">→ {formatValue(newVal)}</span>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────

interface ContactAuditLogPanelProps {
  contactId: string;
  maxItems?: number;
}

export const ContactAuditLogPanel: React.FC<ContactAuditLogPanelProps> = ({
  contactId,
  maxItems = 20,
}) => {
  const [entries,   setEntries]   = useState<AuditEntry[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [expanded,  setExpanded]  = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await dbFrom('audit_log')
        .select('id, action, changed_at, changed_by, old_values, new_values, reason')
        .eq('contact_id', contactId)
        .order('changed_at', { ascending: false })
        .limit(maxItems);

      if (error) throw error;
      setEntries(data ?? []);
    } catch (err) {
      log.error('Failed to load contact audit log', err);
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, [contactId, maxItems]);

  useEffect(() => { load(); }, [load]);

  const getChangedFields = (entry: AuditEntry): string[] => {
    if (!entry.new_values) return [];
    return Object.keys(entry.new_values);
  };

  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-12 rounded bg-muted animate-pulse" />
        ))}
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
        <Shield className="h-4 w-4" />
        Nenhum registro de auditoria encontrado para este contato.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium flex items-center gap-1">
          <Shield className="h-4 w-4 text-primary" />
          Histórico de Alterações
        </p>
        <Button variant="ghost" size="sm" onClick={load} className="h-7 gap-1 text-xs">
          <RefreshCw className="h-3 w-3" />
          Atualizar
        </Button>
      </div>

      <Separator />

      <div className="space-y-1.5">
        {entries.map((entry) => {
          const config       = ACTION_CONFIG[entry.action] ?? ACTION_CONFIG.UPDATE;
          const changedFields = getChangedFields(entry);
          const isExpanded   = expanded === entry.id;

          return (
            <div key={entry.id} className="rounded-md border bg-card overflow-hidden">
              {/* Header row */}
              <button
                type="button"
                onClick={() => setExpanded(isExpanded ? null : entry.id)}
                className="w-full flex items-center gap-2 p-2.5 text-left hover:bg-muted/50 transition-colors"
              >
                <Badge className={`text-xs shrink-0 ${config.color}`}>{config.label}</Badge>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Clock className="h-3 w-3 shrink-0" />
                    {new Date(entry.changed_at).toLocaleString('pt-BR')}
                    {entry.changed_by && (
                      <>
                        <span className="mx-1">·</span>
                        <User className="h-3 w-3 shrink-0" />
                        <span className="truncate">{sanitizeText(entry.changed_by)}</span>
                      </>
                    )}
                  </div>

                  {changedFields.length > 0 && !isExpanded && (
                    <p className="text-xs text-muted-foreground truncate mt-0.5">
                      {changedFields.map((f) => FIELD_LABELS[f] ?? f).join(', ')}
                    </p>
                  )}
                </div>

                {changedFields.length > 0 && (
                  isExpanded
                    ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                )}
              </button>

              {/* Expanded details */}
              {isExpanded && changedFields.length > 0 && (
                <div className="border-t px-3 py-2 space-y-1 bg-muted/20">
                  {changedFields.map((field) => (
                    <FieldDiff
                      key={field}
                      fieldKey={field}
                      oldVal={entry.old_values?.[field]}
                      newVal={entry.new_values?.[field]}
                    />
                  ))}
                  {entry.reason && (
                    <p className="text-xs text-muted-foreground mt-1">
                      <span className="font-medium">Motivo:</span> {sanitizeText(entry.reason)}
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default ContactAuditLogPanel;
