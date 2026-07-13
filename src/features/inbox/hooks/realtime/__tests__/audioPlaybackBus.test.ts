import { describe, it, expect, beforeEach, vi } from 'vitest';
import { audioPlaybackBus, type ActivePlayerHandle } from '../audioPlaybackBus';

// ── helpers ───────────────────────────────────────────────────────────────────

function makeHandle(messageId: string): ActivePlayerHandle & { _muted: () => boolean } {
  let muted = false;
  const volume = 0.8;
  return {
    messageId,
    toggleMute: () => {
      muted = !muted;
      return { muted, volume: muted ? 0 : volume };
    },
    getVolume: () => (muted ? 0 : volume),
    _muted: () => muted,
  };
}

beforeEach(() => {
  audioPlaybackBus._reset();
});

// ── getActive ─────────────────────────────────────────────────────────────────

describe('audioPlaybackBus.getActive', () => {
  it('returns null initially', () => {
    expect(audioPlaybackBus.getActive()).toBeNull();
  });

  it('returns null after _reset', () => {
    audioPlaybackBus.setActive(makeHandle('msg-1'));
    audioPlaybackBus._reset();
    expect(audioPlaybackBus.getActive()).toBeNull();
  });
});

// ── setActive ────────────────────────────────────────────────────────────────

describe('audioPlaybackBus.setActive', () => {
  it('makes the handle the active player', () => {
    const handle = makeHandle('msg-1');
    audioPlaybackBus.setActive(handle);
    expect(audioPlaybackBus.getActive()).toBe(handle);
  });

  it('replaces the previous active player', () => {
    const a = makeHandle('msg-1');
    const b = makeHandle('msg-2');
    audioPlaybackBus.setActive(a);
    audioPlaybackBus.setActive(b);
    expect(audioPlaybackBus.getActive()).toBe(b);
  });

  it('notifies listeners when a new handle is set', () => {
    const received: (ActivePlayerHandle | null)[] = [];
    audioPlaybackBus.subscribe((h) => received.push(h));
    const handle = makeHandle('msg-1');
    audioPlaybackBus.setActive(handle);
    expect(received).toHaveLength(1);
    expect(received[0]).toBe(handle);
  });

  it('notifies listeners with the new handle when replacing', () => {
    const received: (ActivePlayerHandle | null)[] = [];
    audioPlaybackBus.subscribe((h) => received.push(h));
    audioPlaybackBus.setActive(makeHandle('msg-1'));
    const b = makeHandle('msg-2');
    audioPlaybackBus.setActive(b);
    expect(received[1]).toBe(b);
  });
});

// ── clearActive ───────────────────────────────────────────────────────────────

describe('audioPlaybackBus.clearActive', () => {
  it('clears active when the messageId matches', () => {
    audioPlaybackBus.setActive(makeHandle('msg-1'));
    audioPlaybackBus.clearActive('msg-1');
    expect(audioPlaybackBus.getActive()).toBeNull();
  });

  it('is a no-op when the messageId does not match', () => {
    const handle = makeHandle('msg-1');
    audioPlaybackBus.setActive(handle);
    audioPlaybackBus.clearActive('msg-other');
    expect(audioPlaybackBus.getActive()).toBe(handle);
  });

  it('is a no-op when there is no active player', () => {
    expect(() => audioPlaybackBus.clearActive('msg-1')).not.toThrow();
    expect(audioPlaybackBus.getActive()).toBeNull();
  });

  it('notifies listeners when cleared', () => {
    const received: (ActivePlayerHandle | null)[] = [];
    audioPlaybackBus.setActive(makeHandle('msg-1'));
    audioPlaybackBus.subscribe((h) => received.push(h));
    audioPlaybackBus.clearActive('msg-1');
    expect(received).toHaveLength(1);
    expect(received[0]).toBeNull();
  });

  it('does not notify when the id does not match', () => {
    audioPlaybackBus.setActive(makeHandle('msg-1'));
    const calls: unknown[] = [];
    audioPlaybackBus.subscribe((h) => calls.push(h));
    audioPlaybackBus.clearActive('msg-other');
    expect(calls).toHaveLength(0);
  });
});

// ── toggleMuteActive ──────────────────────────────────────────────────────────

