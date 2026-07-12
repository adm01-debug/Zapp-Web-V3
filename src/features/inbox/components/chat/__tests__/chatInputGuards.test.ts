import { describe, it, expect } from 'vitest';
import {
  getQueueLength,
  normalizeAttempts,
  getLastAttemptDuration,
  type QueueItemLike,
} from '../chatInputGuards';

describe('chatInputGuards', () => {
  describe('getQueueLength', () => {
    it('retorna 0 para undefined/null', () => {
      expect(getQueueLength(undefined)).toBe(0);
      expect(getQueueLength(null)).toBe(0);
    });

    it('retorna o length correto para arrays', () => {
      const q: QueueItemLike[] = [
        { id: 'a', status: 'sending' },
        { id: 'b', status: 'confirmed' },
      ];
      expect(getQueueLength(q)).toBe(2);
      expect(getQueueLength([])).toBe(0);
    });
  });

  describe('normalizeAttempts', () => {
    it('devolve array vazio para undefined/null', () => {
      expect(normalizeAttempts(undefined)).toEqual([]);
      expect(normalizeAttempts(null)).toEqual([]);
    });

    it('preserva o array quando presente', () => {
      const attempts = [{ duration: 120 }, { duration: 340 }];
      expect(normalizeAttempts(attempts)).toEqual(attempts);
    });
  });

  describe('getLastAttemptDuration', () => {
    it('retorna undefined quando não há tentativas', () => {
      expect(getLastAttemptDuration(undefined)).toBeUndefined();
      expect(getLastAttemptDuration([])).toBeUndefined();
    });

    it('retorna undefined quando a última tentativa não tem duration válido', () => {
      expect(getLastAttemptDuration([{ duration: undefined }])).toBeUndefined();
      // @ts-expect-error — validando resiliência a payloads malformados
      expect(getLastAttemptDuration([{ duration: 'abc' }])).toBeUndefined();
    });

    it('retorna a duração da última tentativa quando presente', () => {
      expect(getLastAttemptDuration([{ duration: 120 }, { duration: 340 }])).toBe(340);
    });
  });
});
