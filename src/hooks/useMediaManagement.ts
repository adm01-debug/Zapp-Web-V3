// Consolidated Media & File Management Module (ETAPA 40)
// Consolidates: usePersonalStickers, useCustomEmojis, useExportData, useImportData, useDownloadPermission
import { useState, useCallback, useRef, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { log } from '@/lib/logger';
import { useMountedRef } from '@/hooks/useMountedRef';

interface Sticker {
  id: string;
  url: string;
  name: string;
  category: string;
}

interface Emoji {
  id: string;
  code: string;
  name: string;
  url: string;
}

export function usePersonalStickersManagement(userId?: string) {
  const [stickers, setStickers] = useState<Sticker[]>([]);
  const [loading, setLoading] = useState(true);
  const mountedRef = useRef(true);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const fetchStickers = useCallback(async () => {
    if (!userId) return;

    try {
      setLoading(true);
      const { data, error: err } = await supabase
        .from('personal_stickers')
        .select('*')
        .eq('user_id', userId);

      if (err) throw err;
      if (mountedRef.current) setStickers(data || []);
    } catch (err) {
      if (mountedRef.current) {
        log.error('Error fetching stickers:', err);
      }
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (userId) fetchStickers();
  }, [userId, fetchStickers]);

  return { stickers, loading, refetch: fetchStickers };
}

export function useCustomEmojisManagement() {
  const [emojis, setEmojis] = useState<Emoji[]>([]);
  const [loading, setLoading] = useState(true);
  const mounted = useMountedRef();

  useEffect(() => {
    const fetchEmojis = async () => {
      try {
        const { data, error: err } = await supabase.from('custom_emojis').select('*');

        if (err) throw err;
        if (mounted.current) setEmojis(data || []);
      } catch (err) {
        log.error('Error fetching emojis:', err);
      } finally {
        if (mounted.current) setLoading(false);
      }
    };

    fetchEmojis();
  }, [mounted]);

  return { emojis, loading };
}

export function useExportDataManagement() {
  const [isExporting, setIsExporting] = useState(false);
  const [progress, setProgress] = useState(0);

  const exportData = useCallback(async (format: 'json' | 'csv' = 'json') => {
    setIsExporting(true);
    setProgress(0);

    try {
      const { data, error: err } = await supabase.rpc('export_user_data', {
        export_format: format,
      });

      if (err) throw err;

      const element = document.createElement('a');
      const file = new Blob([JSON.stringify(data)], { type: 'application/json' });
      element.href = URL.createObjectURL(file);
      element.download = `export.${format}`;
      document.body.appendChild(element);
      element.click();
      document.body.removeChild(element);

      setProgress(100);
    } catch (err) {
      log.error('Error exporting data:', err);
    } finally {
      setIsExporting(false);
    }
  }, []);

  return { isExporting, progress, exportData };
}

export function useImportDataManagement() {
  const [isImporting, setIsImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const importData = useCallback(async (file: File) => {
    setIsImporting(true);
    setError(null);

    try {
      const text = await file.text();
      const data = JSON.parse(text);

      const { error: err } = await supabase.rpc('import_user_data', { data });

      if (err) throw err;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Import failed';
      setError(message);
      log.error('Error importing data:', err);
    } finally {
      setIsImporting(false);
    }
  }, []);

  return { isImporting, error, importData };
}

export function useDownloadPermissionManagement(resourceId?: string) {
  const [hasPermission, setHasPermission] = useState(!resourceId);
  const [loading, setLoading] = useState(Boolean(resourceId));

  useEffect(() => {
    if (!resourceId) {
      setHasPermission(true);
      setLoading(false);
      return;
    }

    const checkPermission = async () => {
      try {
        const { data, error: err } = await supabase.rpc('check_download_permission', {
          resource_id: resourceId,
        });

        if (err) throw err;
        setHasPermission(data || false);
      } catch (err) {
        log.error('Error checking download permission:', err);
        // Fail open only when the RPC doesn't exist yet:
        //   PGRST202 = PostgREST cannot find the function in its schema cache
        //   42883    = PostgreSQL undefined_function (function exists in cache but throws)
        // Any other error (network, auth, RLS) keeps permission denied.
        const code = (err as { code?: string })?.code;
        setHasPermission(code === '42883' || code === 'PGRST202');
      } finally {
        setLoading(false);
      }
    };

    checkPermission();
  }, [resourceId]);

  return { hasPermission, canDownload: hasPermission, loading };
}

export type { Sticker, Emoji };
