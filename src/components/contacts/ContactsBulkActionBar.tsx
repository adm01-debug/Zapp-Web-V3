import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Tag as TagIcon, GitMerge, Download, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';

interface Props {
  selectedIds: string[];
  onBulkTag: () => void;
  onMerge: () => void;
  onExportCSV: () => void;
  onDeleteMany: (ids: string[]) => void;
  onClear: () => void;
}

/**
 * Barra flutuante de ações em lote (etiquetar, mesclar, exportar, excluir).
 * Extraída de ContactsRichView.tsx mantendo classes e animação 1:1.
 */
export function ContactsBulkActionBar({
  selectedIds,
  onBulkTag,
  onMerge,
  onExportCSV,
  onDeleteMany,
  onClear,
}: Props) {
  return (
    <AnimatePresence>
      {selectedIds.length > 0 && (
        <motion.div
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-foreground text-background px-4 py-2 sm:py-3 rounded-full sm:rounded-2xl shadow-2xl flex items-center gap-2 sm:gap-4 border border-background/10 backdrop-blur-xl w-[90%] sm:w-auto"
        >
          <div className="flex items-center gap-2 border-r border-background/20 pr-2 sm:pr-4">
            <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-primary-foreground font-bold text-sm">
              {selectedIds.length}
            </div>
            <span className="text-sm font-semibold whitespace-nowrap">Selecionados</span>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" className="text-background hover:bg-background/10 h-9 px-3 gap-2" onClick={onBulkTag}>
              <TagIcon className="w-4 h-4" />
              <span className="hidden sm:inline">Etiquetar</span>
            </Button>
            <Button variant="ghost" size="sm" className="text-background hover:bg-background/10 h-9 px-3 gap-2" onClick={onMerge}>
              <GitMerge className="w-4 h-4" />
              <span className="hidden sm:inline">Mesclar</span>
            </Button>
            <Button variant="ghost" size="sm" className="text-background hover:bg-background/10 h-9 px-3 gap-2" onClick={onExportCSV}>
              <Download className="w-4 h-4" />
              <span className="hidden sm:inline">Exportar</span>
            </Button>
            <div className="w-px h-6 bg-background/20 mx-1" />
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive-foreground hover:bg-destructive/20 h-9 px-3 gap-2"
              onClick={() => {
                const count = selectedIds.length;
                toast.error(`Excluir ${count} contatos?`, {
                  action: {
                    label: 'Confirmar',
                    onClick: () => {
                      onDeleteMany(selectedIds);
                      onClear();
                    },
                  },
                });
              }}
            >
              <Trash2 className="w-4 h-4" />
              <span className="hidden sm:inline">Excluir</span>
            </Button>
          </div>

          <Button variant="ghost" size="icon" className="h-8 w-8 text-background hover:bg-background/10 rounded-full" onClick={onClear}>
            <X className="w-4 h-4" />
          </Button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
