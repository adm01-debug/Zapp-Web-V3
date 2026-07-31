/**
 * Persistência dos filtros da Inbox (aba ativa, sub-aba, busca, tipo de contato,
 * fila e filtros de falha) entre recarregamentos de página e trocas de rota.
 *
 * Estratégia: a URL é a fonte primária (permite compartilhar links); o
 * localStorage é o fallback quando a URL não traz o parâmetro.
 */
import { safeGetJSON, safeSetJSON } from '@/lib/safeStorage';
import type { MainTab, SubTab } from '../components/TicketTabs';
import type { FailureCategory } from '@/features/inbox';

const STORAGE_KEY = 'inbox_filters_v1';

const MAIN_TABS: MainTab[] = ['open', 'resolved', 'search', 'unread'];
const SUB_TABS: SubTab[] = ['attending', 'waiting'];
const FAILURE_CATEGORIES: (FailureCategory | 'all')[] = [
  'all',
  'auth',
  'http_4xx',
  'http_5xx',
  'network',
  'unknown',
];

export interface PersistedInboxFilters {
  mainTab: MainTab | null;
  subTab: SubTab | null;
  search: string | null;
  contactType: string | null;
  queueId: string | null;
  showOnlyRetrying: boolean | null;
  failureCategory: FailureCategory | 'all' | null;
}

const EMPTY: PersistedInboxFilters = {
  mainTab: null,
  subTab: null,
  search: null,
  contactType: null,
  queueId: null,
  showOnlyRetrying: null,
  failureCategory: null,
};

/** Escopos válidos da Inbox. */
export const INBOX_SCOPES = ['mine', 'department', 'all'] as const;
export type InboxScope = (typeof INBOX_SCOPES)[number];

/** Limite defensivo para o termo de busca vindo da URL (evita URLs abusivas). */
const MAX_SEARCH_LENGTH = 200;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CONTACT_TYPE_RE = /^[a-z0-9_]{1,40}$/;

function pick<T extends string>(value: string | null | undefined, allowed: readonly T[]): T | null {
  return value && (allowed as readonly string[]).includes(value) ? (value as T) : null;
}

function sanitizeSearch(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  // eslint-disable-next-line no-control-regex
  const trimmed = value.replace(/[\x00-\x1F\x7F]/g, '').trim();
  if (!trimmed) return '';
  return trimmed.slice(0, MAX_SEARCH_LENGTH);
}

function sanitizeQueueId(value: string | null | undefined): string | null {
  return typeof value === 'string' && UUID_RE.test(value) ? value : null;
}

function sanitizeContactType(value: string | null | undefined): string | null {
  return typeof value === 'string' && CONTACT_TYPE_RE.test(value) ? value : null;
}

/** Lê os filtros persistidos no localStorage (tolerante a payload inválido). */
export function readStoredInboxFilters(): PersistedInboxFilters {
  const raw = safeGetJSON<Partial<PersistedInboxFilters>>(STORAGE_KEY, {});
  return {
    mainTab: pick(raw.mainTab, MAIN_TABS),
    subTab: pick(raw.subTab, SUB_TABS),
    search: sanitizeSearch(raw.search),
    contactType: sanitizeContactType(raw.contactType),
    queueId: sanitizeQueueId(raw.queueId),
    showOnlyRetrying: typeof raw.showOnlyRetrying === 'boolean' ? raw.showOnlyRetrying : null,
    failureCategory: pick(raw.failureCategory, FAILURE_CATEGORIES),
  };
}

/** Grava os filtros atuais no localStorage. */
export function writeStoredInboxFilters(value: PersistedInboxFilters): void {
  safeSetJSON(STORAGE_KEY, value);
}

/** Lê o escopo da URL/localStorage com fallback seguro para 'mine'. */
export function resolveInitialScope(searchString: string): InboxScope {
  const params = new URLSearchParams(searchString);
  const fromUrl = pick(params.get('scope'), INBOX_SCOPES);
  if (fromUrl) return fromUrl;
  let stored: string | null = null;
  try {
    stored = localStorage.getItem('inbox_scope');
  } catch {
    stored = null;
  }
  return pick(stored, INBOX_SCOPES) ?? 'mine';
}

/** Lê o flag showAll da URL/localStorage aceitando apenas booleanos explícitos. */
export function resolveInitialShowAll(searchString: string): boolean {
  const params = new URLSearchParams(searchString);
  const fromUrl = params.get('showAll');
  if (fromUrl === 'true') return true;
  if (fromUrl === 'false') return false;
  try {
    return localStorage.getItem('inbox_show_all') === 'true';
  } catch {
    return false;
  }
}

/**
 * Remove da query string parâmetros de filtro com valores inválidos
 * (links antigos/manipulados). Retorna a nova query e os nomes removidos.
 */
export function sanitizeInboxUrlParams(searchString: string): {
  search: string;
  removed: string[];
} {
  const params = new URLSearchParams(searchString);
  const removed: string[] = [];
  const drop = (key: string) => {
    params.delete(key);
    removed.push(key);
  };

  const checks: Array<[string, (v: string) => boolean]> = [
    ['tab', (v) => (MAIN_TABS as string[]).includes(v)],
    ['subTab', (v) => (SUB_TABS as string[]).includes(v)],
    ['scope', (v) => (INBOX_SCOPES as readonly string[]).includes(v)],
    ['showAll', (v) => v === 'true' || v === 'false'],
    ['failuresOnly', (v) => v === 'true' || v === 'false'],
    ['failureCategory', (v) => (FAILURE_CATEGORIES as string[]).includes(v)],
    ['queue', (v) => v === 'all' || UUID_RE.test(v)],
    ['type', (v) => v === 'all' || CONTACT_TYPE_RE.test(v)],
    ['q', (v) => v.length <= MAX_SEARCH_LENGTH],
  ];

  for (const [key, isValid] of checks) {
    const value = params.get(key);
    if (value !== null && !isValid(value)) drop(key);
  }

  return { search: params.toString(), removed };
}

/**
 * Resolve o estado inicial combinando URL (prioridade) e localStorage (fallback).
 * Valores inválidos na URL são ignorados e caem no fallback persistido.
 */
export function resolveInitialInboxFilters(searchString: string): PersistedInboxFilters {
  const params = new URLSearchParams(searchString);
  const stored = readStoredInboxFilters();

  const urlType = sanitizeContactType(params.get('type'));
  const urlQueue = sanitizeQueueId(params.get('queue'));
  const urlSearch = sanitizeSearch(params.get('q'));
  const urlFailures = params.get('failuresOnly');
  const rawType = params.get('type');
  const rawQueue = params.get('queue');

  return {
    mainTab: pick(params.get('tab'), MAIN_TABS) ?? stored.mainTab ?? EMPTY.mainTab,
    subTab: pick(params.get('subTab'), SUB_TABS) ?? stored.subTab ?? EMPTY.subTab,
    search: urlSearch !== null ? urlSearch : stored.search,
    contactType: urlType && urlType !== 'all' ? urlType : (rawType === 'all' ? null : stored.contactType),
    queueId: urlQueue ?? (rawQueue === 'all' ? null : stored.queueId),
    showOnlyRetrying:
      urlFailures === 'true' ? true : urlFailures === 'false' ? false : stored.showOnlyRetrying,
    failureCategory:
      pick(params.get('failureCategory'), FAILURE_CATEGORIES) ?? stored.failureCategory,
  };
}

