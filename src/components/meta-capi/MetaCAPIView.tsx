import { useState } from 'react';
import { useMetaCapi } from '@/hooks/meta-capi/useMetaCapi';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Activity,
  Send,
  CheckCircle,
  XCircle,
  BarChart3,
  Zap,
  MousePointer,
  ShoppingCart,
  CreditCard,
  UserPlus,
  Eye,
  Settings,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const EVENT_TYPES = [
  { name: 'Purchase', label: 'Compra', icon: CreditCard, color: 'text-success' },
  { name: 'Lead', label: 'Lead', icon: UserPlus, color: 'text-info' },
  { name: 'InitiateCheckout', label: 'Checkout', icon: ShoppingCart, color: 'text-warning' },
  { name: 'AddToCart', label: 'Carrinho', icon: ShoppingCart, color: 'text-warning' },
  { name: 'ViewContent', label: 'Visualização', icon: Eye, color: 'text-primary' },
  { name: 'Contact', label: 'Contato', icon: MousePointer, color: 'text-info' },
];

export function MetaCAPIView() {
  const {
    events,
    loading,
    pixelId,
    setPixelId,
    autoTrack,
    setAutoTrack,
    saveConfig,
    sendTestEvent,
  } = useMetaCapi();
  const [showConfig, setShowConfig] = useState(false);

  const handleSaveConfig = async () => {
    await saveConfig();
    setShowConfig(false);
  };

  const totalEvents = events.length;
  const sentEvents = events.filter((e) => e.sent_to_meta).length;
  const eventCounts = EVENT_TYPES.map((et) => ({
    ...et,
    count: events.filter((e) => e.event_name === et.name).length,
  }));

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Meta Conversions API"
        subtitle="Rastreie eventos de conversão para otimização de anúncios"
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setShowConfig(true)} className="gap-2">
              <Settings className="h-4 w-4" /> Configurar
            </Button>
          </div>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 px-6 pb-4 md:grid-cols-4">
        <Card className="border-border/30 bg-card/50">
          <CardContent className="p-4">
            <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
              <Activity className="h-3.5 w-3.5" /> Total Eventos
            </div>
            <p className="text-lg font-bold">{totalEvents}</p>
          </CardContent>
        </Card>
        <Card className="border-border/30 bg-card/50">
          <CardContent className="p-4">
            <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
              <Send className="h-3.5 w-3.5" /> Enviados ao Meta
            </div>
            <p className="text-lg font-bold text-success">{sentEvents}</p>
          </CardContent>
        </Card>
        <Card className="border-border/30 bg-card/50">
          <CardContent className="p-4">
            <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
              <Zap className="h-3.5 w-3.5" /> Pixel ID
            </div>
            <p className="truncate text-sm">{pixelId || 'Não configurado'}</p>
          </CardContent>
        </Card>
        <Card className="border-border/30 bg-card/50">
          <CardContent className="p-4">
            <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
              <BarChart3 className="h-3.5 w-3.5" /> Auto-tracking
            </div>
            <p className="text-lg font-bold">{autoTrack ? 'Ativo' : 'Inativo'}</p>
          </CardContent>
        </Card>
      </div>

      {/* Event Type Cards */}
      <div className="px-6 pb-4">
        <h3 className="mb-3 text-sm font-semibold text-foreground">Eventos por Tipo</h3>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
          {eventCounts.map(({ name, label, icon: Icon, color, count }) => (
            <Card
              key={name}
              className="cursor-pointer border-border/30 bg-card/50 transition-all hover:border-secondary/30"
              onClick={() => sendTestEvent(name)}
            >
              <CardContent className="p-3 text-center">
                <Icon className={cn('mx-auto mb-1 h-6 w-6', color)} />
                <p className="text-xs font-medium">{label}</p>
                <p className="mt-1 text-lg font-bold">{count}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Events Timeline */}
      <div className="flex-1 overflow-y-auto px-6 pb-6">
        <h3 className="mb-3 text-sm font-semibold text-foreground">Eventos Recentes</h3>
        <div className="space-y-2">
          {events.map((event) => {
            const eventType = EVENT_TYPES.find((et) => et.name === event.event_name);
            const EventIcon = eventType?.icon || Activity;
            return (
              <Card key={event.id} className="border-border/30 bg-card/50">
                <CardContent className="flex items-center gap-3 p-3">
                  <div
                    className={cn(
                      'flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10'
                    )}
                  >
                    <EventIcon className="h-4 w-4 text-primary" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{event.event_name}</span>
                      <Badge
                        variant={event.sent_to_meta ? 'default' : 'secondary'}
                        className="h-4 text-[10px]"
                      >
                        {event.sent_to_meta ? 'Enviado' : 'Pendente'}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {event.action_source} • {new Date(event.event_time).toLocaleString('pt-BR')}
                    </p>
                  </div>
                  {event.sent_to_meta ? (
                    <CheckCircle className="h-4 w-4 text-success" />
                  ) : (
                    <XCircle className="h-4 w-4 text-muted-foreground" />
                  )}
                </CardContent>
              </Card>
            );
          })}
          {events.length === 0 && !loading && (
            <div className="py-12 text-center text-muted-foreground">
              <Activity className="mx-auto mb-3 h-10 w-10 opacity-20" />
              <p className="text-sm">Nenhum evento registrado</p>
              <p className="text-xs">Clique em um tipo de evento acima para testar</p>
            </div>
          )}
        </div>
      </div>

      {/* Config Dialog */}
      <Dialog open={showConfig} onOpenChange={setShowConfig}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Configurar Meta CAPI</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Meta Pixel ID</Label>
              <Input
                value={pixelId}
                onChange={(e) => setPixelId(e.target.value)}
                placeholder="Ex: 123456789"
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label>Auto-tracking</Label>
                <p className="text-xs text-muted-foreground">
                  Rastrear automaticamente eventos de conversa
                </p>
              </div>
              <Switch checked={autoTrack} onCheckedChange={setAutoTrack} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConfig(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSaveConfig}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
