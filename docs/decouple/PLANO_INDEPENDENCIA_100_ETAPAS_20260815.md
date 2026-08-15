# Plano de Independência ZAPP-WEB × Evolution API — 100 etapas

**Data:** 2026-08-15
**Alvo:** dois sistemas individuais, independentes e autônomos, ligados **apenas por contrato**
(HTTP de egresso, HTTP de ingestão, views de leitura). Separação em **três planos**:
repositório, runtime/container, e dado.

**Base factual:** medições diretas no Postgres de produção e nos dois repositórios, registradas
em [`AUDITORIA_INDEPENDENCIA_20260815.md`](./AUDITORIA_INDEPENDENCIA_20260815.md) e
[`ANALISE_FRONTEIRA_EVO_ZAPP_20260815.md`](./ANALISE_FRONTEIRA_EVO_ZAPP_20260815.md).

---

## 0. O que este plano assume como "pronto"

Uma etapa só é **pronta** quando existe **evidência executável** — uma query, um comando ou um
gate de CI que falha se a etapa regredir. Documento atualizado não é evidência. Código existir
não é evidência. Vale a regra do `ESTADO.md`: *pronto = ligado em produção com tráfego real*.

### Definição formal do alvo (contrato de aceitação)

| Invariante | Como se verifica | Estado hoje |
|---|---|---|
| **I1** — Nenhuma função do schema `evo` escreve em `zapp` | `pg_proc` + `pg_trigger` = 0 | ❌ 64 fns, 26 triggers |
| **I2** — Nenhuma função do schema `zapp` escreve em `evo` | `pg_proc` = 0 | ❌ 12 fns |
| **I3** — Nenhuma FK cruza a fronteira | `pg_constraint` = 0 | ❌ 6 FKs |
| **I4** — O dado da Evolution reside no schema da Evolution | `pg_class.relnamespace` | ❌ está em `zapp` |
| **I5** — O app lê o outro lado só por view de contrato | `pg_views` + grants | ⚠️ existe, sem dado de negócio |
| **I6** — Cada repo deploya só a sua infra | inventário de stacks | ❌ `supabase.yml` no repo errado |
| **I7** — Cada schema tem um dono único de migration | inventário de migrations | ❌ dois donos em `evo` |
| **I8** — Todo egresso HTTP passa por gateway declarado | `inventory.mjs` + `sql-gate` contra o **banco** | ⚠️ gate lê fixture |
| **I9** — Trocar de provider não toca UI nem PL/pgSQL | ensaio cronometrado | ❌ toca os dois |

---

## 1. A assimetria que define todo o custo do plano

Este é o fato técnico central, e ele **inverte a intuição** sobre o que é caro:

| Tipo de dependência | Liga por | Sobrevive a `SET SCHEMA`? |
|---|---|:--:|
| View, FK, trigger, RLS policy, índice, publication | **OID** | ✅ sim, automaticamente |
| Corpo de função PL/pgSQL (`zapp.tabela` no texto) | **nome, em runtime** | ❌ **quebra** |
| `cron.job.command` | **nome, em texto** | ❌ **quebra** |
| PostgREST (exposição) | **nome do schema** | ❌ some da API |

Consequências que mudam o plano:

1. **`ALTER TABLE … SET SCHEMA` é operação de catálogo O(1).** Não move os 340 MB de
   `evolution_messages_wpp2` — só reescreve `pg_class.relnamespace`. Custo: um
   `AccessExclusiveLock` de milissegundos. **O dado não é o problema.**
2. **As 75 views e 68 FKs que apontam para essas tabelas não quebram** — elas seguem o OID.
3. **O problema real são as 161 funções** que citam `zapp.evolution_(messages|contacts|conversations)`
   por nome, e os 6 cron jobs que fazem o mesmo.
4. Todas as **77 funções da fronteira têm `search_path` fixo** (11 variantes distintas,
   incluindo `search_path=evo, zapp`). Mover a função de schema **não** muda como ela resolve
   nomes — a dependência é o `search_path`, não a residência.

### Risco de Realtime: menor do que a documentação sugere

Medido em `pg_publication_tables`:

| Tabela | Está em `supabase_realtime`? |
|---|:--:|
| `zapp.evolution_messages` (e partições) | **NÃO** |
| `zapp.evolution_conversations` | **NÃO** |
| `zapp.evolution_contacts` (21.878 linhas, `relkind='r'`) | **SIM** |
| `zapp.evolution_realtime_events`, `evolution_alerts` | SIM |

Ou seja: mover `evolution_messages`/`conversations` **não afeta o Realtime**. Só
`evolution_contacts` exige janela e replanejamento de canal. `pubviaroot=true` confirmado.

---

## 2. Ponto de decisão obrigatório (antes da etapa 6)

Duas rotas chegam a uma fronteira limpa. Os custos foram **medidos**, não estimados:

