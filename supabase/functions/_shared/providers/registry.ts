/**
 * providers/registry.ts — Resolve client por provider/conta
 * E68 do Plano de Desacoplamento 100 Etapas.
 * V4 (2026-08-14): suporte a PROVIDER_UNDER_TEST (E73/S9).
 *
 * PROVIDER_UNDER_TEST:
 *  - Variável de ambiente que força o provider resolvido durante testes
 *    (ex.: PROVIDER_UNDER_TEST=fake → getProviderClient() retorna fakeProvider
 *    sem precisar trocar chamadas).
 *  - SÓ é honrada quando DENO_ENV === 'test'.
 *  - Fora de test (production/development/staging), é IGNORADA por completo:
 *    a resolução SEMPRE segue o provider pedido explicitamente (default
 *    'evolution') — guard absoluto, sem exceção de config. Nenhuma combinação
 *    de variáveis de ambiente consegue vazar fake/cloud para fora de teste.
 */
import { evolutionClient } from './evolution/index.ts';
import { fakeProvider, assertTestEnv } from './fake/index.ts';

export type ProviderType = 'evolution' | 'cloud' | 'fake';

function getEnv(name: string): string | undefined {
  if (typeof Deno !== 'undefined') return Deno.env.get(name);
  // Fallback Node (vitest). Cast evita TS2580 no type-check do Deno.
  const proc = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process;
  return proc?.env?.[name];
}

function isTestEnv(): boolean {
  return getEnv('DENO_ENV') === 'test';
}

/**
 * Guard absoluto do PROVIDER_UNDER_TEST: fora de DENO_ENV=test a flag é
 * ignorada e a resolução segue o provider pedido explicitamente (default
 * 'evolution'); o flag só desvia a resolução dentro de ambiente de teste.
 */
function resolveProvider(provider: ProviderType): ProviderType {
  if (!isTestEnv()) return provider;
  const underTest = getEnv('PROVIDER_UNDER_TEST');
  if (underTest === 'fake' || underTest === 'evolution' || underTest === 'cloud') {
    return underTest;
  }
  return provider;
}

export function getProviderClient(provider: ProviderType = 'evolution') {
  const effective = resolveProvider(provider);

  if (effective === 'fake') {
    // Guard anti-vazamento: fake NUNCA em produção (E73 do Plano V2)
    assertTestEnv();
    return fakeProvider;
  }
  switch (effective) {
    case 'evolution':
      return evolutionClient;
    case 'cloud':
      throw new Error('Cloud provider client not yet implemented');
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}
