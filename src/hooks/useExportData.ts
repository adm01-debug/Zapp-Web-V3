// Re-export from consolidated useMediaManagement module (ETAPA 40 consolidation)
import { useState, useCallback } from 'react';
import { toast } from 'sonner';
import { useDownloadPermission } from '@/hooks/useDownloadPermission';

/** Use Export Data Options interface definition. */
export interface UseExportDataOptions<T> {
  fileName: string;
  columns: Array<{ key: keyof T; header: string; format?: (value: unknown) => string }>;
}

/** Export Column interface definition. */
export interface ExportColumn<T extends Record<string, unknown>> {
  key: keyof T & string;
  header: string;
  format?: (value: unknown) => string;
}

/** Use Export Data Options interface definition. */
export interface UseExportDataOptions<T extends Record<string, unknown>> {
  columns: ExportColumn<T>[];
  fileName: string;
}

const BLOCKED_MSG = 'Exportação bloqueada por política de segurança';

/** Exports typed data to CSV/PDF/Excel formats with column mapping and formatting. */
export function useExportDataTyped<T extends Record<string, unknown>>(
  options: UseExportDataOptions<T>
) {
  const { canDownload } = useDownloadPermission();
  const [isExporting, setIsExporting] = useState(false);

  const blocked = useCallback(() => {
    toast.error('🔒 ' + BLOCKED_MSG, {
      description: 'Solicite permissão de download ao administrador.',
    });
  }, []);

  const exportCSV = useCallback(
    async (data?: T[]) => {
      if (!canDownload) {
        blocked();
        return;
      }
      if (!data || data.length === 0) {
        toast.error('Nenhum dado para exportar');
        return;
      }
      setIsExporting(true);
      try {
        const headers = options.columns.map((c) => c.header);
        const rows = data.map((row) =>
          options.columns
            .map((col) => {
              const val = row[col.key];
              const formatted = col.format ? col.format(val) : String(val ?? '');
              const escaped = formatted.replace(/"/g, '""');
              const safe = /^[=+\-@\t\r]/.test(escaped) ? `\t${escaped}` : escaped;
              return `"${safe}"`;
            })
            .join(',')
        );
        const csv = [headers.join(','), ...rows].join('\n');
        const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${options.fileName}.csv`;
        a.click();
        // Delay revoke so the browser finishes reading the blob before it's freed.
        // Revoking synchronously after click() causes empty downloads on Firefox/Safari.
        setTimeout(() => URL.revokeObjectURL(url), 100);
        toast.success('Exportação concluída!');
      } catch {
        toast.error('Erro ao exportar');
      } finally {
        setIsExporting(false);
      }
    },
    [canDownload, blocked, options]
  );

  const exportData = useCallback(
    async (data?: T[]) => {
      await exportCSV(data);
    },
    [exportCSV]
  );

  return {
    exportData,
    exportCSV,
    exportExcel: canDownload ? exportCSV : blocked,
    exportPDF: canDownload ? exportCSV : blocked,
    isExporting,
    canDownload,
  };
}

/** Default export. */
export default useExportData;