| | **Rota A** — `evo` é dono do dado (o modelo pedido) | **Rota B** — `zapp` é dono, `evo` vira observabilidade |
|---|---|---|
| Move | 3 tabelas + 14 partições para `evo` | 77 funções para `zapp` |
| Funções a reescrever | **161** (referência por nome) | **14** (chamadoras) |
| Cron a reescrever | 6 | **43** |
| Triggers | seguem por OID (0 trabalho) | 16 seguem por OID (0 trabalho) |
| Views | 75 seguem por OID | 0 |
| Risco de Realtime | médio (`evolution_contacts`) | nenhum |
| Permite mover `evo` para outro banco no futuro | **sim** | não |
| Esforço relativo | **alto** | médio |

**Este plano é escrito para a Rota A**, porque é a arquitetura pedida e é a única que preserva
a opção de um dia separar fisicamente os bancos. As etapas onde a Rota B diverge estão
marcadas com `[B: …]`.

---

## FASE 0 — Baseline, instrumentação e reversibilidade (E1–E12)

Nada é alterado nesta fase. Sem ela, não há como provar progresso nem reverter.

| # | Etapa | Evidência de pronto |
|:--:|---|---|
| **E1** | Congelar o snapshot factual: exportar `pg_proc`, `pg_trigger`, `pg_constraint`, `pg_views`, `pg_policies`, `cron.job`, grants de `evo`/`zapp` para `docs/decouple/baseline/20260815/*.json` | Arquivos commitados, com a query geradora ao lado |
| **E2** | Escrever `scripts/decouple/boundary-audit.mjs` — script único que mede os 9 invariantes I1–I9 e imprime um placar | `node boundary-audit.mjs` roda e imprime 9 linhas |
| **E3** | Rodar E2 contra produção e commitar o placar inicial como `BOUNDARY_SCORE_T0.json` | Placar com os números de hoje (64/12/6/…) |
| **E4** | Criar o **decision record** ADR-012 registrando a Rota escolhida (A ou B), com a tabela de custos medidos | ADR commitado e aprovado pelo dono |
| **E5** | Inventariar **todas** as credenciais que cruzam a fronteira (vault, Docker secrets, `.env` de edge) e mapear qual sistema é dono de cada uma | `docs/decouple/CREDENTIAL_BOUNDARY.md` com N linhas |
| **E6** | Validar backup restaurável **antes** de qualquer DDL: restore do PITR num host descartável e `boundary-audit` rodando lá | Log do restore + placar idêntico ao T0 |
| **E7** | Definir e documentar a **janela de manutenção** e o procedimento de pausa do consumer (RabbitMQ `basic.qos=0` / scale 0) sem perda de mensagem | Runbook `runbooks/PAUSE_INGEST.md` testado em homolog |
| **E8** | Provar que a fila do RabbitMQ segura o tráfego da janela: medir taxa de eventos (926 msgs/24h ≈ 0,64/min) × TTL/lastro da fila | Cálculo documentado com folga ≥ 20× |
| **E9** | Criar ambiente de ensaio (`staging`) com dump estrutural + amostra de dados dos schemas `evo`/`zapp` | `boundary-audit` roda em staging |
| **E10** | Estabelecer a métrica de negócio de referência (mensagens/hora, latência ingest→visível, taxa de DLQ) e um dashboard com 7 dias de baseline | Painel com linha de base congelada |
| **E11** | Definir gatilhos de rollback quantitativos (ex.: latência ingest > 2× baseline por 5 min; DLQ > 0,5%; qualquer erro `function does not exist`) | Documento `ROLLBACK_TRIGGERS.md` |
| **E12** | Habilitar `log_min_duration_statement` e captura de `function does not exist` como alerta de primeira classe | Alerta dispara em teste sintético |

---

## FASE 1 — Verdade documental e gates que medem a realidade (E13–E24)

A auditoria mostrou gates que passam contra fixtures obsoletos e um `CLAUDE.md` que descreve
uma topologia extinta. **Corrigir isso primeiro**, porque é o que orienta todas as decisões
seguintes — inclusive as de agentes automatizados.

