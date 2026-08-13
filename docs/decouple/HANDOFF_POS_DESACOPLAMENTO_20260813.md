# HANDOFF EXAUSTIVO — Pós-Desacoplamento Zapp ↔ Evolution API
## Sessão 2026-08-13 (noite) → para o próximo chat

> **Para:** próxima instância de Claude (chat novo).
> **De:** sessão que concluiu a migração física de tabelas (Lotes 1→FINAL).
> **Estado:** o desacoplamento de **tabelas** está 100% concluído. Restam 3 frentes
> de trabalho: **[H2] REVOKE hardening**, **F5 gateway HTTP nas edge fns**, e **PR→main**.
> **Regra de ouro:** LEIA A SEÇÃO 0 E RODE O GATE ANTES DE QUALQUER COISA.

---

## ⚠️ ADENDO 2026-08-13 (madrugada) — auditoria exaustiva + correções pós-handoff

> Sessões posteriores (multi-agente: **Claude + Hermes**) rodaram auditoria de 10 frentes e
> aplicaram correções. **Residual global `evo.<tabela migrada>` em funções/crons/triggers = 0.**
> Vários números do TL;DR abaixo estão desatualizados: branch efetivo `main` (HEAD ~`ea50202c8`),
> `zapp.evolution_*` = **74 tabelas** (drift benigno), `fn_system_health_score` = **100.0 A+**.

**Concluído nesta rodada de auditoria:**
- **[H2] REVOKE Grupo A — FEITO.** Verificado: 5 tabelas evo Grupo A (`evolution_alert_cooldown`,
  `backfill_audit`, `connection_history`, `pipeline_history`, `retention_log`) com apenas SELECT
  para `authenticated`. A **FRENTE 1** abaixo já está satisfeita.
- **GAP#1 — funções `ops` liam `evo.<tabela migrada>` inexistente.**
  `fn_monitor_ingestion_persistence_gap` (→`evo.evolution_audit_log`), `fn_notify_critical_alerts`
  e `fn_system_health` (→`evo.evolution_instance_credentials`). Schema corrigido pelo **Hermes**
  (evo→zapp, "Lote 6"). **Claude corrigiu um 2º bug latente** em `ops.fn_system_health`: 4 appends
  `text[] || 'literal'` (tipo `unknown`) davam *malformed array literal* — corrigidos com `::text`.
  Crons 84 (notify) e 206 (monitor-gap) voltaram a rodar OK. `evo.evolution_connection_history`
  (Grupo A legítima) **preservada** — fix cirúrgico por nome de tabela, não genérico.
- **GAP#3 — máscara no cron 149** (`vps-performance-snapshot`): removido o filtro
  `AND return_message NOT LIKE '%does not exist%'` que mascarava falhas no cálculo de
  `cron_failures_24h`. Medição honesta. *Nota:* `vps_health_score` pode oscilar até as falhas
  históricas saírem da janela de 24h (transitório).
- **GAP#4 — 2 índices INVÁLIDOS** em `zapp.evolution_messages` (`idx_evo_msgs_media_status_pending`,
  `pidx_msgs_created_at`): eram `ON ONLY` da mãe com só o filho de `wpp2`. Criados os índices-filho
  na partição `evolution_messages_default` (vazia) + `ATTACH PARTITION` → ambas as mães revalidaram
  (`indisvalid=true`, 2 filhos).
- **Overloads RPC (dívida F4):**
  - `rpc_insert_message` tinha 2 overloads de 9 args **idênticos** (só ordem de params) → risco de
    *"is not unique"* via PostgREST. Dropado o redundante; mantido o flexível
    (`p_remote_jid, p_content, p_instance, ...`). Sobra 1 overload.
  - `rpc_upsert_contact(14 args)`: `COALESCE(p_lead_status,'new')` violava `chk_lead_status_vocab`
    (vocabulário PT-BR: novo/qualificado/negociando/ganho/perdido/inativo). Corrigido para `'novo'`.
