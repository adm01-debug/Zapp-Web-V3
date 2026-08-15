# Análise da fronteira `evo` × `zapp` — modelo ideal vs. realidade medida

**Data:** 2026-08-15
**Pergunta:** a arquitetura atual segue o modelo em que (1) só a Evolution escreve em `evo`,
(2) só o ZAPP web escreve em `zapp`, (3) o ZAPP web **lê** `evo`?
**Método:** medição direta no Postgres de produção (`pg_proc`, `pg_trigger`, `information_schema`,
`pg_stat_user_tables`) + leitura das stacks e do consumer no `evolution-stack`.

---

## Resposta

**Não. A arquitetura atual é, em quase todos os pontos, o inverso do modelo descrito.**

| # | Regra do modelo ideal | Realidade medida | Situação |
|:--:|---|---|:--:|
| 1 | Mensagens normalizadas são **cadastradas em `evo`** | São cadastradas em **`zapp`**. `evo` não recebe **nenhuma** mensagem, contato ou conversa. | ❌ invertida |
| 2 | ZAPP web **não escreve** em `evo` | Front: **correto** (bloqueado por 2 mecanismos). Banco: **12 funções `zapp.*` escrevem em `evo.*`** | ⚠️ parcial |
| 3 | Evolution **não escreve** em `zapp` | **64 funções `evo.*` escrevem em `zapp.*`**, via **26 triggers ativos** em tabelas do `zapp` | ❌ violada |
| 4 | ZAPP web **lê** `evo` | `evo` **não está exposto** no PostgREST. O app lê `zapp`. As 38 tabelas `evo` legíveis são **só de operação** | ❌ inexistente na prática |

O resumo em uma frase: **`evo` deixou de ser o schema do dado e virou o schema da operação;
`zapp` absorveu o dado bruto da Evolution; e a lógica do lado Evolution continua rodando
dentro das tabelas do `zapp` por triggers.**

---

## 1. Topologia real (são três bancos, não dois schemas)

O modelo mental de "2 schemas" omite uma peça. Existem **três** repositórios de dado:

```
┌─ PG14 nativo da VPS (stack postgres/20) ──────────────────────┐
│  database: evolution                                          │
│  Dono: Evolution API (Prisma). Tabelas Baileys/Prisma.        │
│  Secret: evolution_db_uri_evolution_app_v2                     │
│  → O ZAPP não toca aqui. Fronteira limpa.                     │
└───────────────────────────────────────────────────────────────┘
                          │ RabbitMQ
                          ▼
┌─ Consumer (stack 113, evolution-stack) ───────────────────────┐
│  A) HTTP POST + HMAC → functions/v1/evolution-webhook         │
│  B) psycopg2 direto → evo.evolution_rabbit_consumer_stats     │
└───────────────────────────────────────────────────────────────┘
                          │
┌─ Supabase / database postgres (stack 35) ─────────────────────┐
│  schema evo   → 58 tabelas: monitoria, mídia, LID, webhooks   │
│                  ZERO tabela de mensagem/contato/conversa     │
│  schema zapp  → 397 tabelas, INCLUINDO evolution_messages,    │
│                  evolution_conversations, evolution_contacts  │
└───────────────────────────────────────────────────────────────┘
```

A separação do **PG14 nativo** é real e correta: o banco próprio da Evolution API é dela,
e o ZAPP não escreve nem lê lá. O problema está inteiramente do lado Supabase.

Confirmação vinda do próprio repo do provider
(`evolution-stack/docs/infra/portainer-snapshots/2026-08-14/stack-228-zapp-ops.yml:3`):

> *"health-guard: KPIs 1-4 CEGOS (tabelas `evo.*` não existem mais no PG14 — estão no Supabase)"*

---

## 2. Regra 1 — o dado normalizado deveria ir para `evo`; vai para `zapp`

### Caminho de ingestão medido, ponta a ponta

```
Evolution API → RabbitMQ → consumer.py
   → POST https://supabase.atomicabr.com.br/functions/v1/evolution-webhook/<evento>
        (HMAC x-webhook-signature)
   → edge fn evolution-webhook  →  _shared/ingest-port.ts
        → supabase.rpc('rpc_insert_message', …)   [ingest-port.ts:59]
        → supabase.rpc('rpc_upsert_contact', …)   [ingest-port.ts:108]
```

E o que essas RPCs escrevem, lido de `pg_proc` em produção:

| RPC | Escreve em |
|---|---|
| `zapp.rpc_insert_message` (21 args) | `zapp.evolution_messages`, `zapp.evolution_contacts` |
| `zapp.rpc_upsert_contact` | `zapp.evolution_contacts` |
| `zapp.rpc_update_incoming_message` | `zapp.evolution_messages` |
| `zapp.rpc_claim_outbound_message` | `zapp.evolution_messages` |
| `zapp.fn_process_whatsapp_message` (normalizer canônico) | `zapp.evolution_messages`, `zapp.evolution_contacts`, `zapp.evolution_conversations` |

