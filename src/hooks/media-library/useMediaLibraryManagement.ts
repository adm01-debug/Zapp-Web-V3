// Unified media library management module consolidating media library hooks (ETAPA 21 consolidation)
// Replaces: useMediaLibrary, useMediaUpload
import { useState, useEffect, useCallback, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getLogger } from '@/lib/logger';
import { supabase } from '@/integrations/supabase/client';
import { fromTable } from '@/lib/supabaseHelpers';
import { toast } from 'sonner';
import {
  type MediaItem,
  type MediaType,
  getCategoriesForType,
  getBucket,
  extractStoragePath,
  MAX_UPLOAD_SIZE_MB,
  MAX_UPLOAD_SIZE_BYTES,
} from './useMediaLibraryTypes';

const log = getLogger('useMediaLibraryManagement');

const MEDIA_LIBRARY_KEY = (mediaType: MediaType) => ['media-library', mediaType] as const;

// ============================================================================
// CRUD Management Section
// ============================================================================

interface UseMediaCrudParams {
  type: MediaType;
}

interface UseMediaCrudResult {
  items: MediaItem[];
  loading: boolean;
  search: string;
  setSearch: (s: string) => void;
  filterCategory: string;
  setFilterCategory: (c: string) => void;
  selected: Set<string>;
  setSelected: (s: Set<string>) => void;
  editingId: string | null;
  setEditingId: (id: string | null) => void;
  editName: string;
  setEditName: (n: string) => void;
  playingId: string | null;
  reclassifying: boolean;
  audioRef: React.RefObject<HTMLAudioElement | null>;
  categories: string[];
  filtered: MediaItem[];
  existingCategories: string[];
  fetchItems: () => Promise<void>;
  toggleSelect: (id: string) => void;
  toggleSelectAll: () => void;
  handleToggleFavorite: (item: MediaItem) => Promise<void>;
  handleBulkDelete: () => Promise<void>;
  handleBulkCategoryChange: (newCategory: string) => Promise<void>;
  handleBulkReclassify: () => Promise<void>;
  handleSingleCategoryChange: (item: MediaItem, newCategory: string) => Promise<void>;
  handleRename: (item: MediaItem) => Promise<void>;
  handleDelete: (item: MediaItem) => Promise<void>;
  handlePreview: (item: MediaItem) => void;
}

