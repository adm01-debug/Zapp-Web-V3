import { useState, useCallback, useRef, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { safeClient } from '@/integrations/supabase/safeClient';
import { getLogger } from '@/lib/logger';

const log = getLogger('useMediaUploadQueue');
import { toast } from 'sonner';
import { validateFile } from '@/utils/whatsappFileTypes';

export interface MediaUploadItem {
  id: string;
  file: File;
  fileName: string;
  fileType: string;
  fileSize: number;
  category: string;
  caption?: string;
  status:
    | 'pending'
    | 'validating'
    | 'uploading'
    | 'uploaded'
    | 'sending_api'
    | 'completed'
    | 'failed'
    | 'canceled';
  progress: number;
  retryCount: number;
  maxRetries: number;
  errorMessage?: string;
  storagePath?: string;
}

const DEFAULT_MAX_RETRIES = 3;
const RETRY_BASE_MS = 800;

/**
 * Resilient media upload queue:
 * - Per-file validation (mime/size/category)
 * - Heuristic progress reporting (Supabase JS doesn't expose XHR progress
 *   for storage.upload, so we tick optimistic progress + final 100% on success)
 * - Partial failure tolerance (each item is independent)
 * - Automatic retry with exponential backoff (configurable per call)
 * - Manual retry & cancel
 * - Persists state in `media_upload_queue` for cross-tab/audit
 */
export function useMediaUploadQueue(contactId: string) {
  const [queue, setQueue] = useState<MediaUploadItem[]>([]);
  const agentIdRef = useRef<string | null>(null);
  const cancelRef = useRef<Set<string>>(new Set());
  const tickersRef = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map());

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      agentIdRef.current = data.user?.id || null;
    }).catch(() => {});
    return () => {
      tickersRef.current.forEach((t) => clearInterval(t));
      tickersRef.current.clear();
    };
  }, []);

  const patch = useCallback((id: string, partial: Partial<MediaUploadItem>) => {
    setQueue((prev) => prev.map((it) => (it.id === id ? { ...it, ...partial } : it)));
  }, []);

  const persist = useCallback(async (id: string, partial: Partial<MediaUploadItem>) => {
    try {
      const { file, ...updateData } = partial; // Don't try to persist File object
      await safeClient.from('media_upload_queue', (q) => q.update(updateData as Record<string, unknown>).eq('id', id));
    } catch (err) {
      log.error('[MediaQueue] persist failed', err);
    }
  }, []);

  const startTicker = useCallback(
    (id: string) => {
      // Heuristic optimistic progress until upload resolves.
      const interval = setInterval(() => {
        setQueue((prev) =>
          prev.map((it) => {
            if (it.id !== id) return it;
            if (it.status !== 'uploading') return it;
            // Asymptotically approach 90%.
            const next = Math.min(90, it.progress + Math.max(2, (90 - it.progress) * 0.12));
            return { ...it, progress: Math.round(next) };
          }),
        );
      }, 350);
      tickersRef.current.set(id, interval);
    },
    [],
  );

  const stopTicker = useCallback((id: string) => {
    const t = tickersRef.current.get(id);
    if (t) {
      clearInterval(t);
      tickersRef.current.delete(id);
    }
  }, []);

  const performUpload = useCallback(
    async (item: MediaUploadItem): Promise<{ ok: true; storagePath: string } | { ok: false; error: string }> => {
      const storagePath = `${contactId}/${item.id}_${item.file.name}`;
      patch(item.id, { status: 'uploading', progress: 5 });
      await persist(item.id, { status: 'uploading', progress: 5 });
      startTicker(item.id);

      try {
        const { error } = await supabase.storage
          .from('whatsapp-media')
          .upload(storagePath, item.file, {
            contentType: item.file.type || 'application/octet-stream',
            upsert: true,
          });
        stopTicker(item.id);

        if (cancelRef.current.has(item.id)) {
          return { ok: false, error: 'canceled' };
        }
        if (error) return { ok: false, error: error.message };
        return { ok: true, storagePath };
      } catch (err) {
        stopTicker(item.id);
        return { ok: false, error: err instanceof Error ? err.message : 'upload failed' };
      }
    },
    [contactId, patch, persist, startTicker, stopTicker],
  );

  const runWithRetry = useCallback(
    async (item: MediaUploadItem) => {
      let attempt = 0;
      let lastError = 'unknown error';
      while (attempt <= item.maxRetries) {
        if (cancelRef.current.has(item.id)) {
          patch(item.id, { status: 'canceled' });
          await persist(item.id, { status: 'canceled' });
          return;
        }
        if (attempt > 0) {
          const delay = RETRY_BASE_MS * Math.pow(2, attempt - 1);
          patch(item.id, { retryCount: attempt, errorMessage: `Tentando novamente (${attempt}/${item.maxRetries})…` });
          await new Promise((r) => setTimeout(r, delay));
        }
        const result = await performUpload(item);
        if (result.ok === true) {
          patch(item.id, { status: 'uploaded', progress: 100, storagePath: result.storagePath, errorMessage: undefined });
          await persist(item.id, { status: 'uploaded', progress: 100, storagePath: result.storagePath });
          return;
        }
        const errMsg = result.error;
        if (errMsg === 'canceled') {
          patch(item.id, { status: 'canceled' });
          await persist(item.id, { status: 'canceled' });
          return;
        }
        lastError = errMsg;
        attempt += 1;
      }
      patch(item.id, { status: 'failed', errorMessage: lastError, retryCount: attempt - 1 });
      await persist(item.id, { status: 'failed', errorMessage: lastError, retryCount: attempt - 1 });
      toast.error(`Falha no anexo: ${item.fileName}`);
    },
    [patch, performUpload, persist],
  );

  const addToQueue = useCallback(
    async (file: File, options?: { caption?: string; maxRetries?: number }): Promise<string | null> => {
      if (!agentIdRef.current) {
        const { data } = await supabase.auth.getUser();
        agentIdRef.current = data.user?.id || null;
      }
      if (!agentIdRef.current) return null;

      const validation = validateFile(file);
      const item: MediaUploadItem = {
        id: crypto.randomUUID(),
        file,
        fileName: file.name,
        fileType: file.type,
        fileSize: file.size,
        category: validation.category || 'document',
        caption: options?.caption,
        status: 'validating',
        progress: 0,
        retryCount: 0,
        maxRetries: options?.maxRetries ?? DEFAULT_MAX_RETRIES,
      };

      setQueue((prev) => [...prev, item]);

      if (!validation.valid) {
        const msg = validation.error || 'Tipo ou tamanho de arquivo não suportado.';
        patch(item.id, { status: 'failed', errorMessage: msg });
        toast.error(`Anexo inválido (${file.name}): ${msg}`);
        return null;
      }

      try {
        const { error: dbError } = await safeClient.from('media_upload_queue', (q) => q.insert({
          id: item.id,
          contact_id: contactId,
          file_name: item.fileName,
          file_type: item.fileType,
          file_size: item.fileSize,
          agent_id: agentIdRef.current,
          caption: options?.caption,
          status: 'pending',
          max_retries: item.maxRetries,
          metadata: { category: item.category },
        }));
        if (dbError) throw dbError;
      } catch (err) {
        log.error('[MediaQueue] insert row failed', err);
        // We continue with the upload even if DB persistence fails locally
      }

      void runWithRetry(item);
      return item.id;
    },
    [contactId, patch, runWithRetry],
  );

  const addManyToQueue = useCallback(
    async (files: File[], options?: { caption?: string; maxRetries?: number }) => {
      const results = await Promise.allSettled(files.map((f) => addToQueue(f, options)));
      return results.map((r, i) => ({
        file: files[i],
        id: r.status === 'fulfilled' ? r.value : null,
        ok: r.status === 'fulfilled' && r.value !== null,
      }));
    },
    [addToQueue],
  );

  const retryUpload = useCallback(
    (id: string) => {
      const item = queue.find((q) => q.id === id);
      if (!item) return;
      cancelRef.current.delete(id);
      patch(id, { status: 'pending', progress: 0, errorMessage: undefined, retryCount: 0 });
      void runWithRetry({ ...item, status: 'pending', progress: 0, retryCount: 0 });
    },
    [queue, patch, runWithRetry],
  );

  const retryAllFailed = useCallback(() => {
    queue.filter((q) => q.status === 'failed').forEach((q) => retryUpload(q.id));
  }, [queue, retryUpload]);

  const cancelUpload = useCallback(
    (id: string) => {
      cancelRef.current.add(id);
      stopTicker(id);
      patch(id, { status: 'canceled' });
      void persist(id, { status: 'canceled' });
    },
    [patch, persist, stopTicker],
  );

  const clearCompleted = useCallback(() => {
    setQueue((prev) => prev.filter((q) => q.status !== 'uploaded' && q.status !== 'completed'));
  }, []);

  const removeItem = useCallback((id: string) => {
    cancelRef.current.add(id);
    stopTicker(id);
    setQueue((prev) => prev.filter((q) => q.id !== id));
  }, [stopTicker]);

  return {
    queue,
    addToQueue,
    addManyToQueue,
    retryUpload,
    retryAllFailed,
    cancelUpload,
    clearCompleted,
    removeItem,
    hasFailed: queue.some((q) => q.status === 'failed'),
    isUploading: queue.some((q) => q.status === 'uploading' || q.status === 'pending'),
  };
}