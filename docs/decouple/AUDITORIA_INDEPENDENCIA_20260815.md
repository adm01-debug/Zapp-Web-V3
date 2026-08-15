# Auditoria de Independência — ZAPP-WEB × Evolution API

**Data:** 2026-08-15
**Pergunta:** após a separação cirúrgica de 2 dias, os dois viraram de fato dois sistemas individualizados e independentes?
**Método:** análise estática dos 2 repositórios + medição direta no Postgres de produção (stack 35) + execução dos gates de CI.

---

## Veredito

**Separação parcial. Real onde foi medida, ausente onde não foi.**

| Camada | Situação | Nota |
|---|---|:--:|
| Repositórios e infra (imagens, stacks, workflows) | **Separados de fato** | 10/10 |
| Egresso HTTP do app → Evolution (front + edge) | **Unificado em um gateway** | 9/10 |
| Ingestão Evolution → app (webhook) | **Fronteira HTTP com HMAC** | 9/10 |
| Egresso SQL (Postgres → Evolution) | Existe, documentado, **fora do gateway** | 6/10 |
| **Banco de dados** | **Um único cluster, dois schemas fundidos** | **3/10** |
| **Plataforma/deploy** | **evolution-stack deploya a infra do ZAPP** | **2/10** |
| Modelo de domínio do app | Nome do provider vazado em 303 arquivos | 4/10 |

O que existe hoje é **um sistema com dois repositórios**, não dois sistemas.
O corte foi feito no plano do *código e da infraestrutura de container*; não foi feito no plano
do **dado** nem no plano da **plataforma**. Esses dois planos são exatamente onde mora a
dependência que impede trocar de provider ou operar um sem o outro.

> Nota de justiça: a direção adotada (consolidar as tabelas canônicas em `zapp` e deixar a
> Evolution stateless) é **arquiteturalmente defensável** e está registrada no
> `SCORECARD_V4.md` como dimensão 2. O problema não é a direção — é que a migração parou
> no meio: `evo` ainda tem 50 tabelas, 99 funções tocando `zapp` e 6 FKs cruzando a fronteira.

---

## Parte 1 — O que ficou de fato independente (com prova)

### 1.1 Infra Evolution saiu do zapp-web-v3 — confirmado

```
$ ls infra/evolution*        → nada
$ find infra -iname "*evolution*"  → nada
$ ls .github/workflows/publish-evolution*  → nada
```

Os 8 workflows de build e as 13 stacks Swarm estão em `adm01-debug/evolution-stack`
(`publish-evolution-api-custom.yml`, `publish-evolution-consumer.yml`, `gitops-stacks.yml`, …).
O CI `decouple-guard.yml` falha o build se `infra/evolution*` ou `publish-evolution*.yml`
reaparecerem. **Esse guard funciona e é honesto** — testa presença de arquivo, não snapshot.

### 1.2 Gateway HTTP único — confirmado por execução

```
$ node scripts/decouple/inventory.mjs
front invoke bypass:       0  ✅
backend URL bypass:        0  ✅
front evo writes:          0  ✅
front direct evo http:     0  ✅
TOTAL: 0
```

`EVOLUTION_API_URL` é lido em **exatamente um** ponto de runtime:
`supabase/functions/_shared/providers/evolution/client.ts:31`. As demais 36 ocorrências no
repo são testes, comentários, regras de lint (`.deno-lint-rules/no-direct-evo-url.ts`),
docs ou o `connection-health-check` (exceção declarada por design no `inventory.mjs:197`).

`callEvolutionApi` foi removido do runtime (`whatsappConnectionRepository.ts:90`);
sobrevive apenas em nomes de teste.

### 1.3 Egresso do front passa pelo adapter — confirmado

`src/lib/whatsappAdapter.ts` roteia por modo (`rpc_get_whatsapp_mode`, cache 30s):
`unofficial → evolution-api`, `official → whatsapp-cloud-send`, com degradação explícita
quando faltam credenciais Cloud (`whatsappAdapterTransport.ts:resolveTransport`).
Esse é o único mecanismo de troca de provider que existe **e funciona hoje**.

### 1.4 Ingestão tem fronteira HTTP real — confirmado

`evolution-stack/consumer/consumer.py:283-290` faz `POST` para
`https://supabase.atomicabr.com.br/functions/v1/evolution-webhook/<evento>` com
`x-webhook-signature: sha256=…` (HMAC, secret `supabase_webhook_secret_v1`).
Não é acoplamento de processo — é contrato de rede assinado. Correto.

