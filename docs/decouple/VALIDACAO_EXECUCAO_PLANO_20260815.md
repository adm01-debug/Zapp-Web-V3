# Validação de Execução — Plano de Independência 100 Etapas (2026-08-15)

> Auditoria independente rodada em 2026-08-16, contra o Postgres de produção (self-hosted, host `10.0.1.3:5432`, PG 15.8, banco `postgres`, 2306 MB, confirmado via `db_connection_info`) e contra os repos `zapp-web-v3` (branch `claude/evolution-zapp-separation-analysis-29lixd`, HEAD `e79695d69`) e `evolution-stack` (branch `main`, HEAD `9afc684`).
>
> **Regra seguida**: só é ✅ VALIDADA o que eu rodei agora e colei evidência abaixo. Documento atualizado ou código existir não contam como evidência.

---

## 0. Alerta metodológico — leia antes do placar

1. **Armadilha de ferramenta descoberta e corrigida nesta sessão.** O MCP `supabase-supply-mcp` (primeira ferramenta tentada) aponta para um banco **diferente** — sem schemas `evo`/`zapp`, apenas `public`/`auth`/`storage`/etc. Todas as queries deste relatório foram re-executadas contra o MCP correto (`SUPABASE SELF HOSTED - MCP`), confirmado via `db_connection_info`/`db_list_schemas` batendo com o inventário do `CLAUDE.md` (schema `evo`=59 tabelas, `zapp`=397 relações, `bpm`=41, `email_app`=33, `financeiro`=17, `vendas`=14 — consistente).
2. **Os próprios documentos do plano são internamente inconsistentes nos rótulos I1/I2.** `BOUNDARY_SCORE_T0.json`/`T2.json` chamam I1 = "zapp→evo" e I2 = "evo→zapp". `BOUNDARY_AUDIT_V2.md` usa os rótulos **invertidos** (`I1_fns_evo_citando_zapp`, `I2_fns_zapp_citando_evo`). Este relatório usa a convenção pedida na tarefa: **I1 = evo escreve em zapp, I2 = zapp escreve em evo** — e ignora os rótulos dos documentos-fonte, usando sempre a descrição textual.
3. **`BOUNDARY_SCORE_T2.json` não é uma remedição real.** O script `boundary-audit.mjs` exige `SUPABASE_URL`/`SUPABASE_SERVICE_KEY` (ausentes neste container) e cai em modo `DB_OFFLINE=1`, que **repete os números do T0** para I1/I2/I9 rotulando-os "(baseline T0)". T2 marca I3/I4/I8 como PASS sem republicar nenhum número novo verificável — remete a `.hermes/fase3/dados-reais.json`, arquivo não commitado neste repo e não auditável.
4. **Achado novo desta auditoria, não documentado em nenhum arquivo do plano**: o `sql-gate.mjs` (I8) tem um `PROD_OBJECTS_REGISTRY` hardcoded de 25 objetos. Medi ao vivo quantos desses 25 existem em produção: **apenas 15/25 (60%) existem**. Os 10 ausentes são os 8 objetos de observabilidade `ops.*` (`pgnet_egress_log`, `i4_violation_baseline`, `log_pgnet_call`, `v_i4_violations_summary`, `v_i4_correction_progress`, `decouple_preflight_runs`, `fn_decouple_preflight`, `v_preflight_history`) e 2 views de contrato (`zapp.evolution_chats`, `zapp.evolution_sessions`). O fixture (`sql-gate-fixture.json`) bate 1:1 com o registry hardcoded — ou seja, o teste `--validate-fixture` passa trivialmente porque os dois lados são a mesma lista copiada, **não porque foi validado contra a realidade**. Isso invalida a alegação de PASS de I8 em T2.

---

## 1. Placar dos 9 invariantes — baseline × medido agora (2026-08-16)