| # | Etapa | Evidência de pronto |
|:--:|---|---|
| **E13** | Corrigir o `CLAUDE.md`: `zapp.evolution_messages`/`conversations` são as tabelas base; `evo.evolution_messages` não existe; Realtime não cobre mensagens | Diff aprovado; `boundary-audit --docs` valida as afirmações contra o banco |
| **E14** | Corrigir `DECOUPLING.md`: qualificar "12 verbos, 0 bypasses" como **escopo edge functions**, e declarar a porta P4 (SQL) explicitamente no mesmo parágrafo | Texto revisado |
| **E15** | Corrigir `docs/SCHEMA_REFERENCE.md` e `SCHEMA_SNAPSHOT.md` com as contagens reais (`zapp` 397 tabelas / `evo` 58) | Números batem com `pg_class` |
| **E16** | Marcar `ADR-DB-002` como **superado** e emitir ADR-013 com o inventário atual (77 fns, 26 triggers) e a decisão de execução — o "DDL pendente" de 06/08 tem 9 dias e cresceu de 20 → 64 | ADR-013 commitado |
| **E17** | **Versionar `ops.fn_evo_url()` e `ops.fn_evo_key()`** em migration idempotente (hoje só existem no banco) | `grep CREATE.*fn_evo_url supabase/migrations/` retorna 1 |
| **E18** | Regenerar o fixture do `sql-gate` a partir do banco real (12 → 25 entradas) e commitar com o timestamp da extração | `sql-gate` roda e o fixture tem 25 entradas |
| **E19** | Adicionar ao `sql-gate` a **regra de frescor**: falha se o fixture tiver > 7 dias | Teste unitário do gate cobre o caso |
| **E20** | Dar ao CI acesso **read-only** ao banco (role `ci_boundary_reader`, `SELECT` só em catálogos) e rodar `sql-gate`/`boundary-audit` contra a realidade, não contra fixture | Job de CI verde lendo o banco |
| **E21** | Refinar o heurístico do `sql-gate` para não acusar falso positivo: hoje 5 fns são flagradas por citar "evolution" em nome de tabela enquanto fazem HTTP para Supabase/n8n | As 5 saem da lista sem entrar em whitelist nominal |
| **E22** | Ampliar `inventory.mjs`: hoje conta só `invoke('evolution-api')`. Passar a contar as **5 outras** edge fns `evolution-*` invocadas do React | `TOTAL` sobe de 0 para 5 — e isso é correto |
| **E23** | Fixar o novo baseline do `inventory.mjs` com meta decrescente (ratchet), não com `TOTAL=0` mascarado | Baseline commitado = 5, meta 0 |
| **E24** | Corrigir o `INSERT INTO public.evolution_webhook_events` do `consumer.py` — a relação não existe, a telemetria é perdida silenciosamente | Ou a tabela passa a existir em `evo`, ou o insert é removido |

---

## FASE 2 — Soberania de plataforma (E25–E38)

Hoje o `evolution-stack` deploya a **plataforma do ZAPP**: `stacks/supabase.yml` (Postgres,
Kong, GoTrue, PostgREST, Realtime, Edge Runtime), `evolution-functions-health`,
`zapp_health_guard` e snapshots das stacks 157/228. **O ZAPP não sobe sem o repo do provider** —
esta é a dependência mais grave do sistema inteiro.

| # | Etapa | Evidência de pronto |
|:--:|---|---|
| **E25** | Decidir o destino do Supabase: repo `zapp-web-v3` ou um terceiro repo `atomica-platform`. Recomendação: **terceiro repo** — o Supabase serve `zapp`, `bpm`, `email_app`, `financeiro`, `vendas`, `logistica`, não só o ZAPP | ADR-014 |
| **E26** | Criar o repo destino com estrutura GitOps equivalente (stacks, secrets docs, workflows) | Repo criado, README com fronteira |
| **E27** | Mover `stacks/supabase.yml` preservando o changelog do cabeçalho (20+ entradas de decisões operacionais) | Arquivo no destino, histórico legível |
| **E28** | Mover `stacks/obs-*.yml` (Grafana/Loki/Prometheus) se observarem os dois sistemas; senão, duplicar por sistema | Inventário de dashboards por origem |
| **E29** | Mover `evolution-functions-health` → `zapp-functions-health` para o repo do ZAPP (ele mede edge functions do ZAPP) | Stack renomeada e redeployada |
| **E30** | Mover `infra/watchdogs/zapp_health_guard_script_v2.sh` para o repo do ZAPP | Script no destino, cron apontando |
| **E31** | Remover do `evolution-stack` os snapshots `stack-157-zapp-web-prod.yml` e `stack-228-zapp-ops.yml` | `grep -ril zapp evolution-stack/stacks docs/infra` = 0 relevantes |
| **E32** | Reapontar o `gitops-stacks.yml` do `evolution-stack` para deployar **só** stacks Evolution | Lista de stacks do workflow = só evolution* |
| **E33** | Criar no repo destino o workflow GitOps equivalente para as stacks movidas | Deploy de teste bem-sucedido |
| **E34** | Migrar a propriedade dos **Docker secrets** do Supabase (`supabase_*`, `postgrest_conf_*`, `logflare_*`) para o novo dono, documentando rotação | `CREDENTIAL_BOUNDARY.md` atualizado |
| **E35** | Estender o `decouple-guard.yml` com o gate inverso: falha se aparecer `zapp` em `evolution-stack/stacks/**` | Guard testado com PR sintético |
| **E36** | Criar o gate espelho no `evolution-stack`: falha se aparecer `supabase.yml` ou artefato do ZAPP | Guard ativo nos dois repos |
| **E37** | Provar a soberania com um **teste destrutivo controlado**: em staging, tornar o `evolution-stack` inacessível e subir o ZAPP do zero | Log do bootstrap sem o repo do provider |
| **E38** | Atualizar `DECOUPLING.md` e o README do `evolution-stack` retirando a frase *"mesmos schemas `evo`+`zapp` no Postgres compartilhado"* quando deixar de ser verdade | Texto reflete o estado |

---

## FASE 3 — Dono único do schema `evo` (E39–E48)

Hoje **28 migrations deste repo** criam objetos em `evo`, e o `evolution-stack` tem
`db/migrations/` para o mesmo schema. Dois donos, sem lock distribuído.

