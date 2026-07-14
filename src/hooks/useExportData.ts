// @ts-nocheck
// Re-export from consolidated useMediaManagement module (ETAPA 40 consolidation)
import { useExportDataManagement } from '@/hooks/useMediaManagement';

/** Exports user data in JSON or CSV format with permission checks. */
export function useExportData() {
  return useExportDataManagement();
}

const BLOCKED_MSG = 'Exportação bloqueada por política de segurança';

/** Exports typed data to CSV/PDF/Excel formats with column mapping and formatting. */
export function useExportData<T extends Record<string, unknown>>(
  options: UseExportDataOptions<T>
) {
  const { canDownload } = useDownloadPermission();
  const [isExporting, setIsExporting] = useState(false);

  const blocked = useCallback(() => {
    toast.error('🔒 ' + BLOCKED_MSG, {
      description: 'Solicite permissão de download ao administrador.',
    });
  }, []);

  const exportCSV = useCallback(async (data?: T[]) => {
    if (!canDownload) { blocked(); return; }
    if (!data || data.length === 0) { toast.error('Nenhum dado para exportar'); return; }
    setIsExporting(true);
    try {
      const headers = options.columns.map(c => c.header);
      const rows = data.map(row =>
        options.columns.map(col => {
          const val = row[col.key];
          const formatted = col.format ? col.format(val) : String(val ?? '');
          return `"${formatted.replace(/"/g, '""')}"`;
        }).join(',')
      );
      const csv = [headers.join(','), ...rows].join('\n');
      const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
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
  }, [canDownload, blocked, options]);

  const exportData = useCallback(async (data?: T[]) => {
    await exportCSV(data);
  }, [exportCSV]);

  return {
    exportData,
    exportCSV,
    exportExcel: canDownload ? exportCSV : blocked,
    exportPDF: canDownload ? exportCSV : blocked,
    isExporting,
    canDownload,
  };
}

export default useExportData;
