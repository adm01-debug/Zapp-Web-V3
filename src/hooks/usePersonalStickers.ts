// Full-API personal stickers hook.
// Backed by public.stickers (schema.stickers) + Storage bucket `stickers`.
// Notes:
// - `stickers` table has columns: id, name, image_url, category, is_favorite, use_count, owner_id (from schema list).
// - Storage bucket is `stickers` (public).
import { useCallback, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/features/auth';
import { toast } from '@/hooks/use-toast';
import { log } from '@/lib/logger';
import type { StickerItem } from '@/features/inbox/components/stickers/StickerTypes';

const STICKERS_TABLE = 'stickers';
const STICKERS_BUCKET = 'stickers';
const MAX_FILE_SIZE = 512 * 1024; // 512KB (bucket limit)

interface UsePersonalStickersResult {
  profile: ReturnType<typeof useAuth>['profile'];
  stickers: StickerItem[];
  isLoading: boolean;
  uploading: boolean;
  fileInputRef: React.RefObject<HTMLInputElement>;
  handleUpload: (files: FileList | null) => Promise<void>;
  toggleFavorite: { mutate: (sticker: StickerItem) => void };
  deleteSticker: { mutate: (sticker: StickerItem) => void };
  incrementUseCount: (sticker: StickerItem) => void;
  refetch: () => void;
}

/** Hook: use Personal Stickers (full API). */
export function usePersonalStickers(): UsePersonalStickersResult {
  const { profile } = useAuth();
  const ownerId = profile?.id;
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null!);
  const [uploading, setUploading] = useState(false);

  const QUERY_KEY = ['personal-stickers', ownerId] as const;

  const { data: stickers = [], isLoading, refetch } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: async (): Promise<StickerItem[]> => {
      if (!ownerId) return [];
      const { data, error } = await supabase
        .from(STICKERS_TABLE as never)
        .select('id, name, image_url, category, is_favorite, use_count, owner_id')
        .eq('owner_id', ownerId)
        .order('is_favorite', { ascending: false })
        .order('use_count', { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as StickerItem[];
    },
    enabled: !!ownerId,
    staleTime: 30_000,
  });

  const handleUpload = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0 || !ownerId) return;
      setUploading(true);
      try {
        for (const file of Array.from(files)) {
          if (!file.type.startsWith('image/')) {
            toast({
              title: 'Arquivo inválido',
              description: `${file.name} não é uma imagem.`,
              variant: 'destructive',
            });
            continue;
          }
          if (file.size > MAX_FILE_SIZE) {
            toast({
              title: 'Arquivo muito grande',
              description: `${file.name} excede 512KB.`,
              variant: 'destructive',
            });
            continue;
          }
          const ext = file.name.split('.').pop() || 'png';
          const path = `${ownerId}/${crypto.randomUUID()}.${ext}`;
          const { error: upErr } = await supabase.storage
            .from(STICKERS_BUCKET)
            .upload(path, file, { contentType: file.type, upsert: false });
          if (upErr) throw upErr;

          const { data: pub } = supabase.storage.from(STICKERS_BUCKET).getPublicUrl(path);
          const { error: insErr } = await supabase.from(STICKERS_TABLE as never).insert({
            owner_id: ownerId,
            name: file.name.replace(/\.[^.]+$/, ''),
            image_url: pub.publicUrl,
            category: 'pessoal',
            is_favorite: false,
            use_count: 0,
          } as never);
          if (insErr) throw insErr;
        }
        toast({ title: 'Figurinhas adicionadas', description: 'Upload concluído.' });
        void queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      } catch (err) {
        log.error('Sticker upload failed:', err);
        toast({
          title: 'Erro no upload',
          description: err instanceof Error ? err.message : 'Falha ao enviar figurinhas.',
          variant: 'destructive',
        });
      } finally {
        setUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    },
    [ownerId, queryClient, QUERY_KEY]
  );

  const toggleFavoriteMutation = useMutation({
    mutationFn: async (sticker: StickerItem) => {
      const { error } = await supabase
        .from(STICKERS_TABLE as never)
        .update({ is_favorite: !sticker.is_favorite } as never)
        .eq('id', sticker.id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
    onError: (err) => {
      log.error('Toggle favorite failed:', err);
      toast({ title: 'Erro', description: 'Não foi possível atualizar favorito.', variant: 'destructive' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (sticker: StickerItem) => {
      // Best-effort remove from Storage (path derived from URL last segments).
      try {
        const url = new URL(sticker.image_url);
        const marker = `/${STICKERS_BUCKET}/`;
        const idx = url.pathname.indexOf(marker);
        if (idx >= 0) {
          const path = decodeURIComponent(url.pathname.slice(idx + marker.length));
          await supabase.storage.from(STICKERS_BUCKET).remove([path]);
        }
      } catch (err) {
        log.warn('Storage cleanup skipped:', err);
      }
      const { error } = await supabase.from(STICKERS_TABLE as never).delete().eq('id', sticker.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: 'Figurinha removida' });
      void queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
    onError: (err) => {
      log.error('Delete sticker failed:', err);
      toast({ title: 'Erro', description: 'Não foi possível remover.', variant: 'destructive' });
    },
  });

  const incrementUseCount = useCallback(
    (sticker: StickerItem) => {
      void supabase
        .from(STICKERS_TABLE as never)
        .update({ use_count: (sticker.use_count ?? 0) + 1 } as never)
        .eq('id', sticker.id)
        .then(({ error }) => {
          if (error) log.warn('Increment use_count failed:', error);
        });
    },
    []
  );

  return {
    profile,
    stickers,
    isLoading,
    uploading,
    fileInputRef,
    handleUpload,
    toggleFavorite: { mutate: (s) => toggleFavoriteMutation.mutate(s) },
    deleteSticker: { mutate: (s) => deleteMutation.mutate(s) },
    incrementUseCount,
    refetch: () => void refetch(),
  };
}
