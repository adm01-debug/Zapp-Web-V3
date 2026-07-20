import { Card, CardContent } from '@/components/ui/card';
import { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  icon: LucideIcon;
  label: string;
  value: string | number;
  tone: 'warning' | 'info' | 'destructive' | 'success';
}

const TONE_CLASSES = {
  warning: 'text-warning bg-warning/10',
  info: 'text-primary bg-primary/10',
  destructive: 'text-destructive bg-destructive/10',
  success: 'text-success bg-success/10',
};

/** Failed Message Kpi Card component. */
export function FailedMessageKpiCard({ icon: Icon, label, value, tone }: Props) {
  return (
    <Card>
      <CardContent className="p-3 flex items-center gap-3">
        <div className={cn('p-2 rounded-md', TONE_CLASSES[tone])}>
          <Icon className="h-4 w-4" />
        </div>
        <div>
          <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">{label}</p>
          <p className="text-lg font-bold tabular-nums leading-tight">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}
