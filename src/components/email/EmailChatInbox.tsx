import { Mail, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { cn } from '@/lib/utils';
import { useEmail } from '@/hooks/useEmail';
import { EmailThreadList } from './EmailThreadList';
import { EmailChatThread } from './EmailChatThread';
import { EmailSearchBar } from './EmailSearchBar';
import { EmailAccountSelector } from '../gmail/GmailAccountSelector';
import { type EmailSearchResult } from '@/hooks/useEmailSearch';
import { type TokenStatus } from '@/hooks/useGmailOAuthFlow';

interface EmailChatInboxProps {
  className?: string;
}

export function EmailChatInbox({ className }: EmailChatInboxProps) {
  const {
    threads,
    selectedThread,
    messages,
    isLoadingThreads,
    isLoadingMessages,
    isSyncing,
    hasMore,
    error,
    activeAccountId,
    accounts,
    tokenStatus,
    selectThread,
    setActiveAccountId,
    syncNow,
    loadMore,
    startOAuth,
    disconnect,
  } = useEmail();

  const totalUnread = threads.filter(t => t.unread_count > 0).length;

  // Quando busca seleciona uma thread
  const handleSearchSelect = (result: EmailSearchResult) => {
    const thread = threads.find(t => t.id === result.id || t.thread_id === result.thread_id);
    if (thread) selectThread(thread);
    // Se não estiver no cache local, poderia fazer fetch pelo threadId
  };

  // Sem contas conectadas
  if (accounts.length === 0) {
    return (
      <div className={cn('flex flex-col items-center justify-center h-full gap-6 p-8 bg-sidebar/30 animate-in fade-in duration-500', className)}>
        <div className="flex flex-col items-center gap-4">
          <div className="relative">
            <div className="h-20 w-20 rounded-[22px] bg-primary/10 flex items-center justify-center animate-pulse">
              <Mail className="h-10 w-10 text-primary" />
            </div>
            <div className="absolute -top-1 -right-1 h-5 w-5 bg-primary rounded-full border-2 border-background animate-bounce" />
          </div>
          <div className="text-center space-y-2">
            <h3 className="font-bold text-2xl tracking-tight font-display">Email não conectado</h3>
            <p className="text-muted-foreground text-sm max-w-[320px] leading-relaxed">
              Conecte sua conta Email para gerenciar e-mails diretamente pela plataforma, com interface de chat.
            </p>
          </div>
        </div>

        <Button 
          onClick={startOAuth} 
          className="gap-2.5 h-12 px-8 rounded-xl font-semibold shadow-lg shadow-primary/20 transition-all hover:scale-[1.02] active:scale-[0.98]"
        >
          <Mail className="h-5 w-5" />
          Conectar Email
        </Button>

        <p className="text-[11px] font-medium text-muted-foreground/60 text-center max-w-[280px]">
          Sincronização segura via Google OAuth2. <br/>Acesso direto e privado às suas mensagens.
        </p>
      </div>
    );
  }

  return (
    <div className={cn('flex h-full overflow-hidden', className)}>
      {/* Sidebar: Thread list */}
      <div className="hidden md:flex w-[340px] shrink-0 flex-col border-r h-full bg-background/50">
        {/* Account selector + search */}
        <div className="p-3 space-y-3 border-b bg-muted/5">
          <EmailAccountSelector
            accounts={accounts}
            activeAccountId={activeAccountId}
            tokenStatus={Object.fromEntries(tokenStatus.map(s => [s.account_id, s.token_status])) as Record<string, TokenStatus>}
            isSyncing={isSyncing}
            onSelectAccount={setActiveAccountId}
            onAddAccount={startOAuth}
            onDisconnect={disconnect}
            onSync={syncNow}
            totalUnread={totalUnread}
          />
          <EmailSearchBar
            accountId={activeAccountId}
            onSelectThread={handleSearchSelect}
          />
        </div>

        {/* Error */}
        {error && (
          <Alert variant="destructive" className="mx-3 mt-2">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="text-xs">{error}</AlertDescription>
          </Alert>
        )}

        {/* Thread list */}
        <EmailThreadList
          threads={threads}
          selectedThreadId={selectedThread?.id}
          accountId={activeAccountId}
          isLoading={isLoadingThreads}
          hasMore={hasMore}
          onSelectThread={selectThread}
          onLoadMore={loadMore}
          onRefresh={syncNow}
          className="flex-1"
        />
      </div>

      {/* Main: Thread view */}
      <div className="flex-1 min-w-0 h-full">
        {selectedThread ? (
          <EmailChatThread
            thread={selectedThread}
            messages={messages}
            accountId={activeAccountId ?? ''}
            isLoading={isLoadingMessages}
            onBack={() => selectThread(null)}
          />
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-6 animate-in fade-in zoom-in-95 duration-700 bg-background/30 backdrop-blur-sm">
            <div className="relative">
              <div className="h-24 w-24 rounded-3xl bg-primary/5 flex items-center justify-center border border-primary/10">
                <Mail className="h-10 w-10 text-primary/30" />
              </div>
              <div className="absolute -bottom-2 -right-2 h-8 w-8 rounded-2xl bg-background border border-border shadow-lg flex items-center justify-center">
                <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
              </div>
            </div>
            <div className="text-center space-y-2">
              <p className="text-base font-bold tracking-tight font-display text-foreground/80">Selecione uma conversa</p>
              <p className="text-xs text-muted-foreground/60 max-w-[240px] leading-relaxed">
                Clique em um e-mail na lista lateral para visualizar o conteúdo e responder.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
