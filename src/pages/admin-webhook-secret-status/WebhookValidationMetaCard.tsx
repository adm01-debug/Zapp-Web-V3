import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface SecretInfo {
  configured: boolean;
  length: number;
  hashPrefix: string | null;
  strictMode: boolean;
  checkedAt: string;
}

interface WebhookValidationMetaCardProps {
  secret: SecretInfo | null | undefined;
  unsigned: number;
  errored: number;
}

/** Webhook Validation Meta Card. */
export function WebhookValidationMetaCard({
  secret,
  unsigned,
  errored,
}: WebhookValidationMetaCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Metadados da validação</CardTitle>
        <CardDescription>Informações coletadas sem exposição do segredo.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 gap-4 text-sm md:grid-cols-2">
          <div className="flex justify-between border-b pb-2">
            <span className="text-muted-foreground">Modo strict</span>
            <span className="font-medium">
              {secret?.strictMode ? (
                <Badge variant="success">Ativo</Badge>
              ) : (
                <Badge variant="subtle">Inativo</Badge>
              )}
            </span>
          </div>
          <div className="flex justify-between border-b pb-2">
            <span className="text-muted-foreground">Tamanho do secret</span>
            <span className="">{secret?.length ?? 0} caracteres</span>
          </div>
          <div className="flex justify-between border-b pb-2">
            <span className="text-muted-foreground">Hash prefix (SHA-256)</span>
            <span className="">{secret?.hashPrefix ? `${secret.hashPrefix}…` : '—'}</span>
          </div>
          <div className="flex justify-between border-b pb-2">
            <span className="text-muted-foreground">Último check</span>
            <span>
              {secret?.checkedAt
                ? formatDistanceToNow(new Date(secret.checkedAt), {
                    addSuffix: true,
                    locale: ptBR,
                  })
                : '—'}
            </span>
          </div>
          <div className="flex justify-between border-b pb-2">
            <span className="text-muted-foreground">Eventos sem assinatura</span>
            <span className="">{unsigned}</span>
          </div>
          <div className="flex justify-between border-b pb-2">
            <span className="text-muted-foreground">Eventos com erro</span>
            <span className="">{errored}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
