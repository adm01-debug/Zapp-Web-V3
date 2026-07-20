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

  const totalUnread = threads.filter((t) => t.unread_count > 0).length;

  // Quando busca seleciona uma thread
  const handleSearchSelect = (result: EmailSearchResult) => {
    const thread = threads.find((t) => t.id === result.id || t.thread_id === result.thread_id);
    if (thread) selectThread(thread);
    // Se não estiver no cache local, poderia fazer fetch pelo threadId
  };

  // Sem contas conectadas
  if (accounts.length === 0) {
    return (
      <div
        className={cn(
          'flex h-full flex-col items-center justify-center gap-6 bg-sidebar/30 p-8 duration-500 animate-in fade-in',
          className
        )}
      >
        <div className="flex flex-col items-center gap-4">
          <div className="relative">
            <div className="flex h-20 w-20 animate-pulse items-center justify-center rounded-[22px] bg-primary/10">
              <Mail className="h-10 w-10 text-primary" />
            </div>
            <div className="absolute -right-1 -top-1 h-5 w-5 animate-bounce rounded-full border-2 border-background bg-primary" />
          </div>
          <div className="space-y-2 text-center">
            <h3 className="font-display text-2xl font-bold tracking-tight">Email não conectado</h3>
            <p className="max-w-[320px] text-sm leading-relaxed text-muted-foreground">
              Conecte sua conta Email para gerenciar e-mails diretamente pela plataforma, com
              interface de chat.
            </p>
          </div>
        </div>

        <Button
          onClick={startOAuth}
          className="h-12 gap-2.5 rounded-xl px-8 font-semibold shadow-lg shadow-primary/20 transition-all hover:scale-[1.02] active:scale-[0.98]"
        >
          <Mail className="h-5 w-5" />
          Conectar Email
        </Button>

        <p className="max-w-[280px] text-center text-[11px] font-medium text-muted-foreground/60">
          Sincronização segura via Google OAuth2. <br />
          Acesso direto e privado às suas mensagens.
        </p>
      </div>
    );
  }

  return (
    <div className={cn('flex h-full overflow-hidden', className)}>
      {/* Sidebar: Thread list */}
      <div className="flex h-full w-[340px] shrink-0 flex-col border-r bg-background/50">
        {/* Account selector + search */}
        <div className="space-y-3 border-b bg-muted/5 p-3">
          <EmailAccountSelector
            accounts={accounts}
            activeAccountId={activeAccountId}
            tokenStatus={Object.fromEntries(
              tokenStatus.map((s) => [s.account_id, s.token_status as TokenStatus])
            )}
            isSyncing={isSyncing}
            onSelectAccount={setActiveAccountId}
            onAddAccount={startOAuth}
            onDisconnect={disconnect}
            onSync={syncNow}
            totalUnread={totalUnread}
          />
          <EmailSearchBar accountId={activeAccountId} onSelectThread={handleSearchSelect} />
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
      <div className="h-full min-w-0 flex-1">
        {selectedThread ? (
          <EmailChatThread
            thread={selectedThread}
            messages={messages}
            accountId={activeAccountId ?? ''}
            isLoading={isLoadingMessages}
            onBack={() => selectThread(null)}
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-6 bg-background/30 text-muted-foreground backdrop-blur-sm duration-700 animate-in fade-in zoom-in-95">
            <div className="relative">
              <div className="flex h-24 w-24 items-center justify-center rounded-3xl border border-primary/10 bg-primary/5">
                <Mail className="h-10 w-10 text-primary/30" />
              </div>
              <div className="absolute -bottom-2 -right-2 flex h-8 w-8 items-center justify-center rounded-2xl border border-border bg-background shadow-lg">
                <div className="h-2 w-2 animate-pulse rounded-full bg-primary" />
              </div>
            </div>
            <div className="space-y-2 text-center">
              <p className="font-display text-base font-bold tracking-tight text-foreground/80">
                Selecione uma conversa
              </p>
              <p className="max-w-[240px] text-xs leading-relaxed text-muted-foreground/60">
                Clique em um e-mail na lista lateral para visualizar o conteúdo e responder.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