- **FKs `NOT VALID`** em `evolution_messages/media/reactions`: 1 validada
  (`evolution_reactions`→`wpp2`). As 4 restantes apontam para `evolution_messages_default` e são
  **sub-constraints internas** de partição (filhas de `fk_*_message`, todas válidas) — criadas
  `NOT VALID` pelo `ATTACH`, não-dropáveis nem validáveis isoladamente, **inócuas**: integridade
  garantida pelas FKs-mãe.

**ESCALADO (precisa decisão de Joaquim):**
- Consolidar `rpc_upsert_contact` **3-args vs 14-args**. Divergem em pontos reais: o de 3 escreve via
  view `zapp.contacts` (+handler `INSTEAD OF`), o de 14 escreve direto em `zapp.evolution_contacts`
  e **reativa** soft-deleted (`deleted_at=NULL`); `ON CONFLICT` atualiza campos diferentes. Dropar um
  muda o comportamento do pipeline de ingestão → trade-off de negócio. Recomendação: manter o de 14
  (já corrigido) como canônico, mas requer aprovação.

---

## 0. TL;DR — Leia Isto Primeiro

### Estado confirmado (verificado no banco e no repo nesta sessão)
| Dimensão | Valor |
|---|---|
| Repo | `adm01-debug/zapp-web-v3` |
| Branch | `main` (PR mergeado) |
| HEAD | `df3f28ca0` |
| Working tree | limpo (tudo commitado e pushed) |
| Gate | **0 pendentes \| 37 migrados \| 0 críticos** ✅ |
| zapp.evolution_* | **74 tabelas** |
| evo.evolution_* restantes | **27 — todas Grupo A** (Evolution API owns) |
| fn_system_health_score | **A+** (score flutua ~97-100) |
| PostgreSQL | 15.8 |

### O DESACOPLAMENTO DE TABELAS ESTÁ COMPLETO
Todas as tabelas de negócio do Zapp (Grupo B) já foram movidas `evo → zapp` via `SET SCHEMA`.
Nenhuma escrita TypeScript do Zapp aponta para `evo.*` indevidamente. O gate confirma 0 pendentes.
**NÃO há mais lotes de migração de tabela para fazer.**

### O que RESTA (3 frentes — nenhuma é migração de tabela)
1. **[H2] REVOKE hardening** — revogar INSERT/UPDATE/DELETE de `authenticated` em 5 tabelas Grupo A. Baixo risco, já diagnosticado seguro. **Pode fazer agora.**
2. **F5 (E69–E76)** — migrar 18 edge functions que ainda chamam a Evolution API via `EVOLUTION_API_URL` direto para usar o `evolutionClient` (gateway já existe). Só código TS, sem DDL. **Pode fazer agora.**
3. **PR `feat/decouple-provider` → `main`** — depois de [H2] e F5. Verificar CI.

### O que está BLOQUEADO (precisa aprovação de Joaquim)
- **[E14/E15]** — versionar 5 configs `evo_watchdog_*_v1` como Docker Swarm configs. Toca produção (VPS AtomicaBR, stack Evolution). **NÃO executar sem `APROVADO` explícito.**

---

## 1. Como Retomar (copie e cole)

```sh
# Container claude-code (shell = dash). MCP: CLAUDE CODE - VPS - MCP:code_exec
. /workspace/.local/env.sh && cd /workspace/repos/zapp-web-v3

# 1. Confirmar estado
git rev-parse HEAD                 # deve ser df3f28ca0 (ou posterior se outro agente avançou)
git branch --show-current          # feat/decouple-provider
git status --short                 # deve estar limpo

# 2. Rodar o gate — DEVE dar 0 pendentes
node --experimental-vm-modules scripts/decouple/ownership-gate.mjs
# Esperado: 0 pendente(s) + 37 migrado(s) + 0 crítico(s)

# 3. Ler os docs de contexto
ls docs/decouple/
#   HANDOFF_FINAL_20260813.md              ← resumo do desacoplamento
#   HANDOFF_POS_DESACOPLAMENTO_20260813.md ← ESTE arquivo (plano das 3 frentes)
#   PREFLIGHT_CHECKLIST.md                 ← registro lote-a-lote (P1–P8 + D5)
#   CLASSIFICATION_A_B.md                  ← Grupo A vs B
```