| # | Etapa | Evidência de pronto |
|:--:|---|---|
| **E39** | Declarar formalmente o dono de `evo` (recomendação: `evolution-stack`, coerente com a Rota A) | ADR-015 |
| **E40** | Inventariar as 28 migrations deste repo que tocam `evo` e classificar: DDL de estrutura (vai para o dono) × DDL de contrato (vira view) | Planilha `EVO_MIGRATION_SPLIT.md` |
| **E41** | Transferir a **estrutura** de `evo` para o repo dono, como migration idempotente de "estado atual" (não replay histórico) | Migration aplica em banco vazio e converge |
| **E42** | Criar gate no `zapp-web-v3`: qualquer migration que contenha `evo.` em DDL falha o CI | Guard testado |
| **E43** | Criar gate no `evolution-stack`: qualquer migration com `zapp.` em DDL falha o CI | Guard testado |
| **E44** | Definir o protocolo de mudança coordenada (expand/contract em dois PRs, um por repo, com issue-link obrigatório) | `CONTRIBUTING.md` dos dois repos |
| **E45** | Criar o **schema registry** versionado: um JSON por schema com tabelas, colunas e owner, validado no CI dos dois lados | `schema-registry/evo.json` + gate |
| **E46** | Alinhar o `search_path` das 77 funções para um padrão único e explícito (hoje 11 variantes, incluindo `search_path=evo, zapp`) | Query de conformidade = 0 desvios |
| **E47** | Remover `zapp` do `search_path` de toda função residente em `evo` | 0 funções `evo` com `zapp` no path |
| **E48** | Remover `evo` do `search_path` de toda função residente em `zapp` | 0 funções `zapp` com `evo` no path |

---

## FASE 4 — Fronteira de escrita no banco (E49–E66)

O núcleo do trabalho. **77 funções** no escopo (64 que escrevem em `zapp` + 16 usadas como
trigger em tabelas `zapp`; 65 são `SECURITY DEFINER`), **26 triggers ativos** e **12 funções
`zapp` que escrevem em `evo`**.

### 4.1 — Classificação e contratos (E49–E54)

| # | Etapa | Evidência de pronto |
|:--:|---|---|
| **E49** | Classificar as 77 funções em três baldes: **(a) monitoria** (pode virar leitura + RPC de alerta), **(b) negócio** (tem de mudar de lado), **(c) morta** (sem cron, sem trigger, sem chamador) | Planilha com 77 linhas classificadas |
| **E50** | Arquivar o balde (c) — precedente: `ESTADO.md` já arquivou 3 edge functions assim | `DROP FUNCTION` em migration + registro |
| **E51** | Desenhar o **contrato de escrita** `evo → zapp`: um conjunto mínimo de RPCs `zapp.rpc_*` `SECURITY DEFINER` com `GRANT EXECUTE` só para o papel do lado evo | `docs/decouple/CONTRACT_WRITE_EVO_TO_ZAPP.md` |
| **E52** | Desenhar o contrato inverso `zapp → evo` para as 12 funções (majoritariamente purga e reprocesso de webhook) | Documento + lista de RPCs |
| **E53** | Criar papel de banco dedicado por lado (`evo_writer`, `zapp_writer`) em vez de usar `service_role` para tudo — hoje `service_role` tem CRUD em 92 relations de `evo` | Papéis criados, grants mínimos |
| **E54** | Escrever testes pgTAP (ou equivalente) que **provam** a negativa: `evo_writer` não consegue `INSERT` em `zapp.*` fora das RPCs | Teste vermelho antes, verde depois |

### 4.2 — As 3 funções de negócio (E55–E58)

Já apontadas como "NEGÓCIO — corrigir" no ADR-DB-002 de 06/08 e ainda ativas.

| # | Etapa | Evidência de pronto |
|:--:|---|---|
| **E55** | `evo.fn_auto_assign_contact` (distribui lead, trigger em `zapp.evolution_contacts`) → mover para `zapp` | Trigger aponta para `zapp.*`; teste de atribuição verde |
| **E56** | `evo.fn_log_assignment_change` (escreve `zapp.conversation_events`) → mover para `zapp` | Idem |
| **E57** | `evo.sync_contact_intelligence` (mexe em `zapp.contact_intelligence`) → mover para `zapp`, mantendo a chamada ao RPC de contrato que já usa corretamente | Idem |
| **E58** | Validar em produção com tráfego real por 48h: leads continuam sendo atribuídos, eventos gravados, intelligence sincronizada | Métrica de negócio estável vs. baseline E10 |

### 4.3 — Migração das demais funções e triggers (E59–E63)

| # | Etapa | Evidência de pronto |
|:--:|---|---|
| **E59** | Mover em lotes de ≤ 8 funções (`ALTER FUNCTION … SET SCHEMA`), reescrevendo o `search_path` no mesmo statement. **Triggers seguem por OID — não precisam ser recriados** | Lote aplicado, `pg_trigger` intacto |
| **E60** | Reescrever os `cron.job.command` afetados. **Atenção: 43 jobs referenciam essas funções por nome** — cron **não** segue OID | `SELECT count(*) FROM cron.job WHERE command ~ 'evo\.<fn>'` = 0 para as movidas |
| **E61** | Ajustar as 14 funções chamadoras que citam as movidas por nome qualificado | `boundary-audit` sem `function does not exist` |
| **E62** | Repontar as 12 funções `zapp` que escrevem em `evo` para as RPCs de contrato de E52 | I2 = 0 |
| **E63** | Rodar `boundary-audit` após cada lote e bloquear o próximo lote se o placar piorar em qualquer invariante | Histórico de placares monotônico |

