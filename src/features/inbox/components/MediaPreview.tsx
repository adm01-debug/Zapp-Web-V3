import { useState, forwardRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { log } from '@/lib/logger';
import {
  Download,
  Play,
  FileText,
  File,
  FileSpreadsheet,
  FileImage,
  FileArchive,
  Maximize,
  Loader2,
  VideoOff,
  RotateCw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { formatFileSize, getFileExtension } from '@/utils/whatsappFileTypes';
import { VideoFullscreen } from './VideoFullscreen';
import { useMediaRefresh } from '@/features/inbox';

function getFileIcon(fileName: string, _mimeType?: string) {
  const extension = getFileExtension(fileName).toLowerCase();
  if (['pdf'].includes(extension)) return <FileText className="h-8 w-8 text-[#f1592a]" />;
  if (['doc', 'docx'].includes(extension)) return <FileText className="h-8 w-8 text-[#2b72c4]" />;
  if (['xls', 'xlsx'].includes(extension))
    return <FileSpreadsheet className="h-8 w-8 text-[#1d6f42]" />;
  if (['ppt', 'pptx'].includes(extension)) return <FileText className="h-8 w-8 text-[#d24726]" />;
  if (['zip', 'rar', '7z'].includes(extension))
    return <FileArchive className="h-8 w-8 text-[#f8bc34]" />;
  if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(extension))
    return <FileImage className="h-8 w-8 text-[hsl(var(--muted-foreground))]" />;
  return <File className="h-8 w-8 text-[hsl(var(--muted-foreground))]" />;
}

// Document Preview Component
interface DocumentPreviewProps {
  url: string;
  fileName: string;
  fileSize?: number;
  isSent: boolean;
}

export function DocumentPreview({ url: _url, fileName, fileSize, isSent }: DocumentPreviewProps) {
  const [isDownloading, _setIsDownloading] = useState(false);
  const extension = getFileExtension(fileName).toUpperCase();

  const handleDownload = async () => {
    log.warn('[SECURITY] File download blocked by data protection policy');
    const { toast: toastFn } = await import('sonner');
    toastFn.error('🔒 Download bloqueado por política de segurança', {
      description: 'O download de arquivos está desabilitado para proteção de dados.',
    });
  };

  const handleOpen = () => {
    import('sonner').then(({ toast }) => {
      toast.error('🔒 Abertura externa bloqueada por política de segurança');
    });
  };

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label="Abrir pré-visualização do arquivo"
      className={cn(
        'flex min-w-[240px] max-w-[320px] cursor-pointer items-center gap-3 rounded-md p-2.5 transition-colors',
        isSent
          ? 'border border-chat-sent/30 bg-chat-sent/20'
          : 'border border-border bg-chat-received'
      )}
      onClick={handleOpen}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && handleOpen()}
    >
      <div
        className={cn(
          'flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-md bg-background'
        )}
      >
        {getFileIcon(fileName)}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-normal text-[hsl(var(--foreground))]">{fileName}</p>
        <div className="flex items-center gap-2 text-[12px] text-[hsl(var(--muted-foreground))]">
          <span className="font-medium">{extension}</span>
          {fileSize && (
            <>
              <span>•</span>
              <span>{formatFileSize(fileSize)}</span>
            </>
          )}
        </div>
      </div>
      <button
        onClick={(e) => {
          e.stopPropagation();
          handleDownload();
        }}
        className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-[hsl(var(--muted-foreground))] transition-colors hover:bg-background/10"
      >
        {isDownloading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Download className="h-4 w-4" />
        )}
      </button>
    </div>
  );
}

// Video Preview Component
interface VideoPreviewProps {
  url: string | null;
  caption?: string;
  isSent: boolean;
  /** When provided, allows auto-refreshing the video src on 410/403 errors. */
  refreshKey?: import('@/types/mediaRefresh').MediaRefreshKey;
  /** Whether this is a circular video-note (ptv) */
  isPtv?: boolean;
}

