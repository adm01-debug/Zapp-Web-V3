import { useState, useCallback, useEffect } from 'react';
import { useEvolutionApi } from '@/hooks/useEvolutionApi';
import { ACTIVE_WHATSAPP_INSTANCE } from '@/lib/constants/whatsappInstances';
import type { WhatsAppStatusMessage } from '@/features/inbox';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Loader2, Image as ImageIcon, Video, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { formatRelativeTime } from '@/lib/formatters';

const DEFAULT_INSTANCE_NAME = ACTIVE_WHATSAPP_INSTANCE;

const getMediaType = (msg: WhatsAppStatusMessage): 'image' | 'video' | 'text' => {
  if (msg.message?.imageMessage) return 'image';
  if (msg.message?.videoMessage) return 'video';
  return 'text';
};

const getTextContent = (msg: WhatsAppStatusMessage) => {
  if (msg.message?.imageMessage?.caption) return msg.message.imageMessage.caption;
  if (msg.message?.videoMessage?.caption) return msg.message.videoMessage.caption;
  if (msg.message?.extendedTextMessage?.text) return msg.message.extendedTextMessage.text;
  if (msg.message?.conversation) return msg.message.conversation;
  return null;
};

const getBgColor = (msg: WhatsAppStatusMessage) => {
  const bg = msg.message?.extendedTextMessage?.backgroundColor;
  if (typeof bg === 'number') {
    const hex = (bg >>> 0).toString(16).padStart(8, '0');
    return `#${hex.slice(2)}`;
  }
  return null;
};

const toDataUrl = (base64?: string | null, mimetype?: string | null) => {
  if (!base64 || !mimetype) return null;
  return `data:${mimetype};base64,${base64}`;
};

const getStatusTime = (msg: WhatsAppStatusMessage) => {
  const ts = msg.messageTimestamp;
  if (!ts) return null;
  const date = new Date(typeof ts === 'string' ? parseInt(ts, 10) * 1000 : ts * 1000);
  return formatRelativeTime(date);
};

interface StoryViewerProps {
  messages: WhatsAppStatusMessage[];
  initialIndex: number;
  open: boolean;
  onClose: () => void;
  pushName?: string;
}

interface ResolvedMedia {
  src: string | null;
  mimetype: string | null;
}

