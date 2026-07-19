import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ShieldCheck, ShieldAlert, ShieldQuestion } from 'lucide-react';
import type { RecheckResult } from '@/lib/recheckWebhookSignature';

interface RecheckResultDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  loading: boolean;
  result: RecheckResult | null;
  error: string | null;
}

function StatusHeader({ result }: { result: RecheckResult }) {
  if (result.signature_valid === true) {
    return (
      <div className="flex items-center gap-2 text-success">
        <ShieldCheck className="h-5 w-5" />
        <span className="font-medium">Assinatura válida</span>
        <Badge variant="success">OK</Badge>
      </div>
    );
  }
  if (result.signature_valid === false) {
    return (
      <div className="flex items-center gap-2 text-destructive">
        <ShieldAlert className="h-5 w-5" />
        <span className="font-medium">Assinatura inválida</span>
        <Badge variant="destructive">FALHA</Badge>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2 text-warning">
      <ShieldQuestion className="h-5 w-5" />
      <span className="font-medium">Inconclusivo</span>
      <Badge variant="subtle">—</Badge>
    </div>
  );
}

/** Recheck Result Dialog. */
export function RecheckResultDialog({
  open,
  onOpenChange,
  loading,
  result,
  error,
}: RecheckResultDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Revalidação de assinatura HMAC</DialogTitle>
          <DialogDescription>
            Recomputa SHA-256 do payload com o WEBHOOK_SECRET atual e compara com a
            assinatura observada. Não altera o evento.
          </DialogDescription>
        </DialogHeader>

        {loading && (
          <div className="space-y-2 py-4">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        )}

        {!loading && error && (
          <div role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {!loading && !error && result && (
          <div className="space-y-4 py-2">
            <StatusHeader result={result} />

            <p className="text-sm text-muted-foreground">{result.reason}</p>

            <dl className="grid grid-cols-3 gap-x-3 gap-y-2 text-xs">
              <dt className="text-muted-foreground">Evento</dt>
              <dd className="col-span-2  break-all">{result.event_type ?? '—'}</dd>

              <dt className="text-muted-foreground">Instância</dt>
              <dd className="col-span-2">{result.instance_name ?? '—'}</dd>

              <dt className="text-muted-foreground">Secret</dt>
              <dd className="col-span-2">
                {result.secret_configured ? (
                  <Badge variant="success">configurado</Badge>
                ) : (
                  <Badge variant="destructive">ausente</Badge>
                )}
              </dd>

              <dt className="text-muted-foreground">Assinatura observada</dt>
              <dd className="col-span-2  text-[10px] break-all">
                {result.observed_signature ?? '—'}
              </dd>

              <dt className="text-muted-foreground">Assinatura recomputada</dt>
              <dd className="col-span-2  text-[10px] break-all">
                {result.computed_signature ?? '—'}
              </dd>
            </dl>

            <p className="text-[11px] text-muted-foreground border-t pt-2">
              Limitação: o HMAC é recomputado sobre o payload re-serializado em JSON. Diferenças
              de espaçamento/ordenação em relação ao raw body original podem invalidar a
              comparação mesmo com o secret correto.
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
