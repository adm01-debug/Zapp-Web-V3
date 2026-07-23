import { useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { GenericEmptyState } from '@/components/ui/GenericEmptyState';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Copy, History } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';
import type { RecentSend } from '@/features/inbox';
import { formatTimeHMS } from '@/lib/formatters';

interface Props {
  agentName: string;
  sends: RecentSend[];
}

function statusVariant(http: number): 'success' | 'destructive' | 'warning' {
  if (http >= 200 && http < 300) return 'success';
  if (http >= 400) return 'destructive';
  return 'warning';
}

/** Agent Recent Sends Popover component for the agents ops section. */
export function AgentRecentSendsPopover({ agentName, sends }: Props) {
  const [open, setOpen] = useState(false);

  const copyKey = async (key: string) => {
    try {
      await navigator.clipboard.writeText(key);
      toast({ description: 'Idempotency key copiada.' });
    } catch {
      toast({ description: 'Falha ao copiar.', variant: 'destructive' });
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="h-8 gap-1.5">
          <History className="h-3.5 w-3.5" />
          <span className="text-xs">Ver últimos {sends.length || 5}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[360px] p-0" data-testid="recent-sends-popover">
        <div className="border-b border-border/60 p-3">
          <div className="truncate text-sm font-semibold text-foreground">{agentName}</div>
          <div className="text-xs text-muted-foreground">Últimos envios via Evolution proxy</div>
        </div>
        {sends.length === 0 ? (
          <GenericEmptyState
            icon={History}
            title="Sem envios"
            description="Nenhum envio rastreado nesta janela."
            className="py-8"
          />
        ) : (
          <ul className="max-h-[320px] divide-y divide-border/60 overflow-auto">
            {sends.map((s) => (
              <li key={s.idem_key} className="space-y-1.5 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {formatTimeHMS(s.created_at)}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
                      {s.instance_name}
                    </Badge>
                    <Badge
                      variant={statusVariant(s.http_status)}
                      className="px-1.5 py-0 text-[10px]"
                    >
                      {s.http_status}
                    </Badge>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        onClick={() => copyKey(s.idem_key)}
                        className={cn(
                          'flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px]',
                          'bg-muted/40 text-muted-foreground transition-colors hover:bg-muted',
                          'max-w-[220px] truncate'
                        )}
                      >
                        <Copy className="h-3 w-3 shrink-0" />
                        <span className="truncate">{s.idem_key}</span>
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">
                      <p className="text-xs">{s.idem_key}</p>
                      <p className="text-[10px] text-muted-foreground">Clique para copiar</p>
                    </TooltipContent>
                  </Tooltip>
                  <span className="text-[10px] text-muted-foreground">
                    {s.external_message_id ? `wa:${s.external_message_id.slice(0, 12)}…` : '—'}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}