| Inv. | Definição | Baseline T0 (plano, 2026-08-15) | **Medido agora por mim** | Evidência (query rodada) | Veredito |
|---|---|---|---|---|---|
| **I1** | Zero funções `evo.*` que **escrevem** (`INSERT/UPDATE/DELETE`) em `zapp.*` | 64 fns + 26 triggers | **26 fns** com DML literal para `zapp.` no corpo (`pg_get_functiondef` + regex) + **19 triggers cross-schema** (2 em tabela `evo` chamando função `zapp`, 17 em tabela `zapp` chamando função `evo`) | `SELECT ... FROM pg_proc p JOIN pg_namespace n ON... WHERE n.nspname='evo' AND src ~* '(insert into\|update\|delete from)\s+zapp\.'` → 26 linhas; `pg_trigger` join cross-schema → 19 linhas | ❌ **FAIL** — reduzido de 64→26, mas não zerado |
| **I2** | Zero funções `zapp.*` que **escrevem** em `evo.*` | 12 fns | **0 fns** com DML literal para `evo.` no corpo | mesma query, `n.nspname='zapp' AND src ~* '(insert into\|update\|delete from)\s+evo\.'` → 0 linhas. Contagem ampla (qualquer referência, não só escrita) = 20 fns ainda citam `evo.` (leitura/monitoria) | ✅ **PASS** por escrita estrita (mas 20 fns ainda leem `evo.*`; regex não pega SQL dinâmico/`EXECUTE format()`) |
| **I3** | Zero FKs cruzando `evo`↔`zapp` | 6 constraints (24 linhas expandidas) | **0** | `SELECT ... FROM pg_constraint WHERE contype='f' AND ns1.nspname IN ('evo','zapp') AND ns2.nspname IN ('evo','zapp') AND ns1<>ns2` → 0 linhas | ✅ **PASS** — confirmado zerado |
| **I4** | Tabelas da Evolution residem no schema da Evolution (`evo`) | NÃO (dado não estava em `evo`) | **NÃO** — `zapp.evolution_messages` (partitioned table), `zapp.evolution_conversations` (partitioned table) e `zapp.evolution_contacts` (table) são **físicas em `zapp`**; `evo` não tem nenhuma tabela com esses nomes | `SELECT n.nspname,c.relname,c.relkind FROM pg_class c JOIN pg_namespace n ... WHERE relname IN (...)` → só aparece `zapp.*` (relkind r/p) + `public.*` (view) | ❌ **FAIL** — topologia é o oposto da Rota A do plano (que pedia mover para `evo`); dado nunca foi movido para lá, permanece em `zapp` |
| **I5** | Views de contrato existem, com grants corretos, dado fluindo | PARCIAL | **PARCIAL** — 10 de 12 views de contrato do catálogo existem (`evolution_messages`, `conversations`, `contacts`, `media`, `whatsapp_status`, `webhook_events_v2`, `instances`, `groups`, `group_participants`, `labels`); **`evolution_chats` e `evolution_sessions` não existem** (nem em `zapp`, nem alias) | Verificação nominal dos 12 objetos do `PROD_OBJECTS_REGISTRY` contra `pg_class` → 2/12 ausentes; `EVO_GRANTS_AUDIT_20260815.md` (não revalidei grants ao vivo) documenta 38 grants `SELECT` de `authenticated` em `evo.*` ainda não revogados | ⚠️ **PARCIAL** |
| **I6** | Cada repo deploya só a própria infra | NÃO | **Majoritariamente SIM no nível de stack Swarm** — `evolution-stack/stacks/` só tem `evolution*.yml`, `obs-*.yml`, `ag6-watchdogs.yml`, `whatsapp-*.yml` (zero `supabase.yml`/zapp); `zapp-web-v3` não tem mais `.github/workflows/e2e-evolution-vps.yml` (removido), resta 1 doc `.DEPRECATED.yml` e 1 script órfão `run-e2e-evolution-vps.sh`. Runtime (Portainer, Swarm real): stacks **separadas** — `zapp-web-prod`(157)/`zapp-ops`(228)/`zapp-functions-health`(265) vs. `evolution`(25)/`evolution-watchdogs`(240)/`evolution-security-guardian`(262)/`evolution-db-purge`(238)/`evolution-pgbackrest-backup`(264)/`evolution-rabbit-consumer`(113). Único stack compartilhado: `supabase`(35) — 1 Postgres para os dois lados, **por desenho** (é exatamente o que os 9 invariantes tentam controlar via schema, não via stack) | `ls evolution-stack/stacks/`; `find zapp-web-v3/.github/workflows -iname "*evolution*"` → vazio; `portainer_list_stacks` (69 stacks ativas, nomes conferidos) | ⚠️ **PARCIAL/SIM** (infra de deploy separada; banco físico continua único — fora do escopo que o plano marca como "avaliar, não executar" em E96) |
| **I7** | Dono único de migrations por schema | NÃO | **NÃO** — `zapp-web-v3/supabase/migrations/` ainda tem **51 arquivos** com `CREATE/ALTER/DROP ... evo.` (de 298 migrations totais); `evolution-stack/db/migrations/` tem **1 único arquivo**, não relacionado à estrutura de `evo` (é sobre `statement_timeout`). E41 (transferir estrutura de `evo` como migration idempotente para o repo dono) **não foi executado** | `grep -lE "^(CREATE\|ALTER\|DROP).*\bevo\." supabase/migrations/*.sql \| wc -l` → 51; `ls evolution-stack/db/migrations/` → 1 arquivo | ❌ **FAIL** |
| **I8** | sql-gate roda contra o banco real (não fixture) | FAIL (fixture 12 vs prod 25) | **FAIL / NÃO VALIDÁVEL COMO ESCRITO** — fixture agora tem 25 entradas idênticas ao `PROD_OBJECTS_REGISTRY` hardcoded no script (sincronizado nesse sentido), **mas 10 dos 25 objetos referenciados não existem em produção** (ver seção 0, item 4). Não consegui rodar `sql-gate.mjs` ao vivo (falta `SUPABASE_URL`/`SUPABASE_SERVICE_KEY` neste ambiente); substituí por query equivalente direta no Postgres | Query nominal dos 25 objetos do registry contra `pg_proc`/`pg_class` → 15 existem, 10 não | ❌ **FAIL** |
| **I9** | Ensaio de troca de provider não toca UI nem PL/pgSQL | NÃO | **PARCIAL** — `ENSAIO_F5_OPERACIONAL_20260815.md` documenta testes reais rodados 100% offline (`DENO_ENV=test`, sem rede): `registry-pilot.test.ts` 5/5 passed, `ensaio-f5-operacional.test.ts` 4/4 passed, 12/12 verbos validados contra provider fake com schema Zod real. Confirmei que `registry.ts` tem `case 'cloud'` implementado (`getCloudClient()`, fail-closed sem credenciais) — **isso está feito**. Mas o próprio `RUNBOOK_TROCA_PROVIDER.md` declara textualmente "a troca real NUNCA foi executada em produção" — sem ensaio cronometrado contra rede real (Evolution ou Meta Cloud API), sem os passos 5-8 do runbook (migração de webhook, congelamento, 5 fns SQL, soak 24h) | Leitura de `ENSAIO_F5_OPERACIONAL_20260815.md` + `grep "case 'cloud'" registry.ts` (confirmado) + `RUNBOOK_TROCA_PROVIDER.md` (declaração textual de não-execução) | ⚠️ **PARCIAL** — abstração pronta e testada em modo fake; troca real nunca ensaiada |