/** Manages media-library item CRUD operations (fetch, filter, select, rename, delete, favorite, category, preview) for a given media type. */
function useMediaCrudManagement({ type }: UseMediaCrudParams): UseMediaCrudResult {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [reclassifying, setReclassifying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const categories = getCategoriesForType(type);
  const bucket = getBucket(type);

  const { data: items = [], isLoading: loading, refetch: refetchQuery } = useQuery({
    queryKey: MEDIA_LIBRARY_KEY(type),
    queryFn: async () => {
      const { data, error } = await supabase
        .from(type as 'stickers')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1000);
      if (error) {
        log.error(`Error fetching ${type}:`, error);
        toast.error(
          `Erro ao carregar ${type === 'stickers' ? 'figurinhas' : type === 'audio_memes' ? 'áudios' : 'emojis'}`
        );
        return [] as MediaItem[];
      }
      return (data as MediaItem[]) || [];
    },
    staleTime: 30_000,
  });

  const fetchItems = useCallback(async () => {
    await refetchQuery();
  }, [refetchQuery]);

  useEffect(() => {
    return () => {
      audioRef.current?.pause();
      audioRef.current = null;
    };
  }, []);

  useEffect(() => {
    setSelected(new Set());
  }, [filterCategory, search]);

  const filtered = items.filter((item) => {
    const matchSearch =
      !search ||
      item.name?.toLowerCase().includes(search.toLowerCase()) ||
      item.category?.toLowerCase().includes(search.toLowerCase());
    const matchCategory = filterCategory === 'all' || item.category === filterCategory;
    return matchSearch && matchCategory;
  });

  /** Toggles selection state for a single item by id. */
  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  /** Selects all filtered items when none are fully selected, or clears the selection when all filtered items are already selected. */
  const toggleSelectAll = () => {
    if (selected.size === filtered.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map((i) => i.id)));
    }
  };

  /** Optimistically toggles `is_favorite` on `item` and reverts the local state if the Supabase update fails. */
  const handleToggleFavorite = async (item: MediaItem) => {
    const newValue = !item.is_favorite;
    queryClient.setQueryData(MEDIA_LIBRARY_KEY(type), (prev: MediaItem[] | undefined) =>
      (prev || []).map((i) => (i.id === item.id ? { ...i, is_favorite: newValue } : i))
    );
    const { error } = await supabase
      .from(type as 'stickers')
      .update({ is_favorite: newValue })
      .eq('id', item.id);
    if (error) {
      queryClient.setQueryData(MEDIA_LIBRARY_KEY(type), (prev: MediaItem[] | undefined) =>
        (prev || []).map((i) => (i.id === item.id ? { ...i, is_favorite: !newValue } : i))
      );
      toast.error('Erro ao atualizar favorito');
    }
  };

  /** Removes the storage object backing the given public URL from the appropriate Supabase bucket; no-ops when the URL is absent or unrecognized. */
  const deleteStorageFile = async (url: string | undefined) => {
    if (!url) return;
    const info = extractStoragePath(url, bucket);
    if (info) await supabase.storage.from(info.bucket).remove([info.path]);
  };

  /** Deletes all currently selected items from the database and their backing storage files in a single batch operation. */
  const handleBulkDelete = async () => {
    const toDelete = items.filter((i) => selected.has(i.id));
    if (toDelete.length === 0) return;
    const ids = [...selected];
    const { error } = await supabase
      .from(type as 'stickers')
      .delete()
      .in('id', ids);
    if (error) {
      toast.error('Erro ao excluir itens');
      return;
    }
    for (const item of toDelete) {
      await deleteStorageFile(type === 'audio_memes' ? item.audio_url : item.image_url);
    }
    queryClient.setQueryData(MEDIA_LIBRARY_KEY(type), (prev: MediaItem[] | undefined) =>
      (prev || []).filter((i) => !selected.has(i.id))
    );
    setSelected(new Set());
    toast.success(`${ids.length} itens excluídos`);
  };

  /** Optimistically moves all selected items to `newCategory` and reverts on Supabase error. */
  const handleBulkCategoryChange = async (newCategory: string) => {
    const ids = [...selected];
    if (ids.length === 0) return;
    const oldItems = items
      .filter((i) => selected.has(i.id))
      .map((i) => ({ id: i.id, category: i.category }));
    queryClient.setQueryData(MEDIA_LIBRARY_KEY(type), (prev: MediaItem[] | undefined) =>
      (prev || []).map((i) => (selected.has(i.id) ? { ...i, category: newCategory } : i))
    );
    const { error } = await supabase
      .from(type as 'stickers')
      .update({ category: newCategory })
      .in('id', ids);
    if (error) {
      queryClient.setQueryData(MEDIA_LIBRARY_KEY(type), (prev: MediaItem[] | undefined) =>
        (prev || []).map((i) => {
          const old = oldItems.find((o) => o.id === i.id);
          return old ? { ...i, category: old.category } : i;
        })
      );
      toast.error('Erro ao alterar categorias');
      return;
    }
    toast.success(`${ids.length} itens movidos para "${newCategory}"`);
  };

  /** Sends each selected item to the AI classification edge function and updates its category when the returned label differs from the current one. */
  const handleBulkReclassify = async () => {
    const toReclassify = items.filter((i) => selected.has(i.id));
    if (toReclassify.length === 0) return;
    setReclassifying(true);
    let updated = 0,
      errors = 0;
    const fnName =
      type === 'audio_memes'
        ? 'classify-audio-meme'
        : type === 'stickers'
          ? 'classify-sticker'
          : 'classify-emoji';
    for (const item of toReclassify) {
      try {
        const body =
          type === 'audio_memes'
            ? { audio_url: item.audio_url || '', file_name: item.name || '' }
            : { image_url: item.image_url || '' };
        const { data } = await supabase.functions.invoke(fnName, { body });
        if (data?.category && data.category !== item.category) {
          const { error } = await supabase
            .from(type as 'stickers')
            .update({ category: data.category })
            .eq('id', item.id);
          if (!error) {
            queryClient.setQueryData(MEDIA_LIBRARY_KEY(type), (prev: MediaItem[] | undefined) =>
              (prev || []).map((i) => (i.id === item.id ? { ...i, category: data.category } : i))
            );
            updated++;
          } else errors++;
        }
      } catch {
        errors++;
      }
    }
    setReclassifying(false);
    setSelected(new Set());
    const msg = `${updated}/${toReclassify.length} itens reclassificados com IA`;
    if (errors > 0) {
      toast.info(`${msg} (${errors} erros)`);
    } else {
      toast.success(msg);
    }
  };

  /** Optimistically updates the category of a single item and reverts local state if the database write fails. */
  const handleSingleCategoryChange = async (item: MediaItem, newCategory: string) => {
    const oldCategory = item.category;
    queryClient.setQueryData(MEDIA_LIBRARY_KEY(type), (prev: MediaItem[] | undefined) =>
      (prev || []).map((i) => (i.id === item.id ? { ...i, category: newCategory } : i))
    );
    const { error } = await supabase
      .from(type as 'stickers')
      .update({ category: newCategory })
      .eq('id', item.id);
    if (error) {
      queryClient.setQueryData(MEDIA_LIBRARY_KEY(type), (prev: MediaItem[] | undefined) =>
        (prev || []).map((i) => (i.id === item.id ? { ...i, category: oldCategory } : i))
      );
      toast.error('Erro ao alterar categoria');
    }
  };

  /** Persists the trimmed `editName` as the item's new name and reverts optimistic local state on failure. */
  const handleRename = async (item: MediaItem) => {
    const trimmed = editName.trim();
    if (!trimmed) {
      toast.error('O nome não pode ser vazio');
      return;
    }
    const oldName = item.name;
    queryClient.setQueryData(MEDIA_LIBRARY_KEY(type), (prev: MediaItem[] | undefined) =>
      (prev || []).map((i) => (i.id === item.id ? { ...i, name: trimmed } : i))
    );
    const { error } = await supabase
      .from(type as 'stickers')
      .update({ name: trimmed })
      .eq('id', item.id);
    if (error) {
      queryClient.setQueryData(MEDIA_LIBRARY_KEY(type), (prev: MediaItem[] | undefined) =>
        (prev || []).map((i) => (i.id === item.id ? { ...i, name: oldName } : i))
      );
      toast.error('Erro ao renomear');
      return;
    }
    setEditingId(null);
    toast.success('Nome atualizado');
  };

  /** Deletes `item` from the database and its backing storage file, then removes it from local state. */
  const handleDelete = async (item: MediaItem) => {
    const { error } = await supabase
      .from(type as 'stickers')
      .delete()
      .eq('id', item.id);
    if (error) {
      toast.error('Erro ao excluir item');
      return;
    }
    await deleteStorageFile(type === 'audio_memes' ? item.audio_url : item.image_url);
    queryClient.setQueryData(MEDIA_LIBRARY_KEY(type), (prev: MediaItem[] | undefined) =>
      (prev || []).filter((i) => i.id !== item.id)
    );
    toast.success('Item excluído');
  };

  /** Toggles audio playback for `item`: pauses the current audio when the same item is clicked again, or starts a new Audio instance for a different item. */
  const handlePreview = (item: MediaItem) => {
    if (type !== 'audio_memes') return;
    if (playingId === item.id) {
      audioRef.current?.pause();
      setPlayingId(null);
      return;
    }
    audioRef.current?.pause();
    audioRef.current = null;
    if (!item.audio_url) {
      toast.error('URL do áudio não encontrada');
      return;
    }
    const audio = new Audio(item.audio_url);
    audio.onended = () => setPlayingId(null);
    audio.onerror = () => {
      setPlayingId(null);
      toast.error('Erro ao reproduzir áudio');
    };
    audio.play().catch(() => {
      setPlayingId(null);
      toast.error('Erro ao reproduzir áudio');
    });
    audioRef.current = audio;
    setPlayingId(item.id);
  };

  const existingCategories = [...new Set(items.map((i) => i.category))].sort();

  return {
    items,
    loading,
    search,
    setSearch,
    filterCategory,
    setFilterCategory,
    selected,
    setSelected,
    editingId,
    setEditingId,
    editName,
    setEditName,
    playingId,
    reclassifying,
    audioRef,
    categories: (categories as any),
    filtered,
    existingCategories,
    fetchItems,
    toggleSelect,
    toggleSelectAll,
    handleToggleFavorite,
    handleBulkDelete,
    handleBulkCategoryChange,
    handleBulkReclassify,
    handleSingleCategoryChange,
    handleRename,
    handleDelete,
    handlePreview,
  };
}

