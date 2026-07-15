// @ts-nocheck
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { getLogger } from '@/lib/logger';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { type StickerItem, type PendingUpload, CATEGORY_LABELS } from '@/features/inbox';

const log = getLogger('StickerPicker');
const RECENT_LIMIT = 8;
const _MAX_STICKER_SIZE = 500 * 1024; // 500KB
const _ACCEPTED_TYPES = ['image/webp', 'image/png', 'image/gif', 'image/jpeg'];

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

/**
 * Validates that a DB record has the required StickerItem fields.
 */
function _isStickerItem(item: unknown): item is StickerItem {
  if (!item || typeof item !== 'object') return false;
  const obj = item as Record<string, unknown>;
  return typeof obj.id === 'string' && typeof obj.image_url === 'string';
}

/**
 * FIXES APPLIED (Audit 02/05/2026):
 * - BUG 1: handleDrop stale closure fixed (processFile wrapped in useCallback)
 * - BUG 3: `as StickerItem[]` replaced with runtime validation
 * - FALHA 4: Toast standardized to sonner (already was sonner here)
 * - FALHA 7: use_count update error handling added
 * - FALHA 8: URL parsing fixed to strip query params before storage remove
 */

/** Validate that Supabase row has minimum required StickerItem fields */
function validateStickerRow(row: unknown): row is StickerItem {
  if (typeof row !== 'object' || row === null) return false;
  const r = row as Record<string, unknown>;
  return typeof r.id === 'string' && typeof r.image_url === 'string';
}

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

  // FIX BUG 3: Runtime validation instead of unsafe `as StickerItem[]` cast
  const fetchStickers = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('stickers')
        .select('*')
        .order('use_count', { ascending: false })
        .limit(1000);

      if (error) {
        log.error('[fetchStickers] Query error:', error.message);
        setLoading(false);
        return;
      }

      // BUG 3 FIX: Runtime validation instead of unsafe cast
      if (data) {
        const validated = data.filter(validateStickerRow);
        if (validated.length !== data.length) {
          log.warn(`[fetchStickers] ${data.length - validated.length} rows failed validation`);
        }
        setStickers(validated);
      }
    } catch (err) {
      log.error('[fetchStickers] Exception:', err);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (open) {
      void fetchStickers();
      setTimeout(() => searchInputRef.current?.focus(), 100);
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

  // BUG 1 FIX: processFile as useCallback so handleDrop can reference it
  const processFile = useCallback(async (file: File) => {
    if (!file.type.startsWith('image/')) {
      toast.error('Arquivo não é uma imagem válida');
      return;
    }
    if (file.size > 500 * 1024) {
      toast.error('Arquivo excede 500KB.');
      return;
    }

    setUploading(true);
    try {
      const ext = file.name.split('.').pop() || 'webp';
      const storagePath = `sticker_${Date.now()}_${crypto.randomUUID()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from('stickers')
        .upload(storagePath, file, { contentType: file.type, cacheControl: '31536000' });

      if (uploadError) {
        toast.error('Erro ao enviar arquivo');
        return;
      }

      const { data: urlData } = supabase.storage.from('stickers').getPublicUrl(storagePath);
      const aiCategory = 'enviadas';

      // Show upload preview immediately (GAP 16 FIX: non-blocking AI classification)
      setPendingUpload({
        file,
        imageUrl: urlData.publicUrl,
        storagePath,
        aiCategory,
        selectedCategory: aiCategory,
        name: file.name.replace(/\.[^.]+$/, ''),
      });

      // Background AI classification — updates category when ready
      supabase.functions
        .invoke('classify-sticker', { body: { image_url: urlData.publicUrl } })
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
    } catch {
      toast.error('Erro ao processar figurinha');
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
      if (file) processFile(file);
    },
    [processFile]
  );

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) processFile(file);
    },
    [processFile]
  );

  const handleConfirmUpload = useCallback(
    async (pending: PendingUpload) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const { error: insertError } = await supabase.from('stickers').insert({
        name: pending.name,
        image_url: pending.imageUrl,
        category: pending.selectedCategory,
        is_favorite: false,
        use_count: 0,
        uploaded_by: user?.id || null,
      });
      if (insertError) {
        log.error('[StickerPicker] Insert error:', insertError);
        toast.error('Erro ao salvar figurinha');
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
      await supabase.storage.from('stickers').remove([pendingUpload.storagePath]);
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

  const toggleFavorite = useCallback(async (e: React.SyntheticEvent, sticker: StickerItem) => {
    e.stopPropagation();
    const newVal = !sticker.is_favorite;
    setStickers((prev) =>
      prev.map((s) => (s.id === sticker.id ? { ...s, is_favorite: newVal } : s))
    );
    await supabase.from('stickers').update({ is_favorite: newVal }).eq('id', sticker.id);
    toast.success(newVal ? '⭐ Adicionada aos favoritos' : 'Removida dos favoritos');
  }, []);

  const handleCategoryChange = useCallback(async (sticker: StickerItem, newCategory: string) => {
    setStickers((prev) =>
      prev.map((s) => (s.id === sticker.id ? { ...s, category: newCategory } : s))
    );
    await supabase.from('stickers').update({ category: newCategory }).eq('id', sticker.id);
    toast.success(`Categoria: "${CATEGORY_LABELS[newCategory]?.label || newCategory}"`);
  }, []);

  // FALHA 8 FIX: Safe URL parsing for storage path extraction
  const handleDelete = useCallback(async (e: React.MouseEvent, sticker: StickerItem) => {
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
      log.error('[handleDelete] DB delete failed:', deleteError.message);
    }
    toast.success('Figurinha removida');
  }, []);

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
      result = [...result]
        .sort((a, b) => (b.use_count || 0) - (a.use_count || 0))
        .slice(0, RECENT_LIMIT);
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