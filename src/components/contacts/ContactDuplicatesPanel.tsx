/**
 * ContactDuplicatesPanel.tsx
 * Dashboard panel to detect and merge all duplicate contacts at once.
 *
 * Uses find_duplicate_contacts() RPC to find contacts sharing the same
 * normalized phone number across the workspace, then shows them in groups
 * for review and one-click merge.
 */
import React, { useState, useCallback } from 'react';
import { getLogger } from '@/lib/logger';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  GitMerge, Search, AlertTriangle, CheckCircle2, RefreshCw, Phone,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { sanitizeText } from '@/lib/sanitize';
import ContactMergeDialog, { ContactForMerge } from './ContactMergeDialog';
const log = getLogger('ContactDuplicatesPanel');

import { dbFrom, dbList } from '@/integrations/datasource/db';
import { RPC } from '@/integrations/datasource/rpcCatalog';

// ── Types ──────────────────────────────────────────────────────────────────

interface DuplicateGroup {
  phone_normalized: string;
  contact_ids:      string[];
  contact_names:    string[];
  contacts?:        ContactForMerge[];
}

// ── Main Component ─────────────────────────────────────────────────────────

interface ContactDuplicatesPanelProps {
  workspaceId: string;
}

export const ContactDuplicatesPanel: React.FC<ContactDuplicatesPanelProps> = ({ workspaceId }) => {
  const { toast } = useToast();
  const [groups,    setGroups]    = useState<DuplicateGroup[]>([]);
  const [scanning,  setScanning]  = useState(false);
  const [scanned,   setScanned]   = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [mergePair, setMergePair] = useState<[ContactForMerge, ContactForMerge] | null>(null);

  const scan = useCallback(async () => {
    setScanning(true);
    try {
      const { data, error } = await dbList(RPC.findDuplicateContacts, {
        p_workspace_id: workspaceId,
      });
      if (error) throw error;

      const rawGroups: DuplicateGroup[] = (data ?? []).map((g) => ({
        phone_normalized: g.phone_normalized,
        contact_ids:      g.contact_ids,
        contact_names:    (g.contact_names ?? []).map(sanitizeText),
      }));

      setGroups(rawGroups);
      setScanned(true);

      toast({
        title: `🔍 Scan concluído`,
        description:
          rawGroups.length === 0
            ? 'Nenhuma duplicata encontrada. Base limpa! ✅'
            : `${rawGroups.length} grupo${rawGroups.length !== 1 ? 's' : ''} de duplicatas encontrado${rawGroups.length !== 1 ? 's' : ''}.`,
        duration: 4_000,
      });
    } catch (err) {
      log.error('Failed to scan for duplicates', err);
      toast({ title: 'Erro ao escanear duplicatas', variant: 'destructive' });
    } finally {
      setScanning(false);
    }
  }, [workspaceId, toast]);

  const openMerge = useCallback(async (group: DuplicateGroup) => {
    // Load full contact data for the first two contacts in the group
    const { data, error } = await (dbFrom('contacts') as any)
      .select('id, name, phone, email, company, tags, channel, avatar_url, created_at, notes, lgpd_consent_at')
      .in('id', group.contact_ids.slice(0, 2))
      .is('deleted_at', null);

    if (error || !data || data.length < 2) {
      toast({ title: 'Erro ao carregar contatos para mesclagem', variant: 'destructive' });
      return;
    }

    // Count conversations per contact
    const counts = await Promise.all(
      data.map((c) =>
        dbFrom('conversations')
          .select('id', { count: 'exact', head: true })
          .eq('contact_id', c.id)
      )
    );

    const enriched: ContactForMerge[] = data.map((c, i) => ({
      id:           c.id,
      name:         sanitizeText(c.name),
      phone:        c.phone ? sanitizeText(c.phone) : null,
      email:        c.email ? sanitizeText(c.email) : null,
      company:      c.company ? sanitizeText(c.company) : null,
      tags:         Array.isArray(c.tags) ? c.tags.map(sanitizeText) : [],
      channel:      c.channel ?? null,
      avatar_url:   c.avatar_url ?? null,
      created_at:   c.created_at,
      notes:        c.notes ?? null,
      lgpd_consent_at: c.lgpd_consent_at ?? null,
      conversation_count: counts[i].count ?? 0,
    }));

    setMergePair([enriched[0], enriched[1]]);
    setMergeOpen(true);
  }, [toast]);

  const handleMergeComplete = useCallback((survivingId: string, group: DuplicateGroup) => {
    setGroups((prev) =>
      prev.filter((g) => g.phone_normalized !== group.phone_normalized)
    );
  }, []);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold flex items-center gap-2">
            <GitMerge className="h-4 w-4 text-primary" />
            Detecção de Duplicatas
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Encontra contatos com o mesmo número de telefone normalizado.
          </p>
        </div>
        <Button onClick={scan} disabled={scanning} className="gap-2">
          {scanning ? (
            <><RefreshCw className="h-4 w-4 animate-spin" />Escaneando...</>
          ) : (
            <><Search className="h-4 w-4" />Escanear Duplicatas</>
          )}
        </Button>
      </div>

      <Separator />

      {/* Not yet scanned */}
      {!scanned && !scanning && (
        <div className="flex flex-col items-center gap-3 py-8 text-muted-foreground">
          <GitMerge className="h-10 w-10 opacity-30" />
          <p className="text-sm text-center">
            Clique em "Escanear Duplicatas" para verificar contatos com o mesmo número de telefone.
          </p>
        </div>
      )}

      {/* Scanning */}
      {scanning && (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-16 rounded-lg bg-muted animate-pulse" />
          ))}
        </div>
      )}

      {/* Clean */}
      {scanned && !scanning && groups.length === 0 && (
        <div className="flex flex-col items-center gap-2 py-8">
          <CheckCircle2 className="h-10 w-10 text-primary" />
          <p className="font-medium text-primary dark:text-primary">Base de contatos limpa!</p>
          <p className="text-xs text-muted-foreground">Nenhuma duplicata por número de telefone foi encontrada.</p>
        </div>
      )}

      {/* Duplicate groups */}
      {scanned && !scanning && groups.length > 0 && (
        <div className="space-y-3">
          <p className="text-sm font-medium flex items-center gap-1">
            <AlertTriangle className="h-4 w-4 text-warning-foreground" />
            {groups.length} grupo{groups.length !== 1 ? 's' : ''} de duplicatas encontrado{groups.length !== 1 ? 's' : ''}
          </p>

          {groups.map((group) => (
            <div
              key={group.phone_normalized}
              className="rounded-lg border border-warning bg-warning dark:border-warning dark:bg-warning/30 p-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1 flex-1 min-w-0">
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Phone className="h-3 w-3" />
                    <span className="">{group.phone_normalized}</span>
                    <Badge variant="outline" className="text-xs ml-1">
                      {group.contact_ids.length} contatos
                    </Badge>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {group.contact_names.map((name, i) => (
                      <Badge key={`${name}-${i}`} variant="secondary" className="text-xs">
                        {name}
                      </Badge>
                    ))}
                  </div>
                </div>

                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => openMerge(group)}
                  className="gap-1 shrink-0"
                >
                  <GitMerge className="h-3.5 w-3.5" />
                  Mesclar
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Merge Dialog */}
      {mergeOpen && mergePair && (
        <ContactMergeDialog
          open={mergeOpen}
          onOpenChange={setMergeOpen}
          primaryContact={mergePair[0]}
          secondaryContact={mergePair[1]}
          onMergeComplete={(id) => {
            const group = groups.find((g) => g.contact_ids.includes(mergePair[0].id));
            if (group) handleMergeComplete(id, group);
            toast({ title: '✅ Mesclagem concluída!', description: 'Histórico completo preservado.' });
          }}
        />
      )}
    </div>
  );
};

export default ContactDuplicatesPanel;
