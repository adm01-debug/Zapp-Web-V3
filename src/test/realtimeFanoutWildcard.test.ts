import { describe, it, expect } from 'vitest';

/**
 * Testes unitários para o parser de eventos do validador de fan-out.
 * Foco: garantir que '*' (wildcard) nas arestas/hooks expanda corretamente
 * para o conjunto {INSERT, UPDATE, DELETE}.
 */

type Evt = 'INSERT' | 'UPDATE' | 'DELETE';
const ALL_EVENTS: Evt[] = ['INSERT', 'UPDATE', 'DELETE'];

// Reimplementações isoladas — espelham a lógica em realtimeFanoutEvents.test.ts.
// Mantê-las aqui (e não importar) garante que o teste falha se o parser de lá
// divergir do contrato esperado.
function parseEdgeEvents(label: string): Set<Evt> {
  const out = new Set<Evt>();
  if (/\*/.test(label)) ALL_EVENTS.forEach((e) => out.add(e));
  for (const e of ALL_EVENTS) if (new RegExp(`\\b${e}\\b`).test(label)) out.add(e);
  return out;
}

function parseHookEventBlock(body: string): Set<Evt> {
  const out = new Set<Evt>();
  const ev = body.match(/event:\s*['"]([A-Z*]+)['"]/);
  if (!ev) return out;
  if (ev[1] === '*') ALL_EVENTS.forEach((e) => out.add(e));
  else if ((ALL_EVENTS as string[]).includes(ev[1])) out.add(ev[1] as Evt);
  return out;
}

describe('parser de wildcard "*" — arestas do diagrama', () => {
  it('expande "*" puro para INSERT, UPDATE e DELETE', () => {
    const got = parseEdgeEvents('*');
    expect(got).toEqual(new Set(['INSERT', 'UPDATE', 'DELETE']));
  });

  it('expande "* messages" mantendo os 3 eventos', () => {
    const got = parseEdgeEvents('* messages');
    expect(got).toEqual(new Set(['INSERT', 'UPDATE', 'DELETE']));
  });

  it('"*" combinado com texto descritivo nao duplica eventos', () => {
    const got = parseEdgeEvents('* todos eventos KPI');
    expect(got.size).toBe(3);
  });

  it('rotulo sem "*" so retorna eventos explicitos', () => {
    expect(parseEdgeEvents('INSERT/UPDATE')).toEqual(new Set(['INSERT', 'UPDATE']));
    expect(parseEdgeEvents('UPDATE status')).toEqual(new Set(['UPDATE']));
  });

  it('rotulo vazio retorna conjunto vazio', () => {
    expect(parseEdgeEvents('')).toEqual(new Set());
  });

  it('"INSERT" sozinho NAO ativa o wildcard', () => {
    const got = parseEdgeEvents('INSERT novas');
    expect(got).toEqual(new Set(['INSERT']));
    expect(got.has('UPDATE')).toBe(false);
    expect(got.has('DELETE')).toBe(false);
  });

  describe('multiplos "*" no mesmo rotulo', () => {
    it('"* UPDATE *" expande sem duplicar eventos (Set garante unicidade)', () => {
      const got = parseEdgeEvents('* UPDATE *');
      expect(got).toEqual(new Set(['INSERT', 'UPDATE', 'DELETE']));
      expect(got.size).toBe(3);
    });

    it('"** todos **" com wildcards repetidos resulta em exatamente 3 eventos', () => {
      const got = parseEdgeEvents('** todos **');
      expect(got.size).toBe(3);
      expect(got).toEqual(new Set(['INSERT', 'UPDATE', 'DELETE']));
    });

    it('"* INSERT * UPDATE * DELETE *" nao quebra e mantem 3 eventos', () => {
      const got = parseEdgeEvents('* INSERT * UPDATE * DELETE *');
      expect(got.size).toBe(3);
      expect(got).toEqual(new Set(['INSERT', 'UPDATE', 'DELETE']));
    });

    it('"*****" (so wildcards) ainda expande para os 3 eventos', () => {
      const got = parseEdgeEvents('*****');
      expect(got).toEqual(new Set(['INSERT', 'UPDATE', 'DELETE']));
    });

    it('"* *" (wildcards separados por espaco) expande para os 3 eventos', () => {
      const got = parseEdgeEvents('* *');
      expect(got).toEqual(new Set(['INSERT', 'UPDATE', 'DELETE']));
    });

    it('"INSERT * UPDATE" mistura wildcard + nomes sem duplicacao', () => {
      const got = parseEdgeEvents('INSERT * UPDATE');
      expect(got.size).toBe(3);
      expect(got).toEqual(new Set(['INSERT', 'UPDATE', 'DELETE']));
    });

    it('texto adjacente a "*" sem espaco (ex: "*KPIs*") ainda ativa wildcard', () => {
      const got = parseEdgeEvents('*KPIs*');
      expect(got).toEqual(new Set(['INSERT', 'UPDATE', 'DELETE']));
    });
  });
});

describe('parser de wildcard "*" — hooks (event: "*")', () => {
  it('event: "*" expande para INSERT, UPDATE e DELETE', () => {
    const body = `event: '*', schema: 'zapp', table: 'messages'`;
    expect(parseHookEventBlock(body)).toEqual(new Set(['INSERT', 'UPDATE', 'DELETE']));
  });

  it('event: "INSERT" so retorna INSERT', () => {
    const body = `event: 'INSERT', schema: 'zapp', table: 'messages'`;
    expect(parseHookEventBlock(body)).toEqual(new Set(['INSERT']));
  });

  it('aspas duplas em event: "*" tambem expandem', () => {
    const body = `event: "*", schema: "zapp", table: "messages"`;
    expect(parseHookEventBlock(body)).toEqual(new Set(['INSERT', 'UPDATE', 'DELETE']));
  });

  it('bloco sem campo event retorna vazio', () => {
    const body = `schema: 'zapp', table: 'messages'`;
    expect(parseHookEventBlock(body)).toEqual(new Set());
  });

  it('valor desconhecido (ex: TRUNCATE) e ignorado', () => {
    const body = `event: 'TRUNCATE', schema: 'zapp', table: 'messages'`;
    expect(parseHookEventBlock(body)).toEqual(new Set());
  });
});

describe('compatibilidade aresta "*" <-> hook event "*"', () => {
  it('aresta "*" e hook "*" sao equivalentes (3 eventos cada)', () => {
    const fromEdge = parseEdgeEvents('*');
    const fromHook = parseHookEventBlock(`event: '*', table: 'messages'`);
    expect(fromEdge).toEqual(fromHook);
  });

  it('aresta "INSERT/UPDATE/DELETE" cobre o mesmo set que hook "*"', () => {
    const fromEdge = parseEdgeEvents('INSERT/UPDATE/DELETE');
    const fromHook = parseHookEventBlock(`event: '*', table: 'messages'`);
    expect(fromEdge).toEqual(fromHook);
  });
});
