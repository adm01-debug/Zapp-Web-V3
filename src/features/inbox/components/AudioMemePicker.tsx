import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
// Tooltip removido para evitar loop Tooltip+Popover.
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Music,
  Search,
  Plus,
  Star,
  Trash2,
  Loader2,
  Upload,
  X,
  Play,
  Pause,
  Volume2,
  Tag,
  Check,
  ChevronDown,
} from 'lucide-react';
import { useAudioMemes, formatDuration, type PendingUpload } from '@/hooks/useAudioMemes';

interface AudioMemePickerProps {
  onSendAudioMeme: (meme: any) => void;
  disabled?: boolean;
}

const CATEGORY_LABELS: Record<string, { emoji: string; label: string }> = {
  risada: { emoji: '😂', label: 'Risada' },
  aplausos: { emoji: '👏', label: 'Aplausos' },
  suspense: { emoji: '🎭', label: 'Suspense' },
  vitória: { emoji: '🏆', label: 'Vitória' },
  falha: { emoji: '💥', label: 'Falha' },
  surpresa: { emoji: '😱', label: 'Surpresa' },
  triste: { emoji: '😢', label: 'Triste' },
  raiva: { emoji: '😡', label: 'Raiva' },
  romântico: { emoji: '💕', label: 'Romântico' },
  medo: { emoji: '👻', label: 'Medo' },
  deboche: { emoji: '😏', label: 'Deboche' },
  narração: { emoji: '🎙️', label: 'Narração' },
  bordão: { emoji: '💬', label: 'Bordão' },
  'efeito sonoro': { emoji: '🔊', label: 'Efeito Sonoro' },
  viral: { emoji: '🔥', label: 'Viral' },
  cumprimento: { emoji: '👋', label: 'Cumprimento' },
  despedida: { emoji: '👋', label: 'Despedida' },
  animação: { emoji: '🤩', label: 'Animação' },
  drama: { emoji: '🎬', label: 'Drama' },
  gospel: { emoji: '⛪', label: 'Gospel' },
  outros: { emoji: '📦', label: 'Outros' },
};
const ALL_CATEGORIES = Object.keys(CATEGORY_LABELS);