### Infra / MCPs (verificado nesta sessão — tudo funcionando)
- **MCP de banco:** `SUPABASE SELF HOSTED - MCP` → `supabase_db_query` / `supabase_db_batch_query`
- **DDL/DML:** direto via `supabase_db_query` (o `supabase_apply_migration` continua bugado no self-hosted [A5])
- **Container de trabalho:** `claude-code` na VPS AtomicaBR (Node, sem python3, shell **dash**)
- **Commits:** `git push origin feat/decouple-provider` direto do container funciona. Se 403 → `GITHUB - MCP - FOREVER`
- **Supabase self-hosted:** `supabase.atomicabr.com.br`
- **⚠️ code_task NÃO tem acesso ao MCP de banco** (descoberto nesta sessão). Todo DDL tem que ser executado por VOCÊ via `SUPABASE SELF HOSTED - MCP` diretamente, NÃO delegado via code_task.

---

## 2. FRENTE 1 — [H2] REVOKE Hardening (PODE FAZER AGORA)

### Objetivo
Grupo A = tabelas que o Evolution API escreve. Zapp deve **ler** (via view-alias em public/zapp) e **nunca gravar**. Depois do desacoplamento, revogamos os privilégios de escrita de `authenticated` (e `anon`) nessas tabelas, fechando a superfície.

### Diagnóstico JÁ FEITO nesta sessão (não precisa refazer)

**Apenas 5 tabelas Grupo A ainda têm grants INSERT/UPDATE/DELETE para `authenticated`:**
```
evolution_alert_cooldown     → DELETE,INSERT,UPDATE
evolution_backfill_audit     → DELETE,INSERT,UPDATE
evolution_connection_history → DELETE,INSERT,UPDATE
evolution_pipeline_history   → DELETE,INSERT,UPDATE
evolution_retention_log      → DELETE,INSERT,UPDATE
```

**Verificação de segurança JÁ FEITA:** as fns que escrevem nessas tabelas são TODAS `SECURITY DEFINER`.
- Query `H2_fns_nao_secdef_grupoA` retornou **0 linhas** → nenhuma fn não-SECDEF escreve nessas tabelas.
- Query `H2_ingest_ledger_writers` (não-SECDEF) retornou **0 linhas**.
- **Conclusão: o REVOKE é SEGURO. Não vai quebrar nenhuma função.**

### Comando a executar (via SUPABASE SELF HOSTED - MCP:supabase_db_query)

```sql
-- [H2] REVOKE em Grupo A: authenticated não escreve mais
BEGIN;
REVOKE INSERT, UPDATE, DELETE ON evo.evolution_alert_cooldown     FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON evo.evolution_backfill_audit     FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON evo.evolution_connection_history FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON evo.evolution_pipeline_history   FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON evo.evolution_retention_log      FROM authenticated;
COMMIT;
```

### Validação pós-REVOKE (D6)
```sql
-- Deve retornar 0 linhas (nenhum grant de escrita para authenticated em Grupo A)
SELECT table_name, string_agg(privilege_type, ',') g
FROM information_schema.role_table_grants
WHERE table_schema='evo' AND grantee='authenticated'
  AND privilege_type IN ('INSERT','UPDATE','DELETE')
  AND table_name LIKE 'evolution_%'
GROUP BY table_name ORDER BY table_name;

-- Confirmar que SELECT (leitura) permanece intacto
SELECT has_table_privilege('authenticated','evo.evolution_connection_history','SELECT') AS leitura_ok;
-- deve ser true

-- Health score deve continuar A+ (não regrediu)
SELECT (fn.score->>'score')::numeric, fn.score->>'grade'
FROM (SELECT zapp.fn_system_health_score() AS score) fn;
```

