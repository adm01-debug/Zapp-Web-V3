/* eslint-disable react-refresh/only-export-components */
import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ExternalLink, Play, Globe, X, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import DOMPurify from 'dompurify';
import {
  isImageUrl,
  isVideoUrl,
  isYouTubeUrl,
  getYouTubeThumbnail,
  getDomain,
  getFavicon,
  extractLinks,
  escapeHtml,
  type LinkMetadata,
} from './linkPreviewUtils';

export { extractLinks };

interface LinkPreviewProps {
  url: string;
  className?: string;
  compact?: boolean;
  showRemove?: boolean;
  onRemove?: () => void;
}

export function LinkPreview({
  url,
  className,
  compact = false,
  showRemove,
  onRemove,
}: LinkPreviewProps) {
  const [metadata, setMetadata] = useState<LinkMetadata | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(false);
  const [imageError, setImageError] = useState(false);

  useEffect(() => {
    setIsLoading(true);
    setError(false);

    // Check for direct media URLs first
    if (isImageUrl(url)) {
      setMetadata({ url, type: 'image', image: url, title: url.split('/').pop() || 'Image' });
      setIsLoading(false);
      return;
    }
    if (isVideoUrl(url)) {
      setMetadata({ url, type: 'video', title: url.split('/').pop() || 'Video' });
      setIsLoading(false);
      return;
    }
    if (isYouTubeUrl(url)) {
      setMetadata({
        url,
        type: 'video',
        title: 'YouTube Video',
        image: getYouTubeThumbnail(url) || undefined,
        siteName: 'YouTube',
        favicon: 'https://www.youtube.com/favicon.ico',
      });
      setIsLoading(false);
      return;
    }

    // Use a metadata API if available, or fallback to domain-based info
    // For now, we enhance the "singelo" experience by showing at least the domain and favicon
    const fetchMetadata = async () => {
      try {
        // Enforce singelo appearance: minimal metadata
        setMetadata({
          url,
          type: 'website',
          title: getDomain(url),
          siteName: getDomain(url),
          favicon: getFavicon(url),
        });
        setIsLoading(false);
      } catch {
        setError(true);
        setIsLoading(false);
      }
    };

    fetchMetadata();
  }, [url]);

  if (isLoading)
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className={cn(
          'flex items-center gap-2 rounded-lg border border-border/50 bg-muted/50 p-3',
          className
        )}
      >
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        <span className="text-sm text-muted-foreground">Carregando preview...</span>
      </motion.div>
    );

  if (error || !metadata)
    return (
      <motion.a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        initial={{ opacity: 0, y: 5 }}
        animate={{ opacity: 1, y: 0 }}
        className={cn(
          'flex items-center gap-2 rounded-lg bg-muted/30 p-2 text-sm text-primary underline-offset-2 transition-colors hover:bg-muted/50 hover:underline',
          className
        )}
      >
        <Globe className="h-4 w-4 shrink-0" />
        <span className="truncate">{url}</span>
        <ExternalLink className="h-3 w-3 shrink-0" />
      </motion.a>
    );

  if (metadata.type === 'image' && metadata.image && !imageError)
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className={cn('group relative overflow-hidden rounded-xl', className)}
      >
        {showRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="absolute right-2 top-2 z-10 rounded-full bg-background/50 p-1.5 text-primary-foreground opacity-0 transition-opacity hover:bg-background/70 group-hover:opacity-100"
          >
            <X className="h-4 w-4" />
          </button>
        )}
        <a href={url} target="_blank" rel="noopener noreferrer">
          <img
            src={metadata.image}
            alt={metadata.title || 'Imagem do link'}
            onError={() => setImageError(true)}
            className="max-h-64 max-w-full rounded-xl object-cover transition-transform hover:scale-[1.02]"
          />
        </a>
      </motion.div>
    );

  if (compact)
    return (
      <motion.a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        initial={{ opacity: 0, x: -5 }}
        animate={{ opacity: 1, x: 0 }}
        className={cn(
          'group flex items-center gap-2 rounded-lg bg-muted/50 p-2 transition-colors hover:bg-muted/70',
          className
        )}
      >
        {metadata.favicon && !imageError ? (
          <img
            src={metadata.favicon}
            alt=""
            className="h-4 w-4 rounded"
            onError={() => setImageError(true)}
          />
        ) : (
          <Globe className="h-4 w-4 text-muted-foreground" />
        )}
        <span className="flex-1 truncate text-sm font-medium">
          {metadata.title || getDomain(url)}
        </span>
        <ExternalLink className="h-3 w-3 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
      </motion.a>
    );

  return (
    <motion.a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        'group block overflow-hidden rounded-xl border border-border/50 bg-card transition-all hover:border-primary/30',
        className
      )}
    >
      {metadata.image && !imageError && (
        <div className="relative aspect-video overflow-hidden bg-muted">
          <img
            src={metadata.image}
            alt={metadata.title || metadata.siteName || getDomain(url)}
            onError={() => setImageError(true)}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
          {metadata.type === 'video' && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/30">
              <div className="rounded-full bg-background/90 p-3 transition-transform group-hover:scale-110">
                <Play className="h-6 w-6 fill-black text-foreground" />
              </div>
            </div>
          )}
        </div>
      )}
      <div className="space-y-1 p-3">
        <div className="flex items-center gap-2">
          {metadata.favicon && !imageError ? (
            <img
              src={metadata.favicon}
              alt=""
              className="h-4 w-4 rounded"
              onError={() => setImageError(true)}
            />
          ) : (
            <Globe className="h-4 w-4 text-muted-foreground" />
          )}
          <span className="truncate text-xs text-muted-foreground">
            {metadata.siteName || getDomain(url)}
          </span>
        </div>
        {metadata.title && (
          <h4 className="line-clamp-2 text-sm font-medium transition-colors group-hover:text-primary">
            {metadata.title}
          </h4>
        )}
        {metadata.description && (
          <p className="line-clamp-2 text-xs text-muted-foreground">{metadata.description}</p>
        )}
      </div>
      {showRemove && (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onRemove?.();
          }}
          className="absolute right-2 top-2 rounded-full bg-background/50 p-1.5 text-primary-foreground opacity-0 transition-opacity hover:bg-background/70 group-hover:opacity-100"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </motion.a>
  );
}

