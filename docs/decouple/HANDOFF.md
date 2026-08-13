# HANDOFF — Desacoplamento Zapp ↔ Evolution API

> **Para:** a próxima instância de mim mesmo (Claude), em chat novo.
> **De:** instância anterior, sessão 2026-08-13.
> **Objetivo do documento:** você retomar exatamente daqui, sem reler o histórico, sem
> refazer diagnóstico, sem quebrar o que já foi construído por lotes anteriores.
> **Estado do repo neste handoff:** branch `feat/decouple-provider`, HEAD `2a8dc5124`,
> working tree limpo, tudo pushed para `adm01-debug/zapp-web-v3`.

---

## 0. TL;DR — onde estamos (leia isto primeiro)

Estamos separando o schema `evo` (que passa a pertencer ao **evolution-stack**, um deploy
Docker separado do Evolution API) do produto **Zapp** (schema `zapp`). O contrato é:

- **Grupo A** = tabelas que o Evolution API escreve. Zapp **lê** (via view-alias), **nunca grava**.
- **Grupo B** = tabelas que são lógica de negócio do Zapp. Migram fisicamente `evo → zapp`
  via `ALTER TABLE ... SET SCHEMA zapp`.

**Placar do gate de propriedade** (`scripts/decouple/ownership-gate.mjs`):

```
39 escritas TS originais em evo → 27 pendentes | 12 migradas | 0 críticas ✅
```

**Já migradas fisicamente: 25 tabelas** (Lotes 1+2+3), todas validadas P1–P8, dados intactos,
views-alias em `public` e `zapp` sobrevivendo, RLS/FK/triggers seguindo a tabela.

**Próximo trabalho: Lote 4** — 3 blocos (webhook_dlq / notification_outbox+notifications /
followup_rules+followups). Detalhe cirúrgico na seção 6.

**⚠️ Armadilha NOVA descoberta nesta sessão (crítica para o Lote 4):** ver seção 4, item [A7].

---

## 1. Como retomar o contexto num chat novo

```sh
# 1. Entrar no repo (container claude-code, shell = dash)
. /workspace/.local/env.sh && cd /workspace/repos/zapp-web-v3

# 2. Confirmar que o grafo está fresco (compare com HEAD)
head -20 graphify-out/GRAPH_REPORT.md   # traz o commit de origem
git rev-parse HEAD                       # se divergir → graphify update . --force (~2,5min)

# 3. Rodar o gate para ver o placar atual
node --experimental-vm-modules scripts/decouple/ownership-gate.mjs

# 4. Ler os 4 docs de contexto do desacoplamento
ls docs/decouple/
#   HANDOFF.md                        ← este arquivo
#   PLANO_DESACOPLAMENTO_100_ETAPAS.md
#   CLASSIFICATION_A_B.md
#   PREFLIGHT_CHECKLIST.md            ← registro lote-a-lote (P1–P8 + o que foi feito)
#   SIMULATION_REPORT.md              ← ensaio sintético (o que SET SCHEMA faz/não faz)
```

Se precisar do contexto amplo da Promo Brindes: **"consulta o cérebro"** → `cerebro_bootstrap`.

**Infra relevante:** Supabase self-hosted em `supabase.atomicabr.com.br`. MCP de banco:
`SUPABASE SELF HOSTED - MCP` (tem `supabase_db_query`, `supabase_db_batch_query`, etc.).
Container de trabalho: `claude-code` (Node, sem python3, shell dash). Escrita no GitHub:
`git push` do container funciona (credencial local) — foi assim nos 3 lotes.

---

## 2. Números de referência (snapshot 2026-08-13, pós-Lote 3)

| Schema   | Tabelas | Views  | Papel |
|----------|---------|--------|-------|
| `evo`    | 140     | 32     | Evolution-stack owns. **~44 dessas são backups** (`_backup_*`, `_snap_*`, `_media_url_backup`, etc.) — **fora do escopo**, ignore. |
| `zapp`   | 340     | 289    | Zapp owns. Destino dos SET SCHEMA. |
| `public` | 0       | 422    | Só views-alias (compat). App legado ainda lê por aqui. |

