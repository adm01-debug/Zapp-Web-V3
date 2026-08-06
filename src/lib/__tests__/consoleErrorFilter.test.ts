/**
 * Tests for isBenignConsoleNoise (src/lib/consoleErrorFilter.ts).
 *
 * O helper é o filtro único de ruído benigno de console usado pelos handlers
 * globais de window 'error' / 'unhandledrejection' (main.tsx) e pelo
 * beforeSend do Sentry (sentry.ts). Erros reais NUNCA podem ser suprimidos.
 */
import { describe, it, expect } from 'vitest';
import { isBenignConsoleNoise } from '../consoleErrorFilter';

describe('isBenignConsoleNoise', () => {
  describe('ResizeObserver loop', () => {
    it('returns true for the classic "loop completed" Error', () => {
      const err = new Error('ResizeObserver loop completed with undelivered notifications.');
      expect(isBenignConsoleNoise(err)).toBe(true);
    });

    it('returns true for the raw message string', () => {
      expect(
        isBenignConsoleNoise('ResizeObserver loop completed with undelivered notifications.')
      ).toBe(true);
    });

    it('returns true for "ResizeObserver loop limit exceeded"', () => {
      expect(isBenignConsoleNoise('ResizeObserver loop limit exceeded')).toBe(true);
    });

    it('returns true for a plain object carrying the message', () => {
      expect(
        isBenignConsoleNoise({
          message: 'ResizeObserver loop completed with undelivered notifications.',
        })
      ).toBe(true);
    });

    it('returns true when error.name is ResizeObserver', () => {
      expect(isBenignConsoleNoise({ name: 'ResizeObserver', message: 'something' })).toBe(true);
    });

    it('does NOT filter "ResizeObserver is not defined" (real bug)', () => {
      const err = new ReferenceError('ResizeObserver is not defined');
      expect(isBenignConsoleNoise(err)).toBe(false);
    });
  });

  describe('Script error.', () => {
    it('returns true for a Script error. Error', () => {
      expect(isBenignConsoleNoise(new Error('Script error.'))).toBe(true);
    });

    it('returns true for the raw "Script error." string', () => {
      expect(isBenignConsoleNoise('Script error.')).toBe(true);
    });
  });

  describe('extension noise', () => {
    it('returns true for "Extension context invalidated"', () => {
      const err = new Error('Extension context invalidated. Running scripts is no longer allowed.');
      expect(isBenignConsoleNoise(err)).toBe(true);
    });

    it('returns true for chrome-extension:// messages', () => {
      expect(isBenignConsoleNoise('Uncaught TypeError from chrome-extension://abc/script.js')).toBe(
        true
      );
    });

    it('returns true for moz-extension:// messages', () => {
      expect(isBenignConsoleNoise('moz-extension://script failed')).toBe(true);
    });
  });

  describe('known browser rejection names (via reject)', () => {
    it('returns true for a TimeoutError rejection reason (DOMException)', async () => {
      const reason = new DOMException('The operation timed out.', 'TimeoutError');
      await expect(Promise.reject(reason)).rejects.toBe(reason);
      expect(isBenignConsoleNoise(reason)).toBe(true);
    });

    it('returns true for a plain TimeoutError-shaped rejection reason', () => {
      expect(isBenignConsoleNoise({ name: 'TimeoutError', message: 'The operation timed out.' })).toBe(
        true
      );
    });

    it('returns true for InvalidStateError', () => {
      expect(isBenignConsoleNoise(new DOMException('Operation invalid', 'InvalidStateError'))).toBe(
        true
      );
    });

    it('returns true for an Error with name set to TimeoutError', () => {
      const err = new Error('timed out');
      err.name = 'TimeoutError';
      expect(isBenignConsoleNoise(err)).toBe(true);
    });
  });

  describe('real errors are NEVER suppressed', () => {
    it('returns false for a TypeError', () => {
      expect(
        isBenignConsoleNoise(new TypeError("Cannot read properties of undefined (reading 'foo')"))
      ).toBe(false);
    });

    it('returns false for a common Error', () => {
      expect(isBenignConsoleNoise(new Error('Something real broke'))).toBe(false);
    });

    it('returns false for a non-Error rejection object', () => {
      expect(isBenignConsoleNoise({ status: 500, body: 'boom' })).toBe(false);
    });

    it('returns false for undefined', () => {
      expect(isBenignConsoleNoise(undefined)).toBe(false);
    });

    it('returns false for null', () => {
      expect(isBenignConsoleNoise(null)).toBe(false);
    });

    it('returns false for primitives (numbers)', () => {
      expect(isBenignConsoleNoise(42)).toBe(false);
    });

    it('returns false for an empty string', () => {
      expect(isBenignConsoleNoise('')).toBe(false);
    });

    it('returns false for a TypeError mentioning ResizeObserver (not the loop noise)', () => {
      // 'ResizeObserver is not defined' NÃO é ruído — é bug real de runtime.
      expect(isBenignConsoleNoise(new TypeError('ResizeObserver is not defined at App'))).toBe(
        false
      );
    });
  });

  describe('Sentry beforeSend parity', () => {
    it('returns true for Non-Error promise rejection (Sentry filter)', () => {
      expect(isBenignConsoleNoise('Non-Error promise rejection captured with value: undefined')).toBe(
        true
      );
    });
  });
});