### 4.4 — As 6 FKs cruzadas (E64–E66)

`evo.media_download_queue` e `evo.media_loss_registry` → `zapp.evolution_messages` (+ partições).
Enquanto existirem, os schemas **não podem** viver em bancos diferentes.

| # | Etapa | Evidência de pronto |
|:--:|---|---|
| **E64** | Substituir a FK física por chave lógica (`message_id` + `instance_name`) com job de reconciliação que detecta órfão | Job rodando, contador de órfãos = 0 |
| **E65** | `DROP CONSTRAINT` das 6 FKs em migration com ROLLBACK documentado | I3 = 0 |
| **E66** | Provar que a perda do CASCADE não abre buraco de LGPD: o `DELETE` de contato precisa continuar limpando mídia | Teste de erasure ponta a ponta |

> `[B: E64–E66 continuam valendo]` — as FKs cruzam a fronteira em qualquer rota.

---

## FASE 5 — Reposicionar o dado e a leitura (E67–E80)

Aqui a Rota A e a Rota B divergem de verdade.

### 5.1 — Preparação (E67–E71)

| # | Etapa | Evidência de pronto |
|:--:|---|---|
| **E67** | Mapear as **161 funções** que citam `zapp.evolution_(messages\|contacts\|conversations)` por nome — é o custo real da mudança | Lista commitada |
| **E68** | Introduzir uma camada de indireção **antes** de mover: todas as 161 passam a acessar via `public.<tabela>` (view), não pelo nome físico | 161 → 0 referências físicas |
| **E69** | Reescrever as 161 em lotes, com teste de contrato por lote | `boundary-audit --phys-refs` = 0 |
| **E70** | Repontar os 6 cron jobs que citam as tabelas por nome | Query = 0 |
| **E71** | Congelar a criação de novas referências físicas com gate de CI (migration que cite `zapp.evolution_messages` direto falha) | Guard testado |

### 5.2 — A troca de schema (E72–E77) `[Rota A]`

| # | Etapa | Evidência de pronto |
|:--:|---|---|
| **E72** | Pausar o consumer (runbook E7) e drenar a fila | Fila em 0, lag confirmado |
| **E73** | `ALTER TABLE zapp.evolution_messages SET SCHEMA evo` (+ `conversations`). **Operação de catálogo: não move os 340 MB**; as 14 partições acompanham a raiz | `pg_class.relnamespace` = `evo` |
| **E74** | Criar as views de contrato `public.evolution_messages` / `evolution_conversations` sobre `evo.*`, com `security_invoker=on` | App lê sem alteração de código |
| **E75** | Repontar `rpc_insert_message`, `rpc_upsert_contact`, `rpc_update_incoming_message`, `rpc_claim_outbound_message` e `fn_process_whatsapp_message` para escrever em `evo.*` | I4 satisfeito para mensagens |
| **E76** | `evolution_contacts` **em janela separada** — é a única das três presente na publication `supabase_realtime` (21.878 linhas). Recriar a assinatura de Realtime e validar o canal do front antes de liberar | Evento de teste chega ao browser |
| **E77** | Retomar o consumer e validar ingestão ponta a ponta com mensagem real | Latência ingest→visível ≤ baseline E10 |

> `[B: E72–E77 são substituídas por]` — manter as tabelas em `zapp`, renomear `evo` para
> `ops_evolution`, e declarar formalmente que o schema do provider é só observabilidade.
> Custo: 43 cron jobs e 14 chamadoras (já cobertos em E59–E61). Sem janela, sem risco de Realtime.

### 5.3 — Canal de leitura (E78–E80)

| # | Etapa | Evidência de pronto |
|:--:|---|---|
| **E78** | Publicar o **catálogo de views de contrato** `evo → public` que o app pode ler, com versionamento (`v1`) e política de depreciação | `docs/decouple/READ_CONTRACT_v1.md` |
| **E79** | Manter `evo` **fora** do `PGRST_DB_SCHEMAS` (hoje: `public,zapp,storage,graphql_public,artes,vendas,financeiro,logistica`) — o app lê por `public.*`, nunca direto | Config revisada e gate de CI |
| **E80** | Revogar o `SELECT` de `authenticated` nas 38 relations `evo` que hoje ele enxerga, deixando só as views de contrato | Grants medidos = só o contrato |

---

## FASE 6 — Egresso e ingestão sob contrato único (E81–E90)

