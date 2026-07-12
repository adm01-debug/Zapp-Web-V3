/**
 * Resolução segura do identificador de instância para chamadas à Evolution API.
 *
 * Contexto (incidente 2026-07-04, instância fantasma "d8e07e44-…"):
 * `whatsapp_connections.instance_id` guarda o UUID interno da Evolution, mas a
 * Evolution API roteia TODAS as rotas (`/instance/connect/{x}`, `/instance/restart/{x}`,
 * `/message/*`) pelo NOME da instância. Passar o UUID gera 404 e — combinado com o
 * auto-create da edge function `evolution-api` — cria uma instância nova cujo nome
 * é o UUID, sequestrando o pareamento do telefone para fora do pipeline.
 *
 * Regra: toda chamada à Evolution deve usar `evolutionInstanceName(connection)`.
 */

import { isValidUUID } from '@/utils/uuid';

export function isUuidLike(value: string | null | undefined): boolean {
  return !!value && isValidUUID(value.trim());
}

export interface EvolutionInstanceRef {
  instance_name?: string | null;
  instance_id?: string | null;
}

/**
 * Retorna o nome de instância utilizável nas rotas da Evolution API, ou `null`
 * quando a conexão só possui o UUID (caso em que a chamada NÃO deve ser feita).
 * Aceita `instance_id` legado apenas quando ele claramente não é um UUID
 * (linhas antigas guardavam o nome nesse campo).
 */
export function evolutionInstanceName(conn: EvolutionInstanceRef): string | null {
  const name = conn.instance_name?.trim();
  if (name && !isUuidLike(name)) return name;
  const legacy = conn.instance_id?.trim();
  if (legacy && !isUuidLike(legacy)) return legacy;
  return null;
}
