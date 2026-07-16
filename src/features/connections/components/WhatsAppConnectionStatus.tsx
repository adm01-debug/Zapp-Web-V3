import { useMemo } from 'react';
import { useConnectionsManager } from '@/features/connections';
import { Badge } from '@/components/ui/badge';
import { Wifi, AlertCircle, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export function WhatsAppConnectionStatus() {
  const { connections, loading } = useConnectionsManager();

  if (loading) {
    return (
      <div className="flex items-center gap-1.5 px-1 py-0.5">
        <Loader2 className="w-3 h-3 animate-spin text-muted-foreground/40" />
        <span className="text-[10px] text-muted-foreground/40 font-medium">WhatsApp...</span>
      </div>
    );
  }

  const { total, connected, issues } = useMemo(() => {
    const tot = connections.length;
    const conn = connections.filter((c) => c.status === 'connected').length;
    return { total: tot, connected: conn, issues: tot - conn };
  }, [connections]);

  if (total === 0) return null;

  return (
    <AnimatePresence mode="wait">
      <motion.div
        initial={{ opacity: 0, x: -4 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: 4 }}
        className="flex items-center gap-1.5"
      >
        {issues > 0 ? (
          <Badge 
            variant="outline" 
            className="h-5 px-1.5 border-destructive/20 bg-destructive/5 text-destructive-foreground gap-1 hover:bg-destructive/10 transition-colors"
            title={`${issues} conexão(ões) com problema`}
          >
            <AlertCircle className="w-3 h-3" />
            <span className="text-[10px] font-bold tabular-nums">{connected}/{total}</span>
          </Badge>
        ) : (
          <Badge 
            variant="outline" 
            className="h-5 px-1.5 border-primary/20 bg-primary/5 text-primary gap-1 hover:bg-primary/10 transition-colors"
            title="Todas as conexões WhatsApp online"
          >
            <Wifi className="w-3 h-3" />
            <span className="text-[10px] font-bold tabular-nums">{connected}/{total}</span>
          </Badge>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
