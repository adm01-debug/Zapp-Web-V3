import { useEffect, useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { ShieldCheck, Database, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';
import { safeClient } from '@/integrations/supabase/safeClient';

/**
 * Audit Evidence Dashboard — evidências REAIS de auditoria carregadas do banco.
 *
 * Fontes:
 * - v_security_audit  → estado real de RLS / SECURITY DEFINER / políticas por objeto.
 * - audit_results     → execuções de auditoria registradas (nome + data).
 *
 * Quando o banco não responde ou não há registros, exibe "dados indisponíveis"
 * em vez de números fictícios.
 */

interface SecurityAuditRow {
  name: string | null;
  object_type: string | null;
  policy_count: number | null;
  rls_enabled: boolean | null;
  security_definer: boolean | null;
  status: string | null;
  subtype: string | null;
  anon_blocked: boolean | null;
}

interface AuditRunRow {
  audit_name: string | null;
  created_at: string | null;
}

type LoadState = 'loading' | 'ready' | 'unavailable';

const AuditEvidenceDashboard = () => {
  const [state, setState] = useState<LoadState>('loading');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [evidenceRows, setEvidenceRows] = useState<SecurityAuditRow[]>([]);
  const [auditRuns, setAuditRuns] = useState<AuditRunRow[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setState('loading');
      try {
        const [secResult, runsResult] = await Promise.all([
          safeClient.from<SecurityAuditRow>('v_security_audit', (q) =>
            q.select('*').order('name', { ascending: true }).limit(30)
          ),
          safeClient.from<AuditRunRow>('audit_results', (q) =>
            q.select('audit_name, created_at').order('created_at', { ascending: false }).limit(10)
          ),
        ]);

        if (cancelled) return;

        if (secResult.error || runsResult.error) {
          setState('unavailable');
          setErrorMessage(
            secResult.error?.message || runsResult.error?.message || 'Erro ao consultar o banco.'
          );
          return;
        }

        setEvidenceRows((secResult.data as SecurityAuditRow[] | null) || []);
        setAuditRuns((runsResult.data as AuditRunRow[] | null) || []);
        setState('ready');
      } catch (err: unknown) {
        if (cancelled) return;
        setState('unavailable');
        setErrorMessage(err instanceof Error ? err.message : String(err));
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const hasData = evidenceRows.length > 0 || auditRuns.length > 0;

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <ShieldCheck className="w-8 h-8 text-primary" />
          Dashboard de Evidências de Auditoria
        </h1>
        <Badge variant="outline" className="text-sm">
          <Database className="w-3 h-3 mr-1" /> Dados reais do banco
        </Badge>
      </div>

      {state === 'loading' && (
        <Card>
          <CardContent className="flex items-center justify-center gap-3 p-10 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span>Carregando evidências de auditoria...</span>
          </CardContent>
        </Card>
      )}

      {state === 'unavailable' && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Dados indisponíveis</AlertTitle>
          <AlertDescription className="space-y-1 text-xs">
            <p>
              Não foi possível carregar as evidências do banco de dados. Nenhum número é exibido
              sem origem real.
            </p>
            {errorMessage && <p className="font-mono">Erro: {errorMessage}</p>}
          </AlertDescription>
        </Alert>
      )}

      {state === 'ready' && !hasData && (
        <Alert>
          <Database className="h-4 w-4" />
          <AlertTitle>Nenhuma evidência registrada</AlertTitle>
          <AlertDescription className="text-xs">
            As views <code>v_security_audit</code> e <code>audit_results</code> não retornaram
            registros. Execute uma auditoria no banco para popular este dashboard.
          </AlertDescription>
        </Alert>
      )}

      {state === 'ready' && evidenceRows.length > 0 && (
        <div>
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted-foreground">
            Evidências de Segurança ({evidenceRows.length}) — v_security_audit
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {evidenceRows.map((ev) => {
              const isTable = ev.object_type === 'table' || ev.object_type === 'TABLE';
              const rlsOk = ev.rls_enabled !== false;
              return (
                <Card
                  key={`${ev.object_type}-${ev.name}`}
                  className="border-l-4 border-l-primary"
                >
                  <CardHeader className="pb-2">
                    <div className="flex justify-between items-start gap-2">
                      <Badge variant="secondary">{ev.object_type || 'objeto'}</Badge>
                      {rlsOk ? (
                        <CheckCircle2 className="w-5 h-5 text-success" />
                      ) : (
                        <AlertTriangle className="w-5 h-5 text-warning" />
                      )}
                    </div>
                    <CardTitle className="text-base mt-2 break-all">{ev.name}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2 text-xs">
                      {isTable && (
                        <Badge variant={rlsOk ? 'default' : 'destructive'}>
                          {rlsOk ? 'RLS Ativo' : 'RLS DESATIVADO'}
                        </Badge>
                      )}
                      {ev.security_definer && (
                        <Badge variant="outline">SECURITY DEFINER</Badge>
                      )}
                      {ev.anon_blocked && <Badge variant="outline">anon bloqueado</Badge>}
                      {ev.subtype && (
                        <p className="text-muted-foreground">
                          Subtipo: <code>{ev.subtype}</code>
                        </p>
                      )}
                      {ev.policy_count !== null && ev.policy_count !== undefined && (
                        <p className="text-muted-foreground">
                          {ev.policy_count} polic{ev.policy_count === 1 ? 'y' : 'ies'} de RLS
                        </p>
                      )}
                      {ev.status && (
                        <p className="text-muted-foreground">Status: {ev.status}</p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {state === 'ready' && auditRuns.length > 0 && (
        <div>
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted-foreground">
            Auditorias Registradas ({auditRuns.length}) — audit_results
          </h2>
          <Card>
            <CardContent className="divide-y divide-border">
              {auditRuns.map((run) => (
                <div
                  key={`${run.audit_name}-${run.created_at}`}
                  className="flex items-center justify-between gap-3 py-3"
                >
                  <span className="text-sm font-medium break-all">{run.audit_name}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {run.created_at
                      ? new Date(run.created_at).toLocaleString('pt-BR')
                      : 'data não registrada'}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}

      {state === 'ready' && hasData && (
        <p className="text-xs text-muted-foreground">
          Evidências carregadas em tempo real de <code>v_security_audit</code> e{' '}
          <code>audit_results</code> — nenhum valor estático.
        </p>
      )}
    </div>
  );
};

/** React component: Audit Evidence Dashboard. */
export default AuditEvidenceDashboard;
