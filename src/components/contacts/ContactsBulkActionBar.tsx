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
          className="fixed bottom-6 left-1/2 z-50 flex w-[90%] -translate-x-1/2 items-center gap-2 rounded-full border border-background/10 bg-foreground px-4 py-2 text-background shadow-2xl backdrop-blur-xl sm:w-auto sm:gap-4 sm:rounded-2xl sm:py-3"
        >
          <div className="flex items-center gap-2 border-r border-background/20 pr-2 sm:pr-4">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
              {selectedIds.length}
            </div>
            <span className="whitespace-nowrap text-sm font-semibold">Selecionados</span>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="h-9 gap-2 px-3 text-background hover:bg-background/10"
              onClick={onBulkTag}
            >
              <TagIcon className="h-4 w-4" />
              <span className="hidden sm:inline">Etiquetar</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-9 gap-2 px-3 text-background hover:bg-background/10"
              onClick={onMerge}
            >
              <GitMerge className="h-4 w-4" />
              <span className="hidden sm:inline">Mesclar</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-9 gap-2 px-3 text-background hover:bg-background/10"
              onClick={onExportCSV}
            >
              <Download className="h-4 w-4" />
              <span className="hidden sm:inline">Exportar</span>
            </Button>
            <div className="mx-1 h-6 w-px bg-background/20" />
            <Button
              variant="ghost"
              size="sm"
              className="h-9 gap-2 px-3 text-destructive-foreground hover:bg-destructive/20"
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
              <Trash2 className="h-4 w-4" />
              <span className="hidden sm:inline">Excluir</span>
            </Button>
          </div>

          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-full text-background hover:bg-background/10"
            onClick={onClear}
          >
            <X className="h-4 w-4" />
          </Button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
