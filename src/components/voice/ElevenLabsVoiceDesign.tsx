import { useState, useEffect } from 'react';
import { getLogger } from '@/lib/logger';
const log = getLogger('ElevenLabsVoiceDesign');

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Play, RefreshCw, Wand2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

interface Voice {
  voice_id: string;
  name: string;
  category: string;
  preview_url: string;
}

/** Eleven Labs Voice Design component for the voice section. */
export function ElevenLabsVoiceDesign() {
  const [loading, setLoading] = useState(false);
  const [voices, setVoices] = useState<Voice[]>([]);
  const [selectedVoice, setSelectedVoice] = useState<string>('');
  const [text, setText] = useState(
    'Olá, eu sou uma inteligência artificial treinada para te ajudar.'
  );
  const [settings, setSettings] = useState({
    stability: 0.5,
    similarity_boost: 0.75,
    style: 0.0,
    use_speaker_boost: true,
  });

  useEffect(() => {
    let cancelled = false;
    const fetchVoices = async () => {
      setLoading(true);
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user || cancelled) return;

        const { data, error } = await supabase.functions.invoke('elevenlabs-voice', {
          body: { action: 'listVoices' },
        });

        if (error) throw error;
        if (!cancelled) {
          setVoices(data?.voices || []);
          if (data?.voices?.length > 0) setSelectedVoice(data.voices[0].voice_id);
        }
      } catch (err) {
        log.error('Failed to fetch ElevenLabs voices', err);
        if (!cancelled) toast.error('Não foi possível carregar as vozes do ElevenLabs.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchVoices();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleGenerate = async () => {
    if (!selectedVoice || !text) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('elevenlabs-voice', {
        body: {
          action: 'textToSpeech',
          voiceId: selectedVoice,
          text,
          settings,
        },
      });

      if (error) throw error;

      const audio = new Audio(`data:audio/mpeg;base64,${data.audioBase64}`);
      audio.play();
      toast.success('Áudio gerado com sucesso!');
    } catch (err) {
      log.error('Failed to generate voice', err);
      toast.error('Erro ao gerar áudio.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Wand2 className="h-5 w-5 text-primary" />
          <CardTitle>Design de Voz</CardTitle>
        </div>
        <CardDescription>Configure e teste vozes neurais de alta fidelidade</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="voice-select">Voz</Label>
            <Select value={selectedVoice} onValueChange={setSelectedVoice}>
              <SelectTrigger id="voice-select">
                <SelectValue placeholder="Selecione uma voz" />
              </SelectTrigger>
              <SelectContent>
                {voices.map((voice) => (
                  <SelectItem key={voice.voice_id} value={voice.voice_id}>
                    {voice.name} ({voice.category})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="test-text">Texto para Teste</Label>
            <Input
              id="test-text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Digite o texto que deseja ouvir..."
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-4">
              <div className="grid gap-2">
                <div className="flex justify-between">
                  <Label id="stability-label">Estabilidade</Label>
                  <span className="text-xs text-muted-foreground">
                    {Math.round(settings.stability * 100)}%
                  </span>
                </div>
                <Slider
                  aria-labelledby="stability-label"
                  value={[settings.stability * 100]}
                  onValueChange={([v]) => setSettings((s) => ({ ...s, stability: v / 100 }))}
                  max={100}
                  step={1}
                />
              </div>
              <div className="grid gap-2">
                <div className="flex justify-between">
                  <Label id="similarity-label">Similaridade</Label>
                  <span className="text-xs text-muted-foreground">
                    {Math.round(settings.similarity_boost * 100)}%
                  </span>
                </div>
                <Slider
                  aria-labelledby="similarity-label"
                  value={[settings.similarity_boost * 100]}
                  onValueChange={([v]) => setSettings((s) => ({ ...s, similarity_boost: v / 100 }))}
                  max={100}
                  step={1}
                />
              </div>
            </div>
            <div className="space-y-4">
              <div className="grid gap-2">
                <div className="flex justify-between">
                  <Label id="style-label">Exagero de Estilo</Label>
                  <span className="text-xs text-muted-foreground">
                    {Math.round(settings.style * 100)}%
                  </span>
                </div>
                <Slider
                  aria-labelledby="style-label"
                  value={[settings.style * 100]}
                  onValueChange={([v]) => setSettings((s) => ({ ...s, style: v / 100 }))}
                  max={100}
                  step={1}
                />
              </div>
              <div className="flex h-full items-end pb-1">
                <Button
                  className="w-full gap-2"
                  onClick={handleGenerate}
                  disabled={loading || !selectedVoice}
                >
                  {loading ? (
                    <RefreshCw className="h-4 w-4 animate-spin" />
                  ) : (
                    <Play className="h-4 w-4" />
                  )}
                  Gerar e Ouvir
                </Button>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
