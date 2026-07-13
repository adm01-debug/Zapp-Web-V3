/**
 * Tests for CHECKLIST_STEPS in checklistSteps.ts.
 *
 * Each step's `checkCondition` is an async function that queries Supabase.
 * supabase is mocked. All tests exercise the observable return value (boolean).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoisted mocks ─────────────────────────────────────────────────────────────
const mockGetUser = vi.hoisted(() => vi.fn());
const mockFrom = vi.hoisted(() => vi.fn());

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: { getUser: mockGetUser },
    from: mockFrom,
  },
}));

// lucide-react icons are React components; mock them to avoid rendering issues
vi.mock('lucide-react', () => ({
  Users: {},
  MessageSquare: {},
  Clock: {},
  Sparkles: {},
  Bell: {},
  Palette: {},
}));

// ── Import SUT AFTER mocks ────────────────────────────────────────────────────
import { CHECKLIST_STEPS } from '../checklistSteps';

// ── Helpers ───────────────────────────────────────────────────────────────────
const USER_ID = 'u-111';
const USER = { id: USER_ID };

/** Fluent Supabase chain builder. Terminal method resolves with `result`. */
function makeChain(result: { data: unknown; error?: unknown }) {
  const chain = {
    select: () => chain,
    eq: () => chain,
    limit: () => Promise.resolve({ data: result.data, error: result.error ?? null }),
    maybeSingle: () => Promise.resolve({ data: result.data, error: result.error ?? null }),
  };
  return chain;
}

// ── Setup ─────────────────────────────────────────────────────────────────────
beforeEach(() => {
  vi.clearAllMocks();
  mockGetUser.mockResolvedValue({ data: { user: USER } });
  mockFrom.mockReturnValue(makeChain({ data: null }));
});

// ── Structure ─────────────────────────────────────────────────────────────────
describe('CHECKLIST_STEPS — structure', () => {
  it('exports exactly 6 steps', () => {
    expect(CHECKLIST_STEPS).toHaveLength(6);
  });

  it('every step has id, title, description, action, and checkCondition', () => {
    for (const step of CHECKLIST_STEPS) {
      expect(typeof step.id).toBe('string');
      expect(typeof step.title).toBe('string');
      expect(typeof step.description).toBe('string');
      expect(typeof step.action).toBe('string');
      expect(typeof step.checkCondition).toBe('function');
    }
  });

  it('step IDs are unique', () => {
    const ids = CHECKLIST_STEPS.map(s => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('all steps except "connection" have an actionRoute', () => {
    const noRoute = CHECKLIST_STEPS.filter(s => s.id !== 'connection' && !s.actionRoute);
    expect(noRoute).toHaveLength(0);
  });
});

// ── Step: profile ─────────────────────────────────────────────────────────────
describe('checkCondition — profile step', () => {
  const step = () => CHECKLIST_STEPS.find(s => s.id === 'profile')!;

  it('returns true when profile has name longer than 2 chars', async () => {
    mockGetUser.mockResolvedValue({ data: { user: USER } });
    mockFrom.mockReturnValue(makeChain({ data: { name: 'Alice', avatar_url: null } }));
    expect(await step().checkCondition()).toBe(true);
  });

  it('returns false when profile name is too short (≤ 2 chars)', async () => {
    mockFrom.mockReturnValue(makeChain({ data: { name: 'Al', avatar_url: null } }));
    expect(await step().checkCondition()).toBe(false);
  });

  it('returns false when profile data is null', async () => {
    mockFrom.mockReturnValue(makeChain({ data: null }));
    expect(await step().checkCondition()).toBe(false);
  });

  it('returns false when user is not authenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    expect(await step().checkCondition()).toBe(false);
  });

  it('queries the "profiles" table', async () => {
    await step().checkCondition();
    expect(mockFrom).toHaveBeenCalledWith('profiles');
  });
});

// ── Step: connection ──────────────────────────────────────────────────────────
describe('checkCondition — connection step', () => {
  const step = () => CHECKLIST_STEPS.find(s => s.id === 'connection')!;

  it('returns true when at least one connected connection exists', async () => {
    mockFrom.mockReturnValue(makeChain({ data: [{ id: 'c1' }] }));
    expect(await step().checkCondition()).toBe(true);
  });

  it('returns false when no connected connections', async () => {
    mockFrom.mockReturnValue(makeChain({ data: [] }));
    expect(await step().checkCondition()).toBe(false);
  });

  it('returns false when data is null', async () => {
    mockFrom.mockReturnValue(makeChain({ data: null }));
    expect(await step().checkCondition()).toBe(false);
  });

  it('queries the "whatsapp_connections" table', async () => {
    await step().checkCondition();
    expect(mockFrom).toHaveBeenCalledWith('whatsapp_connections');
  });
});

// ── Step: hours ───────────────────────────────────────────────────────────────
describe('checkCondition — hours step', () => {
  const step = () => CHECKLIST_STEPS.find(s => s.id === 'hours')!;

  it('returns true when business_hours_enabled is true', async () => {
    mockFrom.mockReturnValue(makeChain({ data: { business_hours_enabled: true } }));
    expect(await step().checkCondition()).toBe(true);
  });

  it('returns false when business_hours_enabled is false', async () => {
    mockFrom.mockReturnValue(makeChain({ data: { business_hours_enabled: false } }));
    expect(await step().checkCondition()).toBe(false);
  });

  it('returns false when user_settings row is null', async () => {
    mockFrom.mockReturnValue(makeChain({ data: null }));
    expect(await step().checkCondition()).toBe(false);
  });

  it('returns false when user is not authenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    expect(await step().checkCondition()).toBe(false);
  });

  it('queries the "user_settings" table', async () => {
    await step().checkCondition();
    expect(mockFrom).toHaveBeenCalledWith('user_settings');
  });
});

// ── Step: templates ───────────────────────────────────────────────────────────
describe('checkCondition — templates step', () => {
  const step = () => CHECKLIST_STEPS.find(s => s.id === 'templates')!;

  it('returns true when at least one template exists', async () => {
    mockFrom.mockReturnValue(makeChain({ data: [{ id: 't1' }] }));
    expect(await step().checkCondition()).toBe(true);
  });

  it('returns false when no templates exist', async () => {
    mockFrom.mockReturnValue(makeChain({ data: [] }));
    expect(await step().checkCondition()).toBe(false);
  });

  it('returns false when user is not authenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    expect(await step().checkCondition()).toBe(false);
  });

  it('queries the "message_templates" table', async () => {
    await step().checkCondition();
    expect(mockFrom).toHaveBeenCalledWith('message_templates');
  });
});