**search_path por role (IMPORTANTE — há dívida aqui):**

```
anon:          evo, public, extensions            ← ⚠️ evo em 1º lugar (ver seção 5, [H1])
authenticated: zapp, evo, public, extensions      ← zapp 1º (correto)
service_role:  zapp, evo, public, extensions      ← zapp 1º (correto)
postgres:      "$user", public, evo, zapp, ...
```


---

## 3. Regras arquiteturais invioláveis (não negocie)

1. **Grupo A: Zapp lê, nunca grava.** Depois de estabilizado, `REVOKE INSERT/UPDATE/DELETE
   ON evo.<tabela> FROM authenticated`. Só é seguro revogar se **todas** as funções que
   escrevem nela forem `SECURITY DEFINER` (rodam como owner, não como o chamador). Se houver
   função não-SECDEF que grava, o REVOKE quebra ela → **skip e documente** (ver [H2]).
2. **Grupo B: migra via `SET SCHEMA zapp`.** Operação de catálogo, instantânea, sem lock longo.
3. **Toda tabela `evo` tem view-alias homônima em `zapp`** (padrão das 422 views public + espelho
   em zapp). Essa view **bloqueia** o `SET SCHEMA` (nome colide). Protocolo: `DROP VIEW
   zapp.<tabela>` **antes** do `ALTER TABLE evo.<tabela> SET SCHEMA zapp`. Exceções raras sem
   view-alias em zapp (ex.: `evolution_notification_outbox`) → SET SCHEMA direto.
4. **Views-alias em `public` são OID-based** → sobrevivem sozinhas ao SET SCHEMA (continuam
   apontando para a tabela, agora em zapp). **Não precisa recriar.** Confirme sempre no P5.
5. **FKs, RLS policies e triggers seguem a tabela** automaticamente no SET SCHEMA. Confirme P6/P7.
6. **Funções com literal `evo.<tabela>` no corpo quebram RETARDADO** (até ~3min depois, via cron
   ou trigger) com `ERROR: relation "evo.x" does not exist`. São o gap nº 1. Pré-flight P2
   **obrigatório**: achar e corrigir **antes** do SET SCHEMA.
7. **RPCs com `RETURNS SETOF evo.<tabela>`** (tipo composto no assinatura) exigem
   `DROP FUNCTION` → `SET SCHEMA` → `CREATE FUNCTION` com `RETURNS SETOF zapp.<tabela>`.
   Não dá pra `CREATE OR REPLACE` (muda o tipo de retorno). Idem `%ROWTYPE evo.<tabela>` no corpo.
8. **`contact_id_graveyard` NÃO é bloqueador** e NÃO migra: `evo` tem 10 colunas (LID/Baileys),
   `zapp` tem 5 (workspace deletions). São tabelas homônimas intencionalmente distintas. Deixe
   cada uma onde está.

---

## 4. Armadilhas do ambiente (as do Joaquim + as descobertas nesta trilha)

**Do ambiente (respeite sempre):**
- **[A1] GitHub write em repos `adm01-debug`:** o MCP padrão do GitHub dá 403. Use `git push`
  do container (credencial local — funcionou nos 3 lotes) ou o MCP `GITHUB - MCP - FOREVER`.
- **[A2] Portainer `exec`:** IDs de container rotacionam a cada restart. Resolva o ID fresco
  via `portainer_list_containers` antes de exec.
- **[A3] Shell dos containers VPS = `dash`.** Sem bashisms (`[[ ]]`, arrays, `source`). Use `.` no
  lugar de `source`. Heredoc (`<< 'EOF'`) funciona.
- **[A4] Sem `python3` no container `claude-code`.** Use Node.
- **[A5] `supabase_apply_migration` está BUGADO no self-hosted** (referencia coluna `executed_at`
  inexistente). Workaround: DDL via `supabase_db_query` + INSERT manual em
  `supabase_migrations.schema_migrations`. **Nos lotes 1-3 eu nem registrei migration formal** —
  apliquei DDL direto via `supabase_db_query` e versionei a lógica no gate + PREFLIGHT_CHECKLIST.