**Placar real medido agora: 1 PASS pleno (I3), 1 PASS estrito com ressalva (I2), 4 PARCIAL (I5, I6, I9, e I2 se considerado amplamente), 3 FAIL (I1, I4, I7, I8).**
Isto é **melhor que o T0 (0/9)**, mas **longe de 9/9**. Nenhum documento do plano (nem T2) reflete corretamente esse estado — T2 superestima I3/I4/I8 como PASS sem números auditáveis, e subestima o progresso real em I2/I3 que consegui confirmar de forma independente.

---

## 2. As 100 etapas — validação individual

Nota geral confirmada por leitura do próprio plano: **nenhuma etapa é marcada como concluída dentro do documento** — é um plano prospectivo, não um tracker. A execução real aconteceu por fora, em "lotes" (`LOTE4_FASE2_LOG.md`, `LOTE5_LOG.md`, `E59_E60_MOVE_LOG.md`, `E62_REPOINT_LOG.md`, `E26-E40-I4-EXECUTION-REPORT.md`) que cobrem sobretudo as fases 3-4 e 6 (funções/triggers/egresso). Para cada etapa: ✅ evidência que rodei ou confirmei por leitura de log de execução real com números antes/depois; ⚠️ parcial/planejado mas não fechado; ❌ confirmadamente não feito; ❓ não verificável nesta sessão (sem tentar adivinhar).

### Fase 0 — Baseline (E1–E12)

| Etapa | Descrição | Status | Evidência resumida |
|---|---|---|---|
| E1 | Congelar snapshot factual em `docs/decouple/baseline/20260815/*.json` | ✅ | Arquivos existem: `cron_jobs.json`, `cross_schema_fks.json`, `evo_zapp_refs.json`, `pg_net_functions.json`, `zapp_evo_refs.json` (confirmei via `find`) |
| E2 | Escrever `scripts/decouple/boundary-audit.mjs` | ✅ | Arquivo existe (25.656 bytes), lido — implementa os 9 invariantes |
| E3 | Rodar contra produção, commitar `BOUNDARY_SCORE_T0.json` | ✅ | Arquivo existe com números reais (82 refs/20 fns, 96 fns, 24/6 FKs) — condiz com medição de produção da época |
| E4 | ADR-012 (Rota A/B) | ✅ | `ADR-012-T0-MEASUREMENT.md` existe |
| E5 | `CREDENTIAL_BOUNDARY.md` | ✅ | Arquivo existe (6.970 bytes) |
| E6 | Validar backup restaurável (PITR em host descartável) | ❓ | Nenhum log de restore encontrado nos documentos lidos |
| E7 | Runbook de pausa do consumer | ⚠️ | `PAUSE_INGEST.md` existe; "testado em homolog" não verificado por mim |
| E8 | Provar folga da fila RabbitMQ | ❓ | Não verificado (exigiria acesso ao RabbitMQ) |
| E9 | Ambiente de ensaio (staging) | ❓ | Não verificado |
| E10 | Baseline de métrica de negócio 7 dias | ❓ | Não verificado |
| E11 | `ROLLBACK_TRIGGERS.md` | ✅ | Arquivo existe (6.615 bytes) |
| E12 | Alerta `log_min_duration_statement` / function does not exist | ❓ | Não verificado |