### 1.5 O pipeline está vivo (não é separação no papel)

Medido em produção em 2026-08-15T00:34Z:

| Métrica | Valor |
|---|---|
| Última mensagem gravada | `00:33:00Z` (1 min antes da medição) |
| Mensagens nas últimas 24h | **926** |

---

## Parte 2 — O que **não** ficou independente

### A1 — Banco de dados único, e as tabelas canônicas foram para dentro do `zapp`

Esta é a descoberta central, e ela **contradiz o `CLAUDE.md` do repo**.

O `CLAUDE.md` afirma: *"`evo.evolution_messages` = raiz particionada"*, *"no schema `zapp`,
`evolution_messages` existe como view auto-updatable"*, *"`evo.*` → propriedade da Evolution"*.

**Medição no banco de produção diz o contrário:**

| Objeto | Realidade medida |
|---|---|
| `zapp.evolution_messages` | **tabela particionada** (`relkind='p'`) — é a base |
| `zapp.evolution_conversations` | **tabela particionada** (`relkind='p'`) — é a base |
| `evo.evolution_messages` | **não existe** |
| `evo.evolution_messages_v2` | **view** → `SELECT … FROM zapp.evolution_messages` |
| `public.evolution_messages` | view → `zapp.evolution_messages` |

Ou seja: o lado "Evolution" (`evo`) hoje **lê de dentro do schema do app**. A fronteira de
propriedade descrita em `DECOUPLING.md` ("zapp lê via 12 views de contrato") está invertida
na prática — existem **331 views em `public` sobre `zapp.*`**, não 12 views de contrato sobre `evo`.

Os dois schemas vivem no **mesmo cluster Postgres** (stack 35). Não há isolamento de falha,
de backup, de upgrade, de `statement_timeout`, de WAL nem de blast radius. Um lock longo em
`evo` degrada o app; uma migration ruim no app degrada a monitoria da Evolution.

### A2 — O repo da Evolution deploya a plataforma do ZAPP (inversão de propriedade)

`evolution-stack/stacks/` contém, além das stacks da Evolution:

| Arquivo | O que deploya |
|---|---|
| `stacks/supabase.yml` | **A stack Supabase inteira** — Postgres, Kong, GoTrue, PostgREST, Realtime, Edge Runtime. É o banco e a API do ZAPP. |
| `stacks/evolution-functions-health.yml` | Health das **edge functions do zapp** (ex-`zapp-functions-health`) |
| `infra/watchdogs/zapp_health_guard_script_v2.sh` | Watchdog do **zapp** |
| `docs/infra/portainer-snapshots/2026-08-14/stack-157-zapp-web-prod.yml` | Snapshot do **front de produção do zapp** |
| `docs/infra/portainer-snapshots/2026-08-14/stack-228-zapp-ops.yml` | Snapshot do **zapp-ops** |

Consequência prática: **o ZAPP não consegue subir sem o repo evolution-stack.**
Uma rotação de segredo do Supabase, um upgrade do Postgres ou uma mudança de
`PGRST_DB_SCHEMAS` do app são feitos no repo do provider. O `stacks/supabase.yml` traz no
cabeçalho 20+ linhas de changelog de mudanças que são do ZAPP, não da Evolution
(`LOGISTICA-SCHEMA-2026-08-14: PGRST_DB_SCHEMAS … logistica exposto`,
`GOTRUE-CLEANUP-2026-08-14: removidos … zapp-web-v3.vercel.app`).

Isso é o oposto de independência: se um dos dois repos precisa do outro para existir,
é o **zapp** que depende do **evolution-stack**, e no ponto mais crítico possível (o banco).

### A3 — O schema `evo` é escrito por dois repositórios

- `zapp-web-v3`: **28 migrations** criam/alteram objetos em `evo.*`
  (`20260807102155_onda3_d2_negocio_triggers_evo_contrato_views_rpc.sql`,
  `20260811150100_evo_integridade_fks_limpezas.sql`, …)
- `evolution-stack`: possui `db/migrations/` próprio e o README declara
  *"Migrations do schema `evo` no Postgres compartilhado"*

Dois donos para o mesmo schema, sem lock distribuído entre pipelines. Drift é questão de tempo,
não de probabilidade.

### A4 — Acoplamento cruzado massivo dentro do banco

Medido via `pg_proc` / `pg_views` / `pg_constraint` em produção:

