import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { getLogger } from '@/lib/logger';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  type StickerItem,
  type PendingUpload,
  CATEGORY_LABELS,
  mapStickerRow,
  sortStickersByRecent,
  RECENT_STICKERS_LIMIT,
} from '@/features/inbox/components/stickers/StickerTypes';
import {
  uploadStickerFile,
  insertStickerRow,
  removeStickerObject,
} from '@/features/inbox/components/stickers/stickerUpload';

const log = getLogger('StickerPicker');

/**
 * FIXES APLICADOS (Audit 02/05/2026 + Etapa 44, wt-g10):
 * - BUG 1: handleDrop stale closure fixed (processFile wrapped in useCallback)
 * - BUG 3: `as StickerItem[]` replaced with runtime validation (mapStickerRow)
 * - FALHA 4: Toast standardized to sonner
 * - FALHA 7: use_count update error handling added
 * - FALHA 8: URL parsing fixed to strip query params before storage remove
 * - A7 (Etapa 44): "Recentes" agora ordena por created_at do DB (recência
 *   REAL), não mais por use_count (era "mais usadas" com nome enganoso).
 * - A8 (Etapa 44): upload via helper canônico stickerUpload → bucket
 *   `stickers` + URL via getSignedMediaUrl; validação tipo/tamanho alinhada
 *   ao bucket (webp/gif/png) ANTES do upload.
 * - Etapa 44.5: erros HONESTOS — mensagem real do storage/DB nos toasts;
 *   sem `catch {}` silencioso nem toast de sucesso em falha.
 */

