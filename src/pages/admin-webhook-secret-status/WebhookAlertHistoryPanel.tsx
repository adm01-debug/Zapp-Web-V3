/**
 * WebhookAlertHistoryPanel — auditoria persistente dos alertas disparados.
 * Mostra data/hora, instância, métrica que excedeu (observado vs threshold)
 * e severidade. Permite filtrar por tipo/severidade e limpar histórico.
 */
import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { History, ChevronDown, ChevronUp, Trash2 } from 'lucide-react';
import { ptBR } from 'date-fns/locale';
import { format } from 'date-fns';
import { clearAlertHistory, type AlertHistoryEntry, type AlertSeverity } from '@/lib/alertHistory';
import { toast } from 'sonner';

interface Props {
  history: AlertHistoryEntry[];
  onCleared: () => void;
}

type TypeFilter = 'all' | AlertHistoryEntry['type'];
type SeverityFilter = 'all' | AlertSeverity;

const SEVERITY_VARIANT: Record<AlertSeverity, 'destructive' | 'warning' | 'secondary'> = {
  critical: 'destructive',
  high: 'warning',
  medium: 'secondary',
};

const SEVERITY_LABEL: Record<AlertSeverity, string> = {
  critical: 'Crítico',
  high: 'Alto',
  medium: 'Médio',
};

const TYPE_LABEL: Record<AlertHistoryEntry['type'], string> = {
  signature_spike: 'Pico de assinaturas inválidas',
  webhook_silence: 'Silêncio do webhook',
};

function formatMetric(entry: AlertHistoryEntry): string {
  if (entry.type === 'signature_spike') {
    return `${entry.observed.toFixed(1)}% (limite ${entry.threshold}%)`;
  }
  return `${Math.round(entry.observed)} min (limite ${entry.threshold} min)`;
}

export function WebhookAlertHistoryPanel({ history, onCleared }: Props) {
  const [open, setOpen] = useState(false);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>('all');

  const filtered = useMemo(() => {
    return history.filter((h) => {
      if (typeFilter !== 'all' && h.type !== typeFilter) return false;
      if (severityFilter !== 'all' && h.severity !== severityFilter) return false;
      return true;
    });
  }, [history, typeFilter, severityFilter]);

  const handleClear = () => {
    if (history.length === 0) return;
    clearAlertHistory();
    onCleared();
    toast.success('Histórico de alertas limpo');
  };

  return (
    <Card>
      <Collapsible open={open} onOpenChange={setOpen}>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <History className="h-4 w-4" />
                Histórico de alertas
                <Badge variant="secondary" className="ml-2">
                  {history.length}
                </Badge>
              </CardTitle>
              <CardDescription>
                Auditoria persistente das degradações detectadas — data/hora, métrica
                que excedeu o limite e severidade. Mantém os 200 mais recentes.
              </CardDescription>
            </div>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm">
                {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </Button>
            </CollapsibleTrigger>
          </div>
        </CardHeader>
        <CollapsibleContent>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as TypeFilter)}>
                <SelectTrigger className="h-8 w-[220px]">
                  <SelectValue placeholder="Tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os tipos</SelectItem>
                  <SelectItem value="signature_spike">Pico de assinaturas inválidas</SelectItem>
                  <SelectItem value="webhook_silence">Silêncio do webhook</SelectItem>
                </SelectContent>
              </Select>
              <Select value={severityFilter} onValueChange={(v) => setSeverityFilter(v as SeverityFilter)}>
                <SelectTrigger className="h-8 w-[180px]">
                  <SelectValue placeholder="Severidade" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as severidades</SelectItem>
                  <SelectItem value="critical">Crítico</SelectItem>
                  <SelectItem value="high">Alto</SelectItem>
                  <SelectItem value="medium">Médio</SelectItem>
                </SelectContent>
              </Select>
              <div className="flex-1" />
              <Button
                variant="ghost"
                size="sm"
                onClick={handleClear}
                disabled={history.length === 0}
                className="text-destructive hover:text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5 mr-1" />
                Limpar
              </Button>
            </div>

            {filtered.length === 0 ? (
              <p className="text-xs text-muted-foreground py-6 text-center">
                {history.length === 0
                  ? 'Nenhum alerta registrado ainda.'
                  : 'Nenhum alerta corresponde aos filtros aplicados.'}
              </p>
            ) : (
              <div className="overflow-x-auto rounded-md border">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50">
                    <tr className="text-left">
                      <th scope="col" className="px-3 py-2 font-medium">Data/Hora</th>
                      <th scope="col" className="px-3 py-2 font-medium">Severidade</th>
                      <th scope="col" className="px-3 py-2 font-medium">Instância</th>
                      <th scope="col" className="px-3 py-2 font-medium">Tipo</th>
                      <th scope="col" className="px-3 py-2 font-medium">Métrica excedida</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((entry) => (
                      <tr key={entry.id} className="border-t hover:bg-muted/30">
                        <td className="px-3 py-2 whitespace-nowrap  text-[11px]">
                          {format(new Date(entry.firedAt), 'dd/MM/yyyy HH:mm:ss', { locale: ptBR })}
                        </td>
                        <td className="px-3 py-2">
                          <Badge variant={SEVERITY_VARIANT[entry.severity]}>
                            {SEVERITY_LABEL[entry.severity]}
                          </Badge>
                        </td>
                        <td className="px-3 py-2 font-medium">{entry.instance}</td>
                        <td className="px-3 py-2 text-muted-foreground">
                          {TYPE_LABEL[entry.type]}
                        </td>
                        <td className="px-3 py-2  text-[11px]">
                          {formatMetric(entry)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