// ── Step: notifications ───────────────────────────────────────────────────────
describe('checkCondition — notifications step', () => {
  const step = () => CHECKLIST_STEPS.find(s => s.id === 'notifications')!;

  it('returns true when browser_notifications_enabled is true', async () => {
    mockFrom.mockReturnValue(
      makeChain({ data: { browser_notifications_enabled: true, sound_enabled: false } })
    );
    expect(await step().checkCondition()).toBe(true);
  });

  it('returns true when sound_enabled is true', async () => {
    mockFrom.mockReturnValue(
      makeChain({ data: { browser_notifications_enabled: false, sound_enabled: true } })
    );
    expect(await step().checkCondition()).toBe(true);
  });

  it('returns false when both flags are false', async () => {
    mockFrom.mockReturnValue(
      makeChain({ data: { browser_notifications_enabled: false, sound_enabled: false } })
    );
    expect(await step().checkCondition()).toBe(false);
  });

  it('returns false when user is not authenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    expect(await step().checkCondition()).toBe(false);
  });
});

// ── Step: theme ───────────────────────────────────────────────────────────────
describe('checkCondition — theme step', () => {
  const step = () => CHECKLIST_STEPS.find(s => s.id === 'theme')!;

  it('returns true when theme is "dark"', async () => {
    mockFrom.mockReturnValue(makeChain({ data: { theme: 'dark' } }));
    expect(await step().checkCondition()).toBe(true);
  });

  it('returns true when theme is "light"', async () => {
    mockFrom.mockReturnValue(makeChain({ data: { theme: 'light' } }));
    expect(await step().checkCondition()).toBe(true);
  });

  it('returns false when theme is "system"', async () => {
    mockFrom.mockReturnValue(makeChain({ data: { theme: 'system' } }));
    expect(await step().checkCondition()).toBe(false);
  });

  it('returns false when theme is null', async () => {
    mockFrom.mockReturnValue(makeChain({ data: { theme: null } }));
    expect(await step().checkCondition()).toBe(false);
  });

  it('returns false when user is not authenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    expect(await step().checkCondition()).toBe(false);
  });

  it('queries the "user_settings" table', async () => {
    await step().checkCondition();
    expect(mockFrom).toHaveBeenCalledWith('user_settings');
  });
});