export function StoryViewer({ messages, initialIndex, open, onClose, pushName }: StoryViewerProps) {
  const { getMediaBase64 } = useEvolutionApi();
  const [index, setIndex] = useState(initialIndex);
  const [resolvedMedia, setResolvedMedia] = useState<ResolvedMedia>({ src: null, mimetype: null });
  const [mediaLoading, setMediaLoading] = useState(false);
  const [mediaError, setMediaError] = useState<string | null>(null);

  useEffect(() => {
    if (open) setIndex(initialIndex);
  }, [open, initialIndex]);

  // Clamp index when messages list shrinks (e.g. refresh returns fewer items)
  useEffect(() => {
    if (messages.length > 0) setIndex((i) => Math.min(i, messages.length - 1));
  }, [messages.length]);

  const goNext = useCallback(
    () => setIndex((i) => Math.min(i + 1, messages.length - 1)),
    [messages.length]
  );
  const goPrev = useCallback(() => setIndex((i) => Math.max(i - 1, 0)), []);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') goNext();
      else if (e.key === 'ArrowLeft') goPrev();
      else if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, goNext, goPrev, onClose]);

  useEffect(() => {
    if (!open || !messages.length) return;
    const current = messages[index] ?? messages[0];
    if (!current) return;
    const mediaType = getMediaType(current);
    setResolvedMedia({ src: null, mimetype: null });
    setMediaError(null);
    if (mediaType === 'text') {
      setMediaLoading(false);
      return;
    }

    let cancelled = false;
    const loadMedia = async () => {
      setMediaLoading(true);
      try {
        const response = (await getMediaBase64(
          DEFAULT_INSTANCE_NAME,
          current,
          mediaType === 'video'
        )) as { base64?: string; mimetype?: string } | null;
        if (cancelled) return;
        const src = toDataUrl(response?.base64 ?? null, response?.mimetype ?? null);
        if (!src) {
          setMediaError('Não foi possível carregar a mídia deste status.');
          setResolvedMedia({ src: null, mimetype: response?.mimetype ?? null });
          return;
        }
        setResolvedMedia({ src, mimetype: response?.mimetype ?? null });
      } catch (error) {
        if (cancelled) return;
        setMediaError(error instanceof Error ? error.message : 'Erro ao carregar mídia');
      } finally {
        if (!cancelled) setMediaLoading(false);
      }
    };
    loadMedia();
    return () => {
      cancelled = true;
    };
  }, [open, index, messages, getMediaBase64]);

  if (!open || !messages.length) return null;

  const current = messages[index] ?? messages[0];
  const mediaType = getMediaType(current);
  const textContent = getTextContent(current);
  const bgColor = getBgColor(current);
  const time = getStatusTime(current);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="w-[95vw] max-w-2xl gap-0 overflow-hidden border-border/20 bg-background/95 p-0 [&>button]:hidden">
        <div className="flex gap-0.5 px-3 pt-3">
          {messages.map((_, i) => (
            <div key={i} className="h-[3px] flex-1 overflow-hidden rounded-full bg-background/20">
              <div
                className={cn(
                  'h-full rounded-full transition-all duration-300',
                  i < index ? 'w-full bg-background' : i === index ? 'w-full bg-primary' : 'w-0'
                )}
              />
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/20 text-xs font-bold text-primary">
              {(pushName || '?')[0]?.toUpperCase()}
            </div>
            <div>
              <p className="text-xs font-medium text-foreground/90">{pushName || 'Contato'}</p>
              {time && <p className="text-[10px] text-foreground/50">{time}</p>}
            </div>
          </div>
          <div className="flex items-center gap-1">
            <span className="mr-2 text-[10px] text-foreground/40">
              {index + 1}/{messages.length}
            </span>
            <Button
              aria-label="Fechar visualizador de status"
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="h-8 w-8 text-foreground/70 hover:bg-background/10 hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="relative flex max-h-[70vh] min-h-[50vh] items-center justify-center">
          {index > 0 && (
            <button
              onClick={goPrev}
              className="absolute left-2 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-muted/60 text-muted-foreground backdrop-blur transition-all hover:bg-muted/80 hover:text-foreground"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
          )}
          {index < messages.length - 1 && (
            <button
              onClick={goNext}
              className="absolute right-2 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-muted/60 text-muted-foreground backdrop-blur transition-all hover:bg-muted/80 hover:text-foreground"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          )}

          <AnimatePresence mode="wait">
            <motion.div
              key={current.id ?? index}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.2 }}
              className="flex h-full w-full items-center justify-center px-14"
            >
              {mediaType === 'image' ? (
                mediaLoading ? (
                  <div
                    role="status"
                    aria-live="polite"
                    className="flex flex-col items-center gap-3 text-foreground/70"
                  >
                    <Loader2 className="h-6 w-6 animate-spin" aria-hidden="true" />
                    <p className="text-sm">Carregando imagem...</p>
                  </div>
                ) : resolvedMedia.src ? (
                  <img
                    src={resolvedMedia.src}
                    alt="Status"
                    className="max-h-[65vh] max-w-full rounded-lg object-contain"
                    loading="eager"
                  />
                ) : (
                  <div className="space-y-2 text-center text-foreground/70">
                    <ImageIcon className="mx-auto h-8 w-8" />
                    <p className="text-sm">{mediaError || 'Imagem indisponível'}</p>
                  </div>
                )
              ) : mediaType === 'video' ? (
                mediaLoading ? (
                  <div
                    role="status"
                    aria-live="polite"
                    className="flex flex-col items-center gap-3 text-foreground/70"
                  >
                    <Loader2 className="h-6 w-6 animate-spin" aria-hidden="true" />
                    <p className="text-sm">Carregando vídeo...</p>
                  </div>
                ) : resolvedMedia.src ? (
                  <video
                    src={resolvedMedia.src}
                    controls
                    autoPlay
                    className="max-h-[65vh] max-w-full rounded-lg object-contain"
                  />
                ) : (
                  <div className="space-y-2 text-center text-foreground/70">
                    <Video className="mx-auto h-8 w-8" />
                    <p className="text-sm">{mediaError || 'Vídeo indisponível'}</p>
                  </div>
                )
              ) : (
                <div
                  className="flex w-full max-w-md items-center justify-center rounded-2xl p-8 text-center"
                  style={{ backgroundColor: bgColor || 'hsl(var(--primary) / 0.15)' }}
                >
                  <p className="whitespace-pre-wrap break-words text-lg font-medium leading-relaxed text-foreground">
                    {textContent || 'Status'}
                  </p>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        {mediaType !== 'text' && textContent && (
          <div className="bg-gradient-to-t from-black/80 to-transparent px-6 py-4">
            <p className="whitespace-pre-wrap break-words text-center text-sm text-foreground/90">
              {textContent}
            </p>
          </div>
        )}
        {(mediaType === 'text' || !textContent) && <div className="h-4" />}
      </DialogContent>
    </Dialog>
  );
}
