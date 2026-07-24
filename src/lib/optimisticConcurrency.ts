/**
 * Sistema de detecção de conflitos para updates concorrentes.
 *
 * Implementa Optimistic Concurrency Control (OCC) para garantir que
 * updates não sobrescrevam mudanças de outros usuários.
 *
 * Fluxo:
 * 1. SELECT com `version` column
 * 2. UPDATE com `WHERE version = $previousVersion`
 * 3. Se rowCount = 0 → outro usuário modificou → 409 Conflict
 * 4. Cliente recarrega dados e pede ao usuário para resolver
 */

export interface VersionedEntity {
  id: string;
  version: number;
  updated_at: string;
}

export interface ConflictError {
  type: 'version_conflict';
  entityId: string;
  expectedVersion: number;
  currentVersion: number;
  message: string;
}

export type UpdateResult<T> =
  | { ok: true; data: T; newVersion: number }
  | { ok: false; conflict: ConflictError }
  | { ok: false; error: string };

/**
 * Helper para update com version checking.
 *
 * Uso:
 * ```typescript
 * const result = await updateWithVersionCheck<Contact>(
 *   supabase.from('contacts'),
 *   contactId,
 *   previousVersion,
 *   { name: 'New Name' }
 * );
 *
 * if (!result.ok && 'conflict' in result) {
 *   toast.warning('Contato foi modificado por outro usuário. Recarregue.');
 *   return;
 * }
 * ```
 */
export async function updateWithVersionCheck<T extends VersionedEntity>(
  query: any, // SupabaseQueryBuilder
  entityId: string,
  expectedVersion: number,
  updates: Partial<T>
): Promise<UpdateResult<T>> {
  // Incrementar versão e adicionar updated_at
  const updatePayload = {
    ...updates,
    version: expectedVersion + 1,
    updated_at: new Date().toISOString(),
  };

  // UPDATE WHERE id = ? AND version = ?
  // Se rowCount = 0, outro usuário modificou
  const { data, error } = await query
    .update(updatePayload)
    .eq('id', entityId)
    .eq('version', expectedVersion)
    .select()
    .maybeSingle();

  if (error) {
    return {
      ok: false,
      error: `Update falhou: ${error.message}`,
    };
  }

  if (!data) {
    // Fetch current version para retornar ao usuário
    const { data: current } = await query
      .select('version')
      .eq('id', entityId)
      .maybeSingle();

    return {
      ok: false,
      conflict: {
        type: 'version_conflict',
        entityId,
        expectedVersion,
        currentVersion: (current as { version?: number } | null)?.version ?? -1,
        message: 'Registro foi modificado por outro usuário. Recarregue antes de salvar.',
      },
    };
  }

  return {
    ok: true,
    data: data as T,
    newVersion: expectedVersion + 1,
  };
}

/**
 * Helper para INSERT com version inicial.
 */
export async function insertWithVersion<T extends Omit<VersionedEntity, 'version' | 'updated_at'>>(
  query: any,
  data: T
): Promise<UpdateResult<T & VersionedEntity>> {
  const payload = {
    ...data,
    version: 1,
    updated_at: new Date().toISOString(),
  };

  const { data: result, error } = await query
    .insert(payload)
    .select()
    .maybeSingle();

  if (error) {
    return {
      ok: false,
      error: `Insert falhou: ${error.message}`,
    };
  }

  if (!result) {
    return {
      ok: false,
      error: 'Insert não retornou dados (RLS pode ter bloqueado)',
    };
  }

  return {
    ok: true,
    data: result as T & VersionedEntity,
    newVersion: 1,
  };
}
