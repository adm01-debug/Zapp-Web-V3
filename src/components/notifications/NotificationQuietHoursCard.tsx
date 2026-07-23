import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Moon } from 'lucide-react';
import { NotificationSettings } from '@/hooks/useNotificationSettings';

interface QuietHoursCardProps {
  settings: NotificationSettings;
  updateSettings: (partial: Partial<NotificationSettings>) => void;
  isQuietHours: () => boolean;
}

/** Quiet Hours Card component for the notifications section. */
export function QuietHoursCard({ settings, updateSettings, isQuietHours }: QuietHoursCardProps) {
  return (
    <Card className="border-secondary/20 bg-card">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted">
              <Moon className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <CardTitle className="text-lg">Horário Silencioso</CardTitle>
              <CardDescription>Desativar sons em horários específicos</CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isQuietHours() && (
              <Badge variant="secondary" className="bg-muted">
                Ativo agora
              </Badge>
            )}
            <Switch
              checked={settings.quietHoursEnabled}
              onCheckedChange={(checked) => updateSettings({ quietHoursEnabled: checked })}
            />
          </div>
        </div>
      </CardHeader>
      {settings.quietHoursEnabled && (
        <CardContent>
          <div className="flex items-center gap-4">
            <div className="flex-1 space-y-2">
              <Label className="text-sm">Início</Label>
              <Input
                type="time"
                value={settings.quietHoursStart}
                onChange={(e) => updateSettings({ quietHoursStart: e.target.value })}
              />
            </div>
            <div className="flex-1 space-y-2">
              <Label className="text-sm">Fim</Label>
              <Input
                type="time"
                value={settings.quietHoursEnd}
                onChange={(e) => updateSettings({ quietHoursEnd: e.target.value })}
              />
            </div>
          </div>
        </CardContent>
      )}
    </Card>
  );
}
