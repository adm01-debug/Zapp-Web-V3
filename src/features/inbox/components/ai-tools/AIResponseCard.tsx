import { memo, useState, useMemo, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Sparkles, Copy, Check, RefreshCw, Loader2, Send } from 'lucide-react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';

interface AIResponseCardProps {
  response: string;
  onUse?: (text: string) => void;
  onRegenerate?: () => void;
  isRegenerating?: boolean;
}

export const AIResponseCard = memo(function AIResponseCard({
  response,
  onUse,
  onRegenerate,
  isRegenerating,
}: AIResponseCardProps) {
  const [copied, setCopied] = useState(false);
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
    },
    []
  );

  const wordCount = useMemo(() => response.trim().split(/\s+/).filter(Boolean).length, [response]);

  const handleCopy = () => {
    navigator.clipboard.writeText(response);
    setCopied(true);
    toast.success('Copiado!');
    if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
    copiedTimerRef.current = setTimeout(() => setCopied(false), 2000);
  };

  const handleUse = () => {
    onUse?.(response);
    toast.success('Resposta inserida no chat!');
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -5 }}
      className="space-y-2.5 rounded-xl border border-primary/20 bg-primary/5 p-3"
    >
      <div className="flex items-center gap-1.5">
        <Sparkles className="h-3 w-3 text-primary" />
        <span className="text-[10px] font-semibold text-primary">Resposta sugerida</span>
      </div>

      <p className="whitespace-pre-wrap text-xs leading-relaxed text-foreground">{response}</p>

      <div className="flex items-center justify-between border-t border-primary/10 pt-1.5">
        <span className="text-[9px] tabular-nums text-muted-foreground">
          {wordCount} {wordCount === 1 ? 'palavra' : 'palavras'} · {response.length} chars
        </span>
        <div className="flex items-center gap-1">
          {onRegenerate && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1 rounded-full px-2 text-[10px] font-medium text-muted-foreground hover:text-foreground"
              onClick={onRegenerate}
              disabled={isRegenerating}
              title="Regenerar resposta"
            >
              {isRegenerating ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <RefreshCw className="h-3 w-3" />
              )}
              Reescrever
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1 rounded-full px-2 text-[10px] font-medium text-muted-foreground hover:text-foreground"
            onClick={handleCopy}
            title="Copiar resposta"
          >
            {copied ? <Check className="h-3 w-3 text-success" /> : <Copy className="h-3 w-3" />}
            {copied ? 'Copiado' : 'Copiar'}
          </Button>
          {onUse && (
            <Button
              variant="default"
              size="sm"
              className="h-7 gap-1.5 rounded-full px-4 text-[10px] font-medium"
              onClick={handleUse}
            >
              <Send className="h-3 w-3" />
              Usar
            </Button>
          )}
        </div>
      </div>
    </motion.div>
  );
});
