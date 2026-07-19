import { useMemo } from 'react';
import { formatDistanceToNow, format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Copy, ExternalLink, Filter } from 'lucide-react';
import { Link } from 'react-router-dom';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';
import type { RateLimitLog } from '@/features/admin/hooks/useRateLimitLogs';

interface Props {
  log: RateLimitLog | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onFilterByIp?: (ip: string) => void;
  onFilterByEndpoint?: (endpoint: string) => void;
}

function parseUA(ua: string | null): { browser: string; os: string; device: string; bot: boolean } {
  if (!ua) return { browser: '—', os: '—', device: '—', bot: false };
  const bot = /bot|crawler|spider|curl|wget|python-requests|axios|node-fetch/i.test(ua);
  const browser =
    /Edg\/([\d.]+)/.exec(ua)?.[0] ??
    /Chrome\/([\d.]+)/.exec(ua)?.[0] ??
    /Firefox\/([\d.]+)/.exec(ua)?.[0] ??
    /Safari\/([\d.]+)/.exec(ua)?.[0] ??
    'Desconhecido';
  const os =
    /Windows NT [\d.]+/.exec(ua)?.[0] ??
    /Mac OS X [\d_]+/.exec(ua)?.[0] ??
    /Android [\d.]+/.exec(ua)?.[0] ??
    /iPhone OS [\d_]+/.exec(ua)?.[0] ??
    /Linux/.exec(ua)?.[0] ??
    '—';
  const device = /Mobi|Android|iPhone/.test(ua) ? 'Mobile' : 'Desktop';
  return { browser, os, device, bot };
}

async function copyToClipboard(value: string, label: string) {
  try {
    await navigator.clipboard.writeText(value);
    toast.success(`${label} copiado`);
  } catch {
    toast.error('Não foi possível copiar');
  }
}

function Field({
  label,
  value,
  mono,
  copyable,
  copyLabel,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
  copyable?: string;
  copyLabel?: string;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
        {copyable && (
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => copyToClipboard(copyable, copyLabel ?? label)}
            aria-label={`Copiar ${label}`}
          >
            <Copy className="h-3 w-3" />
          </Button>
        )}
      </div>
      <div className={mono ? 'font-mono text-sm break-all' : 'text-sm'}>{value}</div>
    </div>
  );
}

/** Rate Limit Log Details component. */
export function RateLimitLogDetails({ log, open, onOpenChange, onFilterByIp, onFilterByEndpoint }: Props) {
  const ua = useMemo(() => parseUA(log?.user_agent ?? null), [log?.user_agent]);

  if (!log) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="w-full sm:max-w-lg" />
      </Sheet>
    );
  }

  const createdAt = new Date(log.created_at);
  const relative = formatDistanceToNow(createdAt, { addSuffix: true, locale: ptBR });
  const absolute = format(createdAt, "dd/MM/yyyy 'às' HH:mm:ss", { locale: ptBR });
  const location = [log.city, log.country].filter(Boolean).join(', ') || '—';

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg p-0 flex flex-col">
        <SheetHeader className="p-6 pb-4">
          <div className="flex items-center gap-2 flex-wrap">
            {log.blocked ? (
              <Badge variant="destructive">Bloqueado</Badge>
            ) : (
              <Badge variant="secondary">OK</Badge>
            )}
            {ua.bot && <Badge variant="outline">Bot/Automatizado</Badge>}
            <Badge variant="outline">{log.request_count} req</Badge>
          </div>
          <SheetTitle className="text-lg mt-2">Detalhes do log de rate limit</SheetTitle>
          <SheetDescription>
            {absolute} · {relative}
          </SheetDescription>
        </SheetHeader>

        <Separator />

        <ScrollArea className="flex-1">
          <div className="p-6 space-y-5">
            <Field
              label="ID do log"
              mono
              value={log.id}
              copyable={log.id}
              copyLabel="ID"
            />

            <div className="grid grid-cols-1 gap-4">
              <Field
                label="Endereço IP"
                mono
                copyable={log.ip_address}
                copyLabel="IP"
                value={
                  <div className="flex items-center gap-2">
                    <span>{log.ip_address}</span>
                    {onFilterByIp && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-xs"
                        onClick={() => {
                          onFilterByIp(log.ip_address);
                          onOpenChange(false);
                        }}
                      >
                        <Filter className="h-3 w-3 mr-1" />
                        Filtrar
                      </Button>
                    )}
                  </div>
                }
              />
              <Field
                label="Endpoint"
                mono
                copyable={log.endpoint}
                copyLabel="Endpoint"
                value={
                  <div className="flex items-center gap-2">
                    <span>{log.endpoint}</span>
                    {onFilterByEndpoint && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-xs"
                        onClick={() => {
                          onFilterByEndpoint(log.endpoint);
                          onOpenChange(false);
                        }}
                      >
                        <Filter className="h-3 w-3 mr-1" />
                        Filtrar
                      </Button>
                    )}
                  </div>
                }
              />
            </div>

            <Separator />

            <div className="grid grid-cols-2 gap-4">
              <Field label="Requisições" value={log.request_count.toString()} />
              <Field
                label="Status"
                value={log.blocked ? 'Bloqueado (429)' : 'Permitido'}
              />
              <Field label="Localização" value={location} />
              <Field
                label="Usuário"
                mono
                value={log.user_id ?? '— (anônimo)'}
                copyable={log.user_id ?? undefined}
                copyLabel="User ID"
              />
            </div>

            <Separator />

            <div className="space-y-3">
              <p className="text-sm font-medium">Cliente (User-Agent)</p>
              <div className="grid grid-cols-3 gap-3 text-xs">
                <div>
                  <p className="text-muted-foreground">Navegador</p>
                  <p className="font-mono">{ua.browser}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">SO</p>
                  <p className="font-mono">{ua.os}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Dispositivo</p>
                  <p className="font-mono">{ua.device}</p>
                </div>
              </div>
              <div className="rounded-md bg-muted p-3">
                <p className="text-[10px] uppercase text-muted-foreground mb-1">User-Agent bruto</p>
                <p className="font-mono text-xs break-all">{log.user_agent ?? '—'}</p>
              </div>
            </div>

            <Separator />

            <div className="space-y-2">
              <p className="text-sm font-medium">Payload bruto</p>
              <pre className="rounded-md bg-muted p-3 text-xs overflow-x-auto">
{JSON.stringify(log, null, 2)}
              </pre>
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => copyToClipboard(JSON.stringify(log, null, 2), 'Payload JSON')}
              >
                <Copy className="h-3 w-3 mr-1" />
                Copiar payload
              </Button>
            </div>

            <Separator />

            <div className="space-y-2">
              <p className="text-sm font-medium">Investigar</p>
              <div className="grid grid-cols-1 gap-2">
                <Button asChild variant="outline" size="sm">
                  <Link to={`/admin/rate-limit?tab=logs&ip=${encodeURIComponent(log.ip_address)}`}>
                    <ExternalLink className="h-3 w-3 mr-1" />
                    Ver todos os logs deste IP
                  </Link>
                </Button>
                <Button asChild variant="outline" size="sm">
                  <Link to={`/admin/rate-limit?tab=logs&endpoint=${encodeURIComponent(log.endpoint)}`}>
                    <ExternalLink className="h-3 w-3 mr-1" />
                    Ver todos os logs deste endpoint
                  </Link>
                </Button>
              </div>
            </div>
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
