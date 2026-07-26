/**
 * Persistência dos filtros da Inbox (aba ativa, sub-aba, busca, tipo de contato,
 * fila e filtros de falha) entre recarregamentos de página e trocas de rota.
 *
 * Estratégia: a URL é a fonte primária (permite compartilhar links); o
 * localStorage é o fallback quando a URL não traz o parâmetro.
 */
import { safeGetJSON, safeSetJSON } from '@/lib/safeStorage';
import type { MainTab, SubTab } from '@/features/inbox/components/TicketTabs';
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

function pick<T extends string>(value: string | null | undefined, allowed: T[]): T | null {
  return value && (allowed as string[]).includes(value) ? (value as T) : null;
}

/** Lê os filtros persistidos no localStorage (tolerante a payload inválido). */
export function readStoredInboxFilters(): PersistedInboxFilters {
  const raw = safeGetJSON<Partial<PersistedInboxFilters>>(STORAGE_KEY, {});
  return {
    mainTab: pick(raw.mainTab, MAIN_TABS),
    subTab: pick(raw.subTab, SUB_TABS),
    search: typeof raw.search === 'string' ? raw.search : null,
    contactType: typeof raw.contactType === 'string' ? raw.contactType : null,
    queueId: typeof raw.queueId === 'string' ? raw.queueId : null,
    showOnlyRetrying: typeof raw.showOnlyRetrying === 'boolean' ? raw.showOnlyRetrying : null,
    failureCategory: pick(raw.failureCategory, FAILURE_CATEGORIES),
  };
}

/** Grava os filtros atuais no localStorage. */
export function writeStoredInboxFilters(value: PersistedInboxFilters): void {
  safeSetJSON(STORAGE_KEY, value);
}

/**
 * Resolve o estado inicial combinando URL (prioridade) e localStorage (fallback).
 */
export function resolveInitialInboxFilters(searchString: string): PersistedInboxFilters {
  const params = new URLSearchParams(searchString);
  const stored = readStoredInboxFilters();

  const urlType = params.get('type');
  const urlQueue = params.get('queue');
  const urlSearch = params.get('q');
  const urlFailures = params.get('failuresOnly');

  return {
    mainTab: pick(params.get('tab'), MAIN_TABS) ?? stored.mainTab ?? EMPTY.mainTab,
    subTab: pick(params.get('subTab'), SUB_TABS) ?? stored.subTab ?? EMPTY.subTab,
    search: urlSearch !== null ? urlSearch : stored.search,
    contactType: urlType && urlType !== 'all' ? urlType : (urlType ? null : stored.contactType),
    queueId: urlQueue && urlQueue !== 'all' ? urlQueue : (urlQueue ? null : stored.queueId),
    showOnlyRetrying:
      urlFailures !== null ? urlFailures === 'true' : stored.showOnlyRetrying,
    failureCategory:
      pick(params.get('failureCategory'), FAILURE_CATEGORIES) ?? stored.failureCategory,
  };
}
