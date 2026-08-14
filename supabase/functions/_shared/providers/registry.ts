/**
 * providers/registry.ts — Resolve client por provider/conta
 * E68 do Plano de Desacoplamento 100 Etapas.
 * V3 (2026-08-14): fake provider registrado SOMENTE em DENO_ENV=test (E73/S9).
 */
import { evolutionClient } from './evolution/index.ts';
import { fakeProvider, assertTestEnv } from './fake/index.ts';

export type ProviderType = 'evolution' | 'cloud' | 'fake';

export function getProviderClient(provider: ProviderType = 'evolution') {
  if (provider === 'fake') {
    // Guard anti-vazamento: fake NUNCA em produção (E73 do Plano V2)
    assertTestEnv();
    return fakeProvider;
  }
  switch (provider) {
    case 'evolution':
      return evolutionClient;
    case 'cloud':
      throw new Error('Cloud provider client not yet implemented');
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}
