/**
 * Call correlation — agrupa eventos do webhook (CALL + tipos relacionados)
 * por identificador lógico de chamada (call_id / sip session id) por instância.
 *
 * Estratégia de extração (em ordem):
 *  1. payload.callId / payload.call_id
 *  2. payload.id (quando event_type === 'CALL')
 *  3. payload[0].id quando o payload é array (Evolution às vezes envia lista)
 *  4. payload.data.id
 *  5. payload.sip?.callId (compat com gateways SIP)
 *
 * Eventos sem call_id são ignorados pelo modo de correlação.
 */
import type { EvolutionWebhookEvent } from '@/types/evolutionExternal';

/** Call Timeline Entry interface. */
export interface CallTimelineEntry {
  id: string;
  eventType: string;
  status: string | null;
  createdAt: string;
  processed: boolean;
  errorMessage: string | null;
  raw: EvolutionWebhookEvent;
}

/** Call Timeline Group interface definition. */
export interface CallTimelineGroup {
  callId: string;
  instance: string;
  remoteJid: string | null;
  pushName: string | null;
  firstAt: string;
  lastAt: string;
  durationMs: number;
  totalEvents: number;
  errorCount: number;
  finalStatus: string | null;
  events: CallTimelineEntry[];
}

type AnyRec = Record<string, unknown>;

function asRec(v: unknown): AnyRec | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as AnyRec) : null;
}

function pickString(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null;
}

/** Extrai call_id de um payload heterogêneo. */
export function extractCallId(ev: EvolutionWebhookEvent): string | null {
  const p = ev.payload;
  if (!p) return null;

  // payload pode ser array
  if (Array.isArray(p)) {
    for (const item of p) {
      const rec = asRec(item);
      if (!rec) continue;
      const id = pickString(rec.callId) ?? pickString(rec.call_id) ?? pickString(rec.id);
      if (id) return id;
    }
    return null;
  }

  const rec = asRec(p);
  if (!rec) return null;

  const direct =
    pickString(rec.callId) ??
    pickString(rec.call_id) ??
    (ev.event_type.toUpperCase() === 'CALL' ? pickString(rec.id) : null);
  if (direct) return direct;

  const data = asRec(rec.data);
  if (data) {
    const inner = pickString(data.callId) ?? pickString(data.call_id) ?? pickString(data.id);
    if (inner) return inner;
  }

  const sip = asRec(rec.sip);
  if (sip) {
    const sipId = pickString(sip.callId) ?? pickString(sip.call_id);
    if (sipId) return sipId;
  }

  return null;
}

/** Extrai status de chamada do payload (offer, accept, ringing, terminate, ...). */
export function extractCallStatus(ev: EvolutionWebhookEvent): string | null {
  const p = ev.payload;
  if (!p) return null;
  const rec = Array.isArray(p) ? asRec(p[0]) : asRec(p);
  if (!rec) return null;
  return (
    pickString(rec.status) ??
    pickString(rec.event) ??
    pickString((asRec(rec.data) ?? {}).status) ??
    null
  );
}

/**
 * Agrupa eventos por (call_id, instância) e retorna timelines ordenadas
 * cronologicamente (do mais recente para o mais antigo entre grupos,
 * mas cronológica ascendente dentro de cada timeline).
 */
export function groupEventsByCall(events: EvolutionWebhookEvent[]): CallTimelineGroup[] {
  const map = new Map<string, CallTimelineGroup>();

  for (const ev of events) {
    const callId = extractCallId(ev);
    if (!callId) continue;

    const key = `${ev.instance_name}::${callId}`;
    const status = extractCallStatus(ev);
    const entry: CallTimelineEntry = {
      id: ev.id,
      eventType: ev.event_type,
      status,
      createdAt: ev.created_at,
      processed: ev.processed,
      errorMessage: ev.error_message,
      raw: ev,
    };

    const existing = map.get(key);
    if (!existing) {
      map.set(key, {
        callId,
        instance: ev.instance_name,
        remoteJid: ev.remote_jid,
        pushName: ev.push_name,
        firstAt: ev.created_at,
        lastAt: ev.created_at,
        durationMs: 0,
        totalEvents: 1,
        errorCount: ev.error_message ? 1 : 0,
        finalStatus: status,
        events: [entry],
      });
      continue;
    }

    existing.events.push(entry);
    existing.totalEvents += 1;
    if (ev.error_message) existing.errorCount += 1;
    if (!existing.pushName && ev.push_name) existing.pushName = ev.push_name;
    if (!existing.remoteJid && ev.remote_jid) existing.remoteJid = ev.remote_jid;
    if (new Date(ev.created_at) < new Date(existing.firstAt)) existing.firstAt = ev.created_at;
    if (new Date(ev.created_at) > new Date(existing.lastAt)) {
      existing.lastAt = ev.created_at;
      if (status) existing.finalStatus = status;
    }
  }

  // Ordena timelines internas e calcula duração
  const groups = [...map.values()];
  for (const g of groups) {
    g.events.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    g.durationMs = new Date(g.lastAt).getTime() - new Date(g.firstAt).getTime();
  }

  // Mais recentes primeiro
  groups.sort((a, b) => new Date(b.lastAt).getTime() - new Date(a.lastAt).getTime());
  return groups;
}

/** format Duration function. */
export function formatDuration(ms: number): string {
  if (ms <= 0) return '—';
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rest = s % 60;
  return rest === 0 ? `${m}min` : `${m}min ${rest}s`;
}