| # | Etapa | Evidência de pronto |
|:--:|---|---|
| **E81** | Levar as 5 `invoke('evolution-*')` do React para dentro do `whatsappAdapter` (`evolution-sync`, `-webhook`, `-templates`, `-credentials`, `-proxy`) | `inventory.mjs` volta a 0 com a métrica ampliada de E22 |
| **E82** | Remover `evolution-proxy` (DEPRECATED por ADR-011) migrando a `ZappWebbDemoPage` para `evolution-api` | Edge fn arquivada, registro no `ESTADO.md` |
| **E83** | Implementar `case 'cloud'` no `registry.ts` — hoje lança `Cloud provider client not yet implemented` | Teste de contrato do provider cloud verde |
| **E84** | Unificar a **porta P4**: `zapp.fn_outbound_dispatch` (cron a cada 2 min) e `fn_reconcile_dispatch` (5 min) hoje falam com a Evolution por `pg_net`, fora do gateway. Decidir: (i) mantê-las como porta declarada com contrato próprio, ou (ii) migrá-las para chamar a edge function | ADR-016 + implementação |
| **E85** | Se (i): criar o **contrato SQL de egresso** — uma única função `ops.fn_provider_call(verbo, payload)` que todas usam, espelhando os 12 verbos do gateway | 0 funções chamando `net.http_*` direto para o provider |
| **E86** | Instrumentar a porta P4 com as mesmas métricas do gateway (latência, retry, status) — hoje ela é cega | Métricas no painel de E10 |
| **E87** | Formalizar o contrato de **ingestão** com versão no envelope (`evolution-webhook@v1`) e rejeição de versão desconhecida | Teste de contrato com payload v0 → 400 |
| **E88** | Rotacionar o segredo HMAC do webhook pelo procedimento de dois segredos (já existe precedente: `EVOLUTION_WEBHOOK_SECRETS=v3,v1,v2`) e documentar como operação de rotina | Rotação executada sem downtime |
| **E89** | Remover a conexão Postgres direta do consumer (`PG_EVOLUTION_URL`) se a telemetria puder ir pelo mesmo canal HTTP — hoje é a única escrita direta do lado Evolution no Supabase | Consumer sem `psycopg2` ou com escrita só em `evo` |
| **E90** | Declarar e testar o comportamento sob **falha do outro lado**: ZAPP com Evolution fora (fila cresce, UI degrada com aviso) e Evolution com Supabase fora (retry/DLQ sem perda) | Dois testes de caos documentados |

---

## FASE 7 — Prova de substituibilidade (E91–E95)

Independência que não é exercitada não é independência.

| # | Etapa | Evidência de pronto |
|:--:|---|---|
| **E91** | Ensaio cronometrado `fake ↔ evolution` usando `PROVIDER_UNDER_TEST` (mecanismo já existe e tem 12/12 no fake) | Tempo medido e registrado |
| **E92** | Ensaio de troca real de provider em staging: `evolution → cloud`, com envio e recebimento de mensagem | Mensagem enviada pela Graph API |
| **E93** | Medir e registrar quantos arquivos precisaram mudar no ensaio, por camada (UI / edge / SQL) — a meta é **zero em UI e zero em PL/pgSQL** | Relatório do ensaio |
| **E94** | Ensaio de rollback: voltar para `evolution` dentro da janela definida | Tempo de rollback ≤ meta |
| **E95** | Atualizar `RUNBOOK_TROCA_PROVIDER.md` e `SUBSTITUABILITY_MATRIX_V4.md` com os tempos **medidos**, substituindo as estimativas por análise de código | Documento sem estimativa não-medida |

---

## FASE 8 — Corte físico opcional e governança permanente (E96–E100)

| # | Etapa | Evidência de pronto |
|:--:|---|---|
| **E96** | Avaliar (não executar) o corte físico: `evo` em cluster próprio, ligado por FDW ou por replicação lógica. Só é possível **depois** de E65 (FKs) e E47/E48 (`search_path`) | ADR-017 com decisão explícita, inclusive "não fazer" |
| **E97** | Tornar `boundary-audit` um **gate bloqueante** no CI dos dois repos, com placar mínimo por invariante | PR que piora qualquer invariante é barrado |
| **E98** | Instituir o **ratchet**: o placar só pode melhorar; regressão exige ADR com justificativa | Workflow de ratchet ativo (já existe precedente: `ratchet-tighten.yml`) |
| **E99** | Criar a rotina trimestral de reconciliação doc × banco, publicando o placar no `ESTADO.md` | Primeira execução registrada |
| **E100** | Retrospectiva final: recalcular o placar dos 9 invariantes contra T0 e publicar o delta; encerrar ou repriorizar o que sobrou | `BOUNDARY_SCORE_T1.json` + retro |

---

## 3. Validação antecipada — simulação de cenários

Cada cenário foi checado contra o estado real medido. **Sete deles derrubariam o plano se
executado na ordem ingênua** — e por isso a ordem acima é a que é.

### C1 — "Mover a tabela primeiro, corrigir as funções depois"
**Previsão:** falha catastrófica. As 161 funções que citam `zapp.evolution_messages` por nome
quebram no primeiro `SELECT` após o `SET SCHEMA`, inclusive `rpc_insert_message` — a ingestão
para inteira e as mensagens vão para a DLQ.
**Mitigação no plano:** E68–E71 (indireção por view) **antes** de E73. A troca de schema vira
não-evento porque ninguém mais cita o nome físico.