| Direção | Quantidade |
|---|---:|
| Funções `evo.*` que referenciam `zapp.*` | **99** |
| Funções `zapp.*` que referenciam `evo.*` | **40** |
| Views `zapp.*` que referenciam `evo.*` | **31** |
| Views `evo.*` que referenciam `zapp.*` | **18** |
| FKs `evo.* → zapp.*` | **6** |
| FKs `zapp.* → evo.*` | 0 |

As 6 FKs (integridade referencial *hard*, cross-schema):

```
evo.media_download_queue  → zapp.evolution_messages          (fk_mdq_message)
evo.media_download_queue  → zapp.evolution_messages_wpp2
evo.media_download_queue  → zapp.evolution_messages_default
evo.media_loss_registry   → zapp.evolution_messages          (fk_mlr_message_uuid_instance)
evo.media_loss_registry   → zapp.evolution_messages_wpp2
evo.media_loss_registry   → zapp.evolution_messages_default
```

Enquanto essas FKs existirem, **`evo` não pode ser movido para outro banco** sem quebrar
integridade — é uma solda, não uma interface.

> O `ADR-DB-002` (06/08) já mapeou isso e decidiu, explicitamente, *"NENHUM DDL nesta onda"*,
> classificando 17 funções como "monitoria = exceção formal" e 3 como **NEGÓCIO a corrigir**
> (`fn_auto_assign_contact`, `fn_log_assignment_change`, `sync_contact_intelligence`).
> Nove dias depois, o DDL continua pendente e o número subiu de 20 para 99 funções `evo`
> tocando `zapp`.

### A5 — O `pg_cron` opera os dois lados como um sistema só

45 jobs ativos misturam os schemas. Dois exemplos que são acoplamento puro:

```
job 189  evo_cleanup_expired_contact_ids
         DO $$ BEGIN PERFORM evo.cleanup_expired_contact_ids();
                     PERFORM zapp.cleanup_expired_contac… END $$   ← mesmo statement

job 193  guardian-db-heartbeat-resilient
         INSERT INTO zapp.evolution_guardian_heartbeat …           ← job "evo" escrevendo em zapp
```

Não há como pausar a manutenção de um lado sem afetar o outro.

### A6 — Existe uma segunda porta de egresso que o gateway não cobre

O `DECOUPLING.md` afirma **"12 verbos, 0 bypasses"**. Isso é verdade **apenas para edge functions**.
O Postgres tem seu próprio canal HTTP para a Evolution API, via `pg_net`, agendado:

| Job | Frequência | Função | Ativo |
|---|---|---|:--:|
| 317 `outbound-queue-dispatch` | **a cada 2 min** | `zapp.fn_outbound_dispatch(30)` — envia mensagens | sim |
| 27 `whatsapp_reconcile_dispatch` | a cada 5 min | `zapp.fn_reconcile_dispatch()` | sim |
| 329 `lid-api-sync-weekly` | diário | `evo.fn_sync_lid_from_api()` | sim |
| — | on-demand | `zapp.fn_validate_whatsapp_connection_url()` | — |

Essas funções montam URL e chave via `ops.fn_evo_url()` / `ops.fn_evo_key()` (padrão do
ADR-010, correto) — mas **não passam pelo `client.ts`, nem pelo `registry.ts`, nem pelo
`whatsappAdapter`**. Trocar de provider exige reescrever PL/pgSQL, não só TypeScript.

Isso está documentado como "porta P4" no `BOUNDARY-evolution.md`, então não é omissão — é
escopo. Mas a frase "0 bypasses" no `DECOUPLING.md` induz a erro e deve ser qualificada.

*(Atenuante medido: `outbound_message_queue` teve **0 registros nas últimas 24h** — a porta
está armada, mas ociosa. O envio real hoje ocorre pelo caminho do adapter.)*

### A7 — O nome do provider vazou no modelo de domínio do app

- **303 arquivos** em `src/` mencionam "evolution"
- **35 leituras** `.from('evolution_*')` no front (20 em `evolution_messages`, 5 em `evolution_contacts`, …)
- **5 edge functions específicas do provider chamadas direto do React**, fora do adapter:

```
ConnectionsView.tsx           → invoke('evolution-sync')
useMonitoringManagement.ts    → invoke('evolution-webhook')
useWhatsAppTemplates.ts       → invoke('evolution-templates')
useEvolutionApiIntegration.ts → invoke('evolution-credentials')
ZappWebbDemoPage.tsx          → invoke('evolution-proxy')      ← DEPRECATED por ADR-011
```

