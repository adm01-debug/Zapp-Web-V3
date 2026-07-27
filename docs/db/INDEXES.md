# Índices — Inventário e Política

**Retrato de:** 27/07/2026 · **2.176 índices** · **159 MB** · **1.987 (91%) com `idx_scan=0`** · **77 MB** potencialmente ociosos.

> Regenerar: `SELECT schemaname, relname, indexrelname, idx_scan, pg_relation_size(indexrelid) FROM pg_stat_user_indexes ORDER BY 4;`
> Ferramentas disponíveis no banco: `index_advisor`, `hypopg`, e a tabela `evo.idx_usage_audit`.

## 🚨 NUANCE CRÍTICA: `idx_scan=0` **NÃO** significa "pode dropar"

Entre os "não usados" há **índices UNIQUE e PRIMARY KEY** (ex.: `zapp.webhook_events_processed_event_id_uq` = 20 MB, `..._pkey` = 6 MB). Eles aparecem com `idx_scan=0` porque:
- **PK/UNIQUE** existem para **impor constraint** e servem a `ON CONFLICT` / FKs — o uso nem sempre incrementa `idx_scan`.
- As estatísticas podem ter sido **resetadas** recentemente (confirmar quando `pg_stat_reset` rodou).

**Regra:** **NUNCA** dropar PK, UNIQUE ou índice de suporte de FK numa "limpeza". Só são candidatos a remoção índices **secundários não-únicos** confirmados sem uso por ≥30 dias.

## Ociosos por schema

| Schema | Não usados | Total | Espaço |
|---|---:|---:|---:|
| `zapp` | 798 | 836 | 44 MB |
| `evo` | 684 | 781 | 21 MB |
| `financeiro` | 51 | 71 | ~1,9 MB |
| `email_app` | 98 | 98 | ~1,4 MB |
| `ops` | 26 | 30 | ~1,7 MB |
| `vendas` | 46 | 54 | ~1,2 MB |
| `bpm` | 62 | 62 | ~0,5 MB |
| `ai` | 39 | 39 | ~0,3 MB |
| `archive` | 19 | 19 | ~0,16 MB |

## Índices duplicados reais (3)

| Tabela | Ação |
|---|---|
| `evo.contact_id_graveyard` | remover a duplicata |
| `financeiro.colaboradores` | remover a duplicata |
| `financeiro.vendas_unificadas` | remover a duplicata |

## Faltantes

A varredura de 27/07 **não** achou seq scan pesado em tabela quente — os ~9% de índices usados cobrem as queries atuais. Manter `slow_query_monitor` (cron 102) + `index_advisor` sob demanda.

## Política de índice

1. Criar índice só com evidência (query lenta real / `index_advisor`).
2. Antes de remover: confirmar `idx_scan=0` por ≥30 dias **e** que não é PK/UNIQUE/suporte de FK.
3. Quarentena antes de dropar (marcar → observar → dropar).
