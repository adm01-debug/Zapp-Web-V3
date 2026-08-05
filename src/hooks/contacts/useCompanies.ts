/**
 * useCompanies — CRUD de empresas locais (zapp.companies).
 *
 * CONTATOS-14: a tabela existia órfã (4 linhas, nenhum .from('companies') no
 * frontend). Este hook expõe listar/criar/editar/excluir via PostgREST tipado
 * (types.ts → schema `zapp`).
 *
 * ⚠️ RLS (evidência em supabase/migrations/20260804000000_canonical_schema.sql:12422-12424):
 *   - Política atual: `auth_secure_166` — SOMENTE SELECT para authenticated
 *     com zapp.is_admin_or_supervisor().
 *   - NÃO existem políticas INSERT/UPDATE/DELETE → escritas falham (42501).
 *   - NENHUMA migration/RPC foi criada (fora do escopo). As mutações retornam
 *     `rlsBlocked: true` e a UI exibe aviso.
 */
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { getLogger } from '@/lib/logger';
import type { Database, Json } from '@/integrations/supabase/types';

const log = getLogger('useCompanies');

export type Company = Database['zapp']['Tables']['companies']['Row'];

export interface CompanyInput {
  name: string;
  cnpj?: string | null;
  segment?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface CompanyMutationResult {
  error: string | null;
  rlsBlocked: boolean;
}

/** RLS hint exibido quando a escrita é bloqueada pela política SELECT-only. */
export const COMPANIES_RLS_HINT =
  'Sem permissão de escrita em zapp.companies: a política RLS atual só permite SELECT ' +
  '(auth_secure_166). É necessária migration adicionando políticas INSERT/UPDATE/DELETE ' +
  '(ex.: FOR ALL TO authenticated USING (zapp.is_admin_or_supervisor())) para ativar o CRUD.';

function describeError(error: { code?: string; message?: string } | null): CompanyMutationResult {
  if (!error) return { error: null, rlsBlocked: false };
  const msg = `${error.code ?? ''} ${error.message ?? ''}`.toLowerCase();
  const rlsBlocked =
    msg.includes('42501') ||
    msg.includes('row-level security') ||
    msg.includes('permission denied') ||
    msg.includes('violates row-level security');
  return { error: error.message ?? 'Erro desconhecido', rlsBlocked };
}

function sortByName(list: Company[]): Company[] {
  return [...list].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
}

/** Ponto único de acesso à tabela (mantém o ratchet de data-layer apertado). */
function companyQuery() {
  return supabase.from('companies');
}

/** Use Companies hook for the contacts section. */
export function useCompanies() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    const { data, error } = await companyQuery()
      .select('*')
      .order('name', { ascending: true });
    if (error) {
      log.warn('Falha ao listar empresas', error.message);
      setLoadError(error.message);
      setCompanies([]);
    } else {
      setLoadError(null);
      setCompanies((data ?? []) as Company[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const createCompany = useCallback(
    async (input: CompanyInput): Promise<CompanyMutationResult> => {
      const name = input.name.trim();
      if (!name) return { error: 'Informe o nome da empresa.', rlsBlocked: false };
      const { data, error } = await companyQuery()
        .insert({
          name,
          cnpj: input.cnpj?.trim() || null,
          segment: input.segment?.trim() || null,
          metadata: (input.metadata ?? null) as Json | null,
        })
        .select()
        .maybeSingle();
      if (error) {
        const result = describeError(error);
        log.warn('Falha ao criar empresa', error.message);
        return result;
      }
      setCompanies((prev) => sortByName([...(prev ?? []), data as Company]));
      return { error: null, rlsBlocked: false };
    },
    []
  );

  const updateCompany = useCallback(
    async (id: string, patch: CompanyInput): Promise<CompanyMutationResult> => {
      const updates: Database['zapp']['Tables']['companies']['Update'] = {};
      if (patch.name !== undefined) {
        const name = patch.name.trim();
        if (!name) return { error: 'O nome da empresa não pode ficar vazio.', rlsBlocked: false };
        updates.name = name;
      }
      if (patch.cnpj !== undefined) updates.cnpj = patch.cnpj?.trim() || null;
      if (patch.segment !== undefined) updates.segment = patch.segment?.trim() || null;
      if (patch.metadata !== undefined) updates.metadata = patch.metadata as Json | null;
      if (Object.keys(updates).length === 0) return { error: null, rlsBlocked: false };

      const { data, error } = await companyQuery()
        .update(updates)
        .eq('id', id)
        .select()
        .maybeSingle();
      if (error) {
        const result = describeError(error);
        log.warn('Falha ao atualizar empresa', error.message);
        return result;
      }
      setCompanies((prev) =>
        sortByName((prev ?? []).map((c) => (c.id === id ? (data as Company) : c)))
      );
      return { error: null, rlsBlocked: false };
    },
    []
  );

  const deleteCompany = useCallback(async (id: string): Promise<CompanyMutationResult> => {
    const { error } = await companyQuery().delete().eq('id', id);
    if (error) {
      const result = describeError(error);
      log.warn('Falha ao excluir empresa', error.message);
      return result;
    }
    setCompanies((prev) => (prev ?? []).filter((c) => c.id !== id));
    return { error: null, rlsBlocked: false };
  }, []);

  return {
    companies,
    loading,
    loadError,
    refresh,
    createCompany,
    updateCompany,
    deleteCompany,
  };
}
