/**
 * providers/registry.ts — Resolve client por provider/conta
 * E68 do Plano de Desacoplamento 100 Etapas.
 */
import { evolutionClient } from './evolution/index.ts';

export type ProviderType = 'evolution' | 'cloud';

export function getProviderClient(provider: ProviderType = 'evolution') {
  switch (provider) {
    case 'evolution':
      return evolutionClient;
    case 'cloud':
      throw new Error('Cloud provider client not yet implemented');
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}
