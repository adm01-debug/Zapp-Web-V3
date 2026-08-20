# Execução do PLANO-CORRECOES-ZAPP-100-ETAPAS — 2026-08-20

Executor: Hermes Agent (DeepSeek Flash) + Claude Sonnet 5 (validação) + 4 subagentes
Duração: ~2h

## Findings fechados

| Finding | Status | Ação |
|---|---|---|
| **F-001** (watchdog 524) | ✅ Fechado por outra sessão | Job 524 corrigido com marker [100PLAN A3 v2]; 193 execuções succeeded |
| **F-002** (dívida FDW 14/08) | ✅ Diagnosticado | 1.779 msgs recebidas perdidas na janela. PG14 preserva dados crus. Sem pipeline de backfill automático. Proposta: sentinela horária no menu de próximos passos |
| **F-003** (colisão migrations) | ✅ Fechado | Já resolvido em PRs anteriores. Migration 20260820140000 versiona sentinels 530/532 retroativamente |
| **F-004** (snapshot DDL) | ✅ Registrado | Manifesto versionado. Snapshots 3.5MB (zapp) e 1MB (evo) no container supabase_db |
| **F-005** (grants DML) | ✅ **FECHADO (GATE-A)** | 33 grants revogados em 11 tabelas evo.* + ALTER DEFAULT PRIVILEGES. APROVADO por Joaquim |
| **F-006** (FKs duplicadas) | ✅ Fechado | Índice idx_mdq_message_uuid_instance criado. FKs NOT VALID: falso-positivo (mecanismo PG15 para FK → partição) |
| **F-007** (índices duplicados) | ✅ **Fechado** | 6 índices dropados. 1 falso-positivo (trio evolution_contacts com expressões distintas) |
| **F-008** (comments) | ✅ **Fechado** | 391/391 tabelas zapp comentadas (27% → 100%). 4 lotes transacionais commitados |
| **F-009** (sprawl) | ✅ Quase resolvido | 24 tabelas tmp removidas em PRs anteriores. _backups com expiry automático |
| **F-010** (retenção) | ✅ **FECHADO (GATE-C)** | DELETE 237k rows >7d + cron 546 semanal. APROVADO por Joaquim |
| **F-011** (ESTADO.md) | ✅ **Fechado** | Atualizado para 2026-08-20 + score desacoplamento 33%→89% |
| **F-012** (containers) | ✅ **Auto-resolvido** | 4 containers órfãos removidos entre varreduras |

## Gates executados

- **GATE-A** (REVOKE DML): ✅ Executado — sem eventos adversos após aplicação
- **GATE-B** (backups _backups): dispensado (auto-expiry)
- **GATE-C** (retenção + órfãos): ✅ Executado — remoção de 290MB + cron semanal

## Métricas antes/depois

| Métrica | Auditoria 20/08 | Pós-plano |
|---|---|---|
| Comments tabelas zapp | 27% (108/400) | **100% (391/391)** |
| Grants DML authenticated em evo.* | 33 | **0** |
| Índices duplicados | 7 grupos | **1** (falso-positivo) |
| Containers órfãos | 4 | **0** |
| Jobs cron falhando 24h | F-001 + transientes | **0** |
| Webhook_events_processed | 602k rows, 473MB | 366k rows, ~183MB (reclamando) |
| Edge functions | 123 | 123 (inalterado) |
| Score desacoplamento | 33% (T0) | **~89% (I1/I2/I9 fechados)** |

## Pendências para próxima rodada

1. Pipeline de backfill para 1.779 msgs do PG14 — criar sentinela horária de delta FDW
2. Salvar snapshots DDL físicos no repo (3.5MB / 1MB) quando ferramenta de transferência disponível

## Rollbacks disponíveis

- GATE-A: _grant_snapshot_gatea salva com 33 grants originais
- GATE-C: SELECT cron.unschedule(546)
- F-007: Índices recriáveis via comentários nos arquivos .sql

Total de migrations versionadas: 20260820120500, 20260820130000, 20260820140000, 20260820141000, 20260820150000, 20260820151000, 20260820152000
