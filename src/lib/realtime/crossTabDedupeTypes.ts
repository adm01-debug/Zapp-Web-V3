/** L S_ L O C K_ P R E F I X constant. */
export const LS_LOCK_PREFIX = 'ctd:lock:';
/** L S_ R E S U L T_ P R E F I X constant. */
export const LS_RESULT_PREFIX = 'ctd:result:';
/** L S_ B U S_ P R E F I X constant. */
export const LS_BUS_PREFIX = 'ctd:bus:'; // fallback de "broadcast" via storage event
/** B C_ N A M E constant. */
export const BC_NAME = 'cross-tab-dedupe';
/** D E F A U L T_ L O C K_ T T L constant. */
export const DEFAULT_LOCK_TTL = 10_000; // 10s — máximo razoável para pageload de 100 msgs
/** D E F A U L T_ R E S U L T_ T T L constant. */
export const DEFAULT_RESULT_TTL = 30_000; // resultado fica em cache 30s
/** D E F A U L T_ W A I T_ T I M E O U T constant. */
export const DEFAULT_WAIT_TIMEOUT = 8_000;
/** G C_ I N T E R V A L constant. */
export const GC_INTERVAL = 60_000; // varre chaves expiradas a cada 60s
/** B U S_ M S G_ T T L constant. */
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

/** Broadcast Message interface definition. */
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
