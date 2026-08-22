import { useState, useRef, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Plus, Trash2, Play, Loader2, Users, Mic } from 'lucide-react';

const VOICES = [
  { id: 'TY3h8ANhQUsJaa0Bga5F', name: 'Voz Principal (F)' },
  { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Sarah (F)' },
  { id: 'JBFqnCBsd6RMkjVDRZzb', name: 'George (M)' },
  { id: 'FGY2WhTYpPnrIDTdsKH5', name: 'Laura (F)' },
  { id: 'IKne3meq5aSn9XLyUdCD', name: 'Charlie (M)' },
  { id: 'pFZP5JQG7iQjIQuC4Bku', name: 'Lily (F)' },
  { id: 'onwK4e9ZLuTAKqWW03F9', name: 'Daniel (M)' },
  { id: 'cgSgspJ2msm6clMCkdW9', name: 'Jessica (F)' },
  { id: 'cjVigY5qzO86Huf0OWal', name: 'Eric (M)' },
];

interface ScriptLine {
  id: string;
  voice_id: string;
  text: string;
}

/** Eleven Labs Dialogue component for the voice section. */
export function ElevenLabsDialogue() {
  const [lines, setLines] = useState<ScriptLine[]>([
    { id: crypto.randomUUID(), voice_id: VOICES[0].id, text: '' },
    { id: crypto.randomUUID(), voice_id: VOICES[1].id, text: '' },
  ]);
  const [generating, setGenerating] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const dialogueAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      dialogueAbortRef.current?.abort();
    };
  }, []);

  const addLine = () => {
    setLines((l) => [...l, { id: crypto.randomUUID(), voice_id: VOICES[0].id, text: '' }]);
  };

  const removeLine = (id: string) => {
    setLines((l) => l.filter((line) => line.id !== id));
  };

  const updateLine = (id: string, field: 'voice_id' | 'text', value: string) => {
    setLines((l) => l.map((line) => (line.id === id ? { ...line, [field]: value } : line)));
  };

  const generateDialogue = async () => {
    const validLines = lines.filter((l) => l.text.trim());
    if (validLines.length < 2) {
      toast.error('Adicione pelo menos 2 falas com texto');
      return;
    }

    dialogueAbortRef.current?.abort();
    dialogueAbortRef.current = new AbortController();
    const { signal } = dialogueAbortRef.current;

    setGenerating(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/elevenlabs-dialogue`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            Authorization: `Bearer ${session?.access_token || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({
            script: validLines.map((l) => ({ voice_id: l.voice_id, text: l.text })),
            languageCode: 'pt',
          }),
          signal,
        }
      );

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(
          (typeof errData.error === 'string' ? errData.error : null) ||
            errData.message ||
            `Erro ${response.status}`
        );
      }

      const blob = await response.blob();
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      const url = URL.createObjectURL(blob);
      setAudioUrl(url);
      toast.success('Diálogo gerado com sucesso!');
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      toast.error(err instanceof Error ? err.message : 'Erro ao gerar diálogo');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <Card className="border-border/50 bg-card/50">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Users className="h-5 w-5 text-primary" />
          Diálogo Multi-Personagem
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Crie conversas realistas com múltiplas vozes usando ElevenLabs
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <ScrollArea className="max-h-[400px]">
          <div className="space-y-3 pr-2">
            {lines.map((line, idx) => (
              <div key={line.id} className="flex items-start gap-2 rounded-lg bg-muted/30 p-3">
                <div className="mt-2 flex w-6 items-center gap-1 text-xs text-muted-foreground">
                  {idx + 1}
                </div>
                <div className="flex-1 space-y-2">
                  <Select
                    value={line.voice_id}
                    onValueChange={(v) => updateLine(line.id, 'voice_id', v)}
                  >
                    <SelectTrigger className="h-8 w-44 text-xs">
                      <Mic className="mr-1 h-3 w-3" />
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {VOICES.map((v) => (
                        <SelectItem key={v.id} value={v.id}>
                          {v.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Textarea
                    value={line.text}
                    onChange={(e) => updateLine(line.id, 'text', e.target.value)}
                    placeholder="Digite a fala do personagem..."
                    rows={2}
                    className="resize-none text-sm"
                  />
                </div>
                {lines.length > 2 && (
                  <Button
                    aria-label="Remover linha"
                    size="icon"
                    variant="ghost"
                    className="mt-1 h-7 w-7 text-muted-foreground hover:text-destructive"
                    onClick={() => removeLine(line.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        </ScrollArea>

        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={addLine} className="gap-1.5">
            <Plus className="h-3.5 w-3.5" /> Adicionar Fala
          </Button>
          <Button size="sm" onClick={generateDialogue} disabled={generating} className="gap-1.5">
            {generating ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Play className="h-3.5 w-3.5" />
            )}
            Gerar Diálogo
          </Button>
        </div>

        {audioUrl && (
          <div className="rounded-lg border border-border/50 bg-muted/50 p-3">
            <Label className="mb-2 block text-xs text-muted-foreground">Áudio Gerado</Label>
            <audio ref={audioRef} src={audioUrl} controls className="h-10 w-full" />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
