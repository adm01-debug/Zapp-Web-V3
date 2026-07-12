import { useState, useRef, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { StickerItem } from '@/features/inbox';

export function usePersonalStickers() {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const { data: profile } = useQuery({
    queryKey: ['my-profile-stickers'],
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('id, name').single();
      if (error) throw error;
      return data;
    },
  });

  const { data: stickers = [], isLoading } = useQuery({
    queryKey: ['personal-stickers', profile?.id],
    queryFn: async () => {
      if (!profile?.id) return [];
      const { data, error } = await supabase.from('stickers').select('*').eq('owner_id', profile.id).order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as StickerItem[];
    },
    enabled: !!profile?.id,
  });

  const handleUpload = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0 || !profile?.id) return;
    setUploading(true);
    try {
      // Validate synchronously before any async work
      const validFiles = Array.from(files).filter(file => {
        if (!file.type.startsWith('image/')) { toast.error(`${file.name} não é uma imagem`); return false; }
        if (file.size > 10 * 1024 * 1024) { toast.error(`${file.name} excede 10MB`); return false; }
        return true;
      });
      if (validFiles.length === 0) return;

      // Upload all files in parallel instead of sequentially
      const uploadResults = await Promise.all(
        validFiles.map(async (file) => {
          const ext = file.name.split('.').pop() || 'png';
          const path = `pessoal/${profile.id}/${crypto.randomUUID()}.${ext}`;
          const { error: uploadError } = await supabase.storage.from('stickers').upload(path, file, { contentType: file.type });
          if (uploadError) { toast.error(`Erro ao enviar ${file.name}: ${uploadError.message}`); return null; }
          const { data: urlData } = supabase.storage.from('stickers').getPublicUrl(path);
          return { name: file.name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' '), image_url: urlData.publicUrl, category: 'pessoal', owner_id: profile.id, uploaded_by: profile.id };
        })
      );

      // Batch insert all successful uploads in a single DB call
      const toInsert = uploadResults.filter((r): r is NonNullable<typeof r> => r !== null);
      if (toInsert.length > 0) {
        const { error: insertError } = await supabase.from('stickers').insert(toInsert);
        if (insertError) {
          toast.error('Erro ao salvar figurinhas');
        } else {
          queryClient.invalidateQueries({ queryKey: ['personal-stickers'] });
          toast.success(`${toInsert.length} figurinha${toInsert.length > 1 ? 's' : ''} adicionada${toInsert.length > 1 ? 's' : ''}! 📸`);
        }
      }
    } catch { toast.error('Erro inesperado ao enviar'); }
    finally { setUploading(false); if (fileInputRef.current) fileInputRef.current.value = ''; }
  }, [profile?.id, queryClient]);

  const toggleFavorite = useMutation({
    mutationFn: async (sticker: StickerItem) => {
      const { error } = await supabase.from('stickers').update({ is_favorite: !sticker.is_favorite }).eq('id', sticker.id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['personal-stickers'] }),
  });

  const deleteSticker = useMutation({
    mutationFn: async (sticker: StickerItem) => {
      const url = sticker.image_url;
      const storagePrefix = '/storage/v1/object/public/stickers/';
      const idx = url.indexOf(storagePrefix);
      if (idx !== -1) { await supabase.storage.from('stickers').remove([url.substring(idx + storagePrefix.length)]); }
      const { error } = await supabase.from('stickers').delete().eq('id', sticker.id);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['personal-stickers'] }); toast.success('Figurinha removida'); },
  });

  const incrementUseCount = useCallback((sticker: StickerItem) => {
    supabase.from('stickers').update({ use_count: sticker.use_count + 1 }).eq('id', sticker.id);
  }, []);

  return { profile, stickers, isLoading, uploading, fileInputRef, handleUpload, toggleFavorite, deleteSticker, incrementUseCount };
}
