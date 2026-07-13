// @ts-nocheck
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
// Tooltip removido para evitar loop de refs com Popover/Slot.
import { cn } from '@/lib/utils';
import { AnimatePresence } from 'framer-motion';
import {
  Sticker,
  Search,
  Plus,
  Loader2,
  Upload,
  X,
  Grid3X3,
  LayoutGrid,
  Grid2X2,
} from 'lucide-react';

import { CATEGORY_LABELS } from './stickers/StickerTypes';
import { StickerUploadPreview } from './stickers/StickerUploadPreview';
import { StickerGrid } from './stickers/StickerGrid';
import { StickerCategoryBar } from './stickers/StickerCategoryBar';
import { useStickerPicker } from '@/hooks/sticker-picker/useStickerPicker';

interface StickerPickerProps {
  onSendSticker: (stickerUrl: string) => void;
  disabled?: boolean;
}

export function StickerPicker({ onSendSticker, disabled }: StickerPickerProps) {
  const {
    open,
    setOpen,
    stickers,
    filtered,
    loading,
    search,
    setSearch,
    uploading,
    activeCategory,
    setActiveCategory,
    showFavorites,
    setShowFavorites,
    showRecent,
    setShowRecent,
    pendingUpload,
    setPendingUpload,
    gridSize,
    isDragOver,
    fileInputRef,
    searchInputRef,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    handleFileSelect,
    handleConfirmUpload,
    handleCancelUpload,
    handleSend,
    toggleFavorite,
    handleCategoryChange,
    handleDelete,
    cycleGridSize,
  } = useStickerPicker(onSendSticker);

  const GridSizeIcon = gridSize === 'sm' ? Grid3X3 : gridSize === 'md' ? LayoutGrid : Grid2X2;

  return (
    <Popover
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) {
          setPendingUpload(null);
          setSearch('');
        }
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 shrink-0 text-muted-foreground hover:bg-muted hover:text-foreground"
          disabled={disabled}
          aria-label="Figurinhas"
          title="Figurinhas"
        >
          <Sticker className="h-[18px] w-[18px]" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className={cn(
          'w-[380px] border-border bg-popover p-0',
          isDragOver && 'ring-2 ring-primary ring-offset-2'
        )}
        align="end"
        side="top"
        sideOffset={8}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {isDragOver && (
          <div className="absolute inset-0 z-50 flex items-center justify-center rounded-lg border-2 border-dashed border-primary bg-primary/10">
            <div className="text-center">
              <Upload className="mx-auto mb-2 h-8 w-8 text-primary" />
              <p className="text-sm font-medium text-primary">Solte aqui para adicionar</p>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
          <h4 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Sticker className="h-4 w-4 text-primary" />
            Figurinhas
          </h4>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-foreground"
              onClick={cycleGridSize}
              aria-label="Alterar tamanho da grade"
            >
              <GridSizeIcon className="h-3.5 w-3.5" />
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/webp,image/png,image/gif,image/jpeg"
              className="hidden"
              onChange={handleFileSelect}
            />
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-primary"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading || !!pendingUpload}
              aria-label="Adicionar nova figurinha"
            >
              {uploading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Plus className="h-3.5 w-3.5" />
              )}
            </Button>
          </div>
        </div>

        <AnimatePresence>
          {pendingUpload && (
            <div className="border-b border-border/50 px-3 py-2">
              <StickerUploadPreview
                pending={pendingUpload}
                onConfirm={handleConfirmUpload}
                onCancel={handleCancelUpload}
              />
            </div>
          )}
        </AnimatePresence>

        <div className="border-b border-border/50 px-3 py-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={searchInputRef}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nome ou categoria..."
              className="h-8 border-border/50 bg-muted/50 pl-8 text-xs"
              aria-label="Buscar figurinhas"
            />
            {search && (
              <button
                onClick={() => {
                  setSearch('');
                  searchInputRef.current?.focus();
                }}
                className="absolute right-2 top-1/2 -translate-y-1/2"
                aria-label="Limpar busca"
              >
                <X className="h-3 w-3 text-muted-foreground" />
              </button>
            )}
          </div>
        </div>

        <StickerCategoryBar
          stickers={stickers}
          activeCategory={activeCategory}
          showFavorites={showFavorites}
          showRecent={showRecent}
          onCategoryChange={(cat) => {
            setActiveCategory(cat);
            setShowFavorites(false);
            setShowRecent(false);
          }}
          onToggleFavorites={() => {
            setShowFavorites(!showFavorites);
            setActiveCategory(null);
            setShowRecent(false);
          }}
          onToggleRecent={() => {
            setShowRecent(!showRecent);
            setActiveCategory(null);
            setShowFavorites(false);
          }}
        />

        <StickerGrid
          stickers={filtered}
          loading={loading}
          search={search}
          gridSize={gridSize}
          onSend={handleSend}
          onToggleFavorite={toggleFavorite}
          onDelete={handleDelete}
          onCategoryChange={handleCategoryChange}
          onAddClick={() => fileInputRef.current?.click()}
        />

        <div className="flex items-center justify-between border-t border-border/30 px-3 py-2">
          <span className="text-[10px] text-muted-foreground">
            {filtered.length}/{stickers.length} figurinhas
            {showRecent && ' · Mais usadas'}
            {showFavorites && ' · Favoritas'}
            {activeCategory && ` · ${CATEGORY_LABELS[activeCategory]?.label}`}
          </span>
          <div className="flex items-center gap-2">
            <span className="text-[9px] text-muted-foreground/60">Arraste uma imagem ou</span>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 gap-1 text-[10px] text-muted-foreground hover:text-primary"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading || !!pendingUpload}
            >
              <Upload className="h-3 w-3" />
              Upload
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
