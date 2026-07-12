/**
 * DuplicateContactsPanel.tsx — v3.0
 * Duplicate detection + individual merge + bulk auto-merge.
 * Uses find_duplicate_contacts(), merge_contacts(), bulk_auto_merge_duplicates() RPCs.
 */
import React, { useState, useEffect, useCallback } from 'react';
import { useMountedRef } from '@/hooks/useMountedRef';
import { Button } from '@/components/ui/button';
import { getLogger } from '@/lib/logger';

import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { GitMerge, RefreshCw, CheckCircle2, Users, Zap, AlertOctagon } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { dbRpc } from '@/integrations/datasource/db';
import { RPC } from '@/integrations/datasource/rpcCatalog';
import { sanitizeText } from '@/lib/sanitize';
import { formatPhoneForDisplay } from '@/lib/phoneUtils';

const log = getLogger('DuplicateContactsPanel');

interface DuplicateGroup {
  phone_normalized: string;
  contact_ids: string[];
  contact_names: string[];
  contact_count: number;
}

interface DuplicateReport {
  total_duplicate_groups: number;
  total_redundant_contacts: number;
  worst_group_phone: string;
  worst_group_count: number;
}

interface Props {
  workspaceId: string; // instance_name
  onMergeComplete?: () => void;
}

