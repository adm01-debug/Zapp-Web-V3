import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Loader2, AlertTriangle, CheckCircle2, XCircle, ExternalLink } from 'lucide-react';
import type { SecretStatus } from './adminWhatsAppModeTypes';
import { SECRET_DOCS } from './adminWhatsAppModeTypes';

interface Props {
  secrets: SecretStatus[] | null;
  secretsLoading: boolean;
  allConfigured: boolean;
  missingCount: number;
  onRefreshSecrets: () => void;
}

export function AdminWhatsAppSecretsCard({
  secrets,
  secretsLoading,
  allConfigured,
  missingCount,
  onRefreshSecrets,
}: Props) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle>Credenciais Cloud API (Secrets)</CardTitle>
            <CardDescription>
              Os valores são guardados como secrets do projeto e nunca aparecem no código.
            </CardDescription>
          </div>
          {secrets && (
            <Badge
              variant={
                allConfigured
                  ? 'default'
                  : missingCount === secrets.length
                    ? 'destructive'
                    : 'secondary'
              }
            >
              {allConfigured
                ? 'Todas configuradas'
                : `${secrets.length - missingCount}/${secrets.length} configuradas`}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {secretsLoading && !secrets && (
          <div
            role="status"
            aria-live="polite"
            className="flex items-center gap-2 text-sm text-muted-foreground"
          >
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Verificando secrets…
          </div>
        )}

        {secrets?.map((s) => {
          const doc = SECRET_DOCS[s.name];
          return (
            <div
              key={s.name}
              className="flex items-start justify-between gap-3 rounded-lg border border-border/30 p-3 transition-colors hover:bg-muted/10"
            >
              <div className="flex min-w-0 items-start gap-3">
                {s.configured ? (
                  <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-primary" />
                ) : (
                  <XCircle className="mt-1 h-4 w-4 shrink-0 text-destructive" />
                )}
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium">{doc?.label ?? s.name}</p>
                    <code className="text-[10px] text-muted-foreground">{s.name}</code>
                    {s.configured && s.length > 0 && (
                      <Badge variant="outline" className="text-[10px]">
                        {s.length} chars
                      </Badge>
                    )}
                  </div>
                  {doc?.description && (
                    <p className="mt-0.5 text-xs text-muted-foreground">{doc.description}</p>
                  )}
                  {doc?.where && (
                    <p className="mt-1 text-[11px] text-muted-foreground/70">
                      <strong>Onde encontrar:</strong> {doc.where}
                    </p>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Como adicionar/atualizar</AlertTitle>
          <AlertDescription className="space-y-2 text-sm">
            <p>
              Por motivos de segurança, secrets são editados num formulário protegido fora desta
              tela. Peça ao Lovable para "configurar os secrets do WhatsApp Cloud" — você receberá
              um modal seguro para colar cada valor sem que ele apareça no chat ou no código.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={onRefreshSecrets}
              disabled={secretsLoading}
            >
              {secretsLoading ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
              Recarregar status
            </Button>
          </AlertDescription>
        </Alert>

        <p className="text-[11px] text-muted-foreground">
          <ExternalLink className="mr-1 inline h-3 w-3" />
          Após salvar/atualizar qualquer secret, as edge functions o utilizam imediatamente — não há
          rebuild necessário.
        </p>
      </CardContent>
    </Card>
  );
}