### C2 — "As views vão quebrar quando eu mover a tabela"
**Previsão:** **não quebram.** Views ligam por OID; o `pg_get_viewdef` se reescreve sozinho.
As 75 views e 68 FKs seguem a tabela. Este medo é o que vinha inflando a estimativa de esforço.
**Consequência:** a Rota A é mais barata do que parecia — o custo está nas funções, não no dado.

### C3 — "Mover 340 MB vai exigir janela longa"
**Previsão:** falso. `ALTER TABLE … SET SCHEMA` é catálogo puro, O(1). A janela é ditada pelo
`AccessExclusiveLock` (milissegundos) e pela pausa do consumer, não pelo volume.
**Risco real:** lock contention se houver transação longa aberta. **Mitigação:** `lock_timeout`
curto + retry, e drenar a fila antes (E72).

### C4 — "Mover as tabelas vai derrubar o Realtime do inbox"
**Previsão:** parcialmente falso, e a documentação induz ao erro. `evolution_messages` e
`evolution_conversations` **não estão** na publication — mover não afeta nada.
`evolution_contacts` **está**. **Mitigação:** E76 trata contatos em janela própria; e o
`CLAUDE.md` (E13) é corrigido antes, para ninguém planejar em cima da informação errada.

### C5 — "Mover as funções `evo` → `zapp` vai quebrar os 26 triggers"
**Previsão:** falso. `pg_trigger.tgfoid` é OID — o trigger acompanha a função.
**O que realmente quebra:** os **43 cron jobs** que citam as funções por nome no `command`.
**Mitigação:** E60 é etapa própria, com query de verificação, e não um sub-item esquecido.

### C6 — "Basta mover a função de schema para cortar a dependência"
**Previsão:** falso. As 77 funções têm `search_path` **fixo** em 11 variantes, incluindo
`search_path=evo, zapp`. Mover a função não muda como ela resolve nomes — a dependência
sobrevive, invisível.
**Mitigação:** E46–E48 tratam `search_path` como item de primeira classe, e E59 reescreve o
`search_path` **no mesmo statement** do `SET SCHEMA`.

### C7 — "Dropar as 6 FKs é seguro, são poucas"
**Previsão:** risco de LGPD. As FKs `media_download_queue`/`media_loss_registry` têm CASCADE;
sem elas, o `DELETE` de contato deixa mídia órfã — e mídia de WhatsApp é dado pessoal. O
`ESTADO.md` já registra um incidente de 13 GB de mídia órfã e a lição de que
`cleanup-storage-orphans` apagaria mídia real.
**Mitigação:** E66 exige teste de erasure ponta a ponta **antes** do drop; E64 entrega a
reconciliação lógica antes de remover a garantia física.

### C8 — "Tirar o `supabase.yml` do `evolution-stack` é só mover arquivo"
**Previsão:** falha na primeira rotação de segredo. O arquivo carrega 20+ decisões operacionais
no cabeçalho (rotação de `evolution_api_key`, `EVOLUTION_WEBHOOK_SECRETS`, `PGRST_DB_SCHEMAS`,
memória do analytics) e referencia Docker secrets externos.
**Mitigação:** E34 move a **propriedade dos secrets** junto, e E37 prova por teste destrutivo
que o ZAPP sobe sem o repo do provider.

### C9 — "O CI já protege contra regressão"
**Previsão:** não protege. O `sql-gate` valida um fixture de 12 entradas enquanto o banco tem
25 no mesmo escopo — está 13 funções atrás. O `inventory.mjs` marca `TOTAL=0` porque só conta
`evolution-api`, ignorando as outras 5 edge fns invocadas do React.
**Mitigação:** E18–E23 corrigem os dois gates **antes** de qualquer mudança estrutural, senão
o plano avança às cegas.

### C10 — "Vamos acabar com `evo` e simplificar"
**Previsão:** perda de observabilidade. `evo` concentra hoje monitoria, mídia, LID e auditoria
de webhook — com ~45 cron jobs. Apagar sem destino quebra a detecção de 401, ack-loss, spurious
close e pipeline health.
**Mitigação:** E49 classifica antes de agir; E50 arquiva só o balde comprovadamente morto.

### C11 — "Depois de tudo, `evo` pode ir para outro banco"
**Previsão:** só depois de E65 **e** E47/E48. Enquanto houver FK cruzada ou `search_path` com o
outro schema, a separação física é impossível — o `ALTER` falha ou a função quebra em runtime.
**Mitigação:** E96 é explicitamente posterior e opcional, com "não fazer" como saída válida.

### C12 — "A ingestão está protegida porque passa por HMAC"
**Previsão:** protegida contra terceiros, não contra perda. Se o edge runtime cair durante a
janela, o consumer faz retry e depois DLQ. Com 926 msgs/24h (≈0,64/min) a fila absorve com
folga — mas isso precisa ser **verificado**, não presumido.
**Mitigação:** E8 calcula a folga com margem ≥ 20×; E11 define o gatilho de rollback por DLQ.

### C13 — "Trocar de provider é barato porque existe o adapter"
**Previsão:** o adapter cobre só a porta P1. Continuam fora: 5 `invoke('evolution-*')` na UI,
o `registry.ts` sem `cloud`, e as funções PL/pgSQL da porta P4.
**Mitigação:** E81–E85 fecham as três frentes; E93 mede o resultado em vez de estimá-lo.

