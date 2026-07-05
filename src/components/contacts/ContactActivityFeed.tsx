/**
 * ContactActivityFeed.tsx — v2.0
 * Real activity timeline using evolution_conversations + contact_audit_log.
 */
import React, { useState, useEffect, useCallback } from 'react';
import { useMountedRef } from '@/hooks/useMountedRef';
import { supabase } from '@/integrations/supabase/client';
import { dbRpc } from '@/integrations/datasource/db';
import { RPC } from '@/integrations/datasource/rpcCatalog';
import { getLogger } from '@/lib/logger';

interface AuditQuery extends PromiseLike<{ data: unknown; error: unknown }> {
  select(cols: string): AuditQuery;
  eq(col: string, val: unknown): AuditQuery;
  order(col: string, opts: { ascending: boolean }): AuditQuery;
  limit(n: number): AuditQuery;
}
const auditFrom = () =>
  (supabase as unknown as { from: (t: string) => AuditQuery }).from('contact_audit_log');

import { Button } from '@/components/ui/button';
import { MessageCircle, FileText, Shield, RotateCcw, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';
import { sanitizeText } from '@/lib/sanitize';

const log = getLogger('ContactActivityFeed');

interface Activity { id: string; type: string; label: string; detail?: string; timestamp: string; }

const ICONS: Record<string, React.FC<{ className?: string }>> = {
  conversation_open:   ({ className }) => <MessageCircle className={className} />,
  conversation_closed: ({ className }) => <MessageCircle className={className} />,
  edit:                ({ className }) => <FileText className={className} />,
  lgpd:                ({ className }) => <Shield className={className} />,
  merge:               ({ className }) => <RotateCcw className={className} />,
  delete:              ({ className }) => <FileText className={className} />,
  restore:             ({ className }) => <RotateCcw className={className} />,
  note:                ({ className }) => <FileText className={className} />,
};

const COLORS: Record<string, string> = {
  conversation_open: 'bg-primary text-primary', conversation_closed: 'bg-muted text-muted-foreground',
  edit: 'bg-primary text-primary', lgpd: 'bg-primary text-primary',
  merge: 'bg-primary text-primary', delete: 'bg-destructive text-destructive-foreground',
  restore: 'bg-warning text-warning-foreground', note: 'bg-warning text-warning',
};

export const ContactActivityFeed: React.FC<{ contactId: string; maxItems?: number }> = ({ contactId, maxItems = 20 }) => {
  const mountedRef = useMountedRef();
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const PREVIEW = 5;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const all: Activity[] = [];

      // Conversations
      const { data: convs , error: convsErr } = await dbRpc(RPC.getContactConversations, { p_contact_id: contactId, p_limit: 30 });
      for (const c of (convs ?? []) as Record<string, unknown>[]) {
        if (c.first_message_at) all.push({ id: `conv-open-${c.id}`, type: 'conversation_open', label: 'Conversa iniciada', detail: c.assigned_to ? `Atendente: ${sanitizeText(String(c.assigned_to))}` : undefined, timestamp: String(c.first_message_at) });
        if (c.status === 'closed' && c.last_message_at) all.push({ id: `conv-closed-${c.id}`, type: 'conversation_closed', label: 'Conversa encerrada', detail: `${c.message_count ?? 0} msgs`, timestamp: String(c.last_message_at) });
      }

      // Audit log
      const { data: audit , error: auditErr } = await auditFrom().select('id,action,field_name,changed_at').eq('contact_id', contactId).order('changed_at', { ascending: false }).limit(30);
      for (const e of (audit ?? []) as Record<string, unknown>[]) {
        const field = String(e.field_name ?? ''); const action = String(e.action ?? '');
        if (action === 'INSERT') { all.push({ id: `a-${e.id}`, type: 'edit', label: 'Contato criado', timestamp: String(e.changed_at) }); }
        else if (action === 'DELETE') { all.push({ id: `a-${e.id}`, type: 'delete', label: 'Contato excluído', timestamp: String(e.changed_at) }); }
        else if (action === 'RESTORE') { all.push({ id: `a-${e.id}`, type: 'restore', label: 'Contato restaurado', timestamp: String(e.changed_at) }); }
        else if (field.startsWith('lgpd') || action.includes('lgpd')) { all.push({ id: `a-${e.id}`, type: 'lgpd', label: field.includes('opt_out') ? 'Opt-out LGPD' : 'Consentimento LGPD', timestamp: String(e.changed_at) }); }
        else if (field === 'note_added') { all.push({ id: `a-${e.id}`, type: 'note', label: 'Nota adicionada', timestamp: String(e.changed_at) }); }
        else if (field.includes('merge')) { all.push({ id: `a-${e.id}`, type: 'merge', label: 'Contatos mesclados', timestamp: String(e.changed_at) }); }
        else if (action === 'UPDATE' && field) { all.push({ id: `a-${e.id}`, type: 'edit', label: `Editado: ${field}`, timestamp: String(e.changed_at) }); }
      }

      all.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      if (mountedRef.current) setActivities(all.slice(0, maxItems));
    } catch (err) { if (mountedRef.current) log.error('Failed to load activity feed', err); }
    finally { if (mountedRef.current) setLoading(false); }
  }, [contactId, maxItems]);

  useEffect(() => { load(); }, [load]);

  const shown = showAll ? activities : activities.slice(0, PREVIEW);
  const hasMore = activities.length > PREVIEW;

  if (loading && !activities.length) return (
    <div className="space-y-2 animate-pulse" aria-busy="true">
      {[1,2,3].map((i) => <div key={i} className="flex gap-2 p-1.5"><div className="h-7 w-7 rounded-full bg-muted shrink-0" /><div className="flex-1 space-y-1"><div className="h-3 bg-muted rounded w-36" /><div className="h-2 bg-muted rounded w-20" /></div></div>)}
      <span className="sr-only">Carregando atividades...</span>
    </div>
  );

  if (!loading && !activities.length) return (
    <div className="text-center py-4 text-muted-foreground text-xs">
      <MessageCircle className="h-6 w-6 mx-auto mb-1 opacity-30" />
      <p>Nenhuma atividade registrada.</p>
    </div>
  );

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Atividade recente</p>
        <Button variant="ghost" size="sm" onClick={load} disabled={loading} className="h-6 w-6 p-0"><RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} /></Button>
      </div>
      <div className="space-y-0.5" role="list">
        {shown.map((a, idx) => {
          const Icon = ICONS[a.type] ?? ICONS.edit;
          const colorCls = COLORS[a.type] ?? COLORS.edit;
          const isLast = idx === shown.length - 1;
          return (
            <div key={a.id} className="flex items-start gap-2.5 relative" role="listitem">
              {!isLast && <div className="absolute left-[13px] top-7 bottom-0 w-px bg-border" aria-hidden="true" />}
              <div className={`h-7 w-7 rounded-full flex items-center justify-center shrink-0 z-10 ${colorCls}`}>
                <Icon className="h-3 w-3" />
              </div>
              <div className="flex-1 pb-3 min-w-0">
                <p className="text-xs font-medium leading-tight">{a.label}</p>
                {a.detail && <p className="text-xs text-muted-foreground truncate">{sanitizeText(a.detail)}</p>}
                <p className="text-xs text-muted-foreground/60 mt-0.5">
                  {new Date(a.timestamp).toLocaleString('pt-BR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' })}
                </p>
              </div>
            </div>
          );
        })}
      </div>
      {hasMore && (
        <Button variant="ghost" size="sm" onClick={() => setShowAll((v) => !v)} className="w-full gap-1 text-xs text-muted-foreground" aria-expanded={showAll}>
          {showAll ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          {showAll ? 'Ver menos' : `Ver mais ${activities.length - PREVIEW}`}
        </Button>
      )}
    </div>
  );
};

export default ContactActivityFeed;
