import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Bell, CheckCircle2 } from 'lucide-react';
import { AlertChannel } from '@/lib/evoApiHealth/types';

interface ChannelsTabProps {
  channels?: AlertChannel[];
  onTest: (id: number) => void;
  isTesting: boolean;
  testResult?: unknown;
}

/** Channels Tab component for the evoApiHealth section. */
export const ChannelsTab = React.memo(
  ({ channels, onTest, isTesting, testResult }: ChannelsTabProps) => {
    return (
      <div className="space-y-4">
        {!channels?.length && (
          <Alert>
            <Bell className="h-4 w-4" />
            <AlertTitle>Nenhum canal configurado</AlertTitle>
            <AlertDescription>
              Adicione Slack/Discord/Webhook em <code>evo_api.alert_channels</code> para receber
              notificações externas dos alertas warning/critical.
            </AlertDescription>
          </Alert>
        )}
        <div className="grid gap-3">
          {channels?.map((c) => (
            <Card key={c.id}>
              <CardContent className="flex items-center justify-between gap-4 p-4">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{c.name}</span>
                    <Badge variant="outline">{c.channel_type}</Badge>
                    <Badge variant={c.active ? 'default' : 'secondary'}>
                      {c.active ? 'ativo' : 'desativado'}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Severity mín.: {c.min_severity} · Rate-limit: {c.rate_limit_min}min · Sucesso:{' '}
                    {c.success_rate_pct ?? '—'}%
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onTest(c.id)}
                  disabled={isTesting}
                >
                  Testar canal
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
        {testResult !== undefined && (
          <Alert className="mt-4">
            <CheckCircle2 className="h-4 w-4" />
            <AlertTitle>Resultado do teste</AlertTitle>
            <AlertDescription>
              <pre className="mt-2 overflow-x-auto rounded bg-muted p-2 text-xs">
                {JSON.stringify(testResult, null, 2)}
              </pre>
            </AlertDescription>
          </Alert>
        )}
      </div>
    );
  }
);
