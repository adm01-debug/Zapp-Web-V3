/**
 * Bridge leve para drill-down do AdminWebhookOverviewPage → AdminWebhookEventsPage.
 *
 * Como o roteador é state-based (sem URL params), guardamos os filtros
 * pendentes em `sessionStorage` por um único "consumo": o destino lê uma vez
 * no mount e limpa, evitando que filtros fiquem grudados em navegações
 * subsequentes não relacionadas ao drill-down.
 */

const STORAGE_KEY = 'webhook-events:pending-filters';

export interface WebhookEventsDeepLinkFilters {
  /** Tipo de evento (ex.: 'PRESENCE_UPDATE'). 'all' equivale a sem filtro. */
  eventType?: string;
  /** Nome da instância (ex.: 'wpp2'). 'all' equivale a sem filtro. */
  instance?: string;
}

/** Stores drill-down filter state in sessionStorage for a one-shot transfer to the webhook events page. */
export function setPendingWebhookEventsFilters(filters: WebhookEventsDeepLinkFilters): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(filters));
  } catch {
    // SSR / privacy mode — silently ignore. UX degrada para "sem filtro inicial".
  }
}

/** consume Pending Webhook Events Filters function. */
export function consumePendingWebhookEventsFilters(): WebhookEventsDeepLinkFilters | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(STORAGE_KEY);
    const parsed = JSON.parse(raw) as WebhookEventsDeepLinkFilters;
    if (typeof parsed !== 'object' || parsed === null) return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Helper conveniente para a página Overview: salva os filtros e dispara o
 * evento global `navigate-view` para abrir o log filtrado.
 */
export function openWebhookEventsWithFilters(filters: WebhookEventsDeepLinkFilters): void {
  setPendingWebhookEventsFilters(filters);
  window.dispatchEvent(new CustomEvent('navigate-view', { detail: 'webhook-events' }));
}
