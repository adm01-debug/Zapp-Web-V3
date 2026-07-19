import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface KpiCardProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
  tone: 'info' | 'success' | 'destructive' | 'warning';
}

/** Kpi Card. */
export function KpiCard({ icon: Icon, label, value, tone }: KpiCardProps) {
  const toneClass = {
    info: 'text-primary',
    success: 'text-success',
    destructive: 'text-destructive',
    warning: 'text-warning',
  }[tone];
  return (
    <Card>
      <CardContent className="flex items-center justify-between p-4">
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="mt-1 text-2xl font-bold">{value}</p>
        </div>
        <Icon className={cn('h-8 w-8 opacity-70', toneClass)} />
      </CardContent>
    </Card>
  );
}
