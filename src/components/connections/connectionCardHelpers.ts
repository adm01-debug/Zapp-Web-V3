import { Wifi, WifiOff, QrCode, RefreshCw, Loader2 } from 'lucide-react';

/** status Config component for the connections section. */
export const statusConfig: Record<
  string,
  { label: string; color: string; icon: typeof Wifi; bgClass: string }
> = {
  connected: {
    label: 'Online',
    color: 'text-primary',
    icon: Wifi,
    bgClass: 'bg-primary/10 border-primary/20',
  },
  disconnected: {
    label: 'Desconectado',
    color: 'text-destructive-foreground',
    icon: WifiOff,
    bgClass: 'bg-destructive/10 border-destructive/20',
  },
  disconnecting: {
    label: 'Desconectando...',
    color: 'text-destructive-foreground',
    icon: Loader2,
    bgClass: 'bg-destructive/10 border-destructive/20 animate-pulse',
  },
  connecting: {
    label: 'Conectando...',
    color: 'text-warning-foreground',
    icon: RefreshCw,
    bgClass: 'bg-warning/10 border-warning/20',
  },
  pending: {
    label: 'Aguardando QR',
    color: 'text-warning-foreground',
    icon: QrCode,
    bgClass: 'bg-warning/10 border-warning/20',
  },
};

/** HEALTH_REASON_LABEL component for the connections section. */
export const HEALTH_REASON_LABEL: Record<string, { short: string; long: string; severe: boolean }> =
  {
    phantom_session: {
      short: 'Sessão Fantasma',
      long: 'O servidor Evolution diz que está "open", mas o WhatsApp não reconhece a sessão. Reconecte.',
      severe: true,
    },
    webhook_silent: {
      short: 'Instância Silenciosa',
      long: 'Nenhuma mensagem recebida nos últimos 30 minutos. Verifique o celular.',
      severe: false,
    },
    stale_session: {
      short: 'Sem atividade recente',
      long: 'Nenhuma mensagem nas últimas 24h. Normal em horários de baixo movimento — a conexão continua ativa.',
      severe: false,
    },
    socket_closed: {
      short: 'Socket Fechado',
      long: 'A conexão com o servidor de mensagens foi encerrada.',
      severe: true,
    },
    http_error: {
      short: 'Erro de API',
      long: 'Falha ao comunicar com a Evolution API. Verifique as credenciais.',
      severe: true,
    },
    timeout: {
      short: 'Timeout',
      long: 'O servidor demorou demais para responder o health-check.',
      severe: true,
    },
    auth_failure: {
      short: 'Falha de Auth',
      long: 'A API Key da Evolution parece inválida ou expirou.',
      severe: true,
    },
    rate_limit: {
      short: 'Rate Limit',
      long: 'Muitas requisições em pouco tempo. Aguarde um momento.',
      severe: false,
    },
  };

/** get Last Activity component for the connections section. */
export function getLastActivity(updatedAt: string | null | undefined): string | null {
  if (!updatedAt) return null;
  const diff = Date.now() - new Date(updatedAt).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'agora';
  if (mins < 60) return `${mins} min atrás`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h atrás`;
  return `${Math.floor(hours / 24)}d atrás`;
}
