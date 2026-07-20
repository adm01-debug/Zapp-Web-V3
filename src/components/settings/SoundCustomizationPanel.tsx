import { useState, useRef, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  Volume2,
  VolumeX,
  Bell,
  MessageSquare,
  AlertTriangle,
  Trophy,
  Clock,
  Moon,
  Upload,
} from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { useUserSettings } from '@/hooks/useUserSettings';
import { toast } from 'sonner';
import { SoundCategoryCard } from './SoundCategoryCard';

const SOUND_CATEGORIES = {
  message: {
    label: 'Mensagens',
    icon: MessageSquare,
    description: 'Som para novas mensagens recebidas',
    sounds: [
      { id: 'default', name: 'Padrão', description: 'Som clássico' },
      { id: 'pop', name: 'Pop', description: 'Som leve' },
      { id: 'chime', name: 'Chime', description: 'Melodioso' },
      { id: 'ding', name: 'Ding', description: 'Curto' },
      { id: 'bubble', name: 'Bubble', description: 'Bolha' },
      { id: 'none', name: 'Silencioso', description: 'Sem som' },
    ],
  },
  mention: {
    label: 'Menções',
    icon: Bell,
    description: 'Som quando você é mencionado',
    sounds: [
      { id: 'default', name: 'Padrão', description: 'Menção' },
      { id: 'alert', name: 'Alerta', description: 'Atenção' },
      { id: 'bell', name: 'Sino', description: 'Sino' },
      { id: 'ping', name: 'Ping', description: 'Agudo' },
      { id: 'none', name: 'Silencioso', description: 'Sem som' },
    ],
  },
  sla: {
    label: 'SLA',
    icon: AlertTriangle,
    description: 'Alertas de SLA próximo de vencer',
    sounds: [
      { id: 'default', name: 'Padrão', description: 'Urgente' },
      { id: 'urgent', name: 'Urgente', description: 'Alta prioridade' },
      { id: 'warning', name: 'Aviso', description: 'Aviso' },
      { id: 'alarm', name: 'Alarme', description: 'Intenso' },
      { id: 'none', name: 'Silencioso', description: 'Sem som' },
    ],
  },
  goal: {
    label: 'Metas',
    icon: Trophy,
    description: 'Celebração ao atingir metas',
    sounds: [
      { id: 'default', name: 'Padrão', description: 'Conquista' },
      { id: 'fanfare', name: 'Fanfarra', description: 'Festivo' },
      { id: 'achievement', name: 'Achievement', description: 'Épica' },
      { id: 'levelup', name: 'Level Up', description: 'Evolução' },
      { id: 'none', name: 'Silencioso', description: 'Sem som' },
    ],
  },
  transcription: {
    label: 'Transcrição',
    icon: Clock,
    description: 'Quando uma transcrição é concluída',
    sounds: [
      { id: 'default', name: 'Padrão', description: 'Conclusão' },
      { id: 'complete', name: 'Completo', description: 'Tarefa' },
      { id: 'success', name: 'Sucesso', description: 'Positivo' },
      { id: 'none', name: 'Silencioso', description: 'Sem som' },
    ],
  },
};

type SoundCategoryId = keyof typeof SOUND_CATEGORIES;

const playSoundPreview = (soundId: string) => {
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new (AudioCtx as typeof AudioContext)();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);
  const freqs: Record<string, number> = {
    default: 440,
    pop: 880,
    chime: 660,
    ding: 1000,
    bubble: 300,
    alert: 520,
    bell: 700,
    ping: 1200,
    urgent: 600,
    warning: 500,
    alarm: 800,
    fanfare: 550,
    achievement: 750,
    levelup: 900,
    complete: 480,
    success: 640,
  };
  osc.frequency.setValueAtTime(freqs[soundId] || 440, ctx.currentTime);
  osc.type = 'sine';
  gain.gain.setValueAtTime(0.3, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + 0.5);
};

