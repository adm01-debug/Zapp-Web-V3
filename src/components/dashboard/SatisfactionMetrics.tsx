import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Star, Info } from 'lucide-react';

/**
 * SatisfactionMetrics — exibe métricas de CSAT/NPS.
 *
 * A integração com a fonte de dados real (tabela de avaliações) ainda não está
 * disponível. O componente exibe um estado "indisponível" explícito em vez de
 * dados fictícios, evitando que métricas aleatórias sejam confundidas com valores reais.
 *
 * Quando o hook de dados real for implementado, substitua o bloco de estado
 * `dataUnavailable` pelo resultado do hook e remova este aviso.
 */

export const SatisfactionMetrics = () => {
  const [selectedPeriod, setSelectedPeriod] = useState<'7d' | '30d' | '90d'>('30d');

  const dataUnavailable = true;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Star className="h-5 w-5 text-warning" />
            <CardTitle className="text-lg">Satisfação do Cliente</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            {(['7d', '30d', '90d'] as const).map((p) => (
              <Button
                key={p}
                variant={selectedPeriod === p ? 'default' : 'outline'}
                size="sm"
                className="text-xs"
                onClick={() => setSelectedPeriod(p)}
                disabled={dataUnavailable}
              >
                {p === '7d' ? '7 dias' : p === '30d' ? '30 dias' : '90 dias'}
              </Button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
          <Info className="h-8 w-8 text-muted-foreground/50" />
          <p className="text-sm font-medium text-muted-foreground">
            Métricas de satisfação indisponíveis
          </p>
          <p className="max-w-xs text-xs text-muted-foreground/70">
            A integração com a fonte de avaliações ainda não foi configurada. Os dados aparecerão
            aqui quando a coleta de CSAT/NPS estiver ativa.
          </p>
        </div>
      </CardContent>
    </Card>
  );
};
