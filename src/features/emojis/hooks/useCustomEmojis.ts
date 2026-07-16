import { useCallback, useEffect, useRef, useState, type MouseEvent } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { log } from '@/lib/logger';

export interface CustomEmoji {
  id: string;
  name: string;
  image_url: string;
  category: string;
  is_favorite: boolean;
  use_count: number;
  uploaded_by?: string | null;
}

export interface PendingEmojiUpload {
  file: File;
  imageUrl: string;
  storagePath: string;
  aiCategory: string;
  selectedCategory: string;
  name: string;
}

const BUCKET = 'custom-emojis';
const DEFAULT_CATEGORY = 'outros';

/**
 * Manages the custom emoji library used by CustomEmojiPicker.
 * Provides list, upload preview flow, favorites, category edit and delete.
 */
export function useCustomEmojis(enabled = true) {
  const [emojis, setEmojis] = useState<CustomEmoji[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [pendingUpload, setPendingUpload] = useState<PendingEmojiUpload | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mountedRef = useRef(true);
  const progressTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (progressTimerRef.current) clearInterval(progressTimerRef.current);
    };
  }, []);

  const resetUploadError = useCallback(() => setUploadError(null), []);

  const fetchEmojis = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('custom_emojis')
        .select('id,name,image_url,category,is_favorite,use_count,uploaded_by')
        .order('use_count', { ascending: false });
      if (error) throw error;
      if (!mountedRef.current) return;
      const rows = (data ?? []).map((r): CustomEmoji => ({
        id: r.id,
        name: r.name ?? '',
        image_url: r.image_url,
        category: r.category ?? DEFAULT_CATEGORY,
        is_favorite: r.is_favorite ?? false,
        use_count: r.use_count ?? 0,
        uploaded_by: r.uploaded_by ?? null,
      }));
      setEmojis(rows);
    } catch (err) {
      log.error('[useCustomEmojis] fetch failed', err);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (enabled) fetchEmojis();
  }, [enabled, fetchEmojis]);

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (e.target) e.target.value = '';
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast.error('Emoji deve ter no máximo 2MB');
      return;
    }
    try {
      const imageUrl = URL.createObjectURL(file);
      const ext = file.name.split('.').pop() || 'png';
      const storagePath = `${crypto.randomUUID()}.${ext}`;
      const baseName = file.name.replace(/\.[^.]+$/, '').slice(0, 40) || 'emoji';
      setPendingUpload({
        file,
        imageUrl,
        storagePath,
        aiCategory: DEFAULT_CATEGORY,
        selectedCategory: DEFAULT_CATEGORY,
        name: baseName,
      });
    } catch (err) {
      log.error('[useCustomEmojis] prepare upload failed', err);
      toast.error('Falha ao preparar upload');
    }
  }, []);

  const handleCancelUpload = useCallback(() => {
    setPendingUpload((p) => {
      if (p?.imageUrl) URL.revokeObjectURL(p.imageUrl);
      return null;
    });
  }, []);

  const handleConfirmUpload = useCallback(async (p: PendingEmojiUpload) => {
    if (!p.name.trim()) {
      setUploadError('Informe um nome para o emoji');
      toast.error('Informe um nome para o emoji');
      return;
    }
    setUploading(true);
    setUploadError(null);
    setUploadProgress(5);
    if (progressTimerRef.current) clearInterval(progressTimerRef.current);
    progressTimerRef.current = setInterval(() => {
      setUploadProgress((v) => (v < 85 ? v + 7 : v));
    }, 150);
    try {
      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(p.storagePath, p.file, { upsert: false, contentType: p.file.type });
      if (upErr) throw upErr;
      if (mountedRef.current) setUploadProgress(90);
      const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(p.storagePath);
      const { data: userData } = await supabase.auth.getUser();
      const { error: insErr } = await supabase.from('custom_emojis').insert({
        name: p.name.trim(),
        image_url: pub.publicUrl,
        category: p.selectedCategory,
        uploaded_by: userData.user?.id ?? null,
      });
      if (insErr) throw insErr;
      if (mountedRef.current) setUploadProgress(100);
      toast.success('Emoji adicionado');
      URL.revokeObjectURL(p.imageUrl);
      if (mountedRef.current) {
        setPendingUpload(null);
        setUploadError(null);
      }
      await fetchEmojis();
    } catch (err) {
      log.error('[useCustomEmojis] upload failed', err);
      const msg = err instanceof Error ? err.message : 'Falha ao salvar emoji';
      if (mountedRef.current) setUploadError(msg);
      toast.error(msg);
    } finally {
      if (progressTimerRef.current) {
        clearInterval(progressTimerRef.current);
        progressTimerRef.current = null;
      }
      if (mountedRef.current) {
        setUploading(false);
        setTimeout(() => mountedRef.current && setUploadProgress(0), 400);
      }
    }
  }, [fetchEmojis]);


  const handleSend = useCallback(
    async (emoji: CustomEmoji, onSend: (url: string) => void, close?: () => void) => {
      onSend(emoji.image_url);
      close?.();
      try {
        await supabase
          .from('custom_emojis')
          .update({ use_count: (emoji.use_count ?? 0) + 1 })
          .eq('id', emoji.id);
        setEmojis((prev) =>
          prev.map((e) => (e.id === emoji.id ? { ...e, use_count: (e.use_count ?? 0) + 1 } : e)),
        );
      } catch (err) {
        log.error('[useCustomEmojis] increment use_count failed', err);
      }
    },
    [],
  );

  const toggleFavorite = useCallback(async (e: MouseEvent, emoji: CustomEmoji) => {
    e.stopPropagation();
    const next = !emoji.is_favorite;
    setEmojis((prev) => prev.map((x) => (x.id === emoji.id ? { ...x, is_favorite: next } : x)));
    try {
      const { error } = await supabase
        .from('custom_emojis')
        .update({ is_favorite: next })
        .eq('id', emoji.id);
      if (error) throw error;
    } catch (err) {
      log.error('[useCustomEmojis] toggleFavorite failed', err);
      setEmojis((prev) =>
        prev.map((x) => (x.id === emoji.id ? { ...x, is_favorite: !next } : x)),
      );
      toast.error('Falha ao atualizar favorito');
    }
  }, []);

  const handleCategoryChange = useCallback(async (emoji: CustomEmoji, category: string) => {
    setEmojis((prev) => prev.map((x) => (x.id === emoji.id ? { ...x, category } : x)));
    try {
      const { error } = await supabase
        .from('custom_emojis')
        .update({ category })
        .eq('id', emoji.id);
      if (error) throw error;
    } catch (err) {
      log.error('[useCustomEmojis] category change failed', err);
      setEmojis((prev) =>
        prev.map((x) => (x.id === emoji.id ? { ...x, category: emoji.category } : x)),
      );
      toast.error('Falha ao atualizar categoria');
    }
  }, []);

  const handleDelete = useCallback(async (e: MouseEvent, emoji: CustomEmoji) => {
    e.stopPropagation();
    const prev = emojis;
    setEmojis((list) => list.filter((x) => x.id !== emoji.id));
    try {
      const { error } = await supabase.from('custom_emojis').delete().eq('id', emoji.id);
      if (error) throw error;
      toast.success('Emoji removido');
    } catch (err) {
      log.error('[useCustomEmojis] delete failed', err);
      setEmojis(prev);
      toast.error('Falha ao remover emoji');
    }
  }, [emojis]);

  return {
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
    refetch: fetchEmojis,
  };
}