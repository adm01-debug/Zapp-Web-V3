import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LucideIcon } from 'lucide-react';

interface KpiCardProps {
  title: string;
  value: number | string;
  total?: number;
  icon: LucideIcon;
  warning?: boolean;
}

/** Kpi Card component for the evoApiHealth section. */
export function KpiCard({ title, value, total, icon: Icon, warning }: KpiCardProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
        <CardTitle className="text-sm text-muted-foreground font-medium">{title}</CardTitle>
        <Icon className={`h-4 w-4 ${warning ? 'text-warning' : 'text-muted-foreground'}`} />
      </CardHeader>
      <CardContent>
        <div className={`text-2xl font-bold ${warning ? 'text-warning' : 'text-foreground'}`}>
          {value}
          {total !== undefined && (
            <span className="text-muted-foreground text-base font-normal"> / {total}</span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
