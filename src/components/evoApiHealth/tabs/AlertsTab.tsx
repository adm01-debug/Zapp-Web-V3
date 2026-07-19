import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { CheckCircle2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ActiveAlert } from '@/lib/evoApiHealth/types';

interface AlertsTabProps {
  alerts?: ActiveAlert[];
  onAcknowledge: (id: number) => void;
  isAcknowledging: boolean;
}

const SEVERITY_VARIANT: Record<string, 'destructive' | 'warning' | 'info' | 'secondary'> = {
  critical: 'destructive',
  warning: 'warning',
  info: 'info',
};

/** Alerts Tab component for the evoApiHealth section. */
export const AlertsTab = React.memo(({ alerts, onAcknowledge, isAcknowledging }: AlertsTabProps) => {
  if (alerts?.length === 0) {
    return (
      <Alert>
        <CheckCircle2 className="h-4 w-4" />
        <AlertTitle>Nenhum alerta ativo</AlertTitle>
        <AlertDescription>
          Os detectores rodam a cada 5 min e nada está fora do esperado.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <ScrollArea className="max-h-[600px]">
      <div className="space-y-3">
        {alerts?.map((a) => (
          <Card key={a.id}>
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-2">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant={SEVERITY_VARIANT[a.severity] ?? 'secondary'}>
                      {a.severity}
                    </Badge>
                    <CardTitle className="text-base">{a.title}</CardTitle>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {a.alert_type} · há{' '}
                    {formatDistanceToNow(new Date(a.created_at), { locale: ptBR })}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onAcknowledge(a.id)}
                  disabled={isAcknowledging}
                >
                  Ack
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <pre className="text-xs bg-muted p-2 rounded overflow-x-auto">
                {JSON.stringify(a.details, null, 2)}
              </pre>
            </CardContent>
          </Card>
        ))}
      </div>
    </ScrollArea>
  );
});