### Fase 1 — Verdade documental / sql-gate (E13–E24)

| Etapa | Descrição | Status | Evidência resumida |
|---|---|---|---|
| E13 | Corrigir CLAUDE.md (tabelas físicas, Realtime) | ✅ | `CLAUDE.md` atual já reflete `zapp.evolution_messages` como raiz física, Realtime via `zapp` — texto consistente com o banco medido |
| E14 | Corrigir DECOUPLING.md | ❓ | Não lido nesta sessão |
| E15 | Corrigir SCHEMA_REFERENCE/SNAPSHOT com contagens reais | ⚠️ | `CLAUDE.md` cita zapp=323 base tables/380 views; medi ao vivo `zapp`=397 relações totais no `db_list_schemas` — não é o mesmo corte, não dá para confirmar exatidão sem abrir os docs específicos |
| E16 | ADR-013 com inventário atual | ✅ | `ADR-013-PHASE1-PLAN.md` existe |
| E17 | Versionar `ops.fn_evo_url()`/`fn_evo_key()` em migration idempotente | ✅ | Confirmei ao vivo que `ops.fn_evo_url`, `fn_evo_key`, `fn_evo_url_v2`, `fn_evo_key_v2` existem em produção |
| E18 | Fixture do sql-gate 12→25 | ✅ | `sql-gate-fixture.json` tem 25 entradas, idênticas ao `PROD_OBJECTS_REGISTRY` do script |
| E19 | Regra de frescor no gate (falha se fixture > 7 dias) | ❓ | Não verificado no código lido |
| E20 | CI com role `ci_boundary_reader` read-only | ❓ | Não verificado |
| E21 | Eliminar 5 falsos positivos do heurístico do gate | ❓ | Não verificado |
| E22 | Ampliar `inventory.mjs` para 5 edge fns evolution-* | ❓ | Não rodei `inventory.mjs` nesta sessão |
| E23 | Fixar baseline decrescente do inventory | ❓ | Não verificado |
| E24 | Corrigir INSERT morto do consumer.py | ✅ (do lado errado) | Confirmado por `AUDITORIA_INDEPENDENCIA` + `SCORECARD_V4` Adendo: bug real, corrigido no repo `evolution-stack` (commit `cc44a64`), não neste repo — não revalidei o commit eu mesma |

### Fase 2 — Soberania de plataforma (E25–E38)

| Etapa | Descrição | Status | Evidência resumida |
|---|---|---|---|
| E25 | Decidir destino do Supabase (repo terceiro) | ❓ | Não encontrei ADR-014 tratando disso especificamente nesta sessão (só li o título) |
| E26 | Criar repo destino GitOps | ❓ | Não identificado nesta sessão qual é o "repo destino" (log cita "atomica-platform") |
| E27 | Mover `stacks/supabase.yml` | ✅ | Commit `9afc684` em `evolution-stack` (git log) diz "supabase.yml ... movidos para atomica-platform / zapp-web-v3"; confirmei que `evolution-stack/stacks/` **não tem** `supabase.yml` hoje |
| E28 | Mover `stacks/obs-*.yml` | ❌ | `evolution-stack/stacks/` ainda tem `obs-grafana.yml`, `obs-loki.yml`, `obs-prometheus.yml` — não foram movidos nem duplicados por sistema |
| E29 | Mover evolution-functions-health → zapp-functions-health | ✅ | Runtime confirma stack `zapp-functions-health` (id 265) ativa e separada de `evolution-watchdogs`(240) |
| E30 | Mover `zapp_health_guard_script_v2.sh` | ✅ (por commit) | Mesmo commit `9afc684` cita a movimentação; não abri o script para confirmar conteúdo |
| E31 | Remover snapshots stack-157/228 do evolution-stack | ✅ | `grep -ril zapp evolution-stack --include=*.yml` não retorna nenhum stack file ativo com "zapp" (só docs históricos em `docs/infra/`) |
| E32 | Reapontar `gitops-stacks.yml` para só stacks Evolution | ❓ | Não abri o workflow |
| E33 | Workflow GitOps equivalente no repo destino | ❓ | Não verificado |
| E34 | Migrar Docker secrets do Supabase | ❓ | Não verificado |
| E35 | `decouple-guard.yml` com gate inverso | ⚠️ | `decouple-guard.yml` existe e tem checks de bypass (`invoke('evolution-api'`, `EVOLUTION_API_URL`, `.from('evolution_...')`), mas não confirmei um "gate inverso" que falhe se "zapp" aparecer em `evolution-stack/stacks/**` (isso rodaria no outro repo) |
| E36 | Gate espelho no evolution-stack | ❓ | Não verificado |
| E37 | Teste destrutivo controlado (evolution-stack inacessível) | ❓ | Não verificado |
| E38 | Atualizar DECOUPLING.md/README removendo "schemas compartilhados" | ❓ | Não verificado — e tecnicamente ainda é verdade que os schemas são compartilhados (mesmo Postgres), então a frase provavelmente não deveria ter sido removida |

