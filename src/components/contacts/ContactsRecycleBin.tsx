/**
 * ContactsRecycleBin.tsx
 * Shows soft-deleted contacts and allows managers to restore them within 30 days.
 * Accessible via Settings → Contatos → Lixeira
 */
import React, { useEffect, useState, useCallback } from 'react';
const log = getLogger('ContactsRecycleBin');

import { Button } from '@/components/ui/button';
import { getLogger } from '@/lib/logger';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import {
  Trash2, RotateCcw, AlertTriangle, Clock, Search, User, RefreshCw,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { sanitizeText } from '@/lib/sanitize';
import { useAuth } from '@/features/auth';
import { dbFrom, dbRpc } from '@/integrations/datasource/db';
import { RPC } from '@/integrations/datasource/rpcCatalog';

// ── Types ──────────────────────────────────────────────────────────────────

interface DeletedContact {
  id:             string;
  name:           string;
  phone:          string | null;
  email:          string | null;
  company:        string | null;
  deleted_at:     string;
  deleted_reason: string | null;
  deleted_by_name?: string;
  days_remaining: number;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function daysRemaining(deletedAt: string): number {
  const deletedDate = new Date(deletedAt);
  const expiresAt   = new Date(deletedDate.getTime() + 30 * 24 * 60 * 60 * 1000);
  const diff        = Math.ceil((expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  return Math.max(0, diff);
}

function formatReason(reason: string | null): string {
  if (!reason) return 'Exclusão manual';
  if (reason.startsWith('merged_into:')) return '🔀 Mesclagem de duplicatas';
  if (reason === 'bulk_deletion')         return '🗂️ Exclusão em massa';
  if (reason === 'manual_deletion')       return '🗑️ Exclusão manual';
  if (reason === 'lgpd_erasure')          return '🔒 Solicitação LGPD';
  return sanitizeText(reason);
}

// ── Main Component ─────────────────────────────────────────────────────────

interface ContactsRecycleBinProps {
  workspaceId: string;
}

export const ContactsRecycleBin: React.FC<ContactsRecycleBinProps> = ({ workspaceId }) => {
  const { toast }   = useToast();
  const { profile } = useAuth();
  const [contacts,  setContacts]  = useState<DeletedContact[]>([]);
  const [filtered,  setFiltered]  = useState<DeletedContact[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [search,    setSearch]    = useState('');

  const isManager = ['admin', 'supervisor', 'manager'].includes(profile?.role ?? '');

  const loadDeletedContacts = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await dbFrom('contacts')
        .select('id, name, phone, email, company, deleted_at, deleted_reason, deleted_by')
        .eq('workspace_id', workspaceId)
        .not('deleted_at', 'is', null)
        .gte('deleted_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
        .order('deleted_at', { ascending: false })
        .limit(200);

      if (error) throw error;

      const enriched: DeletedContact[] = (data ?? []).map((c) => ({
        id:             c.id,
        name:           sanitizeText(c.name),
        phone:          c.phone ? sanitizeText(c.phone) : null,
        email:          c.email ? sanitizeText(c.email) : null,
        company:        c.company ? sanitizeText(c.company) : null,
        deleted_at:     c.deleted_at,
        deleted_reason: c.deleted_reason,
        days_remaining: daysRemaining(c.deleted_at),
      }));

      setContacts(enriched);
      setFiltered(enriched);
    } catch (err) {
      log.error('Failed to load contacts recycle bin', err);
      toast({ title: 'Erro ao carregar lixeira', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [workspaceId, toast]);

  useEffect(() => {
    loadDeletedContacts();
  }, [loadDeletedContacts]);

  // Filter locally
  useEffect(() => {
    const q = search.toLowerCase();
    setFiltered(
      q
        ? contacts.filter(
            (c) =>
              c.name.toLowerCase().includes(q) ||
              c.email?.toLowerCase().includes(q) ||
              c.phone?.includes(q)
          )
        : contacts
    );
  }, [search, contacts]);

  const handleRestore = async (contact: DeletedContact) => {
    if (!isManager) {
      toast({ title: 'Permissão negada', description: 'Apenas gerentes podem restaurar contatos.', variant: 'destructive' });
      return;
    }
    setRestoring(contact.id);
    try {
      const { data, error } = await dbRpc(RPC.restoreContact, { p_contact_id: contact.id });
      if (error) throw error;
      const result = (data ?? {}) as Record<string, unknown>;
      if (result?.error) throw new Error(String(result.error));

      setContacts((prev) => prev.filter((c) => c.id !== contact.id));
      toast({
        title: '✅ Contato restaurado',
        description: `"${contact.name}" está de volta à lista de contatos.`,
        duration: 4_000,
      });
    } catch (err) {
      log.error('Failed to restore contact', err);
      toast({
        title: 'Erro ao restaurar',
        description: (err as Error).message?.includes('30-day')
          ? 'Prazo de recuperação expirado (>30 dias).'
          : 'Tente novamente.',
        variant: 'destructive',
      });
    } finally {
      setRestoring(null);
    }
  };

  if (!isManager) {
    return (
      <div className="flex items-center gap-2 p-4 rounded-md bg-muted/50 text-sm text-muted-foreground">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        Apenas gerentes e administradores podem acessar a lixeira de contatos.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold flex items-center gap-2">
            <Trash2 className="h-4 w-4 text-muted-foreground" />
            Lixeira de Contatos
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Contatos excluídos são mantidos por 30 dias. Após isso, são removidos permanentemente.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={loadDeletedContacts} disabled={loading} className="gap-1">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          Atualizar
        </Button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          placeholder="Buscar por nome, email ou telefone..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9 text-sm"
        />
      </div>

      <Separator />

      {/* Loading */}
      {loading && (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-16 rounded-lg bg-muted animate-pulse" />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && filtered.length === 0 && (
        <div className="flex flex-col items-center gap-2 py-8 text-muted-foreground">
          <Trash2 className="h-8 w-8 opacity-30" />
          <p className="text-sm">
            {search ? 'Nenhum contato encontrado.' : 'A lixeira está vazia.'}
          </p>
        </div>
      )}

      {/* List */}
      {!loading && filtered.length > 0 && (
        <div className="space-y-2">
          {filtered.map((contact) => (
            <div
              key={contact.id}
              className={`flex items-center gap-3 rounded-lg border p-3 ${
                contact.days_remaining <= 3 ? 'border-destructive/40 bg-destructive/5' : 'bg-card'
              }`}
            >
              {/* Avatar */}
              <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center shrink-0">
                <User className="h-4 w-4 text-muted-foreground" />
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm truncate">{contact.name}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {contact.phone ?? contact.email ?? 'Sem contacto'}
                  {contact.company && ` · ${contact.company}`}
                </p>
                <div className="flex items-center gap-2 mt-0.5">
                  <Badge variant="outline" className="text-xs py-0">
                    {formatReason(contact.deleted_reason)}
                  </Badge>
                  <span className={`text-xs flex items-center gap-0.5 ${contact.days_remaining <= 3 ? 'text-destructive font-medium' : 'text-muted-foreground'}`}>
                    <Clock className="h-3 w-3" />
                    {contact.days_remaining} dia{contact.days_remaining !== 1 ? 's' : ''} restante{contact.days_remaining !== 1 ? 's' : ''}
                  </span>
                </div>
              </div>

              {/* Restore */}
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleRestore(contact)}
                disabled={restoring === contact.id || contact.days_remaining === 0}
                className="shrink-0 gap-1"
              >
                <RotateCcw className={`h-3.5 w-3.5 ${restoring === contact.id ? 'animate-spin' : ''}`} />
                {restoring === contact.id ? 'Restaurando...' : 'Restaurar'}
              </Button>
            </div>
          ))}

          <p className="text-xs text-center text-muted-foreground pt-2">
            {filtered.length} contato{filtered.length !== 1 ? 's' : ''} na lixeira
          </p>
        </div>
      )}
    </div>
  );
};

export default ContactsRecycleBin;