**Nenhuma escreve em `evo`.** As tabelas de destino são as bases físicas:
`zapp.evolution_messages` e `zapp.evolution_conversations` são **tabelas particionadas**
(`relkind='p'`), e `evo.evolution_messages` **não existe** — o que existe é
`evo.evolution_messages_v2`, uma **view que lê `zapp.evolution_messages`**.

### O que `evo` de fato recebe

Atividade de escrita nas tabelas `evo` (`pg_stat_user_tables`) — as 8 maiores:

| Tabela `evo` | ins | upd | del | natureza |
|---|---:|---:|---:|---|
| `mv_vps_category_breakdown` | 550 | 0 | 550 | matview de dashboard |
| `_snapshot_version_state` | 0 | 897 | 0 | controle de versão |
| `evolution_traefik_401_stats` | 689 | 0 | 0 | monitoria |
| `evolution_webhook_events_v2_2026_08` | 399 | 0 | 0 | auditoria de webhook |
| `ingest_ledger` | 389 | 0 | 0 | auditoria de ingestão |
| `evolution_guardian_heartbeat` | 269 | 0 | 0 | monitoria |
| `evolution_reconcile_jobs` | 47 | 136 | 0 | reconciliação |
| `evolution_pipeline_health_log` | 58 | 0 | 0 | monitoria |

**Zero registros de negócio.** `evo` hoje é um schema de observabilidade, mídia e LID —
não é o schema do dado da Evolution.

### Distinção importante e justa

Pela regra "só o ZAPP escreve em `zapp`", o caminho de ingestão **não viola autoria**: quem
executa o `INSERT` é código do próprio ZAPP (edge fn + RPC do schema `zapp`), não o processo
da Evolution. A violação aqui é de **localização do dado**, não de quem escreve: dado que
deveria residir em `evo` reside em `zapp`. São problemas diferentes e a correção é diferente
— mover tabela, não trocar autor.

---

## 3. Regra 2 — "ZAPP web não escreve em `evo`"

### No front: **cumprida**, e com dois mecanismos independentes

| Mecanismo | Evidência |
|---|---|
| Grants | `authenticated` tem **apenas SELECT** em 38 relations de `evo`. **Zero** INSERT/UPDATE/DELETE. `anon` não tem grant algum. |
| Exposição PostgREST | `PGRST_DB_SCHEMAS=public,zapp,storage,graphql_public,artes,vendas,financeiro,logistica` — **`evo` não está na lista** |

Por isso `.schema('evo')` devolve `PGRST205` — comportamento já documentado no próprio código
(`useIntegrationManagement.ts:27`, `evolution-credentials/index.ts:42`). Nenhuma edge function
usa `.schema('evo')` em runtime. Esta regra está protegida por construção.

### No banco: **violada** — 12 funções `zapp.*` escrevem em `evo.*`

```
zapp.fn_check_evolution_jid_health          zapp.fn_reconcile_apply
zapp.fn_mirror_to_webhook_events_v2         zapp.fn_reconcile_dispatch
zapp.fn_purge_api_key_from_logs             zapp.fn_reprocess_instance_webhook_events
zapp.fn_purge_processed_webhook_events      zapp.fn_reprocess_pending_webhook_events
zapp.fn_route_failed_webhooks_to_dlq        zapp.fn_upsert_lid_identity
zapp.fn_webhook_purge_consolidated          zapp.zapp_isonwa_mark
```

E `service_role` — a credencial das edge functions — tem **INSERT/UPDATE/DELETE em 92
relations de `evo`**. O bloqueio existe só para o usuário final; o backend do ZAPP tem acesso
irrestrito de escrita ao schema do provider.

---

## 4. Regra 3 — "Evolution não escreve em `zapp`" — a violação mais grave

**64 funções do schema `evo` escrevem em `zapp.*`.** E não são só rotinas de cron: **26 delas
rodam como trigger em tabelas do `zapp`**, ou seja, executam a cada linha inserida.

### Triggers ativos em tabelas `zapp` cuja função vive em `evo`

Em `zapp.evolution_messages_wpp2` (a partição que recebe o tráfego real), **9 triggers ativos,
8 com função `evo.*`**:

