/**
 * Zap Webb — Demo Inbox (3 painéis)
 *
 * Tela de validação ponta-a-ponta da arquitetura descrita em
 * docs/HANDOFF_LOVABLE_ZAP_WEBB.md (PARTE 9): sidebar de conversas,
 * painel central com mensagens em tempo real, painel direito com contato,
 * envio via Evolution API.
 *
 * Rota: /admin/zappweb-demo
 */
import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';
import {
  Send,
  Loader2,
  Wifi,
  MessageSquare,
  User,
  Mic,
  Image as ImageIcon,
  Video,
  FileText,
  Sticker,
  Phone,
  Tag,
  BarChart3,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  useZappConversations,
  useZappMessages,
  sendText,
  markChatRead,
  ZAPPWEB_INSTANCE,
  type EvolutionMessage,
  type EvolutionConversation,
} from '@/integrations/zappweb';

function MediaIcon({ type }: { type: string | null }) {
  switch (type) {
    case 'audioMessage':
    case 'audio':
      return <Mic className="h-3 w-3" />;
    case 'imageMessage':
    case 'image':
      return <ImageIcon className="h-3 w-3" />;
    case 'videoMessage':
    case 'video':
      return <Video className="h-3 w-3" />;
    case 'documentMessage':
    case 'document':
      return <FileText className="h-3 w-3" />;
    case 'stickerMessage':
    case 'sticker':
      return <Sticker className="h-3 w-3" />;
    default:
      return null;
  }
}

