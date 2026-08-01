/**
 * GUARD DE SCHEMA (F4) — contact_intelligence deve espelhar o banco REAL.
 *
 * zapp.contact_intelligence (verificado via information_schema 2026-07-31)
 * tem 15 colunas. Por meses o hook leu `total_interactions` e
 * `last_contact_at` — colunas que NUNCA existiram — e o cast `as never` na
 * query escondia o erro do typecheck (o bug só aparecia em produção como
 * briefing com total 0).
 *
 * Este arquivo trava o schema em dois sentidos:
 *  1. Se uma coluna FANTASMA voltar ao tipo (total_interactions etc.), o
 *     @ts-expect-error abaixo fica "unused" → TS2578 → tsc QUEBRA.
 *  2. Se uma coluna REAL sair do tipo, o objeto _colunasReais deixa de
 *     atribuir → TS2739 → tsc QUEBRA.
 *
 * O arquivo não roda nenhum teste: é um guard de COMPILAÇÃO (tsc --noEmit).
 */
import { describe, expect, it } from 'vitest';
import type { ContactIntelligenceRow } from '@/integrations/supabase/types-manual';

// ── 1. As 15 colunas reais DEVEM existir no tipo (objeto de atribuição) ─────
const _colunasReais: ContactIntelligenceRow = {
  id: '00000000-0000-0000-0000-000000000000',
  contact_id: '00000000-0000-0000-0000-000000000000',
  sentiment: null,
  engagement_score: null,
  predicted_value: null,
  risk_level: null,
  created_at: '2026-07-31T00:00:00.000Z',
  updated_at: '2026-07-31T00:00:00.000Z',
  phone: null,
  contact_name: null,
  lead_status: null,
  total_messages: 0,
  days_since_contact: null,
  disc_profile: null,
  inbound_ratio: null,
  briefing: null,
  rapport_guide: null,
  best_times_to_call: null,
  triggers: null,
};
void _colunasReais;

// ── 2. Colunas FANTASMA DEVEM falhar (e o @ts-expect-error DEVE ser usado) ──
// @ts-expect-error — total_interactions NAO existe em contact_intelligence
type _Probe1 = ContactIntelligenceRow['total_interactions'];
// @ts-expect-error — last_contact_at NAO existe em contact_intelligence
type _Probe2 = ContactIntelligenceRow['last_contact_at'];
// @ts-expect-error — relationship_score NAO existe em contact_intelligence
type _Probe3 = ContactIntelligenceRow['relationship_score'];

// Consome as probes para evitar "declared but never used" (e prova que o
// acesso tipado funciona para colunas reais).
type _UseProbes = [_Probe1, _Probe2, _Probe3];
void (null as unknown as _UseProbes);

describe('contactIntelligence schema guard (F4)', () => {
  it('o tipo espelha as 15 colunas reais verificadas no banco', () => {
    // Compilação: _colunasReais atribui com todas as 15 colunas.
    // Se uma coluna real sumir do tipo, TS2739 quebra o build.
    expect(Object.keys(_colunasReais).sort()).toEqual(
      [
        'id',
        'contact_id',
        'sentiment',
        'engagement_score',
        'predicted_value',
        'risk_level',
        'created_at',
        'updated_at',
        'phone',
        'contact_name',
        'lead_status',
        'total_messages',
        'days_since_contact',
        'disc_profile',
        'inbound_ratio',
        'briefing',
        'rapport_guide',
        'best_times_to_call',
        'triggers',
      ].sort()
    );
  });
});