// ============================================================================
// Upload Management Section
// ============================================================================

interface UseMediaUploadParams {
  type: MediaType;
  onComplete: () => void;
}

interface UseMediaUploadResult {
  bulkUploading: boolean;
  uploadProgress: number;
  fileInputRef: React.RefObject<HTMLInputElement>;
  acceptTypes: string;
  handleBulkUpload: (e: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
}

/** Handles bulk file uploads for a media type: validates size/type, uploads to Supabase Storage, triggers AI classification, and inserts a database row for each successful upload. */
function useMediaUploadManagement({
  type,
  onComplete,
}: UseMediaUploadParams): UseMediaUploadResult {
  const [bulkUploading, setBulkUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bucket = getBucket(type);
  const acceptTypes =
    type === 'audio_memes' ? 'audio/*' : 'image/webp,image/png,image/gif,image/jpeg';

  const handleBulkUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files || files.length === 0) return;
      const fileList = Array.from(files);
      const acceptedTypes =
        type === 'audio_memes'
          ? (f: File) => f.type.startsWith('audio/')
          : (f: File) => f.type.startsWith('image/');
      const validFiles = fileList.filter(acceptedTypes);
      if (validFiles.length === 0) {
        toast.error('Nenhum arquivo válido selecionado');
        if (fileInputRef.current) fileInputRef.current.value = '';
        return;
      }
      const oversizedFiles = validFiles.filter((f) => f.size > MAX_UPLOAD_SIZE_BYTES);
      if (oversizedFiles.length > 0) {
        toast.error(
          `${oversizedFiles.length} arquivo(s) excedem ${MAX_UPLOAD_SIZE_MB}MB e serão ignorados`
        );
      }
      const sizedFiles = validFiles.filter((f) => f.size <= MAX_UPLOAD_SIZE_BYTES);
      if (sizedFiles.length === 0) {
        toast.error('Nenhum arquivo com tamanho válido');
        if (fileInputRef.current) fileInputRef.current.value = '';
        return;
      }

      setBulkUploading(true);
      setUploadProgress(0);
      const {
        data: { user },
      } = await supabase.auth.getUser();
      let successCount = 0;

      for (let i = 0; i < sizedFiles.length; i++) {
        const file = sizedFiles[i];
        try {
          const ext = file.name.split('.').pop() || (type === 'audio_memes' ? 'mp3' : 'webp');
          const storagePath = `bulk_${Date.now()}_${crypto.randomUUID()}.${ext}`;
          const { error: uploadError } = await supabase.storage
            .from(bucket)
            .upload(storagePath, file, { contentType: file.type, cacheControl: '31536000' });
          if (uploadError) {
            log.error(`Upload error for ${file.name}:`, uploadError);
            continue;
          }
          const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(storagePath);
          const name = file.name.replace(/\.[^.]+$/, '');
          let aiCategory = 'outros';
          try {
            const fnName =
              type === 'audio_memes'
                ? 'classify-audio-meme'
                : type === 'stickers'
                  ? 'classify-sticker'
                  : 'classify-emoji';
            const body =
              type === 'audio_memes'
                ? { audio_url: urlData.publicUrl, file_name: file.name }
                : { image_url: urlData.publicUrl };
            const { data: classifyData, error: _error } = await supabase.functions.invoke(fnName, {
              body,
            });
            if (classifyData?.category) aiCategory = classifyData.category;
          } catch (err) {
            log.error('Unexpected error in useMediaUploadManagement:', err);
          }
          const insertData: Record<string, unknown> = {
            name,
            category: aiCategory,
            is_favorite: false,
            use_count: 0,
            uploaded_by: user?.id || null,
          };
          if (type === 'audio_memes') insertData.audio_url = urlData.publicUrl;
          else insertData.image_url = urlData.publicUrl;
          const { error: insertError } = await fromTable(type).insert(insertData);
          if (!insertError) successCount++;
        } catch (err) {
          log.error(`Unexpected error uploading ${file.name}:`, err);
        }
        setUploadProgress(Math.round(((i + 1) / sizedFiles.length) * 100));
      }

      setBulkUploading(false);
      setUploadProgress(0);
      if (fileInputRef.current) fileInputRef.current.value = '';
      toast.success(
        `${successCount}/${sizedFiles.length} arquivos importados com classificação IA`
      );
      onComplete();
    },
    [type, bucket, onComplete]
  );

  return { bulkUploading, uploadProgress, fileInputRef, acceptTypes, handleBulkUpload };
}

// ============================================================================
// Orchestration Section (Re-exports individual management functions)
// ============================================================================

/** Hook: use Media Library Management. */
export { useMediaCrudManagement, useMediaUploadManagement };
export type { UseMediaCrudParams, UseMediaCrudResult, UseMediaUploadParams, UseMediaUploadResult };