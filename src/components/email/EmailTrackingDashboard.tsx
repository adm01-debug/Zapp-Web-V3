import { useState, useEffect } from 'react';
import {
  Eye,
  MousePointerClick,
  Mail,
  TrendingUp,
  AlertTriangle,
  Clock,
  ChevronRight,
  Globe,
  Smartphone,
  Monitor,
  Tablet,
  ExternalLink,
  RefreshCw,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TooltipProvider } from '@/components/ui/tooltip';
import {
  useEmailTracking,
  type TrackedEmail,
  type TrackingEvent,
  type TrackedLink,
} from '@/hooks/useEmailTracking';

// ── Helpers ───────────────────────────────────────────────────────────────

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 60_000) return 'Agora';
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}min atrás`;
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}h atrás`;
  return d.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function DeviceIcon({ type }: { type: string | null }) {
  switch (type) {
    case 'mobile':
      return <Smartphone className="h-3.5 w-3.5" />;
    case 'tablet':
      return <Tablet className="h-3.5 w-3.5" />;
    case 'desktop':
      return <Monitor className="h-3.5 w-3.5" />;
    default:
      return <Globe className="h-3.5 w-3.5" />;
  }
}

function StatusBadge({ status }: { status: string }) {
  const config: Record<
    string,
    { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }
  > = {
    sent: { label: 'Enviado', variant: 'secondary' },
    delivered: { label: 'Entregue', variant: 'default' },
    bounced: { label: 'Bounce', variant: 'destructive' },
    deferred: { label: 'Deferido', variant: 'outline' },
    failed: { label: 'Falhou', variant: 'destructive' },
  };
  const c = config[status] ?? { label: status, variant: 'outline' as const };
  return (
    <Badge variant={c.variant} className="text-xs">
      {c.label}
    </Badge>
  );
}

function OpenIndicator({ count, firstAt }: { count: number; firstAt: string | null }) {
  if (count === 0) return <span className="text-xs text-muted-foreground">Não aberto</span>;
  return (
    <div className="flex items-center gap-1.5">
      <div className="h-2 w-2 animate-pulse rounded-full bg-primary" />
      <span className="text-xs font-medium text-primary dark:text-primary">{count}x aberto</span>
      {firstAt && <span className="text-xs text-muted-foreground">• {formatDate(firstAt)}</span>}
    </div>
  );
}

// ── Componente de detalhe de email ────────────────────────────────────────

