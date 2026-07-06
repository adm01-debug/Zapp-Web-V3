import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { QueueMetricsDashboard } from '../monitoring/QueueMetricsDashboard';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  metrics: Parameters<typeof QueueMetricsDashboard>[0]['metrics'];
}

const EMPTY_METRICS = {
  totalSent: 0,
  totalFailed: 0,
  totalRetries: 0,
  averageLatency: 0,
  byType: {},
  byConversation: {},
} as const;

export function ChatMonitoringDialog({ open, onOpenChange, metrics }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-4xl">
        <DialogHeader>
          <DialogTitle>Métricas de Envio e Performance</DialogTitle>
        </DialogHeader>
        <QueueMetricsDashboard metrics={metrics ?? (EMPTY_METRICS as never)} />
      </DialogContent>
    </Dialog>
  );
}