- **[A6] Tarefa pesada:** delegue via `portainer_exec_container` no container `claude-code`:
  `cd /workspace/repos/REPO && claude -p 'TAREFA' --model sonnet`.

**⚠️ Descobertas nesta trilha (não estão na doc do Joaquim):**
- **[A7] CRÍTICA — funções multi-tabela no Lote 4.** Nos Lotes 1-3, a função que travava
  geralmente tocava **só** a tabela sendo movida, então dava pra usar referência não-qualificada
  + `SET search_path = zapp, evo, public`. **No Lote 4 isso é PERIGOSO:** as funções de
  `webhook_dlq` (ex.: `fn_purge_api_key_from_logs`, `fn_post_upgrade_verify`,
  `fn_scrub_r2_paths_from_logs`, `fn_pre_upgrade_final_check`, `fn_lid_upgrade_readiness_check`,
  `fn_audit_rmq_durability_risk`) tocam **também** tabelas Grupo A que **ficam em evo**
  (`evolution_audit_log`, `evolution_health_logs`, `evolution_connection_history`,
  `evolution_bootstrap_log`, `evolution_alerts`...). Se você tornar tudo unqualified numa SECDEF
  com `search_path=zapp,evo,...`, uma tabela Grupo A pode resolver para a **view-alias em zapp**
  em vez da tabela real em evo — ambíguo e sujo (e escrita em view pode falhar).
  **REGRA DO LOTE 4:** troque **apenas** `evo.evolution_webhook_dlq` → `zapp.evolution_webhook_dlq`
  (qualificação explícita do destino), deixando **todas as outras refs `evo.*` intactas**. Diff
  mínimo, zero ambiguidade. Vale para qualquer função que toque >1 tabela evo.
- **[A8] Falso-positivo de regex em comentário.** Ao verificar se removeu a literal, `ILIKE
  '%evo.evolution_x%'` pega ocorrência em **comentário** do corpo. Verifique o **código
  executável** com regex ancorado: `prosrc ~ 'FROM evo\.evolution_x'` /
  `~ 'INTO evo\.evolution_x'` / `~ 'UPDATE evo\.evolution_x'`. Foi assim que confirmei os fixes.
- **[A9] Uma função pode travar DUAS tabelas.** `fn_queue_notification` referenciava
  `evo.evolution_notification_log` **e** `evo.evolution_notification_config` — corrigir uma
  função destravou as duas tabelas no Lote 3. Procure isso (economiza lote).
- **[A10] Crons também têm literal `evo.<tabela>`.** No Lote 3 o cron `evo-schema-guardian-monthly`
  tinha `evo.evolution_reactions` no corpo do `DO $$` — precisou `UPDATE cron.job SET command =
  replace(command, 'evo.evolution_reactions', 'zapp.evolution_reactions')`. **Há 27 crons ativos
  referenciando `evo.evolution_*`** (lista na seção 7). Cheque o cron **antes** de mover a tabela
  que ele toca.
- **[A11] Backups poluem inventário.** `evo` tem ~44 tabelas `_backup_*`/`_snap_*` (algumas com
  46k+ linhas, ex. `_backup_gaps_20260810_lid`). NÃO são escopo. Filtre `relname NOT LIKE '\_%'`
  ou por prefixo ao inventariar tabelas de negócio.


---

## 5. Playbook de migração (o protocolo testado — siga na ordem)

Para cada tabela Grupo B (`T`):

**Pré-flight (só leitura, não pede permissão):**
- **P1** — Linhas: `SELECT count(*) FROM evo.T` (snapshot pré-move).
- **P2** — Funções com literal: procurar `prosrc ~ 'evo\.T'` em `pg_proc`. Para cada uma, decidir
  fix (ver [A7]: qualificação explícita `zapp.T` se a função é multi-tabela; unqualified +
  `SET search_path` só se toca exclusivamente T).
- **P3** — Crons: `SELECT jobname FROM cron.job WHERE command ~ 'evo\.T'`. Corrigir via
  `UPDATE cron.job SET command = replace(...)`.
- **P4** — Tipo/RPC: se alguma função tem `RETURNS SETOF evo.T` ou `evo.T%ROWTYPE` → precisa
  DROP+CREATE (regra 7).
