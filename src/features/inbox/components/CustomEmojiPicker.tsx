import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
// Tooltip removido para evitar loop Tooltip+Popover.
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import {
  SmilePlus,
  Search,
  Plus,
  Star,
  Trash2,
  Loader2,
  X,
  Tag,
  Check,
  ChevronDown,
  Smile,
  AlertCircle,
} from 'lucide-react';
import { CATEGORY_LABELS, ALL_CATEGORIES, NATIVE_EMOJI_CATEGORIES } from './emojiConstants';
import { useCustomEmojis, type PendingEmojiUpload } from '@/features/emojis';

interface CustomEmojiPickerProps {
  onSendEmoji: (emojiUrl: string) => void;
  disabled?: boolean;
}

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
          type="button"
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
                type="button"
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
  uploading,
  progress,
  error,
  onDismissError,
}: {
  pending: PendingEmojiUpload;
  onConfirm: (p: PendingEmojiUpload) => void;
  onCancel: () => void;
  uploading: boolean;
  progress: number;
  error: string | null;
  onDismissError: () => void;
}) {
  const [category, setCategory] = useState(pending.selectedCategory);
  const [name, setName] = useState(pending.name);
  const trimmedName = name.trim();
  const canSave = !uploading && trimmedName.length > 0;
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-2.5 rounded-lg border border-border bg-card p-3"
    >
      <div className="flex items-center gap-3">
        <div className="relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border/30 bg-muted/30">
          <img
            src={pending.imageUrl}
            alt="Pré-visualização do emoji"
            className="h-full w-full object-contain p-0.5"
          />
          {uploading && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/70">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
            </div>
          )}
        </div>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={uploading}
          className="h-7 flex-1 text-xs"
          placeholder="Nome do emoji"
          aria-invalid={!trimmedName}
        />
      </div>
      <div className="flex items-center gap-2">
        <Tag className="h-3 w-3 shrink-0 text-muted-foreground" />
        <span className="shrink-0 text-[10px] text-muted-foreground">Categoria:</span>
        <CategorySelector value={category} onChange={setCategory} size="sm" />
        {pending.aiCategory !== 'outros' && category !== pending.aiCategory && (
          <button
            type="button"
            onClick={() => setCategory(pending.aiCategory)}
            disabled={uploading}
            className="shrink-0 text-[9px] text-primary hover:underline disabled:opacity-50"
          >
            IA sugere: {CATEGORY_LABELS[pending.aiCategory]?.label}
          </button>
        )}
      </div>
      {uploading && (
        <div
          className="space-y-1"
          role="progressbar"
          aria-valuenow={progress}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Enviando emoji"
        >
          <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
            <motion.div
              className="h-full bg-primary"
              initial={false}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.2 }}
            />
          </div>
          <p className="text-[10px] text-muted-foreground">Enviando emoji... {progress}%</p>
        </div>
      )}
      {error && !uploading && (
        <div
          className="flex items-start gap-1.5 rounded-md border border-destructive/40 bg-destructive/10 p-2 text-[11px] text-destructive"
          role="alert"
        >
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <div className="flex-1">
            <p className="font-medium">Falha ao enviar</p>
            <p className="text-destructive/80">{error}</p>
          </div>
          <button
            type="button"
            onClick={onDismissError}
            aria-label="Fechar erro"
            className="shrink-0 text-destructive/70 hover:text-destructive"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      )}
      <div className="flex items-center justify-end gap-2">
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs"
          onClick={onCancel}
          disabled={uploading}
        >
          <X className="mr-1 h-3 w-3" /> Cancelar
        </Button>
        <Button
          size="sm"
          className="h-7 text-xs"
          onClick={() => onConfirm({ ...pending, selectedCategory: category, name: trimmedName })}
          disabled={!canSave}
        >
          {uploading ? (
            <>
              <Loader2 className="mr-1 h-3 w-3 animate-spin" /> Enviando
            </>
          ) : error ? (
            <>
              <Check className="mr-1 h-3 w-3" /> Tentar novamente
            </>
          ) : (
            <>
              <Check className="mr-1 h-3 w-3" /> Salvar
            </>
          )}
        </Button>
      </div>
    </motion.div>
  );
}

