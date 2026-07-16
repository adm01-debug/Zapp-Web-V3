import { useMemo, useState, useEffect, useRef } from 'react';
import { queryKeys } from '@/services/api/queryKeys';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { unwrapRows } from '@/lib/supabase-helpers';
import { useVersions, type Version } from '../hooks/useVersions';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, History, RotateCcw, Search, User } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface AgentRow {
  id: string;
  name: string | null;
  email: string | null;
  avatar_url: string | null;
  job_title: string | null;
  department: string | null;
  role: string | null;
  is_active: boolean | null;
  updated_at: string | null;
}

function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  try {
    return format(new Date(value), "dd 'de' MMM 'de' yyyy 'às' HH:mm", { locale: ptBR });
  } catch {
    return value;
  }
}

function VersionCard({
  version,
  isCurrent,
  onRestore,
  restoring,
}: {
  version: Version;
  isCurrent: boolean;
  onRestore: () => void;
  restoring: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const entries = Object.entries(version.data || {});

  return (
    <Card className="border-border/60">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-sm">
              Versão #{version.version_number}
              {isCurrent && (
                <Badge variant="default" className="text-xs">
                  Atual
                </Badge>
              )}
            </CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">{formatDate(version.created_at)}</p>
            {version.change_summary && (
              <p className="mt-1 text-xs italic text-muted-foreground">{version.change_summary}</p>
            )}
          </div>
          {!isCurrent && (
            <Button size="sm" variant="outline" onClick={onRestore} disabled={restoring}>
              {restoring ? (
                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
              ) : (
                <RotateCcw className="mr-1 h-3 w-3" />
              )}
              Restaurar
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <Button
          variant="ghost"
          size="sm"
          className="h-auto p-1 text-xs"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? 'Ocultar' : 'Ver'} metadados ({entries.length})
        </Button>
        {expanded && (
          <div className="mt-2 grid gap-1.5 text-xs">
            {entries.map(([key, value]) => (
              <div key={key} className="flex gap-2 border-b border-border/40 pb-1">
                <span className="min-w-[140px] font-medium text-muted-foreground">{key}</span>
                <span className="break-all text-foreground">
                  {typeof value === 'object' ? JSON.stringify(value) : String(value ?? '—')}
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function AgentVersionsPanel() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const { data: agents = [], isLoading: loadingAgents } = useQuery({
    queryKey: queryKeys.adminOps.agentVersions(),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, name, email, avatar_url, job_title, department, role, is_active, updated_at')
        .order('name', { ascending: true });
      if (error) throw error;
      return unwrapRows<AgentRow>(data);
    },
  });

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return agents;
    return agents.filter(
      (a) =>
        a.name?.toLowerCase().includes(term) ||
        a.email?.toLowerCase().includes(term) ||
        a.department?.toLowerCase().includes(term) ||
        a.job_title?.toLowerCase().includes(term)
    );
  }, [agents, search]);

  const selected = agents.find((a) => a.id === selectedId) || null;

  const {
    versions,
    isLoading: loadingVersions,
    restoreVersion,
    currentVersion,
  } = useVersions('profiles', selectedId || '');
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const restoreTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (restoreTimerRef.current) clearTimeout(restoreTimerRef.current);
    },
    []
  );

  const handleRestore = (versionId: string) => {
    setRestoringId(versionId);
    restoreVersion(versionId);
    if (restoreTimerRef.current) clearTimeout(restoreTimerRef.current);
    restoreTimerRef.current = setTimeout(() => setRestoringId(null), 1500);
  };

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[320px_1fr]">
      <Card className="bg-card">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <User className="h-4 w-4" /> Agentes ({filtered.length})
          </CardTitle>
          <div className="relative mt-2">
            <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar agente..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 pl-8"
            />
          </div>
        </CardHeader>
        <CardContent className="p-2">
          <ScrollArea className="h-[560px]">
            {loadingAgents ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : filtered.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Nenhum agente encontrado.
              </p>
            ) : (
              <div className="space-y-1">
                {filtered.map((agent) => (
                  <button
                    type="button"
                    key={agent.id}
                    onClick={() => setSelectedId(agent.id)}
                    className={`flex w-full items-center gap-3 rounded-md p-2 text-left transition-colors ${
                      selectedId === agent.id
                        ? 'bg-accent text-accent-foreground'
                        : 'hover:bg-accent/50'
                    }`}
                  >
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={agent.avatar_url || undefined} alt={agent.name || ''} />
                      <AvatarFallback className="text-xs">
                        {agent.name?.[0]?.toUpperCase() || 'U'}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{agent.name || 'Sem nome'}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {agent.job_title || agent.email || '—'}
                      </p>
                    </div>
                    {agent.is_active === false && (
                      <Badge variant="secondary" className="text-[10px]">
                        Inativo
                      </Badge>
                    )}
                  </button>
                ))}
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>

      <Card className="bg-card">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <History className="h-4 w-4" />
            {selected ? `Histórico — ${selected.name}` : 'Selecione um agente'}
          </CardTitle>
          {selected && (
            <p className="text-xs text-muted-foreground">
              {selected.email} · {selected.role || 'sem role'} · Última atualização:{' '}
              {formatDate(selected.updated_at)}
            </p>
          )}
        </CardHeader>
        <CardContent>
          {!selected ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <History className="mb-3 h-10 w-10 opacity-40" />
              <p className="text-sm">Escolha um agente na lista para ver suas versões.</p>
            </div>
          ) : loadingVersions ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : versions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <History className="mb-3 h-10 w-10 opacity-40" />
              <p className="text-sm">Nenhuma versão registrada para este agente ainda.</p>
              <p className="mt-1 text-xs">
                As versões são criadas automaticamente conforme o perfil é editado.
              </p>
            </div>
          ) : (
            <ScrollArea className="h-[560px] pr-3">
              <div className="space-y-3">
                {versions.map((version) => (
                  <VersionCard
                    key={version.id}
                    version={version}
                    isCurrent={currentVersion?.id === version.id}
                    onRestore={() => handleRestore(version.id)}
                    restoring={restoringId === version.id}
                  />
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
