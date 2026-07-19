/**
 * Datasource Sentinel — telemetria de acesso ao domínio FATOR X.
 *
 * ARQUITETURA v6.1 (single-database): as RPCs `evolution_*` rodam no client
 * PRINCIPAL AUTENTICADO (SECURITY DEFINER; `anon` revogado no banco). Chamar
 * RPCs via client 'lovable' é o comportamento CORRETO — não é violação.
 *
 * O sentinel antigo (pré-v6.1) lançava erro nesse caso e quebrava o app em
 * DEV. Esta versão mantém as assinaturas públicas, mas atua apenas como
 * telemetria leve de desenvolvimento:
 *  - loga acesso direto via `.from()` a tabelas `evolution_*` (preferir RPC);
 *  - nunca lança exceção.
 */
import { ENTITY_MAP } from './registry';
import { getLogger } from '@/lib/logger';

const log = getLogger('datasource-sentinel');

export function validateEntityAccess(entity: string, clientName: 'lovable' | 'external'): void {
  if (!import.meta.env.DEV) return;
  const mapping = Object.values(ENTITY_MAP).find((m) => m.table === entity);
  if (entity.startsWith('evolution_') && !mapping) {
    log.warn(
      `[Datasource Sentinel] Acesso direto a "${entity}" fora do ENTITY_MAP (client: ${clientName}). ` +
        'Preferir RPCs do rpcCatalog para o domínio evolution_*.'
    );
  }
}

/** validate Rpc Access function. */
export function validateRpcAccess(name: string, clientName: 'lovable' | 'external'): void {
  if (!import.meta.env.DEV) return;
  // v6.1: RPCs do domínio no client principal autenticado = caminho oficial.
  // Mantido apenas para rastreio em dev; sem warnings, sem throws.
  void name;
  void clientName;
}
