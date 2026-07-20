import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { QueueMetricsDashboard } from '../monitoring/QueueMetricsDashboard';
import type { QueueMetrics } from '../../hooks/useMessageQueue';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  metrics: QueueMetrics | null | undefined;
}

const EMPTY_METRICS: QueueMetrics = {
  totalSent: 0,
  totalFailed: 0,
  totalRetries: 0,
  averageLatency: 0,
  byType: {},
  byConversation: {},
};

/** Chat Monitoring Dialog component for the chat section. */
export function ChatMonitoringDialog({ open, onOpenChange, metrics }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-4xl">
        <DialogHeader>
          <DialogTitle>Métricas de Envio e Performance</DialogTitle>
        </DialogHeader>
        <QueueMetricsDashboard metrics={metrics ?? EMPTY_METRICS} />
      </DialogContent>
    </Dialog>
  );
}
