import { useState, memo } from 'react';
import { AlertTriangle, RefreshCw, X, ChevronDown, ChevronUp, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

interface SendErrorBannerProps {
  /** Frase humanizada (ex.: "Número inválido ou sem WhatsApp ativo."). */
  error: string | null;
  /** Mensagem bruta do upstream/HTTP — exibida no "Ver detalhes". */
  detail?: string | null;
  isRetrying?: boolean;
  onRetry: () => void;
  onDismiss: () => void;
}

/**
 * Banner de falha de envio. Mostra:
 *  - Ícone de alerta + frase humanizada (parseEvolutionError).
 *  - Botão "Reenviar" destacado (pulse + ring) para chamar atenção.
 *  - "Ver detalhes" colapsável com a mensagem bruta do evolution-api e
 *    botão para copiar (útil em report de bug pelo agente).
 */
// memo (etapa 64): props primitivas + callbacks estáveis do hook — sem erro
// ativo o banner é null e não deve re-renderizar com o painel.
export const SendErrorBanner = memo(function SendErrorBanner({ error, detail, isRetrying, onRetry, onDismiss }: SendErrorBannerProps) {
  const [showDetail, setShowDetail] = useState(false);
  if (!error) return null;
  const hasDetail = Boolean(detail && detail.trim() && detail !== error);

  const copyDetail = async () => {
    try {
      await navigator.clipboard.writeText(detail ?? error);
      toast.success('Detalhes copiados para a área de transferência.');
    } catch {
      toast.error('Não foi possível copiar.');
    }
  };

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="mx-3 mb-2 rounded-lg border-2 border-destructive/60 bg-destructive/10 shadow-[0_0_0_1px_hsl(var(--destructive)/0.15)] animate-in fade-in slide-in-from-bottom-2"
    >
      <div className="flex items-start gap-3 px-3 py-2.5 text-sm text-destructive">
        <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" aria-hidden="true" />
        <div className="flex-1 min-w-0">
          <p className="font-semibold leading-tight">Falha ao enviar mensagem</p>
          <p className="text-xs opacity-90 mt-0.5 break-words">{error}</p>
          {hasDetail && (
            <button
              type="button"
              onClick={() => setShowDetail((v) => !v)}
              className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium underline-offset-2 hover:underline opacity-80 hover:opacity-100"
              aria-expanded={showDetail}
            >
              {showDetail ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              {showDetail ? 'Ocultar detalhes' : 'Ver detalhes'}
            </button>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <Button
            size="sm"
            variant="destructive"
            onClick={onRetry}
            disabled={isRetrying}
            className={`h-9 gap-1.5 font-semibold shadow-sm ring-2 ring-destructive/40 ring-offset-1 ring-offset-background ${isRetrying ? '' : 'animate-pulse'}`}
            autoFocus
          >
            <RefreshCw className={`h-4 w-4 ${isRetrying ? 'animate-spin' : ''}`} />
            {isRetrying ? 'Reenviando…' : 'Reenviar'}
          </Button>
          <Button
            size="icon"
            variant="ghost"
            onClick={onDismiss}
            className="h-8 w-8 text-destructive hover:bg-destructive/20"
            aria-label="Dispensar erro"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
      {hasDetail && showDetail && (
        <div className="border-t border-destructive/30 bg-destructive/5 px-3 py-2 text-[11px] text-destructive/90">
          <div className="flex items-start justify-between gap-2">
            <pre className="whitespace-pre-wrap break-words flex-1 min-w-0">{detail}</pre>
            <Button
              size="icon"
              variant="ghost"
              onClick={copyDetail}
              className="h-6 w-6 shrink-0 text-destructive hover:bg-destructive/20"
              aria-label="Copiar detalhes"
            >
              <Copy className="h-3 w-3" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
});