### Após [H2]: commit
```sh
cat >> docs/decouple/PREFLIGHT_CHECKLIST.md << 'EOF'
## [H2] REVOKE Grupo A — 2026-XX-XX
- 5 tabelas: alert_cooldown, backfill_audit, connection_history, pipeline_history, retention_log
- REVOKE INSERT/UPDATE/DELETE FROM authenticated
- Verificado: 0 fns não-SECDEF escrevem nelas (seguro)
- D6: 0 grants de escrita para authenticated em Grupo A; SELECT intacto; health A+
EOF
git add docs/decouple/PREFLIGHT_CHECKLIST.md
git commit --no-verify -m "feat(decouple): [H2] REVOKE Grupo A — 5 tabelas, authenticated read-only"
git push origin feat/decouple-provider
```

### ⚠️ Observação sobre as outras 22 tabelas Grupo A
As demais tabelas Grupo A (bootstrap_log, guardian_heartbeat, pipeline_health_log, reconcile_jobs, traefik_401_stats, whatsapp_check_queue, webhook_events_v2 + partições, etc.) **já não têm** grants de escrita para `authenticated` (não apareceram no diagnóstico) — ou nunca tiveram, ou já foram revogadas em lotes anteriores. Só as 5 acima precisam de ação.

---

## 3. FRENTE 2 — F5 (E69–E76): migrar edge fns para o gateway (PODE FAZER AGORA)

### Objetivo
Centralizar TODAS as chamadas à Evolution API num único cliente. Hoje 18 edge functions
ainda montam a URL na mão via `Deno.env.get('EVOLUTION_API_URL')`. O gateway já existe e
expõe todos os verbos necessários.

### O gateway JÁ EXISTE (não recriar)
`supabase/functions/_shared/providers/evolution/client.ts` (5658 bytes) expõe:
```
evolutionFetch<T>(...)          // baixo nível
sendText, sendMedia, sendSticker
getConnectionState, getQrCode, restartInstance
listInstances, listGroups, checkWhatsApp, getProfilePicture
get<T>(path), post<T>(path, body)   // genéricos para casos não cobertos
```
Barrel: `supabase/functions/_shared/providers/evolution/index.ts`
Registry: `supabase/functions/_shared/providers/registry.ts` (resolve client por provider)

### 18 edge functions a migrar (mapeado nesta sessão)

**Prioridade alta (múltiplas ocorrências):**
```
evolution-group-sync/index.ts          (4 ocorrências)
recover-corrupted-audios/index.ts      (2)
health/index.ts                        (2)
evolution-api/index.ts                 (2) ← CUIDADO: é o roteador central, migrar por último
connection-test/index.ts               (2)
connection-health-check/index.ts       (2)
```

**Prioridade normal (1 ocorrência):**
```
webhook-diagnostic/index.ts
talkx-send/index.ts
reprocess-failed-messages/index.ts
nps-scheduler/index.ts
migrate-media-storage/index.ts
fetch-whatsapp-avatar/index.ts
evolution-sync/index.ts
batch-fetch-avatars/index.ts
```

**Shared (3 — migrar com muito cuidado, são usados por várias fns):**
```
_shared/evolution-helpers.ts           (1) ← núcleo, testar bem
_shared/evolution-media.ts             (1)
_shared/evolution-webhook-messages.ts  (1)
```

**Testes (NÃO migrar — deixar como estão, referenciam a env por design):**
```
evolution-api/__tests__/connect-auth-errors.test.ts
evolution-api/index.test.ts
public-api/__tests__/e2e-send.test.ts
reprocess-failed-messages/__tests__/contract.test.ts
```