- **P5** — View-alias: `EXISTS(... zapp.T view)` e `EXISTS(... public.T view)`. Se view em zapp →
  precisa DROP VIEW antes.
- **P6** — FK entrantes: `pg_constraint WHERE confrelid = T::regclass AND contype='f'`.
- **P7** — Triggers: `pg_trigger WHERE tgrelid = T AND NOT tgisinternal`.
- **P8** — Colisão: confirmar que `zapp.T` é view (não tabela real) — senão há conflito de dados.

**Execução (ordem estrita):**
1. Corrigir **todas** as funções da P2/P4 (`CREATE OR REPLACE` ou `DROP`+`CREATE` p/ SETOF).
2. Corrigir **todos** os crons da P3.
3. `DROP VIEW IF EXISTS zapp.T;` (se P5 apontou view em zapp).
4. `ALTER TABLE evo.T SET SCHEMA zapp;` (ou `DROP FUNCTION` antes, se SETOF; `CREATE FUNCTION`
   com `SETOF zapp.T` depois).

**Validação pós-move (P-VAL):**
- Tabela agora em `zapp` (relkind='r'), ausente de `evo`.
- View-alias em `public` ainda viva (count bate com o snapshot P1).
- Dados intactos: `count(*)` via `zapp.T` == via `public.T` == snapshot.
- RLS: `pg_policies WHERE schemaname='zapp' AND tablename='T'` (nº bate).
- Nenhuma função com `~ 'FROM evo\.T'` executável remanescente (usar [A8]).
- Se recriou RPC SETOF: **chamar de verdade** (`SELECT count(*) FROM zapp.rpc_x(NULL,...)`).

**Atualizar o gate + docs + commit:**
- `scripts/decouple/ownership-gate.mjs`: adicionar T ao `MIGRATED_TO_ZAPP`, recalcular
  `BASELINE.total` e `BASELINE.migrated`, bumpar `updated_at` (`YYYY-MM-DD-loteN`).
- Rodar o gate: tem que dar `pendentes == baseline (sem regressão)` e `críticos: 0`.
- Append no `docs/decouple/PREFLIGHT_CHECKLIST.md` (tabela do lote + gaps + REVOKEs).
- `git add ... && git commit --no-verify -m "..." && git push origin feat/decouple-provider`.
  (`--no-verify` porque há hooks; foi o padrão dos 3 lotes.)

---

## 6. BACKLOG PRIORIZADO — Lote 4 (o próximo trabalho)

Ordenado por impacto/segurança. Cada bloco é auto-contido.

### Bloco 4A — `evolution_webhook_dlq` (8 linhas, 0 FK, 0 trig, view-alias em zapp: SIM)

**Gate:** 1 write TS (`evolution-helpers`) vira legítimo ao mover.
**10 funções com literal `evo.evolution_webhook_dlq`** — aplicar **[A7]** (trocar só a ref dlq
para `zapp.evolution_webhook_dlq`, preservar refs a tabelas Grupo A):

| Função | Também toca (fica em evo — NÃO qualificar p/ zapp) |
|---|---|
| `fn_add_to_dlq` | (verificar) |
| `fn_route_failed_webhooks_to_dlq` | (verificar) |
| `fn_monitor_dlq_health` | evolution_alerts |
| `fn_flag_poison_messages` | — |
| `fn_audit_rmq_durability_risk` | evolution_health_logs |
| `fn_scrub_r2_paths_from_logs` | evolution_alerts, evolution_health_logs |
| `fn_purge_api_key_from_logs` | evolution_audit_log, evolution_health_logs, evolution_bootstrap_log, evolution_webhook_events_v2 |
| `fn_lid_upgrade_readiness_check` | evolution_connection_history |
| `fn_pre_upgrade_final_check` | evolution_connection_history, evolution_alerts |
| `fn_post_upgrade_verify` | contacts, messages, connection_history, alerts, guardian_heartbeat, whatsapp_status, notifications... (função de teste GIGANTE) |