O `inventory.mjs` marca `front invoke bypass: 0` porque só conta `evolution-api`. As outras
cinco passam. Resultado: trocar de provider hoje exige mexer em **componentes de UI**, não
em configuração — o que é a definição de acoplamento.

`registry.ts` também não sustenta a promessa ainda:
```ts
case 'cloud':
  throw new Error('Cloud provider client not yet implemented');
```

---

## Parte 3 — Fragilidades dos próprios controles

### F1 — O `sql-gate` do CI valida um fixture obsoleto, não o banco

`decouple-guard.yml` roda:
```
node scripts/decouple/sql-gate.mjs scripts/decouple/fixtures/sql_report_snapshot.json
```
com o comentário *"CI não tem acesso ao banco — o snapshot é a fonte de verdade"*.

| Fonte | Funções no escopo da query do gate |
|---|---:|
| Fixture commitado | **12** |
| Banco de produção (mesma query) | **25** |

Aplicando a regra do gate contra o banco real, **5 funções seriam reprovadas** e não estão
no fixture:

```
evo.fn_download_wa_status_media
evo.fn_notify_sicoob_on_reply
evo.fn_trigger_audio_transcription
zapp.fn_escalate_critical_alerts
zapp.fn_send_bitrix_alert
```

Inspecionando os corpos, **as 5 são falsos positivos** do heurístico (fazem `net.http_post`
para `supabase.atomicabr.com.br` ou para o n8n, mencionando "evolution" apenas em nome de
tabela). O egresso real está correto. **Mas isso não salva o gate:** ele está 13 funções
atrás da realidade e, por construção, é incapaz de detectar a regressão que existe para
impedir. Hoje ele testa o fixture, não o sistema.

### F2 — As âncoras do egresso SQL não estão versionadas

`ops.fn_evo_url()` e `ops.fn_evo_key()` são o ponto único onde URL e chave da Evolution são
resolvidas no banco. Confirmado por grep: **zero** `CREATE … FUNCTION ops.fn_evo_*` em
`supabase/migrations/` ou em `db/` — nos dois repositórios. Elas existem **só no banco de
produção**. Se o banco for perdido ou recriado, o gate continua passando (o fixture está
commitado) e o egresso quebra. O próprio `SUBSTITUABILITY_MATRIX_V4.md:133` já registra isso.

### F3 — `CLAUDE.md` está desatualizado no ponto mais sensível

As regras de schema do `CLAUDE.md` (seção "Regras Críticas de Schema", itens 2 e 4) descrevem
a topologia **anterior** à migração `evo→zapp`. Um agente que siga o `CLAUDE.md` hoje vai
configurar Realtime em `schema: 'evo'` para `evolution_messages` — e receber **zero eventos**,
porque a relação física está em `zapp`. Contagens também divergem (`evo`: doc diz 136 tabelas,
banco tem 50 + 8 auxiliares).

### F4 — Escrita morta no consumer

`consumer.py:239` faz `INSERT INTO public.evolution_webhook_events`. Essa relação **não existe**
no banco (verificado em `pg_class` para `public`/`zapp`/`evo`). O insert falha silenciosamente
a cada evento — telemetria perdida sem alarme.

---

## Parte 4 — Resposta direta à pergunta

**Não. Ainda não são dois sistemas independentes.**

O que foi feito em 2 dias é real e não é pouco: a infra saiu, o egresso HTTP foi centralizado
em um gateway com 12 verbos e zero bypass medido, o front ganhou um adapter com roteamento
dual, e a ingestão virou um contrato HTTP assinado. Nessas camadas a separação **passou no teste**.

Mas independência de sistemas se testa com uma pergunta operacional simples:

> *"Consigo derrubar/mover/substituir um sem tocar no outro?"*

Hoje a resposta é não, por três motivos que nenhum gate de CI cobre:

1. **Compartilham o mesmo Postgres**, com 6 FKs cruzadas, 139 funções cruzando schemas e
   45 cron jobs operando os dois lados no mesmo relógio.
2. **O repo do provider deploya a plataforma do app** (`stacks/supabase.yml`). O ZAPP não
   sobe sem o evolution-stack.
3. **A troca de provider ainda exige tocar em UI e em PL/pgSQL**, não só em configuração —
   o `registry.ts` sequer implementa o segundo provider.

