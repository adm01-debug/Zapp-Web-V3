/**
 * types-manual.ts — Extensões manuais ao Database type gerado.
 *
 * REGENERAÇÃO 2026-07-16: types.ts agora inclui blocos nativos para
 * os schemas `zapp`, `evo` e `public` (80.411 linhas, 1467 entradas).
 * O remapeamento GeneratedDatabase['public'] → zapp foi REMOVIDO.
 * Agora referencia GeneratedDatabase['zapp'] diretamente.
 *
 * ÚLTIMA REGENERAÇÃO: 2026-07-16 via postgres-meta API (commit c48cf42)
 * COBERTURA: zapp=721, evo=213, public=533 entradas tipadas
 */

import type { Database as GeneratedDatabase } from './types';

// ---------------------------------------------------------------------------
// ManualZappTables — adicione aqui tabelas que não foram capturadas na geração.
// Após regenerar types.ts, mova-as para cá SOMENTE se a CLI não as incluir.
// ---------------------------------------------------------------------------

/** Manual Zapp Tables interface definition. */
export interface ManualZappTables {
  // Vazio após regeneração 2026-07-16 — todas as tabelas estão em types.ts
}

// ---------------------------------------------------------------------------
// MergeTables — mescla dois conjuntos de tabelas sem criar intersseção
// ---------------------------------------------------------------------------
type MergeTables<Base, Extra> = {
  [K in keyof Base | keyof Extra]: K extends keyof Extra
    ? Extra[K]
    : K extends keyof Base
      ? Base[K]
      : never;
};

// CORRIGIDO 2026-07-16: agora referencia o bloco 'zapp' nativo (antes era 'public')
type GeneratedZappSchema = GeneratedDatabase['zapp'];

/** Extended Database type alias. */
export type ExtendedDatabase = {
  public: GeneratedDatabase['public'];
  zapp: {
    Tables: MergeTables<GeneratedZappSchema['Tables'], ManualZappTables>;
    Views: GeneratedZappSchema['Views'];
    Functions: GeneratedZappSchema['Functions'];
    Enums: GeneratedZappSchema['Enums'];
    CompositeTypes: GeneratedZappSchema['CompositeTypes'];
  };
  evo: GeneratedDatabase['evo'];
};
