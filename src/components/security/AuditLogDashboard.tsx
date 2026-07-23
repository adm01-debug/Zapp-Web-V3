import { useState, useEffect } from 'react';
import { useMountedRef } from '@/hooks/useMountedRef';
import { motion } from 'framer-motion';
import {
  FileText,
  Search,
  Filter,
  Calendar,
  User,
  Globe,
  AlertTriangle,
  Shield,
  Activity,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { format } from 'date-fns';
import { fetchAuditLogs, type AuditLog } from '@/hooks/useAuditLogsDashboard';
import { ptBR } from 'date-fns/locale';

const ACTION_COLORS: Record<string, string> = {
  login: 'bg-success/10 text-success',
  logout: 'bg-muted text-muted-foreground',
  create: 'bg-info/10 text-info',
  update: 'bg-warning/10 text-warning',
  delete: 'bg-destructive/10 text-destructive',
  export: 'bg-secondary/10 text-secondary',
  mfa_enabled: 'bg-success/10 text-success',
  mfa_disabled: 'bg-destructive/10 text-destructive',
  password_change: 'bg-warning/10 text-warning',
  role_change: 'bg-accent/10 text-accent-foreground',
};

const ACTION_ICONS: Record<string, typeof Shield> = {
  login: User,
  logout: User,
  create: FileText,
  update: FileText,
  delete: AlertTriangle,
  mfa_enabled: Shield,
  mfa_disabled: Shield,
  password_change: Shield,
  role_change: Shield,
};

/** Audit Log Dashboard component for the security section. */
export function AuditLogDashboard() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState<string>('all');
  const [entityFilter, setEntityFilter] = useState<string>('all');
  const [stats, setStats] = useState({ total: 0, today: 0, suspicious: 0, uniqueUsers: 0 });
  const mountedRef = useMountedRef();

  useEffect(() => {
    fetchLogs();
  }, [actionFilter, entityFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const data = await fetchAuditLogs(
        actionFilter !== 'all' ? actionFilter : '',
        entityFilter !== 'all' ? entityFilter : '',
      );
      if (!mountedRef.current) return;
      setLogs(data);

      const today = new Date().toISOString().split('T')[0];
      const todayLogs = data.filter((l) => l.created_at.startsWith(today));
      const uniqueUsers = new Set(data.map((l) => l.user_id).filter(Boolean));
      const suspicious = data.filter(
        (l) =>
          l.action.includes('delete') ||
          l.action.includes('role_change') ||
          l.action.includes('export')
      );

      setStats({
        total: data.length,
        today: todayLogs.length,
        suspicious: suspicious.length,
        uniqueUsers: uniqueUsers.size,
      });
    } catch {
      // silently ignore
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  };

  const filteredLogs = logs.filter((log) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      log.action.toLowerCase().includes(s) ||
      log.entity_type?.toLowerCase().includes(s) ||
      log.ip_address?.includes(s) ||
      log.user_id?.includes(s)
    );
  });

  const getActionColor = (action: string) => {
    for (const [key, color] of Object.entries(ACTION_COLORS)) {
      if (action.includes(key)) return color;
    }
    return 'bg-muted text-muted-foreground';
  };

  const getActionIcon = (action: string) => {
    for (const [key, Icon] of Object.entries(ACTION_ICONS)) {
      if (action.includes(key)) return Icon;
    }
    return Activity;
  };

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {[
          { label: 'Total de Logs', value: stats.total, icon: FileText, color: 'text-primary' },
          { label: 'Hoje', value: stats.today, icon: Calendar, color: 'text-success' },
          {
            label: 'Ações Sensíveis',
            value: stats.suspicious,
            icon: AlertTriangle,
            color: 'text-destructive',
          },
          { label: 'Usuários Únicos', value: stats.uniqueUsers, icon: User, color: 'text-info' },
        ].map((stat) => (
          <Card key={stat.label}>
            <CardContent className="pb-4 pt-4">
              <div className="flex items-center gap-3">
                <stat.icon className={`h-5 w-5 ${stat.color}`} />
                <div>
                  <p className="text-2xl font-bold">{stat.value}</p>
                  <p className="text-xs text-muted-foreground">{stat.label}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Filtros
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            <div className="min-w-[200px] flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Buscar por ação, IP, usuário..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <Select value={actionFilter} onValueChange={setActionFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Tipo de ação" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as ações</SelectItem>
                <SelectItem value="login">Login</SelectItem>
                <SelectItem value="logout">Logout</SelectItem>
                <SelectItem value="create">Criação</SelectItem>
                <SelectItem value="update">Atualização</SelectItem>
                <SelectItem value="delete">Exclusão</SelectItem>
                <SelectItem value="export">Exportação</SelectItem>
              </SelectContent>
            </Select>
            <Select value={entityFilter} onValueChange={setEntityFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Entidade" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                <SelectItem value="contact">Contatos</SelectItem>
                <SelectItem value="message">Mensagens</SelectItem>
                <SelectItem value="campaign">Campanhas</SelectItem>
                <SelectItem value="user">Usuários</SelectItem>
                <SelectItem value="settings">Configurações</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Logs */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Logs de Auditoria ({filteredLogs.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[500px]">
            <div className="space-y-2">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="h-16 animate-pulse rounded-lg bg-muted/50" />
                ))
              ) : filteredLogs.length === 0 ? (
                <p className="py-8 text-center text-muted-foreground">Nenhum log encontrado</p>
              ) : (
                filteredLogs.map((log) => {
                  const Icon = getActionIcon(log.action);
                  return (
                    <motion.div
                      key={log.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      className="flex items-center gap-3 rounded-lg bg-muted/30 p-3 transition-colors hover:bg-muted/50"
                    >
                      <div className={`rounded-lg p-2 ${getActionColor(log.action)}`}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">{log.action}</span>
                          {log.entity_type && (
                            <Badge variant="outline" className="text-xs">
                              {log.entity_type}
                            </Badge>
                          )}
                        </div>
                        <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                          <span>
                            {format(new Date(log.created_at), 'dd/MM/yyyy HH:mm:ss', {
                              locale: ptBR,
                            })}
                          </span>
                          {log.ip_address && (
                            <>
                              <span>•</span>
                              <span className="flex items-center gap-1">
                                <Globe className="h-3 w-3" />
                                {log.ip_address}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                      {log.details && (
                        <Badge variant="secondary" className="shrink-0 text-xs">
                          +detalhes
                        </Badge>
                      )}
                    </motion.div>
                  );
                })
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
