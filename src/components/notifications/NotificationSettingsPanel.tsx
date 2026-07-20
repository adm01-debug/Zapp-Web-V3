import { useState, useRef, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Volume2, VolumeX, Play, Bell, RotateCcw } from 'lucide-react';
import { useNotificationSettings } from '@/hooks/useNotificationSettings';
import { previewSound, requestNotificationPermission, SoundType } from '@/utils/notificationSounds';
import { toast } from '@/hooks/use-toast';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { PushNotificationCard } from './PushNotificationCard';
import {
  NotificationTypeSection,
  SentimentAlertCard,
  QuietHoursCard,
} from './NotificationTypeCards';
import { ConnectionAlertPreferences } from '@/components/settings/ConnectionAlertPreferences';

const SOUND_TYPES: { value: string; label: string; description: string }[] = [
  { value: 'chime', label: 'Chime', description: 'Tom suave e harmonioso' },
  { value: 'beep', label: 'Beep', description: 'Som eletrônico clássico' },
  { value: 'bell', label: 'Sino', description: 'Som de campainha' },
  { value: 'alert', label: 'Alerta', description: 'Som mais chamativo' },
  { value: 'soft', label: 'Suave', description: 'Notificação discreta' },
];

/** Notification Settings Panel component for the notifications section. */
export function NotificationSettingsPanel() {
  const { settings, updateSettings, resetSettings, isQuietHours } = useNotificationSettings();
  const [isTestingSound, setIsTestingSound] = useState(false);
  const testingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (testingTimerRef.current !== null) clearTimeout(testingTimerRef.current);
    },
    []
  );

  const handleTestSound = async () => {
    setIsTestingSound(true);
    previewSound(settings.soundType, settings.soundVolume);
    if (testingTimerRef.current !== null) clearTimeout(testingTimerRef.current);
    testingTimerRef.current = setTimeout(() => setIsTestingSound(false), 1000);
  };

  const handleRequestPermission = async () => {
    const granted = await requestNotificationPermission();
    toast({
      title: granted ? '✅ Permissão concedida' : '⚠️ Permissão negada',
      description: granted
        ? 'Você receberá notificações do navegador.'
        : 'Ative as notificações nas configurações do navegador.',
      variant: granted ? undefined : 'destructive',
    });
  };

  const handleReset = () => {
    resetSettings();
    toast({
      title: '🔄 Configurações resetadas',
      description: 'As preferências de notificação foram restauradas ao padrão.',
    });
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      {/* Master Sound Control */}
      <Card className="border-secondary/20 bg-card">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15">
                {settings.soundEnabled ? (
                  <Volume2 className="h-5 w-5 text-primary" />
                ) : (
                  <VolumeX className="h-5 w-5 text-muted-foreground" />
                )}
              </div>
              <div>
                <CardTitle className="text-lg">Sons de Notificação</CardTitle>
                <CardDescription>Configurações globais de áudio</CardDescription>
              </div>
            </div>
            <Switch
              checked={settings.soundEnabled}
              onCheckedChange={(checked) => updateSettings({ soundEnabled: checked })}
            />
          </div>
        </CardHeader>
        {settings.soundEnabled && (
          <CardContent className="space-y-6">
            <div className="space-y-3">
              <Label className="text-sm font-medium">Tipo de Som</Label>
              <div className="flex items-center gap-3">
                <Select
                  value={settings.soundType}
                  onValueChange={(value: SoundType) => updateSettings({ soundType: value })}
                >
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="Selecione o tipo de som" />
                  </SelectTrigger>
                  <SelectContent>
                    {SOUND_TYPES.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        <div className="flex flex-col">
                          <span>{type.label}</span>
                          <span className="text-xs text-muted-foreground">{type.description}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  aria-label="Testar som de notificação"
                  variant="outline"
                  size="icon"
                  onClick={handleTestSound}
                  disabled={isTestingSound}
                  className={cn('transition-all', isTestingSound && 'bg-primary/10')}
                >
                  <Play className={cn('h-4 w-4', isTestingSound && 'animate-pulse')} />
                </Button>
              </div>
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">Volume</Label>
                <Badge variant="secondary" className="">
                  {settings.soundVolume}%
                </Badge>
              </div>
              <Slider
                value={[settings.soundVolume]}
                onValueChange={([value]) => updateSettings({ soundVolume: value })}
                min={10}
                max={100}
                step={5}
              />
            </div>
          </CardContent>
        )}
      </Card>

      <NotificationTypeSection settings={settings} updateSettings={updateSettings} />

      {/* Browser Notifications */}
      <Card className="border-secondary/20 bg-card">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-success/15">
                <Bell className="h-5 w-5 text-success" />
              </div>
              <div>
                <CardTitle className="text-lg">Notificações do Navegador</CardTitle>
                <CardDescription>Pop-ups mesmo com a aba minimizada</CardDescription>
              </div>
            </div>
            <Switch
              checked={settings.browserNotifications}
              onCheckedChange={(checked) => updateSettings({ browserNotifications: checked })}
            />
          </div>
        </CardHeader>
        {settings.browserNotifications && (
          <CardContent>
            <Button variant="outline" onClick={handleRequestPermission} className="w-full">
              <Bell className="mr-2 h-4 w-4" />
              Solicitar Permissão do Navegador
            </Button>
          </CardContent>
        )}
      </Card>

      <SentimentAlertCard settings={settings} updateSettings={updateSettings} />
      <PushNotificationCard />
      <ConnectionAlertPreferences />
      <QuietHoursCard
        settings={settings}
        updateSettings={updateSettings}
        isQuietHours={isQuietHours}
      />

      <Button variant="outline" onClick={handleReset} className="w-full">
        <RotateCcw className="mr-2 h-4 w-4" />
        Restaurar Configurações Padrão
      </Button>
    </motion.div>
  );
}
