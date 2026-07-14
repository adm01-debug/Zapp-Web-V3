import { Button } from '@/components/ui/button';
import { Image, FileVideo, FileAudio, File, Download, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { MediaItem } from './mediaUtils';

interface MediaGalleryListViewProps {
  items: MediaItem[];
  selectedItems: Set<string>;
  onToggleSelect: (id: string) => void;
  onPreview: (item: MediaItem) => void;
}

export function MediaGalleryListView({
  items,
  selectedItems,
  onToggleSelect,
  onPreview,
}: MediaGalleryListViewProps) {
  return (
    <div className="space-y-2 p-2">
      {items.map((item) => (
        <div
          key={item.id}
          role="button"
          tabIndex={0}
          className={cn(
            'flex cursor-pointer items-center gap-3 rounded-lg border p-2 transition-colors',
            selectedItems.has(item.id) ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'
          )}
          onClick={() => onPreview(item)}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onPreview(item)}
        >
          <div
            className={cn(
              'flex h-5 w-5 shrink-0 items-center justify-center rounded border-2',
              selectedItems.has(item.id)
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-muted-foreground/50'
            )}
            onClick={(e) => {
              e.stopPropagation();
              onToggleSelect(item.id);
            }}
          >
            {selectedItems.has(item.id) && <Check className="h-3 w-3" />}
          </div>
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-muted">
            {item.type === 'image' && <Image className="h-5 w-5 text-muted-foreground" />}
            {item.type === 'video' && <FileVideo className="h-5 w-5 text-muted-foreground" />}
            {item.type === 'audio' && <FileAudio className="h-5 w-5 text-muted-foreground" />}
            {item.type === 'document' && <File className="h-5 w-5 text-muted-foreground" />}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{item.filename}</p>
            <p className="text-xs text-muted-foreground">
              {format(new Date(item.created_at), 'dd/MM/yyyy HH:mm', { locale: ptBR })}
            </p>
          </div>
          <Button
            aria-label={`Baixar ${item.filename}`}
            variant="ghost"
            size="icon"
            asChild
            onClick={(e) => e.stopPropagation()}
          >
            <a href={item.url} download={item.filename}>
              <Download className="h-4 w-4" />
            </a>
          </Button>
        </div>
      ))}
    </div>
  );
}
