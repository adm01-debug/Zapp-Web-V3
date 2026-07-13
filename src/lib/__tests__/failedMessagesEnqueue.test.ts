import { describe, it, expect } from 'vitest';
import { __test__ } from '@/lib/failedMessagesEnqueue';

const { isTransientFailure, isSendPath } = __test__;

// ── isSendPath ────────────────────────────────────────────────────────────────

describe('isSendPath — paths that match', () => {
  it('matches /message/ prefix', () => {
    expect(isSendPath('/message/text')).toBe(true);
  });

  it('matches exactly /message/', () => {
    expect(isSendPath('/message/')).toBe(true);
  });

  it('matches /message/ anywhere in the path', () => {
    expect(isSendPath('/v2/api/message/send')).toBe(true);
  });

  it('matches /message/sendText', () => {
    expect(isSendPath('/message/sendText')).toBe(true);
  });

  it('matches /message/sendMedia', () => {
    expect(isSendPath('/message/sendMedia')).toBe(true);
  });
});

describe('isSendPath — paths that do NOT match', () => {
  it('does not match /messages/', () => {
    expect(isSendPath('/messages/')).toBe(false);
  });

  it('does not match empty string', () => {
    expect(isSendPath('')).toBe(false);
  });

  it('does not match /status/ path', () => {
    expect(isSendPath('/status/check')).toBe(false);
  });

  it('does not match /instance/ path', () => {
    expect(isSendPath('/instance/info')).toBe(false);
  });

  it('does not match root path', () => {
    expect(isSendPath('/')).toBe(false);
  });
});

// ── isTransientFailure ────────────────────────────────────────────────────────

describe('isTransientFailure — null status (error_code driven)', () => {
  it('returns true when error_code is "timeout"', () => {
    expect(isTransientFailure({
      instance_name: 'i', path: '/p', payload: {},
      http_status: null, error_code: 'timeout',
    })).toBe(true);
  });

  it('returns true when error_code is "network_error"', () => {
    expect(isTransientFailure({
      instance_name: 'i', path: '/p', payload: {},
      http_status: null, error_code: 'network_error',
    })).toBe(true);
  });

  it('returns false when error_code is unknown and status is null', () => {
    expect(isTransientFailure({
      instance_name: 'i', path: '/p', payload: {},
      http_status: null, error_code: 'some_other_error',
    })).toBe(false);
  });

  it('returns false when error_code is undefined and status is null', () => {
    expect(isTransientFailure({
      instance_name: 'i', path: '/p', payload: {},
      http_status: null, error_code: null,
    })).toBe(false);
  });
});

describe('isTransientFailure — permanent HTTP status codes', () => {
  it('returns false for 400 Bad Request', () => {
    expect(isTransientFailure({
      instance_name: 'i', path: '/p', payload: {}, http_status: 400,
    })).toBe(false);
  });

  it('returns false for 401 Unauthorized', () => {
    expect(isTransientFailure({
      instance_name: 'i', path: '/p', payload: {}, http_status: 401,
    })).toBe(false);
  });

  it('returns false for 403 Forbidden', () => {
    expect(isTransientFailure({
      instance_name: 'i', path: '/p', payload: {}, http_status: 403,
    })).toBe(false);
  });

  it('returns false for 404 Not Found', () => {
    expect(isTransientFailure({
      instance_name: 'i', path: '/p', payload: {}, http_status: 404,
    })).toBe(false);
  });

  it('returns false for 422 Unprocessable Entity', () => {
    expect(isTransientFailure({
      instance_name: 'i', path: '/p', payload: {}, http_status: 422,
    })).toBe(false);
  });
});

describe('isTransientFailure — transient HTTP status codes', () => {
  it('returns true for 429 Too Many Requests', () => {
    expect(isTransientFailure({
      instance_name: 'i', path: '/p', payload: {}, http_status: 429,
    })).toBe(true);
  });

  it('returns true for 500 Internal Server Error', () => {
    expect(isTransientFailure({
      instance_name: 'i', path: '/p', payload: {}, http_status: 500,
    })).toBe(true);
  });

  it('returns true for 502 Bad Gateway', () => {
    expect(isTransientFailure({
      instance_name: 'i', path: '/p', payload: {}, http_status: 502,
    })).toBe(true);
  });

  it('returns true for 503 Service Unavailable', () => {
    expect(isTransientFailure({
      instance_name: 'i', path: '/p', payload: {}, http_status: 503,
    })).toBe(true);
  });

  it('returns true for 504 Gateway Timeout', () => {
    expect(isTransientFailure({
      instance_name: 'i', path: '/p', payload: {}, http_status: 504,
    })).toBe(true);
  });

  it('returns true for 599 (boundary of 5xx range)', () => {
    expect(isTransientFailure({
      instance_name: 'i', path: '/p', payload: {}, http_status: 599,
    })).toBe(true);
  });
});

describe('isTransientFailure — non-transient HTTP status codes', () => {
  it('returns false for 200 OK', () => {
    expect(isTransientFailure({
      instance_name: 'i', path: '/p', payload: {}, http_status: 200,
    })).toBe(false);
  });

  it('returns false for 201 Created', () => {
    expect(isTransientFailure({
      instance_name: 'i', path: '/p', payload: {}, http_status: 201,
    })).toBe(false);
  });

  it('returns false for 301 Redirect', () => {
    expect(isTransientFailure({
      instance_name: 'i', path: '/p', payload: {}, http_status: 301,
    })).toBe(false);
  });
});
