import { Info } from 'lucide-react';

const REASON_PROFILE_UI: Array<{
  reason: string;
  label: string;
  multiplier: number;
  minDelayMs: number;
  hint: string;
}> = [
  {
    reason: 'rate_limit',
    label: 'Rate limit (429)',
    multiplier: 4.0,
    minDelayMs: 120_000,
    hint: 'Espera mais para não piorar throttling.',
  },
  {
    reason: 'unavailable',
    label: 'Indisponível (502/503/504)',
    multiplier: 2.0,
    minDelayMs: 60_000,
    hint: 'Serviço pode voltar logo.',
  },
  {
    reason: 'server_error',
    label: 'Erro do servidor (5xx)',
    multiplier: 2.0,
    minDelayMs: 60_000,
    hint: 'Outros 5xx genéricos.',
  },
  {
    reason: 'auth',
    label: 'Autenticação (401/403)',
    multiplier: 1.5,
    minDelayMs: 90_000,
    hint: 'Dá tempo de refresh de token.',
  },
  {
    reason: 'timeout',
    label: 'Timeout',
    multiplier: 1.0,
    minDelayMs: 30_000,
    hint: 'Reagenda agressivo, geralmente resolve.',
  },
  {
    reason: 'network',
    label: 'Rede',
    multiplier: 1.0,
    minDelayMs: 30_000,
    hint: 'Reagenda agressivo, geralmente resolve.',
  },
  {
    reason: 'invalid_payload',
    label: 'Payload inválido (400/422)',
    multiplier: 1.0,
    minDelayMs: 60_000,
    hint: 'Não recupera por retry — só respeita.',
  },
  {
    reason: 'not_found',
    label: 'Não encontrado (404)',
    multiplier: 1.0,
    minDelayMs: 60_000,
    hint: 'Não recupera por retry — só respeita.',
  },
  {
    reason: 'unknown',
    label: 'Desconhecido',
    multiplier: 1.0,
    minDelayMs: 60_000,
    hint: 'Comportamento padrão (compat).',
  },
];

function fmtMs(ms: number): string {
  if (ms >= 60_000) return `${Math.round(ms / 60_000)}min`;
  return `${Math.round(ms / 1000)}s`;
}

export function RetryConfigBackoffTable() {
  return (
    <div className="space-y-2 rounded-md border bg-muted/20 p-3 text-xs">
      <div className="flex items-start gap-2">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <div className="flex-1">
          <div className="mb-0.5 font-medium">Backoff escalonado por motivo</div>
          <div className="text-muted-foreground">
            Aplicado pela DLQ ao reprocessar — multiplica o exponencial base e respeita o piso por
            motivo. Cap global de 1h.
          </div>
        </div>
      </div>
      <div className="-mx-3 overflow-x-auto px-3">
        <table className="w-full text-xs tabular-nums">
          <thead className="text-muted-foreground">
            <tr className="border-b">
              <th scope="col" className="py-1.5 pr-2 text-left font-medium">
                Motivo
              </th>
              <th scope="col" className="px-2 py-1.5 text-right font-medium">
                Mult.
              </th>
              <th scope="col" className="px-2 py-1.5 text-right font-medium">
                Mín.
              </th>
              <th scope="col" className="py-1.5 pl-2 text-left font-medium">
                Quando aplica
              </th>
            </tr>
          </thead>
          <tbody>
            {REASON_PROFILE_UI.map((r) => (
              <tr key={r.reason} className="border-b last:border-0">
                <td className="py-1.5 pr-2 font-medium">{r.label}</td>
                <td className="px-2 py-1.5 text-right">{r.multiplier.toFixed(1)}×</td>
                <td className="px-2 py-1.5 text-right">{fmtMs(r.minDelayMs)}</td>
                <td className="py-1.5 pl-2 text-muted-foreground">{r.hint}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
