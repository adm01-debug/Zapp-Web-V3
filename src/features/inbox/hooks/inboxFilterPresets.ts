/**
 * Presets de filtros da Inbox.
 *
 * Permite salvar combinações comuns de aba/sub-aba/busca/filtros auxiliares
 * e recarregá-las depois. Persistido em localStorage (por navegador/usuário).
 */
import { z } from 'zod';
import { safeGetJSON, safeSetJSON } from '@/lib/safeStorage';
import type { MainTab, SubTab } from '@/features/inbox/components/TicketTabs';
import type { FailureCategory } from '@/features/inbox';

const PRESETS_KEY = 'inbox_filter_presets_v1';

export const MAX_INBOX_PRESETS = 20;
export const PRESET_NAME_MAX_LENGTH = 40;
export const PRESET_SEARCH_MAX_LENGTH = 200;

/** Caracteres de controle e separadores invisíveis são rejeitados. */
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001F\u007F\u200B-\u200D\uFEFF]/;

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

/** Schema do nome — usado tanto na UI quanto antes de gravar no storage. */
export const presetNameSchema = z
  .string()
  .trim()
  .min(1, { message: 'Informe um nome para o preset.' })
  .max(PRESET_NAME_MAX_LENGTH, {
    message: `O nome deve ter no máximo ${PRESET_NAME_MAX_LENGTH} caracteres.`,
  })
  .refine((v) => !CONTROL_CHARS.test(v), {
    message: 'O nome contém caracteres inválidos.',
  });

export interface PresetNameValidation {
  ok: boolean;
  /** Nome já normalizado (trim) quando válido. */
  value: string;
  error: string | null;
}

/**
 * Valida o nome de um preset: vazio, tamanho, caracteres de controle e
 * duplicidade (case-insensitive) contra a lista atual.
 * `ignoreId` permite revalidar o próprio preset durante a edição.
 */
export function validatePresetName(
  name: string,
  presets: InboxFilterPreset[] = [],
  ignoreId?: string
): PresetNameValidation {
  const parsed = presetNameSchema.safeParse(name ?? '');
  if (!parsed.success) {
    return { ok: false, value: '', error: parsed.error.issues[0]?.message ?? 'Nome inválido.' };
  }

  const value = parsed.data;
  const duplicated = presets.some(
    (p) => p.id !== ignoreId && p.name.trim().toLowerCase() === value.toLowerCase()
  );
  if (duplicated) {
    return { ok: false, value, error: 'Já existe um preset com esse nome.' };
  }

  return { ok: true, value, error: null };
}

/** Schema completo do preset — protege o localStorage contra entradas corrompidas. */
const presetSchema = z.object({
  id: z.string().min(1),
  name: presetNameSchema,
  createdAt: z.string().min(1).catch(() => new Date().toISOString()),
  mainTab: z.enum(['open', 'resolved', 'search', 'unread']),
  subTab: z.enum(['attending', 'waiting']).catch('waiting'),
  search: z.string().max(PRESET_SEARCH_MAX_LENGTH).catch(''),
  contactType: z.string().nullable().catch(null),
  queueId: z.string().nullable().catch(null),
  showOnlyRetrying: z.boolean().catch(false),
  failureCategory: z.string().catch('all'),
});

function parsePreset(value: unknown): InboxFilterPreset | null {
  const parsed = presetSchema.safeParse(value);
  return parsed.success ? (parsed.data as InboxFilterPreset) : null;
}

/** Remove duplicatas por id e por nome (case-insensitive), preservando a ordem. */
function dedupePresets(presets: InboxFilterPreset[]): InboxFilterPreset[] {
  const seenIds = new Set<string>();
  const seenNames = new Set<string>();
  const result: InboxFilterPreset[] = [];
  for (const p of presets) {
    const key = p.name.trim().toLowerCase();
    if (seenIds.has(p.id) || seenNames.has(key)) continue;
    seenIds.add(p.id);
    seenNames.add(key);
    result.push(p);
  }
  return result;
}

/** Lê os presets salvos, ignorando entradas corrompidas. */
export function readInboxPresets(): InboxFilterPreset[] {
  const raw = safeGetJSON<unknown[]>(PRESETS_KEY, []);
  if (!Array.isArray(raw)) return [];
  const valid = raw
    .map(parsePreset)
    .filter((p): p is InboxFilterPreset => p !== null);
  return dedupePresets(valid).slice(0, MAX_INBOX_PRESETS);
}

/** Grava a lista completa de presets, descartando entradas inválidas. */
export function writeInboxPresets(presets: InboxFilterPreset[]): void {
  const valid = presets
    .map(parsePreset)
    .filter((p): p is InboxFilterPreset => p !== null);
  safeSetJSON(PRESETS_KEY, dedupePresets(valid).slice(0, MAX_INBOX_PRESETS));
}


/**
 * Adiciona (ou substitui pelo nome, case-insensitive) um preset e devolve a lista atualizada.
 */
export function upsertInboxPreset(
  presets: InboxFilterPreset[],
  input: InboxFilterPresetInput
): InboxFilterPreset[] {
  // Permite sobrescrever pelo mesmo nome: ignora o próprio registro na checagem de duplicidade.
  const existing = presets.find(
    (p) => p.name.trim().toLowerCase() === (input.name ?? '').trim().toLowerCase()
  );
  const validation = validatePresetName(input.name, presets, existing?.id);
  if (!validation.ok) return presets;
  const name = validation.value;

  const preset: InboxFilterPreset = {
    ...input,
    name,
    id: existing?.id ?? (globalThis.crypto?.randomUUID?.() ?? `preset_${Date.now()}`),
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

  const validation = validatePresetName(changes.name ?? target.name, presets, id);
  if (!validation.ok) return presets;
  const nextName = validation.value;


  const updated: InboxFilterPreset = {
    ...target,
    ...changes,
    name: nextName,
    id: target.id,
    createdAt: target.createdAt,
  };

  return presets.map((p) => (p.id === id ? updated : p));
}
