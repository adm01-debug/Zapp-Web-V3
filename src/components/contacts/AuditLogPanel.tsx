/**
 * AuditLogPanel.tsx — v2.0
 * LGPD Art.37 audit history using contact_audit_log table.
 * Adapts to actual schema: field_name/old_value/new_value columns.
 */
import React, { useState, useEffect, useCallback } from 'react';
import { Badge } from '@/components/ui/badge';
import { getLogger } from '@/lib/logger';

import { Button } from '@/components/ui/button';
import { History, RefreshCw, ChevronDown, ChevronUp, Shield } from 'lucide-react';
import { safeClient } from '@/integrations/supabase/safeClient';
import { sanitizeText } from '@/lib/sanitize';

const log = getLogger('AuditLogPanel');

interface AuditEntry {
  id:         string;
  action:     string;
  field_name: string | null;
  old_value:  string | null;
  new_value:  string | null;
  changed_by: string | null;
  changed_at: string;
  metadata:   Record<string, unknown> | null;
}

const ACTION_COLORS: Record<string, string> = {
  INSERT:    'bg-primary text-primary-foreground border-primary',
  UPDATE:    'bg-primary text-primary-foreground border-primary',
  DELETE:    'bg-destructive text-destructive-foreground border-destructive',
  RESTORE:   'bg-warning text-warning-foreground border-warning',
  MERGE:     'bg-primary text-primary border-primary',
};

const ACTION_LABELS: Record<string, string> = {
  INSERT: 'Criado', UPDATE: 'Editado', DELETE: 'Excluído',
  RESTORE: 'Restaurado', MERGE: 'Mesclado',
};

const FIELD_LABELS: Record<string, string> = {
  full_name: 'Nome', phone_number: 'Telefone', email: 'E-mail',
  company: 'Empresa', notes: 'Notas', tags: 'Tags',
  lead_status: 'Status', lead_score: 'Score',
  lgpd_consent: 'Consentimento LGPD', lgpd_opt_out: 'Opt-out LGPD',
  deleted_at: 'Exclusão', merge_completed: 'Mesclagem', merged_into: 'Mesclado em',
};

export const AuditLogPanel: React.FC<{ contactId: string; maxEntries?: number }> = ({
  contactId, maxEntries = 20,
}) => {
  const [entries,  setEntries]  = useState<AuditEntry[]>([]);
  const [loading,  setLoading]  = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await safeClient.from<AuditEntry>(
        'contact_audit_log',
        q => q.select('id,action,field_name,old_value,new_value,changed_by,changed_at,metadata')
              .eq('contact_id', contactId)
              .order('changed_at', { ascending: false })
              .limit(maxEntries),
      );

      setEntries(data ?? []);
    } catch (err) { log.error('Failed to load audit log', err); }
    finally { setLoading(false); }
  }, [contactId, maxEntries]);

  useEffect(() => { load(); }, [load]);

  if (!loading && entries.length === 0) {
    return (
      <div className="text-center py-4 text-muted-foreground text-xs">
        <History className="h-6 w-6 mx-auto mb-1 opacity-30" />
        Nenhuma alteração registrada.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <History className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Histórico</span>
          <span title="LGPD Art.37" className="inline-flex"><Shield className="h-3 w-3 text-muted-foreground" /></span>
        </div>
        <Button variant="ghost" size="sm" onClick={load} disabled={loading} className="h-6 w-6 p-0">
          <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      <div className="space-y-1 max-h-64 overflow-y-auto">
        {entries.map((e) => {
          const isOpen = expanded === e.id;
          const label = FIELD_LABELS[e.field_name ?? ''] ?? sanitizeText(e.field_name ?? e.action);
          const colorClass = ACTION_COLORS[e.action] ?? ACTION_COLORS.UPDATE;
          const actionLabel = ACTION_LABELS[e.action] ?? sanitizeText(e.action);

          return (
            <div key={e.id} className="rounded border text-xs">
              <button
                type="button"
                onClick={() => setExpanded(isOpen ? null : e.id)}
                className="w-full flex items-center justify-between p-2 hover:bg-muted/30 text-left"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Badge className={`text-xs border px-1.5 py-0 shrink-0 ${colorClass}`}>{actionLabel}</Badge>
                  <span className="truncate text-muted-foreground">{label}</span>
                </div>
                <div className="flex items-center gap-1 shrink-0 ml-2">
                  <span className="text-muted-foreground/60">
                    {new Date(e.changed_at).toLocaleDateString('pt-BR', {
                      day: '2-digit', month: '2-digit', year: '2-digit',
                      hour: '2-digit', minute: '2-digit',
                    })}
                  </span>
                  {isOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                </div>
              </button>

              {isOpen && (e.old_value !== null || e.new_value !== null) && (
                <div className="border-t px-2 py-2 space-y-1 bg-muted/10">
                  {e.old_value !== null && (
                    <div className="flex gap-2">
                      <span className="text-muted-foreground w-12 shrink-0">Antes:</span>
                      <span className="text-destructive-foreground line-through truncate">{sanitizeText(e.old_value)}</span>
                    </div>
                  )}
                  {e.new_value !== null && (
                    <div className="flex gap-2">
                      <span className="text-muted-foreground w-12 shrink-0">Depois:</span>
                      <span className="text-primary truncate">{sanitizeText(e.new_value)}</span>
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