### Fase 3 — Dono único do schema `evo` (E39–E48)

| Etapa | Descrição | Status | Evidência resumida |
|---|---|---|---|
| E39 | Declarar dono formal de `evo` | ❓ | Não encontrei ADR-015 |
| E40 | Inventariar 28 migrations que tocam `evo` | ⚠️ | Medi 51 migrations com DDL `evo.` no repo hoje (não 28 — ou a contagem cresceu, ou o critério do doc era mais estrito) |
| E41 | Transferir estrutura de `evo` para repo dono | ❌ | `evolution-stack/db/migrations/` tem só 1 arquivo, não relacionado a `evo` — **não executado** |
| E42 | Gate no zapp-web-v3: DDL `evo.` falha CI | ❌ | 51 migrations com `evo.` DDL seguem existindo no repo — se o gate existisse e bloqueasse, esse acervo pré-existente ainda passaria, mas não há evidência do gate mesmo assim |
| E43 | Gate no evolution-stack: DDL `zapp.` falha CI | ❓ | Não verificado |
| E44 | Protocolo de mudança coordenada (expand/contract) | ❓ | Não verificado |
| E45 | Schema registry versionado por schema | ⚠️ | `docs/decouple/schema-registry/` só tem `evo.json` — falta o `zapp.json` |
| E46 | Padronizar search_path das funções | ❌ | Medi ao vivo: `evo` tem **11 variantes** de search_path (118 funções), `zapp` tem **44 variantes** (925 funções) — longe de "padrão único" |
| E47 | Remover "zapp" do search_path de funções `evo` | ❌ | Decorre da mesma medição — não há padronização |
| E48 | Remover "evo" do search_path de funções `zapp` | ❌ | Idem |

### Fase 4 — Classificação, contratos e migração de funções/triggers (E49–E66)

| Etapa | Descrição | Status | Evidência resumida |
|---|---|---|---|
| E49 | Classificar 77 funções em monitoria/negócio/morta | ❓ | Não encontrei a planilha citada nesta sessão (universo real hoje é maior: 118 em `evo`) |
| E50 | Arquivar balde "morta" | ⚠️ | `LOTE4_FASE2_LOG.md` cita drop de 4 funções mortas (0 referências) — parcial, não é o balde completo do E49 |
| E51 | Contrato de escrita evo→zapp (RPCs `zapp.rpc_*`) | ✅ | `CONTRACT_WRITE_EVO_TO_ZAPP.md` existe; `LOTE4/5` e `E62_REPOINT_LOG` mostram RPCs `rpc_boundary_*` criadas e em uso real (testadas com smoke) |
| E52 | Contrato inverso zapp→evo | ✅ | `CONTRACT_WRITE_ZAPP_TO_EVO.md` existe |
| E53 | Papéis dedicados `evo_writer`/`zapp_writer` | ❓ | Não verificado — não encontrei esses roles ao consultar `pg_namespace`/schemas nesta sessão (não fiz `pg_roles` explicitamente) |
| E54 | Testes pgTAP provando isolamento de escrita | ❓ | Não verificado |
| E55 | Mover `fn_auto_assign_contact` para zapp | ❓ | Não confirmei nominalmente nesta sessão se essa função específica já está em `zapp` |
| E56 | Mover `fn_log_assignment_change` | ❓ | Idem |
| E57 | Mover `sync_contact_intelligence` | ❓ | Idem — agente de síntese notou que essas 3 "não foram mencionadas nos logs de execução lidos, possivelmente pendentes" |
| E58 | Validar 48h em produção com tráfego real | ❓ | Não verificado |
| E59 | Mover funções em lotes ≤8 (`ALTER FUNCTION SET SCHEMA`) | ✅ | `E59_E60_MOVE_LOG.md`: Lote 1 (8 fns, migration `20260815250008`) e Lote 2 (3 fns, `20260815250009`) executados com smoke test real |
| E60 | Reescrever `cron.job.command` afetados | ✅ | Mesmo log: crons repontados nos lotes 1 e 2, contagem `aux_cron_citando_evo` caindo 89→81→76→70 ao longo dos lotes |
| E61 | Ajustar 14 funções chamadoras por nome qualificado | ⚠️ | Coberto parcialmente pelos swaps de views E78 nos Lotes 4/5; não fechei a lista específica de 14 |
| E62 | Repontar 12 funções zapp→evo para RPCs de contrato | ✅ | `E62_REPOINT_LOG.md`: 8 funções repontadas para `evo.rpc_boundary_*`, com smoke end-to-end real (reconcile 401→200) |
| E63 | Rodar boundary-audit após cada lote, bloquear regressão | ✅ (parcialmente) | Todos os logs de lote citam placar antes/depois — há disciplina de medição, mas não confirmei um gate de CI que *bloqueie* automaticamente |
| E64 | Substituir FK física por chave lógica + job de reconciliação | ❓ | Não encontrei o job de reconciliação rodando nesta sessão |
| E65 | DROP das 6 FKs | ✅ | **Confirmado ao vivo**: 0 FKs cruzando `evo`↔`zapp` hoje (era 6) |
| E66 | Provar que perda do CASCADE não abre buraco de LGPD | ❓ | Não verificado |