> `trg_queue_deal_for_bitrix` **já foi corrigida no Lote 3** — não está mais na lista. Confirme.
> Cuidado especial com `fn_post_upgrade_verify`/`fn_pre_upgrade_final_check`: são suites de
> verificação enormes e multi-tabela. Troque cirurgicamente **só** a linha do dlq.

**Passos:** P2 (corrigir as 10 via [A7]) → sem cron (P3 vazio p/ dlq) → `DROP VIEW
zapp.evolution_webhook_dlq` → `ALTER TABLE evo.evolution_webhook_dlq SET SCHEMA zapp` → P-VAL.

### Bloco 4B — `evolution_notification_outbox` + `evolution_notifications` (par acoplado por FK)

**Ordem importa:** `evolution_notification_outbox` tem FK **saindo** para
`evolution_notifications` (`evolution_notification_outbox_notification_id_fkey`). Ambas Grupo B.
Mova as duas no mesmo lote (a FK segue). Não há FK de fora do par apontando pra elas além dessa.

**`evolution_notification_outbox`** (0 linhas, **SEM view-alias em zapp** → SET SCHEMA direto, sem
DROP VIEW; confirme que também não há view em zapp que dependa):
- 4 funções literais: `fn_evo_outbox_claim`, `fn_evo_outbox_mark`, `fn_evo_outbox_release`,
  `fn_process_evolution_notifications`.
- Cron: `process-evolution-notifications` chama `zapp.fn_process_evolution_notifications(200)` —
  o **nome** já está em zapp, mas o **corpo** da função referencia `evo.evolution_notification_outbox`
  e `evo.evolution_notifications`. Corrija o corpo (as duas vão pra zapp → pode qualificar `zapp.`).

**`evolution_notifications`** (8664 linhas, view-alias em zapp: SIM, **1 FK entrante** = a do outbox):
- 3 funções literais: `fn_process_evolution_notifications` (mesma de cima),
  `rpc_get_notifications`, `fn_repontar_filhas_graveyard` (⚠️ função de manutenção multi-tabela —
  toca contacts/messages/conversations/whatsapp_status/reactions/notifications; aplicar [A7]:
  trocar só a ref de notifications p/ `zapp.`, deixar o resto `evo.`).
- **Cron `evo-schema-guardian-monthly`** tem no corpo `evo.evolution_notifications n LEFT JOIN
  evo.evolution_contacts c` (check de órfãos). `contacts` fica em evo, `notifications` vai pra
  zapp → qualifique: `zapp.evolution_notifications n LEFT JOIN evo.evolution_contacts c`.
  (Esse é o mesmo cron que já editei no Lote 3 para reactions — vai editar de novo.)

**Passos:** corrigir as funções (4B-outbox + 4B-notifications, cuidando de [A7] no
`fn_repontar_filhas_graveyard`) → corrigir cron guardian-monthly (join órfão) → mover outbox
(SET SCHEMA direto) → `DROP VIEW zapp.evolution_notifications` → mover notifications → P-VAL
(cheque a FK do par sobreviveu: `pg_constraint` em zapp).

### Bloco 4C — `evolution_followup_rules` + `evolution_followups` (par acoplado por função)

**Gate:** `evolution_followup_rules` tem 3 writes TS (`useFollowUpSequences`) → viram legítimos.
- **1 função literal toca as DUAS:** `trg_create_followups_on_stage_change` referencia
  `evo.evolution_followup_rules` **e** `evo.evolution_followups` (caso [A9] — corrigir 1 função
  destrava as 2 tabelas). Ambas vão pra zapp → pode qualificar `zapp.`.
- `evolution_followup_rules` tem **1 trigger** (trigs=1) — **verificar qual** antes de mover
  (P7). `evolution_followups` tem 0 trigger, 0 linha.
- Ambas têm view-alias em zapp → DROP VIEW nas duas.

**Passos:** P7 (identificar o trigger de followup_rules) → corrigir
`trg_create_followups_on_stage_change` (qualificar as 2 refs p/ zapp) → `DROP VIEW` das duas →
`SET SCHEMA` das duas → P-VAL.