interface TextWithLinksProps {
  text: string;
  className?: string;
  showPreviews?: boolean;
  maxPreviews?: number;
}

export function TextWithLinks({
  text,
  className,
  showPreviews = true,
  maxPreviews = 3,
}: TextWithLinksProps) {
  const links = useMemo(() => extractLinks(text), [text]);
  const displayLinks = links.slice(0, maxPreviews);
  const formattedText = useMemo(() => {
    let result = escapeHtml(text);
    links.forEach((link) => {
      const escaped = escapeHtml(link);
      result = result.replace(
        escaped,
        `<a href="${encodeURI(link)}" target="_blank" rel="noopener noreferrer" class="text-primary underline underline-offset-2 hover:text-primary/80">${escaped}</a>`
      );
    });
    return DOMPurify.sanitize(result, {
      ALLOWED_TAGS: ['a'],
      ALLOWED_ATTR: ['href', 'target', 'rel', 'class'],
    });
  }, [text, links]);

  return (
    <div className={cn('space-y-2', className)}>
      <div dangerouslySetInnerHTML={{ __html: formattedText }} />
      {showPreviews && displayLinks.length > 0 && (
        <AnimatePresence>
          <div className="space-y-2 pt-2">
            {displayLinks.map((link, i) => (
              <motion.div
                key={link}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.1 }}
              >
                <LinkPreview url={link} compact={displayLinks.length > 1} />
              </motion.div>
            ))}
          </div>
        </AnimatePresence>
      )}
    </div>
  );
}
