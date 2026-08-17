import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Calendar, Bell, Clock, ExternalLink, Settings } from 'lucide-react';
import { getGoogleCalendarSyncStatus, type GoogleCalendarSyncReason } from '@/lib/googleCalendarSync';

/** Estado real da integração, derivado do contrato zapp-google-calendar-sync (G1). */
type IntegrationState = 'checking' | GoogleCalendarSyncReason;

const PENDING_TOOLTIP = 'Configuração pendente — credenciais OAuth do Google Calendar não configuradas no ambiente.';
const NOT_IMPLEMENTED_TOOLTIP = 'Integração configurada, mas a sincronização com a Google Calendar API ainda não foi implementada.';

/** Google Calendar Integration component for the integrations section. */
export function GoogleCalendarIntegration() {
  const [state, setState] = useState<IntegrationState>('checking');
  const [autoSync, setAutoSync] = useState(false);
  const [reminderMinutes, setReminderMinutes] = useState('15');
  const [calendarId, setCalendarId] = useState('');

  // Estado honesto: consulta o contrato real (edge zapp-google-calendar-sync).
  // A integração está desligada até existir config (zapp.google_calendar_config).
  useEffect(() => {
    let cancelled = false;
    getGoogleCalendarSyncStatus()
      .then((status) => {
        if (cancelled) return;
        if (
          status.reason === 'not_configured' ||
          status.reason === 'disabled' ||
          status.reason === 'not_implemented'
        ) {
          setState(status.reason);
        } else {
          setState('error');
        }
      })
      .catch(() => {
        if (!cancelled) setState('error');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const pending = state === 'not_configured';
  // Controles de configuração só fazem sentido com a integração ativa.
  const controlsLocked = state === 'checking' || state === 'not_configured' || state === 'disabled' || state === 'error';

  const connectTooltip =
    state === 'not_configured'
      ? PENDING_TOOLTIP
      : state === 'not_implemented'
        ? NOT_IMPLEMENTED_TOOLTIP
        : state === 'disabled'
          ? 'Integração desativada na configuração do ambiente.'
          : 'Verificando a configuração da integração…';

  const renderStatusBadge = () => {
    switch (state) {
      case 'checking':
        return <Badge variant="secondary">Verificando…</Badge>;
      case 'not_configured':
        return (
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge variant="secondary">Desconectado</Badge>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-xs text-xs">{PENDING_TOOLTIP}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        );
      case 'disabled':
        return (
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge variant="secondary">Desativado</Badge>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-xs text-xs">
                Integração configurada, mas desativada na configuração do ambiente.
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        );
      case 'not_implemented':
        return (
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge variant="success">Configurado</Badge>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-xs text-xs">{NOT_IMPLEMENTED_TOOLTIP}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        );
      case 'error':
        return (
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge variant="destructive">Indisponível</Badge>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-xs text-xs">
                Falha ao consultar o status da integração. Tente novamente mais tarde.
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        );
    }
  };

  return (
    <div className="space-y-6 p-6 max-w-3xl mx-auto">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
          <Calendar className="w-6 h-6 text-primary" />
          Google Calendar
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Sincronize agendamentos e follow-ups com seu calendário
        </p>
      </motion.div>

      {/* Connection Status */}
      <Card className="border-secondary/30">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Status da Conexão</CardTitle>
            {renderStatusBadge()}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {pending
              ? 'A integração ainda não está configurada. As credenciais OAuth do Google Calendar precisam ser adicionadas à configuração do ambiente (zapp.google_calendar_config) antes de conectar.'
              : state === 'not_implemented'
                ? 'A integração está configurada, mas a sincronização com a Google Calendar API ainda não foi implementada.'
                : 'Conecte sua conta Google para sincronizar eventos e agendamentos diretamente das conversas.'}
          </p>
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button disabled>
                  <Calendar className="w-4 h-4 mr-2" />
                  Conectar Google Calendar
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-xs text-xs">{connectTooltip}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </CardContent>
      </Card>

      {/* Settings */}
      <Card className="border-secondary/30">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Settings className="w-4 h-4" /> Configurações
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label>Sincronização automática</Label>
              <p className="text-xs text-muted-foreground">
                Criar eventos automaticamente ao agendar mensagens
              </p>
            </div>
            {controlsLocked ? (
              <TooltipProvider delayDuration={200}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div>
                      <Switch checked={autoSync} onCheckedChange={setAutoSync} disabled />
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-xs text-xs">
                    {pending ? PENDING_TOOLTIP : 'Sincronização ainda não implementada.'}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            ) : (
              <Switch checked={autoSync} onCheckedChange={setAutoSync} />
            )}
          </div>

          <Separator className="bg-border/30" />

          <div className="space-y-2">
            <Label>Lembrete padrão (minutos)</Label>
            <Input
              type="number"
              value={reminderMinutes}
              onChange={(e) => setReminderMinutes(e.target.value)}
              placeholder="15"
              disabled={controlsLocked}
              className="w-32 bg-muted border-border"
            />
          </div>

          <Separator className="bg-border/30" />

          <div className="space-y-2">
            <Label>Calendar ID (opcional)</Label>
            <Input
              value={calendarId}
              onChange={(e) => setCalendarId(e.target.value)}
              placeholder="primary"
              disabled={controlsLocked}
              className="bg-muted border-border"
            />
            <p className="text-xs text-muted-foreground">Deixe vazio para usar o calendário principal</p>
          </div>

          {state === 'not_implemented' && (
            <p className="text-xs text-muted-foreground">
              Sincronização ainda não implementada — as preferências acima ainda não são aplicadas.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Features */}
      <Card className="border-secondary/30">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Funcionalidades</CardTitle>
          <CardDescription className="text-xs">
            O que você pode fazer com a integração
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {[
              { icon: Calendar, title: 'Criar eventos de conversa', desc: 'Crie reuniões a partir do chat' },
              { icon: Bell, title: 'Lembretes de follow-up', desc: 'Receba alertas para retornar' },
              { icon: Clock, title: 'Disponibilidade do agente', desc: 'Mostre horários livres no chat' },
              { icon: ExternalLink, title: 'Links de agendamento', desc: 'Envie links para o cliente agendar' },
            ].map((feature) => (
              <div key={feature.title} className="flex items-start gap-3 p-3 rounded-lg bg-muted/30">
                <feature.icon className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-foreground">{feature.title}</p>
                  <p className="text-xs text-muted-foreground">{feature.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
