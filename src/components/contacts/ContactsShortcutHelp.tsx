import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Keyboard, UserPlus, Search, Info, Grid, List, Table, Map, BarChart3, X } from 'lucide-react';

interface Props {
  open: boolean;
  onClose: () => void;
}

const ACTIONS = [
  { icon: UserPlus, label: 'Novo Registro', kbd: 'N' },
  { icon: Search, label: 'Buscar', kbd: 'F' },
  { icon: Info, label: 'Ajuda', kbd: '?' },
];

const VIEWS = [
  { icon: Grid, label: 'Grid', kbd: 'G' },
  { icon: List, label: 'Lista', kbd: 'L' },
  { icon: Table, label: 'Tabela', kbd: 'T' },
  { icon: Map, label: 'Mapa', kbd: 'M' },
  { icon: BarChart3, label: 'Analytics', kbd: 'A' },
];

/**
 * Overlay de ajuda dos atalhos de teclado do Hub de Contatos.
 * Rendered controlado por `open`; fecha via prop, click no backdrop ou Esc externo.
 */
export function ContactsShortcutHelp({ open, onClose }: Props) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-background/80 backdrop-blur-md"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.95, y: 10 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.95, y: 10 }}
            className="bg-card border border-border shadow-2xl rounded-2xl p-6 max-w-md w-full relative"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                <Keyboard className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h2 className="text-xl font-bold">Atalhos de Teclado</h2>
                <p className="text-sm text-muted-foreground">Aumente sua produtividade</p>
              </div>
              <Button variant="ghost" size="icon" className="ml-auto" onClick={onClose}>
                <X className="w-4 h-4" />
              </Button>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <ShortcutColumn title="Ações" items={ACTIONS} />
                <ShortcutColumn title="Visualizações" items={VIEWS} />
              </div>
              <div className="pt-4 border-t border-border/50 text-center">
                <p className="text-xs text-muted-foreground italic">
                  Pressione <kbd className="px-1 py-0.5 rounded bg-muted text-[9px]">Esc</kbd> para fechar
                </p>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

interface Item {
  icon: typeof UserPlus;
  label: string;
  kbd: string;
}

function ShortcutColumn({ title, items }: { title: string; items: Item[] }) {
  return (
    <div className="space-y-3">
      <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">{title}</p>
      {items.map(({ icon: Icon, label, kbd }) => (
        <div key={label} className="flex items-center justify-between text-sm">
          <span className="flex items-center gap-2">
            <Icon className="w-3.5 h-3.5" /> {label}
          </span>
          <kbd className="px-1.5 py-0.5 rounded bg-muted border border-border text-[10px]">{kbd}</kbd>
        </div>
      ))}
    </div>
  );
}
