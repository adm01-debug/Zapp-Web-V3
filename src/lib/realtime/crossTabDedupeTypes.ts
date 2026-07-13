export const LS_LOCK_PREFIX = 'ctd:lock:';
export const LS_RESULT_PREFIX = 'ctd:result:';
export const LS_BUS_PREFIX = 'ctd:bus:'; // fallback de "broadcast" via storage event
export const BC_NAME = 'cross-tab-dedupe';
export const DEFAULT_LOCK_TTL = 10_000; // 10s — máximo razoável para pageload de 100 msgs
export const DEFAULT_RESULT_TTL = 30_000; // resultado fica em cache 30s
export const DEFAULT_WAIT_TIMEOUT = 8_000;
export const GC_INTERVAL = 60_000; // varre chaves expiradas a cada 60s
export const BUS_MSG_TTL = 15_000; // mensagens de bus expiram rápido (storage GC)

/** @internal — exposto para testes que precisam do prefixo de lock. */
export const LS_PREFIX = LS_LOCK_PREFIX;

export const TAB_ID = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export type Transport = 'broadcast-channel' | 'storage-event' | 'none';

export interface LockPayload {
  ownerId: string;
  acquiredAt: number;
  expiresAt: number;
}

export interface BroadcastMessage<T = unknown> {
  type: 'result' | 'error' | 'release';
  key: string;
  ownerId: string;
  data?: T;
  error?: string;
  ts: number;
  /** TTL do resultado (ms) — para que abas receptoras respeitem o mesmo prazo. */
  resultTtl?: number;
}

export interface DedupeOptions {
  /** TTL do lock no localStorage (ms). Default 10s. */
  lockTtl?: number;
  /** TTL do resultado em cache (ms). Default 30s. */
  resultTtl?: number;
  /** Quanto esperar pelo broadcast antes de fazer fetch direto (ms). Default 8s. */
  waitTimeout?: number;
}

export interface ResultPayload<T = unknown> {
  value: T;
  expiresAt: number;
}
