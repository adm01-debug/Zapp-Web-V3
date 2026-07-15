// @ts-nocheck
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';
import { Trash2, Play, Pause, Star, Edit2, Check, Image as ImageIcon, X } from 'lucide-react';
import type { MediaItem, MediaType } from '@/hooks/media-library/useMediaLibrary';

function InlineCategorySelect({
  value,
  categories,
  onChange,
}: {
  value: string;
  categories: Record<string, string>;
  onChange: (cat: string) => void;
}) {
  const allCategories = { ...categories };
  if (value && !(value in allCategories)) allCategories[value] = '❓';
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-6 w-[130px] border-border/40 text-[10px]">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {Object.entries(allCategories).map(([cat, emoji]) => (
          <SelectItem key={cat} value={cat} className="text-xs">
            {emoji} {cat}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export interface MediaItemRowProps {
  item: MediaItem;
  type: MediaType;
  isEditing: boolean;
  editName: string;
  isSelected: boolean;
  isPlaying: boolean;
  categories: Record<string, string>;
  onToggleSelect: () => void;
  onPreview: () => void;
  onStartEdit: () => void;
  onEditNameChange: (name: string) => void;
  onConfirmRename: () => void;
  onCancelEdit: () => void;
  onCategoryChange: (cat: string) => void;
  onToggleFavorite: () => void;
  onDelete: () => void;
}

export function MediaItemRow({
  item,
  type,
  isEditing,
  editName,
  isSelected,
  isPlaying,
  categories,
  onToggleSelect,
  onPreview,
  onStartEdit,
  onEditNameChange,
  onConfirmRename,
  onCancelEdit,
  onCategoryChange,
  onToggleFavorite,
  onDelete,
}: MediaItemRowProps) {
  const url = type === 'audio_memes' ? item.audio_url : item.image_url;

  return (
    <div
      className={cn(
        'flex items-center gap-3 border-b border-border/30 px-3 py-2 transition-colors hover:bg-muted/20',
        isSelected && 'bg-primary/5'
      )}
    >
      <Checkbox checked={isSelected} onCheckedChange={onToggleSelect} />
      <div className="h-10 w-12 shrink-0">
        {type === 'audio_memes' ? (
          <button
            onClick={onPreview}
            className={cn(
              'flex h-10 w-10 items-center justify-center rounded-lg transition-colors',
              isPlaying
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:bg-primary/20'
            )}
          >
            {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </button>
        ) : (
          <div className="h-10 w-10 overflow-hidden rounded-lg border border-border/30 bg-muted/30">
            {url ? (
              <img
                src={url}
                alt={item.name || ''}
                className="h-full w-full object-contain p-0.5"
                loading="lazy"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center">
                <ImageIcon className="h-4 w-4 text-muted-foreground/40" />
              </div>
            )}
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        {isEditing ? (
          <div className="flex items-center gap-1">
            <Input
              value={editName}
              onChange={(e) => onEditNameChange(e.target.value)}
              className="h-7 text-xs"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') onConfirmRename();
                if (e.key === 'Escape') onCancelEdit();
              }}
            />
            <Button
              aria-label="Confirmar renomeação"
              size="icon"
              variant="ghost"
              className="h-6 w-6"
              onClick={onConfirmRename}
            >
              <Check className="h-3 w-3" />
            </Button>
            <Button
              aria-label="Cancelar renomeação"
              size="icon"
              variant="ghost"
              className="h-6 w-6"
              onClick={onCancelEdit}
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
        ) : (
          <p className="truncate text-xs font-medium text-foreground">{item.name || 'Sem nome'}</p>
        )}
      </div>
      <div className="hidden w-[130px] sm:block">
        <InlineCategorySelect
          value={item.category}
          categories={categories}
          onChange={onCategoryChange}
        />
      </div>
      <div className="hidden w-16 text-center sm:block">
        <Badge variant="secondary" className="text-[9px]">
          {item.use_count || 0}x
        </Badge>
      </div>
      <div className="hidden w-12 text-center sm:block">
        <button
          onClick={onToggleFavorite}
          aria-label={item.is_favorite ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}
          className="rounded p-1 transition-colors hover:bg-muted/50"
        >
          <Star
            className={cn(
              'mx-auto h-3.5 w-3.5 transition-colors',
              item.is_favorite
                ? 'fill-warning text-warning'
                : 'text-muted-foreground/30 hover:text-warning'
            )}
          />
        </button>
      </div>
      <div className="flex w-24 items-center justify-end gap-1">
        <Button
          aria-label="Renomear item"
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={onStartEdit}
        >
          <Edit2 className="h-3.5 w-3.5 text-muted-foreground" />
        </Button>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button aria-label="Excluir item" variant="ghost" size="icon" className="h-7 w-7">
              <Trash2 className="h-3.5 w-3.5 text-destructive" />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Excluir item</AlertDialogTitle>
              <AlertDialogDescription>
                Excluir &ldquo;{item.name || 'Sem nome'}&rdquo; permanentemente?
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={onDelete}
                className="bg-destructive text-destructive-foreground"
              >
                Excluir
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}