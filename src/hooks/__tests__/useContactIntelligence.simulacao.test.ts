// ===========================================================================
// Suíte de SIMULAÇÃO — useContactIntelligence (src/hooks/useContactIntelligence.ts)
//
// Regressão do fix 2026-07-31:
//   (a) resolveIdentifier aceita phone com 8-13 dígitos (lookup barato de
//       contact_intelligence roda para qualquer phone >= 8; o guard de LID
//       (14+ ou <10 dígitos) foi movido para o call-site do fallback —
//       evolution_messages NÃO é varrido para LIDs, mas ci ainda é consultado);
//   (b) fallback usa igualdade exata .in(remote_jid, [X@s.whatsapp.net, X@lid]);
//   (c) lê colunas REAIS total_messages / days_since_contact (antes lia
//       total_interactions/last_contact_at que NÃO existem no schema — o
//       fallback rodava SEMPRE e o briefing exibia 0).
//
// Estratégia: resolveIdentifier NÃO é exportado — testamos via comportamento.
// O mock do supabase CAPTURA a cadeia .from().select().or()/.eq()/.in().order()
// .limit().maybeSingle() e devolve resultados configuráveis por tabela.
// ===========================================================================
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { useContactIntelligence } from '@/hooks/useContactIntelligence';

type LogFn = (message: string, ...args: unknown[]) => void;
type QueryResult = { data: unknown; error: unknown };

interface MockChain {
  select: (fields?: string) => MockChain;
  or: (filter: string) => MockChain;
  eq: (column: string, value: unknown) => MockChain;
  in: (column: string, values: unknown[]) => MockChain;
  order: (column: string, options?: { ascending?: boolean }) => MockChain;
  limit: (count?: number) => MockChain;
  abortSignal: (signal: AbortSignal | undefined) => MockChain;
  maybeSingle: () => Promise<QueryResult>;
  // O hook faz `await query` no fallback (query = chain após .in/.eq):
  // a cadeia precisa ser thenable para o destructure { data, error } funcionar.
  then: (
    onfulfilled?: ((value: QueryResult) => QueryResult | PromiseLike<QueryResult>) | null,
    onrejected?: ((reason: unknown) => QueryResult | PromiseLike<QueryResult>) | null
  ) => Promise<QueryResult>;
}

const logMock = vi.hoisted(() => ({
  warn: vi.fn<LogFn>(),
  error: vi.fn<LogFn>(),
  info: vi.fn<LogFn>(),
  debug: vi.fn<LogFn>(),
}));

// Estado compartilhado do mock do supabase: resultados/rejeições por tabela
// + captura de TODAS as chamadas da cadeia (para assert de resolveIdentifier).
const sb = vi.hoisted(() => {
  const results = new Map<string, QueryResult>();
  const rejections = new Map<string, unknown>();
  const calls = {
    from: [] as string[],
    or: [] as string[],
    eq: [] as Array<[string, unknown]>,
    in: [] as Array<[string, unknown[]]>,
    order: [] as Array<[string, { ascending?: boolean } | undefined]>,
    limit: [] as unknown[],
  };
  return {
    results,
    rejections,
    calls,
    setResult(table: string, result: QueryResult) {
      results.set(table, result);
    },
    setRejection(table: string, err: unknown) {
      rejections.set(table, err);
    },
    reset() {
      results.clear();
      rejections.clear();
      calls.from.length = 0;
      calls.or.length = 0;
      calls.eq.length = 0;
      calls.in.length = 0;
      calls.order.length = 0;
      calls.limit.length = 0;
    },
  };
});

vi.mock('@/lib/logger', () => ({ log: logMock }));

// sanitizePostgrestFilter só recebe dígitos (o hook remove não-dígitos antes),
// então identidade é fiel e evita puxar DOMPurify.
vi.mock('@/lib/sanitize', () => ({
  sanitizePostgrestFilter: (input: unknown) => String(input ?? ''),
}));

