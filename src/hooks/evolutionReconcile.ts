/**
 * evolutionReconcile — Optimistic-to-canonical reconciliation utilities.
 * Shared by useExternalConversations and useExternalMessages.
 */
import { playerStateStore } from '@/features/inbox';
import { recordMatch } from '@/features/inbox';
import type { RealtimeMessage } from '@/features/inbox';

export const OPTIMISTIC_PREFIX = 'optimistic:';
const OPTIMISTIC_FALLBACK_WINDOW_MS = 120_000;
const MEDIA_TYPES = new Set(['audio', 'image', 'video', 'document', 'sticker']);

/**
 * Hierarquia oficial de status do envio. Reconciliação NUNCA regride.
 * Inclui `played` (PTT ouvido) acima de `read`.
 */
const STATUS_RANK: Record<string, number> = {
  sending: 0,
  retrying: 1,
  sent: 2,
  delivered: 3,
  read: 4,
  played: 5,
};

function rankOf(status: string | null | undefined): number {
  if (!status) return -1;
  return STATUS_RANK[status] ?? -1;
}

function promoteStatus(
  optimistic: RealtimeMessage,
  canonical: RealtimeMessage
): { status: RealtimeMessage['status']; status_updated_at: string | null } {
  const optRank = rankOf(optimistic.status);
  const canRank = rankOf(canonical.status);
  if (optRank > canRank) {
    return {
      status: optimistic.status,
      status_updated_at: optimistic.status_updated_at ?? canonical.status_updated_at,
    };
  }
  return {
    status: canonical.status,
    status_updated_at: canonical.status_updated_at ?? optimistic.status_updated_at,
  };
}

export interface ReconcileResult {
  filteredPrev: RealtimeMessage[];
  additions: RealtimeMessage[];
  /** Map<optimisticId, canonicalId> — usado para migrar estado de player. */
  remap: Map<string, string>;
}

function resolveAudioType(m: RealtimeMessage): string {
  if (m.message_type !== 'audio') return m.message_type;
  const mExt = m as Record<string, unknown>;
  const isPtt = (mExt.media_meta as Record<string, unknown> | undefined)?.ptt === true;
  const isMeme = !!mExt.audio_meme_id;
  return isMeme ? 'audio_meme' : isPtt ? 'audio_ptt' : 'audio_recorded';
}

export function reconcileOptimistic(
  prev: RealtimeMessage[],
  incoming: RealtimeMessage[]
): ReconcileResult {
  if (incoming.length === 0) {
    return { filteredPrev: prev, additions: [], remap: new Map() };
  }

  const incomingExternalIds = new Set(
    incoming.map((m) => m.external_id).filter((v): v is string => Boolean(v))
  );

  const canonicalPatches = new Map<string, Partial<RealtimeMessage>>();
  const remap = new Map<string, string>();

  function ensurePatch(id: string): Partial<RealtimeMessage> {
    let p = canonicalPatches.get(id);
    if (!p) {
      p = {};
      canonicalPatches.set(id, p);
    }
    return p;
  }

  const filteredPrev = prev.filter((m) => {
    if (!m.id.startsWith(OPTIMISTIC_PREFIX)) return true;

    // Case 1: external_id match.
    if (m.external_id && incomingExternalIds.has(m.external_id)) {
      const can = incoming.find((c) => c.external_id === m.external_id);
      if (can) {
        remap.set(m.id, can.id);
        const patch = ensurePatch(can.id);
        const promoted = promoteStatus(m, can);
        patch.status = promoted.status;
        patch.status_updated_at = promoted.status_updated_at;
        if (!can.media_url && m.media_url) patch.media_url = m.media_url;
        if (can.reactions && can.reactions.length > 0) patch.reactions = can.reactions;
        recordMatch({
          strategy: 'external_id',
          messageType: resolveAudioType(m),
          optimisticId: m.id,
          canonicalId: can.id,
        });
      }
      return false;
    }

    if (m.external_id) return true;

    const optTime = new Date(m.created_at).getTime();
    const isMediaOpt = MEDIA_TYPES.has(m.message_type);

    // Case 3: media fallback.
    if (isMediaOpt) {
      const match = incoming.find(
        (inc) =>
          inc.sender === m.sender &&
          inc.message_type === m.message_type &&
          Math.abs(new Date(inc.created_at).getTime() - optTime) <= OPTIMISTIC_FALLBACK_WINDOW_MS
      );
      if (match) {
        remap.set(m.id, match.id);
        const patch = ensurePatch(match.id);
        const promoted = promoteStatus(m, match);
        patch.status = promoted.status;
        patch.status_updated_at = promoted.status_updated_at;
        if (!match.media_url && m.media_url) patch.media_url = m.media_url;
        if (match.reactions && match.reactions.length > 0) patch.reactions = match.reactions;
        recordMatch({
          strategy: 'media_fallback',
          messageType: resolveAudioType(m),
          optimisticId: m.id,
          canonicalId: match.id,
          deltaMs: Math.abs(new Date(match.created_at).getTime() - optTime),
        });
        return false;
      }
      return true;
    }

    // Case 2: text fallback.
    const match = incoming.find(
      (inc) =>
        inc.sender === m.sender &&
        inc.message_type === m.message_type &&
        inc.content === m.content &&
        Math.abs(new Date(inc.created_at).getTime() - optTime) <= OPTIMISTIC_FALLBACK_WINDOW_MS
    );
    if (match) {
      remap.set(m.id, match.id);
      const patch = ensurePatch(match.id);
      const promoted = promoteStatus(m, match);
      patch.status = promoted.status;
      patch.status_updated_at = promoted.status_updated_at;
      recordMatch({
        strategy: 'text_fallback',
        messageType: m.message_type,
        optimisticId: m.id,
        canonicalId: match.id,
        deltaMs: Math.abs(new Date(match.created_at).getTime() - optTime),
      });
      return false;
    }
    return true;
  });

  const seen = new Set(filteredPrev.map((m) => m.id));
  const additions: RealtimeMessage[] = [];
  for (const m of incoming) {
    if (!seen.has(m.id)) {
      const patch = canonicalPatches.get(m.id);
      additions.push(patch ? { ...m, ...patch } : m);
      seen.add(m.id);
    }
  }
  return { filteredPrev, additions, remap };
}

/**
 * Aplica uma reconciliação como transação atômica: migra estado do player e
 * atualiza mensagens em um único setState.
 */
export function applyReconciliation(
  setMessages: (updater: (prev: RealtimeMessage[]) => RealtimeMessage[]) => void,
  incoming: RealtimeMessage[],
  merge: (filteredPrev: RealtimeMessage[], additions: RealtimeMessage[]) => RealtimeMessage[]
): { remapSize: number } {
  let remapSize = 0;
  setMessages((prev) => {
    const result = reconcileOptimistic(prev, incoming);
    if (result.remap.size > 0) {
      for (const [from, to] of result.remap) {
        playerStateStore.migrate(from, to);
      }
      remapSize = result.remap.size;
    }
    if (result.additions.length === 0 && result.filteredPrev.length === prev.length) {
      return prev;
    }
    return merge(result.filteredPrev, result.additions);
  });
  return { remapSize };
}