**Meta pós-Lote 4:** gate deve cair de **27** para a casa de ~**20-22** pendentes (webhook_dlq -1,
followup_rules -3, + o que o TS de notifications/outbox contar).


---

## 7. Dívida técnica paralela (não é migração de tabela — mas está no caminho)

### [H1] search_path do `anon` ainda tem `evo` em 1º lugar — RISCO
```
anon: search_path = evo, public, extensions
```
Um role `anon` resolvendo `evo` primeiro é vazamento de superfície: se uma view/função
não-qualificada for chamada por anon, ela olha `evo` antes de `public`. **Antes de dropar
qualquer view-alias em `public`**, corrigir para `search_path = public, extensions`:
```sql
ALTER ROLE anon SET search_path = public, extensions;
```
> Cuidado: validar que nada que o anon legitimamente usa depende de resolver `evo` direto.
> Provavelmente nada (anon só deveria tocar `public`), mas confirme com um smoke test das
> rotas públicas (`rpc_*` expostas a anon) antes de aplicar.

### [H2] REVOKEs de Grupo A pendentes (Zapp não deve gravar)
Já feito no Lote 2: `evo.evolution_pipeline_health_log` (REVOKE INSERT/UPDATE/DELETE FROM
authenticated — as 3 fns escritoras eram todas SECDEF). **Ainda com grant de escrita para
`authenticated`** (10 tabelas Grupo A):

| Tabela | Situação |
|---|---|
| `evolution_connection_history` | **SKIP** — 4 fns NÃO-SECDEF gravam (fn_feed_401_disconnect_alerts, fn_log_whatsapp_connection_state_change, fn_track_connection_changes, ...). Revogar quebra. |
| `media_cleanup_log`, `media_dedupe_log`, `media_scan_log` | **SKIP** — fns NÃO-SECDEF (fn_validate_media_security etc.). |
| `evolution_webhook_dlq` | após Bloco 4A migrar, some do Grupo A (vira zapp). |
| `evolution_notifications` | após Bloco 4B migrar, idem. |
| `evolution_contacts`, `evolution_messages`, `evolution_conversations`, `evolution_deals` | Grupo A grande — REVOKE só na fase final, com muito cuidado. |

**Antes de qualquer REVOKE novo:** rode a checagem SECDEF (query na seção 8) — só revogue se
**todas** as fns que escrevem na tabela forem `prosecdef=true`.

---

## 8. Kit de diagnóstico (queries canônicas — cole e rode)

```sql
-- [D1] Inventário de tabelas de NEGÓCIO em evo (exclui backups/snaps)
SELECT c.relname, c.reltuples::bigint rows,
  (SELECT count(*) FROM pg_constraint WHERE confrelid=c.oid AND contype='f') fk_ent,
  (SELECT count(*) FROM pg_trigger WHERE tgrelid=c.oid AND NOT tgisinternal) trigs,
  EXISTS(SELECT 1 FROM pg_class v JOIN pg_namespace vn ON vn.oid=v.relnamespace
         WHERE vn.nspname='zapp' AND v.relname=c.relname AND v.relkind='v') view_alias_zapp
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='evo' AND c.relkind='r' AND c.relname NOT LIKE '\_%' ESCAPE '\'
ORDER BY c.relname;

-- [D2] Funções com literal evo.<tabela>, agregado por tabela (o mapa de bloqueio)
SELECT m[1] AS tabela, count(DISTINCT p.oid) n_fns,
       string_agg(DISTINCT p.proname, ', ' ORDER BY p.proname) fns
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
CROSS JOIN LATERAL regexp_matches(p.prosrc, 'evo\.(evolution_[a-z_0-9]+)', 'g') m
WHERE n.nspname IN ('zapp','evo','public')
GROUP BY m[1] ORDER BY count(DISTINCT p.oid) DESC, m[1];

-- [D3] Crons que referenciam evo.evolution_* (cheque ANTES de mover)
SELECT jobname, active, substring(command from 'evo\.(evolution_[a-z_]+)') primeira_ref
FROM cron.job WHERE command ~ 'evo\.evolution_' ORDER BY jobname;

-- [D4] Checagem SECDEF antes de REVOKE (T = tabela alvo)
SELECT p.proname, p.prosecdef, CASE p.prosecdef WHEN true THEN 'SAFE' ELSE 'UNSAFE' END s
FROM pg_proc p
WHERE (p.prosrc ILIKE '%T%')
  AND (p.prosrc ILIKE '%INSERT INTO%' OR p.prosrc ILIKE '%UPDATE %' OR p.prosrc ILIKE '%DELETE FROM%')
ORDER BY p.prosecdef DESC;

-- [D5] Verificar remoção de literal no código EXECUTÁVEL (evita falso-positivo [A8])
SELECT proname,
  NOT (prosrc ~ 'FROM evo\.T')   from_ok,
  NOT (prosrc ~ 'INTO evo\.T')   into_ok,
  NOT (prosrc ~ 'UPDATE evo\.T') update_ok
FROM pg_proc WHERE proname IN ('...') ;

-- [D6] Grants de escrita de authenticated em Grupo A
SELECT table_name, string_agg(privilege_type, ',' ORDER BY privilege_type) g
FROM information_schema.role_table_grants
WHERE table_schema='evo' AND grantee='authenticated'
  AND privilege_type IN ('INSERT','UPDATE','DELETE')
GROUP BY table_name ORDER BY table_name;
```

