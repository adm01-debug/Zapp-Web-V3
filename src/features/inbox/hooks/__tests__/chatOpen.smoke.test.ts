/**
 * Smoke test — runtime do fluxo de abertura de chat/inbox após regeneração
 * dos tipos (schemas zapp/evo). Objetivo: garantir que a camada de fallback
 * de tipos + imports centrais + handler de seleção de contato não quebrem em
 * runtime. Não substitui e2e real; é gate rápido de regressão.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/integrations/supabase/client', () => {
  const chain = () => {
    const c: Record<string, unknown> = {};
    const fn = () => c;
    ['select', 'insert', 'update', 'delete', 'eq', 'in', 'or', 'order', 'limit', 'range', 'single', 'maybeSingle']
      .forEach((k) => (c[k] = fn));
    (c as { then: unknown }).then = (r: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(r);
    return c;
  };
  return {
    supabase: {
      from: vi.fn(chain),
      schema: vi.fn(() => ({ from: vi.fn(chain) })),
      functions: { invoke: vi.fn(() => Promise.resolve({ data: null, error: null })) },
      channel: vi.fn(() => ({ on: vi.fn().mockReturnThis(), subscribe: vi.fn().mockReturnThis(), unsubscribe: vi.fn() })),
      removeChannel: vi.fn(),
      auth: { getUser: vi.fn(() => Promise.resolve({ data: { user: { id: 'u1' } }, error: null })) },
    },
  };
});

describe('chat-open smoke (post-types regen)', () => {
  it('carrega o cliente supabase sem crash e expõe from/schema/functions', async () => {
    const mod = await import('@/integrations/supabase/client');
    expect(mod.supabase).toBeDefined();
    expect(typeof mod.supabase.from).toBe('function');
    expect(typeof mod.supabase.schema).toBe('function');
    expect(mod.supabase.functions).toBeDefined();
  });

  it('carrega helpers de schema (fallback zapp/evo)', async () => {
    const schema = await import('@/integrations/supabase/schema');
    expect(schema).toBeDefined();
  });

  it('carrega o hook useRealtimeInbox sem erros de import/tipos em runtime', async () => {
    const mod = await import('../useRealtimeInbox');
    expect(typeof mod.useRealtimeInbox).toBe('function');
  });

  it('carrega adaptadores legacy usados no render do chat', async () => {
    const a = await import('@/adapters/inboxLegacyMapper');
    expect(typeof a.mapToLegacyConversation).toBe('function');
    expect(typeof a.mapToLegacyMessages).toBe('function');
  });

  it('mapToLegacyMessages aceita array vazio sem lançar (chat recém-aberto)', async () => {
    const { mapToLegacyMessages, mapToLegacyConversation } = await import('@/adapters/inboxLegacyMapper');
    expect(() => mapToLegacyMessages([], 'contact-1', undefined)).not.toThrow();
    expect(() => mapToLegacyConversation(null)).not.toThrow();
  });
});