export const VideoPreview = forwardRef<HTMLDivElement, VideoPreviewProps>(function VideoPreview(
  { url, caption, isSent, refreshKey, isPtv },
  ref
) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, _setIsMuted] = useState(!isPtv); // Auto-play ptv with audio often, but standard video muted
  const [showFullscreen, setShowFullscreen] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const refresh = useMediaRefresh(url, refreshKey);
  const effectiveUrl = refresh.url ?? url;

  // Handle missing URL (likely still downloading)
  if (!effectiveUrl && !refresh.isRefreshing && !refresh.failed) {
    return (
      <div
        ref={ref}
        className={cn(
          'flex flex-col items-center gap-2 rounded-lg border border-border bg-muted/20 p-4 text-center',
          isPtv ? 'h-[200px] w-[200px] justify-center rounded-full' : 'max-w-[300px]'
        )}
      >
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" aria-hidden="true" />
        <p className="text-sm font-medium text-foreground">
          Baixando {isPtv ? 'vídeo-nota' : 'vídeo'}...
        </p>
      </div>
    );
  }

  if (refresh.failed) {
    return (
      <div
        ref={ref}
        role="alert"
        className="flex max-w-[300px] flex-col items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-center"
      >
        <VideoOff className="h-8 w-8 text-destructive" aria-hidden="true" />
        <p className="text-sm font-medium text-foreground">Vídeo indisponível</p>
        <p className="text-xs text-muted-foreground">
          {refresh.error?.message ?? 'Não foi possível recuperar este vídeo.'}
        </p>
        <Button
          variant="outline"
          size="sm"
          className="mt-1"
          onClick={() => {
            void refresh.retry();
          }}
          disabled={refresh.isRefreshing}
        >
          {refresh.isRefreshing ? (
            <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
          ) : (
            <RotateCw className="mr-1 h-3.5 w-3.5" />
          )}
          Tentar novamente
        </Button>
        {caption && (
          <p className={cn('mt-1 text-xs', isSent ? 'text-primary-foreground' : 'text-foreground')}>
            {caption}
          </p>
        )}
      </div>
    );
  }

  return (
    <div ref={ref}>
      <div className={cn('space-y-2', isPtv && 'flex flex-col items-center')}>
        <motion.div
          whileHover={{ scale: 1.02 }}
          className={cn(
            'relative w-auto cursor-pointer overflow-hidden bg-card',
            isPtv
              ? 'h-[240px] w-[240px] rounded-full border-2 border-primary/20'
              : 'max-w-full rounded-md'
          )}
          onClick={() => setShowFullscreen(true)}
        >
          {(!isLoaded || refresh.isRefreshing) && (
            <div
              className="absolute inset-0 flex animate-pulse items-center justify-center bg-muted"
              aria-busy={refresh.isRefreshing || undefined}
            >
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          )}
          {effectiveUrl && (
            <video
              key={effectiveUrl}
              src={effectiveUrl}
              className={cn(
                'object-cover',
                isPtv ? 'h-full w-full' : 'max-h-[400px] w-full rounded-md'
              )}
              muted={isMuted}
              loop
              playsInline
              onLoadedData={() => setIsLoaded(true)}
              onError={refresh.onError}
              onMouseEnter={(e) => {
                e.currentTarget.play();
                setIsPlaying(true);
              }}
              onMouseLeave={(e) => {
                e.currentTarget.pause();
                e.currentTarget.currentTime = 0;
                setIsPlaying(false);
              }}
            />
          )}
          <AnimatePresence>
            {!isPlaying && isLoaded && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 flex items-center justify-center bg-background/30"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-background/90 shadow-lg">
                  <Play className="ml-0.5 h-6 w-6 text-primary" />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowFullscreen(true);
            }}
            className="absolute right-2 top-2 rounded-full bg-background/50 p-1.5 text-primary-foreground opacity-0 transition-opacity hover:bg-background/70 group-hover:opacity-100"
            aria-label="Tela cheia"
          >
            <Maximize className="h-3.5 w-3.5" />
          </button>
        </motion.div>
        {caption && (
          <p className={cn('text-sm', isSent ? 'text-primary-foreground' : 'text-foreground')}>
            {caption}
          </p>
        )}
      </div>
      <AnimatePresence>
        {showFullscreen && effectiveUrl && (
          <VideoFullscreen url={effectiveUrl} onClose={() => setShowFullscreen(false)} />
        )}
      </AnimatePresence>
    </div>
  );
});

// Sticker Preview
interface StickerPreviewProps {
  url: string;
  isSent: boolean;
}

export function StickerPreview({ url, isSent: _isSent }: StickerPreviewProps) {
  const [isLoaded, setIsLoaded] = useState(false);
  return (
    <motion.div
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 300, damping: 20 }}
      className="relative"
    >
      {!isLoaded && <div className="h-[120px] w-[120px] animate-pulse rounded-md bg-card" />}
      <motion.img
        src={url}
        alt="Figurinha"
        onLoad={() => setIsLoaded(true)}
        whileHover={{ scale: 1.05 }}
        className={cn('max-h-[120px] max-w-[120px] object-contain', !isLoaded && 'hidden')}
      />
    </motion.div>
  );
}

// Combined Media Message Component
interface MediaMessageProps {
  type: 'video' | 'document' | 'sticker';
  url: string | null;
  fileName?: string;
  fileSize?: number;
  caption?: string;
  isSent: boolean;
  refreshKey?: import('@/types/mediaRefresh').MediaRefreshKey;
}

export function MediaMessage({
  type,
  url,
  fileName,
  fileSize,
  caption,
  isSent,
  refreshKey,
}: MediaMessageProps) {
  switch (type) {
    case 'video':
      return <VideoPreview url={url} caption={caption} isSent={isSent} refreshKey={refreshKey} />;
    case 'document':
      return (
        <DocumentPreview
          url={url || ''}
          fileName={fileName || 'document'}
          fileSize={fileSize}
          isSent={isSent}
        />
      );
    case 'sticker':
      return url ? (
        <StickerPreview url={url} isSent={isSent} />
      ) : (
        <div className="h-[120px] w-[120px] animate-pulse rounded-md bg-card" />
      );
    default:
      return null;
  }
}
