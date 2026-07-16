import { useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Camera, Upload, Trash2, Star, Loader2, User, ImagePlus, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { usePersonalStickers } from '@/hooks/usePersonalStickers';
import type { StickerItem } from './StickerTypes';

interface PersonalStickersProps {
  onSend?: (stickerUrl: string) => void;
}

export function PersonalStickers({ onSend }: PersonalStickersProps) {
  const {
    profile,
    stickers,
    isLoading,
    uploading,
    fileInputRef,
    handleUpload,
    toggleFavorite,
    deleteSticker,
    incrementUseCount,
  } = usePersonalStickers();
  const [search, setSearch] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<StickerItem | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const filteredStickers = stickers.filter(
    (s) => !search.trim() || s.name?.toLowerCase().includes(search.toLowerCase())
  );
  const folderName = (profile?.name || 'Meu').split(' ')[0];

  const handleSend = useCallback(
    (sticker: StickerItem) => {
      onSend?.(sticker.image_url);
      incrementUseCount(sticker);
    },
    [onSend, incrementUseCount]
  );

  return (
    <Card className="border border-border/60 bg-card">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10">
                <Camera className="h-4 w-4 text-primary" />
              </div>
              Pasta de {folderName}
            </CardTitle>
            <CardDescription className="mt-1 text-xs">
              Suas figurinhas pessoais — fotos e imagens só suas
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="text-xs">
              {stickers.length} fotos
            </Badge>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => handleUpload(e.target.files)}
            />
            <Button
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="gap-1.5"
            >
              {uploading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ImagePlus className="h-4 w-4" />
              )}
              {uploading ? 'Enviando...' : 'Adicionar'}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {stickers.length > 0 && (
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar nas minhas figurinhas..."
              className="h-8 pl-9 text-sm"
            />
          </div>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : stickers.length === 0 ? (
          <div
            role="button"
            tabIndex={0}
            className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-border/50 py-10 transition-colors hover:border-primary/30"
            onClick={() => fileInputRef.current?.click()}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && fileInputRef.current?.click()}
          >
            <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
              <User className="h-7 w-7 text-primary" />
            </div>
            <p className="text-sm font-medium text-foreground">Adicione suas fotos</p>
            <p className="mt-1 max-w-xs text-center text-xs text-muted-foreground">
              Clique para enviar fotos pessoais como figurinhas.
            </p>
            <Button variant="ghost" size="sm" className="mt-3 gap-1.5 text-xs">
              <Upload className="h-3.5 w-3.5" />
              Selecionar fotos
            </Button>
          </div>
        ) : filteredStickers.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Nenhuma figurinha encontrada
          </p>
        ) : (
          <ScrollArea className="h-[260px]">
            <div className="grid grid-cols-4 gap-1.5 p-1">
              <AnimatePresence>
                {filteredStickers.map((sticker) => (
                  <Tooltip key={sticker.id}>
                    <TooltipTrigger asChild>
                      <motion.button
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.8 }}
                        whileHover={{ scale: 1.08 }}
                        whileTap={{ scale: 0.92 }}
                        onClick={() => handleSend(sticker)}
                        onMouseEnter={() => setHoveredId(sticker.id)}
                        onMouseLeave={() => setHoveredId(null)}
                        className={cn(
                          'group relative aspect-square cursor-pointer overflow-hidden rounded-xl border border-transparent bg-muted/30 transition-all duration-200 hover:border-primary/30 hover:bg-muted/60 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1',
                          sticker.is_favorite && 'ring-1 ring-primary/20'
                        )}
                      >
                        <img
                          src={sticker.image_url}
                          alt={sticker.name || 'Figurinha pessoal'}
                          className="h-full w-full rounded-lg object-cover"
                          loading="lazy"
                        />
                        {sticker.is_favorite && (
                          <span className="absolute right-0.5 top-0.5">
                            <Star className="h-2.5 w-2.5 fill-primary text-primary" />
                          </span>
                        )}
                        <div
                          className={cn(
                            'absolute inset-0 flex items-center justify-center gap-2 bg-background/70 transition-opacity',
                            hoveredId === sticker.id ? 'opacity-100' : 'opacity-0'
                          )}
                        >
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleFavorite.mutate(sticker);
                            }}
                            aria-label={
                              sticker.is_favorite
                                ? 'Remover dos favoritos'
                                : 'Adicionar aos favoritos'
                            }
                            className="rounded-lg bg-background/80 p-1.5 transition-colors hover:bg-background"
                          >
                            <Star
                              className={cn(
                                'h-4 w-4',
                                sticker.is_favorite
                                  ? 'fill-primary text-primary'
                                  : 'text-muted-foreground'
                              )}
                            />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeleteTarget(sticker);
                            }}
                            aria-label="Excluir figurinha"
                            className="rounded-lg bg-background/80 p-1.5 transition-colors hover:bg-destructive/10"
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </button>
                        </div>
                      </motion.button>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="text-xs">
                      <p className="font-medium">{sticker.name || 'Figurinha pessoal'}</p>
                    </TooltipContent>
                  </Tooltip>
                ))}
              </AnimatePresence>
              <motion.button
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                onClick={() => fileInputRef.current?.click()}
                className="flex aspect-square flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-border/50 text-muted-foreground transition-colors hover:border-primary/30 hover:text-primary"
              >
                <ImagePlus className="h-5 w-5" />
                <span className="text-[9px]">Adicionar</span>
              </motion.button>
            </div>
          </ScrollArea>
        )}
      </CardContent>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir figurinha pessoal?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget && (
                <span className="mt-2 flex items-center gap-3">
                  <img
                    src={deleteTarget.image_url}
                    alt=""
                    className="h-12 w-12 rounded-lg bg-muted object-cover"
                  />
                  <span>
                    &ldquo;{deleteTarget.name || 'Figurinha'}&rdquo; será removida permanentemente.
                  </span>
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTarget && deleteSticker.mutate(deleteTarget)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