### Fase 5 — Referências físicas e troca de schema (E67–E80)

| Etapa | Descrição | Status | Evidência resumida |
|---|---|---|---|
| E67 | Mapear 161 funções citando tabelas Evolution por nome | ❓ | Não verificado |
| E68 | Indireção via `public.<tabela>` | ✅ (parcial, mas em direção diferente) | Views de contrato existem (`public.evolution_messages` etc apontando para `zapp`), mas a "Rota A" original (mover para `evo` e criar views) não é o que aconteceu — os dados nunca saíram de `zapp` |
| E69 | Reescrever as 161 em lotes | ❓ | Não verificado |
| E70 | Repontar 6 cron jobs citando tabelas por nome | ❓ | Não verificado |
| E71 | Gate contra novas referências físicas | ❓ | Não verificado |
| E72 | Pausar consumer e drenar fila | ❓ (não aplicável — ver E73) | — |
| E73 | `ALTER TABLE ... SET SCHEMA evo` para `evolution_messages`/`conversations` | ❌ | **Confirmado ao vivo**: as tabelas continuam em `zapp` (relkind `p`/`r`), **não foram movidas para `evo`** — decisão arquitetural revertida/abandonada, não apenas "não feita" |
| E74 | Views de contrato `public.*` sobre `evo.*` | ⚠️ | Views `public.*` existem, mas apontam para `zapp.*` (não `evo.*`, porque E73 não ocorreu) — contrato existe, mas não na direção que o plano descreveu |
| E75 | Repontar RPCs de mensagem para escrever em `evo.*` | ❌ | Decorre de E73 não ter ocorrido — RPCs continuam escrevendo em `zapp.*` |
| E76 | `evolution_contacts` em janela separada na publication realtime | ❓ | Não verificado |
| E77 | Retomar consumer, validar ingestão real | ❓ | Não verificado |
| E78 | Catálogo de views de contrato v1 versionado | ✅ | `CONTRACT_SURFACE_V1.md` existe |
| E79 | Manter `evo` fora do `PGRST_DB_SCHEMAS` | ✅ | Consistente com `CLAUDE.md`: PostgREST expõe `zapp`, não `evo` (`evo.evolution_messages_v2` é só view interna, sem acesso PostgREST direto) — não abri a config do Kong/PostgREST para confirmar a env var literal |
| E80 | Revogar SELECT de `authenticated` nas 38 relations `evo` | ❌ | `EVO_GRANTS_AUDIT_20260815.md` documenta os 38 grants e um plano de REVOKE **explicitamente marcado "NÃO EXECUTADO — aguarda PR/migration versionada"** — não revalidei os grants ao vivo, mas não há evidência de que tenham sido revogados |

### Fase 6 — Egresso e ingestão (E81–E90)

