import { useQuery } from '@tanstack/react-query';
import { getLogger } from '@/lib/logger';

const log = getLogger('EmailWebhookMonitor');
import { Mail, RefreshCw, CheckCircle, AlertCircle, Clock, Wifi, WifiOff } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { safeClient } from '@/integrations/supabase/safeClient';

interface EmailAccount {
  id: string;
  email_address: string;
  is_active: boolean;
  sync_status: string;
  last_sync_at: string | null;
  last_error: string | null;
  history_id: string | null;
  created_at: string;
}

interface ThreadStats {
  total: number;
  unread: number;
}

export function EmailWebhookMonitor() {
  const { data, isFetching, refetch } = useQuery({
    queryKey: ['admin', 'email-webhook-monitor'],
    queryFn: async () => {
      // Best-effort load: mirrors legacy behavior — failures degrade to empty data
      // (the panel renders an empty state rather than surfacing an error).
      try {
        const { data: emailAccounts } = await safeClient.rpc('get_own_email_accounts');
        const accounts = (emailAccounts || []).map((a: any) => ({ // ignore-audit
          ...a,
          history_id: null,
        })) as EmailAccount[];

        const { count: totalThreads } = await supabase
          .from('email_threads' as any)
          .select('*', { count: 'exact', head: true } as any);

        const { count: unreadThreads } = await supabase
          .from('email_threads' as any)
          .select('*', { count: 'exact', head: true } as any)
          .eq('is_unread', true);

        return {
          accounts,
          stats: { total: totalThreads || 0, unread: unreadThreads || 0 } as ThreadStats,
        };
      } catch (err) {
        log.warn('Failed to load Email data:', err);
        return { accounts: [] as EmailAccount[], stats: { total: 0, unread: 0 } as ThreadStats };
      }
    },
  });

  const accounts = data?.accounts ?? [];
  const stats = data?.stats ?? { total: 0, unread: 0 };
  const loading = isFetching;
  const loadData = () => {
    void refetch();
  };

  const getStatusBadge = (status: string, isActive: boolean) => {
    if (!isActive)
      return (
        <Badge variant="outline" className="text-[10px]">
          Inativo
        </Badge>
      );
    switch (status) {
      case 'synced':
        return (
          <Badge className="border-success/30 bg-success/10 text-[10px] text-success">
            Sincronizado
          </Badge>
        );
      case 'syncing':
        return (
          <Badge className="border-info/30 bg-info/10 text-[10px] text-info">Sincronizando</Badge>
        );
      case 'pending':
        return (
          <Badge className="border-warning/30 bg-warning/10 text-[10px] text-warning">
            Pendente
          </Badge>
        );
      case 'error':
        return (
          <Badge variant="destructive" className="text-[10px]">
            Erro
          </Badge>
        );
      default:
        return (
          <Badge variant="secondary" className="text-[10px]">
            {status}
          </Badge>
        );
    }
  };

  const timeSince = (dateStr: string | null) => {
    if (!dateStr) return 'Nunca';
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Agora';
    if (mins < 60) return `${mins}min atrás`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h atrás`;
    return `${Math.floor(hours / 24)}d atrás`;
  };

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="rounded-xl bg-primary/10 p-2">
          <Mail className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h2 className="text-xl font-bold">Email Webhook Monitor</h2>
          <p className="text-sm text-muted-foreground">
            Status do webhook Pub/Sub e sincronização de emails
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="ml-auto h-8 text-xs"
          onClick={loadData}
          disabled={loading}
        >
          <RefreshCw className={`mr-1 h-3 w-3 ${loading ? 'animate-spin' : ''}`} /> Atualizar
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pb-4 pt-4 text-center">
            <p className="text-2xl font-bold text-primary">{accounts.length}</p>
            <p className="text-xs text-muted-foreground">Contas de Email</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pb-4 pt-4 text-center">
            <p className="text-2xl font-bold text-success">
              {accounts.filter((a) => a.is_active).length}
            </p>
            <p className="text-xs text-muted-foreground">Ativas</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pb-4 pt-4 text-center">
            <p className="text-2xl font-bold text-foreground">{stats.total}</p>
            <p className="text-xs text-muted-foreground">Threads Totais</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pb-4 pt-4 text-center">
            <p className="text-2xl font-bold text-warning">{stats.unread}</p>
            <p className="text-xs text-muted-foreground">Não Lidos</p>
          </CardContent>
        </Card>
      </div>

      {/* Accounts */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Contas & Webhook Status</CardTitle>
        </CardHeader>
        <CardContent>
          {accounts.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Nenhuma conta de Email conectada. Configure em Integrações → Email.
            </p>
          ) : (
            <div className="space-y-3">
              {accounts.map((account) => (
                <div
                  key={account.id}
                  className="flex items-center gap-4 rounded-lg border bg-card p-4"
                >
                  <div className="rounded-lg bg-muted p-2">
                    {account.is_active ? (
                      <Wifi className="h-4 w-4 text-success" />
                    ) : (
                      <WifiOff className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{account.email_address}</p>
                    <div className="mt-1 flex items-center gap-2">
                      <Clock className="h-3 w-3 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">
                        Último sync: {timeSince(account.last_sync_at)}
                      </span>
                      {account.history_id && (
                        <span className="text-xs text-muted-foreground/50">
                          · historyId: {account.history_id}
                        </span>
                      )}
                    </div>
                    {account.last_error && (
                      <div className="mt-1 flex items-center gap-1">
                        <AlertCircle className="h-3 w-3 text-destructive" />
                        <span className="truncate text-xs text-destructive">
                          {account.last_error}
                        </span>
                      </div>
                    )}
                  </div>
                  {getStatusBadge(account.sync_status, account.is_active)}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Webhook Info */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CheckCircle className="h-5 w-5 text-success" /> Configuração do Webhook
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 rounded-lg border bg-muted/50 p-4 text-xs">
            <p className="text-muted-foreground">Endpoint:</p>
            <p className="break-all pl-4 text-foreground/80">
              {import.meta.env.VITE_SUPABASE_URL}/functions/v1/gmail-webhook
            </p>
            <p className="mt-2 text-muted-foreground">Tipo: Google Cloud Pub/Sub Push</p>
            <p className="text-muted-foreground">Eventos: messages.insert (INBOX)</p>
            <p className="text-muted-foreground">Auto-refresh: Token OAuth refresh automático</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
