/**
 * Sincronização de presets de filtros da Inbox com o backend.
 *
 * Os presets são persistidos em `saved_filters` (schema zapp) com
 * `entity_type = 'inbox_filters'`, escopados por `user_id` via RLS.
 * O localStorage continua funcionando como cache offline/otimista.
 */
import { safeFrom } from '@/integrations/supabase/safeClient';
import { supabase } from '@/integrations/supabase/client';
import { getLogger } from '@/lib/logger';
import { MODULE_TTL_MS } from '@/lib/queryStaleTimes';
import type { InboxFilterPreset } from './inboxFilterPresets';
import { MAX_INBOX_PRESETS } from './inboxFilterPresets';

const log = getLogger('inboxPresetsSync');

// ── Cache module-level (TTL 2min) ─────────────────────────────────────────
// saved_filters é quase-estático (presets do usuário). O useEffect de sync
// roda a cada mount da Inbox — o cache evita o refetch repetido. upserts
// locais atualizam o cache inline.
const PRESETS_TTL_MS = MODULE_TTL_MS.userPrefs;
let presetsCache: { data: InboxFilterPreset[]; fetchedAt: number } | null = null;

export const INBOX_PRESET_ENTITY = 'inbox_filters';

interface SavedFilterRow {
  id: string;
  name: string;
  filters: unknown;
  created_at: string | null;
}

/** Campos do preset guardados dentro da coluna `filters` (jsonb). */
type PresetPayload = Omit<InboxFilterPreset, 'id' | 'name' | 'createdAt'>;

function toPayload(preset: InboxFilterPreset): PresetPayload {
  return {
    mainTab: preset.mainTab,
    subTab: preset.subTab,
    search: preset.search ?? '',
    contactType: preset.contactType ?? null,
    queueId: preset.queueId ?? null,
    showOnlyRetrying: Boolean(preset.showOnlyRetrying),
    failureCategory: preset.failureCategory ?? 'all',
  };
}

function fromRow(row: SavedFilterRow): InboxFilterPreset | null {
  const f = (row.filters ?? {}) as Partial<PresetPayload>;
  if (!row.id || typeof row.name !== 'string' || typeof f.mainTab !== 'string') return null;
  return {
    id: row.id,
    name: row.name,
    createdAt: row.created_at ?? new Date().toISOString(),
    mainTab: f.mainTab as InboxFilterPreset['mainTab'],
    subTab: (f.subTab ?? 'waiting') as InboxFilterPreset['subTab'],
    search: typeof f.search === 'string' ? f.search : '',
    contactType: typeof f.contactType === 'string' ? f.contactType : null,
    queueId: typeof f.queueId === 'string' ? f.queueId : null,
    showOnlyRetrying: Boolean(f.showOnlyRetrying),
    failureCategory: (f.failureCategory ?? 'all') as InboxFilterPreset['failureCategory'],
  };
}

async function getUserId(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getUser();
    return data.user?.id ?? null;
  } catch (error) {
    log.warn('Não foi possível obter o usuário atual para sincronizar presets', { error });
    return null;
  }
}

/** Busca os presets do usuário autenticado. Retorna `null` quando indisponível. */
export async function fetchRemoteInboxPresets(): Promise<InboxFilterPreset[] | null> {
  const userId = await getUserId();
  if (!userId) return null;

  // TTL: presets quase-estáticos — evita refetch a cada mount da Inbox.
  if (presetsCache && Date.now() - presetsCache.fetchedAt < PRESETS_TTL_MS) {
    return presetsCache.data;
  }

  try {
    const { data, error } = await safeFrom('saved_filters')
      .select('id, name, filters, created_at')
      .eq('user_id', userId)
      .eq('entity_type', INBOX_PRESET_ENTITY)
      .order('created_at', { ascending: false })
      .limit(MAX_INBOX_PRESETS);

    if (error) throw error;

    const presets = ((data ?? []) as SavedFilterRow[])
      .map(fromRow)
      .filter((p): p is InboxFilterPreset => p !== null);
    presetsCache = { data: presets, fetchedAt: Date.now() };
    return presets;
  } catch (error) {
    log.warn('Falha ao carregar presets remotos', { error });
    return null;
  }
}

/** Cria/atualiza um preset remoto. Idempotente por (user_id, entity_type, name). */
export async function upsertRemoteInboxPreset(
  preset: InboxFilterPreset
): Promise<InboxFilterPreset | null> {
  const userId = await getUserId();
  if (!userId) return null;

  try {
    const { data: existing } = await safeFrom('saved_filters')
      .select('id')
      .eq('user_id', userId)
      .eq('entity_type', INBOX_PRESET_ENTITY)
      .ilike('name', preset.name)
      .maybeSingle();

    const existingId = (existing as { id?: string } | null)?.id;
    const row = {
      id: existingId ?? preset.id,
      user_id: userId,
      entity_type: INBOX_PRESET_ENTITY,
      name: preset.name,
      filters: toPayload(preset),
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await safeFrom('saved_filters')
      .upsert(row, { onConflict: 'id' })
      .select('id, name, filters, created_at')
      .maybeSingle();

    if (error) throw error;
    const saved = data ? fromRow(data as SavedFilterRow) : null;
    if (saved) {
      // Mantém o cache coerente com o upsert local.
      presetsCache = {
        data: [saved, ...(presetsCache?.data ?? []).filter((p) => p.id !== saved.id)],
        fetchedAt: Date.now(),
      };
    }
    return saved;
  } catch (error) {
    log.warn('Falha ao salvar preset remoto', { error, name: preset.name });
    return null;
  }
}

/** Remove um preset remoto pelo id. */
export async function deleteRemoteInboxPreset(id: string): Promise<void> {
  const userId = await getUserId();
  if (!userId) return;

  try {
    const { error } = await safeFrom('saved_filters')
      .delete()
      .eq('id', id)
      .eq('user_id', userId)
      .eq('entity_type', INBOX_PRESET_ENTITY);
    if (error) throw error;
    // Remove do cache para manter coerência.
    if (presetsCache) {
      presetsCache = {
        data: presetsCache.data.filter((p) => p.id !== id),
        fetchedAt: Date.now(),
      };
    }
  } catch (error) {
    log.warn('Falha ao remover preset remoto', { error, id });
  }
}

/**
 * Mescla presets locais e remotos por nome (case-insensitive).
 * O remoto vence em caso de conflito — é a fonte da verdade entre dispositivos.
 */
export function mergeInboxPresets(
  local: InboxFilterPreset[],
  remote: InboxFilterPreset[]
): InboxFilterPreset[] {
  const byName = new Map<string, InboxFilterPreset>();
  for (const p of local) byName.set(p.name.trim().toLowerCase(), p);
  for (const p of remote) byName.set(p.name.trim().toLowerCase(), p);
  return Array.from(byName.values())
    .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))
    .slice(0, MAX_INBOX_PRESETS);
}

/** Envia presets locais ainda ausentes no backend (primeira sincronização). */
export async function pushLocalOnlyPresets(
  local: InboxFilterPreset[],
  remote: InboxFilterPreset[]
): Promise<void> {
  const remoteNames = new Set(remote.map((p) => p.name.trim().toLowerCase()));
  const pending = local.filter((p) => !remoteNames.has(p.name.trim().toLowerCase()));
  for (const preset of pending) {
    await upsertRemoteInboxPreset(preset);
  }
}
