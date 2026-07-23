import { motion } from 'framer-motion';
import { MessageSquare, MessageSquarePlus, Search as SearchIcon } from 'lucide-react';

/** Inbox Empty Chat component. */
export function InboxEmptyChat() {
  return (
    <div className="flex-1 flex items-center justify-center bg-background min-h-0 overflow-hidden">
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.5, ease: 'easeOut' }} className="text-center p-8 max-w-lg">
        <div className="relative w-20 h-20 mx-auto mb-6">
          <motion.div
            animate={{ rotate: [0, 3, -3, 0] }}
            transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
            className="w-20 h-20 rounded-3xl bg-gradient-to-br from-primary/15 via-primary/5 to-transparent flex items-center justify-center ring-1 ring-primary/10 shadow-2xl shadow-primary/10"
          >
            <MessageSquare className="w-8 h-8 text-primary/50" />
          </motion.div>
          <motion.div
            animate={{ y: [0, -8, 0], opacity: [0.6, 1, 0.6] }}
            transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
            className="absolute -top-2 -right-2 w-8 h-8 rounded-xl bg-primary/15 flex items-center justify-center shadow-sm ring-1 ring-primary/10"
          >
            <MessageSquarePlus className="w-4 h-4 text-primary/60" />
          </motion.div>
          <motion.div
            animate={{ scale: [1, 1.15, 1], opacity: [0.4, 0.7, 0.4] }}
            transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut', delay: 1 }}
            className="absolute -bottom-2 -left-2 w-7 h-7 rounded-xl bg-accent/15 flex items-center justify-center ring-1 ring-accent/10"
          >
            <SearchIcon className="w-3.5 h-3.5 text-accent-foreground/50" />
          </motion.div>
        </div>

        <h3 className="text-[18px] font-bold text-foreground mb-2 tracking-tight">Sua central de atendimento</h3>
        <p className="text-muted-foreground text-[14px] leading-relaxed mb-8">Selecione uma conversa na lista para começar. Utilize os atalhos de teclado para uma navegação ultra-rápida.</p>
        
        <div className="inline-flex flex-wrap items-center justify-center gap-4 px-6 py-4 rounded-2xl bg-card border border-border/10 shadow-xl shadow-primary/5">
          <div className="flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 rounded-md bg-muted text-[10px]  text-muted-foreground border border-border/40 shadow-sm">↑</kbd>
            <kbd className="px-1.5 py-0.5 rounded-md bg-muted text-[10px]  text-muted-foreground border border-border/40 shadow-sm">↓</kbd>
            <span className="text-[10px] text-muted-foreground/60 ml-1">navegar</span>
          </div>
          <div className="w-px h-3 bg-border/40" />
          <div className="flex items-center gap-1">
            <kbd className="px-2 py-0.5 rounded-md bg-muted text-[10px]  text-muted-foreground border border-border/40 shadow-sm">Enter</kbd>
            <span className="text-[10px] text-muted-foreground/60 ml-1">abrir</span>
          </div>
          <div className="w-px h-3 bg-border/40" />
          <div className="flex items-center gap-1">
            <kbd className="px-2 py-0.5 rounded-md bg-muted text-[10px]  text-muted-foreground border border-border/40 shadow-sm">⌘K</kbd>
            <span className="text-[10px] text-muted-foreground/60 ml-1">buscar</span>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
