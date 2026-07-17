// Consolidated Media & File Management Module (ETAPA 40)
// Consolidates: usePersonalStickers, useCustomEmojis, useExportData, useImportData, useDownloadPermission
import { useState, useCallback, useRef, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { log } from '@/lib/logger';
import { toast } from 'sonner';
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
      // GAP-4: export_user_data RPC not yet deployed to DB
      toast.error('Exportação de dados não disponível no momento. Entre em contato com o suporte.');
      log.warn('exportData called but export_user_data RPC is not deployed');
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
      // GAP-4: import_user_data RPC not yet deployed to DB
      const message = 'Importação de dados não disponível no momento.';
      setError(message);
      toast.error(message);
      log.warn('importData called but import_user_data RPC is not deployed');
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
        // GAP-4: check_download_permission RPC not yet deployed — grant access by default
        setHasPermission(true);
        log.warn(
          'checkPermission called but check_download_permission RPC is not deployed; defaulting to true'
        );
      } catch (err) {
        log.error('Error checking download permission:', err);
      } finally {
        setLoading(false);
      }
    };

    checkPermission();
  }, [resourceId]);

  return { hasPermission, canDownload: hasPermission, loading };
}

export type { Sticker, Emoji };
