/**
 * csvUtils.ts — v2.0
 * RFC4180-compliant CSV utilities with CSV injection prevention.
 * Used by ContactExportDialog for safe data export.
 *
 * Security: All values escaped against CSV injection (=, +, -, @, TAB, CR)
 * Encoding: UTF-8 with BOM for Excel compatibility
 */

// ── CSV Injection Prevention ───────────────────────────────────────────────

// Characters that can trigger formula execution in spreadsheet apps
const FORMULA_PREFIXES = /^[=+\-@\t\r]/;

/**
 * Escape a single cell value for CSV output.
 * - Wraps in double quotes
 * - Neutralizes formula injection prefixes with TAB prefix
 * - Escapes internal double quotes by doubling them
 * - Handles null/undefined/number/boolean inputs
 */
export function escapeCsvCell(value: unknown): string {
  if (value === null || value === undefined) return '';

  const str = String(value);

  // CSV injection neutralization: prefix with TAB to prevent formula execution
  const safe = FORMULA_PREFIXES.test(str) ? `\t${str}` : str;

  // RFC4180: wrap in quotes, double any internal quotes
  return `"${safe.replace(/"/g, '""')}"`;
}

// ── CSV Builder ────────────────────────────────────────────────────────────

export interface CsvColumn<T = Record<string, unknown>> {
  key: keyof T | string;
  label: string;
  format?: (value: unknown, row: T) => string;
}

/**
 * Build a complete CSV string from rows and column definitions.
 * - UTF-8 BOM prefix for Excel compatibility
 * - CRLF line endings (RFC4180)
 * - All values properly escaped
 */
export function buildCsv<T extends Record<string, unknown>>(
  rows: T[],
  columns: CsvColumn<T>[]
): string {
  // Header row
  const header = columns.map((col) => escapeCsvCell(col.label)).join(',');

  // Data rows
  const body = rows
    .map((row) =>
      columns
        .map((col) => {
          const rawValue = row[col.key as keyof T];
          const formatted = col.format ? col.format(rawValue, row) : rawValue;
          return escapeCsvCell(formatted);
        })
        .join(',')
    )
    .join('\r\n');

  // UTF-8 BOM + header + CRLF + body
  return '\uFEFF' + header + '\r\n' + body;
}

// ── CSV Download ───────────────────────────────────────────────────────────

/**
 * Trigger a browser download of a CSV file.
 * @param csvContent The complete CSV string (including BOM)
 * @param filename Desired filename (e.g., "contacts-2026-01-01.csv")
 */
export function downloadCsvFile(csvContent: string, filename: string): void {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  // Cleanup
  setTimeout(() => {
    URL.revokeObjectURL(url);
    document.body.removeChild(link);
  }, 100);
}

// ── CSV Parser (for import) ───────────────────────────────────────────────

/**
 * Parse a CSV string into rows of key-value pairs.
 * Handles:
 * - UTF-8 BOM stripping
 * - Quoted fields with embedded commas and newlines
 * - CRLF and LF line endings
 * - Empty rows are skipped
 */
export function parseCsvString(csvContent: string): Array<Record<string, string>> {
  // Strip BOM
  const clean = csvContent.startsWith('\uFEFF') ? csvContent.slice(1) : csvContent;
  const lines = clean.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];

  const parseRow = (row: string): string[] => {
    const cells: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < row.length; i++) {
      const ch = row[i];

      if (ch === '"') {
        if (inQuotes && row[i + 1] === '"') {
          // Escaped double quote
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === ',' && !inQuotes) {
        cells.push(current);
        current = '';
      } else {
        current += ch;
      }
    }
    cells.push(current);
    return cells;
  };

  const headers = parseRow(lines[0]).map((h) => h.trim());

  return lines.slice(1).map((line) => {
    const cells = parseRow(line);
    return Object.fromEntries(headers.map((h, i) => [h, (cells[i] ?? '').trim()]));
  });
}

// ── Filename Generator ────────────────────────────────────────────────────

/**
 * Generate a safe CSV filename with date.
 * @example getCsvFilename('contatos', 'wpp2') → "contatos-wpp2-2026-01-01.csv"
 */
export function getCsvFilename(prefix: string, suffix?: string): string {
  const date = new Date().toISOString().slice(0, 10);
  const parts = [prefix, suffix, date].filter(Boolean).join('-');
  // Strip unsafe filename chars
  return parts.replace(/[^a-zA-Z0-9_\-.]/g, '_') + '.csv';
}

// ── Compat wrappers ──────────────────────────────────────────────────────
// Mantidos para componentes legados que esperam APIs por File / argumentos
// invertidos. Em código novo, prefira `parseCsvString` e `downloadCsvFile`.

/**
 * Lê um File (CSV) e devolve uma matriz crua `string[][]` (linhas × células,
 * incluindo o cabeçalho na primeira posição). Mantida nesse formato para
 * compatibilidade com `ContactImportDialog.parseRows`.
 */
export async function parseCsvFile(file: File): Promise<string[][]> {
  const raw = await file.text();
  const clean = raw.startsWith('\uFEFF') ? raw.slice(1) : raw;
  const lines = clean.split(/\r?\n/).filter((l) => l.trim().length > 0);

  const parseRow = (row: string): string[] => {
    const cells: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < row.length; i++) {
      const ch = row[i];
      if (ch === '"') {
        if (inQuotes && row[i + 1] === '"') {
          current += '"';
          i++;
        } else inQuotes = !inQuotes;
      } else if (ch === ',' && !inQuotes) {
        cells.push(current);
        current = '';
      } else current += ch;
    }
    cells.push(current);
    return cells.map((c) => c.trim());
  };

  return lines.map(parseRow);
}

/**
 * Wrapper com argumentos (filename, content) — assinatura usada por
 * ContactImportDialog. Internamente delega para `downloadCsvFile`.
 */
export function downloadCsv(filename: string, csvContent: string): void {
  downloadCsvFile(csvContent, filename);
}

export const buildCsvString = buildCsv;

/**
 * Detect possible encoding issues in raw CSV text (mojibake artifacts from
 * latin1 → UTF-8 misreads). Returns true when typical broken sequences appear.
 */
export function hasEncodingIssues(text: string): boolean {
  if (!text) return false;
  // Common mojibake markers: replacement char, "Ã" sequences, "Â" before ASCII
  return /\uFFFD|Ã[\u0080-\u00BF]|Â[\u00A0-\u00BF]/.test(text);
}
