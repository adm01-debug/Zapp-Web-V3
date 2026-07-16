import { useState } from 'react';
import { getLogger } from '@/lib/logger';

const log = getLogger('AIRewriteButton');
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
// Tooltip removido para evitar loop Tooltip+Popover.
import {
  Sparkles,
  Briefcase,
  MessageCircle,
  Target,
  Heart,
  Scissors,
  BookOpen,
  Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const tones = [
  {
    id: 'professional',
    label: 'Profissional',
    icon: Briefcase,
    description: 'Formal e corporativo',
  },
  { id: 'casual', label: 'Casual', icon: MessageCircle, description: 'Amigável e descontraído' },
  { id: 'persuasive', label: 'Persuasivo', icon: Target, description: 'Impactante e convincente' },
  { id: 'empathetic', label: 'Empático', icon: Heart, description: 'Acolhedor e compreensivo' },
  { id: 'concise', label: 'Conciso', icon: Scissors, description: 'Direto ao ponto' },
  { id: 'detailed', label: 'Detalhado', icon: BookOpen, description: 'Completo e explicativo' },
] as const;

interface AIRewriteButtonProps {
  inputValue: string;
  onRewrite: (newText: string) => void;
  contactName?: string;
}

export function AIRewriteButton({ inputValue, onRewrite, contactName }: AIRewriteButtonProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [loadingTone, setLoadingTone] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  const handleRewrite = async (tone: string) => {
    if (!inputValue.trim()) {
      toast.warning('Digite uma mensagem primeiro para reescrever com IA.');
      return;
    }

    setIsLoading(true);
    setLoadingTone(tone);

    try {
      const { data, error } = await supabase.functions.invoke('ai-enhance-message', {
        body: { message: inputValue, tone, contactName },
      });

      if (error) throw error;

      if (data?.enhanced) {
        onRewrite(data.enhanced);
        setIsOpen(false);
        toast.success('Mensagem reescrita com IA!');
      } else if (data?.error) {
        toast.error(data.error);
      }
    } catch (err) {
      log.error('AI rewrite error:', err);
      toast.error('Erro ao reescrever mensagem. Tente novamente.');
    } finally {
      setIsLoading(false);
      setLoadingTone(null);
    }
  };

  const hasText = (inputValue || '').trim().length > 0;

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            'h-9 w-9 shrink-0 transition-colors',
            hasText
              ? 'text-primary hover:bg-primary/10 hover:text-primary'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground'
          )}
          aria-label="Reescrever com IA"
          title="Reescrever com IA"
          disabled={isLoading}
        >
          {isLoading ? (
            <Loader2 className="h-[18px] w-[18px] animate-spin" />
          ) : (
            <Sparkles className="h-[18px] w-[18px]" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 border-border bg-popover p-2" align="end" side="top">
        <div className="mb-1 px-2 py-1.5">
          <h4 className="text-sm font-medium text-foreground">✨ Reescrever com IA</h4>
          <p className="mt-0.5 text-xs text-muted-foreground">Escolha o tom da mensagem</p>
        </div>
        <div className="space-y-0.5">
          {tones.map((tone) => {
            const Icon = tone.icon;
            const isToneLoading = loadingTone === tone.id;
            return (
              <button
                type="button"
                key={tone.id}
                onClick={() => handleRewrite(tone.id)}
                disabled={isLoading || !hasText}
                className={cn(
                  'flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left transition-colors',
                  'hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40',
                  isToneLoading && 'bg-primary/10'
                )}
              >
                {isToneLoading ? (
                  <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />
                ) : (
                  <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                )}
                <div className="min-w-0">
                  <span className="block text-sm font-medium text-foreground">{tone.label}</span>
                  <span className="text-[11px] text-muted-foreground">{tone.description}</span>
                </div>
              </button>
            );
          })}
        </div>
        {!hasText && (
          <p className="mt-2 px-2 text-center text-[11px] text-warning">
            Digite uma mensagem primeiro
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
}