export const DuplicateContactsPanel: React.FC<Props> = ({
  workspaceId: instanceName,
  onMergeComplete,
}) => {
  const { toast } = useToast();
  const mountedRef = useMountedRef();
  const [groups, setGroups] = useState<DuplicateGroup[]>([]);
  const [report, setReport] = useState<DuplicateReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [merging, setMerging] = useState<string | null>(null);
  const [autoMerging, setAutoMerging] = useState(false);
  const [autoProgress, setAutoProgress] = useState(0);

  const scan = useCallback(async () => {
    setLoading(true);
    setDone(false);
    try {
      const [groupsRes, reportRes] = await Promise.all([
        dbRpc(RPC.findDuplicateContacts, { p_workspace_id: instanceName, p_limit: 100 }),
        dbRpc(RPC.getDuplicateReport, { p_instance_name: instanceName }),
      ]);

      if (groupsRes.error) throw groupsRes.error;
      if (reportRes.error) throw reportRes.error;

      if (!mountedRef.current) return;
      setGroups((groupsRes.data ?? []) as DuplicateGroup[]);
      setReport((reportRes.data ?? null) as DuplicateReport | null);
      setDone(true);
    } catch (err) {
      if (!mountedRef.current) return;
      log.error('Failed to load duplicate contacts', err);
      toast({
        title: 'Erro ao verificar duplicatas',
        description: String(err),
        variant: 'destructive',
      });
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [instanceName, toast, mountedRef]);

  useEffect(() => {
    scan();
  }, [scan]);

  // ── Single group merge ──
  const mergeGroup = async (group: DuplicateGroup) => {
    if (group.contact_ids.length < 2) return;
    if (!mountedRef.current) return;
    setMerging(group.phone_normalized);
    try {
      const { data, error } = await dbRpc(RPC.mergeContacts, {
        p_primary_id: group.contact_ids[0],
        p_secondary_id: group.contact_ids[1],
        p_merged_fields: {},
      });
      if (error) throw error;
      if (!mountedRef.current) return;
      const result = data as Record<string, unknown>;
      if (result?.error) throw new Error(String(result.error));

      setGroups((prev) => prev.filter((g) => g.phone_normalized !== group.phone_normalized));
      if (report)
        setReport((r) =>
          r
            ? {
                ...r,
                total_duplicate_groups: r.total_duplicate_groups - 1,
                total_redundant_contacts: r.total_redundant_contacts - 1,
              }
            : r
        );

      toast({
        title: '🔀 Mesclados!',
        description: `"${sanitizeText(group.contact_names[0])}" unificado.`,
        duration: 3_000,
      });
      onMergeComplete?.();
    } catch (err) {
      if (!mountedRef.current) return;
      toast({ title: 'Erro ao mesclar', description: String(err), variant: 'destructive' });
    } finally {
      if (mountedRef.current) setMerging(null);
    }
  };

  // ── Auto-merge all ──
  const autoMergeAll = async () => {
    if (!mountedRef.current) return;
    setAutoMerging(true);
    setAutoProgress(0);

    const progressInterval = setInterval(() => {
      if (mountedRef.current) setAutoProgress((p) => Math.min(p + 5, 90));
    }, 500);

    try {
      const { data, error } = await dbRpc(RPC.bulkAutoMergeDuplicates, {
        p_instance_name: instanceName,
        p_limit: 1000,
      });
      if (error) throw error;
      if (!mountedRef.current) {
        clearInterval(progressInterval);
        return;
      }

      clearInterval(progressInterval);
      setAutoProgress(100);

      const result = data as Record<string, unknown>;
      toast({
        title: '🎉 Auto-merge concluído!',
        description: `${result.merged_contacts} contatos mesclados em ${result.groups_processed} grupos.`,
        duration: 5_000,
      });

      // Refresh
      setTimeout(() => {
        if (mountedRef.current) {
          setAutoMerging(false);
          setAutoProgress(0);
          scan();
          onMergeComplete?.();
        }
      }, 1_000);
    } catch (err) {
      clearInterval(progressInterval);
      if (mountedRef.current) {
        setAutoMerging(false);
        setAutoProgress(0);
        toast({ title: 'Erro no auto-merge', description: String(err), variant: 'destructive' });
      }
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold">Contatos Duplicados</span>
          {report && report.total_duplicate_groups > 0 && (
            <Badge variant="destructive">{report.total_duplicate_groups}</Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          {report && report.total_duplicate_groups > 0 && !autoMerging && (
            <Button variant="default" size="sm" onClick={autoMergeAll} className="gap-1">
              <Zap className="h-3.5 w-3.5" />
              Mesclar todos ({report.total_duplicate_groups})
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={scan}
            disabled={loading || autoMerging}
            className="gap-1"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            {loading ? 'Verificando...' : 'Verificar'}
          </Button>
        </div>
      </div>

      {/* Report summary */}
      {report && report.total_redundant_contacts > 0 && (
        <Alert className="border-warning bg-warning">
          <AlertOctagon className="h-4 w-4 text-warning-foreground" />
          <AlertTitle className="text-sm text-warning-foreground">
            {report.total_duplicate_groups} grupos com número repetido
          </AlertTitle>
          <AlertDescription className="text-xs text-warning-foreground">
            {report.total_redundant_contacts} contato
            {report.total_redundant_contacts !== 1 ? 's' : ''} redundante
            {report.total_redundant_contacts !== 1 ? 's' : ''}. Use "Mesclar todos" para unificar
            automaticamente (mantém o mais antigo).
          </AlertDescription>
        </Alert>
      )}

      {/* Auto-merge progress */}
      {autoMerging && (
        <div className="space-y-2">
          <Progress value={autoProgress} />
          <p className="animate-pulse text-center text-xs text-muted-foreground">
            Mesclando duplicatas em massa...
          </p>
        </div>
      )}

      {/* No duplicates */}
      {done && groups.length === 0 && !autoMerging && (
        <Alert className="border-primary/20 bg-primary/10">
          <CheckCircle2 className="h-4 w-4 text-primary" />
          <AlertTitle className="text-sm text-primary-foreground">✅ Nenhum duplicado!</AlertTitle>
          <AlertDescription className="text-xs text-primary">
            Todos os contatos têm números únicos.
          </AlertDescription>
        </Alert>
      )}

      {/* Duplicate groups list */}
      <div className="max-h-[480px] space-y-2 overflow-y-auto">
        {groups.map((g) => (
          <div
            key={g.phone_normalized}
            className="flex items-center justify-between gap-2 rounded-lg border p-3 transition-colors hover:bg-muted/30"
          >
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-muted-foreground">
                  {formatPhoneForDisplay(g.phone_normalized) || 'Sem número'}
                </span>
                <Badge variant="outline" className="border-warning text-xs text-warning-foreground">
                  {g.contact_count}× duplicado
                </Badge>
              </div>
              <div className="mt-1 flex flex-wrap gap-1">
                {g.contact_names.map((name) => (
                  <Badge key={name} variant="secondary" className="text-xs">
                    {sanitizeText(name)}
                  </Badge>
                ))}
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => mergeGroup(g)}
              disabled={merging === g.phone_normalized || autoMerging}
              className="shrink-0 gap-1"
            >
              {merging === g.phone_normalized ? (
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <GitMerge className="h-3.5 w-3.5" />
              )}
              Mesclar
            </Button>
          </div>
        ))}

        {groups.length > 0 && (
          <p className="pt-2 text-center text-xs text-muted-foreground">
            Mostrando {groups.length} de {report?.total_duplicate_groups ?? '?'} grupos.
            {(report?.total_duplicate_groups ?? 0) > 100 &&
              ' Use "Mesclar todos" para resolver todos de uma vez.'}
          </p>
        )}
      </div>
    </div>
  );
};

export default DuplicateContactsPanel;
