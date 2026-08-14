> [!NOTE] **HISTÓRICO — 2026-08-14**
> Este documento descreve o estado de 2026-08-13 e foi **SUPERSEDED** pelo [Plano V3](PLANO_DESACOPLAMENTO_V3_100_ETAPAS.md) e pelo estado real da `main`. Leia o V3 antes de agir com base neste doc.

# HANDOFF FINAL — Desacoplamento Zapp ↔ Evolution API
## Sessão 2026-08-13 (noite) · DESACOPLAMENTO CONCLUÍDO

---

## 🏆 Estado Final

| Dimensão | Valor |
|---|---|
| Branch | `feat/decouple-provider` |
| HEAD | `91432a169` |
| Gate | **0 pendentes \| 37 migrados \| 0 críticos** |
| zapp.evolution_* | **72 tabelas** |
| evo.evolution_* restantes | **27 — todas Grupo A (Evolution API owns)** |
| fn_system_health_score | **97.5 A+** |
| D5 global | **0 residuais** nos 6 tipos migrados |

**O desacoplamento TypeScript→banco está concluído.** Nenhuma escrita TS do Zapp vai para tabelas `evo.*` que deveriam estar em `zapp.*`.

---

## O que foi feito nesta sessão (esta instância)

### Lote 10 — evolution_messages (4 tabelas, 86 fns + 6 SETOF [A16])
- evolution_messages (particionada), evolution_messages_wpp2 (275k), evolution_messages_default, evolution_messages_wpp2_archive
- 6 fns [A16] (RETURNS evo.evolution_messages): rpc_get_message_details, rpc_list_messages, rpc_list_messages_all, rpc_list_messages_lite, rpc_insert_message×2
- 3 crons: pipeline-canary, vacuum-messages, guardian-monthly
- zapp.v_rls_impact_preview: DROP CASCADE + recriar após SET SCHEMA
- Commit: `9e81f13ad`

### Lote FINAL — evolution_contacts (1 tabela, 79 fns + 5 SETOF [A16])
- evolution_contacts: 21854 rows, 53 FKs, 24 trigs — mais acoplada do banco
- 5 fns [A16]: public.rpc_get_contact, zapp.rpc_get_contact, rpc_list_contacts, fn_search_contacts, rpc_upsert_contact×14params
- 4 crons: vacuum-contacts-2h, lid-phonejid-emergence, evo-repopula-isonwa, guardian-monthly
- 53 FKs seguiram automaticamente (PG15 OID-based)
- Commit: `91432a169`

### Técnicas-chave desta sessão
- **Bloco em massa com EXCEPTION handler**: corrige N fns num DO loop; falhas isoladas não abortam o lote
- **Bloco [A16] único**: captura corpos → DROP fns → DROP VIEW → SET SCHEMA → CREATE fns — tudo no mesmo DO sem ponto de falha intermediário
- **replace() prefix**: `replace(v,'evo.evolution_messages','zapp.')` pega _wpp2, _default, _archive automaticamente

---

## Tabelas em evo (Grupo A — ficam em evo para sempre)

Estas 27 tabelas são owneadas pelo Evolution API. Zapp lê via view-alias, nunca escreve:

```
evolution_alert_cooldown, evolution_backfill_audit, evolution_bootstrap_log,
evolution_connection_history, evolution_guardian_heartbeat, evolution_pipeline_health_log,
evolution_pipeline_history, evolution_rabbit_consumer_stats, evolution_reconcile_health_log,
evolution_reconcile_jobs, evolution_retention_log, evolution_traefik_401_stats,
evolution_webhook_events_v2 (particionada + 10 partições),
evolution_whatsapp_check_queue
```

---

## Pendências Pós-Desacoplamento

### [H2] REVOKEs Grupo A (próxima etapa de hardening)
Revogar INSERT/UPDATE/DELETE em tabelas Grupo A de roles authenticated/anon. **Bloqueado** até todas as fns que escrevem nessas tabelas serem SECURITY DEFINER.

```sql
-- Diagnóstico: fns não-SECDEF que escrevem em Grupo A
SELECT p.proname, n.nspname, p.prosecdef
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE p.prosecdef=false
  AND (p.prosrc ~ 'evo\.evolution_webhook_events_v2'
    OR p.prosrc ~ 'evo\.evolution_connection_history'
    OR p.prosrc ~ 'evo\.ingest_ledger')
  AND (p.prosrc ~ 'INSERT INTO' OR p.prosrc ~ 'UPDATE ');
```

### F5 E69-E76 — Migrar 21 edge fns para evolutionClient
`_shared/providers/evolution/client.ts` já existe. Migrar as edge fns que ainda chamam a Evolution API via URL direta:
```sh
grep -r 'EVOLUTION_API_URL\|fetch.*evo.*api' supabase/functions --include="*.ts" -l
```

### E14/E15 — Watchdog Swarm configs (BLOQUEADO)
Versionar 5 configs `evo_watchdog_*_v1` como Docker Swarm configs. Toca produção. **Requer aprovação de Joaquim.**

### PR/Merge
Quando hardening [H2] concluído, fazer PR de `feat/decouple-provider` → `main`.

---

## Para retomar (se necessário)

```sh
cd /workspace/repos/zapp-web-v3
git log --oneline feat/decouple-provider | head -5
node --experimental-vm-modules scripts/decouple/ownership-gate.mjs
# Deve retornar: 0 pendentes | 37 migrados | 0 críticos ✅
```

MCP de banco: `SUPABASE SELF HOSTED - MCP` (supabase_db_batch_query)
Shell = dash. Commits via git push direto do container.