/** Gerenciador de estado do picker de figurinhas: navegação, upload, delete e envio. */
export function useStickerPicker(onSendSticker: (url: string) => void) {
  const [open, setOpen] = useState(false);
  const [stickers, setStickers] = useState<StickerItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [uploading, setUploading] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [showFavorites, setShowFavorites] = useState(false);
  const [showRecent, setShowRecent] = useState(false);
  const [pendingUpload, setPendingUpload] = useState<PendingUpload | null>(null);
  const [gridSize, setGridSize] = useState<'sm' | 'md' | 'lg'>('md');
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const mountedRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // FIX BUG 3: runtime validation instead of unsafe `as StickerItem[]` cast
  const fetchStickers = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('stickers')
        .select('*')
        .order('use_count', { ascending: false })
        .limit(1000);

      if (!mountedRef.current) return;
      if (error) {
        // Etapa 44.5: erro HONESTO — o usuário vê a causa real, não um vazio.
        log.error('[fetchStickers] Query error:', error.message);
        toast.error(`Erro ao carregar figurinhas: ${error.message}`);
        setLoading(false);
        return;
      }

      if (data) {
        const validated = data.map(mapStickerRow).filter((s): s is StickerItem => s !== null);
        if (validated.length !== data.length) {
          log.warn(`[fetchStickers] ${data.length - validated.length} rows failed validation`);
        }
        setStickers(validated);
      }
    } catch (err) {
      log.error('[fetchStickers] Exception:', err);
      toast.error(
        `Erro ao carregar figurinhas: ${err instanceof Error ? err.message : 'falha de rede'}`
      );
    }
    if (mountedRef.current) setLoading(false);
  }, []);

  useEffect(() => {
    if (open) {
      void fetchStickers();
      const focusTimer = setTimeout(() => searchInputRef.current?.focus(), 100);
      return () => clearTimeout(focusTimer);
    }
  }, [open, fetchStickers]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'S') {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // BUG 1 FIX: processFile as useCallback so handleDrop can reference it.
  // Etapa 44 (A8): upload via helper canônico (bucket `stickers` + signed URL)
  // com validação e erros honestos.
  const processFile = useCallback(async (file: File) => {
    setUploading(true);
    try {
      const result = await uploadStickerFile(file);
      if (!mountedRef.current) return;

      if (!result.ok) {
        toast.error(result.error);
        return;
      }

      const aiCategory = 'enviadas';

      // Show upload preview immediately (GAP 16 FIX: non-blocking AI classification)
      setPendingUpload({
        file,
        imageUrl: result.url,
        storagePath: result.path,
        aiCategory,
        selectedCategory: aiCategory,
        name: file.name.replace(/\.[^.]+$/, ''),
      });

      // Background AI classification — updates category when ready
      supabase.functions
        .invoke('classify-sticker', { body: { image_url: result.url } })
        .then(({ data: classifyData, error: classifyErr }) => {
          if (!classifyErr && classifyData?.category) {
            setPendingUpload((prev) =>
              prev
                ? {
                    ...prev,
                    aiCategory: classifyData.category,
                    selectedCategory: classifyData.category,
                  }
                : null
            );
            toast.success('🧠 IA classificou: ' + classifyData.category);
          }
        })
        .catch((err) => log.error('AI classification error:', err));
    } catch (err) {
      // Etapa 44.5: erro HONESTO (ex.: falha de rede no upload).
      log.error('[StickerPicker] Upload exception:', err);
      toast.error(
        `Erro ao processar figurinha: ${err instanceof Error ? err.message : 'falha inesperada'}`
      );
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  // BUG 1 FIX: processFile now in dependency array
  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);
      const file = e.dataTransfer.files?.[0];
      if (file) void processFile(file);
    },
    [processFile]
  );

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) void processFile(file);
    },
    [processFile]
  );

  const handleConfirmUpload = useCallback(
    async (pending: PendingUpload) => {
      let uploadedBy: string | null = null;
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        uploadedBy = user?.id ?? null;
      } catch (err) {
        log.warn('[StickerPicker] getUser failed (insert prossegue anônimo):', err);
      }

      const { error: insertError } = await insertStickerRow({
        name: pending.name,
        imageUrl: pending.imageUrl,
        category: pending.selectedCategory,
        uploadedBy,
      });
      if (insertError) {
        // Etapa 44.5: erro HONESTO com a causa real.
        log.error('[StickerPicker] Insert error:', insertError);
        toast.error(`Erro ao salvar figurinha: ${insertError}`);
        return;
      }
      toast.success(
        `✅ Figurinha "${pending.name}" salva como "${CATEGORY_LABELS[pending.selectedCategory]?.label}"!`
      );
      setPendingUpload(null);
      fetchStickers();
    },
    [fetchStickers]
  );

  const handleCancelUpload = useCallback(async () => {
    if (pendingUpload) {
      const { error } = await removeStickerObject(pendingUpload.storagePath);
      if (error) log.warn('[StickerPicker] cleanup do objeto cancelado falhou:', error);
    }
    setPendingUpload(null);
  }, [pendingUpload]);

  const handleSend = useCallback(
    async (sticker: StickerItem) => {
      onSendSticker(sticker.image_url);
      setOpen(false);

      // FALHA 7 FIX: Error handling on use_count update
      const { error: countError } = await supabase
        .from('stickers')
        .update({ use_count: (sticker.use_count || 0) + 1 })
        .eq('id', sticker.id);
      if (countError) {
        log.error('[handleSend] use_count update failed:', countError.message);
      }
    },
    [onSendSticker]
  );

  const toggleFavorite = useCallback(
    async (e: React.SyntheticEvent, sticker: StickerItem) => {
      e.stopPropagation();
      const newVal = !sticker.is_favorite;
      setStickers((prev) =>
        prev.map((s) => (s.id === sticker.id ? { ...s, is_favorite: newVal } : s))
      );
      const { error } = await supabase
        .from('stickers')
        .update({ is_favorite: newVal })
        .eq('id', sticker.id);
      if (error) {
        // Etapa 44.5: erro HONESTO com rollback otimista.
        log.error('[toggleFavorite] DB update failed:', error.message);
        setStickers((prev) =>
          prev.map((s) => (s.id === sticker.id ? { ...s, is_favorite: !newVal } : s))
        );
        toast.error(`Erro ao atualizar favorito: ${error.message}`);
        return;
      }
      toast.success(newVal ? '⭐ Adicionada aos favoritos' : 'Removida dos favoritos');
    },
    []
  );

  const handleCategoryChange = useCallback(
    async (sticker: StickerItem, newCategory: string) => {
      const prevCategory = sticker.category;
      setStickers((prev) =>
        prev.map((s) => (s.id === sticker.id ? { ...s, category: newCategory } : s))
      );
      const { error } = await supabase
        .from('stickers')
        .update({ category: newCategory })
        .eq('id', sticker.id);
      if (error) {
        // Etapa 44.5: erro HONESTO com rollback otimista.
        log.error('[handleCategoryChange] DB update failed:', error.message);
        setStickers((prev) =>
          prev.map((s) => (s.id === sticker.id ? { ...s, category: prevCategory } : s))
        );
        toast.error(`Erro ao alterar categoria: ${error.message}`);
        return;
      }
      toast.success(`Categoria: "${CATEGORY_LABELS[newCategory]?.label || newCategory}"`);
    },
    []
  );

  // FALHA 8 FIX: Safe URL parsing for storage path extraction
  const handleDelete = useCallback(
    async (e: React.MouseEvent, sticker: StickerItem) => {
      e.stopPropagation();
      setStickers((prev) => prev.filter((s) => s.id !== sticker.id));

      // Determine bucket and extract clean path
      const bucket = sticker.image_url.includes('/whatsapp-media/') ? 'whatsapp-media' : 'stickers';
      const path = extractStoragePath(sticker.image_url, bucket);

      if (path) {
        const { error: removeError } = await supabase.storage.from(bucket).remove([path]);
        if (removeError) {
          log.error(
            `[handleDelete] Storage remove failed for ${bucket}/${path}:`,
            removeError.message
          );
        }
      } else {
        log.warn('[handleDelete] Could not extract storage path from:', sticker.image_url);
      }

      const { error: deleteError } = await supabase.from('stickers').delete().eq('id', sticker.id);
      if (deleteError) {
        // Etapa 44.5: erro HONESTO — restaura o item e avisa com a causa real.
        log.error('[handleDelete] DB delete failed:', deleteError.message);
        setStickers((prev) => [...prev, sticker]);
        toast.error(`Erro ao excluir figurinha: ${deleteError.message}`);
        return;
      }
      toast.success('Figurinha removida');
    },
    []
  );

  const filtered = useMemo(() => {
    let result = stickers;
    if (search) {
      const term = search.toLowerCase();
      result = result.filter(
        (s) =>
          s.name?.toLowerCase().includes(term) ||
          s.category?.toLowerCase().includes(term) ||
          CATEGORY_LABELS[s.category]?.label.toLowerCase().includes(term)
      );
    }
    if (showRecent) {
      // A7 (Etapa 44): recência REAL — created_at do DB, decrescente e estável.
      result = sortStickersByRecent(result).slice(0, RECENT_STICKERS_LIMIT);
    } else if (showFavorites) {
      result = result.filter((s) => s.is_favorite);
    } else if (activeCategory) {
      result = result.filter((s) => s.category === activeCategory);
    }
    return result;
  }, [stickers, search, showFavorites, showRecent, activeCategory]);

  const cycleGridSize = useCallback(() => {
    setGridSize((prev) => (prev === 'sm' ? 'md' : prev === 'md' ? 'lg' : 'sm'));
  }, []);

  return {
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
  };
}

/**
 * Safely extracts the storage path from a Supabase Storage URL.
 * Handles query params, encoding, and nested paths.
 */
function extractStoragePath(url: string, bucket: string): string | null {
  try {
    const parsed = new URL(url);
    const marker = `/storage/v1/object/public/${bucket}/`;
    const idx = parsed.pathname.indexOf(marker);
    if (idx === -1) return null;
    return decodeURIComponent(parsed.pathname.slice(idx + marker.length));
  } catch {
    // Fallback: simple split (legacy URLs)
    const parts = url.split(`/${bucket}/`);
    if (parts.length < 2) return null;
    return parts[1].split('?')[0]; // Strip query params
  }
}