### C14 — "Podemos fazer tudo numa janela só"
**Previsão:** falha de reversibilidade. Uma janela única com troca de schema, reescrita de
funções, mudança de cron e movimentação de stacks não tem ponto de rollback identificável.
**Mitigação:** lotes de ≤ 8 funções (E59), placar após cada lote (E63), e gatilhos
quantitativos (E11).

### C15 — "O plano está completo"
**Previsão:** não está — ver a seção de gaps abaixo. Um plano que se declara completo é o
mesmo erro do `SCORECARD_V4` de 9,4/10 medindo só as 4 portas de egresso.

---

## 4. Gaps conhecidos — o que este plano **não** resolve

Registrados explicitamente para não virarem surpresa:

1. **n8n.** Existem 254 workflows (138 ativos), muitos com nós Postgres. Não é auditável a
   partir deste banco. Se algum consultar `zapp.evolution_messages` pelo nome físico, E73 o
   quebra silenciosamente. **Ação prévia necessária:** inventariar os nós Postgres do n8n
   antes da Fase 5 — este plano não tem acesso para fazê-lo.
2. **Metabase / dyad / om_reader.** Existem papéis de leitura (`metabase_reader`, `dyad_reader`,
   `om_reader`) cujos dashboards podem citar nomes físicos. Mesmo risco do n8n.
3. **PG14 nativo da Evolution.** Este plano trata a fronteira no Supabase. O banco `evolution`
   (stack `postgres`/20) está corretamente isolado hoje, mas seu ciclo de vida (upgrade,
   backup pgBackRest, purge) não é coberto aqui.
4. **Cloudflare R2 / storage.** A mídia tem paths `evolution-api/...` com query string e 206
   referências não auditadas (registrado no `ESTADO.md`). A fronteira de storage não foi
   analisada — é um plano à parte.
5. **Custo em pessoa-hora.** Deliberadamente ausente. As contagens (161, 77, 43, 26, 12, 6) são
   medidas; a velocidade do time não é, e converter uma na outra sem histórico produziria um
   número falso.
6. **Janela de negócio.** Depende do horário de menor tráfego, que precisa vir do painel de E10
   com 7 dias de dado — ainda não coletado.
7. **`_supabase` (5,6 GB) e o database `postgres` (2,3 GB).** O plano não trata separação de
   cluster; E96 apenas avalia.

---

## 5. Ordem de execução e dependências duras

```
FASE 0 (E1–E12)  ─────────────────────────────────► pré-requisito de tudo
        │
        ├─► FASE 1 (E13–E24)  gates que medem a realidade
        │        │
        │        └─► obrigatório antes de qualquer DDL (senão avança às cegas)
        │
        ├─► FASE 2 (E25–E38)  soberania de plataforma   [independente das demais]
        │
        └─► FASE 3 (E39–E48)  dono único do schema
                 │
                 └─► FASE 4 (E49–E66)  fronteira de escrita
                          │
                          ├─ E64–E66 (FKs) ────────► pré-requisito de E96
                          │
                          └─► FASE 5 (E67–E80)  reposicionar dado e leitura
                                   │
                                   │  E68–E71 ANTES de E72–E77 (trava dura)
                                   │
                                   └─► FASE 6 (E81–E90) ─► FASE 7 (E91–E95) ─► FASE 8 (E96–E100)
```

**Travas duras (violar = incidente):**
- E68–E71 **antes** de E73 — senão 161 funções quebram (C1)
- E60 **junto** com E59 — senão 43 cron jobs quebram (C5)
- E46–E48 **junto** com E59 — senão o `search_path` mantém a dependência (C6)
- E64 **antes** de E65 — senão perde-se a garantia de erasure (C7)
- E18–E23 **antes** da Fase 4 — senão o gate não detecta a regressão que ele existe para pegar (C9)
- E6 (backup restaurável validado) **antes** de qualquer DDL

---

## 6. Placar de invariantes — T0 (hoje) e meta

| Invariante | T0 medido | Meta | Etapas |
|---|:--:|:--:|---|
| I1 — fns `evo` escrevendo em `zapp` | **64** (+26 triggers) | 0 | E49–E63 |
| I2 — fns `zapp` escrevendo em `evo` | **12** | 0 | E62 |
| I3 — FKs cruzando a fronteira | **6** | 0 | E64–E66 |
| I4 — dado da Evolution no schema da Evolution | **não** | sim | E67–E77 |
| I5 — leitura só por contrato | parcial | sim | E78–E80 |
| I6 — cada repo deploya só a sua infra | **não** | sim | E25–E38 |
| I7 — dono único de migration por schema | **não** | sim | E39–E45 |
| I8 — egresso sob gateway, gate contra o banco | fixture | banco | E17–E21, E84–E86 |
| I9 — troca de provider sem tocar UI/PL-pgSQL | **não** | sim | E81–E85, E91–E95 |

Placar T0: **0 de 9**. Este é o número honesto de onde se parte — e é compatível com um sistema
que já fez a parte visível da separação (repositórios e egresso HTTP) e ainda não fez a
invisível (dado e plataforma).
