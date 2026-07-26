/**
 * Presets de filtros da Inbox.
 *
 * Permite salvar combinações comuns de aba/sub-aba/busca/filtros auxiliares
 * e recarregá-las depois. Persistido em localStorage (por navegador/usuário).
 */
import { safeGetJSON, safeSetJSON } from '@/lib/safeStorage';
import type { MainTab, SubTab } from '@/features/inbox/components/TicketTabs';
import type { FailureCategory } from '@/features/inbox';

const PRESETS_KEY = 'inbox_filter_presets_v1';

export const MAX_INBOX_PRESETS = 20;

export interface InboxFilterPreset {
  id: string;
  name: string;
  createdAt: string;
  mainTab: MainTab;
  subTab: SubTab;
  search: string;
  contactType: string | null;
  queueId: string | null;
  showOnlyRetrying: boolean;
  failureCategory: FailureCategory | 'all';
}

/** Payload aceito ao criar um preset (sem metadados gerados). */
export type InboxFilterPresetInput = Omit<InboxFilterPreset, 'id' | 'createdAt'>;

function isPreset(value: unknown): value is InboxFilterPreset {
  if (!value || typeof value !== 'object') return false;
  const p = value as Partial<InboxFilterPreset>;
  return typeof p.id === 'string' && typeof p.name === 'string' && typeof p.mainTab === 'string';
}

/** Lê os presets salvos, ignorando entradas corrompidas. */
export function readInboxPresets(): InboxFilterPreset[] {
  const raw = safeGetJSON<unknown[]>(PRESETS_KEY, []);
  return Array.isArray(raw) ? raw.filter(isPreset) : [];
}

/** Grava a lista completa de presets. */
export function writeInboxPresets(presets: InboxFilterPreset[]): void {
  safeSetJSON(PRESETS_KEY, presets.slice(0, MAX_INBOX_PRESETS));
}

/**
 * Adiciona (ou substitui pelo nome, case-insensitive) um preset e devolve a lista atualizada.
 */
export function upsertInboxPreset(
  presets: InboxFilterPreset[],
  input: InboxFilterPresetInput
): InboxFilterPreset[] {
  const name = input.name.trim();
  if (!name) return presets;

  const preset: InboxFilterPreset = {
    ...input,
    name,
    id:
      presets.find((p) => p.name.toLowerCase() === name.toLowerCase())?.id ??
      (globalThis.crypto?.randomUUID?.() ?? `preset_${Date.now()}`),
    createdAt: new Date().toISOString(),
  };

  const rest = presets.filter((p) => p.id !== preset.id);
  return [preset, ...rest].slice(0, MAX_INBOX_PRESETS);
}

/** Remove um preset pelo id. */
export function removeInboxPreset(
  presets: InboxFilterPreset[],
  id: string
): InboxFilterPreset[] {
  return presets.filter((p) => p.id !== id);
}

/**
 * Edita um preset existente pelo id, preservando `id`/`createdAt`.
 * O nome é normalizado; conflitos de nome (case-insensitive) são rejeitados.
 * Retorna a lista original quando o id não existe ou o nome é inválido/duplicado.
 */
export function editInboxPreset(
  presets: InboxFilterPreset[],
  id: string,
  changes: Partial<InboxFilterPresetInput>
): InboxFilterPreset[] {
  const target = presets.find((p) => p.id === id);
  if (!target) return presets;

  const nextName = (changes.name ?? target.name).trim();
  if (!nextName) return presets;

  const duplicated = presets.some(
    (p) => p.id !== id && p.name.trim().toLowerCase() === nextName.toLowerCase()
  );
  if (duplicated) return presets;

  const updated: InboxFilterPreset = {
    ...target,
    ...changes,
    name: nextName,
    id: target.id,
    createdAt: target.createdAt,
  };

  return presets.map((p) => (p.id === id ? updated : p));
}
