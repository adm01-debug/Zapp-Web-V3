import { supabase } from '@/integrations/supabase/client';
import { safeFrom } from '@/integrations/supabase/safeClient';
import {
  getWhatsappConnections,
  invalidateWhatsappConnectionsCache,
} from '@/lib/whatsappConnectionsCache';
import type { TablesInsert, TablesUpdate } from '@/integrations/supabase/types';
import { columnMap } from '@/integrations/supabase/columnMap';
import { normalizeConnection } from '@/integrations/supabase/rowNormalizers';
import type { WhatsAppConnectionCanonical } from '@/integrations/supabase/columnMap';

/**
 * Repositório de `whatsapp_connections`.
 *
 * Regra: nomes de coluna e shape canônico vêm de `columnMap.whatsapp_connections`
 * + `normalizeConnection`. Nenhum literal `'instance_name'`/`'name'` deve
 * aparecer aqui — a fonte da verdade é o columnMap. As mutações usam
 * `safeFrom` para evitar recursão de tipos (TS2589) do gerador.
 */
const TABLE = columnMap.whatsapp_connections.table;
const CANONICAL_SELECT = columnMap.whatsapp_connections.select();


export const whatsappConnectionRepository = {
  /**
   * Leitura ampla (usada pela UI legada): passa pelo cache de 30s + in-flight dedup.
   * O cache mantém o shape completo do banco; consumidores que precisem só do
   * subset canônico devem usar `fetchConnectionByIdCanonical`.
   */
  async fetchConnections() {
    try {
      const rows = await getWhatsappConnections();
      return { data: rows, error: null as null | Error };
    } catch (error) {
      return { data: null, error: error as Error };
    }
  },

  /**
   * Leitura canônica de uma conexão — usa `columnMap.select()` +
   * `normalizeConnection`, garantindo shape estável mesmo em linhas legadas
   * (aliases como `instance_name`).
   */
  async fetchConnectionByIdCanonical(
    id: string,
  ): Promise<{ data: WhatsAppConnectionCanonical | null; error: Error | null }> {
    const { data, error } = await supabase
      .from(TABLE)
      .select(CANONICAL_SELECT)
      .eq('id', id)
      .maybeSingle();
    if (error) return { data: null, error: error as unknown as Error };
    return { data: normalizeConnection(data as Parameters<typeof normalizeConnection>[0]), error: null };
  },

  async updateConnection(id: string, updates: TablesUpdate<'whatsapp_connections'>) {
    const res = await safeFrom(TABLE).update(updates).eq('id', id);
    invalidateWhatsappConnectionsCache();
    return res;
  },

  async insertConnection(data: TablesInsert<'whatsapp_connections'>) {
    const res = await supabase
      .from(TABLE)
      .insert(data)
      .select(CANONICAL_SELECT)
      .single();
    invalidateWhatsappConnectionsCache();
    const normalized = normalizeConnection(
      res.data as Parameters<typeof normalizeConnection>[0],
    );
    return { ...res, normalized };
  },

  async logQrAttempt(data: TablesInsert<'qr_attempts'>) {
    return supabase.from('qr_attempts').insert(data).select('id').single();
  },

  async updateQrAttempt(id: string, updates: TablesUpdate<'qr_attempts'>) {
    return supabase.from('qr_attempts').update(updates).eq('id', id);
  },

  async callEvolutionApi(body: Record<string, unknown>) {
    return supabase.functions.invoke('evolution-api', { body });
  },

  async callEvolutionApiV2(path: string, options: Parameters<typeof supabase.functions.invoke>[1]) {
    return supabase.functions.invoke(path, options);
  },
};
