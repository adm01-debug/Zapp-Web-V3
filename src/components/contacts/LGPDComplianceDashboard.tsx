/**
 * LGPDComplianceDashboard.tsx
 * Real-time LGPD compliance stats for the workspace.
 * Shows consent rate, opt-outs, missing consents.
 */
import React, { useState, useEffect, useCallback } from 'react';
const log = getLogger('LGPDComplianceDashboard');

import { Button } from '@/components/ui/button';
import { getLogger } from '@/lib/logger';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Shield, CheckCircle2, AlertTriangle, RefreshCw,
  TrendingUp, Users, UserCheck, UserX,
} from 'lucide-react';
import { dbRpc } from '@/integrations/datasource/db';
import { RPC } from '@/integrations/datasource/rpcCatalog';

// ── Types ──────────────────────────────────────────────────────────────────

interface ComplianceStats {
  total_active:       number;
  with_consent:       number;
  opted_out:          number;
  without_consent:    number;
  marketing_enabled:  number;
  consent_rate_pct:   number;
}

interface LGPDComplianceDashboardProps {
  workspaceId: string;
  className?:  string;
}

// ── Component ──────────────────────────────────────────────────────────────

export const LGPDComplianceDashboard: React.FC<LGPDComplianceDashboardProps> = ({
  workspaceId, className,
}) => {
  const [stats,   setStats]   = useState<ComplianceStats | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await dbRpc(RPC.getLgpdComplianceStats, {
        p_workspace_id: workspaceId,
      });
      if (error) throw error;
      setStats((data ?? null) as unknown as ComplianceStats | null);
    } catch (err) {
      log.error('Failed to load LGPD compliance stats', err);
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => { load(); }, [load]);

  if (!stats && !loading) return null;

  const rate = stats?.consent_rate_pct ?? 0;
  const isCompliant = rate >= 80;
  const needsAttention = rate < 50;

  return (
    <div className={`rounded-lg border p-4 space-y-4 ${className ?? ''}`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield className="h-4 w-4 text-primary" />
          <span className="font-semibold text-sm">Conformidade LGPD</span>
          <Badge
            variant={isCompliant ? 'default' : needsAttention ? 'destructive' : 'outline'}
            className="text-xs"
          >
            {isCompliant ? '✅ Conforme' : needsAttention ? '⚠️ Atenção' : '📋 Parcial'}
          </Badge>
        </div>
        <Button variant="ghost" size="sm" onClick={load} disabled={loading} className="h-7 w-7 p-0">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {/* Consent rate bar */}
      {stats && (
        <>
          <div className="space-y-1.5">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Taxa de consentimento</span>
              <span className="font-semibold">{rate}%</span>
            </div>
            <Progress
              value={rate}
              className="h-2"
            />
          </div>

          {/* Stat cards */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              {
                icon: <Users className="h-4 w-4 text-muted-foreground" />,
                label: 'Total ativo', value: stats.total_active,
                color: 'text-foreground',
              },
              {
                icon: <UserCheck className="h-4 w-4 text-primary" />,
                label: 'Com consentimento', value: stats.with_consent,
                color: 'text-primary',
              },
              {
                icon: <UserX className="h-4 w-4 text-destructive-foreground" />,
                label: 'Opt-out', value: stats.opted_out,
                color: 'text-destructive-foreground',
              },
              {
                icon: <AlertTriangle className="h-4 w-4 text-warning-foreground" />,
                label: 'Sem consentimento', value: stats.without_consent,
                color: 'text-warning-foreground',
              },
            ].map((card) => (
              <div key={card.label} className="rounded-md bg-muted/30 p-3 text-center space-y-1">
                <div className="flex justify-center">{card.icon}</div>
                <p className={`font-bold text-lg ${card.color}`}>
                  {card.value.toLocaleString('pt-BR')}
                </p>
                <p className="text-xs text-muted-foreground leading-tight">{card.label}</p>
              </div>
            ))}
          </div>

          {/* Marketing stat */}
          {stats.marketing_enabled > 0 && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <TrendingUp className="h-3.5 w-3.5 text-primary shrink-0" />
              <span>
                <span className="font-medium text-foreground">
                  {stats.marketing_enabled.toLocaleString('pt-BR')}
                </span>{' '}
                contatos com marketing habilitado
              </span>
            </div>
          )}

          {/* Recommendations */}
          {stats.without_consent > 0 && (
            <Alert className="border-warning bg-warning">
              <AlertTriangle className="h-4 w-4 text-warning-foreground" />
              <AlertTitle className="text-warning-foreground text-sm">Ação necessária</AlertTitle>
              <AlertDescription className="text-warning-foreground text-xs">
                {stats.without_consent.toLocaleString('pt-BR')} contato{stats.without_consent !== 1 ? 's' : ''} sem
                consentimento LGPD. Colete o consentimento antes de enviar comunicações de marketing.
                (LGPD Art. 7 — Base legal para tratamento)
              </AlertDescription>
            </Alert>
          )}

          {stats.without_consent === 0 && stats.opted_out === 0 && (
            <Alert className="border-primary/20 bg-primary/10">
              <CheckCircle2 className="h-4 w-4 text-primary" />
              <AlertTitle className="text-sm text-primary-foreground">100% em conformidade!</AlertTitle>
              <AlertDescription className="text-xs text-primary">
                Todos os contatos ativos têm consentimento LGPD registrado.
              </AlertDescription>
            </Alert>
          )}
        </>
      )}

      {loading && !stats && (
        <div className="flex items-center gap-2 text-muted-foreground text-sm py-2">
          <RefreshCw className="h-4 w-4 animate-spin" />
          Carregando estatísticas...
        </div>
      )}
    </div>
  );
};

export default LGPDComplianceDashboard;
