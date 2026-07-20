/**
 * MessageDetailsDialog — renders full message metadata (payload + raw_data)
 * fetched on-demand via `useMessageDetails`. Admin/supervisor only for the
 * "Copiar JSON" action (Zero Export policy).
 */
import { useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Copy, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { useMessageDetails } from '@/features/inbox';
import { useAuth } from '@/features/auth';
import { MessageAttemptsTimeline } from './MessageAttemptsTimeline';
import { MessageStatusTimeline } from './MessageStatusTimeline';

interface MessageDetailsDialogProps {
  messageId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

/** Message Details Dialog function. */
export function MessageDetailsDialog({ messageId, open, onOpenChange }: MessageDetailsDialogProps) {
  const { profile } = useAuth();
  const role = profile?.role ?? 'agent';
  const canCopyJson = role === 'admin' || role === 'supervisor';

  const { data, isLoading, error } = useMessageDetails(messageId, { enabled: open });

  const payloadStr = useMemo(() => safeStringify(data?.payload ?? null), [data?.payload]);
  const rawStr = useMemo(() => safeStringify(data?.raw_data ?? null), [data?.raw_data]);

  const copyJson = (label: string, value: string) => {
    if (!canCopyJson) return;
    navigator.clipboard.writeText(value)
      .then(() => toast.success(`${label} copiado`))
      .catch(() => toast.error('Falha ao copiar'));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Detalhes do envio</DialogTitle>
          <DialogDescription>
            Metadados completos da mensagem, incluindo payload e dados brutos do webhook.
          </DialogDescription>
        </DialogHeader>

        {isLoading && (
          <div className="flex-1 flex items-center justify-center py-8" data-testid="message-details-loading">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {!isLoading && error && (
          <div className="flex-1 flex items-center justify-center py-8 text-destructive">
            <AlertCircle className="w-5 h-5 mr-2" />
            <span className="text-sm">{error.message}</span>
          </div>
        )}

        {!isLoading && !error && data && (
          <div className="flex-1 overflow-hidden flex flex-col gap-3">
            {/* Header summary */}
            <div className="grid grid-cols-2 gap-2 text-xs bg-muted/40 rounded-md p-3">
              <div><span className="text-muted-foreground">ID interno:</span> <code className="text-foreground">{data.id}</code></div>
              <div><span className="text-muted-foreground">message_id:</span> <code className="text-foreground">{data.message_id}</code></div>
              <div><span className="text-muted-foreground">Criado em:</span> {format(new Date(data.created_at), 'dd/MM/yyyy HH:mm:ss')}</div>
              <div><span className="text-muted-foreground">Direção:</span> <Badge variant="outline">{data.direction}</Badge></div>
              <div><span className="text-muted-foreground">Status:</span> <Badge variant="secondary">{data.status}</Badge></div>
              <div><span className="text-muted-foreground">Tipo:</span> <Badge variant="outline">{data.message_type}</Badge></div>
              <div><span className="text-muted-foreground">Instância:</span> {data.instance_name}</div>
              <div><span className="text-muted-foreground">Bot:</span> {data.sent_by_bot ? 'Sim' : 'Não'}</div>
            </div>

            <Tabs defaultValue="timeline" className="flex-1 overflow-hidden flex flex-col">
              <TabsList className="self-start">
                <TabsTrigger value="timeline">Linha do tempo</TabsTrigger>
                <TabsTrigger value="content">Conteúdo</TabsTrigger>
                <TabsTrigger value="attempts">Tentativas</TabsTrigger>
                <TabsTrigger value="payload">Payload</TabsTrigger>
                <TabsTrigger value="raw">Raw Data</TabsTrigger>
              </TabsList>

              <TabsContent value="timeline" className="flex-1 overflow-auto mt-2 px-1">
                <MessageStatusTimeline
                  messageId={data.id}
                  status={data.status}
                  createdAt={data.created_at}
                  statusAt={data.status_at}
                  direction={data.direction}
                  fromMe={data.from_me}
                />
              </TabsContent>

              <TabsContent value="content" className="flex-1 overflow-auto mt-2">
                <div className="space-y-2 text-sm">
                  {data.content && <div><div className="text-xs text-muted-foreground mb-1">Conteúdo</div><pre className="whitespace-pre-wrap break-words bg-muted/40 rounded p-2">{data.content}</pre></div>}
                  {data.caption && <div><div className="text-xs text-muted-foreground mb-1">Caption</div><pre className="whitespace-pre-wrap break-words bg-muted/40 rounded p-2">{data.caption}</pre></div>}
                  {data.media_url && <div><div className="text-xs text-muted-foreground mb-1">Mídia ({data.media_mimetype ?? 'desconhecido'})</div><code className="text-xs break-all">{data.media_url}</code></div>}
                  {!data.content && !data.caption && !data.media_url && (
                    <p className="text-xs text-muted-foreground">Sem conteúdo textual.</p>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="attempts" className="flex-1 overflow-auto mt-2">
                <MessageAttemptsTimeline messageId={data.id} enabled={open} />
              </TabsContent>

              <TabsContent value="payload" className="flex-1 overflow-auto mt-2">
                <div className="flex justify-end mb-2">
                  {canCopyJson && (
                    <Button size="sm" variant="ghost" onClick={() => copyJson('Payload', payloadStr)} data-testid="copy-payload">
                      <Copy className="w-3.5 h-3.5 mr-1" /> Copiar JSON
                    </Button>
                  )}
                </div>
                <pre className="text-xs bg-muted/40 rounded p-3 overflow-auto whitespace-pre-wrap break-words">{payloadStr}</pre>
              </TabsContent>

              <TabsContent value="raw" className="flex-1 overflow-auto mt-2">
                <div className="flex justify-end mb-2">
                  {canCopyJson && (
                    <Button size="sm" variant="ghost" onClick={() => copyJson('Raw Data', rawStr)} data-testid="copy-raw">
                      <Copy className="w-3.5 h-3.5 mr-1" /> Copiar JSON
                    </Button>
                  )}
                </div>
                <pre className="text-xs bg-muted/40 rounded p-3 overflow-auto whitespace-pre-wrap break-words">{rawStr}</pre>
              </TabsContent>
            </Tabs>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
