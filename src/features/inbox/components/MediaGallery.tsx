import { useState, useMemo, useEffect, useCallback, memo } from 'react';
import { GenericEmptyState } from '@/components/ui/GenericEmptyState';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  Image,
  FileVideo,
  FileAudio,
  File,
  Download,
  Search,
  Grid3X3,
  List,
  X,
  Loader2,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { MediaItem, getMediaType, getFilename } from './media-gallery/mediaUtils';
import { MediaCard } from './media-gallery/MediaCard';
import { MediaPreviewDialog } from './media-gallery/MediaPreviewDialog';
import { MediaGalleryListView } from './media-gallery/MediaGalleryListView';
import { dbFrom } from '@/integrations/datasource/db';
import { queryKeys } from '@/services/api/queryKeys';

const MediaGridItem = memo(function MediaGridItem({
  item,
  isSelected,
  onToggleSelect,
  onPreview,
}: {
  item: MediaItem;
  isSelected: boolean;
  onToggleSelect: (id: string) => void;
  onPreview: (item: MediaItem) => void;
}) {
  const handleSelect = useCallback(() => onToggleSelect(item.id), [onToggleSelect, item.id]);
  const handlePreview = useCallback(() => onPreview(item), [onPreview, item]);
  return <MediaCard item={item} isSelected={isSelected} onSelect={handleSelect} onPreview={handlePreview} />;
});

