// @ts-nocheck
import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Bell, Play, MessageSquare, AtSign, CheckCircle2, AlertTriangle, Mic } from 'lucide-react';
import { NotificationSettings, SoundTypeOption } from '@/hooks/useNotificationSettings';
import { playNotificationSound, SoundType, NotificationType } from '@/utils/notificationSounds';
import { cn } from '@/lib/utils';

export { SentimentAlertCard } from './NotificationSentimentCard';
export { QuietHoursCard } from './NotificationQuietHoursCard';

const SOUND_TYPES: { value: SoundTypeOption; label: string; description: string }[] = [
  { value: 'chime', label: 'Chime', description: 'Tom suave e harmonioso' },
  { value: 'beep', label: 'Beep', description: 'Som eletrônico clássico' },
  { value: 'bell', label: 'Sino', description: 'Som de campainha' },
  { value: 'alert', label: 'Alerta', description: 'Som mais chamativo' },
  { value: 'soft', label: 'Suave', description: 'Notificação discreta' },
];

interface SoundSelectorProps {
  value: SoundTypeOption;
  onChange: (value: SoundTypeOption) => void;
  notificationType: NotificationType;
  label: string;
  soundVolume: number;
}

export function SoundSelector({
  value,
  onChange,
  notificationType,
  label: _label,
  soundVolume,
}: SoundSelectorProps) {
  const [isTesting, setIsTesting] = useState(false);

  const handleTest = () => {
    setIsTesting(true);
    playNotificationSound(notificationType, value as SoundType, soundVolume);
    setTimeout(() => setIsTesting(false), 1000);
  };

  return (
    <div className="flex items-center gap-2">
      <Select value={value} onValueChange={(v: SoundTypeOption) => onChange(v)}>
        <SelectTrigger className="w-[130px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {SOUND_TYPES.map((type) => (
            <SelectItem key={type.value} value={type.value}>
              {type.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        variant="ghost"
        size="icon"
        onClick={handleTest}
        disabled={isTesting}
        className="h-8 w-8"
        aria-label="Testar notificação"
      >
        <Play className={cn('h-3 w-3', isTesting && 'animate-pulse text-primary')} />
      </Button>
    </div>
  );
}

interface NotificationTypeSectionProps {
  settings: NotificationSettings;
  updateSettings: (partial: Partial<NotificationSettings>) => void;
}

export function NotificationTypeSection({
  settings,
  updateSettings,
}: NotificationTypeSectionProps) {
  return (
    <Card className="border-secondary/20 bg-card">
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-info/15">
            <Bell className="h-5 w-5 text-info" />
          </div>
          <div>
            <CardTitle className="text-lg">Tipos de Notificação</CardTitle>
            <CardDescription>Escolha quais eventos devem notificar</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <NotifRow
          icon={MessageSquare}
          iconColor="text-success"
          title="Novas Mensagens"
          desc="Receber quando chegar nova mensagem"
          enabled={settings.newMessageSound}
          onToggle={(c) => updateSettings({ newMessageSound: c })}
          soundSelector={
            settings.newMessageSound && settings.soundEnabled ? (
              <SoundSelector
                value={settings.messageSoundType}
                onChange={(v) => updateSettings({ messageSoundType: v })}
                notificationType="message"
                label="Som"
                soundVolume={settings.soundVolume}
              />
            ) : undefined
          }
        />
        <Separator />
        <NotifRow
          icon={AtSign}
          iconColor="text-secondary"
          title="Menções"
          desc="Quando alguém mencionar você"
          enabled={settings.mentionSound}
          onToggle={(c) => updateSettings({ mentionSound: c })}
          soundSelector={
            settings.mentionSound && settings.soundEnabled ? (
              <SoundSelector
                value={settings.mentionSoundType}
                onChange={(v) => updateSettings({ mentionSoundType: v })}
                notificationType="mention"
                label="Som"
                soundVolume={settings.soundVolume}
              />
            ) : undefined
          }
        />
        <Separator />
        <NotifRow
          icon={AlertTriangle}
          iconColor="text-destructive"
          title="Violação de SLA"
          desc="Alerta quando SLA for violado"
          enabled={settings.slaBreachSound}
          onToggle={(c) => updateSettings({ slaBreachSound: c })}
          soundSelector={
            settings.slaBreachSound && settings.soundEnabled ? (
              <SoundSelector
                value={settings.slaSoundType}
                onChange={(v) => updateSettings({ slaSoundType: v })}
                notificationType="sla_breach"
                label="Som"
                soundVolume={settings.soundVolume}
              />
            ) : undefined
          }
        />
        <Separator />
        <NotifRow
          icon={CheckCircle2}
          iconColor="text-success"
          title="Metas Alcançadas"
          desc="Quando uma meta for atingida"
          soundSelector={
            settings.soundEnabled ? (
              <SoundSelector
                value={settings.goalSoundType}
                onChange={(v) => updateSettings({ goalSoundType: v })}
                notificationType="goal_achieved"
                label="Som"
                soundVolume={settings.soundVolume}
              />
            ) : undefined
          }
        />
        <Separator />
        <NotifRow
          icon={Mic}
          iconColor="text-primary"
          title="Transcrição de Áudio"
          desc="Quando áudio for transcrito automaticamente"
          enabled={settings.transcriptionNotificationEnabled}
          onToggle={(c) => updateSettings({ transcriptionNotificationEnabled: c })}
          soundSelector={
            settings.transcriptionNotificationEnabled && settings.soundEnabled ? (
              <SoundSelector
                value={settings.transcriptionSoundType}
                onChange={(v) => updateSettings({ transcriptionSoundType: v })}
                notificationType="achievement"
                label="Som"
                soundVolume={settings.soundVolume}
              />
            ) : undefined
          }
        />
      </CardContent>
    </Card>
  );
}

function NotifRow({
  icon: Icon,
  iconColor,
  title,
  desc,
  enabled,
  onToggle,
  soundSelector,
}: {
  icon: React.ElementType;
  iconColor: string;
  title: string;
  desc: string;
  enabled?: boolean;
  onToggle?: (checked: boolean) => void;
  soundSelector?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between py-2">
      <div className="flex items-center gap-3">
        <Icon className={cn('h-5 w-5', iconColor)} />
        <div>
          <p className="font-medium">{title}</p>
          <p className="text-sm text-muted-foreground">{desc}</p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        {soundSelector}
        {onToggle && <Switch checked={enabled} onCheckedChange={onToggle} />}
      </div>
    </div>
  );
}
