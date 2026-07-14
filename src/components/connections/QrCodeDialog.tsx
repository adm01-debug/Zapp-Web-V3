import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { CheckCircle2, XCircle, AlertCircle, Loader2, QrCode } from 'lucide-react';
import { RefreshQrButton } from './RefreshQrButton';
import { QrAttemptHistory } from './QrAttemptHistory';

export interface QrCodeDialogState {
  status: 'loading' | 'pending' | 'connected' | 'error';
  connectionName: string;
  qrCode: string | null;
  errorMessage: string | null;
  rawPayload: unknown;
  connectionId: string | null;
  attemptId?: string | null;
}

interface QrCodeDialogProps {
  open: boolean;
  onClose: () => void;
  dialog: QrCodeDialogState;
  evolutionLoading: boolean;
  onRefresh: () => void;
}

function maskSensitiveData(obj: unknown): unknown {
  if (!obj || typeof obj !== 'object') return null;
  const sensitiveKeys = [
    'apikey',
    'key',
    'token',
    'password',
    'secret',
    'base64',
    'qr',
    'qrcode',
    'authorization',
    'session',
    'cookie',
  ];

  const maskValue = (o: unknown): unknown => {
    if (typeof o !== 'object' || o === null) return o;
    const record = o as Record<string, unknown>; // ignore-audit: safe cast after null/object guard
    for (const key in record) {
      if (sensitiveKeys.some((sk) => key.toLowerCase().includes(sk))) {
        if (typeof record[key] === 'string') {
          const s = record[key] as string;
          record[key] =
            s.length > 10 ? `${s.substring(0, 4)}...${s.substring(s.length - 4)}` : '****';
        } else {
          record[key] = '****';
        }
      } else if (typeof record[key] === 'object') {
        maskValue(record[key]);
      }
    }
    return record;
  };

  return maskValue(JSON.parse(JSON.stringify(obj)));
}

export function QrCodeDialog({
  open,
  onClose,
  dialog,
  evolutionLoading,
  onRefresh,
}: QrCodeDialogProps) {
  const [showDiagnostic, setShowDiagnostic] = useState(false);
  const { status, connectionName, qrCode, errorMessage, rawPayload, connectionId, attemptId } =
    dialog;

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="text-center sm:max-w-md">
        <DialogHeader>
          <DialogTitle
            className="flex items-center justify-center gap-2"
            data-testid="qr-dialog-title"
          >
            {status === 'connected' ? (
              <>
                <CheckCircle2 className="h-5 w-5 text-status-online" />
                Conectado!
              </>
            ) : status === 'error' ? (
              <>
                <XCircle className="h-5 w-5 text-destructive" />
                Erro
              </>
            ) : (
              <>
                <QrCode className="h-5 w-5" />
                Escanear QR Code - {connectionName}
              </>
            )}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-6 py-6">
          {status === 'loading' && (
            <div className="mx-auto flex h-64 w-64 flex-col items-center justify-center gap-4 rounded-xl bg-muted p-6 text-center">
              <Loader2 className="h-12 w-12 animate-spin text-muted-foreground" />
              <div className="space-y-1.5">
                <p
                  className="animate-pulse text-sm font-medium"
                  data-testid="reconnect-step-loading"
                >
                  Iniciando sessão...
                </p>
                <p className="text-[10px] text-muted-foreground" data-testid="reconnect-step-label">
                  Etapa 1 de 3: Autenticando com a Evolution API
                </p>
              </div>
            </div>
          )}
          {status === 'pending' && qrCode && (
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="mx-auto flex h-64 w-64 items-center justify-center rounded-xl bg-background p-2"
              data-testid="qr-code-container"
            >
              <img
                src={qrCode.startsWith('data:') ? qrCode : `data:image/png;base64,${qrCode}`}
                alt="QR Code"
                className="h-full w-full object-contain"
                data-testid="qr-code-image"
              />
            </motion.div>
          )}
          {status === 'connected' && (
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="mx-auto flex h-64 w-64 flex-col items-center justify-center rounded-xl bg-status-online/10"
            >
              <CheckCircle2 className="mb-4 h-20 w-20 text-status-online" />
              <p className="text-lg font-medium text-status-online">WhatsApp Conectado!</p>
            </motion.div>
          )}
          {status === 'error' && (
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="mx-auto flex h-64 w-64 flex-col items-center justify-center rounded-xl bg-destructive/10 p-4"
            >
              <AlertCircle className="mb-4 h-16 w-16 text-destructive" />
              <p role="alert" className="text-center text-sm text-destructive">
                {errorMessage}
              </p>
            </motion.div>
          )}
          {(status === 'pending' || status === 'error' || status === 'loading') && (
            <RefreshQrButton
              onRefresh={onRefresh}
              loading={evolutionLoading || status === 'loading'}
              status={status}
              label={status === 'pending' ? 'Gerar novo QR' : 'Gerar novo código'}
            />
          )}
          {status === 'connected' && <Button onClick={onClose}>Fechar</Button>}

          <div className="border-t border-muted/30 pt-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowDiagnostic(!showDiagnostic)}
              className="gap-1 text-[10px] text-muted-foreground hover:text-primary"
            >
              {showDiagnostic ? 'Ocultar Diagnóstico' : 'Ver Diagnóstico Técnico'}
            </Button>

            <AnimatePresence>
              {showDiagnostic && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="mt-2 overflow-hidden"
                >
                  <div className="space-y-2 rounded-lg bg-muted/50 p-3 text-left">
                    <p className="text-[10px] font-bold uppercase text-muted-foreground">
                      Payload Evolution API (Mascarado)
                    </p>
                    <pre className="max-h-40 overflow-x-auto rounded bg-black/5 p-2 font-mono text-[9px]">
                      {JSON.stringify(maskSensitiveData(rawPayload), null, 2)}
                    </pre>
                    <p className="text-[8px] italic text-muted-foreground">
                      * Dados sensíveis como chaves de API e strings Base64 foram ocultados por
                      segurança.
                    </p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {connectionId && (
            <QrAttemptHistory
              connectionId={connectionId}
              refreshKey={`${attemptId ?? 'none'}:${status}`}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
