/**
 * contactExportFields — definição compartilhada dos campos exportáveis de
 * contatos (CONTATOS-12). Usado por ContactExportDialog (seleção de campos)
 * e useContactsViewState (geração do CSV + log em contact_export_log).
 */
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export interface ExportFieldDef {
  key: string;
  label: string;
}

export const EXPORT_FIELDS: ExportFieldDef[] = [
  { key: 'name', label: 'Nome' },
  { key: 'surname', label: 'Sobrenome' },
  { key: 'nickname', label: 'Apelido' },
  { key: 'phone', label: 'Telefone' },
  { key: 'email', label: 'E-mail' },
  { key: 'company', label: 'Empresa' },
  { key: 'job_title', label: 'Cargo' },
  { key: 'contact_type', label: 'Tipo' },
  { key: 'tags', label: 'Tags' },
  { key: 'created_at', label: 'Criado em' },
];

export const EXPORT_DEFAULT_KEYS = EXPORT_FIELDS.map((f) => f.key);

interface ExportableContact {
  name?: string | null;
  surname?: string | null;
  nickname?: string | null;
  phone?: string | null;
  email?: string | null;
  company?: string | null;
  job_title?: string | null;
  contact_type?: string | null;
  tags?: string[] | null;
  created_at?: string | null;
}

function esc(v: string): string {
  return v.includes(',') || v.includes('"') || v.includes('\n')
    ? `"${v.replace(/"/g, '""')}"`
    : v;
}

function formatFieldValue(contact: ExportableContact, key: string): string {
  switch (key) {
    case 'name': return esc(contact.name ?? '');
    case 'surname': return esc(contact.surname ?? '');
    case 'nickname': return esc(contact.nickname ?? '');
    case 'phone': return esc(contact.phone ?? '');
    case 'email': return esc(contact.email ?? '');
    case 'company': return esc(contact.company ?? '');
    case 'job_title': return esc(contact.job_title ?? '');
    case 'contact_type': return esc(contact.contact_type ?? 'cliente');
    case 'tags': return esc((contact.tags ?? []).join('; '));
    case 'created_at':
      return esc(contact.created_at
        ? format(new Date(contact.created_at), 'dd/MM/yyyy', { locale: ptBR })
        : '');
    default: return esc('');
  }
}

export interface BuildCsvOptions {
  fields: string[];
  contacts: ExportableContact[];
  includeBom?: boolean;
}

/** Gera o CSV (UTF-8 com BOM para Excel) respeitando a ordem dos campos. */
export function buildContactsCsv({ fields, contacts, includeBom = true }: BuildCsvOptions): string {
  const selected = EXPORT_FIELDS.filter((f) => fields.includes(f.key));
  const headers = selected.map((f) => f.label);
  const rows = contacts.map((c) => selected.map((f) => formatFieldValue(c, f.key)).join(','));
  const body = [headers.join(','), ...rows].join('\n');
  return includeBom ? '\uFEFF' + body : body;
}

/** Nome de arquivo com data + hora + contagem, ex.: contatos_2026-08-04_1530_120.csv */
export function buildExportFileName(count: number, now = new Date()): string {
  const stamp = format(now, 'yyyy-MM-dd_HHmm');
  return `contatos_${stamp}_${count}.csv`;
}