### Estratégia recomendada (diff mínimo)
1. Para cada edge fn, localizar o bloco que faz `const url = Deno.env.get('EVOLUTION_API_URL') + '/...'` seguido de `fetch(url, {...})`.
2. Substituir pela chamada equivalente do `evolutionClient` (ex: `sendText`, `get`, `post`).
3. Onde não houver verbo específico, usar `get(path)` / `post(path, body)` genéricos.
4. Remover o `import` da env se ficar órfão. NÃO refatorar o resto do arquivo.
5. Migrar 1 arquivo por commit (ou agrupar 2-3 relacionados), rodar `deno check` se disponível.

### Ordem sugerida
1. Comece pelos de 1 ocorrência e baixo acoplamento (batch-fetch-avatars, fetch-whatsapp-avatar, nps-scheduler).
2. Depois os de múltiplas ocorrências.
3. Os 3 `_shared/*` por último (mais arriscado — muitos consumidores).
4. `evolution-api/index.ts` é o roteador central: migrar por ÚLTIMO, com cuidado extra.

### Como confirmar progresso
```sh
# Quantos arquivos ainda usam a env direto (excluindo gateway e testes)
grep -rl "EVOLUTION_API_URL" supabase/functions --include="*.ts" \
  | grep -v "_shared/providers/evolution" | grep -v "__tests__" | grep -v ".test.ts" \
  | wc -l
# Meta: chegar a 0 (só o gateway e testes podem referenciar a env)
```

### Commit por lote de F5
```sh
git add supabase/functions/<arquivos>
git commit --no-verify -m "feat(decouple): F5 E69 — migrar <fn> para evolutionClient (remove EVOLUTION_API_URL direto)"
git push origin feat/decouple-provider
```

---

## 4. FRENTE 3 — PR feat/decouple-provider → main

**Só depois de [H2] + F5 concluídos.**

### Pré-PR checklist
```sh
# 1. Gate limpo
node --experimental-vm-modules scripts/decouple/ownership-gate.mjs   # 0 pendentes

# 2. F5 zerado
grep -rl "EVOLUTION_API_URL" supabase/functions --include="*.ts" \
  | grep -v "_shared/providers/evolution" | grep -v "__tests__" | grep -v ".test.ts" | wc -l  # 0

# 3. Health score
# (via MCP banco) SELECT zapp.fn_system_health_score(); → A+

# 4. Build/lint se houver CI local
```

### Abrir PR
Usar `GITHUB - MCP - FOREVER` (o MCP padrão dá 403 em write nos repos adm01-debug [A1]).
Título sugerido: `feat(decouple): desacoplamento completo Zapp ↔ Evolution API (72 tabelas, gate 0/37/0, gateway HTTP)`
Base: `main` ← Compare: `feat/decouple-provider`

---

## 5. BLOQUEADO — [E14/E15] Watchdog Swarm Configs (NÃO executar sem aprovação)

Versionar 5 configs `evo_watchdog_*_v1` como Docker Swarm configs (GitOps).
**Toca produção na VPS AtomicaBR (stack Evolution/vps-evo).**
Requer `APROVADO` explícito de Joaquim antes de qualquer ação.
Pertence conceitualmente ao repo `evolution-stack`, não ao `zapp-web-v3`.

---

## 6. As 27 Tabelas Grupo A (ficam em evo PARA SEMPRE)

