/**
 * useContactSegments — CRUD de segmentos de contato (zapp.contact_segments).
 *
 * CONTATOS-07: a tabela existia no schema sem nenhum consumidor frontend.
 * Este hook expõe listar/criar/editar/excluir via PostgREST tipado
 * (types.ts → schema `zapp`, cliente padrão do app).
 *
 * ⚠️ RLS (evidência em supabase/migrations/20260804000000_canonical_schema.sql:12501-12503):
 *   - Política atual: `auth_secure_190` — SOMENTE SELECT para authenticated
 *     com zapp.is_admin_or_supervisor().
 *   - NÃO existem políticas INSERT/UPDATE/DELETE → escritas falham com
 *     "new row violates row-level security policy" (42501) para qualquer role.
 *   - NENHUMA migration/RPC foi criada (fora do escopo). As mutações retornam
 *     `rlsBlocked: true` e a UI exibe aviso com a ação necessária.
 */
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { getLogger } from '@/lib/logger';
import type { Database, Json } from '@/integrations/supabase/schema';

const log = getLogger('useContactSegments');

export type ContactSegment = Database['zapp']['Tables']['contact_segments']['Row'];

export interface SegmentInput {
  name: string;
  description?: string | null;
  filters?: Record<string, unknown> | null;
}

export interface SegmentMutationResult {
  error: string | null;
  rlsBlocked: boolean;
}

/** RLS hint exibido quando a escrita é bloqueada pela política SELECT-only. */
export const SEGMENTS_RLS_HINT =
  'Sem permissão de escrita em zapp.contact_segments: a política RLS atual só permite SELECT ' +
  '(auth_secure_190). É necessária migration adicionando políticas INSERT/UPDATE/DELETE ' +
  '(ex.: FOR ALL TO authenticated USING (zapp.is_admin_or_supervisor())) para ativar o CRUD.';

function describeError(error: { code?: string; message?: string } | null): SegmentMutationResult {
  if (!error) return { error: null, rlsBlocked: false };
  const msg = `${error.code ?? ''} ${error.message ?? ''}`.toLowerCase();
  const rlsBlocked =
    msg.includes('42501') ||
    msg.includes('row-level security') ||
    msg.includes('permission denied') ||
    msg.includes('violates row-level security');
  return { error: error.message ?? 'Erro desconhecido', rlsBlocked };
}

function sortByName(list: ContactSegment[]): ContactSegment[] {
  return [...list].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
}

/** Ponto único de acesso à tabela (mantém o ratchet de data-layer apertado). */
function segmentQuery() {
  return supabase.from('contact_segments');
}

/** Use Contact Segments hook for the contacts section. */
export function useContactSegments() {
  const [segments, setSegments] = useState<ContactSegment[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    const { data, error } = await segmentQuery()
      .select('*')
      .order('name', { ascending: true });
    if (error) {
      log.warn('Falha ao listar segmentos', error.message);
      setLoadError(error.message);
      setSegments([]);
    } else {
      setLoadError(null);
      setSegments((data ?? []) as ContactSegment[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const createSegment = useCallback(
    async (input: SegmentInput): Promise<SegmentMutationResult> => {
      const name = input.name.trim();
      if (!name) return { error: 'Informe um nome para o segmento.', rlsBlocked: false };
      const { data, error } = await segmentQuery()
        .insert({
          name,
          description: input.description?.trim() || null,
          filters: (input.filters ?? {}) as Json,
        })
        .select()
        .maybeSingle();
      if (error) {
        const result = describeError(error);
        log.warn('Falha ao criar segmento', error.message);
        return result;
      }
      setSegments((prev) => sortByName([...(prev ?? []), data as ContactSegment]));
      return { error: null, rlsBlocked: false };
    },
    []
  );

  const updateSegment = useCallback(
    async (
      id: string,
      patch: { name?: string; description?: string | null }
    ): Promise<SegmentMutationResult> => {
      const updates: { name?: string; description?: string | null } = {};
      if (patch.name !== undefined) {
        const name = patch.name.trim();
        if (!name) return { error: 'O nome do segmento não pode ficar vazio.', rlsBlocked: false };
        updates.name = name;
      }
      if (patch.description !== undefined) updates.description = patch.description?.trim() || null;
      if (Object.keys(updates).length === 0) return { error: null, rlsBlocked: false };

      const { data, error } = await segmentQuery()
        .update(updates)
        .eq('id', id)
        .select()
        .maybeSingle();
      if (error) {
        const result = describeError(error);
        log.warn('Falha ao atualizar segmento', error.message);
        return result;
      }
      setSegments((prev) =>
        sortByName((prev ?? []).map((s) => (s.id === id ? (data as ContactSegment) : s)))
      );
      return { error: null, rlsBlocked: false };
    },
    []
  );

  const deleteSegment = useCallback(async (id: string): Promise<SegmentMutationResult> => {
    const { error } = await segmentQuery().delete().eq('id', id);
    if (error) {
      const result = describeError(error);
      log.warn('Falha ao excluir segmento', error.message);
      return result;
    }
    setSegments((prev) => (prev ?? []).filter((s) => s.id !== id));
    return { error: null, rlsBlocked: false };
  }, []);

  return {
    segments,
    loading,
    loadError,
    refresh,
    createSegment,
    updateSegment,
    deleteSegment,
  };
}
