import { useEffect, useRef, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { RefreshCw, Loader2 } from 'lucide-react';
import { getLogger } from '@/lib/logger';

const log = getLogger('RefreshQrButton');

export type RefreshQrButtonStatus = 'loading' | 'pending' | 'connected' | 'error';

interface RefreshQrButtonProps {
  /** Callback que efetivamente dispara a regeneração do QR. */
  onRefresh: () => void | Promise<void>;
  /** Loading externo (request em vôo no hook). */
  loading: boolean;
  /** Texto a exibir quando habilitado. */
  label: string;
  /** Status atual do diálogo. Bloqueia o refresh em transições para loading/error. */
  status: RefreshQrButtonStatus;
  /** Cooldown em segundos após cada clique manual. Default: 5. */
  cooldownSeconds?: number;
  /**
   * Tempo (ms) que o status precisa permanecer estável em status interativo
   * antes de reabilitar o botão. Default: 400ms.
   */
  stabilizationMs?: number;
}

type BlockReason =
  | 'in_flight'
  | 'cooldown'
  | 'status_not_interactive'
  | 'awaiting_stabilization';

const REASON_COPY: Record<BlockReason, (extra: { secondsLeft: number; status: string }) => string> = {
  in_flight: () => 'Já existe uma geração de QR em andamento. Aguarde a conclusão ou clique em "Cancelar".',
  cooldown: ({ secondsLeft }) => `Aguarde ${secondsLeft}s antes de gerar outro QR (proteção contra cliques repetidos).`,
  status_not_interactive: ({ status }) =>
    status === 'connected'
      ? 'Conexão já está ativa — não é necessário gerar novo QR.'
      : 'O QR ainda está sendo carregado. O botão será reabilitado quando o status estabilizar.',
  awaiting_stabilization: () => 'Aguardando o novo status do QR estabilizar… O botão reabilitará em instantes.',
};

export function RefreshQrButton({
  onRefresh,
  loading,
  label,
  status,
  cooldownSeconds = 5,
  stabilizationMs = 400,
}: RefreshQrButtonProps) {
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [stabilized, setStabilized] = useState(false);
  const previousStatusRef = useRef<RefreshQrButtonStatus>(status);

  useEffect(() => {
    const prev = previousStatusRef.current;
    previousStatusRef.current = status;

    if (status === 'loading' || status === 'connected') {
      setStabilized(false);
      if (prev !== status) setSecondsLeft(s => s > 0 ? 0 : s);
      return;
    }

    setStabilized(false);
    const timer = setTimeout(() => setStabilized(true), stabilizationMs);
    return () => clearTimeout(timer);
  }, [status, stabilizationMs]);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const timer = setInterval(() => {
      setSecondsLeft((s) => (s <= 1 ? 0 : s - 1));
    }, 1_000);
    return () => clearInterval(timer);
  }, [secondsLeft]);

  const isInteractiveStatus = status === 'pending' || status === 'error';

  const blockReason: BlockReason | null = loading
    ? 'in_flight'
    : !isInteractiveStatus
      ? 'status_not_interactive'
      : !stabilized
        ? 'awaiting_stabilization'
        : secondsLeft > 0
          ? 'cooldown'
          : null;

  const handleClick = useCallback(() => {
    if (blockReason) {
      log.info('[refresh-qr-button] click_ignored', {
        reason: blockReason,
        status,
        secondsLeft,
        loading,
      });
      return;
    }
    setSecondsLeft(cooldownSeconds);
    void onRefresh();
  }, [blockReason, status, secondsLeft, loading, cooldownSeconds, onRefresh]);

  const onCooldown = blockReason === 'cooldown';
  const disabled = blockReason !== null;
  const tooltipMessage = blockReason ? REASON_COPY[blockReason]({ secondsLeft, status }) : null;

  const buttonNode = (
    <Button
      variant="outline"
      onClick={handleClick}
      disabled={disabled}
      aria-busy={loading}
      aria-live="polite"
      aria-describedby={tooltipMessage ? 'refresh-qr-block-reason' : undefined}
      data-block-reason={blockReason ?? undefined}
    >
      {loading ? (
        <>
          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          Gerando…
        </>
      ) : onCooldown ? (
        <>
          <RefreshCw className="w-4 h-4 mr-2 opacity-60" />
          Aguarde {secondsLeft}s
        </>
      ) : (
        <>
          <RefreshCw className="w-4 h-4 mr-2" />
          {label}
        </>
      )}
    </Button>
  );

  if (!tooltipMessage) return buttonNode;

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span tabIndex={0} className="inline-flex">
            {buttonNode}
          </span>
        </TooltipTrigger>
        <TooltipContent id="refresh-qr-block-reason" side="top" className="max-w-xs text-xs">
          {tooltipMessage}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
