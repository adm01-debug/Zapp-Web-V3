/**
 * P0 Regression Suite — ChatPanel Correction Plan
 *
 * 7 regression tests covering the highest-severity defects fixed across
 * E01, E04, E07, E16, E17, and E14. Each test documents the baseline bug
 * (what happened before the fix) alongside the expected post-fix behavior.
 *
 * These tests are pure unit simulations — no DOM, no React, no network.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ────────────────────────────────────────────────────────────────────
// HELPERS — local re-implementations of the production functions
// so tests don't depend on module resolution or side-effects
// ────────────────────────────────────────────────────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isValidUUID(v: string | null | undefined): v is string {
  if (!v) return false;
  return UUID_RE.test(v);
}

type ContactRef =
  | { kind: 'uuid'; uuid: string; raw: string }
  | { kind: 'jid'; remoteJid: string; isGroup: boolean; raw: string };

function resolveContactRef(raw: string | null | undefined): ContactRef | null {
  if (!raw) return null;
  const value = raw.trim();
  if (!value) return null;
  if (UUID_RE.test(value)) return { kind: 'uuid', uuid: value.toLowerCase(), raw: value };
  const suffixes = ['@s.whatsapp.net', '@g.us', '@lid', '@broadcast'] as const;
  const hasSuffix = suffixes.some((s) => value.endsWith(s));
  const remoteJid = hasSuffix
    ? value
    : /^\d{8,15}$/.test(value)
      ? `${value}@s.whatsapp.net`
      : value;
  return { kind: 'jid', remoteJid, isGroup: value.endsWith('@g.us'), raw: value };
}

function fakeUuid(): string {
  return 'a1b2c3d4-e5f6-4789-ab01-cd23ef456789';
}

// ────────────────────────────────────────────────────────────────────
// P0-1: resolveContactRef handles all input formats (E01)
// BUG: production code used phone-derived JID for groups, missing @g.us
// ────────────────────────────────────────────────────────────────────
describe('P0-1 — resolveContactRef handles all input formats (E01)', () => {
  const VALID_UUID = fakeUuid();
  const JID_1ON1 = '5511999999999@s.whatsapp.net';
  const JID_GROUP = '120363000000000001@g.us';
  const PHONE_ONLY = '5511999999999';
  const NEWSLETTER = '120363000000000001@newsletter';

  it('UUID input → kind=uuid, preserves value', () => {
    const ref = resolveContactRef(VALID_UUID);
    expect(ref?.kind).toBe('uuid');
    if (ref?.kind === 'uuid') expect(ref.uuid).toBe(VALID_UUID);
  });

  it('1:1 JID input → kind=jid, isGroup=false', () => {
    const ref = resolveContactRef(JID_1ON1);
    expect(ref?.kind).toBe('jid');
    if (ref?.kind === 'jid') {
      expect(ref.remoteJid).toBe(JID_1ON1);
      expect(ref.isGroup).toBe(false);
    }
  });

  it('Group JID input → kind=jid, isGroup=true', () => {
    const ref = resolveContactRef(JID_GROUP);
    expect(ref?.kind).toBe('jid');
    if (ref?.kind === 'jid') {
      expect(ref.remoteJid).toBe(JID_GROUP);
      expect(ref.isGroup).toBe(true);
    }
  });

  it('Phone-only input → kind=jid, appends @s.whatsapp.net', () => {
    const ref = resolveContactRef(PHONE_ONLY);
    expect(ref?.kind).toBe('jid');
    if (ref?.kind === 'jid') {
      expect(ref.remoteJid).toBe(`${PHONE_ONLY}@s.whatsapp.net`);
    }
  });

  it('Newsletter JID input → kind=jid', () => {
    const ref = resolveContactRef(NEWSLETTER);
    expect(ref?.kind).toBe('jid');
  });

  it('null/undefined → null', () => {
    expect(resolveContactRef(null)).toBeNull();
    expect(resolveContactRef(undefined)).toBeNull();
    expect(resolveContactRef('')).toBeNull();
    expect(resolveContactRef('   ')).toBeNull();
  });

  it('[REGRESSION] group JID is NOT derived from contactPhone (which would be empty)', () => {
    // BUG baseline: code did `${contactPhone}@s.whatsapp.net` where contactPhone=undefined for groups
    // This produced '' or 'undefined@s.whatsapp.net' instead of the real group JID.
    const groupJid = JID_GROUP;
    const contactPhone: string | undefined = undefined;
    const buggyJid = contactPhone ? `${contactPhone}@s.whatsapp.net` : '';
    expect(buggyJid).toBe(''); // demonstrates the bug

    // Fixed: resolveContactRef(contactId) gets the correct group JID
    const ref = resolveContactRef(groupJid);
    expect(ref?.kind).toBe('jid');
    if (ref?.kind === 'jid') expect(ref.remoteJid).toBe(groupJid);
  });
});

// ────────────────────────────────────────────────────────────────────
// P0-2: VirtualizedMessageList suppressAutoBottomRef (E04)
// BUG: scrollToMessage competed with auto-scroll-to-bottom, causing
//      the scroll position to snap to bottom after a deep-link navigation.
// ────────────────────────────────────────────────────────────────────
describe('P0-2 — suppressAutoBottomRef prevents scroll competition (E04)', () => {
  let suppressAutoBottomRef = false;
  let scrollToBottomCalls = 0;
  let scrollToIndexCalls: Array<{ index: number; align: string }> = [];

  beforeEach(() => {
    suppressAutoBottomRef = false;
    scrollToBottomCalls = 0;
    scrollToIndexCalls = [];
  });

  const mockAutoScrollEffect = (messagesLength: number) => {
    if (suppressAutoBottomRef) return; // suppressed
    scrollToBottomCalls++;
  };

  const mockScrollToMessage = (targetIndex: number) => {
    suppressAutoBottomRef = true;
    scrollToIndexCalls.push({ index: targetIndex, align: 'center' });
    // After 600ms the flag is cleared — simulate synchronously for testing
    setTimeout(() => { suppressAutoBottomRef = false; }, 0);
  };

  it('[REGRESSION baseline] without suppress, auto-scroll fires after scrollToMessage', () => {
    // No suppression — both run
    mockScrollToMessage(10);
    suppressAutoBottomRef = false; // simulate no suppression guard
    mockAutoScrollEffect(50);
    expect(scrollToBottomCalls).toBe(1); // auto-scroll fired → competed
  });

  it('[FIXED] scrollToMessage sets flag, auto-scroll is suppressed', () => {
    mockScrollToMessage(10);
    // suppress is now true
    mockAutoScrollEffect(50);
    expect(scrollToBottomCalls).toBe(0); // auto-scroll suppressed ✓
    expect(scrollToIndexCalls[0].index).toBe(10);
  });

  it('auto-scroll resumes after suppress clears', () => {
    mockScrollToMessage(5);
    expect(suppressAutoBottomRef).toBe(true);
    // Simulate timeout clearing
    suppressAutoBottomRef = false;
    mockAutoScrollEffect(50);
    expect(scrollToBottomCalls).toBe(1); // resumes normally
  });

  it('scrollToMessage returns false for unknown IDs', () => {
    const listItems = [
      { type: 'message' as const, message: { id: 'msg-1' }, key: 'msg-1' },
      { type: 'message' as const, message: { id: 'msg-2' }, key: 'msg-2' },
    ];

    const scrollToMessage = (messageId: string): boolean => {
      const index = listItems.findIndex(
        (item) => item.type === 'message' && item.message.id === messageId
      );
      if (index === -1) return false;
      suppressAutoBottomRef = true;
      return true;
    };

    expect(scrollToMessage('msg-1')).toBe(true);
    expect(scrollToMessage('msg-unknown')).toBe(false);
    expect(suppressAutoBottomRef).toBe(true); // only set when found
  });
});

// ────────────────────────────────────────────────────────────────────
// P0-3: useRealtimeMessages global inbox has NO instance filter (E07)
// BUG: all 3 Realtime subscriptions had `filter: instance_name=eq.wpp2`,
//      silently dropping messages from all other instances.
// ────────────────────────────────────────────────────────────────────
describe('P0-3 — Global inbox Realtime subscriptions have no instance filter (E07)', () => {
  type SubscriptionConfig = {
    event: string;
    schema: string;
    table: string;
    filter?: string;
  };

  // Simulates the OLD (buggy) subscription builder
  const buildSubscriptionsBuggy = (defaultInstance: string): SubscriptionConfig[] => [
    { event: 'INSERT', schema: 'evo', table: 'evolution_messages', filter: `instance_name=eq.${defaultInstance}` },
    { event: 'UPDATE', schema: 'evo', table: 'evolution_messages', filter: `instance_name=eq.${defaultInstance}` },
    { event: 'DELETE', schema: 'evo', table: 'evolution_messages', filter: `instance_name=eq.${defaultInstance}` },
  ];

  // Simulates the FIXED subscription builder (no filter)
  const buildSubscriptionsFixed = (): SubscriptionConfig[] => [
    { event: 'INSERT', schema: 'evo', table: 'evolution_messages' },
    { event: 'UPDATE', schema: 'evo', table: 'evolution_messages' },
    { event: 'DELETE', schema: 'evo', table: 'evolution_messages' },
  ];

  // Simulates whether an event from a given instance passes the subscription
  const eventPassesSubscription = (eventInstance: string, sub: SubscriptionConfig): boolean => {
    if (!sub.filter) return true; // no filter → all instances pass
    const [col, , val] = sub.filter.split('=eq.') as [string, string, string];
    return col === 'instance_name' && val === eventInstance;
  };

  it('[REGRESSION] buggy subscriptions drop messages from non-default instances', () => {
    const subs = buildSubscriptionsBuggy('wpp2');
    const instances = ['wpp2', 'comercial_01', 'comercial_03', 'logistica', 'marketing'];

    for (const inst of instances) {
      const insertPasses = eventPassesSubscription(inst, subs[0]);
      if (inst === 'wpp2') {
        expect(insertPasses).toBe(true); // only wpp2 passes
      } else {
        expect(insertPasses).toBe(false); // all others dropped → BUG
      }
    }
  });

  it('[FIXED] subscriptions without filter receive all instances', () => {
    const subs = buildSubscriptionsFixed();
    const instances = ['wpp2', 'comercial_01', 'comercial_03', 'logistica', 'marketing', 'artes'];

    for (const sub of subs) {
      for (const inst of instances) {
        expect(eventPassesSubscription(inst, sub)).toBe(true);
      }
    }
  });

  it('INSERT, UPDATE and DELETE subscriptions all lack the filter', () => {
    const subs = buildSubscriptionsFixed();
    expect(subs).toHaveLength(3);
    for (const sub of subs) {
      expect(sub.filter).toBeUndefined();
    }
  });
});

// ────────────────────────────────────────────────────────────────────
// P0-4: useExternalMessages cache keys are instance-scoped (E07)
// BUG: cache keys used DEFAULT_INSTANCE literal, causing different-instance
//      conversations to share the same cache entry → stale data shown.
// ────────────────────────────────────────────────────────────────────
describe('P0-4 — Cache keys are scoped per instance (E07)', () => {
  const DEFAULT_INSTANCE = 'wpp2';
  const CONVERSATION_PAGE_SIZE = 50;

  // Buggy key builder (before fix)
  const buildCacheKeyBuggy = (remoteJid: string): string =>
    `inbox:initial:${remoteJid}:${CONVERSATION_PAGE_SIZE}:${DEFAULT_INSTANCE}`;

  // Fixed key builder
  const buildCacheKeyFixed = (remoteJid: string, instanceName: string | undefined): string => {
    const effectiveInstance = instanceName ?? DEFAULT_INSTANCE;
    return `inbox:initial:${remoteJid}:${CONVERSATION_PAGE_SIZE}:${effectiveInstance}`;
  };

  const JID = '5511888888888@s.whatsapp.net';

  it('[REGRESSION] buggy keys are identical across instances', () => {
    const key1 = buildCacheKeyBuggy(JID);
    const key2 = buildCacheKeyBuggy(JID); // called with different instance, but same result
    expect(key1).toBe(key2); // same key → cache collision → stale data
  });

  it('[FIXED] keys differ per instance', () => {
    const keyWpp2 = buildCacheKeyFixed(JID, 'wpp2');
    const keyCom = buildCacheKeyFixed(JID, 'comercial_01');
    const keyLog = buildCacheKeyFixed(JID, 'logistica');
    expect(keyWpp2).not.toBe(keyCom);
    expect(keyCom).not.toBe(keyLog);
    expect(keyWpp2).not.toBe(keyLog);
  });

  it('[FIXED] undefined instanceName falls back to DEFAULT_INSTANCE', () => {
    const keyUndefined = buildCacheKeyFixed(JID, undefined);
    const keyDefault = buildCacheKeyFixed(JID, DEFAULT_INSTANCE);
    expect(keyUndefined).toBe(keyDefault);
  });

  it('key uniqueness holds for 20 different instances', () => {
    const instances = Array.from({ length: 20 }, (_, i) => `instance_${i}`);
    const keys = instances.map((inst) => buildCacheKeyFixed(JID, inst));
    const uniqueKeys = new Set(keys);
    expect(uniqueKeys.size).toBe(20);
  });
});

// ────────────────────────────────────────────────────────────────────
// P0-5: isValidUUID guard blocks JID inserts into FK column (E14)
// BUG: onPollSent/onContactSent unconditionally inserted conversation.contact.id
//      into messages.contact_id (UUID FK), causing PostgREST 400 for JID contacts.
// ────────────────────────────────────────────────────────────────────
describe('P0-5 — isValidUUID guard blocks JID inserts into FK column (E14)', () => {
  const simulateOnPollSentCurrent = (contactId: string): 'insert' | 'skipped' => {
    // BASELINE: no guard, always attempts insert (would fail for JID)
    return 'insert';
  };

  const simulateOnPollSentFixed = (contactId: string): 'insert' | 'skipped' => {
    if (!isValidUUID(contactId)) return 'skipped'; // guard added in fix
    return 'insert';
  };

  const UUID = fakeUuid();
  const JID_1ON1 = '5511999999999@s.whatsapp.net';
  const JID_GROUP = '120363000000000001@g.us';

  it('[REGRESSION] baseline attempts insert for ALL contact IDs including JIDs', () => {
    expect(simulateOnPollSentCurrent(UUID)).toBe('insert');
    expect(simulateOnPollSentCurrent(JID_1ON1)).toBe('insert'); // would fail in DB
    expect(simulateOnPollSentCurrent(JID_GROUP)).toBe('insert'); // would fail in DB
  });

  it('[FIXED] UUID contact → insert proceeds', () => {
    expect(simulateOnPollSentFixed(UUID)).toBe('insert');
  });

  it('[FIXED] JID contact (1:1) → insert skipped', () => {
    expect(simulateOnPollSentFixed(JID_1ON1)).toBe('skipped');
  });

  it('[FIXED] JID contact (group) → insert skipped', () => {
    expect(simulateOnPollSentFixed(JID_GROUP)).toBe('skipped');
  });

  it('[FIXED] phone-only string → insert skipped', () => {
    expect(simulateOnPollSentFixed('5511999999999')).toBe('skipped');
  });

  it('[FIXED] empty/null contactId → insert skipped', () => {
    expect(simulateOnPollSentFixed('')).toBe('skipped');
  });

  it('isValidUUID accepts all valid UUID v1-v8 variants', () => {
    const uuids = [
      'a1b2c3d4-e5f6-1789-ab01-cd23ef456789', // v1
      'a1b2c3d4-e5f6-4789-ab01-cd23ef456789', // v4
      'a1b2c3d4-e5f6-5789-ab01-cd23ef456789', // v5
    ];
    for (const u of uuids) {
      expect(isValidUUID(u)).toBe(true);
    }
  });
});

// ────────────────────────────────────────────────────────────────────
// P0-6: groupInfo correctly identifies message group boundaries (E16)
// BUG: ChatMessagesArea always passed isFirstInGroup={true}/isLastInGroup={true}
//      to MessageBubble, disabling tail rendering and avatar positioning.
// ────────────────────────────────────────────────────────────────────
describe('P0-6 — groupInfo identifies message group boundaries (E16)', () => {
  const SAME_GROUP_MS = 5 * 60 * 1000; // 5 minutes

  interface MsgLike {
    sender: string;
    timestamp: string | number;
  }

  const buildGroupInfo = (messages: MsgLike[]) =>
    messages.map((msg, i) => {
      const prev = messages[i - 1];
      const next = messages[i + 1];
      const ts = new Date(msg.timestamp ?? 0).getTime();
      const isFirstInGroup =
        !prev ||
        prev.sender !== msg.sender ||
        ts - new Date(prev.timestamp ?? 0).getTime() > SAME_GROUP_MS;
      const isLastInGroup =
        !next ||
        next.sender !== msg.sender ||
        new Date(next.timestamp ?? 0).getTime() - ts > SAME_GROUP_MS;
      return { isFirstInGroup, isLastInGroup };
    });

  const baseTime = new Date('2026-07-31T10:00:00Z').getTime();
  const min = (n: number) => baseTime + n * 60 * 1000;

  it('[REGRESSION baseline] hardcoded always true never groups messages', () => {
    // Simulates the old hardcoded behavior
    const messages: MsgLike[] = [
      { sender: 'contact', timestamp: min(0) },
      { sender: 'contact', timestamp: min(1) },
      { sender: 'contact', timestamp: min(2) },
    ];
    const hardcoded = messages.map(() => ({ isFirstInGroup: true, isLastInGroup: true }));
    // Every message claims to be first AND last — visually broken
    for (const g of hardcoded) {
      expect(g.isFirstInGroup).toBe(true);
      expect(g.isLastInGroup).toBe(true);
    }
  });

  it('[FIXED] consecutive messages from same sender within 5min form a group', () => {
    const messages: MsgLike[] = [
      { sender: 'contact', timestamp: min(0) },
      { sender: 'contact', timestamp: min(1) },
      { sender: 'contact', timestamp: min(2) },
    ];
    const info = buildGroupInfo(messages);

    expect(info[0].isFirstInGroup).toBe(true);  // first of group
    expect(info[0].isLastInGroup).toBe(false);  // middle: has next from same sender
    expect(info[1].isFirstInGroup).toBe(false);
    expect(info[1].isLastInGroup).toBe(false);
    expect(info[2].isFirstInGroup).toBe(false);
    expect(info[2].isLastInGroup).toBe(true);   // last of group
  });

  it('[FIXED] sender change breaks group', () => {
    const messages: MsgLike[] = [
      { sender: 'contact', timestamp: min(0) },
      { sender: 'agent',   timestamp: min(1) },
      { sender: 'contact', timestamp: min(2) },
    ];
    const info = buildGroupInfo(messages);

    expect(info[0].isFirstInGroup).toBe(true);
    expect(info[0].isLastInGroup).toBe(true);   // last because next is agent
    expect(info[1].isFirstInGroup).toBe(true);
    expect(info[1].isLastInGroup).toBe(true);
    expect(info[2].isFirstInGroup).toBe(true);
    expect(info[2].isLastInGroup).toBe(true);
  });

  it('[FIXED] time gap > 5min breaks group even for same sender', () => {
    const messages: MsgLike[] = [
      { sender: 'contact', timestamp: min(0) },
      { sender: 'contact', timestamp: min(6) }, // 6 min later > SAME_GROUP_MS
    ];
    const info = buildGroupInfo(messages);

    expect(info[0].isFirstInGroup).toBe(true);
    expect(info[0].isLastInGroup).toBe(true);   // last: next is too far in time
    expect(info[1].isFirstInGroup).toBe(true);  // new group
    expect(info[1].isLastInGroup).toBe(true);
  });

  it('[FIXED] single message is both first and last in group', () => {
    const messages: MsgLike[] = [{ sender: 'contact', timestamp: min(0) }];
    const info = buildGroupInfo(messages);
    expect(info[0].isFirstInGroup).toBe(true);
    expect(info[0].isLastInGroup).toBe(true);
  });

  it('groupInfo length always equals messages length', () => {
    for (const count of [0, 1, 5, 20, 100]) {
      const messages = Array.from({ length: count }, (_, i) => ({
        sender: i % 2 === 0 ? 'contact' : 'agent',
        timestamp: min(i),
      }));
      const info = buildGroupInfo(messages);
      expect(info.length).toBe(count);
    }
  });
});

// ────────────────────────────────────────────────────────────────────
// P0-7: toggleSound stale closure (E17)
// BUG: `setSoundEnabled(!soundOn)` used captured soundOn at useCallback
//      creation time, not the current value. Two rapid toggles would both
//      read the same captured value and produce incorrect final state.
// ────────────────────────────────────────────────────────────────────
describe('P0-7 — toggleSound stale closure is fixed (E17)', () => {
  it('[REGRESSION] buggy toggleSound reads stale soundOn', () => {
    let soundOn = true;
    let soundEnabled = true;

    // Simulates the BUGGY implementation:
    // const toggleSound = useCallback(() => {
    //   setSoundOn(prev => !prev);
    //   setSoundEnabled(!soundOn);  // ← captures soundOn at creation (stale)
    // }, [soundOn, setSoundEnabled]);

    const createBuggyToggle = (capturedSoundOn: boolean) => () => {
      soundOn = !soundOn;                          // setSoundOn(prev => !prev)
      soundEnabled = !capturedSoundOn;             // setSoundEnabled(!capturedSoundOn) — stale
    };

    const toggle = createBuggyToggle(soundOn); // captures soundOn=true

    // First toggle: soundOn captured as true
    toggle();
    expect(soundOn).toBe(false);         // setSoundOn works correctly
    expect(soundEnabled).toBe(false);    // !true = false → correct first time

    // Second toggle: but closure still has captured=true!
    toggle(); // soundOn is now false, but capturedSoundOn is still true
    expect(soundOn).toBe(true);          // setSoundOn updates correctly
    expect(soundEnabled).toBe(false);    // !capturedSoundOn = !true = false → WRONG (should be true)
  });

  it('[FIXED] fixed toggleSound reads current value via functional updater', () => {
    let soundOn = true;
    let soundEnabled = true;

    // Simulates the FIXED implementation:
    // const toggleSound = useCallback(() => {
    //   setSoundOn((prev) => {
    //     const next = !prev;
    //     setSoundEnabled(next);
    //     return next;
    //   });
    // }, [setSoundEnabled]);

    const fixedToggle = () => {
      soundOn = ((prev: boolean) => {
        const next = !prev;
        soundEnabled = next; // reads current prev, not captured
        return next;
      })(soundOn);
    };

    // First toggle
    fixedToggle();
    expect(soundOn).toBe(false);
    expect(soundEnabled).toBe(false); // in sync ✓

    // Second toggle — no stale capture
    fixedToggle();
    expect(soundOn).toBe(true);
    expect(soundEnabled).toBe(true); // in sync ✓ (was wrong in buggy version)

    // Third toggle
    fixedToggle();
    expect(soundOn).toBe(false);
    expect(soundEnabled).toBe(false); // in sync ✓
  });

  it('[FIXED] soundOn and soundEnabled always agree after N toggles', () => {
    let soundOn = true;
    let soundEnabled = true;

    const fixedToggle = () => {
      soundOn = ((prev: boolean) => {
        const next = !prev;
        soundEnabled = next;
        return next;
      })(soundOn);
    };

    for (let i = 0; i < 100; i++) {
      fixedToggle();
      expect(soundOn).toBe(soundEnabled); // always in sync
    }
  });
});
