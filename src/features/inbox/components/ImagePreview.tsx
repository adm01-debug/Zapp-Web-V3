import { forwardRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Download, ZoomIn, ZoomOut, ImageOff, RotateCw, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useDownloadPermission } from '@/hooks/useDownloadPermission';
import { useMediaRefresh } from '@/features/inbox';
import { toast } from 'sonner';

interface ImagePreviewProps {
  src: string;
  alt?: string;
  onClose?: () => void;
}

export const ImagePreview = forwardRef<HTMLDivElement, ImagePreviewProps>(function ImagePreview(
  { src, alt = 'Image', onClose }: ImagePreviewProps,
  ref,
) {
  const [isZoomed, setIsZoomed] = useState(false);
  const { canDownload } = useDownloadPermission();

  const handleDownload = async () => {
    if (!canDownload) {
      toast.error('🔒 Download bloqueado por política de segurança', {
        description: 'O download de arquivos está desabilitado para proteção de dados. Solicite permissão ao administrador.',
      });
      return;
    }
    try {
      const response = await fetch(src);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = alt || 'image';
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Download iniciado!');
    } catch {
      toast.error('Erro ao baixar imagem');
    }
  };

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm flex items-center justify-center"
      onClick={onClose}
    >
      {/* Controls */}
      <div className="absolute top-4 right-4 flex items-center gap-2 z-10">
        <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
          <Button
            variant="secondary"
            size="icon"
            onClick={(e) => {
              e.stopPropagation();
              setIsZoomed(!isZoomed);
            }}
          >
            {isZoomed ? <ZoomOut className="w-4 h-4" /> : <ZoomIn className="w-4 h-4" />}
          </Button>
        </motion.div>
        <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
          <Button
            variant="secondary"
            size="icon"
            className={!canDownload ? 'opacity-50 cursor-not-allowed' : ''}
            onClick={(e) => {
              e.stopPropagation();
              handleDownload();
            }}
          >
            <Download className="w-4 h-4" />
          </Button>
        </motion.div>
        <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
          <Button aria-label="Fechar pré-visualização" variant="secondary" size="icon" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        </motion.div>
      </div>

      {/* Image */}
      <motion.img
        src={src}
        alt={alt}
        onClick={(e) => e.stopPropagation()}
        animate={{ scale: isZoomed ? 1.5 : 1 }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        className="max-w-[90vw] max-h-[85vh] object-contain rounded-lg shadow-2xl cursor-zoom-in"
        style={{ cursor: isZoomed ? 'zoom-out' : 'zoom-in' }}
      />
    </motion.div>
  );
});

interface MessageImageProps {
  src: string | null;
  alt?: string;
  /** When provided, allows auto-refreshing the image if WhatsApp URL expires (410/403). */
  refreshKey?: import('@/types/mediaRefresh').MediaRefreshKey;
}

export function MessageImage({ src, alt = 'Image', refreshKey }: MessageImageProps) {
  const [showPreview, setShowPreview] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const refresh = useMediaRefresh(src, refreshKey);
  const effectiveSrc = refresh.url ?? src;

  // Handle missing URL (likely still downloading)
  if (!effectiveSrc && !refresh.isRefreshing && !refresh.failed) {
    return (
      <div
        className="max-w-[280px] rounded-lg border border-border bg-muted/20 p-4 flex flex-col items-center gap-2 text-center"
      >
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" aria-hidden="true" />
        <p className="text-sm font-medium text-foreground">Baixando imagem...</p>
        <p className="text-xs text-muted-foreground">Aguarde enquanto processamos a mídia.</p>
      </div>
    );
  }

  // Fallback: esgotamos retries automáticos. Substitui o <img> por um card
  // de erro com mensagem clara e botão de retry manual (zera o contador).
  if (refresh.failed) {
    return (
      <div
        role="alert"
        className="max-w-[280px] rounded-lg border border-destructive/30 bg-destructive/5 p-4 flex flex-col items-center gap-2 text-center"
      >
        <ImageOff className="w-8 h-8 text-destructive" aria-hidden="true" />
        <p className="text-sm font-medium text-foreground">Imagem indisponível</p>
        <p className="text-xs text-muted-foreground">
          {refresh.error?.message ?? 'Não foi possível recuperar esta imagem.'}
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
      </div>
    );
  }

  return (
    <>
      <motion.div
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        className="relative cursor-pointer overflow-hidden rounded-md bg-card"
        onClick={() => setShowPreview(true)}
      >
        {(!isLoaded || refresh.isRefreshing) && (
          <div className="absolute inset-0 bg-muted animate-pulse rounded-lg" aria-busy={refresh.isRefreshing || undefined} />
        )}
        {effectiveSrc && (
          <motion.img
            key={effectiveSrc}
            src={effectiveSrc}
            alt={alt}
            onLoad={() => setIsLoaded(true)}
            onError={refresh.onError}
            initial={{ opacity: 0 }}
            animate={{ opacity: isLoaded ? 1 : 0 }}
            className="max-w-full w-auto max-h-[400px] object-cover rounded-md"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-background/20 to-transparent opacity-0 hover:opacity-100 transition-opacity flex items-end justify-center pb-2">
          <span className="text-primary-foreground text-xs font-medium">Clique para expandir</span>
        </div>
      </motion.div>

      <AnimatePresence>
        {showPreview && effectiveSrc && (
          <ImagePreview src={effectiveSrc} alt={alt} onClose={() => setShowPreview(false)} />
        )}
      </AnimatePresence>
    </>
  );
}
