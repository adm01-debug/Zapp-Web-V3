/**
 * CONTRATO REAL — DemandForecast (Etapa 66.6 / sim3/sim-metricas.md §d).
 *
 * Wire esperado:
 *  1. `supabase.rpc('fn_demand_forecast', ...)` → série determinística:
 *     { d: string, kind: 'actual' | 'forecast', dow: number, value: number }[]
 *     (7 dias reais `kind='actual'` + 7 dias previstos `kind='forecast'`).
 *  2. "Msgs previstas" = SUM(value) dos registros kind='forecast' — número derivado
 *     dos dados da RPC, NUNCA de Math.random (remover ruído fabricado, sim3 §d L190).
 *  3. Render determinístico: mesmo mock => mesmos números (prova de não-aleatoriedade).
 *
 * Estado em 2026-08-17 10:30: executor ainda NÃO wirou a RPC (componente consome
 * fetchContactMessagesForHeatmap / sem série prevista) — testes devem falhar RED.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

// ---- mocks hoisted ----
const rpcMock = vi.hoisted(() => vi.fn());
const fromMock = vi.hoisted(() => vi.fn());

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: (...args: unknown[]) => rpcMock(...args),
    from: (...args: unknown[]) => fromMock(...args),
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } }, error: null }),
    },
  },
}));

// Convenção do repo (ver PerformanceMonitor.test.tsx): recharts stubado em testes.
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="chart">{children}</div>
  ),
  ComposedChart: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Bar: () => <div />,
  Line: () => <div />,
  XAxis: () => <div />,
  YAxis: () => <div />,
  CartesianGrid: () => <div />,
  Tooltip: () => <div />,
}));

vi.mock('@/lib/logger');

import { DemandForecast } from '@/components/reports/DemandForecast';

/**
 * Série determinística de 14 linhas: 7 reais (kind='actual') + 7 previstas.
 * Soma dos previstos = 11+13+17+19+23+29+31 = 143 (número-alvo do teste).
 */
const SERIES = [
  { d: '2026-08-10', kind: 'actual', dow: 1, value: 4 },
  { d: '2026-08-11', kind: 'actual', dow: 2, value: 6 },
  { d: '2026-08-12', kind: 'actual', dow: 3, value: 8 },
  { d: '2026-08-13', kind: 'actual', dow: 4, value: 10 },
  { d: '2026-08-14', kind: 'actual', dow: 5, value: 7 },
  { d: '2026-08-15', kind: 'actual', dow: 6, value: 3 },
  { d: '2026-08-16', kind: 'actual', dow: 0, value: 2 },
  { d: '2026-08-17', kind: 'forecast', dow: 1, value: 11 },
  { d: '2026-08-18', kind: 'forecast', dow: 2, value: 13 },
  { d: '2026-08-19', kind: 'forecast', dow: 3, value: 17 },
  { d: '2026-08-20', kind: 'forecast', dow: 4, value: 19 },
  { d: '2026-08-21', kind: 'forecast', dow: 5, value: 23 },
  { d: '2026-08-22', kind: 'forecast', dow: 6, value: 29 },
  { d: '2026-08-23', kind: 'forecast', dow: 0, value: 31 },
];

/** Soma dos previstos (contrato: "Msgs previstas" = SUM(forecast)). */
const FORECAST_TOTAL = SERIES.filter((r) => r.kind === 'forecast').reduce((s, r) => s + r.value, 0);

function setupMocks() {
  // fallback para fetchContactMessagesForHeatmap (caso o componente ainda o use p/ picos)
  fromMock.mockImplementation(() => ({
    select: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue({ data: [], error: null }),
  }));
  rpcMock.mockImplementation((name: string) =>
    name === 'fn_demand_forecast'
      ? Promise.resolve({ data: SERIES, error: null })
      : Promise.resolve({ data: null, error: null }),
  );
}

describe('DemandForecast — dados da RPC fn_demand_forecast (sem Math.random)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('usa a RPC fn_demand_forecast e renderiza o total previsto derivado da série do mock', async () => {
    render(<DemandForecast />);

    await waitFor(() => expect(rpcMock).toHaveBeenCalled());
    expect(rpcMock.mock.calls[0][0]).toBe('fn_demand_forecast');

    // título + card de resumo presentes
    expect(await screen.findByText('Previsão de Demanda (7 dias)')).toBeInTheDocument();
    expect(screen.getByText('Msgs previstas')).toBeInTheDocument();

    // total previsto = soma EXATA da série mockada (prova de determinismo)
    expect(screen.getByText(String(FORECAST_TOTAL))).toBeInTheDocument();
  });

  it('NUNCA usa Math.random (não determinístico) para gerar a previsão', async () => {
    const randomSpy = vi.spyOn(Math, 'random');

    render(<DemandForecast />);

    // aguarda o load terminar (RPC chamada + total renderizado)
    await waitFor(() => expect(rpcMock).toHaveBeenCalled());
    await screen.findByText(String(FORECAST_TOTAL));

    expect(randomSpy).not.toHaveBeenCalled();
    // nenhum valor inválido vazando para a UI
    expect(document.body.textContent).not.toContain('NaN');
  });
});
