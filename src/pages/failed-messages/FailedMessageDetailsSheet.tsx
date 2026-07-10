import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle,
} from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Copy, MessageSquare } from 'lucide-react';
import { FailedMessageStatusBadge } from '@/features/admin';
import { cn } from '@/lib/utils';
import { classifyRootCause, getRootCauseMeta } from '@/lib/failureRootCause';
import { toast } from 'sonner';
import { type FailedMessageRow } from '@/features/admin/hooks/monitoring/useFailedMessages';

const ROOT_CAUSE_TONE_CLASS: Record<'warning' | 'destructive' | 'info' | 'muted', string> = {
  warning: 'bg-warning/15 text-warning-foreground border-warning/40',
  destructive: 'bg-destructive/15 text-destructive border-destructive/40',
  info: 'bg-primary/15 text-primary border-primary/40',
  muted: 'bg-muted text-muted-foreground border-border',
};

export function FailedMessageDetailsSheet({ selected, onClose, onViewInChat }: { selected: FailedMessageRow | null; onClose: () => void; onViewInChat: (row: FailedMessageRow) => void }) {
  const copy = (val: string) => {
    navigator.clipboard.writeText(val);
    toast.success('Copiado');
  };

  return (
    <Sheet open={!!selected} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Detalhes da falha</SheetTitle>
          <SheetDescription>
            {selected && (
              <span className=" text-xs">
                {selected.instance_name} → {selected.remote_jid}
              </span>
            )}
          </SheetDescription>
        </SheetHeader>
        {selected && (
          <div className="space-y-4 mt-4">
            <div className="flex items-center gap-2 flex-wrap">
              <FailedMessageStatusBadge status={selected.status} />
              {(() => {
                const cause = classifyRootCause(selected);
                const meta = getRootCauseMeta(cause);
                return (
                  <Badge
                    variant="outline"
                    className={cn('text-xs', ROOT_CAUSE_TONE_CLASS[meta.tone as keyof typeof ROOT_CAUSE_TONE_CLASS])}
                  >
                    Causa: {meta.label}
                  </Badge>
                );
              })()}
              {selected.remote_jid && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={() => onViewInChat(selected)}
                      >
                        <MessageSquare className="h-3.5 w-3.5 mr-1.5" />
                        Ver no chat
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Abrir inbox neste contato</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold text-muted-foreground">Tentativas</label>
                <p className="text-sm font-medium">{selected.retry_count} / {selected.max_retries}</p>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold text-muted-foreground">Erro</label>
                <p className="text-sm  truncate" title={selected.error_code || '-'}>
                  {selected.error_code || (selected.http_status ? `HTTP ${selected.http_status}` : '-')}
                </p>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] uppercase font-bold text-muted-foreground">Mensagem de erro</label>
              <div className="bg-muted p-2 rounded text-xs  break-all relative group">
                {selected.error_message || 'Nenhuma mensagem disponível'}
                {selected.error_message && (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-6 w-6 absolute right-1 top-1 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => copy(selected.error_message)}
                  >
                    <Copy className="h-3 w-3" />
                  </Button>
                )}
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-[10px] uppercase font-bold text-muted-foreground">Payload original</label>
                <Button variant="ghost" size="sm" className="h-6 text-[10px]" onClick={() => copy(JSON.stringify(selected.payload))}>
                  Copiar JSON
                </Button>
              </div>
              <ScrollArea className="h-[250px] w-full rounded border bg-foreground p-3">
                <pre className="text-[11px] text-muted-foreground ">
                  {JSON.stringify(selected.payload, null, 2)}
                </pre>
              </ScrollArea>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
