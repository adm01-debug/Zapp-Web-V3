/**
 * Export functions BLOCKED for data protection (LGPD/client data security).
 * All export operations are disabled system-wide.
 */
import { getLogger } from '@/lib/logger';

const log = getLogger('ExportReport');

export interface ReportData {
  title: string;
  subtitle?: string;
  generatedAt: Date;
  columns: { header: string; key: string; width?: number }[];
  rows: Record<string, unknown>[];
  summary?: { label: string; value: string | number }[];
}

const BLOCKED_MESSAGE = '🔒 Exportação bloqueada: A exportação de dados está desabilitada por política de segurança para proteção dos dados de clientes e fornecedores.';

/** export To P D F constant. */
export const exportToPDF = (_data: ReportData): void => {
  log.warn('PDF export blocked by data protection policy');
  throw new Error(BLOCKED_MESSAGE);
};

/** export To Excel constant. */
export const exportToExcel = (_data: ReportData): void => {
  log.warn('Excel export blocked by data protection policy');
  throw new Error(BLOCKED_MESSAGE);
};

/** export To C S V constant. */
export const exportToCSV = (_data: ReportData): void => {
  log.warn('CSV export blocked by data protection policy');
  throw new Error(BLOCKED_MESSAGE);
};
