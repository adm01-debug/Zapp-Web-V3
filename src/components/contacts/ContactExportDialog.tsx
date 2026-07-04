/**
 * ContactExportDialog.tsx — v2.0
 * Export contacts from evolution_contacts to CSV.
 * Respects active filters and selected IDs.
 * CSV injection prevention + UTF-8 BOM for Excel.
 */
import React, { useState } from 'react';
const log = getLogger('ContactExportDialog');

import { getLogger } from '@/lib/logger';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Download, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { sanitizeText } from '@/lib/sanitize';
import { formatPhoneForDisplay } from '@/lib/phoneUtils';
import { dbFrom } from '@/integrations/datasource/db';

// ── Column definitions (evolution_contacts schema) ────────────────────────

const COLUMNS = [
  { key: 'display_name',     label: 'Nome',              default: true  },
  { key: 'phone_number',     label: 'Telefone',          default: true  },
  { key: 'email',            label: 'E-mail',            default: true  },
  { key: 'company',          label: 'Empresa',           default: true  },
  { key: 'tags',             label: 'Tags',              default: true  },
  { key: 'lead_status',      label: 'Status do Lead',    default: true  },
  { key: 'lead_score',       label: 'Score',             default: false },
  { key: 'instance_name',    label: 'Instância',         default: false },
  { key: 'last_message_at',  label: 'Último contato',    default: true  },
  { key: 'first_contact_at', label: 'Primeiro contato',  default: false },
  { key: 'total_messages',   label: 'Total mensagens',   default: false },
  { key: 'created_at',       label: 'Criado em',         default: false },
  { key: 'lgpd_consent_at',  label: 'Consentimento LGPD',default: false },
] as const;

type ColumnKey = typeof COLUMNS[number]['key'];

// ── CSV utilities ─────────────────────────────────────────────────────────

function escapeCsv(value: unknown): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  // CSV injection prevention: neutralize formula prefixes
  const DANGEROUS = /^[=+\-@\t\r]/;
  const escaped = DANGEROUS.test(str) ? `\t${str}` : str;
  return `"${escaped.replace(/"/g, '""')}"`;
}

function buildCsv(rows: Record<string, string>[], headers: { key: string; label: string }[]): string {
  const header = headers.map((h) => escapeCsv(h.label)).join(',');
  const body = rows.map((r) => headers.map((h) => escapeCsv(r[h.key] ?? '')).join(',')).join('\r\n');
  return '\uFEFF' + header + '\r\n' + body; // UTF-8 BOM for Excel
}

function downloadCsv(csv: string, filename: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// ── Component ─────────────────────────────────────────────────────────────

interface Props {
  open:         boolean;
  onOpenChange: (v: boolean) => void;
  workspaceId:  string; // instance_name
  activeFilters?: { search: string; tags: string[]; channel: string | null };
  selectedIds?:   string[];
}

export const ContactExportDialog: React.FC<Props> = ({
  open, onOpenChange, workspaceId: instanceName, activeFilters, selectedIds,
}) => {
  const { toast } = useToast();
  const [loading,  setLoading]  = useState(false);
  const [columns,  setColumns]  = useState<Set<ColumnKey>>(
    new Set(COLUMNS.filter((c) => c.default).map((c) => c.key))
  );

  const toggle = (key: ColumnKey) => {
    setColumns((prev) => { const n = new Set(prev); if (n.has(key)) n.delete(key); else n.add(key); return n; });
  };

  const handleExport = async () => {
    setLoading(true);
    try {
      let q = dbFrom('contacts')
        .select([
          'full_name','push_name','phone_number','email','company','tags',
          'lead_status','lead_score','instance_name','last_message_at',
          'first_contact_at','total_messages','created_at','lgpd_consent_at',
        ].join(','))
        .is('deleted_at', null)
        .eq('instance_name', instanceName)
        .order('full_name', { ascending: true })
        .limit(100_000);

      if (selectedIds && selectedIds.length > 0) {
        q = q.in('id', selectedIds);
      } else {
        if (activeFilters?.channel) q = q.eq('lead_status', activeFilters.channel);
        if (activeFilters?.tags?.length) q = q.overlaps('tags', activeFilters.tags);
        if (activeFilters?.search?.trim()) {
          const s = activeFilters.search.trim();
          q = q.or(`full_name.ilike.%${s}%,phone_number.ilike.%${s}%,email.ilike.%${s}%`);
        }
      }

      const { data, error } = await q;
      if (error) throw error;

      const rows = (data ?? []).map((c) => ({
        display_name:     sanitizeText(c.full_name ?? c.push_name ?? c.phone_number ?? ''),
        phone_number:     c.phone_number ? formatPhoneForDisplay(c.phone_number) : '',
        email:            sanitizeText(c.email ?? ''),
        company:          sanitizeText(c.company ?? ''),
        tags:             Array.isArray(c.tags) ? c.tags.map(sanitizeText).join(', ') : '',
        lead_status:      sanitizeText(c.lead_status ?? ''),
        lead_score:       String(c.lead_score ?? 0),
        instance_name:    sanitizeText(c.instance_name ?? ''),
        last_message_at:  c.last_message_at ? new Date(c.last_message_at).toLocaleDateString('pt-BR') : '',
        first_contact_at: c.first_contact_at ? new Date(c.first_contact_at).toLocaleDateString('pt-BR') : '',
        total_messages:   String(c.total_messages ?? 0),
        created_at:       c.created_at ? new Date(c.created_at).toLocaleDateString('pt-BR') : '',
        lgpd_consent_at:  c.lgpd_consent_at ? new Date(c.lgpd_consent_at).toLocaleDateString('pt-BR') : 'Sem consentimento',
      }));

      const activeColumns = COLUMNS.filter((c) => columns.has(c.key));
      const csv = buildCsv(rows, activeColumns as unknown as { key: string; label: string }[]);
      const date = new Date().toISOString().slice(0, 10);
      downloadCsv(csv, `contatos-${instanceName}-${date}.csv`);

      toast({
        title: '✅ Export concluído!',
        description: `${rows.length.toLocaleString('pt-BR')} contato${rows.length !== 1 ? 's' : ''} exportado${rows.length !== 1 ? 's' : ''}.`,
        duration: 4_000,
      });
      onOpenChange(false);
    } catch (err) {
      log.error('Failed to export contacts', err);
      toast({ title: 'Erro ao exportar', description: String(err), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Download className="h-5 w-5 text-primary" />Exportar Contatos
          </DialogTitle>
          <DialogDescription>
            {selectedIds && selectedIds.length > 0
              ? `${selectedIds.length} contato${selectedIds.length !== 1 ? 's' : ''} selecionado${selectedIds.length !== 1 ? 's' : ''}.`
              : 'Todos os contatos com filtro ativo.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Colunas a incluir</p>
          <div className="grid grid-cols-2 gap-2">
            {COLUMNS.map((col) => (
              <div key={col.key} className="flex items-center gap-2">
                <Checkbox id={col.key} checked={columns.has(col.key)} onCheckedChange={() => toggle(col.key)} />
                <Label htmlFor={col.key} className="text-sm cursor-pointer">{col.label}</Label>
              </div>
            ))}
          </div>
          <div className="rounded-md bg-muted/30 p-2 text-xs text-muted-foreground">
            💡 Arquivo CSV UTF-8 compatível com Excel. Máx. 100.000 contatos.
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>Cancelar</Button>
          <Button onClick={handleExport} disabled={loading || columns.size === 0} className="gap-2">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            {loading ? 'Exportando...' : 'Exportar CSV'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ContactExportDialog;
