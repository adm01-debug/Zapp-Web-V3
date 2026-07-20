/**
 * ContactRecycleBin.tsx — v2.0
 * Recycle bin using v_deleted_contacts view + restore_contact() RPC.
 * Shows contacts deleted in the last 30 days.
 */
import React, { useState, useEffect, useCallback } from 'react';
import { useMountedRef } from '@/hooks/useMountedRef';
import { Button } from '@/components/ui/button';
import { getLogger } from '@/lib/logger';

import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Trash2, RotateCcw, RefreshCw, Search, Clock, AlertTriangle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { dbFrom, dbRpc } from '@/integrations/datasource/db';
import { RPC } from '@/integrations/datasource/rpcCatalog';
import { sanitizeText } from '@/lib/sanitize';
import { formatPhoneForDisplay } from '@/lib/phoneUtils';

const log = getLogger('ContactRecycleBin');

interface DeletedContact {
  id: string;
  display_name: string;
  phone_number: string | null;
  email: string | null;
  instance_name: string;
  deleted_at: string;
  deleted_reason: string | null;
  days_remaining: number;
}

interface ContactRecycleBinProps {
  workspaceId: string; // instance_name
  onRestored?: (id: string) => void;
}

function formatReason(reason: string | null): string {
  if (!reason) return 'Exclusão manual';
  if (reason.startsWith('merged_into:')) return '🔀 Mesclado com outro contato';
  if (reason === 'bulk_deletion') return '🗑️ Exclusão em massa';
  if (reason === 'manual_deletion') return '🗑️ Exclusão manual';
  if (reason === 'lgpd_erasure') return '⚖️ Solicitação LGPD';
  return sanitizeText(reason);
}

/** Contact Recycle Bin constant. */
export const ContactRecycleBin: React.FC<ContactRecycleBinProps> = ({
  workspaceId: instanceName,
  onRestored,
}) => {
  const { toast } = useToast();
  const mountedRef = useMountedRef();
  const [contacts, setContacts] = useState<DeletedContact[]>([]);
  const [loading, setLoading] = useState(false);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Use the v_deleted_contacts view via the datasource registry.
      const { data, error } = await dbFrom('deleted_contacts')
        .select(
          'id,display_name,phone_number,email,instance_name,deleted_at,deleted_reason,days_remaining'
        )
        .eq('instance_name', instanceName)
        .order('deleted_at', { ascending: false })
        .limit(100);

      if (error) throw error;
      if (mountedRef.current) setContacts((data ?? []) as DeletedContact[]);
    } catch (err) {
      log.error('Failed to load recycle bin', err);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [instanceName]);

  useEffect(() => {
    load();
  }, [load]);

  const restore = async (id: string, name: string) => {
    if (!mountedRef.current) return;
    setRestoring(id);
    try {
      const { data, error } = await dbRpc(RPC.restoreContact, { p_contact_id: id });
      if (error) throw error;
      const result = (data ?? {}) as Record<string, unknown>; // ignore-audit: narrows Supabase query result to local interface
      if (result?.error) throw new Error(String(result.error));

      setContacts((prev) => prev.filter((c) => c.id !== id));
      toast({
        title: '↩️ Contato restaurado!',
        description: `"${sanitizeText(name)}" está ativo novamente.`,
        duration: 4_000,
      });
      onRestored?.(id);
    } catch (err) {
      if (!mountedRef.current) return;
      toast({ title: 'Erro ao restaurar', description: String(err), variant: 'destructive' });
    } finally {
      if (mountedRef.current) setRestoring(null);
    }
  };

  const filtered = contacts.filter(
    (c) =>
      !search ||
      sanitizeText(c.display_name).toLowerCase().includes(search.toLowerCase()) ||
      (c.phone_number ?? '').includes(search) ||
      (c.email ?? '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Trash2 className="h-4 w-4 text-destructive" />
          <span className="text-sm font-semibold">Lixeira</span>
          {contacts.length > 0 && (
            <Badge variant="outline" className="text-xs">
              {contacts.length} contato{contacts.length !== 1 ? 's' : ''}
            </Badge>
          )}
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading} className="gap-1">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          Atualizar
        </Button>
      </div>

      <Alert className="border-warning bg-warning">
        <Clock className="h-4 w-4 text-warning-foreground" />
        <AlertDescription className="text-xs text-warning-foreground">
          Contatos excluídos são mantidos por <strong>30 dias</strong> e removidos permanentemente
          após esse período.
        </AlertDescription>
      </Alert>

      {contacts.length > 3 && (
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            aria-label="Buscar na lixeira"
            placeholder="Buscar na lixeira..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 pl-9 text-sm"
          />
        </div>
      )}

      {!loading && contacts.length === 0 && (
        <div className="py-8 text-center text-muted-foreground">
          <Trash2 className="mx-auto mb-2 h-8 w-8 opacity-30" />
          <p className="text-sm">Lixeira vazia</p>
          <p className="text-xs">Nenhum contato excluído nos últimos 30 dias.</p>
        </div>
      )}

      <div className="max-h-96 space-y-2 overflow-y-auto">
        {filtered.map((contact) => (
          <div
            key={contact.id}
            className={`flex items-start justify-between gap-2 rounded-lg border p-3 ${
              contact.days_remaining <= 3 ? 'border-destructive bg-destructive' : 'bg-muted/20'
            }`}
          >
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-medium">{sanitizeText(contact.display_name)}</p>
                {contact.days_remaining <= 3 ? (
                  <Badge variant="destructive" className="gap-1 text-xs">
                    <AlertTriangle className="h-2.5 w-2.5" />
                    Expira em {contact.days_remaining}d
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-xs">
                    <Clock className="mr-1 h-2.5 w-2.5" />
                    {contact.days_remaining} dias
                  </Badge>
                )}
              </div>
              <div className="space-y-0.5 text-xs text-muted-foreground">
                {contact.phone_number && <p>{formatPhoneForDisplay(contact.phone_number)}</p>}
                {contact.email && <p>{sanitizeText(contact.email)}</p>}
                <p>{formatReason(contact.deleted_reason)}</p>
                <p>
                  Excluído:{' '}
                  {new Date(contact.deleted_at).toLocaleString('pt-BR', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </p>
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => restore(contact.id, contact.display_name)}
              disabled={restoring === contact.id}
              className="shrink-0 gap-1"
            >
              {restoring === contact.id ? (
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RotateCcw className="h-3.5 w-3.5" />
              )}
              Restaurar
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
};

/** Default export. */
export default ContactRecycleBin;
