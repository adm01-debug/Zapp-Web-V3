import { describe, it, expect, vi } from 'vitest';
import {
  DEFAULT_LEFT_ACTION,
  DEFAULT_RIGHT_ACTION,
  SWIPE_ACTIONS,
  SwipeAction,
} from '../swipeActions';

// ── shape helper ──────────────────────────────────────────────────────────────

function assertSwipeActionShape(action: SwipeAction) {
  expect(action.icon).toBeTruthy();
  expect(typeof action.color).toBe('string');
  expect(action.color.length).toBeGreaterThan(0);
  expect(typeof action.bgColor).toBe('string');
  expect(action.bgColor.length).toBeGreaterThan(0);
  expect(typeof action.label).toBe('string');
  expect(action.label.length).toBeGreaterThan(0);
  expect(typeof action.action).toBe('function');
}

// ── DEFAULT_LEFT_ACTION ───────────────────────────────────────────────────────

describe('DEFAULT_LEFT_ACTION', () => {
  it('has all required SwipeAction fields', () => {
    assertSwipeActionShape(DEFAULT_LEFT_ACTION);
  });

  it('label is "Lido"', () => {
    expect(DEFAULT_LEFT_ACTION.label).toBe('Lido');
  });

  it('bgColor is bg-success', () => {
    expect(DEFAULT_LEFT_ACTION.bgColor).toBe('bg-success');
  });

  it('default action is a no-op (does not throw)', () => {
    expect(() => DEFAULT_LEFT_ACTION.action()).not.toThrow();
  });
});

// ── DEFAULT_RIGHT_ACTION ──────────────────────────────────────────────────────

describe('DEFAULT_RIGHT_ACTION', () => {
  it('has all required SwipeAction fields', () => {
    assertSwipeActionShape(DEFAULT_RIGHT_ACTION);
  });

  it('label is "Arquivar"', () => {
    expect(DEFAULT_RIGHT_ACTION.label).toBe('Arquivar');
  });

  it('bgColor is bg-warning', () => {
    expect(DEFAULT_RIGHT_ACTION.bgColor).toBe('bg-warning');
  });

  it('default action is a no-op (does not throw)', () => {
    expect(() => DEFAULT_RIGHT_ACTION.action()).not.toThrow();
  });
});

// ── SWIPE_ACTIONS factories ───────────────────────────────────────────────────

describe('SWIPE_ACTIONS.markAsRead', () => {
  it('returns a valid SwipeAction', () => {
    assertSwipeActionShape(SWIPE_ACTIONS.markAsRead(vi.fn()));
  });

  it('label is "Lido"', () => {
    expect(SWIPE_ACTIONS.markAsRead(vi.fn()).label).toBe('Lido');
  });

  it('action callback is invoked when called', () => {
    const cb = vi.fn();
    SWIPE_ACTIONS.markAsRead(cb).action();
    expect(cb).toHaveBeenCalledOnce();
  });
});

describe('SWIPE_ACTIONS.markAsUnread', () => {
  it('returns a valid SwipeAction', () => {
    assertSwipeActionShape(SWIPE_ACTIONS.markAsUnread(vi.fn()));
  });

  it('label is "Não lido"', () => {
    expect(SWIPE_ACTIONS.markAsUnread(vi.fn()).label).toBe('Não lido');
  });

  it('action callback is invoked when called', () => {
    const cb = vi.fn();
    SWIPE_ACTIONS.markAsUnread(cb).action();
    expect(cb).toHaveBeenCalledOnce();
  });
});

describe('SWIPE_ACTIONS.archive', () => {
  it('returns a valid SwipeAction', () => {
    assertSwipeActionShape(SWIPE_ACTIONS.archive(vi.fn()));
  });

  it('label is "Arquivar"', () => {
    expect(SWIPE_ACTIONS.archive(vi.fn()).label).toBe('Arquivar');
  });

  it('bgColor is bg-warning', () => {
    expect(SWIPE_ACTIONS.archive(vi.fn()).bgColor).toBe('bg-warning');
  });

  it('action callback is invoked when called', () => {
    const cb = vi.fn();
    SWIPE_ACTIONS.archive(cb).action();
    expect(cb).toHaveBeenCalledOnce();
  });
});