O `SCORECARD_V4.md` do próprio time se dá **9,4/10**. Essa nota é coerente **para o escopo que
o time definiu** (as 4 portas de egresso/ingestão). Medindo *independência de sistemas* em vez
de *portas de egresso*, a nota honesta fica em torno de **6/10**: a fronteira de código está
feita, a fronteira de dado e de plataforma não começou.

---

## Parte 5 — O que falta, em ordem de impacto

| # | Ação | Destrava | Esforço |
|:--:|---|---|---|
| 1 | Mover `stacks/supabase.yml`, `evolution-functions-health` e `zapp_health_guard` para o zapp-web-v3 (ou para um terceiro repo `platform`) | Remove a dependência do ZAPP em relação ao repo do provider | Médio |
| 2 | Eliminar as 6 FKs `evo→zapp` (trocar por `message_id` lógico + reconciliação) | Torna `evo` fisicamente separável do banco do app | Médio |
| 3 | Dono único para o schema `evo` (um repo só faz migration nele) | Elimina drift entre pipelines | Baixo |
| 4 | Versionar `ops.fn_evo_url()` / `ops.fn_evo_key()` em migration | Egresso SQL deixa de ser DB-as-source | **Baixo** |
| 5 | Regenerar o fixture do `sql-gate` a partir do banco e agendar a regeneração (ou dar acesso read-only ao CI) | Gate volta a medir a realidade | **Baixo** |
| 6 | Atualizar `CLAUDE.md` (topologia `evo`↔`zapp`, regra de Realtime, contagens) | Para de induzir agentes a erro | **Baixo** |
| 7 | Levar as 5 `invoke('evolution-*')` do React para dentro do `whatsappAdapter` | Troca de provider deixa de tocar UI | Médio |
| 8 | Implementar `case 'cloud'` no `registry.ts` + ensaio cronometrado (F5 do scorecard) | Prova executável de substituibilidade | Médio |
| 9 | Concluir o DDL pendente do `ADR-DB-002` (3 funções de NEGÓCIO em `evo` escrevendo em `zapp`) | Fecha a exceção formal que já dura 9 dias | Médio |
| 10 | Corrigir/remover o `INSERT INTO public.evolution_webhook_events` do consumer | Recupera telemetria perdida | **Baixo** |

Os itens 4, 5, 6 e 10 são de esforço baixo e alto retorno de confiança — valem uma onda curta
antes de qualquer trabalho estrutural.

---

## Anexo — Como reproduzir as medições

```bash
# Repos e gates
node scripts/decouple/inventory.mjs
node scripts/decouple/sql-gate.mjs scripts/decouple/fixtures/sql_report_snapshot.json
grep -rn "EVOLUTION_API_URL" --include="*.ts" supabase/functions/ | grep -v __tests__
```

```sql
-- Acoplamento cruzado no banco
SELECT
 (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='evo' AND p.prosrc ~* '\mzapp\.')                        AS evo_fns_ref_zapp,
 (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='zapp' AND p.prosrc ~* '\mevo\.')                        AS zapp_fns_ref_evo,
 (SELECT count(*) FROM pg_views WHERE schemaname='zapp' AND definition ~* '\mevo\.') AS zapp_views_ref_evo,
 (SELECT count(*) FROM pg_views WHERE schemaname='evo'  AND definition ~* '\mzapp\.') AS evo_views_ref_zapp;

-- FKs cruzando a fronteira
SELECT c.conname, tn.nspname||'.'||t.relname AS origem, fn.nspname||'.'||f.relname AS destino
FROM pg_constraint c
JOIN pg_class t ON t.oid=c.conrelid  JOIN pg_namespace tn ON tn.oid=t.relnamespace
JOIN pg_class f ON f.oid=c.confrelid JOIN pg_namespace fn ON fn.oid=f.relnamespace
WHERE c.contype='f' AND tn.nspname IN ('evo','zapp') AND fn.nspname IN ('evo','zapp')
  AND tn.nspname <> fn.nspname;

-- Onde estão de fato as tabelas canônicas
SELECT n.nspname, c.relname, c.relkind FROM pg_class c
JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE c.relname IN ('evolution_messages','evolution_conversations') AND c.relkind IN ('r','p','v');

-- Egresso SQL: escopo real do sql-gate (comparar com o fixture de 12 entradas)
SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE (p.prosrc ~ 'net\.http_' OR p.prosrc ~ 'vault\.decrypted_secrets')
  AND n.nspname IN ('evo','zapp','ops','public');
```