export function CustomEmojiPicker({ onSendEmoji, disabled }: CustomEmojiPickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [showFavorites, setShowFavorites] = useState(false);
  const [activeTab, setActiveTab] = useState<'native' | 'custom'>('native');
  const [nativeCategoryId, setNativeCategoryId] = useState<string>('smileys');

  const {
    emojis,
    loading,
    uploading,
    uploadProgress,
    uploadError,
    resetUploadError,
    pendingUpload,
    fileInputRef,
    handleFileSelect,
    handleConfirmUpload,
    handleCancelUpload,
    handleSend,
    toggleFavorite,
    handleCategoryChange,
    handleDelete,
    setPendingUpload,
  } = useCustomEmojis(open);

  const { categories, filtered, categoryCounts } = useMemo(() => {
    const cats = [...new Set(emojis.map((e) => e.category).filter(Boolean))].sort();
    const counts = new Map(
      cats.map((cat) => [cat, emojis.filter((e) => e.category === cat).length])
    );
    const fil = emojis.filter((em) => {
      const matchSearch =
        !search ||
        em.name?.toLowerCase().includes(search.toLowerCase()) ||
        em.category?.toLowerCase().includes(search.toLowerCase());
      if (showFavorites) return matchSearch && em.is_favorite;
      if (activeCategory) return matchSearch && em.category === activeCategory;
      return matchSearch;
    });
    return { categories: cats, filtered: fil, categoryCounts: counts };
  }, [emojis, search, activeCategory, showFavorites]);

  const activeNativeCategory = NATIVE_EMOJI_CATEGORIES.find((c) => c.id === nativeCategoryId);
  const filteredNativeEmojis = activeNativeCategory?.emojis || [];

  return (
    <Popover
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) setPendingUpload(null);
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 shrink-0 text-muted-foreground hover:bg-muted hover:text-foreground"
          disabled={disabled}
          aria-label="Emojis Personalizados"
          title="Emojis Personalizados"
        >
          <SmilePlus className="h-[18px] w-[18px]" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[360px] border-border bg-popover p-0"
        align="end"
        side="top"
        sideOffset={8}
      >
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <div className="flex items-center gap-1 rounded-lg bg-muted/50 p-0.5">
            <button
              type="button"
              onClick={() => setActiveTab('native')}
              className={cn(
                'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all',
                activeTab === 'native'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <Smile className="h-3.5 w-3.5" />
              Tradicionais
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('custom')}
              className={cn(
                'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all',
                activeTab === 'custom'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <SmilePlus className="h-3.5 w-3.5" />
              Customizados
            </button>
          </div>
          {activeTab === 'custom' && (
            <div className="flex items-center gap-1">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/webp,image/gif,image/jpeg,image/svg+xml"
                className="hidden"
                onChange={handleFileSelect}
              />
              <Button
                aria-label="Adicionar emoji"
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-primary"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading || !!pendingUpload}
              >
                {uploading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Plus className="h-3.5 w-3.5" />
                )}
              </Button>
            </div>
          )}
        </div>

        {activeTab === 'native' ? (
          <>
            <div className="border-b border-border/30 px-1.5 py-1.5">
              <ScrollArea className="w-full">
                <div className="flex gap-0.5">
                  {NATIVE_EMOJI_CATEGORIES.map((cat) => (
                    <button
                      type="button"
                      key={cat.id}
                      onClick={() => setNativeCategoryId(cat.id)}
                      className={cn(
                        'flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-lg transition-all',
                        nativeCategoryId === cat.id
                          ? 'scale-110 bg-primary/15'
                          : 'hover:bg-muted/60'
                      )}
                      title={cat.label}
                    >
                      {cat.icon}
                    </button>
                  ))}
                </div>
              </ScrollArea>
            </div>
            <div className="border-b border-border/20 px-3 py-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {activeNativeCategory?.label}
              </span>
            </div>
            <ScrollArea className="h-[280px]">
              <div className="p-2">
                <div className="grid grid-cols-8 gap-0.5">
                  {filteredNativeEmojis.map((emoji, i) => (
                    <motion.button
                      key={`${nativeCategoryId}-${i}`}
                      whileHover={{ scale: 1.3 }}
                      whileTap={{ scale: 0.85 }}
                      onClick={() => {
                        onSendEmoji(emoji);
                        setOpen(false);
                      }}
                      className="flex aspect-square w-full cursor-pointer items-center justify-center rounded-md text-2xl transition-colors hover:bg-muted/50"
                    >
                      {emoji}
                    </motion.button>
                  ))}
                </div>
              </div>
            </ScrollArea>
            <div className="border-t border-border/30 px-3 py-1.5">
              <span className="text-[10px] text-muted-foreground">
                {filteredNativeEmojis.length} emojis · {activeNativeCategory?.label}
              </span>
            </div>
          </>
        ) : (
          <>
            <AnimatePresence>
              {pendingUpload && (
                <div className="border-b border-border/50 px-3 py-2">
                  <UploadPreview
                    pending={pendingUpload}
                    onConfirm={handleConfirmUpload}
                    onCancel={handleCancelUpload}
                    uploading={uploading}
                    progress={uploadProgress}
                    error={uploadError}
                    onDismissError={resetUploadError}
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
                  placeholder="Buscar emojis..."
                  className="h-8 border-border/50 bg-muted/50 pl-8 text-xs"
                />
                {search && (
                  <button
                    type="button"
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
                    type="button"
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
                    Todos ({emojis.length})
                  </button>
                  <button
                    type="button"
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
                    const count = categoryCounts.get(cat) ?? 0;
                    return (
                      <button
                        type="button"
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
            <ScrollArea className="h-[260px]">
              <div className="p-2">
                {loading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : filtered.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 text-center">
                    <SmilePlus className="mb-3 h-10 w-10 text-muted-foreground/40" />
                    <p className="text-sm font-medium text-muted-foreground">
                      {search ? 'Nenhum emoji encontrado' : 'Nenhum emoji customizado'}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Clique em <Plus className="inline h-3 w-3" /> para adicionar
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-5 gap-1.5">
                    <AnimatePresence>
                      {filtered.map((emoji) => (
                        <motion.button
                          key={emoji.id}
                          initial={{ opacity: 0, scale: 0.8 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.8 }}
                          whileHover={{ scale: 1.15 }}
                          whileTap={{ scale: 0.9 }}
                          onClick={() => handleSend(emoji, onSendEmoji, () => setOpen(false))}
                          className={cn(
                            'group relative aspect-square overflow-hidden rounded-lg',
                            'bg-muted/20 transition-colors hover:bg-muted/50',
                            'border border-transparent hover:border-primary/30',
                            'cursor-pointer'
                          )}
                          title={`${emoji.name} • ${CATEGORY_LABELS[emoji.category]?.label || emoji.category}`}
                        >
                          <img
                            src={emoji.image_url}
                            alt={emoji.name}
                            className="h-full w-full object-contain p-1"
                            loading="lazy"
                          />
                          <div className="absolute inset-0 flex flex-col items-center justify-between bg-background/70 p-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                            <div className="flex w-full items-center justify-between">
                              <button
                                type="button"
                                onClick={(e) => toggleFavorite(e, emoji)}
                                className="p-0.5"
                              >
                                <Star
                                  className={cn(
                                    'h-3 w-3 transition-colors',
                                    emoji.is_favorite
                                      ? 'fill-primary text-primary'
                                      : 'text-muted-foreground'
                                  )}
                                />
                              </button>
                              <button
                                type="button"
                                onClick={(e) => handleDelete(e, emoji)}
                                className="p-0.5"
                              >
                                <Trash2 className="h-3 w-3 text-destructive" />
                              </button>
                            </div>
                            <div onClick={(e) => e.stopPropagation()}>
                              <CategorySelector
                                value={emoji.category}
                                onChange={(cat) => handleCategoryChange(emoji, cat)}
                                size="xs"
                              />
                            </div>
                          </div>
                        </motion.button>
                      ))}
                    </AnimatePresence>
                  </div>
                )}
              </div>
            </ScrollArea>
            <div className="flex items-center justify-between border-t border-border/30 px-3 py-2">
              <span className="text-[10px] text-muted-foreground">
                {filtered.length}/{emojis.length} emojis · IA + edição manual
              </span>
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