vi.mock('@/integrations/supabase/client', () => {
  const resolveFor = (table: string): QueryResult =>
    sb.results.get(table) ?? { data: null, error: null };

  const makeChain = (table: string): MockChain => {
    const chain = {} as MockChain;
    chain.select = vi.fn<(fields?: string) => MockChain>(() => chain);
    chain.or = vi.fn<(filter: string) => MockChain>((filter) => {
      sb.calls.or.push(filter);
      return chain;
    });
    chain.eq = vi.fn<(column: string, value: unknown) => MockChain>((column, value) => {
      sb.calls.eq.push([column, value]);
      return chain;
    });
    chain.in = vi.fn<(column: string, values: unknown[]) => MockChain>((column, values) => {
      sb.calls.in.push([column, values]);
      return chain;
    });
    chain.order = vi.fn<(column: string, options?: { ascending?: boolean }) => MockChain>(
      (column, options) => {
        sb.calls.order.push([column, options]);
        return chain;
      }
    );
    chain.limit = vi.fn<(count?: number) => MockChain>((count) => {
      sb.calls.limit.push(count);
      return chain;
    });
    // Espelha o postgrest-js real: .abortSignal() muta e retorna a MESMA
    // instância (não cria um novo builder) — ver RCA 2026-08-22.
    chain.abortSignal = vi.fn<(signal: AbortSignal | undefined) => MockChain>(() => chain);
    chain.maybeSingle = vi.fn<() => Promise<QueryResult>>(() => {
      if (sb.rejections.has(table)) return Promise.reject(sb.rejections.get(table));
      return Promise.resolve(resolveFor(table));
    });
    chain.then = (
      onfulfilled?: ((value: QueryResult) => QueryResult | PromiseLike<QueryResult>) | null,
      onrejected?: ((reason: unknown) => QueryResult | PromiseLike<QueryResult>) | null
    ): Promise<QueryResult> => {
      if (sb.rejections.has(table)) {
        return Promise.reject(sb.rejections.get(table)).then(onfulfilled, onrejected);
      }
      return Promise.resolve(resolveFor(table)).then(onfulfilled, onrejected);
    };
    return chain;
  };

  return {
    supabase: {
      from: vi.fn<(table: string) => MockChain>((table) => {
        sb.calls.from.push(table);
        return makeChain(table);
      }),
    },
  };
});

function renderIntel(input?: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children);
  return { ...renderHook(() => useContactIntelligence(input), { wrapper }), qc };
}

const UUID = '123e4567-e89b-12d3-a456-426614174000';
const PHONE_13 = '5511999999999';
const PHONE_12 = '551199999999';
const PHONE_10 = '1199999999';
const LID_14 = '55119938451813';
const LID_15 = '551199384518134';