| Trigger | Função |
|---|---|
| `trg_normalize_remote_jid` | `evo.fn_normalize_remote_jid` |
| `trg_enforce_direction` | `evo.fn_enforce_direction` |
| `trg_touch_contact_last_message` | `evo.fn_touch_contact_last_message` |
| `trg_sync_status_to_dedicated` | `evo.fn_sync_status_from_messages` |
| `trg_enqueue_media_wpp2` | `evo.fn_auto_enqueue_media_download` |
| `trg_ledger_on_insert` | `evo.fn_ledger_from_insert` |
| `trg_filter_canary_messages` | `evo.fn_filter_canary_messages` |
| `trg_sicoob_reply` | `evo.fn_notify_sicoob_on_reply` |
| `trg_z_validate_no_internal_url` | `evo.fn_block_internal_media_url` |

Em `zapp.evolution_contacts`, **7 triggers ativos com função `evo.*`** — incluindo três de
**negócio puro**, não monitoria:

| Trigger | Função | O que faz |
|---|---|---|
| `trg_auto_assign_contact` | `evo.fn_auto_assign_contact` | distribui o lead para um atendente |
| `trg_log_assignment_change` | `evo.fn_log_assignment_change` | grava em `zapp.conversation_events` |
| `trg_sync_contact_intelligence` | `evo.sync_contact_intelligence` | mexe em `zapp.contact_intelligence` |

Essas três já estavam classificadas como **"NEGÓCIO — corrigir"** no `ADR-DB-002` de
**06/08/2026**, que decidiu *"NENHUM DDL nesta onda"*. Nove dias depois seguem ativas, e o
total de funções `evo` tocando `zapp` subiu de 20 (medição do ADR) para **64**.

Na direção inversa há apenas 2 triggers (`evo.media_quarantine` e `evo.media_storage_config`
com funções `zapp.*`) — desequilíbrio que mostra bem para que lado a fronteira vazou.

### Nuance: quem é "a Evolution" aqui

O **processo externo** da Evolution (container + consumer) **não escreve em `zapp`** — ele fala
HTTP assinado com a edge function, e sua única escrita direta no Supabase é
`evo.evolution_rabbit_consumer_stats` (telemetria), que é exatamente o comportamento correto.

Quem viola a regra é a **lógica residente no schema `evo`** — que, ironicamente, é versionada
no repo do ZAPP (28 migrations deste repo criam objetos em `evo`). A regra está quebrada por
código do próprio ZAPP escrito dentro do schema do provider.

---

## 5. Regra 4 — "ZAPP web lê `evo`" — o canal existe, mas não carrega dado de negócio

O canal de leitura está montado:

| Canal | Quantidade |
|---|---:|
| Views em `public` que leem `evo.*` | 35 |
| Views em `zapp` que leem `evo.*` | 31 |
| Tabelas `evo` legíveis por `authenticated` | 38 |

Mas as 38 tabelas legíveis são, sem exceção, de **operação**:
`media_download_queue`, `media_quarantine`, `media_scan_log`, `evolution_pipeline_health_log`,
`evolution_guardian_heartbeat`, `evolution_reconcile_jobs`, `evolution_webhook_events_v2`,
`vps_etapas`, `ops_runbooks`, `v_pipeline_health`, …

Nenhuma mensagem. Nenhum contato. Nenhuma conversa.

E como `evo` não está exposto no PostgREST, o app **não consegue** ler `evo` diretamente nem
que quisesse. As 35 leituras `.from('evolution_*')` do front resolvem para `public.*` → `zapp.*`.

Ou seja: o ZAPP não lê `evo` para operar — ele lê `evo` só para exibir telas de saúde e mídia.
A dependência de leitura que o modelo prevê **não existe**, porque o dado que a justificaria
foi para dentro do `zapp`.

---

## 6. Como se chegou aqui

Não foi acidente. Foi uma decisão registrada: o `SCORECARD_V4.md`, dimensão 2, chama-se
literalmente **"Migração física de tabelas evo→zapp"** e a marca como *"Concluída (congelamento
pendente — F7)"*.

A intenção por trás é defensável — o app passa a ser dono do seu dado canônico e o provider
vira stateless. Mas ela é **incompatível com o modelo descrito na pergunta**, e a migração
parou no meio: as tabelas mudaram de schema, mas **a lógica não foi junto**. O resultado é o
pior dos dois mundos:

- as tabelas estão em `zapp` → o modelo "evo é dono do dado" não vale mais;
- as funções e triggers continuam em `evo` → o modelo "cada um no seu schema" também não vale.

E a documentação ficou no modelo antigo: o `CLAUDE.md` deste repo ainda afirma que
`evo.evolution_messages` é a raiz particionada e que `zapp` a acessa por view. Um agente que
siga esse texto vai configurar Realtime em `schema: 'evo'` e receber zero eventos.

---

## 7. O que falta para chegar ao modelo ideal

Há duas rotas coerentes. **A escolha é de arquitetura, não técnica** — mas manter o estado
atual (meio-caminho) é a pior das três opções.

### Rota A — implementar o modelo da pergunta (`evo` é dono do dado)

