import { useState, useMemo, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import {
  QrCode, RefreshCw, CheckCircle2, XCircle, Clock, AlertTriangle, Loader2, Search,
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import { toast } from 'sonner';

interface QrAttempt {
  id: string;
  connection_id: string | null;
  instance_id: string;
  connection_name: string | null;
  status: 'pending' | 'connected' | 'expired' | 'error';
  error_message: string | null;
  connected_at: string | null;
  expired_at: string | null;
  created_at: string;
  requested_by: string | null;
}

const statusConfig: Record<QrAttempt['status'], { label: string; icon: typeof CheckCircle2; cls: string }> = {
  pending: { label: 'Pendente', icon: Clock, cls: 'text-warning bg-warning/10 border-warning/30' },
  connected: { label: 'Conectado', icon: CheckCircle2, cls: 'text-success bg-success/10 border-success/30' },
  expired: { label: 'Expirado', icon: AlertTriangle, cls: 'text-muted-foreground bg-muted/40 border-border' },
  error: { label: 'Erro', icon: XCircle, cls: 'text-destructive bg-destructive/10 border-destructive/30' },
};

/** Admin panel: latest QR Code attempts per WhatsApp instance with re-trigger action. */
export function QrAttemptsPanel() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<'all' | QrAttempt['status']>('all');
  const [instanceFilter, setInstanceFilter] = useState<string>('all');
  const [search, setSearch] = useState('');

  const { data: attempts = [], isFetching: loading, refetch } = useQuery<QrAttempt[]>({
    queryKey: ['admin', 'qr-attempts', statusFilter, instanceFilter],
    queryFn: async () => {
      let q = supabase
        .from('qr_attempts')
        .select('id, connection_id, instance_id, connection_name, status, error_message, connected_at, expired_at, created_at, requested_by')
        .order('created_at', { ascending: false })
        .limit(200);
      if (statusFilter !== 'all') q = q.eq('status', statusFilter);
      if (instanceFilter !== 'all') q = q.eq('instance_id', instanceFilter);
      const { data, error } = await q;
      if (error) {
        toast.error('Falha ao carregar histórico de QR.');
        throw error;
      }
      return (data || []) as QrAttempt[];
    },
  });

  // Realtime: invalidate on any attempt change.
  useEffect(() => {
    const channel = supabase
      .channel('qr-attempts-admin')
      .on('postgres_changes', { event: '*', schema: 'zapp', table: 'qr_attempts' }, () => {
        void queryClient.invalidateQueries({ queryKey: ['admin', 'qr-attempts'] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

  const instances = useMemo(() => {
    const set = new Set<string>();
    attempts.forEach((a) => set.add(a.instance_id));
    return Array.from(set).sort();
  }, [attempts]);

  const filtered = useMemo(() => {
    if (!search.trim()) return attempts;
    const q = search.toLowerCase();
    return attempts.filter((a) =>
      a.instance_id.toLowerCase().includes(q) ||
      (a.connection_name || '').toLowerCase().includes(q) ||
      (a.error_message || '').toLowerCase().includes(q)
    );
  }, [attempts, search]);

  const stats = useMemo(() => {
    const total = attempts.length;
    const connected = attempts.filter((a) => a.status === 'connected').length;
    const expired = attempts.filter((a) => a.status === 'expired').length;
    const error = attempts.filter((a) => a.status === 'error').length;
    return { total, connected, expired, error };
  }, [attempts]);

  /** Navigate to connections view with deep-link to auto-open the QR dialog. */
  const handleRegenerate = (instance: string) => {
    const url = new URL(window.location.href);
    url.searchParams.set('view', 'connections');
    url.searchParams.set('qr', instance);
    window.history.pushState({}, '', url.toString());
    window.dispatchEvent(new CustomEvent('navigate-view', { detail: 'connections' }));
    toast.info(`Abrindo gerador de QR para "${instance}"...`);
  };

  return (
    <div className="space-y-4">
      {/* Header / stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="border-border/50">
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground flex items-center gap-1.5"><QrCode className="w-3.5 h-3.5" />Total (últimas)</p>
            <p className="text-2xl font-bold mt-1">{stats.total}</p>
          </CardContent>
        </Card>
        <Card className="border-border/50">
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-success flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5" />Conectados</p>
            <p className="text-2xl font-bold mt-1">{stats.connected}</p>
          </CardContent>
        </Card>
        <Card className="border-border/50">
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5" />Expirados</p>
            <p className="text-2xl font-bold mt-1">{stats.expired}</p>
          </CardContent>
        </Card>
        <Card className="border-border/50">
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-destructive flex items-center gap-1.5"><XCircle className="w-3.5 h-3.5" />Erros</p>
            <p className="text-2xl font-bold mt-1">{stats.error}</p>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/50">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <QrCode className="w-4 h-4 text-primary" />
                Tentativas de QR Code
              </CardTitle>
              <CardDescription>Últimas 200 tentativas — atualizado em tempo real</CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar instância..."
                  className="pl-8 h-9 w-[180px]"
                />
              </div>
              <Select value={instanceFilter} onValueChange={setInstanceFilter}>
                <SelectTrigger className="h-9 w-[160px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas instâncias</SelectItem>
                  {instances.map((i) => <SelectItem key={i} value={i}>{i}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)} // ignore-audit: Select/Tabs value string narrowed to union; developer controls option values>
                <SelectTrigger className="h-9 w-[140px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos status</SelectItem>
                  <SelectItem value="pending">Pendente</SelectItem>
                  <SelectItem value="connected">Conectado</SelectItem>
                  <SelectItem value="expired">Expirado</SelectItem>
                  <SelectItem value="error">Erro</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" onClick={() => void refetch()} disabled={loading}>
                {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {loading && attempts.length === 0 ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-5 h-5 animate-spin text-primary" />
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-12">
              Nenhuma tentativa de QR registrada{statusFilter !== 'all' ? ` com status "${statusFilter}"` : ''}.
            </p>
          ) : (
            <ScrollArea className="h-[480px] pr-3">
              <div className="space-y-2">
                {filtered.map((a) => {
                  const cfg = statusConfig[a.status];
                  const Icon = cfg.icon;
                  return (
                    <motion.div
                      key={a.id}
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={cn(
                        'flex items-center gap-3 p-3 rounded-lg border transition-colors',
                        'hover:bg-muted/40'
                      )}
                    >
                      <Icon className={cn('w-4 h-4 flex-shrink-0', cfg.cls.split(' ')[0])} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm truncate">{a.connection_name || a.instance_id}</span>
                          <Badge variant="outline" className={cn('text-[10px] border', cfg.cls)}>
                            {cfg.label}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {a.instance_id} ·{' '}
                          <span title={format(new Date(a.created_at), "dd/MM/yyyy HH:mm:ss", { locale: ptBR })}>
                            {formatDistanceToNow(new Date(a.created_at), { addSuffix: true, locale: ptBR })}
                          </span>
                          {a.connected_at && (
                            <> · conectou {formatDistanceToNow(new Date(a.connected_at), { addSuffix: true, locale: ptBR })}</>
                          )}
                          {a.expired_at && (
                            <> · expirou {formatDistanceToNow(new Date(a.expired_at), { addSuffix: true, locale: ptBR })}</>
                          )}
                          {a.error_message && (
                            <> · <span className="text-destructive">{a.error_message}</span></>
                          )}
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleRegenerate(a.instance_id)}
                        className="flex-shrink-0"
                      >
                        <RefreshCw className="w-3.5 h-3.5 mr-1.5" />Gerar novamente
                      </Button>
                    </motion.div>
                  );
                })}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