function EmailTrackingDetail({
  email,
  onClose: _onClose,
}: {
  email: TrackedEmail;
  onClose: () => void;
}) {
  const { getOpenEvents, getTrackedLinks } = useEmailTracking();
  const [events, setEvents] = useState<TrackingEvent[]>([]);
  const [links, setLinks] = useState<TrackedLink[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [evts, lnks] = await Promise.all([
          getOpenEvents(email.tracking_id),
          getTrackedLinks(email.tracking_id),
        ]);
        if (!cancelled) {
          setEvents(evts);
          setLinks(lnks);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [email.tracking_id, getOpenEvents, getTrackedLinks]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">{email.subject ?? '(sem assunto)'}</h3>
          <p className="text-xs text-muted-foreground">Para: {email.recipient_email}</p>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={email.delivery_status} />
          <OpenIndicator count={email.open_count} firstAt={email.first_opened_at} />
        </div>
      </div>

      <Separator />

      {/* Stats do email */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg bg-muted/30 p-2 text-center">
          <Eye className="mx-auto mb-1 h-4 w-4 text-primary" />
          <p className="text-lg font-bold">{email.open_count}</p>
          <p className="text-xs text-muted-foreground">Aberturas</p>
        </div>
        <div className="rounded-lg bg-muted/30 p-2 text-center">
          <MousePointerClick className="mx-auto mb-1 h-4 w-4 text-primary" />
          <p className="text-lg font-bold">{email.click_count}</p>
          <p className="text-xs text-muted-foreground">Cliques</p>
        </div>
        <div className="rounded-lg bg-muted/30 p-2 text-center">
          <Clock className="mx-auto mb-1 h-4 w-4 text-warning-foreground" />
          <p className="text-lg font-bold">
            {email.first_opened_at ? formatDate(email.first_opened_at) : '—'}
          </p>
          <p className="text-xs text-muted-foreground">1ª abertura</p>
        </div>
      </div>

      {/* Timeline de eventos */}
      <Tabs defaultValue="events">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="events" className="text-xs">
            Aberturas ({events.length})
          </TabsTrigger>
          <TabsTrigger value="links" className="text-xs">
            Links ({links.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="events">
          <ScrollArea className="h-48">
            {loading ? (
              <p className="py-4 text-center text-xs text-muted-foreground">Carregando...</p>
            ) : events.length === 0 ? (
              <p className="py-4 text-center text-xs text-muted-foreground">
                Nenhuma abertura registrada
              </p>
            ) : (
              <div className="space-y-2 pr-2">
                {events.map((evt) => (
                  <div
                    key={evt.id}
                    className="flex items-center gap-3 rounded-lg bg-muted/20 p-2 text-xs"
                  >
                    <DeviceIcon type={evt.device_type} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="font-medium">{evt.browser ?? 'Desconhecido'}</span>
                        <span className="text-muted-foreground">• {evt.os}</span>
                        {evt.is_self_open && (
                          <Badge variant="outline" className="h-4 text-[10px]">
                            Self
                          </Badge>
                        )}
                        {evt.is_bot && (
                          <Badge variant="secondary" className="h-4 text-[10px]">
                            Bot
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-1 text-muted-foreground">
                        {evt.country && (
                          <>
                            <Globe className="h-2.5 w-2.5" />
                            {evt.country}
                          </>
                        )}
                        {evt.ip_address && <span>• {String(evt.ip_address)}</span>}
                      </div>
                    </div>
                    <span className="shrink-0 text-muted-foreground">
                      {formatDate(evt.created_at)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </TabsContent>

        <TabsContent value="links">
          <ScrollArea className="h-48">
            {links.length === 0 ? (
              <p className="py-4 text-center text-xs text-muted-foreground">
                Nenhum link rastreado
              </p>
            ) : (
              <div className="space-y-2 pr-2">
                {links.map((link) => (
                  <div
                    key={link.id}
                    className="flex items-center gap-3 rounded-lg bg-muted/20 p-2 text-xs"
                  >
                    <ExternalLink className="h-3.5 w-3.5 shrink-0 text-primary" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">
                        {link.display_text ?? link.original_url}
                      </p>
                      <p className="truncate text-muted-foreground">{link.original_url}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="font-bold text-primary">{link.click_count} cliques</p>
                      {link.first_clicked_at && (
                        <p className="text-muted-foreground">{formatDate(link.first_clicked_at)}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ── Dashboard Principal ──────────────────────────────────────────────────

export function EmailTrackingDashboard() {
  const { trackedEmails, stats, topContacts, isLoading, refreshEmails, refreshStats } =
    useEmailTracking();

  const [selectedEmail, setSelectedEmail] = useState<TrackedEmail | null>(null);

  return (
    <TooltipProvider delayDuration={200}>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-bold">
              <Eye className="h-5 w-5 text-primary" />
              Rastreio de Emails
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Monitore aberturas, cliques e engajamento dos seus emails
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              refreshEmails();
              refreshStats();
            }}
            className="gap-1.5"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Atualizar
          </Button>
        </div>

        {/* KPIs */}
        {stats && (
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground">Emails Rastreados</p>
                    <p className="text-2xl font-bold">{stats.total_tracked}</p>
                    <p className="text-xs text-muted-foreground">
                      últimos {stats.period_days} dias
                    </p>
                  </div>
                  <Mail className="h-8 w-8 text-primary opacity-20" />
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground">Taxa de Abertura</p>
                    <p
                      className={`text-2xl font-bold ${stats.open_rate >= 50 ? 'text-primary' : stats.open_rate >= 25 ? 'text-warning-foreground' : 'text-destructive-foreground'}`}
                    >
                      {stats.open_rate}%
                    </p>
                    <p className="text-xs text-muted-foreground">{stats.unique_opens} únicos</p>
                  </div>
                  <Eye className="h-8 w-8 text-primary opacity-20" />
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground">Taxa de Cliques</p>
                    <p
                      className={`text-2xl font-bold ${stats.click_rate >= 10 ? 'text-primary' : 'text-warning-foreground'}`}
                    >
                      {stats.click_rate}%
                    </p>
                    <p className="text-xs text-muted-foreground">{stats.total_clicks} total</p>
                  </div>
                  <MousePointerClick className="h-8 w-8 text-primary opacity-20" />
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground">Bounces</p>
                    <p
                      className={`text-2xl font-bold ${stats.bounce_count > 0 ? 'text-destructive-foreground' : 'text-primary'}`}
                    >
                      {stats.bounce_count}
                    </p>
                    <p className="text-xs text-muted-foreground">emails retornados</p>
                  </div>
                  <AlertTriangle className="h-8 w-8 text-destructive-foreground opacity-20" />
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Lista de emails rastreados */}
          <div className="lg:col-span-2">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Emails Rastreados Recentes</CardTitle>
                <CardDescription className="text-xs">
                  Clique para ver detalhes de abertura e cliques
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-80">
                  {isLoading ? (
                    <p className="py-8 text-center text-sm text-muted-foreground">Carregando...</p>
                  ) : trackedEmails.length === 0 ? (
                    <div className="py-8 text-center">
                      <Mail className="mx-auto mb-2 h-8 w-8 text-muted-foreground/20" />
                      <p className="text-sm text-muted-foreground">Nenhum email rastreado ainda</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        O rastreio é ativado automaticamente ao enviar emails pelo Email Chat
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      {trackedEmails.map((email) => (
                        <button
                          key={email.id}
                          onClick={() => setSelectedEmail(email)}
                          className={`w-full rounded-lg p-3 text-left transition-colors hover:bg-muted/50 ${
                            selectedEmail?.id === email.id
                              ? 'border border-primary/20 bg-primary/5'
                              : ''
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium">
                                {email.subject ?? '(sem assunto)'}
                              </p>
                              <p className="truncate text-xs text-muted-foreground">
                                Para: {email.recipient_name ?? email.recipient_email}
                              </p>
                            </div>
                            <div className="flex shrink-0 items-center gap-2">
                              <OpenIndicator count={email.open_count} firstAt={null} />
                              {email.click_count > 0 && (
                                <Badge variant="outline" className="gap-1 text-xs">
                                  <MousePointerClick className="h-2.5 w-2.5" />
                                  {email.click_count}
                                </Badge>
                              )}
                              <span className="text-xs text-muted-foreground">
                                {formatDate(email.created_at)}
                              </span>
                              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>

            {/* Detalhe do email selecionado */}
            {selectedEmail && (
              <Card className="mt-4">
                <CardContent className="p-4">
                  <EmailTrackingDetail
                    email={selectedEmail}
                    onClose={() => setSelectedEmail(null)}
                  />
                </CardContent>
              </Card>
            )}
          </div>

          {/* Top contatos por engajamento */}
          <div>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <TrendingUp className="h-4 w-4" />
                  Top Contatos
                </CardTitle>
                <CardDescription className="text-xs">Por engagement score</CardDescription>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-80">
                  {topContacts.length === 0 ? (
                    <p className="py-4 text-center text-xs text-muted-foreground">
                      Sem dados ainda
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {topContacts.map((contact, i) => (
                        <div
                          key={contact.email}
                          className="flex items-center gap-3 rounded-lg bg-muted/20 p-2"
                        >
                          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                            {i + 1}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">
                              {contact.display_name ?? contact.email}
                            </p>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <span className="flex items-center gap-0.5">
                                <Eye className="h-2.5 w-2.5" />
                                {contact.total_opens}
                              </span>
                              <span className="flex items-center gap-0.5">
                                <MousePointerClick className="h-2.5 w-2.5" />
                                {contact.total_clicks}
                              </span>
                            </div>
                          </div>
                          <Badge variant="secondary" className="text-xs font-bold">
                            {contact.engagement_score}pts
                          </Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}

export default EmailTrackingDashboard;