| Etapa | Descrição | Status | Evidência resumida |
|---|---|---|---|
| E81 | Levar 5 `invoke('evolution-*')` para o whatsappAdapter | ❓ | Não verificado nesta sessão |
| E82 | Remover `evolution-proxy` (ADR-011 DEPRECATED) | ❌ | **Confirmado**: `supabase/functions/evolution-proxy/` ainda existe no repo — não foi arquivada |
| E83 | Implementar `case 'cloud'` no registry.ts | ✅ | **Confirmado por leitura direta do código**: `registry.ts` tem `case 'cloud'` completo, com `getCloudClient()` e fail-closed sem credenciais Meta |
| E84 | Unificar porta P4 (crons pg_net fora do gateway) | ⚠️ | `BOUNDARY_AUDIT_V2.md` cita `ops.fn_notify_critical_alerts` como o último caso (14→1); não confirmei se esse 1 restante foi fechado |
| E85 | Contrato `ops.fn_provider_call(verbo, payload)` | ✅ | Citado em uso real no smoke do `E62_REPOINT_LOG.md` (reconcile via `fn_provider_call`, HTTP 200) |
| E86 | Instrumentar porta P4 com métricas | ❓ | Não verificado — aliás, os objetos `ops.pgnet_egress_log` etc que dariam essa métrica **não existem** (achado da seção 0.4) |
| E87 | Envelope versionado `evolution-webhook@v1` | ❓ | Não verificado |
| E88 | Rotacionar segredo HMAC do webhook | ❓ | Não verificado nesta sessão (mecanismo de rotação existe por precedente, execução específica não confirmada) |
| E89 | Remover conexão Postgres direta do consumer | ❓ | Não verificado (consumer é do repo `evolution-stack`) |
| E90 | Testes de caos (ZAPP sem Evolution / vice-versa) | ❓ | Não verificado |

### Fase 7 — Prova de substituibilidade (E91–E95)

| Etapa | Descrição | Status | Evidência resumida |
|---|---|---|---|
| E91 | Ensaio cronometrado fake↔evolution | ✅ | `ENSAIO_F5_OPERACIONAL_20260815.md`: 12/12 verbos testados, tempos medidos (ex.: 0.1984ms→0.0878ms), mas 100% offline/sem rede real |
| E92 | Ensaio de troca real em staging (evolution→cloud) | ❌ | `RUNBOOK_TROCA_PROVIDER.md`: "a troca real NUNCA foi executada em produção" — declaração textual explícita do próprio documento |
| E93 | Medir arquivos mudados por camada (meta 0 em UI/PL-pgSQL) | ❓ | Não medido nesta sessão nem, aparentemente, em nenhum documento (não há dados de um ensaio real de troca) |
| E94 | Ensaio de rollback (voltar para evolution) | ❌ | Não há ensaio real, logo não há rollback medido |
| E95 | Atualizar RUNBOOK/SUBSTITUABILITY_MATRIX com tempos medidos | ⚠️ | Documentos existem, mas o próprio runbook admite que os tempos são "estimativas de planejamento, não evidência" |

### Fase 8 — Corte físico opcional e governança (E96–E100)

| Etapa | Descrição | Status | Evidência resumida |
|---|---|---|---|
| E96 | Avaliar (não executar) corte físico de `evo` | ❓ | Não encontrei ADR-017 nesta sessão |
| E97 | boundary-audit bloqueante no CI dos dois repos | ❓ | Não verificado — `decouple-guard.yml` existe mas cobre outra coisa (inventory de bypass, não o placar de 9 invariantes) |
| E98 | Ratchet (placar só melhora) | ❓ | `score-ratchet.mjs` existe no repo (visto no `ls scripts/decouple/`), não testei sua execução |
| E99 | Rotina trimestral de reconciliação doc×banco | ❓ | Não verificado |
| E100 | Retrospectiva final com `BOUNDARY_SCORE_T1.json` | ❌ | Não existe `BOUNDARY_SCORE_T1.json` no repo (só T0 e T2 — confirmado no `ls` inicial de `docs/decouple/`) |

---

## 3. Lado `evolution-stack`

- Repo existe, `git status` limpo, `main` sincronizada com `origin` (HEAD `9afc684`).
- `stacks/` contém **somente** infra Evolution: `evolution.yml`, `evolution-watchdogs.yml`, `evolution-rabbit-consumer.yml`, `evolution-security-guardian.yml`, `evolution-db-purge.yml`, `evolution-pgbackrest-backup.yml`, `whatsapp-observer.yml`, `whatsapp-watchdog.yml`, `ag6-watchdogs.yml`, `obs-grafana.yml`, `obs-loki.yml`, `obs-prometheus.yml` — **zero** `supabase.yml` ou stack nomeada zapp.
- `db/migrations/` tem **1 arquivo apenas** (`20260808280000_role_guardrails_statement_timeout.sql`) — a estrutura do schema `evo` **não foi transferida** para este repo (E41 não executado), então "dono único de migrations" (I7) segue falso também deste lado.
- Grep textual por "zapp" no repo retorna só documentação (`README.md`, `CLAUDE.md`, `docs/BOUNDARY-zapp.md`, changelogs, runbooks) — nenhum artefato de deploy ativo referenciando zapp diretamente.
- **Conclusão**: separação de infraestrutura de deploy está praticamente completa deste lado; separação de *ownership de schema* (migrations do `evo`) não está.

