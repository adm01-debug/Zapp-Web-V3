/**
 * profileMappers — normalização canônica de profiles na área admin
 *
 * Motivação: Supabase pode retornar embed de `profiles` como:
 *   - `null` (relação vazia)
 *   - objeto único (FK 1:1)
 *   - array com 1 elemento (relação padrão ambígua)
 *
 * Além disso, colunas como `name`, `is_active` e `max_chats` podem vir nullable
 * do banco mesmo quando a UI espera valores concretos. Este módulo centraliza
 * a normalização para evitar novos erros de tipagem e comportamento
 * inconsistente entre hooks/componentes admin.
 */

/** Ref mínima de profile usada em quase toda tela admin (roles, filas, grants). */
export interface AdminProfileRef {
  id: string;
  user_id?: string;
  name: string;
  email: string | null;
  avatar_url: string | null;
}

/** Profile de agente com atributos operacionais (dashboards, agent lists). */
export interface AdminAgentProfile extends Omit<AdminProfileRef, 'user_id'> {
  user_id: string;
  role: string | null;
  job_title: string | null;
  department: string | null;
  phone: string | null;
  is_active: boolean;
  max_chats: number;
  created_at: string | null;
  updated_at: string | null;
}

type ProfileEmbed =
  | null
  | undefined
  | Partial<AdminProfileRef>
  | Array<Partial<AdminProfileRef>>;

const DEFAULT_NAME = 'Sem nome';
const DEFAULT_MAX_CHATS = 5;

const pickFirst = <T,>(v: T | T[] | null | undefined): T | null => {
  if (v == null) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
};

/**
 * Normaliza um embed `profiles`/`profile` para `AdminProfileRef | undefined`.
 * - `undefined` quando não há profile associado (não usar `null` para casar com
 *   interfaces que declaram `profile?: ...`).
 * - `name` default para preservar contrato de "string não-nula".
 */
export function normalizeProfileRef(raw: ProfileEmbed): AdminProfileRef | undefined {
  const p = pickFirst(raw);
  if (!p || typeof p !== 'object') return undefined;
  if (!p.id) return undefined;

  return {
    id: p.id,
    user_id: p.user_id,
    name: (p.name ?? '').trim() || DEFAULT_NAME,
    email: p.email ?? null,
    avatar_url: p.avatar_url ?? null,
  };
}

/**
 * Normaliza uma linha completa da tabela `profiles` para `AdminAgentProfile`.
 * Preserva nulls onde faz sentido semântico e aplica defaults onde a UI
 * assume valores concretos (name, is_active, max_chats).
 */
export function normalizeAgentProfile(raw: unknown): AdminAgentProfile | null {
  if (!raw || typeof raw !== 'object') return null;
  const p = raw as Record<string, unknown>;
  if (typeof p.id !== 'string') return null;

  return {
    id: p.id,
    user_id: typeof p.user_id === 'string' ? p.user_id : '',
    name: (typeof p.name === 'string' && p.name.trim()) || DEFAULT_NAME,
    email: typeof p.email === 'string' ? p.email : null,
    avatar_url: typeof p.avatar_url === 'string' ? p.avatar_url : null,
    role: typeof p.role === 'string' ? p.role : null,
    job_title: typeof p.job_title === 'string' ? p.job_title : null,
    department: typeof p.department === 'string' ? p.department : null,
    phone: typeof p.phone === 'string' ? p.phone : null,
    is_active: typeof p.is_active === 'boolean' ? p.is_active : true,
    max_chats: typeof p.max_chats === 'number' ? p.max_chats : DEFAULT_MAX_CHATS,
    created_at: typeof p.created_at === 'string' ? p.created_at : null,
    updated_at: typeof p.updated_at === 'string' ? p.updated_at : null,
  };
}

export function normalizeAgentProfiles(rows: unknown): AdminAgentProfile[] {
  if (!Array.isArray(rows)) return [];
  const out: AdminAgentProfile[] = [];
  for (const r of rows) {
    const norm = normalizeAgentProfile(r);
    if (norm) out.push(norm);
  }
  return out;
}