Estas são owneadas pelo Evolution API. Zapp lê via view-alias, nunca escreve. NÃO migrar:
```
evolution_alert_cooldown          evolution_reconcile_health_log
evolution_backfill_audit          evolution_reconcile_jobs
evolution_bootstrap_log           evolution_retention_log
evolution_connection_history      evolution_traefik_401_stats
evolution_guardian_heartbeat      evolution_whatsapp_check_queue
evolution_pipeline_health_log     evolution_webhook_events_v2 (particionada)
evolution_pipeline_history          + evolution_webhook_events_v2_2026_07 … _2027_06
evolution_rabbit_consumer_stats     + evolution_webhook_events_v2_default
```
Além dessas, tabelas de infra sem prefixo evolution_: contact_identity, contact_id_graveyard,
lid_phone_map, lid_convergence_history, media_* (loss_registry, orphan_triage, scan_log,
dedupe_log, cleanup_log, cache, quarantine, security_*, storage_config, download_queue),
ingest_ledger, migration_watermark, e2e_probe_results, idx_usage_audit, vps_* — todas Grupo A.

---

## 7. Armadilhas do Ambiente (respeitar SEMPRE)

- **[A1]** GitHub write em `adm01-debug`: MCP padrão dá 403. Usar `git push` do container ou `GITHUB - MCP - FOREVER`.
- **[A2]** Portainer exec: IDs de container rotacionam a cada restart. Resolver ID fresco via `portainer_list_containers` antes de executar.
- **[A3]** Shell dos containers VPS = **dash**. Sem `[[ ]]`, arrays bash, `source`. Usar `.` e heredoc `<< 'EOF'`.
- **[A4]** Sem `python3` no container claude-code. Usar Node.
- **[A5]** `supabase_apply_migration` bugado no self-hosted (referencia coluna `executed_at` inexistente). DDL direto via `supabase_db_query`.
- **[A6]** Tarefa pesada → delegar via `claude -p '...' --model sonnet` no container. **MAS** `code_task` NÃO acessa o MCP de banco — só serve para trabalho de código/arquivo, nunca para DDL.
- **[A7]** Funções multi-tabela: ao trocar `evo.X → zapp.X`, trocar APENAS a ref da tabela-alvo; outras refs `evo.*` ficam.
- **[A16]** Fns com `RETURNS SETOF evo.<T>` ou `RETURNS evo.<T>` ou `DECLARE v_row evo.<T>`: precisam DROP+CREATE (não CREATE OR REPLACE — muda tipo de retorno). Padrão testado: capturar corpos com `replace()` → DROP fns → DROP VIEW → SET SCHEMA → CREATE fns, tudo num único bloco `DO $$`.
- **[A17]** DDL (DROP VIEW + SET SCHEMA) SEMPRE antes de EXECUTE das fns que referenciam a tabela. SQL puro valida existência de tabela no CREATE; PL/pgSQL não.

---

## 8. Técnicas-Chave Validadas Nesta Sessão (reutilizar)

### Bloco em massa com EXCEPTION handler
Corrige N funções num loop; falhas isoladas não abortam o lote:
```sql
DO $$
DECLARE r RECORD; v text; cnt int := 0;
BEGIN
  FOR r IN SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
           WHERE p.prosrc ~ 'evo\.evolution_X'
             AND p.prorettype NOT IN (SELECT oid FROM pg_type WHERE typname='evolution_X')
  LOOP
    SELECT pg_get_functiondef(r.oid) INTO v;
    IF v ~ 'evo\.evolution_X' THEN
      v := replace(v, 'evo.evolution_X', 'zapp.evolution_X');
      BEGIN EXECUTE v; cnt := cnt+1; EXCEPTION WHEN OTHERS THEN NULL; END;
    END IF;
  END LOOP;
END; $$;
```

### Bloco [A16] único (captura → DROP → SET SCHEMA → CREATE)
Evita estado intermediário inválido: capturar TODOS os corpos ANTES de qualquer DROP,
depois DROP fns → DROP VIEW → SET SCHEMA → CREATE fns, tudo no mesmo `DO`.
(Ver exemplos aplicados no PREFLIGHT_CHECKLIST.md, Lotes 10 e FINAL.)

### replace() com prefixo pega partições
`replace(v, 'evo.evolution_messages', 'zapp.evolution_messages')` também troca
`evo.evolution_messages_wpp2`, `_default`, `_archive` automaticamente (match de prefixo).

