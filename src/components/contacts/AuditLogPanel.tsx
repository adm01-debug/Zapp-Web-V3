import React, { useState, useEffect, useCallback } from 'react';
import { useMountedRef } from '@/hooks/useMountedRef';
import { Badge } from '@/components/ui/badge';
import { getLogger } from '@/lib/logger';

import { Button } from '@/components/ui/button';
import { History, RefreshCw, ChevronDown, ChevronUp, Shield } from 'lucide-react';
import { safeClient } from '@/integrations/supabase/safeClient';
import { sanitizeText } from '@/lib/sanitize';

const log = getLogger('AuditLogPanel');

interface AuditEntry {
  id: string;
  action: string;
  field_name: string | null;
  old_value: string | null;
  new_value: string | null;
  changed_by: string | null;
  changed_at: string;
  metadata: Record<string, unknown> | null;
}

const ACTION_COLORS: Record<string, string> = {
  INSERT: 'bg-primary text-primary-foreground border-primary',
  UPDATE: 'bg-primary text-primary-foreground border-primary',
  DELETE: 'bg-destructive text-destructive-foreground border-destructive',
  RESTORE: 'bg-warning text-warning-foreground border-warning',
  MERGE: 'bg-primary text-primary border-primary',
};

const ACTION_LABELS: Record<string, string> = {
  INSERT: 'Criado',
  UPDATE: 'Editado',
  DELETE: 'Excluído',
  RESTORE: 'Restaurado',
  MERGE: 'Mesclado',
};

const FIELD_LABELS: Record<string, string> = {
  full_name: 'Nome',
  phone_number: 'Telefone',
  email: 'E-mail',
  company: 'Empresa',
  notes: 'Notas',
  tags: 'Tags',
  lead_status: 'Status',
  lead_score: 'Score',
  lgpd_consent: 'Consentimento LGPD',
  lgpd_opt_out: 'Opt-out LGPD',
  deleted_at: 'Exclusão',
  merge_completed: 'Mesclagem',
  merged_into: 'Mesclado em',
};

export const AuditLogPanel: React.FC<{ contactId: string; maxEntries?: number }> = ({
  contactId,
  maxEntries = 20,
}) => {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const mountedRef = useMountedRef();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await safeClient.from<AuditEntry>('contact_audit_log', (q) =>
        q
          .select('id,action,field_name,old_value,new_value,changed_by,changed_at,metadata')
          .eq('contact_id', contactId)
          .order('changed_at', { ascending: false })
          .limit(maxEntries)
      );

      if (!mountedRef.current) return;
      setEntries(data ?? []);
    } catch (err) {
      log.error('Failed to load audit log', err);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [contactId, maxEntries]);

  useEffect(() => {
    load();
  }, [load]);

  if (!loading && entries.length === 0) {
    return (
      <div className="py-4 text-center text-xs text-muted-foreground">
        <History className="mx-auto mb-1 h-6 w-6 opacity-30" />
        Nenhuma alteração registrada.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <History className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Histórico
          </span>
          <span title="LGPD Art.37" className="inline-flex">
            <Shield className="h-3 w-3 text-muted-foreground" />
          </span>
        </div>
        <Button variant="ghost" size="sm" onClick={load} disabled={loading} className="h-6 w-6 p-0">
          <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      <div className="max-h-64 space-y-1 overflow-y-auto">
        {entries.map((e) => {
          const isOpen = expanded === e.id;
          const label = FIELD_LABELS[e.field_name ?? ''] ?? sanitizeText(e.field_name ?? e.action);
          const colorClass = ACTION_COLORS[e.action] ?? ACTION_COLORS.UPDATE;
          const actionLabel = ACTION_LABELS[e.action] ?? sanitizeText(e.action);

          return (
            <div key={e.id} className="rounded border text-xs">
              <button
                type="button"
                aria-expanded={isOpen}
                onClick={() => setExpanded(isOpen ? null : e.id)}
                className="flex w-full items-center justify-between p-2 text-left hover:bg-muted/30"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <Badge className={`shrink-0 border px-1.5 py-0 text-xs ${colorClass}`}>
                    {actionLabel}
                  </Badge>
                  <span className="truncate text-muted-foreground">{label}</span>
                </div>
                <div className="ml-2 flex shrink-0 items-center gap-1">
                  <span className="text-muted-foreground/60">
                    {new Date(e.changed_at).toLocaleDateString('pt-BR', {
                      day: '2-digit',
                      month: '2-digit',
                      year: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                  {isOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                </div>
              </button>

              {isOpen && (e.old_value !== null || e.new_value !== null) && (
                <div className="space-y-1 border-t bg-muted/10 px-2 py-2">
                  {e.old_value !== null && (
                    <div className="flex gap-2">
                      <span className="w-12 shrink-0 text-muted-foreground">Antes:</span>
                      <span className="truncate text-destructive-foreground line-through">
                        {sanitizeText(e.old_value)}
                      </span>
                    </div>
                  )}
                  {e.new_value !== null && (
                    <div className="flex gap-2">
                      <span className="w-12 shrink-0 text-muted-foreground">Depois:</span>
                      <span className="truncate text-primary">{sanitizeText(e.new_value)}</span>
                    </div>
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

export default AuditLogPanel;