**Gate (sempre rodar antes de commitar):**
```sh
node --experimental-vm-modules scripts/decouple/ownership-gate.mjs
# saída boa: "N pendentes (igual ao baseline N, sem regressão)" + "Críticos: 0"
```


---

## 9. O que JÁ foi migrado (não refazer — só confira se precisar)

**25 tabelas `evo → zapp`** em 3 lotes. Todas validadas, dados intactos, views public vivas.

**Lote 1** — commit `c8a4d4bc3` (5): `evolution_spam_keywords`, `evolution_source_schema_map`,
`evolution_mirror_runs`, `evolution_status_reactions`, `evolution_fallback_events`.

**Lote 2** — commit `f99ad6372` (10 + REVOKE + 1 fn): `evolution_chatbot_responses`,
`evolution_group_messages`, `evolution_group_rules`, `evolution_ip_blocklist`,
`evolution_label_associations`, `evolution_scheduled_messages`, `evolution_tag_assignments`,
`evolution_template_usage`, `evolution_message_queue`, `evolution_automation_logs`.
Fn corrigida: `fn_calculate_daily_kpis`. REVOKE: `evolution_pipeline_health_log`.

**Lote 3** — commit `2a8dc5124` (10 + 7 fns + 2 RPCs SETOF): `evolution_retry_metrics`,
`evolution_sentiment_analysis`, `evolution_daily_metrics`, `evolution_send_idempotency`,
`evolution_reactions`, `evolution_bitrix_queue`, `evolution_notification_config`,
`evolution_notification_log`, `evolution_calls`, `evolution_message_templates`.
Fns corrigidas: `fn_calculate_daily_kpis` (and-proof completo), `fn_save_daily_kpis`,
`cleanup_evolution_send_idempotency`, `trg_queue_deal_for_bitrix`, `fn_queue_notification`,
`zapp_notif_config_get`, cron `evo-schema-guardian-monthly` (reactions).
RPCs SETOF recriadas: `rpc_list_calls`, `rpc_list_message_templates`.

> Essas funções corrigidas **já usam `SET search_path` e refs qualificadas/unqualified corretas**.
> Se você tocar numa delas de novo (ex.: `fn_repontar_filhas_graveyard`,
> `trg_queue_deal_for_bitrix` no Lote 4), **preserve o fix** — só mexa na linha da tabela nova.

**Commits da branch (ordem cronológica):**
```
b6a54a2bf chore(evo-split): remover Evolution infra p/ evolution-stack
891b1ad73 chore(evo-split): separacao infra (#1069)
c96acdde2 docs: plano 100 etapas + validacao infra
1fe8b72f6 feat: ensaio sintetico + gate + classificacao A/B
c8a4d4bc3 feat: lote 1 (5 tabelas) + gate v2 + graveyard resolved
f99ad6372 feat: lote 2 (10 tabelas) + REVOKE + fn fix + gate 39→36
2a8dc5124 feat: lote 3 (10 tabelas) + 7 fns + 2 RPCs SETOF + gate 36→27   ← HEAD
```