| # | Ação | Impacto |
|:--:|---|---|
| A1 | Mover `evolution_messages`, `evolution_conversations`, `evolution_contacts` de volta para `evo` | Alto — envolve 14 partições, Realtime e a publication `supabase_realtime` |
| A2 | Repontar `rpc_insert_message` / `rpc_upsert_contact` / `fn_process_whatsapp_message` para escrever em `evo` | Médio |
| A3 | Criar as views de contrato `evo → public` para o app ler | Baixo |
| A4 | Revogar INSERT/UPDATE/DELETE de `service_role` em `evo`, deixando só as RPCs de ingestão | Médio |
| A5 | Mover as 12 funções `zapp.*` que escrevem em `evo` para o lado `evo` | Médio |

### Rota B — assumir o modelo já em curso (`zapp` é dono do dado, `evo` é ops)

| # | Ação | Impacto |
|:--:|---|---|
| B1 | Mover as 26 triggers e as 64 funções `evo.*` que escrevem em `zapp` **para o schema `zapp`** | Médio — é renomear/recriar função, sem tocar em dado |
| B2 | Concluir o DDL pendente do `ADR-DB-002` para as 3 funções de NEGÓCIO | Baixo |
| B3 | Renomear `evo` → `ops_evolution` (ou fundir com `ops`), deixando explícito que é observabilidade | Baixo |
| B4 | Eliminar as 6 FKs `evo → zapp` (`media_download_queue`, `media_loss_registry`) | Médio |
| B5 | Atualizar `CLAUDE.md`, `DECOUPLING.md` e `ADR-DB-002` para a topologia real | **Baixo** |

**Recomendação:** a Rota B é muito mais barata (nenhuma migração de dado, nenhum risco para o
Realtime) e chega a uma fronteira igualmente limpa — só que com o eixo diferente do descrito na
pergunta: `evo` = observabilidade do provider, `zapp` = dado canônico. A Rota A só compensa se
houver a intenção real de, um dia, mover `evo` para outro banco.

Em qualquer das duas, o item de menor custo e maior retorno imediato é o **B5**: hoje a
documentação descreve uma arquitetura que não existe há dias, e é ela que orienta as decisões.

---

## Anexo — queries de reprodução

```sql
-- Regra 1: onde o dado é escrito
SELECT n.nspname||'.'||p.proname AS rpc,
  (SELECT string_agg(DISTINCT m[1], ', ')
     FROM regexp_matches(p.prosrc,'(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+((?:evo|zapp)\.[a-z_]+)','gi') m) AS escreve_em
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE p.proname IN ('rpc_insert_message','rpc_upsert_contact','rpc_update_incoming_message',
                    'rpc_claim_outbound_message','fn_process_whatsapp_message');

-- Regra 2 e 3: quem escreve no schema do outro
SELECT n.nspname AS schema_da_funcao, count(*) FILTER (WHERE p.prosrc ~* '(INSERT INTO|UPDATE|DELETE FROM)\s+evo\.')  AS escreve_em_evo,
                                      count(*) FILTER (WHERE p.prosrc ~* '(INSERT INTO|UPDATE|DELETE FROM)\s+zapp\.') AS escreve_em_zapp
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname IN ('evo','zapp') GROUP BY 1;

-- Regra 3: triggers cruzando a fronteira
SELECT tn.nspname||'.'||t.relname AS tabela, tg.tgname, pn.nspname||'.'||p.proname AS funcao
FROM pg_trigger tg
JOIN pg_class t ON t.oid=tg.tgrelid  JOIN pg_namespace tn ON tn.oid=t.relnamespace
JOIN pg_proc  p ON p.oid=tg.tgfoid   JOIN pg_namespace pn ON pn.oid=p.pronamespace
WHERE NOT tg.tgisinternal AND tn.nspname IN ('evo','zapp')
  AND pn.nspname IN ('evo','zapp') AND pn.nspname <> tn.nspname;

-- Regra 2/4: permissões do app sobre evo
SELECT grantee, privilege_type, count(DISTINCT table_name)
FROM information_schema.role_table_grants
WHERE table_schema='evo' AND grantee IN ('anon','authenticated','service_role')
GROUP BY 1,2 ORDER BY 1,2;

-- Regra 1: o que evo realmente recebe
SELECT relname, n_tup_ins, n_tup_upd, n_tup_del FROM pg_stat_user_tables
WHERE schemaname='evo' AND (n_tup_ins+n_tup_upd+n_tup_del) > 0
ORDER BY (n_tup_ins+n_tup_upd+n_tup_del) DESC;
```

```bash
# Regra 4: schemas expostos no PostgREST
grep -n "PGRST_DB_SCHEMAS" /workspace/evolution-stack/stacks/supabase.yml
```
