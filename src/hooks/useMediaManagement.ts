// Consolidated Media & File Management Module (ETAPA 40)
// Consolidates: usePersonalStickers, useCustomEmojis, useExportData, useImportData, useDownloadPermission
import { useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { log } from '@/lib/logger';

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

/** Hook: use Personal Stickers Management. */
export function usePersonalStickersManagement(userId?: string) {
  const { data: stickers = [], isLoading: loading, refetch } = useQuery({
    queryKey: ['personal-stickers', userId],
    queryFn: async () => {
      const { data, error: err } = await supabase
        .from('personal_stickers')
        .select('*')
        .eq('user_id', userId!);
      if (err) throw err;
      return (data || []) as Sticker[];
    },
    enabled: !!userId,
    staleTime: 30_000,
  });

  return { stickers, loading, refetch };
}

/** Hook: use Custom Emojis Management. */
export function useCustomEmojisManagement() {
  const { data: emojis = [], isLoading: loading } = useQuery({
    queryKey: ['custom-emojis'],
    queryFn: async () => {
      const { data, error: err } = await supabase.from('custom_emojis').select('*');
      if (err) throw err;
      return (data || []) as Emoji[];
    },
    staleTime: 60_000,
  });

  return { emojis, loading };
}

/** Hook: use Export Data Management. */
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

/** Hook: use Import Data Management. */
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

/** Hook: use Download Permission Management. */
export function useDownloadPermissionManagement(resourceId?: string) {
  const { data: hasPermission = !resourceId, isLoading: loading } = useQuery({
    queryKey: ['download-permission', resourceId],
    queryFn: async () => {
      try {
        const { data, error: err } = await supabase.rpc('check_download_permission', {
          resource_id: resourceId!,
        });
        if (err) throw err;
        return data || false;
      } catch (err) {
        log.error('Error checking download permission:', err);
        // Fail open only when the RPC doesn't exist yet (SQLSTATE 42883 = undefined_function).
        // Any other error (network, auth, RLS) keeps permission denied.
        const code = (err as { code?: string })?.code;
        return code === '42883';
      }
    },
    enabled: !!resourceId,
    staleTime: 30_000,
  });

  return { hasPermission, canDownload: hasPermission, loading: !!resourceId && loading };
}

/** Re-exported module members. */
export type { Sticker, Emoji };
