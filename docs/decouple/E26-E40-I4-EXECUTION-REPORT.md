# E26–E40 — Relatório de Execução: I4 (Zero bypass de egresso HTTP)

**Data:** 2026-08-15 · **Executor:** Hermes (orquestrador) + 10 workers DeepSeek + validação Claude Code
**PR:** #1091 · **Plano:** ADR-014-PHASE2-PLAN.md · **Invariante:** I4 — nenhum egresso `net.http_*` com URL literal hardcoded

## Resultado

| Métrica | Antes | Depois |
|---|---|:--:|
| Funções com URL literal hardcoded (zapp/evo/ops) | 16 flagradas → **11 reais** | **0** |
| sql-gate contra o banco real | 2 violações (fixture velho) | **0 violações (28 funções analisadas)** |
| Secrets de URL no vault | 3 | **13** (10 novos criados via `vault.create_secret`) |
| Triggers/crons afetados | — | **0 mudanças** (4 triggers, 9 crons intactos) |

## O que foi executado

1. **Coleta de evidência real** (`pg_get_functiondef` de produção): das 16 flagradas pelo scan, 6 eram falsos positivos (já usavam `ops.fn_evo_url()`/vault) e 11 tinham literal real.
2. **Simulação pré-execução:** 234 cenários, 96 críticos, 10 gaps mapeados e mitigados.
3. **Onda de 10 workers simultâneos** (escopos disjuntos, 1 migration por worker) + 3 correções do maestro (Resend, purge_storage_cache, wal_slots — achadas pelo próprio gate).
4. **Validação Claude Code:** 1ª rodada REPROVOU (6 correções reais: gateway _v2 no license_heartbeat, escopo creep dos callers, paridade vault↔literal, critério por-statement, órfã intocada, teste funcional de triggers). 2ª rodada do plano APROVOU. Validação da onda REPROVOU com 2 bloqueios reais (whitelist nominal mascarando as 2 funções críticas; ordem manual de aplicação) + 1 furo latente do gate (string-aware) — todos corrigidos.
5. **Aplicação em produção na ordem manual** `secrets → _v2 → funções` (13 migrations, registradas em `supabase_migrations.schema_migrations`).
6. **Provas funcionais:** 2 triggers via INSERT sintético + ROLLBACK; 5 crons com invocação real (incl. GET real `/license/status` via `_v2` e `/instance/fetchInstances`).

## Pitfalls descobertos nesta leva (registrados no skill do orquestrador)

- **Vault AEAD**: `INSERT` de texto plano em `vault.secrets` corrompe a leitura (`decode base64` falha em `:`) — sempre `vault.create_secret(...)` com guarda `WHERE NOT EXISTS` (a tabela desta versão NÃO tem UNIQUE em `name`; `ON CONFLICT (name)` falha).
- **`pg_get_functiondef` entrega `$function$` sem `;`** nesta versão do Postgres — extractors que buscam `$function$;` não acham nada.
- **ML-001 falso positivo**: texto "SECURITY DEFINER" dentro de `COMMENT ON FUNCTION` é tratado como declaração de função pelo linter.
- **Gate I4**: literal em headers (`Origin: https://...`) não é egresso — o critério precisa mirar o argumento `url :=` com corte string-aware; `http_delete` também conta como egresso.

## Fica pendente (próximas levas)

- Migrar os 6 callers legados (`fn_evo_url()` → `_v2`) — PR separada (decisão da validação: fora desta leva).
- `zapp.notify_sicoob_on_reply` (órfã, RPC exposta): arquivamento em E50/Fase 4.
- Fixture do gate: regenerar no CI do próximo push (já regenerado aqui do banco pós-aplicação).
