/**
 * Resolução segura do identificador de instância para chamadas à Evolution API.
 *
 * Contexto (incidente 2026-07-04, instância fantasma "d8e07e44-…"):
 * `whatsapp_connections.instance_id` guarda o UUID interno da Evolution, mas a
 * Evolution API roteia TODAS as rotas pelo NOME da instância. Passar o UUID
 * gera 404 e — combinado com o auto-create da edge function — cria uma
 * instância nova cujo nome é o UUID, sequestrando o pareamento do telefone.
 *
 * A implementação canônica passou a viver em `rowNormalizers.ts` (fonte única
 * derivada de `columnMap`). Este módulo mantém a assinatura pública histórica
 * para não quebrar callers.
 */

import { isValidUUID } from '@/utils/uuid';
import { evolutionInstanceName as _evolutionInstanceName } from '@/integrations/supabase/rowNormalizers';

export function isUuidLike(value: string | null | undefined): boolean {
  return !!value && isValidUUID(value.trim());
}

export interface EvolutionInstanceRef {
  name?: string | null;
  instance_name?: string | null;
  instance_id?: string | null;
}

export function evolutionInstanceName(conn: EvolutionInstanceRef): string | null {
  return _evolutionInstanceName(conn);
}
