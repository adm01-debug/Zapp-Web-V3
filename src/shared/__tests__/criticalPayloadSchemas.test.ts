import { describe, it, expect } from 'vitest';
import { ContractErrorCode, mapValidationIssuesToContractError } from '../criticalPayloadSchemas';

// ── ContractErrorCode — structure ─────────────────────────────────────────────

describe('ContractErrorCode — structure', () => {
  it('is a non-null object', () => {
    expect(typeof ContractErrorCode).toBe('object');
    expect(ContractErrorCode).not.toBeNull();
  });

  it('has exactly 4 keys', () => {
    expect(Object.keys(ContractErrorCode)).toHaveLength(4);
  });

  it('all values are non-empty strings', () => {
    Object.values(ContractErrorCode).forEach((v) => {
      expect(typeof v).toBe('string');
      expect(v.length).toBeGreaterThan(0);
    });
  });

  it('all values are unique', () => {
    const values = Object.values(ContractErrorCode);
    expect(new Set(values).size).toBe(values.length);
  });

  it('all values use SCREAMING_SNAKE_CASE format', () => {
    Object.values(ContractErrorCode).forEach((v) => {
      expect(v).toMatch(/^[A-Z][A-Z_]*[A-Z]$/);
    });
  });
});

describe('ContractErrorCode — exact values', () => {
  it('INVALID_PAYLOAD = "INVALID_PAYLOAD"', () => {
    expect(ContractErrorCode.INVALID_PAYLOAD).toBe('INVALID_PAYLOAD');
  });

  it('INVALID_PHONE_NUMBER = "INVALID_PHONE_NUMBER"', () => {
    expect(ContractErrorCode.INVALID_PHONE_NUMBER).toBe('INVALID_PHONE_NUMBER');
  });

  it('EMPTY_MESSAGE = "EMPTY_MESSAGE"', () => {
    expect(ContractErrorCode.EMPTY_MESSAGE).toBe('EMPTY_MESSAGE');
  });

  it('INVALID_INSTANCE = "INVALID_INSTANCE"', () => {
    expect(ContractErrorCode.INVALID_INSTANCE).toBe('INVALID_INSTANCE');
  });
});

// ── mapValidationIssuesToContractError ────────────────────────────────────────

describe('mapValidationIssuesToContractError — default (no match)', () => {
  it('returns INVALID_PAYLOAD for empty issues array', () => {
    const result = mapValidationIssuesToContractError([]);
    expect(result.code).toBe(ContractErrorCode.INVALID_PAYLOAD);
  });

  it('returns INVALID_PAYLOAD when called with no argument', () => {
    const result = mapValidationIssuesToContractError();
    expect(result.code).toBe(ContractErrorCode.INVALID_PAYLOAD);
  });

  it('returns INVALID_PAYLOAD for issues with unrecognized paths', () => {
    const result = mapValidationIssuesToContractError([{ path: ['someOtherField'], message: 'err' }]);
    expect(result.code).toBe(ContractErrorCode.INVALID_PAYLOAD);
  });

  it('returns a non-empty message string', () => {
    const result = mapValidationIssuesToContractError([]);
    expect(typeof result.message).toBe('string');
    expect(result.message.length).toBeGreaterThan(0);
  });
});

describe('mapValidationIssuesToContractError — number path', () => {
  it('returns INVALID_PHONE_NUMBER when an issue path includes "number"', () => {
    const result = mapValidationIssuesToContractError([{ path: ['number'], message: 'bad' }]);
    expect(result.code).toBe(ContractErrorCode.INVALID_PHONE_NUMBER);
  });

  it('returns a non-empty message for INVALID_PHONE_NUMBER', () => {
    const result = mapValidationIssuesToContractError([{ path: ['number'] }]);
    expect(result.message.length).toBeGreaterThan(0);
  });

  it('number path takes priority over text path', () => {
    const result = mapValidationIssuesToContractError([
      { path: ['number'], message: 'bad number' },
      { path: ['text'], message: 'bad text' },
    ]);
    expect(result.code).toBe(ContractErrorCode.INVALID_PHONE_NUMBER);
  });
});