function MessageBubble({ msg }: { msg: EvolutionMessage }) {
  const mine = msg.from_me;
  const status = msg.status;
  const tick =
    status === 'read' ? '✓✓' : status === 'delivered' ? '✓✓' : status === 'sent' ? '✓' : '⌛';

  if (msg.deleted_at) {
    return (
      <div className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
        <div className="rounded-lg bg-muted px-3 py-1.5 text-[11px] italic text-muted-foreground">
          🚫 Mensagem apagada
        </div>
      </div>
    );
  }

  const isMedia = msg.media_url && (msg.media_type || msg.message_type !== 'conversation');

  return (
    <div className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        className={`max-w-[70%] rounded-2xl px-3 py-2 shadow-sm ${
          mine ? 'border border-whatsapp/20 bg-whatsapp/10' : 'border bg-card'
        }`}
      >
        {isMedia && msg.media_type === 'image' && (
          <img
            src={msg.media_url!}
            alt="Imagem da mensagem"
            className="mb-1 max-h-60 rounded-lg object-cover"
          />
        )}
        {isMedia && msg.media_type === 'audio' && (
          <>
            <audio controls src={msg.media_url!} className="my-1 w-56" />
            <p className="sr-only">Transcrição de áudio não disponível.</p>
          </>
        )}
        {isMedia && msg.media_type === 'video' && (
          <>
            <video controls src={msg.media_url!} className="mb-1 max-h-60 rounded-lg" />
            <p className="sr-only">Legendas não disponíveis para este vídeo.</p>
          </>
        )}
        {isMedia && msg.media_type === 'document' && (
          <a
            href={msg.media_url!}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 text-sm underline"
          >
            <FileText className="h-4 w-4" /> {msg.media_filename || 'Documento'}
          </a>
        )}
        {(msg.content || msg.caption) && (
          <p className="whitespace-pre-wrap break-words text-sm">{msg.content || msg.caption}</p>
        )}
        <div className="mt-1 flex items-center justify-end gap-1 text-[10px] text-muted-foreground">
          <span>
            {new Date(msg.created_at).toLocaleTimeString('pt-BR', {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </span>
          {mine && <span className={status === 'read' ? 'text-whatsapp' : ''}>{tick}</span>}
        </div>
      </motion.div>
    </div>
  );
}

export default function ZappWebbDemoPage() {
  const { conversations, loading, markAsRead } = useZappConversations();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);

  const active = useMemo(
    () => conversations.find((c) => c.id === activeId) ?? null,
    [conversations, activeId]
  );
  const { messages, loading: loadingMsgs } = useZappMessages({
    remoteJid: active?.remote_jid ?? null,
  });
  const contact = active?.evolution_contacts ?? null;

  const handleOpen = async (conv: EvolutionConversation) => {
    setActiveId(conv.id);
    if (conv.unread_count > 0) {
      await markAsRead(conv.id);
      markChatRead(conv.remote_jid).catch(() => null);
    }
  };

  const handleSend = async () => {
    if (!active || !draft.trim()) return;
    setSending(true);
    try {
      await sendText(active.remote_jid, draft.trim());
      setDraft('');
    } catch (err: unknown) {
      toast.error('Falha ao enviar: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex h-screen max-h-screen flex-col bg-background">
      <header className="flex shrink-0 items-center gap-3 border-b px-6 py-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-whatsapp/10">
          <Wifi className="h-4 w-4 text-whatsapp" />
        </div>
        <div className="flex-1">
          <h1 className="font-display font-bold">Zap Webb · Inbox Demo</h1>
          <p className="text-[11px] text-muted-foreground">
            Instância: <span className="font-mono">{ZAPPWEB_INSTANCE}</span> · Realtime ativo
          </p>
        </div>
        <Badge variant="outline" className="gap-1">
          <BarChart3 className="h-3 w-3" /> {conversations.length} conversa(s)
        </Badge>
      </header>

      <div className="grid flex-1 grid-cols-12 overflow-hidden">
        {/* Sidebar */}
        <aside className="col-span-3 flex flex-col border-r">
          <div className="border-b p-3">
            <Input placeholder="Buscar conversas..." className="h-8 text-sm" />
          </div>
          <ScrollArea className="flex-1">
            {loading ? (
              <div className="p-6 text-center">
                <Loader2 className="mx-auto h-4 w-4 animate-spin" />
              </div>
            ) : conversations.length === 0 ? (
              <div className="p-6 text-center text-xs text-muted-foreground">
                Nenhuma conversa aberta na instância <code>{ZAPPWEB_INSTANCE}</code>.
              </div>
            ) : (
              conversations.map((conv) => {
                const c = conv.evolution_contacts;
                const name = c?.full_name || c?.push_name || conv.remote_jid;
                const isActive = conv.id === activeId;
                return (
                  <button
                    key={conv.id}
                    onClick={() => handleOpen(conv)}
                    className={`w-full border-b px-3 py-2.5 text-left transition-colors hover:bg-muted/50 ${
                      isActive ? 'bg-muted' : ''
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <Avatar className="h-9 w-9">
                        <AvatarImage src={c?.profile_picture_url ?? undefined} alt={name} />
                        <AvatarFallback className="text-[10px]">
                          {name.slice(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-sm font-medium">{name}</span>
                          {conv.unread_count > 0 && (
                            <Badge className="h-4 min-w-[16px] bg-whatsapp px-1 text-[10px]">
                              {conv.unread_count}
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-1 truncate text-[11px] text-muted-foreground">
                          <MediaIcon type={conv.last_message_type} />
                          <span className="truncate">{conv.last_message_content || '—'}</span>
                        </div>
                        {conv.last_message_at && (
                          <span className="text-[10px] text-muted-foreground">
                            {formatDistanceToNow(new Date(conv.last_message_at), {
                              locale: ptBR,
                              addSuffix: true,
                            })}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </ScrollArea>
        </aside>

        {/* Chat */}
        <main className="col-span-6 flex flex-col bg-muted/20">
          {!active ? (
            <div className="flex flex-1 items-center justify-center text-muted-foreground">
              <div className="text-center">
                <MessageSquare className="mx-auto mb-3 h-12 w-12 opacity-30" />
                <p className="text-sm">Selecione uma conversa para começar</p>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-3 border-b bg-card px-4 py-2.5">
                <Avatar className="h-8 w-8">
                  <AvatarImage
                    src={contact?.profile_picture_url ?? undefined}
                    alt={contact?.full_name || contact?.push_name || ''}
                  />
                  <AvatarFallback className="text-[10px]">
                    {(contact?.full_name || contact?.push_name || 'WA').slice(0, 2)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1">
                  <p className="text-sm font-medium">
                    {contact?.full_name || contact?.push_name || active.remote_jid}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {contact?.phone_number || active.remote_jid}
                  </p>
                </div>
              </div>

              <ScrollArea className="flex-1 p-4">
                <div className="space-y-2">
                  {loadingMsgs ? (
                    <Loader2 className="mx-auto my-8 h-4 w-4 animate-spin" />
                  ) : (
                    messages.map((m) => <MessageBubble key={m.id} msg={m} />)
                  )}
                </div>
              </ScrollArea>

              <div className="flex gap-2 border-t bg-card p-3">
                <Input
                  placeholder="Digite uma mensagem..."
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                  disabled={sending}
                />
                <Button onClick={handleSend} disabled={sending || !draft.trim()}>
                  {sending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </>
          )}
        </main>

        {/* Contato */}
        <aside className="col-span-3 overflow-hidden border-l bg-card">
          {!contact ? (
            <div className="p-6 text-center text-muted-foreground">
              <User className="mx-auto mb-2 h-8 w-8 opacity-30" />
              <p className="text-xs">Sem contato selecionado</p>
            </div>
          ) : (
            <ScrollArea className="h-full">
              <div className="space-y-4 p-4">
                <div className="text-center">
                  <Avatar className="mx-auto mb-2 h-20 w-20">
                    <AvatarImage
                      src={contact.profile_picture_url ?? undefined}
                      alt={contact.full_name || contact.push_name || ''}
                    />
                    <AvatarFallback>
                      {(contact.full_name || contact.push_name || 'WA').slice(0, 2)}
                    </AvatarFallback>
                  </Avatar>
                  <h3 className="text-sm font-bold">
                    {contact.full_name || contact.push_name || 'Sem nome'}
                  </h3>
                  <p className="text-[11px] text-muted-foreground">{contact.phone_number}</p>
                </div>

                <Card>
                  <CardHeader className="p-3 pb-1">
                    <CardTitle className="flex items-center gap-1 text-xs">
                      <Tag className="h-3 w-3" /> Pipeline
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 p-3 pt-1">
                    <div className="flex justify-between text-[11px]">
                      <span className="text-muted-foreground">Status</span>
                      <Badge variant="outline" className="h-4 text-[10px]">
                        {contact.lead_status}
                      </Badge>
                    </div>
                    <div className="flex justify-between text-[11px]">
                      <span className="text-muted-foreground">Score</span>
                      <span className="font-mono">{contact.lead_score}/100</span>
                    </div>
                    {contact.company && (
                      <div className="flex justify-between text-[11px]">
                        <span className="text-muted-foreground">Empresa</span>
                        <span>{contact.company}</span>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {contact.tags && contact.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {contact.tags.map((t) => (
                      <Badge key={t} variant="secondary" className="text-[10px]">
                        {t}
                      </Badge>
                    ))}
                  </div>
                )}

                <Button variant="outline" size="sm" className="w-full gap-2">
                  <Phone className="h-3 w-3" /> Ligar
                </Button>
              </div>
            </ScrollArea>
          )}
        </aside>
      </div>
    </div>
  );
}