describe('audioPlaybackBus.toggleMuteActive', () => {
  it('returns null when there is no active player', () => {
    expect(audioPlaybackBus.toggleMuteActive()).toBeNull();
  });

  it('delegates to the active handle toggleMute', () => {
    const handle = makeHandle('msg-1');
    audioPlaybackBus.setActive(handle);
    const result = audioPlaybackBus.toggleMuteActive();
    expect(result).not.toBeNull();
    expect(result!.muted).toBe(true);
    expect(handle._muted()).toBe(true);
  });

  it('second toggle unmutes', () => {
    const handle = makeHandle('msg-1');
    audioPlaybackBus.setActive(handle);
    audioPlaybackBus.toggleMuteActive();
    const result = audioPlaybackBus.toggleMuteActive();
    expect(result!.muted).toBe(false);
  });

  it('returns the new muted state and volume from the handle', () => {
    audioPlaybackBus.setActive(makeHandle('msg-1'));
    const result = audioPlaybackBus.toggleMuteActive();
    expect(typeof result!.muted).toBe('boolean');
    expect(typeof result!.volume).toBe('number');
  });
});

// ── subscribe ─────────────────────────────────────────────────────────────────

describe('audioPlaybackBus.subscribe', () => {
  it('listener is called on setActive', () => {
    const calls: unknown[] = [];
    audioPlaybackBus.subscribe((h) => calls.push(h));
    audioPlaybackBus.setActive(makeHandle('msg-1'));
    expect(calls).toHaveLength(1);
  });

  it('listener is called on clearActive (when matching)', () => {
    audioPlaybackBus.setActive(makeHandle('msg-1'));
    const calls: unknown[] = [];
    audioPlaybackBus.subscribe((h) => calls.push(h));
    audioPlaybackBus.clearActive('msg-1');
    expect(calls).toHaveLength(1);
    expect(calls[0]).toBeNull();
  });

  it('unsubscribe stops receiving notifications', () => {
    const calls: unknown[] = [];
    const unsub = audioPlaybackBus.subscribe((h) => calls.push(h));
    unsub();
    audioPlaybackBus.setActive(makeHandle('msg-1'));
    expect(calls).toHaveLength(0);
  });

  it('multiple listeners all receive notifications', () => {
    const a: unknown[] = [];
    const b: unknown[] = [];
    audioPlaybackBus.subscribe((h) => a.push(h));
    audioPlaybackBus.subscribe((h) => b.push(h));
    audioPlaybackBus.setActive(makeHandle('msg-1'));
    expect(a).toHaveLength(1);
    expect(b).toHaveLength(1);
  });

  it('a throwing listener does not prevent others from being called', () => {
    const good: unknown[] = [];
    audioPlaybackBus.subscribe(() => { throw new Error('boom'); });
    audioPlaybackBus.subscribe((h) => good.push(h));
    expect(() => audioPlaybackBus.setActive(makeHandle('msg-1'))).not.toThrow();
    expect(good).toHaveLength(1);
  });

  it('unsubscribing one does not affect others', () => {
    const a: unknown[] = [];
    const b: unknown[] = [];
    const unsub = audioPlaybackBus.subscribe((h) => a.push(h));
    audioPlaybackBus.subscribe((h) => b.push(h));
    unsub();
    audioPlaybackBus.setActive(makeHandle('msg-1'));
    expect(a).toHaveLength(0);
    expect(b).toHaveLength(1);
  });
});

// ── _reset ────────────────────────────────────────────────────────────────────

describe('audioPlaybackBus._reset', () => {
  it('clears the active player', () => {
    audioPlaybackBus.setActive(makeHandle('msg-1'));
    audioPlaybackBus._reset();
    expect(audioPlaybackBus.getActive()).toBeNull();
  });

  it('removes all listeners so they no longer receive events', () => {
    const calls: unknown[] = [];
    audioPlaybackBus.subscribe((h) => calls.push(h));
    audioPlaybackBus._reset();
    audioPlaybackBus.setActive(makeHandle('msg-1'));
    expect(calls).toHaveLength(0);
  });

  it('is safe to call multiple times', () => {
    expect(() => {
      audioPlaybackBus._reset();
      audioPlaybackBus._reset();
    }).not.toThrow();
  });
});