describe('mapValidationIssuesToContractError — text/message path', () => {
  it('returns EMPTY_MESSAGE when an issue path includes "text"', () => {
    const result = mapValidationIssuesToContractError([{ path: ['text'], message: 'empty' }]);
    expect(result.code).toBe(ContractErrorCode.EMPTY_MESSAGE);
  });

  it('returns EMPTY_MESSAGE when an issue path includes "message"', () => {
    const result = mapValidationIssuesToContractError([{ path: ['message'], message: 'empty' }]);
    expect(result.code).toBe(ContractErrorCode.EMPTY_MESSAGE);
  });

  it('returns a non-empty message for EMPTY_MESSAGE', () => {
    const result = mapValidationIssuesToContractError([{ path: ['text'] }]);
    expect(result.message.length).toBeGreaterThan(0);
  });
});

describe('mapValidationIssuesToContractError — instanceName/connectionId path', () => {
  it('returns INVALID_INSTANCE when an issue path includes "instanceName"', () => {
    const result = mapValidationIssuesToContractError([{ path: ['instanceName'], message: 'required' }]);
    expect(result.code).toBe(ContractErrorCode.INVALID_INSTANCE);
  });

  it('returns INVALID_INSTANCE when an issue path includes "connectionId"', () => {
    const result = mapValidationIssuesToContractError([{ path: ['connectionId'], message: 'invalid uuid' }]);
    expect(result.code).toBe(ContractErrorCode.INVALID_INSTANCE);
  });

  it('returns a non-empty message for INVALID_INSTANCE', () => {
    const result = mapValidationIssuesToContractError([{ path: ['instanceName'] }]);
    expect(result.message.length).toBeGreaterThan(0);
  });
});

describe('mapValidationIssuesToContractError — priority order', () => {
  it('number takes precedence over message path', () => {
    const result = mapValidationIssuesToContractError([
      { path: ['message'] },
      { path: ['number'] },
    ]);
    expect(result.code).toBe(ContractErrorCode.INVALID_PHONE_NUMBER);
  });

  it('number takes precedence over instanceName path', () => {
    const result = mapValidationIssuesToContractError([
      { path: ['instanceName'] },
      { path: ['number'] },
    ]);
    expect(result.code).toBe(ContractErrorCode.INVALID_PHONE_NUMBER);
  });

  it('text takes precedence over instanceName when no number issue', () => {
    const result = mapValidationIssuesToContractError([
      { path: ['instanceName'] },
      { path: ['text'] },
    ]);
    expect(result.code).toBe(ContractErrorCode.EMPTY_MESSAGE);
  });

  it('instanceName takes precedence over unknown when no number/text issue', () => {
    const result = mapValidationIssuesToContractError([
      { path: ['other'] },
      { path: ['instanceName'] },
    ]);
    expect(result.code).toBe(ContractErrorCode.INVALID_INSTANCE);
  });
});

describe('mapValidationIssuesToContractError — edge cases', () => {
  it('handles issue with no path property (treats as empty path)', () => {
    const result = mapValidationIssuesToContractError([{ message: 'err' }]);
    expect(result.code).toBe(ContractErrorCode.INVALID_PAYLOAD);
  });

  it('handles issue with numeric path segments', () => {
    const result = mapValidationIssuesToContractError([{ path: [0, 'number'], message: 'err' }]);
    expect(result.code).toBe(ContractErrorCode.INVALID_PHONE_NUMBER);
  });

  it('result always has code and message fields', () => {
    [[], [{ path: ['number'] }], [{ path: ['text'] }], [{ path: ['instanceName'] }]].forEach(
      (issues) => {
        const result = mapValidationIssuesToContractError(issues);
        expect('code' in result).toBe(true);
        expect('message' in result).toBe(true);
      },
    );
  });
});
