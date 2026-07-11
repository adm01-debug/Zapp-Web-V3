import { useState } from 'react';
import { useWhatsAppStatus, type WhatsAppStatusMessage } from '@/features/inbox';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, RefreshCw, Image as ImageIcon, Video, Type, Clock, WifiOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatRelativeTime } from '@/lib/formatters';
import { StoryViewer } from './StoryViewer';

interface WhatsAppStatusSectionProps {
  phone: string;
}

const _getStatusIcon = (msg: WhatsAppStatusMessage) => {
  if (msg.message?.imageMessage) return <ImageIcon className="h-3.5 w-3.5 text-primary" />;
  if (msg.message?.videoMessage) return <Video className="h-3.5 w-3.5 text-accent-foreground" />;
  return <Type className="h-3.5 w-3.5 text-success" />;
};

const _getStatusLabel = (msg: WhatsAppStatusMessage) => {
  if (msg.message?.imageMessage?.caption) return msg.message.imageMessage.caption;
  if (msg.message?.videoMessage?.caption) return msg.message.videoMessage.caption;
  if (msg.message?.extendedTextMessage?.text) return msg.message.extendedTextMessage.text;
  if (msg.message?.conversation) return msg.message.conversation;
  if (msg.message?.imageMessage) return '📷 Foto';
  if (msg.message?.videoMessage) return '🎥 Vídeo';
  if (msg.status) return `Status: ${msg.status}`;
  return 'Status';
};

const _getStatusTime = (msg: WhatsAppStatusMessage) => {
  const ts = msg.messageTimestamp;
  if (!ts) return null;
  const date = new Date(typeof ts === 'string' ? parseInt(ts, 10) * 1000 : ts * 1000);
  return formatRelativeTime(date);
};

export function WhatsAppStatusSection({ phone }: WhatsAppStatusSectionProps) {
  const { statusMessages, presence, loading, error, refresh } = useWhatsAppStatus(phone);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(0);

  const openViewer = (index: number) => {
    setViewerIndex(index);
    setViewerOpen(true);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-6">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        <span className="ml-2 text-xs text-muted-foreground">Carregando status...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center gap-2 py-4">
        <WifiOff className="h-5 w-5 text-muted-foreground/40" />
        <p className="text-xs text-muted-foreground">{error}</p>
        <Button variant="ghost" size="sm" onClick={refresh} className="h-7 text-xs">
          <RefreshCw className="mr-1 h-3 w-3" />
          Tentar novamente
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3" data-testid="whatsapp-status-section">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div
            className={cn(
              'h-2.5 w-2.5 rounded-full',
              presence.loading
                ? 'animate-pulse bg-muted-foreground/30'
                : presence.isOnline
                  ? 'bg-success'
                  : 'bg-muted-foreground/40'
            )}
          />
          <span className="text-xs text-muted-foreground">
            {presence.loading ? (
              'Verificando...'
            ) : presence.isOnline ? (
              <span className="font-medium text-success">Online agora</span>
            ) : presence.lastSeen ? (
              `Visto por último ${presence.lastSeen}`
            ) : (
              'Offline'
            )}
          </span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 hover:bg-primary/10"
          onClick={refresh}
          disabled={loading}
        >
          <RefreshCw className={cn('h-3 w-3', loading && 'animate-spin')} />
        </Button>
      </div>

      {statusMessages.length === 0 ? (
        <div className="flex flex-col items-center gap-1.5 py-4 text-center">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted/20">
            <Clock className="h-5 w-5 text-muted-foreground/30" />
          </div>
          <p className="text-xs text-muted-foreground/60">Nenhum status disponível</p>
          <p className="text-[10px] text-muted-foreground/40">Os status desaparecem após 24h</p>
        </div>
      ) : (
        <Button
          variant="outline"
          size="sm"
          onClick={() => openViewer(0)}
          className="h-9 w-full gap-2 border-primary/20 text-xs hover:border-primary/30 hover:bg-primary/10"
        >
          <ImageIcon className="h-3.5 w-3.5 text-primary" />
          Ver Status
          <Badge
            variant="secondary"
            className="ml-auto h-4 border-0 bg-primary/10 px-1.5 py-0 text-[10px] text-primary"
          >
            {statusMessages.length}
          </Badge>
        </Button>
      )}

      <StoryViewer
        messages={statusMessages}
        initialIndex={viewerIndex}
        open={viewerOpen}
        onClose={() => setViewerOpen(false)}
        pushName={statusMessages[0]?.pushName}
      />
    </div>
  );
}
