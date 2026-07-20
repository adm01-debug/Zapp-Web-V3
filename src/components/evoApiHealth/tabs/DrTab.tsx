import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Shield } from 'lucide-react';
import { DrRunbookStep } from '@/lib/evoApiHealth/types';

interface DrTabProps {
  drHealth?: Record<string, unknown> | null;
  runbook?: DrRunbookStep[];
}

/** Dr Tab component for the evoApiHealth section. */
export const DrTab = React.memo(({ drHealth, runbook }: DrTabProps) => {
  return (
    <div className="space-y-4">
      {drHealth && (
        <Alert>
          <Shield className="h-4 w-4" />
          <AlertTitle>{String(drHealth?.['overall'] ?? 'DR Health')}</AlertTitle>
          <AlertDescription>
            <pre className="mt-2 overflow-x-auto rounded bg-muted p-2 text-xs">
              {JSON.stringify(drHealth, null, 2)}
            </pre>
          </AlertDescription>
        </Alert>
      )}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Runbook (11 passos)</CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[500px]">
            <ol className="space-y-3">
              {runbook?.map((s) => (
                <li key={s.step_number} className="border-l-2 border-primary/40 pl-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">
                      {s.icon} {s.category}
                    </Badge>
                    <span className="font-medium">
                      Passo {s.step_number}: {s.title}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{s.description}</p>
                  {s.command && (
                    <pre className="mt-2 overflow-x-auto rounded bg-muted p-2 text-xs">
                      {s.command}
                    </pre>
                  )}
                  {(s.rto_minutes != null || s.rpo_minutes != null) && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {s.rto_minutes != null && <>RTO: {s.rto_minutes}min · </>}
                      {s.rpo_minutes != null && <>RPO: {s.rpo_minutes}min</>}
                    </p>
                  )}
                </li>
              ))}
            </ol>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
});
