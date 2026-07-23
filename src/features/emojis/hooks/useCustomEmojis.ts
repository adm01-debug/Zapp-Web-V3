import { useCallback, useRef, useState, type MouseEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { log } from '@/lib/logger';

/** Custom Emoji interface definition. */
export interface CustomEmoji {
  id: string;
  name: string;
  image_url: string;
  category: string;
  is_favorite: boolean;
  use_count: number;
  uploaded_by?: string | null;
}

/** Pending Emoji Upload interface definition. */
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
const EMOJIS_QUERY_KEY = ['custom-emojis'] as const;

/**
 * Manages the custom emoji library used by CustomEmojiPicker.
 * Provides list, upload preview flow, favorites, category edit and delete.
 */
export function useCustomEmojis(enabled = true) {
  const queryClient = useQueryClient();
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [pendingUpload, setPendingUpload] = useState<PendingEmojiUpload | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const progressTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { data: emojis = [], isLoading: loading } = useQuery({
    queryKey: EMOJIS_QUERY_KEY,
    queryFn: async (): Promise<CustomEmoji[]> => {
      const { data, error } = await supabase
        .from('custom_emojis')
        .select('id,name,image_url,category,is_favorite,use_count,uploaded_by')
        .order('use_count', { ascending: false });
      if (error) {
        log.error('[useCustomEmojis] fetch failed', error);
        throw error;
      }
      return (data ?? []).map(
        (r): CustomEmoji => ({
          id: r.id,
          name: r.name ?? '',
          image_url: r.image_url,
          category: r.category ?? DEFAULT_CATEGORY,
          is_favorite: r.is_favorite ?? false,
          use_count: r.use_count ?? 0,
          uploaded_by: r.uploaded_by ?? null,
        })
      );
    },
    enabled,
    staleTime: 30_000,
  });

  const resetUploadError = useCallback(() => setUploadError(null), []);

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

  const handleConfirmUpload = useCallback(
    async (p: PendingEmojiUpload) => {
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
        setUploadProgress(90);
        const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(p.storagePath);
        const { data: userData } = await supabase.auth.getUser();
        const { error: insErr } = await supabase.from('custom_emojis').insert({
          name: p.name.trim(),
          image_url: pub.publicUrl,
          category: p.selectedCategory,
          uploaded_by: userData.user?.id ?? null,
        });
        if (insErr) throw insErr;
        setUploadProgress(100);
        toast.success('Emoji adicionado');
        URL.revokeObjectURL(p.imageUrl);
        setPendingUpload(null);
        setUploadError(null);
        void queryClient.invalidateQueries({ queryKey: EMOJIS_QUERY_KEY });
      } catch (err) {
        log.error('[useCustomEmojis] upload failed', err);
        const msg = err instanceof Error ? err.message : 'Falha ao salvar emoji';
        setUploadError(msg);
        toast.error(msg);
      } finally {
        if (progressTimerRef.current) {
          clearInterval(progressTimerRef.current);
          progressTimerRef.current = null;
        }
        setUploading(false);
        setTimeout(() => setUploadProgress(0), 400);
      }
    },
    [queryClient]
  );

  const handleSend = useCallback(
    async (emoji: CustomEmoji, onSend: (url: string) => void, close?: () => void) => {
      onSend(emoji.image_url);
      close?.();
      try {
        const { error } = await supabase
          .from('custom_emojis')
          .update({ use_count: (emoji.use_count ?? 0) + 1 })
          .eq('id', emoji.id);
        if (error) {
          log.error('[useCustomEmojis] use_count update failed:', error.message);
          return;
        }
        queryClient.setQueryData<CustomEmoji[]>(EMOJIS_QUERY_KEY, (prev) =>
          (prev ?? []).map((e) => (e.id === emoji.id ? { ...e, use_count: (e.use_count ?? 0) + 1 } : e))
        );
      } catch (err) {
        log.error('[useCustomEmojis] increment use_count failed', err);
      }
    },
    [queryClient]
  );

  const toggleFavorite = useCallback(async (e: MouseEvent, emoji: CustomEmoji) => {
    e.stopPropagation();
    const next = !emoji.is_favorite;
    queryClient.setQueryData<CustomEmoji[]>(EMOJIS_QUERY_KEY, (prev) =>
      (prev ?? []).map((x) => (x.id === emoji.id ? { ...x, is_favorite: next } : x))
    );
    try {
      const { error } = await supabase
        .from('custom_emojis')
        .update({ is_favorite: next })
        .eq('id', emoji.id);
      if (error) throw error;
    } catch (err) {
      log.error('[useCustomEmojis] toggleFavorite failed', err);
      queryClient.setQueryData<CustomEmoji[]>(EMOJIS_QUERY_KEY, (prev) =>
        (prev ?? []).map((x) => (x.id === emoji.id ? { ...x, is_favorite: !next } : x))
      );
      toast.error('Falha ao atualizar favorito');
    }
  }, [queryClient]);

  const handleCategoryChange = useCallback(async (emoji: CustomEmoji, category: string) => {
    queryClient.setQueryData<CustomEmoji[]>(EMOJIS_QUERY_KEY, (prev) =>
      (prev ?? []).map((x) => (x.id === emoji.id ? { ...x, category } : x))
    );
    try {
      const { error } = await supabase
        .from('custom_emojis')
        .update({ category })
        .eq('id', emoji.id);
      if (error) throw error;
    } catch (err) {
      log.error('[useCustomEmojis] category change failed', err);
      queryClient.setQueryData<CustomEmoji[]>(EMOJIS_QUERY_KEY, (prev) =>
        (prev ?? []).map((x) => (x.id === emoji.id ? { ...x, category: emoji.category } : x))
      );
      toast.error('Falha ao atualizar categoria');
    }
  }, [queryClient]);

  const handleDelete = useCallback(
    async (e: MouseEvent, emoji: CustomEmoji) => {
      e.stopPropagation();
      const snapshot = queryClient.getQueryData<CustomEmoji[]>(EMOJIS_QUERY_KEY) ?? [];
      queryClient.setQueryData<CustomEmoji[]>(EMOJIS_QUERY_KEY, (list) =>
        (list ?? []).filter((x) => x.id !== emoji.id)
      );
      try {
        const { error } = await supabase.from('custom_emojis').delete().eq('id', emoji.id);
        if (error) throw error;
        toast.success('Emoji removido');
      } catch (err) {
        log.error('[useCustomEmojis] delete failed', err);
        queryClient.setQueryData(EMOJIS_QUERY_KEY, snapshot);
        toast.error('Falha ao remover emoji');
      }
    },
    [queryClient]
  );

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
    refetch: () => queryClient.invalidateQueries({ queryKey: EMOJIS_QUERY_KEY }),
  };
}