interface MediaGalleryProps {
  contactId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Media Gallery component. */
export function MediaGallery({ contactId, open, onOpenChange }: MediaGalleryProps) {
  const [filter, setFilter] = useState<'all' | 'image' | 'video' | 'audio' | 'document'>('all');
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [previewItem, setPreviewItem] = useState<MediaItem | null>(null);
  const [isDownloading, _setIsDownloading] = useState(false);
  const [isSlow, setIsSlow] = useState(false);

  const {
    data: messages,
    isLoading,
    isError,
    error,
    isFetching,
    refetch,
  } = useQuery({
    queryKey: queryKeys.mediaGallery.contact(contactId),
    queryFn: async () => {
      const { data, error } = await dbFrom('messages')
        .select('id, media_url, message_type, content, created_at')
        .eq('contact_id', contactId)
        .not('media_url', 'is', null)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: open && !!contactId,
    retry: 1,
  });

  // Mark fetch as "slow" after 1.5s so we can show a friendlier hint.
  useEffect(() => {
    if (!isFetching) {
      setIsSlow(false);
      return;
    }
    const t = setTimeout(() => setIsSlow(true), 1500);
    return () => clearTimeout(t);
  }, [isFetching]);

  const mediaItems = useMemo((): MediaItem[] => {
    if (!messages) return [];
    return messages
      .filter((m): m is typeof m & { media_url: string } => Boolean(m.media_url))
      .map((m) => ({
        id: m.id,
        url: m.media_url,
        type: getMediaType(m.media_url, m.message_type),
        filename: getFilename(m.media_url),
        created_at: m.created_at,
        message_content: m.content,
      }));
  }, [messages]);

  const filteredItems = useMemo(
    () =>
      mediaItems.filter((item) => {
        const matchesFilter = filter === 'all' || item.type === filter;
        const matchesSearch =
          !search ||
          item.filename.toLowerCase().includes(search.toLowerCase()) ||
          item.message_content.toLowerCase().includes(search.toLowerCase());
        return matchesFilter && matchesSearch;
      }),
    [mediaItems, filter, search]
  );

  const counts = useMemo(
    () => ({
      all: mediaItems.length,
      image: mediaItems.filter((i) => i.type === 'image').length,
      video: mediaItems.filter((i) => i.type === 'video').length,
      audio: mediaItems.filter((i) => i.type === 'audio').length,
      document: mediaItems.filter((i) => i.type === 'document').length,
    }),
    [mediaItems]
  );

  const toggleSelect = useCallback((id: string) => {
    setSelectedItems((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleDownloadSelected = async () => {
    const { toast } = await import('sonner');
    toast.error('🔒 Download bloqueado por política de segurança', {
      description: 'O download de arquivos está desabilitado para proteção de dados.',
    });
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="flex max-h-[90vh] max-w-4xl flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Grid3X3 className="h-5 w-5" />
              Galeria de Mídia<Badge variant="secondary">{counts.all} itens</Badge>
            </DialogTitle>
          </DialogHeader>

          <div className="flex items-center gap-4 py-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar mídia..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
            <div className="flex items-center gap-1 rounded-md border p-1">
              <Button
                aria-label="Visualização em grade"
                variant={viewMode === 'grid' ? 'secondary' : 'ghost'}
                size="icon"
                className="h-8 w-8"
                onClick={() => setViewMode('grid')}
              >
                <Grid3X3 className="h-4 w-4" />
              </Button>
              <Button
                aria-label="Visualização em lista"
                variant={viewMode === 'list' ? 'secondary' : 'ghost'}
                size="icon"
                className="h-8 w-8"
                onClick={() => setViewMode('list')}
              >
                <List className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <Tabs
            value={filter}
            onValueChange={(v) =>
              setFilter(
                v as typeof filter /* ignore-audit: Select/Tabs value string narrowed to union; developer controls option values */
              )
            }
          >
            <TabsList className="grid grid-cols-5">
              <TabsTrigger value="all" className="gap-1">
                Todos{' '}
                <Badge variant="outline" className="ml-1">
                  {counts.all}
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="image" className="gap-1">
                <Image className="h-3 w-3" />
                <span className="hidden sm:inline">Imagens</span>
                <Badge variant="outline" className="ml-1">
                  {counts.image}
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="video" className="gap-1">
                <FileVideo className="h-3 w-3" />
                <span className="hidden sm:inline">Vídeos</span>
                <Badge variant="outline" className="ml-1">
                  {counts.video}
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="audio" className="gap-1">
                <FileAudio className="h-3 w-3" />
                <span className="hidden sm:inline">Áudios</span>
                <Badge variant="outline" className="ml-1">
                  {counts.audio}
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="document" className="gap-1">
                <File className="h-3 w-3" />
                <span className="hidden sm:inline">Docs</span>
                <Badge variant="outline" className="ml-1">
                  {counts.document}
                </Badge>
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <AnimatePresence>
            {selectedItems.size > 0 && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="flex items-center justify-between rounded-lg bg-primary/10 p-2"
              >
                <span className="text-sm">{selectedItems.size} item(s) selecionado(s)</span>
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setSelectedItems(new Set())}>
                    <X className="mr-1 h-4 w-4" />
                    Limpar
                  </Button>
                  <Button size="sm" onClick={handleDownloadSelected} disabled={isDownloading}>
                    {isDownloading ? (
                      <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                    ) : (
                      <Download className="mr-1 h-4 w-4" />
                    )}
                    Download
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Background refetch indicator (visível só quando já há dados na tela) */}
          {isFetching && !isLoading && !isError && (
            <div
              role="status"
              aria-live="polite"
              className="flex items-center gap-2 border-b px-2 py-1 text-xs text-muted-foreground"
            >
              <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
              Atualizando galeria…
            </div>
          )}

          <ScrollArea className="min-h-[300px] flex-1">
            {isLoading ? (
              <div role="status" aria-live="polite" aria-label="Carregando mídias" className="p-2">
                <div className="grid grid-cols-4 gap-2">
                  {[...Array(8)].map((_, i) => (
                    <Skeleton key={i} className="aspect-square rounded-lg" />
                  ))}
                </div>
                {isSlow && (
                  <div className="mt-6 flex flex-col items-center gap-2 text-center">
                    <Loader2
                      className="h-4 w-4 animate-spin text-muted-foreground"
                      aria-hidden="true"
                    />
                    <p className="max-w-xs text-xs text-muted-foreground">
                      A busca está demorando mais que o normal. Aguarde ou verifique sua conexão.
                    </p>
                    <Button variant="ghost" size="sm" onClick={() => refetch()} className="gap-2">
                      <RefreshCw className="h-3.5 w-3.5" />
                      Tentar de novo
                    </Button>
                  </div>
                )}
              </div>
            ) : isError ? (
              <div
                role="alert"
                className="flex flex-col items-center justify-center gap-3 px-4 py-12 text-center"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
                  <AlertCircle className="h-6 w-6 text-destructive" />
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-medium text-foreground">
                    Não foi possível carregar a mídia
                  </p>
                  <p className="max-w-sm text-xs text-muted-foreground">
                    {error instanceof Error && error.message
                      ? error.message
                      : 'Verifique sua conexão e tente novamente.'}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => refetch()}
                  disabled={isFetching}
                  className="gap-2"
                >
                  {isFetching ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                  Tentar novamente
                </Button>
              </div>
            ) : filteredItems.length === 0 ? (
              <GenericEmptyState
                icon={Image}
                title="Sem mídias"
                description="Nenhuma mídia encontrada nesta conversa"
                className="py-8"
              />
            ) : viewMode === 'grid' ? (
              <div className="grid grid-cols-4 gap-2 p-2">
                {filteredItems.map((item) => (
                  <MediaGridItem
                    key={item.id}
                    item={item}
                    isSelected={selectedItems.has(item.id)}
                    onToggleSelect={toggleSelect}
                    onPreview={setPreviewItem}
                  />
                ))}
              </div>
            ) : (
              <MediaGalleryListView
                items={filteredItems}
                selectedItems={selectedItems}
                onToggleSelect={toggleSelect}
                onPreview={setPreviewItem}
              />
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>

      <MediaPreviewDialog
        item={previewItem}
        open={!!previewItem}
        onOpenChange={(open) => !open && setPreviewItem(null)}
      />
    </>
  );
}
