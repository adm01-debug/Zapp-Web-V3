/**
 * ContactExportDialog — exportação CSV de contatos com seleção de campos
 * (CONTATOS-12). O export continua client-side (não há RPC/edge de export no
 * projeto — grep rpc_export/contact_export sem resultados em types.ts e
 * migrations); o log em contact_export_log é tentado pela view state.
 */
import { useState, useEffect, useCallback } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Label } from '@/components/ui/label';
import { Download, FileSpreadsheet } from 'lucide-react';
import {
  EXPORT_FIELDS, EXPORT_DEFAULT_KEYS,
} from './contactExportFields';

interface ContactExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contactCount: number;
  onExport: (fieldKeys: string[]) => void;
}

/** Contact Export Dialog component for the contacts section. */
export function ContactExportDialog({
  open,
  onOpenChange,
  contactCount,
  onExport,
}: ContactExportDialogProps) {
  const [selected, setSelected] = useState<string[]>(EXPORT_DEFAULT_KEYS);

  useEffect(() => {
    if (open) setSelected(EXPORT_DEFAULT_KEYS);
  }, [open]);

  const toggleField = useCallback((key: string) => {
    setSelected((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  }, []);

  const toggleAll = useCallback(() => {
    setSelected((prev) =>
      prev.length === EXPORT_FIELDS.length ? [] : EXPORT_FIELDS.map((f) => f.key)
    );
  }, []);

  const handleExport = useCallback(() => {
    if (selected.length === 0) return;
    onExport(selected);
    onOpenChange(false);
  }, [selected, onExport, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-primary" />
            Exportar Contatos (CSV)
          </DialogTitle>
          <DialogDescription>
            {contactCount} contato(s) serão exportados com os campos selecionados.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[50vh] pr-3">
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">Campos</Label>
              <Button variant="link" size="sm" className="h-auto p-0" onClick={toggleAll}>
                {selected.length === EXPORT_FIELDS.length ? 'Desmarcar todos' : 'Selecionar todos'}
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2">
              {EXPORT_FIELDS.map((field) => (
                <label key={field.key} className="flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={selected.includes(field.key)}
                    onChange={() => toggleField(field.key)}
                    className="h-4 w-4 accent-primary"
                  />
                  {field.label}
                </label>
              ))}
            </div>
          </div>
        </ScrollArea>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleExport} disabled={selected.length === 0 || contactCount === 0}>
            <Download className="h-4 w-4" />
            Exportar CSV
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default ContactExportDialog;