describe('SWIPE_ACTIONS.delete', () => {
  it('returns a valid SwipeAction', () => {
    assertSwipeActionShape(SWIPE_ACTIONS.delete(vi.fn()));
  });

  it('label is "Excluir"', () => {
    expect(SWIPE_ACTIONS.delete(vi.fn()).label).toBe('Excluir');
  });

  it('bgColor is bg-destructive', () => {
    expect(SWIPE_ACTIONS.delete(vi.fn()).bgColor).toBe('bg-destructive');
  });

  it('action callback is invoked when called', () => {
    const cb = vi.fn();
    SWIPE_ACTIONS.delete(cb).action();
    expect(cb).toHaveBeenCalledOnce();
  });
});

describe('SWIPE_ACTIONS.pin', () => {
  it('returns a valid SwipeAction', () => {
    assertSwipeActionShape(SWIPE_ACTIONS.pin(vi.fn()));
  });

  it('label is "Fixar"', () => {
    expect(SWIPE_ACTIONS.pin(vi.fn()).label).toBe('Fixar');
  });

  it('action callback is invoked when called', () => {
    const cb = vi.fn();
    SWIPE_ACTIONS.pin(cb).action();
    expect(cb).toHaveBeenCalledOnce();
  });
});

describe('SWIPE_ACTIONS.unpin', () => {
  it('returns a valid SwipeAction', () => {
    assertSwipeActionShape(SWIPE_ACTIONS.unpin(vi.fn()));
  });

  it('label is "Desafixar"', () => {
    expect(SWIPE_ACTIONS.unpin(vi.fn()).label).toBe('Desafixar');
  });

  it('action callback is invoked when called', () => {
    const cb = vi.fn();
    SWIPE_ACTIONS.unpin(cb).action();
    expect(cb).toHaveBeenCalledOnce();
  });
});

describe('SWIPE_ACTIONS.star', () => {
  it('returns a valid SwipeAction', () => {
    assertSwipeActionShape(SWIPE_ACTIONS.star(vi.fn()));
  });

  it('label is "Favoritar"', () => {
    expect(SWIPE_ACTIONS.star(vi.fn()).label).toBe('Favoritar');
  });

  it('action callback is invoked when called', () => {
    const cb = vi.fn();
    SWIPE_ACTIONS.star(cb).action();
    expect(cb).toHaveBeenCalledOnce();
  });
});

describe('SWIPE_ACTIONS.mute', () => {
  it('returns a valid SwipeAction', () => {
    assertSwipeActionShape(SWIPE_ACTIONS.mute(vi.fn()));
  });

  it('label is "Silenciar"', () => {
    expect(SWIPE_ACTIONS.mute(vi.fn()).label).toBe('Silenciar');
  });

  it('action callback is invoked when called', () => {
    const cb = vi.fn();
    SWIPE_ACTIONS.mute(cb).action();
    expect(cb).toHaveBeenCalledOnce();
  });
});

describe('SWIPE_ACTIONS.unmute', () => {
  it('returns a valid SwipeAction', () => {
    assertSwipeActionShape(SWIPE_ACTIONS.unmute(vi.fn()));
  });

  it('label is "Ativar som"', () => {
    expect(SWIPE_ACTIONS.unmute(vi.fn()).label).toBe('Ativar som');
  });

  it('action callback is invoked when called', () => {
    const cb = vi.fn();
    SWIPE_ACTIONS.unmute(cb).action();
    expect(cb).toHaveBeenCalledOnce();
  });
});

// ── each factory returns a fresh object ───────────────────────────────────────

describe('SWIPE_ACTIONS factory isolation', () => {
  it('markAsRead returns a new object on each call', () => {
    const a = SWIPE_ACTIONS.markAsRead(vi.fn());
    const b = SWIPE_ACTIONS.markAsRead(vi.fn());
    expect(a).not.toBe(b);
  });

  it('each factory wires its own callback independently', () => {
    const cb1 = vi.fn();
    const cb2 = vi.fn();
    SWIPE_ACTIONS.archive(cb1).action();
    SWIPE_ACTIONS.archive(cb2).action();
    expect(cb1).toHaveBeenCalledOnce();
    expect(cb2).toHaveBeenCalledOnce();
  });
});