## 4. Runtime (Portainer/Swarm) — item 5 da missão

Consegui acesso ao Portainer MCP (69 stacks Swarm ativas). Confirmo:
- Stacks Evolution rodando separadas: `evolution`(25), `evolution-watchdogs`(240), `evolution-security-guardian`(262), `evolution-db-purge`(238), `evolution-pgbackrest-backup`(264), `evolution-rabbit-consumer`(113) — todas `status: active`.
- Stacks ZAPP rodando separadas: `zapp-web-prod`(157), `zapp-ops`(228), `zapp-functions-health`(265) — todas `status: active`.
- **Um único stack `supabase`(35)** hospeda o Postgres compartilhado pelos dois lados — isso é esperado e por desenho (é justamente o objeto de todo esse plano de separação lógica via schema), não uma falha de per se.
- Não abri os containers individualmente para checar variáveis de ambiente/labels de webhook (ex.: para onde o `evolution-rabbit-consumer` aponta) — ficaria como ❓ não verificado em detalhe, mas a separação de stack já é evidência direta de runtime segregado no nível de orquestração.

---

## 5. Placar geral da tabela de 100 etapas

Contagem da seção 2 (contagem literal dos símbolos usados):

| Símbolo | Significado | Contagem |
|---|---|---|
| ✅ | Validada com evidência que rodei/confirmei agora | **24** |
| ⚠️ | Parcial — algo feito, mas incompleto ou direção diferente do plano | **13** |
| ❌ | Confirmadamente não feita (ou revertida/divergente) | **17** |
| ❓ | Não verificável nesta sessão (sem tentar adivinhar) | **46** |

(24+13+17+46 = 100)

O número alto de ❓ é honesto, não é atalho: a maioria das 100 etapas descreve artefatos de código específicos (RLS, roles, testes pgTAP, workflows de CI em detalhe, jobs de reconciliação) que exigiriam ler dezenas de arquivos adicionais linha a linha para confirmar ou refutar — não tentei adivinhar a partir de nomes de arquivo.

---

## 6. Veredito final

# **PARCIAL — o plano NÃO foi executado até o fim.**

Argumentos:

1. **Progresso real e verificável existe**, mais do que os documentos T0 sugeririam sozinhos: I3 (FKs cruzadas) foi genuinamente zerado (6→0, confirmado ao vivo); I2 em sentido estrito de escrita também chegou a zero; várias dezenas de funções de monitoria foram fisicamente movidas com testes de smoke reais em produção (Lotes 1-5, E62); a separação de infraestrutura de deploy (stacks Swarm, arquivos de stack) está quase completa.
2. **Mas nenhum invariante crítico de arquitetura está fechado**: I1 (evo ainda escreve em zapp) tem 26 funções + 19 triggers residuais; I4 nunca aconteceu — os dados da Evolution **continuam fisicamente em `zapp`**, o oposto da Rota A que o próprio plano escolheu (E73-E77 não executadas, é a mudança mais estrutural do plano inteiro); I7 (dono único de migrations) está claramente falso nos dois repos; I8 (sql-gate contra realidade) tem uma falha inédita não documentada — 40% dos objetos que o gate valida **não existem em produção**, o que quer dizer que o gate, se rodado agora, provavelmente quebra ou mente.
3. **A troca de provider (I9/E91-E95), que é a prova final de que a abstração funciona**, tem apenas ensaio 100% simulado (sem rede real) — o próprio `RUNBOOK_TROCA_PROVIDER.md` admite que a troca real nunca foi tentada.
4. **A documentação de placar do próprio time (T2, SCORECARD_V4) não é confiável como evidência** — promove I3/I4/I8 a PASS sem números novos auditáveis, contradizendo o que medi ao vivo (I4 = FAIL claro; I8 = FAIL mais grave do que o T0 registrado, por causa dos objetos fantasma).

**Se a pergunta é "dá para dizer que o desacoplamento evo×zapp está pronto e o time pode declarar vitória": não.** Há trabalho real e válido feito (aprox. 1/3 das etapas com evidência positiva), mas as duas mudanças mais importantes do plano — mover fisicamente a Evolution para seu próprio schema (E73) e provar a troca de provider em produção real (E92) — não aconteceram, e o gate que deveria impedir regressão (I8) está ele mesmo quebrado.