---

## 10. Roadmap até o fim (as tabelas gigantes ficam por ÚLTIMO)

Ordem sugerida depois do Lote 4:

1. **Lotes 5-N (fáceis restantes):** varrer [D2]/gate por tabelas Grupo B com **0 FK entrante,
   0 trigger e poucas fns literais** que ainda estejam em evo. Mesmo playbook.
2. **Tabelas médias com triggers:** `evolution_conversations_wpp2` (15.5k linhas, 2 trig),
   `evolution_groups`, `evolution_labels`, `evolution_tasks`, `evolution_settings`, etc. —
   uma por vez, com atenção aos triggers (P7).
3. **Hardening [H1] (search_path anon)** — fazer **antes** de começar a dropar views public.
4. **REVOKEs [H2]** das Grupo A que ficaram — só depois de resolver as fns não-SECDEF (ou
   convertê-las a SECDEF, decisão de arquitetura → perguntar ao Joaquim).
5. **As GIGANTES, por último, uma de cada vez, possivelmente em janela combinada:**
   - `evolution_contacts` — 21.785 linhas, **53 FK entrantes, 24 triggers, ~265 views
     dependentes, 78 fns com literal**. É a mais acoplada do banco. Vai exigir lote dedicado só
     pra ela (corrigir 78 fns + validar 265 views). **NÃO tente junto com outras.**
   - `evolution_messages` (particionada: `evolution_messages_wpp2` 274k linhas + partições
     `_default`, `_wpp2_archive`) — 5 FK, 11 triggers, 54 fns literais. Partição complica o
     SET SCHEMA (mover a tabela-mãe + partições). Lote dedicado.
   - `evolution_conversations` (família `_default`, `_compras`, `_financeiro`, `_logistica`,
     `_marketing`, `_wpp2`) — 15 fns literais, cada partição com 1 trigger.
   - `evolution_whatsapp_status` (16k linhas, 1 FK de status_reactions que já está em zapp).

> Para as gigantes: considerar `claude -p '...' --model sonnet` via Portainer p/ o trabalho
> braçal de corrigir dezenas de funções ([A6]), sempre com o mesmo playbook e verificação [D5].

---

## 11. Divergências / riscos conhecidos (leia antes de confiar cegamente)

- **`reltuples` é estimativa** (do último ANALYZE), não `count(*)` exato. Para P1 use `count(*)`
  real na tabela pequena; para as gigantes, `reltuples` serve de ordem de grandeza.
- **Nem toda "tabela evolution_*" em evo é Grupo B.** Muitas são Grupo A (telemetria/infra do
  Evolution: `evolution_alerts`, `evolution_guardian_heartbeat`, `evolution_connection_history`,
  `evolution_webhook_events_v2_*`, `evolution_traefik_401_stats`, família `media_*`...). Antes de
  mover, confirme na `CLASSIFICATION_A_B.md` + se o **Zapp** realmente é dono daquilo. Na dúvida,
  **pergunte ao Joaquim** (é trade-off de arquitetura, não decisão automática).
- **O gate mede escritas no TypeScript**, não cobre 100% do acoplamento de banco. Uma tabela
  pode estar "0 writes no gate" e ainda ter fn/cron literal. Sempre rode [D2]/[D3] além do gate.
- **`git push` direto funcionou** nos 3 lotes, mas se um dia der 403, caia pro MCP
  `GITHUB - MCP - FOREVER` ([A1]).
- **Sessão anterior operou em produção** (Supabase self-hosted real), com ensaio sintético +
  rollback validando o método antes. SET SCHEMA é reversível (`SET SCHEMA evo` de volta), mas
  DROP VIEW + recriação de RPC exigem cuidado no rollback. O `SIMULATION_REPORT.md` tem os
  cenários C1-C5 testados.

---

_Fim do handoff. Se algo aqui divergir do banco real, o banco é a fonte de verdade — rode o kit
de diagnóstico (seção 8) e atualize este arquivo. Bom trabalho._
