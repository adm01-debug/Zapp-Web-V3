// Re-export from consolidated useMediaManagement module (ETAPA 40 consolidation)
import { useImportDataManagement } from '@/hooks/useMediaManagement';
import { useState, useCallback, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { z } from 'zod';
import * as XLSX from 'xlsx';

/** Imports user data from JSON file with validation and error handling. */
export function useImportData() {
  return useImportDataManagement();
}

/** Validation error for a single row field during a bulk data import. */
export interface ImportError {
  row: number;
  field: string;
  message: string;
  value?: unknown;
}

/** Import Status type alias. */
export type ImportStatus = 'idle' | 'parsing' | 'validating' | 'importing' | 'complete' | 'error';

/** Import Result interface definition. */
export interface ImportResult<T> {
  success: T[];
  errors: ImportError[];
  total: number;
  fileName: string;
}

interface UseImportDataOptions<T> {
  schema: z.ZodSchema<T>;
  onImport: (data: T[]) => Promise<void>;
  maxRows?: number;
  skipFirstRow?: boolean;
}

/** Imports and validates data from CSV/Excel files with Zod schema validation. */
export function useImportDataTyped<T>(options: UseImportDataOptions<T>) {
  const { schema, onImport, maxRows = 10000, skipFirstRow = false } = options;

  const [status, setStatus] = useState<ImportStatus>('idle');
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<ImportResult<T> | null>(null);
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    };
  }, []);

  const parseCSV = useCallback(async (file: File): Promise<unknown[]> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = (e) => {
        try {
          const text = e.target?.result as string;
          const workbook = XLSX.read(text, { type: 'string' });
          const sheet = workbook.Sheets[workbook.SheetNames[0]];
          const jsonData = XLSX.utils.sheet_to_json(sheet, {
            defval: '',
            raw: false,
          });

          const normalized = (jsonData as Record<string, unknown>[]).map((row: Record<string, unknown>) => {
            const newRow: Record<string, unknown> = {};
            Object.keys(row).forEach(key => {
              const normalizedKey = key.trim().toLowerCase().replace(/\s+/g, '_');
              newRow[normalizedKey] = row[key];
            });
            return newRow;
          });

          if (skipFirstRow && normalized.length > 0) {
            normalized.shift();
          }

          resolve(normalized);
        } catch (error) {
          reject(error);
        }
      };

      reader.onerror = () => reject(new Error('Erro ao ler arquivo'));
      reader.readAsText(file);
    });
  }, [skipFirstRow]);

  const parseExcel = useCallback(async (file: File): Promise<unknown[]> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: 'array' });
          const sheet = workbook.Sheets[workbook.SheetNames[0]];
          const jsonData = XLSX.utils.sheet_to_json(sheet, {
            defval: '',
            raw: false,
          });

          const normalized = (jsonData as Record<string, unknown>[]).map((row: Record<string, unknown>) => {
            const newRow: Record<string, unknown> = {};
            Object.keys(row).forEach(key => {
              const normalizedKey = key.trim().toLowerCase().replace(/\s+/g, '_');
              newRow[normalizedKey] = row[key];
            });
            return newRow;
          });

          if (skipFirstRow && normalized.length > 0) {
            normalized.shift();
          }

          resolve(normalized);
        } catch (error) {
          reject(error);
        }
      };

      reader.onerror = () => reject(new Error('Erro ao ler arquivo'));
      reader.readAsArrayBuffer(file);
    });
  }, [skipFirstRow]);

  const validateData = useCallback((data: unknown[]): ImportResult<T> => {
    const success: T[] = [];
    const errors: ImportError[] = [];

    data.slice(0, maxRows).forEach((row, index) => {
      try {
        const validated = schema.parse(row);
        success.push(validated);
      } catch (error) {
        if (error instanceof z.ZodError) {
          error.issues.forEach((err) => {
            errors.push({
              row: index + 2,
              field: err.path.join('.'),
              message: err.message,
              value: (row as Record<string, unknown>)[err.path[0] as string],
            });
          });
        }
      }
    });

    return {
      success,
      errors,
      total: data.length,
      fileName: '',
    };
  }, [schema, maxRows]);

  const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

  const processFile = useCallback(async (file: File) => {
    setStatus('parsing');
    setProgress(10);
    setResult(null);

    try {
      if (file.size > MAX_FILE_SIZE_BYTES) {
        throw new Error(
          `Arquivo muito grande (${(file.size / 1024 / 1024).toFixed(1)} MB). Limite: 10 MB.`
        );
      }

      const isExcel = file.name.endsWith('.xlsx') || file.name.endsWith('.xls');
      const data = isExcel ? await parseExcel(file) : await parseCSV(file);

      setStatus('validating');
      setProgress(40);

      const validationResult = validateData(data);
      validationResult.fileName = file.name;

      setResult(validationResult);
      setProgress(60);
      setStatus('complete');

      if (validationResult.errors.length > 0) {
        toast.warning(`${validationResult.success.length} válidos, ${validationResult.errors.length} com erros`);
      } else {
        toast.success(`${validationResult.success.length} registros prontos para importar`);
      }
    } catch (error) {
      setStatus('error');
      toast.error(`Erro ao processar arquivo: ${error instanceof Error ? error.message : 'Erro desconhecido'}`);
    }
  }, [parseCSV, parseExcel, validateData]);

  const confirmImport = useCallback(async () => {
    if (!result || result.success.length === 0) {
      toast.error('Nenhum dado válido para importar');
      return;
    }

    setStatus('importing');
    setProgress(70);

    try {
      await onImport(result.success);
      setProgress(100);
      toast.success(`${result.success.length} registros importados com sucesso!`);

      // Reset após 2 segundos — timer tracked so unmount can clear it
      resetTimerRef.current = setTimeout(() => {
        setStatus('idle');
        setResult(null);
        setProgress(0);
      }, 2000);
    } catch (error) {
      setStatus('error');
      toast.error(`Erro ao importar: ${error instanceof Error ? error.message : 'Erro desconhecido'}`);
    }
  }, [result, onImport]);

  const reset = useCallback(() => {
    setStatus('idle');
    setProgress(0);
    setResult(null);
  }, []);

  return {
    status,
    progress,
    result,
    processFile,
    confirmImport,
    reset,
    isProcessing: status === 'parsing' || status === 'validating' || status === 'importing',
  };
}

/** Default export. */
export default useImportData;
