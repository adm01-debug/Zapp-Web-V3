import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { TrendingDown, Activity } from 'lucide-react';
import { NotificationSettings } from '@/hooks/useNotificationSettings';

interface SentimentAlertCardProps {
  settings: NotificationSettings;
  updateSettings: (partial: Partial<NotificationSettings>) => void;
}

export function SentimentAlertCard({ settings, updateSettings }: SentimentAlertCardProps) {
  return (
    <Card className="border-secondary/20 bg-card">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-warning/15">
              <TrendingDown className="h-5 w-5 text-warning" />
            </div>
            <div>
              <CardTitle className="text-lg">Alertas de Sentimento</CardTitle>
              <CardDescription>Notificações quando clientes ficam insatisfeitos</CardDescription>
            </div>
          </div>
          <Switch
            checked={settings.sentimentAlertEnabled}
            onCheckedChange={(checked) => updateSettings({ sentimentAlertEnabled: checked })}
          />
        </div>
      </CardHeader>
      {settings.sentimentAlertEnabled && (
        <CardContent className="space-y-6">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm">Limite de Alerta</Label>
              <Badge
                variant="outline"
                className={
                  settings.sentimentAlertThreshold < 30
                    ? 'border-destructive/50 text-destructive'
                    : 'border-warning/50 text-warning'
                }
              >
                {settings.sentimentAlertThreshold}%
              </Badge>
            </div>
            <Slider
              value={[settings.sentimentAlertThreshold]}
              onValueChange={([value]) => updateSettings({ sentimentAlertThreshold: value })}
              min={10}
              max={60}
              step={5}
            />
            <p className="text-xs text-muted-foreground">
              Alerta quando o sentimento cair abaixo de {settings.sentimentAlertThreshold}%
            </p>
          </div>
          <Separator />
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm">Análises Consecutivas</Label>
              <Badge variant="secondary">{settings.sentimentConsecutiveCount}x</Badge>
            </div>
            <div className="flex items-center gap-2">
              {[2, 3, 4, 5].map((count) => (
                <Button
                  key={count}
                  variant={settings.sentimentConsecutiveCount === count ? 'default' : 'outline'}
                  size="sm"
                  className="flex-1"
                  onClick={() => updateSettings({ sentimentConsecutiveCount: count })}
                >
                  {count}x
                </Button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Alerta apenas após {settings.sentimentConsecutiveCount} análises negativas
              consecutivas
            </p>
          </div>
          <Separator />
          <div className="flex items-start gap-3 rounded-lg bg-muted/30 p-3">
            <Activity className="mt-0.5 h-5 w-5 flex-shrink-0 text-primary" />
            <div className="text-sm">
              <p className="font-medium">Como funciona?</p>
              <p className="mt-1 text-xs text-muted-foreground">
                O sistema analisa conversas automaticamente. Quando o sentimento do cliente fica
                abaixo de {settings.sentimentAlertThreshold}% por{' '}
                {settings.sentimentConsecutiveCount} análises consecutivas, você recebe um alerta
                por notificação e email (se configurado).
              </p>
            </div>
          </div>
        </CardContent>
      )}
    </Card>
  );
}