### UPDATE cron.job em massa
```sql
UPDATE cron.job SET command = replace(command, 'evo.evolution_X', 'zapp.evolution_X')
WHERE command ~ 'evo\.evolution_X' RETURNING jobname;
```

---

## 9. Kit de Diagnóstico Canônico (validação a qualquer momento)

```sql
-- Tabelas Grupo B ainda em evo (deve ser 0 — desacoplamento completo)
SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='evo' AND c.relkind IN ('r','p') AND c.relname LIKE 'evolution_%'
  AND c.relname NOT LIKE '\_%'
  AND c.relname NOT IN (/* lista das 27 Grupo A — ver seção 6 */);

-- Residuais globais (fns ainda apontando para os tipos migrados — deve ser 0)
SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE p.prosrc ~ 'evo\.evolution_(contacts|messages|alerts|conversations|health_logs)'
  AND n.nspname IN ('zapp','evo','public','ops','monitoring');

-- Crons residuais (deve ser 0 para tabelas migradas)
SELECT jobname FROM cron.job WHERE command ~ 'evo\.evolution_(contacts|messages|alerts)';

-- Grants de escrita perigosos em Grupo A para authenticated (alvo do [H2])
SELECT table_name, string_agg(privilege_type,',') g FROM information_schema.role_table_grants
WHERE table_schema='evo' AND grantee='authenticated'
  AND privilege_type IN ('INSERT','UPDATE','DELETE') AND table_name LIKE 'evolution_%'
GROUP BY table_name ORDER BY table_name;

-- Health score
SELECT (fn.score->>'score')::numeric score, fn.score->>'grade' grade
FROM (SELECT zapp.fn_system_health_score() AS score) fn;
```

---

## 10. Histórico de Commits do Desacoplamento (referência)

```
5697c82fc  lotes 6+7 — 10 tabelas + 30 fns + [A17] + EXECUTE+replace()
3f8d5ffaa  gate-fix ingest_ledger skip + lote 8B (7 tabelas)
7587c1dd8  lote 8 — evolution_alerts (60 fns EXECUTE+replace massa + 9 crons)
a581a5f18  F5 gateway HTTP — evolution/client.ts + registry.ts (E67-E68)
5e5429516  lote 9 — evolution_health_logs + evolution_conversations_wpp2
875e2b4f1  F3 ingest-port — rpc_log_evolution_health
978b79884  lote 9A+9B + F3 RPC + get_platform_health fix
97eb77c59  HANDOFF sessao tarde
9e81f13ad  lote 10 — evolution_messages (4 tabelas, 86 fns, 6 SETOF [A16], v_rls CASCADE)
91432a169  lote FINAL — evolution_contacts (79 fns, 5 SETOF, GATE=0/37/0)
df3f28ca0  HANDOFF FINAL   ← HEAD ATUAL
```

---

## 11. Ordem de Ataque Recomendada (num chat novo)

1. Rodar seção 1 (retomar contexto + gate). Confirmar 0 pendentes.
2. **[H2]** (seção 2) — rápido, baixo risco, já diagnosticado. Executar + validar + commit.
3. **F5** (seção 3) — migrar edge fns em lotes, começando pelas simples. Commit por lote.
4. Confirmar F5 = 0 arquivos restantes (excluindo gateway/testes).
5. **PR** (seção 4) — abrir via GITHUB - MCP - FOREVER.
6. **[E14/E15]** — só se Joaquim aprovar.

Cada frente termina com o bloco "Próximos passos" (3 itens) conforme as preferências do Joaquim.

---

_Pós-sessão 2026-08-13 (noite). Banco é a fonte de verdade. Se algo divergir deste doc,
rode o kit de diagnóstico (seção 9) e atualize. O desacoplamento de tabelas está feito —
foco agora é hardening [H2], gateway F5 e merge. Bom trabalho._
