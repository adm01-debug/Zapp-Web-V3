import { Button } from '@/components/ui/button';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ProductImage {
  url: string;
  label: string;
}

interface ProductImageGridProps {
  visibleImages: ProductImage[];
  selectedImages: Set<string>;
  setSelectedImages: React.Dispatch<React.SetStateAction<Set<string>>>;
  toggleImage: (url: string) => void;
}

export function ProductImageGrid({
  visibleImages,
  selectedImages,
  setSelectedImages,
  toggleImage,
}: ProductImageGridProps) {
  const allSelected = selectedImages.size === visibleImages.length;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">
          {selectedImages.size} de {visibleImages.length} fotos selecionadas
        </span>
        <Button
          variant="link"
          size="sm"
          className="h-auto p-0 text-xs"
          onClick={() =>
            allSelected
              ? setSelectedImages(new Set())
              : setSelectedImages(new Set(visibleImages.map((i) => i.url)))
          }
        >
          {allSelected ? 'Desmarcar todas' : 'Selecionar todas'}
        </Button>
      </div>
      <div className="flex flex-wrap gap-2">
        {visibleImages.map((img) => (
          <button type="button"
            key={img.url}
            onClick={() => toggleImage(img.url)}
            className={cn(
              'relative h-16 w-16 overflow-hidden rounded-lg border-2 transition-all',
              selectedImages.has(img.url)
                ? 'border-primary ring-2 ring-primary/30'
                : 'border-border/50 opacity-60 hover:opacity-100'
            )}
          >
            <img
              src={img.url}
              alt={img.label}
              className="h-full w-full object-cover"
              loading="lazy"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = 'none';
              }}
            />
            {selectedImages.has(img.url) && (
              <div className="absolute right-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-primary">
                <Check className="h-3 w-3 text-primary-foreground" />
              </div>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
