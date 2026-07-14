import { useEffect, useMemo, useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { RefreshCw, Search, AlertTriangle, Webhook, Send } from 'lucide-react';
import { whatsapp } from '@/lib/whatsappAdapter';
import {
  fmtTime,
  modeOfProvider,
  modeBadge,
  statusBadge,
  kindBadge,
  EmptyState,
} from './whatsappLogsHelpers';
import type { ModeFilter } from './whatsappLogsHelpers';
import { useWhatsAppLogs } from './useWhatsAppLogs';

export default function AdminWhatsAppLogsPage() {
  const [mode, setMode] = useState<ModeFilter>('all');
  const [search, setSearch] = useState('');
  const [activeMode, setActiveMode] = useState<string>('…');
  const { sends, pings, errors, loading, refresh } = useWhatsAppLogs(mode, search);
  const mountedRef = useRef(true);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    whatsapp
      .resolveTransport()
      .then((r) => {
        if (mountedRef.current) {
          setActiveMode(`${r.requestedMode}${r.degraded ? ' (degraded → evolution)' : ''}`);
        }
      })
      .catch(() => {
        if (mountedRef.current) {
          setActiveMode('desconhecido');
        }
      });
  }, []);

  const counts = useMemo(
    () => ({ sends: sends.length, pings: pings.length, errors: errors.length }),
    [sends, pings, errors]
  );

  return (
    <div className="container mx-auto max-w-7xl space-y-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Logs WhatsApp</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Envios, webhooks e erros de integração. Modo ativo:{' '}
            <span className="text-foreground">{activeMode}</span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={mode}
            onValueChange={(v) =>
              setMode(
                v as ModeFilter /* ignore-audit: Select/Tabs value string narrowed to union; developer controls option values */
              )
            }
          >
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Filtrar por modo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os modos</SelectItem>
              <SelectItem value="official">Oficial (Cloud API)</SelectItem>
              <SelectItem value="unofficial">Não-oficial (Evolution)</SelectItem>
            </SelectContent>
          </Select>
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="JID, código ou erro…"
              className="w-[260px] pl-8"
            />
          </div>
          <Button variant="outline" size="icon" onClick={refresh} aria-label="Atualizar">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      <Tabs defaultValue="sends" className="space-y-4">
        <TabsList>
          <TabsTrigger value="sends" className="gap-2">
            <Send className="h-4 w-4" /> Envios <Badge variant="secondary">{counts.sends}</Badge>
          </TabsTrigger>
          <TabsTrigger value="webhooks" className="gap-2">
            <Webhook className="h-4 w-4" /> Webhooks{' '}
            <Badge variant="secondary">{counts.pings}</Badge>
          </TabsTrigger>
          <TabsTrigger value="errors" className="gap-2">
            <AlertTriangle className="h-4 w-4" /> Erros{' '}
            <Badge variant="secondary">{counts.errors}</Badge>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="sends">
          <Card>
            <CardHeader>
              <CardTitle>Envios e recebimentos</CardTitle>
              <CardDescription>provider_message_log — últimas 150 entradas.</CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <Skeleton className="h-64" />
              ) : sends.length === 0 ? (
                <EmptyState mode={mode} kind="envios" />
              ) : (
                <ScrollArea className="h-[60vh]">
                  <table className="w-full text-sm">
                    <thead className="border-b text-left text-muted-foreground">
                      <tr>
                        <th scope="col" className="py-2 pr-3">
                          Quando
                        </th>
                        <th scope="col" className="py-2 pr-3">
                          Modo
                        </th>
                        <th scope="col" className="py-2 pr-3">
                          Instância
                        </th>
                        <th scope="col" className="py-2 pr-3">
                          Direção
                        </th>
                        <th scope="col" className="py-2 pr-3">
                          JID
                        </th>
                        <th scope="col" className="py-2 pr-3">
                          Status
                        </th>
                        <th scope="col" className="py-2 pr-3">
                          HTTP
                        </th>
                        <th scope="col" className="py-2 pr-3">
                          Erro
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {sends.map((r) => (
                        <tr key={r.id} className="border-b hover:bg-muted/50">
                          <td className="whitespace-nowrap py-2 pr-3">{fmtTime(r.received_at)}</td>
                          <td className="py-2 pr-3">{modeBadge(modeOfProvider(r.provider))}</td>
                          <td className="py-2 pr-3 text-xs">{r.instance_name}</td>
                          <td className="py-2 pr-3">{r.direction}</td>
                          <td className="max-w-[180px] truncate py-2 pr-3 text-xs">
                            {r.remote_jid}
                          </td>
                          <td className="py-2 pr-3">{statusBadge(r.delivery_status)}</td>
                          <td className="py-2 pr-3">{r.http_status ?? '—'}</td>
                          <td className="max-w-[260px] truncate py-2 pr-3 text-destructive">
                            {r.error_code ?? r.error_message ?? ''}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="webhooks">
          <Card>
            <CardHeader>
              <CardTitle>Webhooks Cloud API</CardTitle>
              <CardDescription>
                whatsapp_cloud_webhook_pings — handshakes, eventos e falhas de assinatura.
                {mode === 'unofficial' &&
                  ' (Indisponível no modo não-oficial — use os logs do Evolution.)'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <Skeleton className="h-64" />
              ) : pings.length === 0 ? (
                <EmptyState mode={mode} kind="webhooks" />
              ) : (
                <ScrollArea className="h-[60vh]">
                  <table className="w-full text-sm">
                    <thead className="border-b text-left text-muted-foreground">
                      <tr>
                        <th scope="col" className="py-2 pr-3">
                          Quando
                        </th>
                        <th scope="col" className="py-2 pr-3">
                          Tipo
                        </th>
                        <th scope="col" className="py-2 pr-3">
                          Detalhes
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {pings.map((p) => (
                        <tr key={p.id} className="border-b align-top hover:bg-muted/50">
                          <td className="whitespace-nowrap py-2 pr-3">{fmtTime(p.created_at)}</td>
                          <td className="py-2 pr-3">{kindBadge(p.kind)}</td>
                          <td className="py-2 pr-3 text-xs">
                            <pre className="max-w-[600px] whitespace-pre-wrap break-all">
                              {JSON.stringify(p.meta ?? {}, null, 0)}
                            </pre>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="errors">
          <Card>
            <CardHeader>
              <CardTitle>Erros de integração</CardTitle>
              <CardDescription>
                dispatch_error_logs — falhas no despacho de mensagens.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <Skeleton className="h-64" />
              ) : errors.length === 0 ? (
                <EmptyState mode={mode} kind="erros" />
              ) : (
                <ScrollArea className="h-[60vh]">
                  <table className="w-full text-sm">
                    <thead className="border-b text-left text-muted-foreground">
                      <tr>
                        <th scope="col" className="py-2 pr-3">
                          Quando
                        </th>
                        <th scope="col" className="py-2 pr-3">
                          Canal
                        </th>
                        <th scope="col" className="py-2 pr-3">
                          Instância
                        </th>
                        <th scope="col" className="py-2 pr-3">
                          JID
                        </th>
                        <th scope="col" className="py-2 pr-3">
                          Código
                        </th>
                        <th scope="col" className="py-2 pr-3">
                          HTTP
                        </th>
                        <th scope="col" className="py-2 pr-3">
                          Tentativas
                        </th>
                        <th scope="col" className="py-2 pr-3">
                          Mensagem
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {errors.map((r) => (
                        <tr key={r.id} className="border-b hover:bg-muted/50">
                          <td className="whitespace-nowrap py-2 pr-3">{fmtTime(r.occurred_at)}</td>
                          <td className="py-2 pr-3">{r.channel_type ?? '—'}</td>
                          <td className="py-2 pr-3 text-xs">{r.instance_name}</td>
                          <td className="max-w-[180px] truncate py-2 pr-3 text-xs">
                            {r.remote_jid ?? '—'}
                          </td>
                          <td className="py-2 pr-3">
                            <Badge variant="destructive">{r.error_code ?? '?'}</Badge>
                          </td>
                          <td className="py-2 pr-3">{r.http_status ?? '—'}</td>
                          <td className="py-2 pr-3">{r.retry_count}</td>
                          <td className="max-w-[320px] truncate py-2 pr-3">{r.error_message}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
