/**
 * Tests for MCP tool handlers: whoami, list-connections, list-contacts.
 *
 * @lovable.dev/mcp-js is mocked so that defineTool() returns the plain object
 * passed to it, making the handler accessible directly.
 *
 * @supabase/supabase-js createClient is mocked per-test to control DB responses.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoisted mocks ─────────────────────────────────────────────────────────────
const mockDefineTool = vi.hoisted(() => vi.fn((def: unknown) => def));
const mockDefineMcp = vi.hoisted(() => vi.fn((def: unknown) => def));
const mockCreateClient = vi.hoisted(() => vi.fn());

vi.mock('@lovable.dev/mcp-js', () => ({
  defineTool: mockDefineTool,
  defineMcp: mockDefineMcp,
  auth: { oauth: { issuer: () => ({}) } },
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: mockCreateClient,
}));

// ── Import SUT AFTER mocks ────────────────────────────────────────────────────
import whoamiTool from '../tools/whoami';
import listConnectionsTool from '../tools/list-connections';
import listContactsTool from '../tools/list-contacts';

// ── Type helpers ──────────────────────────────────────────────────────────────
type Handler<TInput, TResult> = (
  input: TInput,
  ctx: MockCtx
) => TResult | Promise<TResult>;

interface ToolDef<TInput = Record<string, unknown>, TResult = unknown> {
  name: string;
  handler: Handler<TInput, TResult>;
}

interface MockCtx {
  isAuthenticated: () => boolean;
  getUserId: () => string;
  getUserEmail?: () => string | null;
  getClientId?: () => string | null;
  getToken: () => string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function makeCtx(overrides: Partial<MockCtx> = {}): MockCtx {
  return {
    isAuthenticated: () => true,
    getUserId: () => 'user-123',
    getUserEmail: () => 'user@test.com',
    getClientId: () => 'client-abc',
    getToken: () => 'token-xyz',
    ...overrides,
  };
}

function makeDbChain(result: { data: unknown; error: unknown | null }) {
  const chain = {
    from: () => chain,
    select: () => chain,
    limit: () => Promise.resolve(result),
    eq: () => chain,
    or: () => chain,
  };
  return chain;
}

// ── Setup ─────────────────────────────────────────────────────────────────────
beforeEach(() => {
  vi.clearAllMocks();
  mockCreateClient.mockReturnValue(makeDbChain({ data: [], error: null }));
});

// ── whoami ────────────────────────────────────────────────────────────────────
describe('whoami tool — handler', () => {
  const tool = whoamiTool as unknown as ToolDef;

  it('returns isError:true when not authenticated', () => {
    const ctx = makeCtx({ isAuthenticated: () => false });
    const result = tool.handler({}, ctx) as { isError: boolean; content: { text: string }[] };
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('autenticado');
  });

  it('returns user_id, email, and client_id when authenticated', () => {
    const ctx = makeCtx();
    const result = tool.handler({}, ctx) as { structuredContent: Record<string, unknown> };
    expect(result.structuredContent).toEqual({
      user_id: 'user-123',
      email: 'user@test.com',
      client_id: 'client-abc',
    });
  });

  it('returns null for email when getUserEmail is undefined', () => {
    const ctx = makeCtx({ getUserEmail: undefined });
    const result = tool.handler({}, ctx) as { structuredContent: Record<string, unknown> };
    expect(result.structuredContent.email).toBeNull();
  });

  it('returns null for client_id when getClientId is undefined', () => {
    const ctx = makeCtx({ getClientId: undefined });
    const result = tool.handler({}, ctx) as { structuredContent: Record<string, unknown> };
    expect(result.structuredContent.client_id).toBeNull();
  });

  it('includes JSON-stringified payload in content text', () => {
    const ctx = makeCtx();
    const result = tool.handler({}, ctx) as { content: { text: string }[] };
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.user_id).toBe('user-123');
  });
});

// ── list-connections ──────────────────────────────────────────────────────────
describe('list_whatsapp_connections tool — handler', () => {
  const tool = listConnectionsTool as unknown as ToolDef<{ limit?: number }, unknown>;

  it('returns isError:true when not authenticated', async () => {
    const ctx = makeCtx({ isAuthenticated: () => false });
    const result = await tool.handler({}, ctx) as { isError: boolean };
    expect(result.isError).toBe(true);
  });

  it('returns connections in structuredContent on success', async () => {
    const data = [{ id: '1', name: 'Zap', status: 'connected' }];
    mockCreateClient.mockReturnValue(makeDbChain({ data, error: null }));
    const result = await tool.handler({}, makeCtx()) as {
      structuredContent: { connections: unknown[] };
    };
    expect(result.structuredContent.connections).toEqual(data);
  });

  it('uses default limit of 20 when none provided', async () => {
    const limitSpy = vi.fn().mockResolvedValue({ data: [], error: null });
    const chain = {
      from: () => chain,
      select: () => chain,
      limit: limitSpy,
    };
    mockCreateClient.mockReturnValue(chain);
    await tool.handler({}, makeCtx());
    expect(limitSpy).toHaveBeenCalledWith(20);
  });

  it('respects the limit parameter when provided', async () => {
    const limitSpy = vi.fn().mockResolvedValue({ data: [], error: null });
    const chain = { from: () => chain, select: () => chain, limit: limitSpy };
    mockCreateClient.mockReturnValue(chain);
    await tool.handler({ limit: 5 }, makeCtx());
    expect(limitSpy).toHaveBeenCalledWith(5);
  });

  it('returns isError:true when supabase returns an error', async () => {
    mockCreateClient.mockReturnValue(
      makeDbChain({ data: null, error: { message: 'permission denied' } })
    );
    const result = await tool.handler({}, makeCtx()) as { isError: boolean; content: { text: string }[] };
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('permission denied');
  });

  it('creates supabase client with Bearer token from ctx', async () => {
    await tool.handler({}, makeCtx({ getToken: () => 'my-token' }));
    expect(mockCreateClient).toHaveBeenCalledTimes(1);
    const [,, opts] = mockCreateClient.mock.calls[0] as [unknown, unknown, Record<string, unknown>];
    expect((opts.global as { headers: Record<string, string> }).headers.Authorization).toBe('Bearer my-token');
  });
});

// ── list-contacts (search_contacts) ──────────────────────────────────────────
describe('search_contacts tool — handler', () => {
  const tool = listContactsTool as unknown as ToolDef<{ query: string; limit?: number }, unknown>;

  it('returns isError:true when not authenticated', async () => {
    const ctx = makeCtx({ isAuthenticated: () => false });
    const result = await tool.handler({ query: 'test' }, ctx) as { isError: boolean };
    expect(result.isError).toBe(true);
  });

  it('returns contacts in structuredContent on success', async () => {
    const data = [{ id: '1', name: 'Alice', phone_number: '+5511999' }];
    const orSpy = vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue({ data, error: null }) });
    const chain = { from: () => chain, select: () => chain, or: orSpy };
    mockCreateClient.mockReturnValue(chain);
    const result = await tool.handler({ query: 'Alice' }, makeCtx()) as {
      structuredContent: { contacts: unknown[] };
    };
    expect(result.structuredContent.contacts).toEqual(data);
  });

  it('uses default limit of 20 when none provided', async () => {
    const limitSpy = vi.fn().mockResolvedValue({ data: [], error: null });
    const chain = { from: () => chain, select: () => chain, or: () => ({ limit: limitSpy }) };
    mockCreateClient.mockReturnValue(chain);
    await tool.handler({ query: 'test' }, makeCtx());
    expect(limitSpy).toHaveBeenCalledWith(20);
  });

  it('respects the limit parameter when provided', async () => {
    const limitSpy = vi.fn().mockResolvedValue({ data: [], error: null });
    const chain = { from: () => chain, select: () => chain, or: () => ({ limit: limitSpy }) };
    mockCreateClient.mockReturnValue(chain);
    await tool.handler({ query: 'test', limit: 10 }, makeCtx());
    expect(limitSpy).toHaveBeenCalledWith(10);
  });

  it('returns isError:true when supabase returns an error', async () => {
    const chain = {
      from: () => chain,
      select: () => chain,
      or: () => ({ limit: vi.fn().mockResolvedValue({ data: null, error: { message: 'fail' } }) }),
    };
    mockCreateClient.mockReturnValue(chain);
    const result = await tool.handler({ query: 'test' }, makeCtx()) as {
      isError: boolean;
      content: { text: string }[];
    };
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('fail');
  });
});

// ── search_contacts — safeQuery sanitization ──────────────────────────────────
describe('search_contacts — safeQuery sanitization', () => {
  const tool = listContactsTool as unknown as ToolDef<{ query: string }, unknown>;

  let capturedOrFilter: string;

  beforeEach(() => {
    capturedOrFilter = '';
    const orSpy = vi.fn((filter: string) => {
      capturedOrFilter = filter;
      return { limit: vi.fn().mockResolvedValue({ data: [], error: null }) };
    });
    const chain = { from: () => chain, select: () => chain, or: orSpy };
    mockCreateClient.mockReturnValue(chain);
  });

  it('passes plain query through unchanged', async () => {
    await tool.handler({ query: 'Alice' }, makeCtx());
    expect(capturedOrFilter).toContain('%Alice%');
  });

  it('strips double-quote metacharacters', async () => {
    await tool.handler({ query: 'test"inject' }, makeCtx());
    expect(capturedOrFilter).not.toContain('"');
    expect(capturedOrFilter).toContain('testinject');
  });

  it('strips parenthesis metacharacters', async () => {
    await tool.handler({ query: 'a(b)c' }, makeCtx());
    expect(capturedOrFilter).not.toContain('(');
    expect(capturedOrFilter).not.toContain(')');
    expect(capturedOrFilter).toContain('abc');
  });

  it('strips comma metacharacters from user input', async () => {
    await tool.handler({ query: 'a,b' }, makeCtx());
    // The OR separator commas are expected; verify user's comma was sanitized
    // (pattern should be %ab%, not %a,b%)
    expect(capturedOrFilter).toContain('%ab%');
    expect(capturedOrFilter).not.toContain('%a,b%');
  });

  it('escapes SQL LIKE wildcard %', async () => {
    await tool.handler({ query: '50%off' }, makeCtx());
    expect(capturedOrFilter).toContain('50\\%off');
  });

  it('escapes SQL LIKE wildcard _', async () => {
    await tool.handler({ query: 'user_name' }, makeCtx());
    expect(capturedOrFilter).toContain('user\\_name');
  });

  it('escapes PostgREST wildcard *', async () => {
    await tool.handler({ query: 'x*y' }, makeCtx());
    expect(capturedOrFilter).toContain('x\\*y');
  });

  it('escapes backslash by doubling it', async () => {
    await tool.handler({ query: 'a\\b' }, makeCtx());
    expect(capturedOrFilter).toContain('a\\\\b');
  });

  it('truncates input to 100 chars before sanitization', async () => {
    const long = 'a'.repeat(150);
    await tool.handler({ query: long }, makeCtx());
    const expected = 'a'.repeat(100);
    expect(capturedOrFilter).toContain(expected);
    expect(capturedOrFilter).not.toContain('a'.repeat(101));
  });
});
