/**
 * MessageBubbleUnsupported
 *
 * Fallback diagnóstico inline para tipos do blueprint que o MessageBubble
 * não sabe renderizar nativamente (ex.: pollUpdateMessage, reactionMessage,
 * viewOnceMessage, contactMessage). Em vez de colapsar para texto vazio,
 * mostra um card neutro com:
 *  - Ícone por categoria (poll/reaction/contact/system).
 *  - Label legível (pt-BR) + tipo bruto (rawType) em mono.
 *  - Bullet com a categoria semântica e o flag de suporte.
 *  - Conteúdo bruto da mensagem (se houver), em monospace cortado.
 *
 * Disparado por `MessageBubble` sempre que `extractMessageType(...).supported`
 * retorna `false`.
 */
import {
  HelpCircle, BarChart3, Smile, UserSquare2, EyeOff, FileQuestion,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ExtractedMessageType } from '@/adapters/evolutionAdapter';

interface MessageBubbleUnsupportedProps {
  extracted: ExtractedMessageType;
  rawContent?: string | null;
  isSent?: boolean;
}

const ICON_BY_CATEGORY: Record<ExtractedMessageType['category'], typeof HelpCircle> = {
  poll: BarChart3,
  reaction: Smile,
  contact: UserSquare2,
  media: EyeOff, // viewOnceMessage falls into media+unsupported
  text: FileQuestion,
  interactive: HelpCircle,
  location: HelpCircle,
  system: HelpCircle,
  unknown: HelpCircle,
};

/** Message Bubble Unsupported function. */
export function MessageBubbleUnsupported({
  extracted, rawContent, isSent,
}: MessageBubbleUnsupportedProps) {
  const Icon = ICON_BY_CATEGORY[extracted.category] ?? HelpCircle;
  const isUnknown = extracted.category === 'unknown';

  return (
    <div
      className={cn(
        'flex items-start gap-2 rounded-lg border px-2.5 py-2 text-[12.5px]',
        isSent
          ? 'bg-primary-foreground/10 border-primary-foreground/20 text-primary-foreground'
          : 'bg-muted/40 border-border/40 text-foreground',
      )}
      role="note"
      aria-label={`Tipo de mensagem não renderizável: ${extracted.label}`}
    >
      <Icon className="w-4 h-4 mt-0.5 shrink-0 opacity-80" />
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-baseline gap-1.5">
          <span className="font-semibold">{extracted.label}</span>
          <code
            className={cn(
              'text-[10px] px-1 py-px rounded ',
              isSent ? 'bg-primary-foreground/15' : 'bg-muted',
            )}
          >
            {extracted.rawType || '(vazio)'}
          </code>
        </div>
        <p className={cn(
          'text-[10.5px] mt-0.5',
          isSent ? 'text-primary-foreground/70' : 'text-muted-foreground',
        )}>
          {isUnknown
            ? 'Tipo desconhecido (não está no blueprint).'
            : `Categoria: ${extracted.category} · sem renderização nativa nesta versão.`}
        </p>
        {rawContent ? (
          <pre className={cn(
            'mt-1.5 max-h-24 overflow-auto whitespace-pre-wrap break-words text-[11px]  px-2 py-1 rounded',
            isSent ? 'bg-primary-foreground/10' : 'bg-background/60 border border-border/30',
          )}>
            {rawContent.length > 240 ? `${rawContent.slice(0, 240)}…` : rawContent}
          </pre>
        ) : null}
      </div>
    </div>
  );
}