export function SoundCustomizationPanel() {
  const { settings, updateSettings } = useUserSettings();
  const [playingSound, setPlayingSound] = useState<string | null>(null);
  const [masterVolume, setMasterVolume] = useState(80);
  const playingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (playingTimerRef.current !== null) clearTimeout(playingTimerRef.current);
    };
  }, []);

  const schedulePlayingReset = () => {
    if (playingTimerRef.current !== null) clearTimeout(playingTimerRef.current);
    playingTimerRef.current = setTimeout(() => {
      playingTimerRef.current = null;
      setPlayingSound(null);
    }, 500);
  };

  const handleSoundChange = (category: string, soundId: string) => {
    updateSettings({ [`${category}_sound_type` as `${SoundCategoryId}_sound_type`]: soundId });
    if (soundId !== 'none') {
      playSoundPreview(soundId);
      setPlayingSound(`${category}-${soundId}`);
      schedulePlayingReset();
    }
  };

  const handlePlayPreview = (category: string, soundId: string) => {
    if (soundId === 'none') return;
    playSoundPreview(soundId);
    setPlayingSound(`${category}-${soundId}`);
    schedulePlayingReset();
  };

  const getSoundValue = (category: string): string =>
    settings[`${category}_sound_type` as `${SoundCategoryId}_sound_type`] || 'default';

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast.error('Arquivo muito grande. Máximo: 2MB');
      return;
    }
    try {
      const { supabase } = await import('@/integrations/supabase/client');
      const { error } = await supabase.storage
        .from('audio-messages')
        .upload(`custom-sounds/${Date.now()}-${file.name}`, file);
      if (error) throw error;
      toast.success('Som personalizado carregado!');
    } catch {
      toast.error('Erro ao fazer upload do som');
    }
    e.target.value = '';
  };

  return (
    <div className="space-y-6">
      <Card className="border-primary/20">
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Volume2 className="h-5 w-5 text-primary" />
            Controles Gerais
          </CardTitle>
          <CardDescription>Configure o som geral da plataforma</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {settings.sound_enabled ? (
                <Volume2 className="h-5 w-5 text-primary" />
              ) : (
                <VolumeX className="h-5 w-5 text-muted-foreground" />
              )}
              <div>
                <Label className="text-base">Sons habilitados</Label>
                <p className="text-sm text-muted-foreground">Ativa ou desativa todos os sons</p>
              </div>
            </div>
            <Switch
              checked={settings.sound_enabled}
              onCheckedChange={(checked) => updateSettings({ sound_enabled: checked })}
            />
          </div>
          <AnimatePresence>
            {settings.sound_enabled && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="space-y-3"
              >
                <div className="flex items-center justify-between">
                  <Label>Volume geral</Label>
                  <Badge variant="secondary">{masterVolume}%</Badge>
                </div>
                <Slider
                  value={[masterVolume]}
                  onValueChange={([v]) => setMasterVolume(v)}
                  max={100}
                  step={5}
                  className="w-full"
                />
              </motion.div>
            )}
          </AnimatePresence>
          <div className="border-t border-border pt-4">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Moon className="h-5 w-5 text-primary" />
                <div>
                  <Label className="text-base">Horário silencioso</Label>
                  <p className="text-sm text-muted-foreground">
                    Silenciar sons em determinados horários
                  </p>
                </div>
              </div>
              <Switch
                checked={settings.quiet_hours_enabled}
                onCheckedChange={(checked) => updateSettings({ quiet_hours_enabled: checked })}
              />
            </div>
            <AnimatePresence>
              {settings.quiet_hours_enabled && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="grid grid-cols-2 gap-4"
                >
                  <div className="space-y-2">
                    <Label>Início</Label>
                    <input
                      type="time"
                      value={settings.quiet_hours_start || '22:00'}
                      onChange={(e) => updateSettings({ quiet_hours_start: e.target.value })}
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Término</Label>
                    <input
                      type="time"
                      value={settings.quiet_hours_end || '08:00'}
                      onChange={(e) => updateSettings({ quiet_hours_end: e.target.value })}
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4">
        {Object.entries(SOUND_CATEGORIES).map(([key, cat]) => (
          <SoundCategoryCard
            key={key}
            categoryKey={key}
            label={cat.label}
            description={cat.description}
            icon={cat.icon}
            sounds={cat.sounds}
            currentSound={getSoundValue(key)}
            isPlaying={!!playingSound?.startsWith(`${key}-`)}
            disabled={!settings.sound_enabled}
            onSoundChange={handleSoundChange}
            onPlayPreview={handlePlayPreview}
          />
        ))}
      </div>

      <Card className="border-2 border-dashed">
        <CardContent className="p-6 text-center">
          <Upload className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
          <h4 className="mb-1 font-medium">Sons Personalizados</h4>
          <p className="mb-4 text-sm text-muted-foreground">
            Upload (.mp3, .wav, .ogg) — Máximo 2MB
          </p>
          <input
            type="file"
            accept="audio/mp3,audio/wav,audio/ogg,audio/mpeg"
            className="hidden"
            id="custom-sound-upload"
            onChange={handleUpload}
          />
          <Button
            variant="outline"
            onClick={() => document.getElementById('custom-sound-upload')?.click()}
          >
            <Upload className="mr-2 h-4 w-4" />
            Fazer Upload
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