function CategorySelector({
  value,
  onChange,
  size = 'sm',
}: {
  value: string;
  onChange: (cat: string) => void;
  size?: 'sm' | 'xs';
}) {
  const [open, setOpen] = useState(false);
  const info = CATEGORY_LABELS[value] || { emoji: '📦', label: value };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className={cn(
            'flex items-center gap-1 rounded-md border border-border/50 transition-colors hover:bg-muted/60',
            size === 'xs' ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-1 text-xs'
          )}
          onClick={(e) => e.stopPropagation()}
        >
          <span>{info.emoji}</span>
          <span className="text-muted-foreground">{info.label}</span>
          <ChevronDown
            className={cn(size === 'xs' ? 'h-2.5 w-2.5' : 'h-3 w-3', 'text-muted-foreground/60')}
          />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="max-h-[240px] w-[200px] overflow-y-auto p-1.5"
        align="start"
        side="bottom"
        sideOffset={4}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="space-y-0.5">
          {ALL_CATEGORIES.map((cat) => {
            const catInfo = CATEGORY_LABELS[cat];
            const isActive = cat === value;
            return (
              <button
                key={cat}
                onClick={(e) => {
                  e.stopPropagation();
                  onChange(cat);
                  setOpen(false);
                }}
                className={cn(
                  'flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs transition-colors',
                  isActive
                    ? 'bg-primary/10 font-medium text-primary'
                    : 'text-foreground hover:bg-muted'
                )}
              >
                <span>{catInfo.emoji}</span>
                <span className="flex-1">{catInfo.label}</span>
                {isActive && <Check className="h-3 w-3 text-primary" />}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function UploadPreview({
  pending,
  onConfirm,
  onCancel,
}: {
  pending: PendingUpload;
  onConfirm: (p: PendingUpload) => void;
  onCancel: () => void;
}) {
  const [category, setCategory] = useState(pending.selectedCategory);
  const [name, setName] = useState(pending.name);
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-2.5 rounded-lg border border-border bg-card p-3"
    >
      <div className="flex items-center gap-2">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
          <Music className="h-4 w-4 text-primary" />
        </div>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="h-7 flex-1 text-xs"
          placeholder="Nome do áudio"
        />
      </div>
      <div className="flex items-center gap-2">
        <Tag className="h-3 w-3 shrink-0 text-muted-foreground" />
        <span className="shrink-0 text-[10px] text-muted-foreground">Categoria:</span>
        <CategorySelector value={category} onChange={setCategory} size="sm" />
        {pending.aiCategory !== 'outros' && category !== pending.aiCategory && (
          <button
            onClick={() => setCategory(pending.aiCategory)}
            className="shrink-0 text-[9px] text-primary hover:underline"
          >
            IA sugere: {CATEGORY_LABELS[pending.aiCategory]?.label}
          </button>
        )}
      </div>
      <div className="flex items-center justify-end gap-2">
        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onCancel}>
          <X className="mr-1 h-3 w-3" /> Cancelar
        </Button>
        <Button
          size="sm"
          className="h-7 text-xs"
          onClick={() => onConfirm({ ...pending, selectedCategory: category, name })}
        >
          <Check className="mr-1 h-3 w-3" /> Salvar
        </Button>
      </div>
    </motion.div>
  );
}

export function AudioMemePicker({ onSendAudioMeme, disabled }: AudioMemePickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [showFavorites, setShowFavorites] = useState(false);

  const {
    memes,
    loading,
    syncing,
    syncError,
    uploading,
    playingId,
    pendingUpload,
    fileInputRef,
    handlePreview,
    handleFileSelect,
    handleConfirmUpload,
    handleCancelUpload,
    handleSend,
    toggleFavorite,
    handleCategoryChange,
    handleDelete,
    cleanup,
  } = useAudioMemes(open);

  const categories = [...new Set(memes.map((m) => m.category).filter(Boolean))].sort();
  const filtered = memes.filter((m) => {
    const matchSearch =
      !search ||
      m.name?.toLowerCase().includes(search.toLowerCase()) ||
      m.category?.toLowerCase().includes(search.toLowerCase());
    if (showFavorites) return matchSearch && m.is_favorite;
    if (activeCategory) return matchSearch && m.category === activeCategory;
    return matchSearch;
  });

  return (
    <Popover
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) cleanup();
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 shrink-0 text-muted-foreground hover:bg-muted hover:text-foreground"
          disabled={disabled}
          aria-label="Áudio Memes"
          title="Áudio Memes"
        >
          <Volume2 className="h-[18px] w-[18px]" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[360px] border-border bg-popover p-0"
        align="end"
        side="top"
        sideOffset={8}
      >
        <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
          <h4 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Music className="h-4 w-4 text-primary" />
            Áudios Meme
            {syncing && <Loader2 className="ml-1 h-3 w-3 animate-spin text-muted-foreground" />}
            {syncError && (
              <span className="ml-1 animate-pulse rounded bg-destructive/10 px-1.5 py-0.5 text-[10px] text-destructive">
                {syncError}
              </span>
            )}
          </h4>
          <div className="flex items-center gap-1">
            <input
              ref={fileInputRef}
              type="file"
              accept="audio/*"
              className="hidden"
              onChange={handleFileSelect}
            />
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-primary"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading || !!pendingUpload}
              title="Adicionar áudio meme"
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
              <UploadPreview
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
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar áudios meme..."
              className="h-8 border-border/50 bg-muted/50 pl-8 text-xs"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-2 top-1/2 -translate-y-1/2"
              >
                <X className="h-3 w-3 text-muted-foreground" />
              </button>
            )}
          </div>
        </div>

        <div className="border-b border-border/30 px-2 py-2">
          <ScrollArea className="w-full">
            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={() => {
                  setActiveCategory(null);
                  setShowFavorites(false);
                }}
                className={cn(
                  'whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors',
                  !activeCategory && !showFavorites
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80'
                )}
              >
                Todos ({memes.length})
              </button>
              <button
                onClick={() => {
                  setShowFavorites(!showFavorites);
                  setActiveCategory(null);
                }}
                className={cn(
                  'flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors',
                  showFavorites
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80'
                )}
              >
                <Star className="h-3 w-3" /> Favoritos
              </button>
              {categories.map((cat) => {
                const info = CATEGORY_LABELS[cat];
                const count = memes.filter((m) => m.category === cat).length;
                return (
                  <button
                    key={cat}
                    onClick={() => {
                      setActiveCategory(activeCategory === cat ? null : cat);
                      setShowFavorites(false);
                    }}
                    className={cn(
                      'whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors',
                      activeCategory === cat
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-muted-foreground hover:bg-muted/80'
                    )}
                  >
                    {info?.emoji || '📦'} {info?.label || cat} ({count})
                  </button>
                );
              })}
            </div>
          </ScrollArea>
        </div>

        <ScrollArea className="h-[280px]">
          <div className="p-1.5">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <Music className="mb-3 h-10 w-10 text-muted-foreground/40" />
                <p className="text-sm font-medium text-muted-foreground">
                  {search ? 'Nenhum áudio encontrado' : 'Nenhum áudio meme'}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Clique em <Plus className="inline h-3 w-3" /> para adicionar
                </p>
              </div>
            ) : (
              <div className="space-y-1">
                <AnimatePresence>
                  {filtered.map((meme) => (
                    <motion.div
                      key={meme.id}
                      initial={{ opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -5 }}
                      className={cn(
                        'group flex cursor-pointer items-center gap-2.5 rounded-lg border border-transparent px-2.5 py-2 transition-colors hover:border-border/40 hover:bg-muted/60',
                        playingId === meme.id && 'border-primary/20 bg-primary/5'
                      )}
                      onClick={() =>
                        handleSend(
                          meme,
                          (_url) => onSendAudioMeme(meme),
                          () => setOpen(false)
                        )
                      }
                    >
                      ,search:
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handlePreview(meme);
                        }}
                        className={cn(
                          'flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors',
                          playingId === meme.id
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-muted text-muted-foreground hover:bg-primary/20 hover:text-primary'
                        )}
                      >
                        {playingId === meme.id ? (
                          <Pause className="h-3.5 w-3.5" />
                        ) : (
                          <Play className="ml-0.5 h-3.5 w-3.5" />
                        )}
                      </button>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium text-foreground">{meme.name}</p>
                        <div className="mt-0.5 flex items-center gap-2">
                          <CategorySelector
                            value={meme.category}
                            onChange={(cat) => handleCategoryChange(meme, cat)}
                            size="xs"
                          />
                          <span className="text-[10px] text-muted-foreground/60">
                            {formatDuration(meme.duration_seconds)}
                          </span>
                          {meme.use_count > 0 && (
                            <span className="text-[10px] text-muted-foreground/50">
                              {meme.use_count}x
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                        <button
                          onClick={(e) => toggleFavorite(e, meme)}
                          className="rounded p-1 hover:bg-muted"
                        >
                          <Star
                            className={cn(
                              'h-3.5 w-3.5 transition-colors',
                              meme.is_favorite
                                ? 'fill-primary text-primary'
                                : 'text-muted-foreground'
                            )}
                          />
                        </button>
                        <button
                          onClick={(e) => handleDelete(e, meme)}
                          className="rounded p-1 hover:bg-destructive/10"
                        >
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </button>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            )}
          </div>
        </ScrollArea>

        <div className="flex items-center justify-between border-t border-border/30 px-3 py-2">
          <span className="text-[10px] text-muted-foreground">
            {filtered.length}/{memes.length} áudios · Clique para enviar · ▶ ouvir
          </span>
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
      </PopoverContent>
    </Popover>
  );
}
