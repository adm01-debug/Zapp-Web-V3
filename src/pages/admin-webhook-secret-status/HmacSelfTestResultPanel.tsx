import { Badge } from '@/components/ui/badge';
import type { SelfTestResult } from './hmacSelfTestTypes';

interface Props {
  result: SelfTestResult;
}

/** Hmac Self Test Result Panel. */
export function HmacSelfTestResultPanel({ result }: Props) {
  return (
    <div className="space-y-3 text-sm">
      <div className="flex items-center gap-2">
        <Badge variant={result.ok ? 'default' : 'destructive'}>{result.ok ? 'OK' : 'FALHOU'}</Badge>
        {typeof result.duration_ms === 'number' && (
          <span className="text-xs text-muted-foreground">{result.duration_ms}ms</span>
        )}
        {typeof result.secret_length === 'number' && (
          <span className="text-xs text-muted-foreground">
            secret: {result.secret_length} bytes
          </span>
        )}
      </div>

      {result.message && <p className="text-sm text-muted-foreground">{result.message}</p>}
      {result.error && (
        <p role="alert" className="text-sm text-destructive">
          {result.error}
        </p>
      )}

      {result.good && result.tampered && (
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg border p-3">
            <div className="mb-1 text-xs uppercase text-muted-foreground">Assinatura correta</div>
            <Badge
              variant={result.good.accepted ? 'default' : 'destructive'}
              className="text-[10px]"
            >
              {result.good.accepted ? 'aceita' : 'rejeitada'}
            </Badge>
            {result.good.error && (
              <p className="mt-1 text-xs text-destructive">{result.good.error}</p>
            )}
          </div>
          <div className="rounded-lg border p-3">
            <div className="mb-1 text-xs uppercase text-muted-foreground">
              Assinatura adulterada
            </div>
            <Badge
              variant={!result.tampered.accepted ? 'default' : 'destructive'}
              className="text-[10px]"
            >
              {result.tampered.accepted ? 'aceita (RUIM)' : 'rejeitada (esperado)'}
            </Badge>
            {result.tampered.error && (
              <p className="mt-1 text-xs text-muted-foreground">{result.tampered.error}</p>
            )}
          </div>
        </div>
      )}

      {typeof result.tolerance_seconds === 'number' && (
        <div className="text-xs text-muted-foreground" data-testid="hmac-selftest-tolerance">
          Janela de tolerância: <code>{result.tolerance_seconds}s</code> (issuedAt ± janela; nonce
          único)
        </div>
      )}

      {(result.failed_phase || result.request_id) && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {result.failed_phase && (
            <Badge
              variant="destructive"
              className="text-[10px]"
              data-testid="hmac-selftest-failed-phase"
            >
              Falha em fase: {result.failed_phase}
            </Badge>
          )}
          {result.request_id && (
            <span
              className="text-[10px] text-muted-foreground"
              data-testid="hmac-selftest-request-id"
            >
              req: {result.request_id.slice(0, 8)}…
            </span>
          )}
        </div>
      )}

      {result.scenarios && result.scenarios.length > 0 && (
        <div className="overflow-hidden rounded-lg border" data-testid="hmac-selftest-scenarios">
          <table className="w-full text-xs">
            <thead className="bg-muted/40 text-muted-foreground">
              <tr>
                <th scope="col" className="px-2 py-1.5 text-left font-medium">
                  Cenário
                </th>
                <th scope="col" className="px-2 py-1.5 text-left font-medium">
                  Esperado
                </th>
                <th scope="col" className="px-2 py-1.5 text-left font-medium">
                  Resultado
                </th>
                <th scope="col" className="px-2 py-1.5 text-left font-medium">
                  Fase
                </th>
                <th scope="col" className="px-2 py-1.5 text-left font-medium">
                  Idade
                </th>
                <th scope="col" className="px-2 py-1.5 text-left font-medium">
                  Detalhe
                </th>
              </tr>
            </thead>
            <tbody>
              {result.scenarios.map((s) => (
                <tr
                  key={s.name}
                  className="border-t"
                  data-testid={`hmac-selftest-scenario-${s.name}`}
                  data-passed={s.passed ? 'true' : 'false'}
                  data-failed-phase={s.failed_phase ?? ''}
                >
                  <td className="px-2 py-1.5">
                    <div className="font-medium">{s.name}</div>
                    <div className="text-[10px] text-muted-foreground">{s.description}</div>
                  </td>
                  <td className="px-2 py-1.5">
                    <Badge variant="outline" className="text-[10px]">
                      {s.expected === 'accept' ? 'aceitar' : 'rejeitar'}
                    </Badge>
                  </td>
                  <td className="px-2 py-1.5">
                    <Badge variant={s.passed ? 'default' : 'destructive'} className="text-[10px]">
                      {s.outcome === 'accept' ? 'aceito' : 'rejeitado'}
                    </Badge>
                  </td>
                  <td className="px-2 py-1.5">
                    {s.failed_phase ? (
                      <Badge variant="destructive" className="text-[10px]" title={s.reason ?? ''}>
                        {s.failed_phase}
                      </Badge>
                    ) : (
                      <span className="text-[10px] text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-2 py-1.5 text-muted-foreground">
                    {s.ageSeconds >= 0 ? `+${s.ageSeconds}s` : `${s.ageSeconds}s`}
                  </td>
                  <td className="px-2 py-1.5 text-muted-foreground">{s.reason ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {result.payload_preview && (
        <div>
          <div className="mb-1 text-xs uppercase text-muted-foreground">
            Payload de teste (modelo)
          </div>
          <pre className="overflow-x-auto rounded bg-muted/40 p-2 text-[11px]">
            {JSON.stringify(result.payload_preview, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
