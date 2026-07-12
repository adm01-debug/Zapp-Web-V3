import { motion } from 'framer-motion';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import type { WarRoomQueue } from '@/hooks/useWarRoomData';

interface QueueRowProps {
  queue: WarRoomQueue;
  onClick: () => void;
}

export function WarRoomQueueRow({ queue, onClick }: QueueRowProps) {
  const utilizationPercent = (queue.inProgress / (queue.waiting + queue.inProgress)) * 100 || 0;
  const hasCritical = queue.slaBreaches > 0;

  return (
    <motion.div
      whileHover={{ x: 4 }}
      onClick={onClick}
      className={cn(
        'cursor-pointer rounded-lg border p-3 transition-all hover:shadow-md',
        hasCritical && 'border-destructive/50 bg-destructive/5'
      )}
    >
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="h-3 w-3 rounded-full" style={{ backgroundColor: queue.color }} />
          <span className="font-medium">{queue.name}</span>
        </div>
        <div className="flex items-center gap-2">
          {queue.slaBreaches > 0 && (
            <Badge variant="destructive" className="animate-pulse">
              {queue.slaBreaches} violações
            </Badge>
          )}
          {queue.slaWarnings > 0 && (
            <Badge variant="secondary" className="bg-warning/20 text-warning">
              {queue.slaWarnings} em risco
            </Badge>
          )}
        </div>
      </div>
      <div className="grid grid-cols-4 gap-4 text-sm">
        <div>
          <div className="text-xs text-muted-foreground">Aguardando</div>
          <div className="font-semibold">{queue.waiting}</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Em Atendimento</div>
          <div className="font-semibold">{queue.inProgress}</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Tempo Médio</div>
          <div className="font-semibold">{queue.avgWaitTime.toFixed(1)}min</div>
        </div>
        <div>
          <div className="mb-1 text-xs text-muted-foreground">Utilização</div>
          <Progress value={utilizationPercent} className="h-2" />
        </div>
      </div>
    </motion.div>
  );
}
