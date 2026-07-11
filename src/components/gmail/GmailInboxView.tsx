import { useState } from 'react';
import { RefreshCw, Mail, Star, Archive, Search, AlertTriangle, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useEmail, type EmailThread } from '@/hooks/useEmail';
import { EmailLabelSidebar } from './GmailLabelSidebar';
import { EmailAccountSelector } from './GmailAccountSelector';
import { type TokenStatus } from '@/hooks/useGmailOAuthFlow';

interface EmailInboxViewProps {
  onSelectThread?: (thread: EmailThread) => void;
}

function formatDate(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffDays === 0) return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  if (diffDays === 1) return 'Ontem';
  if (diffDays < 7) return d.toLocaleDateString('pt-BR', { weekday: 'short' });
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
}

function SLABadge({ status }: { status: string | null }) {
  if (!status || status === 'ok' || status === 'met') return null;
  return (
    <Badge
      variant={status === 'breached' ? 'destructive' : 'secondary'}
      className="text-xs h-4 px-1"
    >
      {status === 'breached' ? <><AlertTriangle className="h-2.5 w-2.5 mr-0.5" />SLA</> : <><Clock className="h-2.5 w-2.5 mr-0.5" />Prazo</>}
    </Badge>
  );
}

export function EmailInboxView({ onSelectThread }: EmailInboxViewProps) {
  const {
    accounts,
    tokenStatus,
    threads,
    activeAccountId,
    activeAccount,
    activeLabel,
    isSyncing,
    isLoading,
    error,
    unreadCount,
    slaBreachedCount,
    hasTokenWarning,
    hasWatchWarning,
    setActiveAccountId,
    setActiveLabel,
    startOAuth,
    disconnect,
    syncNow,
    markAsRead,
    starThread,
    archiveThread,
  } = useEmail();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const filtered = search.trim()
    ? threads.filter(t =>
        (t.subject ?? '').toLowerCase().includes(search.toLowerCase()) ||
        (t.from_name ?? '').toLowerCase().includes(search.toLowerCase()) ||
        (t.from_email ?? '').toLowerCase().includes(search.toLowerCase()) ||
        (t.snippet ?? '').toLowerCase().includes(search.toLowerCase())
      )
    : threads;

  const handleSelectThread = (thread: EmailThread) => {
    setSelectedId(thread.id);
    if (thread.unread_count > 0) markAsRead(thread.id, true);
    onSelectThread?.(thread);
  };

  // Estado: sem contas
  if (!isLoading && accounts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 p-6">
        <Mail className="h-12 w-12 text-muted-foreground/30" />
        <div className="text-center">
          <p className="font-semibold text-base">Nenhuma conta de Email conectada</p>
          <p className="text-sm text-muted-foreground mt-1">
            Conecte sua conta de Email para usar o Chat de Email
          </p>
        </div>
        <Button onClick={startOAuth} className="gap-2">
          <Mail className="h-4 w-4" />
          Conectar Email
        </Button>
      </div>
    );
  }

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex h-full overflow-hidden">

        {/* Sidebar de Labels */}
        <div className="w-52 shrink-0 border-r bg-background/50 overflow-hidden">
          {/* Seletor de conta */}
          {accounts.length > 0 && (
            <div className="p-2 border-b">
              <EmailAccountSelector
                accounts={accounts}
                activeAccountId={activeAccountId}
                tokenStatus={Object.fromEntries(tokenStatus.map(s => [s.account_id, s.token_status])) as Record<string, TokenStatus>}
                isSyncing={isSyncing}
                onSelectAccount={setActiveAccountId}
                onAddAccount={startOAuth}
                onDisconnect={disconnect}
                onSync={syncNow}
              />
            </div>
          )}
          {/* Avisos de token/watch */}
          {(hasTokenWarning || hasWatchWarning) && (
            <div className="px-2 py-1.5 bg-warning dark:bg-warning/30 border-b text-xs text-warning-foreground dark:text-warning-foreground flex items-center gap-1.5">
              <AlertTriangle className="h-3 w-3 shrink-0" />
              {hasTokenWarning ? 'Token expirado' : 'Watch expirando'}
            </div>
          )}
          <EmailLabelSidebar
            accountId={activeAccountId}
            activeLabel={activeLabel}
            unreadCounts={{ INBOX: unreadCount }}
            onSelectLabel={setActiveLabel}
          />
        </div>

        {/* Lista de threads */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-2.5 border-b bg-background/95 shrink-0">
            <div className="flex items-center gap-2">
              <h2 className="font-semibold text-sm capitalize">
                {activeLabel.toLowerCase()}
              </h2>
              {unreadCount > 0 && (
                <Badge variant="default" className="text-xs h-5 px-1.5">{unreadCount}</Badge>
              )}
              {slaBreachedCount > 0 && (
                <Badge variant="destructive" className="text-xs h-5 px-1.5 gap-1">
                  <AlertTriangle className="h-2.5 w-2.5" />{slaBreachedCount} SLA
                </Badge>
              )}
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => syncNow()}
              disabled={isSyncing}
              className="gap-1.5 h-7 text-xs"
            >
              <RefreshCw className={`h-3 w-3 ${isSyncing ? 'animate-spin' : ''}`} />
              {isSyncing ? 'Sync...' : 'Atualizar'}
            </Button>
          </div>

          {/* Busca */}
          <div className="px-3 py-2 border-b shrink-0">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Buscar emails..."
                className="pl-8 h-7 text-sm"
              />
            </div>
          </div>

          {/* Erro */}
          {error && (
            <div className="px-3 py-2 text-xs text-destructive bg-destructive/10 shrink-0">
              {error}
            </div>
          )}

          {/* Threads */}
          <ScrollArea className="flex-1">
            {isLoading ? (
              <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
                Carregando...
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-32 text-sm text-muted-foreground gap-2">
                <Mail className="h-8 w-8 opacity-20" />
                {search ? 'Nenhum resultado' : 'Nenhum email'}
              </div>
            ) : (
              <div>
                {filtered.map((thread, idx) => (
                  <div key={thread.id}>
                    <div
                      className={`group relative flex items-start gap-3 px-4 py-3 cursor-pointer transition-colors
                        ${selectedId === thread.id ? 'bg-primary/5' : 'hover:bg-muted/50'}
                        ${thread.unread_count > 0 ? 'bg-primary/30 dark:bg-primary/10' : ''}
                      `}
                      onClick={() => handleSelectThread(thread)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={e => e.key === 'Enter' && handleSelectThread(thread)}
                    >
                      {/* Avatar letra */}
                      <div className={`h-8 w-8 rounded-full shrink-0 flex items-center justify-center text-xs font-bold text-foreground
                        ${thread.unread_count > 0 ? 'bg-primary' : 'bg-muted-foreground/30'}`}
                      >
                        {(thread.from_name ?? thread.from_email ?? '?')[0].toUpperCase()}
                      </div>

                      {/* Conteúdo */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className={`text-sm truncate ${thread.unread_count > 0 ? 'font-semibold' : 'text-muted-foreground'}`}>
                            {thread.from_name ?? thread.from_email ?? 'Desconhecido'}
                          </span>
                          <div className="flex items-center gap-1 shrink-0">
                            <SLABadge status={thread.sla_status} />
                            <span className="text-xs text-muted-foreground">
                              {formatDate(thread.last_message_at)}
                            </span>
                          </div>
                        </div>
                        <p className={`text-sm mt-0.5 truncate ${thread.unread_count > 0 ? 'font-medium text-foreground' : 'text-muted-foreground'}`}>
                          {thread.subject ?? '(sem assunto)'}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">
                          {thread.snippet}
                        </p>
                      </div>

                      {/* Ações rápidas (aparecem no hover) */}
                      <div className="absolute right-2 top-1/2 -translate-y-1/2 hidden group-hover:flex items-center gap-1 bg-background/90 rounded shadow-sm px-1 py-0.5">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              onClick={e => { e.stopPropagation(); starThread(thread.id, !thread.is_starred); }}
                              className={`p-1 rounded hover:bg-muted ${thread.is_starred ? 'text-warning' : 'text-muted-foreground'}`}
                              aria-label={thread.is_starred ? 'Remover favorito' : 'Adicionar favorito'}
                            >
                              <Star className="h-3.5 w-3.5" fill={thread.is_starred ? 'currentColor' : 'none'} />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent side="bottom" className="text-xs">
                            {thread.is_starred ? 'Remover favorito' : 'Favoritar'}
                          </TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              onClick={e => { e.stopPropagation(); archiveThread(thread.id); }}
                              className="p-1 rounded hover:bg-muted text-muted-foreground"
                              aria-label="Arquivar thread"
                            >
                              <Archive className="h-3.5 w-3.5" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent side="bottom" className="text-xs">Arquivar</TooltipContent>
                        </Tooltip>
                      </div>
                    </div>
                    {idx < filtered.length - 1 && <Separator className="ml-15" />}
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </div>
      </div>
    </TooltipProvider>
  );
}

export default EmailInboxView;