describe('useContactIntelligence — simulação (fix 2026-07-31)', () => {
  beforeEach(() => {
    sb.reset();
    logMock.warn.mockClear();
    logMock.error.mockClear();
    logMock.info.mockClear();
    logMock.debug.mockClear();
  });

  describe('resolveIdentifier (via comportamento da query capturada)', () => {
    it('UUID válido: .or com contact_id.eq (sem .in) e fallback por .eq contact_id', async () => {
      // ci vazio → fallback roda para expor o branch uuid do fallback
      sb.setResult('contact_intelligence', { data: null, error: null });
      sb.setResult('evolution_messages', { data: [], error: null });

      const { result } = renderIntel(UUID);
      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(sb.calls.from).toEqual(['contact_intelligence', 'evolution_messages']);
      expect(sb.calls.or).toEqual([`contact_id.eq.${UUID}`]);
      expect(sb.calls.eq).toEqual([['contact_id', UUID]]);
      expect(sb.calls.in).toEqual([]);
    });

    it('phone 13 dígitos: .or phone.eq + fallback .in com @s.whatsapp.net E @lid', async () => {
      sb.setResult('contact_intelligence', { data: null, error: null });
      sb.setResult('evolution_messages', { data: [], error: null });

      const { result } = renderIntel(PHONE_13);
      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(sb.calls.from).toEqual(['contact_intelligence', 'evolution_messages']);
      expect(sb.calls.or).toEqual([`phone.eq.${PHONE_13}`]);
      expect(sb.calls.in).toEqual([
        ['remote_jid', [`${PHONE_13}@s.whatsapp.net`, `${PHONE_13}@lid`]],
      ]);
      expect(sb.calls.eq).toEqual([]);
      expect(sb.calls.order).toEqual([['created_at', { ascending: false }]]);
      expect(sb.calls.limit).toEqual([1, 1]);
    });

    it('phone 10 dígitos: .or phone.eq + fallback .in', async () => {
      sb.setResult('contact_intelligence', { data: null, error: null });
      sb.setResult('evolution_messages', { data: [], error: null });

      const { result } = renderIntel(PHONE_10);
      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(sb.calls.or).toEqual([`phone.eq.${PHONE_10}`]);
      expect(sb.calls.in).toEqual([
        ['remote_jid', [`${PHONE_10}@s.whatsapp.net`, `${PHONE_10}@lid`]],
      ]);
    });

    it('phone 12 dígitos: .or phone.eq + fallback .in', async () => {
      sb.setResult('contact_intelligence', { data: null, error: null });
      sb.setResult('evolution_messages', { data: [], error: null });

      const { result } = renderIntel(PHONE_12);
      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(sb.calls.or).toEqual([`phone.eq.${PHONE_12}`]);
      expect(sb.calls.in).toEqual([
        ['remote_jid', [`${PHONE_12}@s.whatsapp.net`, `${PHONE_12}@lid`]],
      ]);
    });

    it('LID 14 dígitos: ci RODA (lookup barato), fallback evolution_messages PULADO (guard isLid)', async () => {
      // Guard de LID fica no call-site do fallback: o lookup barato em
      // contact_intelligence roda para qualquer phone >= 8 dígitos; apenas a
      // varredura pesada em evolution_messages é pulada para LIDs (14+).
      const { result, qc } = renderIntel(LID_14);
      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(sb.calls.from).toEqual(['contact_intelligence']);
      expect(sb.calls.or).toEqual([`phone.eq.${LID_14}`]);
      expect(sb.calls.in).toEqual([]);
      expect(sb.calls.eq).toEqual([]);
      expect(sb.calls.order).toEqual([]);
      expect(result.current.intelligence?.found).toBe(false);
      expect(result.current.intelligence?.briefing.total_interactions).toBe(0);

      // a query existe (enabled) e mantém retry:false
      const queries = qc.getQueryCache().findAll();
      expect(queries).toHaveLength(1);
      expect(queries[0].options.retry).toBe(false);
    });

    it('LID 15 dígitos: ci RODA, fallback evolution_messages PULADO', async () => {
      const { result } = renderIntel(LID_15);
      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(sb.calls.from).toEqual(['contact_intelligence']);
      expect(sb.calls.or).toEqual([`phone.eq.${LID_15}`]);
      expect(sb.calls.in).toEqual([]);
      expect(sb.calls.eq).toEqual([]);
      expect(result.current.intelligence?.found).toBe(false);
    });

    it('LID 14 dígitos COM dados em contact_intelligence: briefing completo e fallback pulado', async () => {
      // Motivação do guard movido: LIDs com dados em ci NÃO podem ficar sem
      // briefing (27% dos contatos) — só a query pesada é evitada.
      sb.setResult('contact_intelligence', {
        data: { total_messages: 5, days_since_contact: 1 },
        error: null,
      });

      const { result } = renderIntel(LID_14);
      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(sb.calls.from).toEqual(['contact_intelligence']);
      expect(sb.calls.in).toEqual([]);
      expect(result.current.intelligence?.found).toBe(true);
      expect(result.current.intelligence?.briefing.total_interactions).toBe(5);
      expect(result.current.intelligence?.briefing.days_since_last_contact).toBe(1);
    });

    it("'unknown': NENHUMA query (sentinela textual)", async () => {
      const { result } = renderIntel('unknown');
      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(sb.calls.from).toEqual([]);
      expect(sb.calls.or).toEqual([]);
      expect(result.current.intelligence).toBeNull();
    });

    it("string vazia: NENHUMA query (enabled=false)", async () => {
      const { result } = renderIntel('');
      // enabled=false → nunca há fetch; loading já é false no primeiro render
      expect(result.current.loading).toBe(false);
      expect(sb.calls.from).toEqual([]);
      expect(result.current.intelligence).toBeNull();
    });

    it('undefined: NENHUMA query (enabled=false)', async () => {
      const { result } = renderIntel();
      expect(result.current.loading).toBe(false);
      expect(sb.calls.from).toEqual([]);
      expect(result.current.intelligence).toBeNull();
    });

    it('phone 8 dígitos: ci RODA (guard >=8), fallback PULADO (guard isLid <10)', async () => {
      const { result } = renderIntel('55119999');
      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(sb.calls.from).toEqual(['contact_intelligence']);
      expect(sb.calls.or).toEqual(['phone.eq.55119999']);
      expect(sb.calls.in).toEqual([]);
      expect(result.current.intelligence?.found).toBe(false);
    });

    it('phone 7 dígitos: NENHUMA query (abaixo do guard de 8 dígitos)', async () => {
      const { result } = renderIntel('5511999');
      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(sb.calls.from).toEqual([]);
      expect(sb.calls.or).toEqual([]);
      expect(result.current.intelligence).toBeNull();
    });

    it("phone com formatação suja '(11) 99999-9999': normaliza para dígitos e .in", async () => {
      sb.setResult('contact_intelligence', { data: null, error: null });
      sb.setResult('evolution_messages', { data: [], error: null });

      const { result } = renderIntel('(11) 99999-9999');
      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(sb.calls.or).toEqual(['phone.eq.11999999999']);
      expect(sb.calls.in).toEqual([
        ['remote_jid', ['11999999999@s.whatsapp.net', '11999999999@lid']],
      ]);
    });

    it('phone 13 dígitos com contact_intelligence completo: fallback NÃO roda', async () => {
      sb.setResult('contact_intelligence', {
        data: { total_messages: 7, days_since_contact: 2 },
        error: null,
      });

      const { result } = renderIntel(PHONE_13);
      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(sb.calls.from).toEqual(['contact_intelligence']);
      expect(sb.calls.or).toEqual([`phone.eq.${PHONE_13}`]);
      expect(sb.calls.in).toEqual([]);
      expect(sb.calls.eq).toEqual([]);
      expect(sb.calls.limit).toEqual([1]);
      expect(result.current.intelligence?.briefing.total_interactions).toBe(7);
    });
  });

  describe('Mapeamento de colunas reais (total_messages / days_since_contact)', () => {
    it('raw com total_messages=42 → briefing.total_interactions 42 (bug antigo dava 0)', async () => {
      sb.setResult('contact_intelligence', {
        data: { total_messages: 42, days_since_contact: 5 },
        error: null,
      });

      const { result } = renderIntel(PHONE_13);
      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.intelligence?.found).toBe(true);
      expect(result.current.intelligence?.briefing.total_interactions).toBe(42);
    });

    it('raw com days_since_contact=5 → days_since_last_contact 5', async () => {
      sb.setResult('contact_intelligence', {
        data: { total_messages: 42, days_since_contact: 5 },
        error: null,
      });

      const { result } = renderIntel(PHONE_13);
      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.intelligence?.briefing.days_since_last_contact).toBe(5);
    });

    it('NÃO chama evolution_messages quando total_messages > 0 E days_since_contact != null', async () => {
      sb.setResult('contact_intelligence', {
        data: { total_messages: 42, days_since_contact: 5 },
        error: null,
      });

      const { result } = renderIntel(UUID);
      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(sb.calls.from).toEqual(['contact_intelligence']);
      expect(sb.calls.order).toEqual([]);
    });

    it('raw null → fallback roda (from evolution_messages)', async () => {
      sb.setResult('contact_intelligence', { data: null, error: null });
      sb.setResult('evolution_messages', { data: [], error: null });

      const { result } = renderIntel(UUID);
      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(sb.calls.from).toEqual(['contact_intelligence', 'evolution_messages']);
      expect(sb.calls.order).toEqual([['created_at', { ascending: false }]]);
      expect(sb.calls.limit).toEqual([1, 1]);
    });

    it('raw com total_messages=0 e days_since_contact=null → fallback roda', async () => {
      sb.setResult('contact_intelligence', {
        data: { total_messages: 0, days_since_contact: null },
        error: null,
      });
      sb.setResult('evolution_messages', { data: [], error: null });

      const { result } = renderIntel(PHONE_13);
      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(sb.calls.from).toEqual(['contact_intelligence', 'evolution_messages']);
      expect(sb.calls.in).toEqual([
        ['remote_jid', [`${PHONE_13}@s.whatsapp.net`, `${PHONE_13}@lid`]],
      ]);
    });

    it('F1: total_messages=0 mas days_since_contact=5 → fallback NAO roda (query pesada pulada)', async () => {
      // F1 (revisao Claude): o fallback so tem efeito em lastAt; com
      // days_since_contact preenchido, lastAt existe e a query de 23+ particoes
      // seria trabalho jogado fora.
      sb.setResult('contact_intelligence', {
        data: { total_messages: 0, days_since_contact: 5 },
        error: null,
      });

      const { result } = renderIntel(PHONE_13);
      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(sb.calls.from).toEqual(['contact_intelligence']);
      expect(sb.calls.in).toEqual([]);
      expect(result.current.intelligence?.briefing.days_since_last_contact).toBe(5);
      expect(result.current.intelligence?.briefing.total_interactions).toBe(0);
    });

    it('total_messages>0 mas days_since_contact=null → fallback roda e days vem do created_at', async () => {
      sb.setResult('contact_intelligence', {
        data: { total_messages: 42, days_since_contact: null },
        error: null,
      });
      const created = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
      sb.setResult('evolution_messages', { data: [{ created_at: created }], error: null });

      const { result } = renderIntel(PHONE_13);
      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(sb.calls.from).toEqual(['contact_intelligence', 'evolution_messages']);
      expect(result.current.intelligence?.briefing.total_interactions).toBe(42);
      expect(result.current.intelligence?.briefing.days_since_last_contact).toBe(3);
    });

    it('raw null + fallback sem linhas → found=false, total_interactions=0', async () => {
      sb.setResult('contact_intelligence', { data: null, error: null });
      sb.setResult('evolution_messages', { data: [], error: null });

      const { result } = renderIntel(PHONE_13);
      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.intelligence?.found).toBe(false);
      expect(result.current.intelligence?.briefing.total_interactions).toBe(0);
      expect(result.current.intelligence?.briefing.days_since_last_contact).toBeNull();
    });

    it('raw null + fallback com 1 linha → found=false (comportamento ATUAL: found = !!raw || total_messages>0) mas days vem do created_at', async () => {
      // NOTA: o brief pedia "found=true" com 1 linha no fallback, mas o hook
      // atual calcula found = !!raw || total_messages > 0 — linhas do fallback
      // NÃO tornam found=true. Este teste documenta o comportamento REAL do
      // código (fazer found=true exigiria mudar o hook).
      sb.setResult('contact_intelligence', { data: null, error: null });
      const created = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
      sb.setResult('evolution_messages', { data: [{ created_at: created }], error: null });

      const { result } = renderIntel(PHONE_10);
      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.intelligence?.found).toBe(false);
      expect(result.current.intelligence?.briefing.days_since_last_contact).toBe(2);
      // os dados do fallback SÃO usados no briefing mesmo com found=false
      expect(result.current.intelligence?.briefing.opening_tip).toBe(
        'Inicie com pergunta aberta relacionada à necessidade principal.'
      );
    });

    it('raw completo → briefing rico (risk_alert, relationship_score, triggers, rapport, churn, disc)', async () => {
      sb.setResult('contact_intelligence', {
        data: {
          total_messages: 12,
          days_since_contact: 3,
          engagement_score: 80,
          sentiment: 'positive',
          risk_level: 'high',
          disc_profile: 'D',
          predicted_value: 1500,
        },
        error: null,
      });

      const { result } = renderIntel(PHONE_13);
      await waitFor(() => expect(result.current.loading).toBe(false));

      const intel = result.current.intelligence;
      expect(intel?.found).toBe(true);
      expect(intel?.briefing.total_interactions).toBe(12);
      expect(intel?.briefing.days_since_last_contact).toBe(3);
      expect(intel?.briefing.relationship_score).toBe(80);
      expect(intel?.briefing.risk_alert).toBe(
        'Alto risco de churn detectado — priorize esta conversa.'
      );
      expect(intel?.briefing.opening_tip).toBe(
        'Inicie com pergunta aberta relacionada à necessidade principal.'
      );
      expect(intel?.triggers.map((t) => t.trigger_name)).toEqual([
        'Compromisso',
        'Escassez',
        'Reciprocidade',
        'Autoridade',
      ]);
      expect(intel?.rapport.suggestions?.[0]).toBe(
        'Reforce o clima positivo com uma pergunta aberta sobre o dia dele.'
      );
      expect(intel?.churn?.risk_level).toBe('high');
      expect(intel?.churn?.churn_probability).toBe(20);
      expect(intel?.disc_tips?.profile).toBe('D');
      expect(intel?.disc_tips?.name).toBe('Dominante');
      expect(intel?.best_times).toEqual([]);
      // dados completos → sem fallback
      expect(sb.calls.from).toEqual(['contact_intelligence']);
    });
  });

  describe('Fallback evolution_messages — erros e timeouts', () => {
    it('fallback com erro (campo error) → log.warn e briefing 0, sem estourar', async () => {
      sb.setResult('contact_intelligence', { data: null, error: null });
      sb.setResult('evolution_messages', {
        data: null,
        error: { message: 'relation "evolution_messages" does not exist' },
      });

      const { result } = renderIntel(PHONE_13);
      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(logMock.warn).toHaveBeenCalledWith(
        'messages stats lookup failed:',
        'relation "evolution_messages" does not exist'
      );
      expect(logMock.error).not.toHaveBeenCalled();
      expect(result.current.intelligence).not.toBeNull();
      expect(result.current.intelligence?.found).toBe(false);
      expect(result.current.intelligence?.briefing.total_interactions).toBe(0);
    });

    it('fallback com timeout (error.message contendo "timeout") → log.error, NÃO warn', async () => {
      // NOTA: o regex do error-field é /timeout|aborted|fetch/i — só "timeout"
      // justaposto (ou aborted/fetch) cai em log.error neste caminho. A
      // mensagem real 'Supabase request timed out' (com espaço em "timed out")
      // NÃO casa — coberto pelo teste do gap abaixo.
      sb.setResult('contact_intelligence', { data: null, error: null });
      sb.setResult('evolution_messages', {
        data: null,
        error: { message: 'Supabase request timed out after 12000ms (fetch timeout)' },
      });

      const { result } = renderIntel(PHONE_13);
      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(logMock.error).toHaveBeenCalledWith(
        'messages stats lookup timed out (evolution_messages scan):',
        expect.objectContaining({ message: expect.stringContaining('timeout') })
      );
      expect(logMock.warn).not.toHaveBeenCalled();
    });

    it('GAP real: error.message "Supabase request timed out" (com espaço) no error-field → log.warn, não log.error', async () => {
      // O DOMException do boundedFetch do client.ts tem message 'Supabase
      // request timed out' — "timed out" com espaço NÃO casa /timeout/i do
      // error-field (só o isTimeoutError do catch pega 'timed ?out'). No
      // caminho error-field (postgrest-js nunca lança), isso vira warn.
      sb.setResult('contact_intelligence', { data: null, error: null });
      sb.setResult('evolution_messages', {
        data: null,
        error: { message: 'Supabase request timed out' },
      });

      const { result } = renderIntel(PHONE_13);
      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(logMock.warn).toHaveBeenCalledWith(
        'messages stats lookup failed:',
        'Supabase request timed out'
      );
      expect(logMock.error).not.toHaveBeenCalled();
    });

    it("fallback com error.message 'Failed to fetch' → log.error (regex aborted|fetch)", async () => {
      sb.setResult('contact_intelligence', { data: null, error: null });
      sb.setResult('evolution_messages', {
        data: null,
        error: { message: 'Failed to fetch' },
      });

      const { result } = renderIntel(PHONE_13);
      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(logMock.error).toHaveBeenCalledWith(
        'messages stats lookup timed out (evolution_messages scan):',
        expect.objectContaining({ message: 'Failed to fetch' })
      );
      expect(logMock.warn).not.toHaveBeenCalled();
    });

    it('fallback que LANÇA TimeoutError → log.error (isTimeoutError no catch)', async () => {
      sb.setResult('contact_intelligence', { data: null, error: null });
      sb.setRejection(
        'evolution_messages',
        Object.assign(new Error('Supabase request timed out'), { name: 'TimeoutError' })
      );

      const { result } = renderIntel(PHONE_13);
      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(logMock.error).toHaveBeenCalledWith(
        'messages stats lookup timed out (evolution_messages scan):',
        expect.any(Error)
      );
      expect(logMock.warn).not.toHaveBeenCalled();
      // não estourou: briefing degradado
      expect(result.current.intelligence).not.toBeNull();
      expect(result.current.intelligence?.briefing.total_interactions).toBe(0);
    });

    it('fallback que LANÇA erro genérico → log.warn "skipped" e não estoura', async () => {
      sb.setResult('contact_intelligence', { data: null, error: null });
      sb.setRejection('evolution_messages', new Error('boom'));

      const { result } = renderIntel(PHONE_13);
      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(logMock.warn).toHaveBeenCalledWith(
        'messages stats lookup skipped:',
        expect.any(Error)
      );
      expect(logMock.error).not.toHaveBeenCalled();
      expect(result.current.intelligence).not.toBeNull();
      expect(result.current.intelligence?.found).toBe(false);
    });

    it('contact_intelligence com erro no campo error → log.warn e fallback RODA', async () => {
      sb.setResult('contact_intelligence', {
        data: null,
        error: { message: 'invalid input syntax for type uuid' },
      });
      sb.setResult('evolution_messages', { data: [], error: null });

      const { result } = renderIntel(PHONE_13);
      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(logMock.warn).toHaveBeenCalledWith(
        'contact_intelligence lookup failed:',
        'invalid input syntax for type uuid'
      );
      expect(sb.calls.from).toEqual(['contact_intelligence', 'evolution_messages']);
    });

    it('contact_intelligence que LANÇA → log.warn "threw" e fallback RODA', async () => {
      sb.setRejection('contact_intelligence', new Error('network down'));
      sb.setResult('evolution_messages', { data: [], error: null });

      const { result } = renderIntel(PHONE_13);
      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(logMock.warn).toHaveBeenCalledWith(
        'contact_intelligence lookup threw:',
        expect.any(Error)
      );
      expect(sb.calls.from).toEqual(['contact_intelligence', 'evolution_messages']);
    });
  });

  describe('useQuery config', () => {
    it('retry:false, staleTime 5min, gcTime 30min e queryKey estável', async () => {
      sb.setResult('contact_intelligence', {
        data: { total_messages: 1, days_since_contact: 1 },
        error: null,
      });

      const { result, qc } = renderIntel(PHONE_13);
      await waitFor(() => expect(result.current.loading).toBe(false));

      const queries = qc.getQueryCache().findAll();
      expect(queries).toHaveLength(1);
      const query = queries[0];
      expect(query.queryKey).toEqual(['contact-intelligence-view', PHONE_13]);
      expect(query.options.retry).toBe(false);
      expect(query.options.gcTime).toBe(30 * 60_000);
      // staleTime vive no observer (QueryObserverOptions); Query.options
      // (cache-level) não o expõe na v5
      expect(query.observers[0].options.staleTime).toBe(5 * 60_000);
    });
  });
});
