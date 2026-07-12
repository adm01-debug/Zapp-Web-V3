import { useState, forwardRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { getLogger } from '@/lib/logger';

const log = getLogger('MediaPreview');
import { Download, Play, FileText, File, FileSpreadsheet,
  FileImage, FileArchive, Maximize, Loader2, VideoOff, RotateCw
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { formatFileSize, getFileExtension } from '@/utils/whatsappFileTypes';
import { VideoFullscreen } from './VideoFullscreen';
import { useMediaRefresh } from '@/features/inbox';

function getFileIcon(fileName: string, mimeType?: string) {
  const extension = getFileExtension(fileName).toLowerCase();
  if (['pdf'].includes(extension)) return <FileText className="w-8 h-8 text-[#f1592a]" />;
  if (['doc', 'docx'].includes(extension)) return <FileText className="w-8 h-8 text-[#2b72c4]" />;
  if (['xls', 'xlsx'].includes(extension)) return <FileSpreadsheet className="w-8 h-8 text-[#1d6f42]" />;
  if (['ppt', 'pptx'].includes(extension)) return <FileText className="w-8 h-8 text-[#d24726]" />;
  if (['zip', 'rar', '7z'].includes(extension)) return <FileArchive className="w-8 h-8 text-[#f8bc34]" />;
  if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(extension)) return <FileImage className="w-8 h-8 text-[hsl(var(--muted-foreground))]" />;
  return <File className="w-8 h-8 text-[hsl(var(--muted-foreground))]" />;
}

// Document Preview Component
interface DocumentPreviewProps {
  url: string;
  fileName: string;
  fileSize?: number;
  isSent: boolean;
}

export function DocumentPreview({ url, fileName, fileSize, isSent }: DocumentPreviewProps) {
  const [isDownloading, setIsDownloading] = useState(false);
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
      className={cn(
        "flex items-center gap-3 p-2.5 rounded-md min-w-[240px] max-w-[320px] cursor-pointer transition-colors",
        isSent ? "bg-chat-sent/20 border border-chat-sent/30" : "bg-chat-received border border-border"
      )}
      onClick={handleOpen}
    >
      <div className={cn("flex-shrink-0 w-12 h-12 rounded-md flex items-center justify-center bg-background")}>
        {getFileIcon(fileName)}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-normal text-[hsl(var(--foreground))] truncate">{fileName}</p>
        <div className="flex items-center gap-2 text-[12px] text-[hsl(var(--muted-foreground))]">
          <span className="font-medium">{extension}</span>
          {fileSize && (<><span>•</span><span>{formatFileSize(fileSize)}</span></>)}
        </div>
      </div>
      <button
        onClick={(e) => { e.stopPropagation(); handleDownload(); }}
        className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-colors text-[hsl(var(--muted-foreground))] hover:bg-background/10"
      >
        {isDownloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
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

export const VideoPreview = forwardRef<HTMLDivElement, VideoPreviewProps>(
  function VideoPreview({ url, caption, isSent, refreshKey, isPtv }, ref) {
    const [isPlaying, setIsPlaying] = useState(false);
    const [isMuted, setIsMuted] = useState(!isPtv); // Auto-play ptv with audio often, but standard video muted
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
            "rounded-lg border border-border bg-muted/20 p-4 flex flex-col items-center gap-2 text-center",
            isPtv ? "w-[200px] h-[200px] rounded-full justify-center" : "max-w-[300px]"
          )}
        >
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" aria-hidden="true" />
          <p className="text-sm font-medium text-foreground">Baixando {isPtv ? 'vídeo-nota' : 'vídeo'}...</p>
        </div>
      );
    }

    if (refresh.failed) {
      return (
        <div
          ref={ref}
          role="alert"
          className="max-w-[300px] rounded-lg border border-destructive/30 bg-destructive/5 p-4 flex flex-col items-center gap-2 text-center"
        >
          <VideoOff className="w-8 h-8 text-destructive" aria-hidden="true" />
          <p className="text-sm font-medium text-foreground">Vídeo indisponível</p>
          <p className="text-xs text-muted-foreground">
            {refresh.error?.message ?? 'Não foi possível recuperar este vídeo.'}
          </p>
          <Button
            variant="outline"
            size="sm"
            className="mt-1"
            onClick={() => { void refresh.retry(); }}
            disabled={refresh.isRefreshing}
          >
            {refresh.isRefreshing ? (
              <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
            ) : (
              <RotateCw className="w-3.5 h-3.5 mr-1" />
            )}
            Tentar novamente
          </Button>
          {caption && <p className={cn("text-xs mt-1", isSent ? "text-primary-foreground" : "text-foreground")}>{caption}</p>}
        </div>
      );
    }

    return (
      <div ref={ref}>
        <div className={cn("space-y-2", isPtv && "flex flex-col items-center")}>
          <motion.div 
            whileHover={{ scale: 1.02 }} 
            className={cn(
              "relative overflow-hidden w-auto cursor-pointer bg-card",
              isPtv ? "w-[240px] h-[240px] rounded-full border-2 border-primary/20" : "rounded-md max-w-full"
            )} 
            onClick={() => setShowFullscreen(true)}
          >
            {(!isLoaded || refresh.isRefreshing) && (
              <div className="absolute inset-0 bg-muted animate-pulse flex items-center justify-center" aria-busy={refresh.isRefreshing || undefined}>
                <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
              </div>
            )}
            {effectiveUrl && (
              <video
                key={effectiveUrl}
                src={effectiveUrl} 
                className={cn(
                  "object-cover",
                  isPtv ? "w-full h-full" : "w-full max-h-[400px] rounded-md"
                )} 
                muted={isMuted} 
                loop 
                playsInline
                onLoadedData={() => setIsLoaded(true)}
                onError={refresh.onError}
                onMouseEnter={(e) => { e.currentTarget.play(); setIsPlaying(true); }}
                onMouseLeave={(e) => { e.currentTarget.pause(); e.currentTarget.currentTime = 0; setIsPlaying(false); }}
              />
            )}
            <AnimatePresence>
              {!isPlaying && isLoaded && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-background/30 flex items-center justify-center">
                  <div className="w-12 h-12 rounded-full bg-background/90 flex items-center justify-center shadow-lg">
                    <Play className="w-6 h-6 text-primary ml-0.5" />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
            <button onClick={(e) => { e.stopPropagation(); setShowFullscreen(true); }} className="absolute top-2 right-2 p-1.5 rounded-full bg-background/50 text-primary-foreground opacity-0 group-hover:opacity-100 transition-opacity hover:bg-background/70" aria-label="Tela cheia">
              <Maximize className="w-3.5 h-3.5" />
            </button>
          </motion.div>
          {caption && <p className={cn("text-sm", isSent ? "text-primary-foreground" : "text-foreground")}>{caption}</p>}
        </div>
        <AnimatePresence>
          {showFullscreen && effectiveUrl && <VideoFullscreen url={effectiveUrl} onClose={() => setShowFullscreen(false)} />}
        </AnimatePresence>
      </div>
    );
  }
);

// Sticker Preview
interface StickerPreviewProps { url: string; isSent: boolean; }

export function StickerPreview({ url, isSent }: StickerPreviewProps) {
  const [isLoaded, setIsLoaded] = useState(false);
  return (
    <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 300, damping: 20 }} className="relative">
      {!isLoaded && <div className="w-[120px] h-[120px] bg-card animate-pulse rounded-md" />}
      <motion.img src={url} alt="Sticker" onLoad={() => setIsLoaded(true)} whileHover={{ scale: 1.05 }} className={cn("max-w-[120px] max-h-[120px] object-contain", !isLoaded && "hidden")} />
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

export function MediaMessage({ type, url, fileName, fileSize, caption, isSent, refreshKey }: MediaMessageProps) {
  switch (type) {
    case 'video':
      return <VideoPreview url={url} caption={caption} isSent={isSent} refreshKey={refreshKey} />;
    case 'document':
      return <DocumentPreview url={url || ''} fileName={fileName || 'document'} fileSize={fileSize} isSent={isSent} />;
    case 'sticker':
      return url ? <StickerPreview url={url} isSent={isSent} /> : <div className="w-[120px] h-[120px] bg-card animate-pulse rounded-md" />;
    default:
      return null;
  }
}