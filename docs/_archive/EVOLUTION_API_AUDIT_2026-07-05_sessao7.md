> **📜 DOCUMENTO HISTÓRICO** — Reflete o estado do sistema na data indicada. A arquitetura atual usa um único Supabase Self-Hosted com schema `zapp`. Veja [SCHEMA_REFERENCE.md](docs/SCHEMA_REFERENCE.md).

# 🔍 Sessão 7 — Auditoria exaustiva Evolution API + bancos (nativo/evo/zapp) + infra — 2026-07-05

> **Nota de reconciliação:** esta auditoria rodou em paralelo (mesma janela de horário,
> 2026-07-05 ~00:20–01:30 UTC) a uma outra sessão Claude Code independente, cujo relatório
> já está em [`EVOLUTION_API_AUDIT_2026-07-05_sessao6.md`](./EVOLUTION_API_AUDIT_2026-07-05_sessao6.md)
> (mergeado antes deste, via PR #193). Por isso este arquivo foi renomeado de "sessao6"
> para "sessao7" ao resolver o conflito de merge. As duas sessões encontraram parte dos
> mesmos problemas por ângulos diferentes e **não se contradizem**: a sessão 6 tratou
> `zapp.channel_connections` via policies de linha (RLS granular por operação) e revogou
> `anon` + `security_invoker` em todas as 546 views de `public`; esta sessão (7) fechou a
> lacuna de **exposição de coluna** que sobrava (grant de coluna para `credentials`/`config`
> continuava aberto para `authenticated` mesmo com a policy de linha corrigida) e tratou
> `zapp.whatsapp_connections`/`evo.evolution_instance_credentials`, que a sessão 6 não
> cobriu. Os dois conjuntos de mudanças são complementares e idempotentes entre si.
>
> **Método:** 8 trilhas de investigação independentes via MCP (Portainer, Evolution API,
> Supabase self-hosted PG15 + PG14 nativo da Evolution), com simulação de cenários e
> verificação cruzada, seguido de execução direta das correções seguras e reversíveis.
> **Anteriores:** sessões 1–6 de 2026-07-03/04/05 (`EVOLUTION_API_AUDIT_2026-07-04_*`,
> scorecard "10/10" da sessão 3, `EVOLUTION_API_AUDIT_2026-07-04_sessao5_wpp2.md`,
> `EVOLUTION_API_AUDIT_2026-07-05_sessao6.md`).
> Este relatório **não repete** achados já resolvidos nessas sessões (ex.: bug da
> instância fantasma wpp2/UUID, já corrigido em `src/lib/evolutionInstance.ts` e no
> guard server-side de `evolution-api/index.ts`) — foca no que mudou desde então.

## 0. Sumário executivo

| # | Achado | Severidade | Status |
|---|--------|:----------:|--------|
| 1 | `wpp2` (número principal, 551146375517) desconectado por conflito de sessão (401 `device_removed`) — mirror parado há 14 dias | 🔴 Crítico | **Gated** (requer scan físico do celular) — QR novo já gerado nesta sessão |
| 2 | `zapp.whatsapp_connections` expunha `qr_code`/`instance_id` sem máscara a qualquer `authenticated` | 🔴 Crítico | ✅ **Corrigido** |
| 3 | `evo.evolution_instance_credentials` (contém `api_key`) legível por qualquer `authenticated` | 🔴 Crítico | ✅ **Corrigido** |
| 4 | `zapp.channel_connections` expunha `credentials`/`config` (tokens de integração) a qualquer `authenticated` | 🔴 Crítico | ✅ **Corrigido** |
| 5 | Baileys 7.0.0-rc.9 (fixado pela Evolution 2.3.7) vulnerável a CVE-2026-48063/GHSA-qvv5-jq5g-4cgg (CVSS 9.3) | 🔴 Crítico | **Gated** (fix só em 2.4.0-rc, requer teste em staging) |
| 6 | `public.processed_webhook_events` dropada em 2026-07-04 22:34 e nunca recriada — fail-open no dedup do canal WhatsApp Cloud API | 🔴 Crítico | ✅ **Corrigido** (repontado para `webhook_events_processed`, já era o alias canônico segundo `scripts/check_schema_drift.sql`) |
| 7 | Mirror `evo.evolution_messages_wpp2` defasado: 16.786 linhas reais vs 102.994 da API (gap 83,6%) | 🔴 Crítico | Follow-up (depende da reconexão do item 1 + investigação do job de reconcile) |
| 8 | `baileys-error-monitor` e `wa-version-monitor`: 0 containers, RestartPolicy esgotada silenciosamente | 🔴 Crítico | ✅ **Corrigido** (redeploy forçado, ambos rodando novamente) |
| 9 | `schema-drift-guard` parou de iterar ~8h antes do DROP DDL destrutivo | 🟠 Alto | ✅ **Corrigido** (restart) |
| 10 | Loop de erro 401 "Missing webhook signature" (mecanismo global `WEBHOOK_EVENTS_ERRORS_WEBHOOK` da Evolution, sem header de assinatura) | 🟠 Alto | Diagnosticado; fix requer redeploy do `evolution_evolution` (gated) |
| 11 | 89% das tabelas `zapp` (138/155) usam policy `USING(true)` para `authenticated` — RLS "ligado" mas sem isolamento real | 🟠 Alto | Follow-up (decisão de modelo tenant necessária, escopo grande demais para 1 passada) |
| 12 | 4 índices FK ausentes no banco nativo da Evolution (N8n/OpenaiBot/IntegrationSession) | 🟡 Médio | ✅ **Corrigido** |
| 13 | `effective_cache_size=6GB` > limite real do container (5GB) | 🟡 Médio | ✅ **Corrigido** (3584MB, reload sem restart) |
| 14 | `department_id` sem FK em 4 tabelas (profiles/queues/automation_rules/automation_executions) | 🟡 Médio | ✅ **Corrigido** (0 órfãos confirmados antes) |
| 15 | 123 pares de índices "duplicados" no schema `evo` | 🟡 Médio | **Não executado** — pelo menos 1 caso investigado era índice parcial disfarçado de duplicata; requer inspeção índice-a-índice, não drop em lote |
| 16 | `evolution-db-purge`: 5 falhas/noite ("invalid transaction termination") antes de suceder; pula VACUUM em Message/MessageUpdate/IsOnWhatsapp por ownership | 🟡 Médio | Follow-up (não investigado a fundo por tempo) |
| 17 | `messages_whatsapp_deprecated` (zapp) órfã, 0 linhas | 🟢 Baixo | ✅ **Corrigido** (arquivada + dropada) |
| 18 | `max_connections` real=100 (env `PG_MAX_CONNECTIONS=500` é ignorado pela imagem oficial) | 🟢 Baixo/Médio | **Gated** — requer restart do Postgres nativo (serve 6 apps) |
| 19 | Postgres 14 do stack nativo aproxima-se do EOL (~nov/2026) | 🟢 Baixo | Follow-up (planejar upgrade major) |
| 20 | Restart em massa ~11h antes da sessão (15+ stacks, códigos 137/255) — consistente com OOM/reboot do host | 🟠 Alto | Follow-up (sem acesso a `dmesg`/`journalctl` do host via MCP) |

**Legenda:** ✅ Corrigido = aplicado ao vivo em produção nesta sessão, com rollback documentado.
**Gated** = deliberadamente não automatizado (ação física, ou risco/blast-radius que exige janela
e decisão humana — mesma postura de engenharia sênior das sessões 3–5).
**Follow-up** = requer investigação/trabalho adicional além do escopo desta sessão.

---

## 1. Achados por trilha (detalhe)

### 1.1 Banco nativo da Evolution (PG14, database `evolution`)

Íntegro operacionalmente: 13/100 conexões em uso, zero idle-in-transaction, zero locks,
autovacuum em dia (dead tuples <0,5% em todas as tabelas grandes). Dois problemas de
configuração corrigidos nesta sessão (ver `db/remediation/APPLIED_2026-07-05_evolution_native_db.sql`):
`effective_cache_size` acima do limite real do container, e 4 índices de FK ausentes em
tabelas de integração (N8n/OpenaiBot/IntegrationSession). `max_connections` real é 100,
não 500 como o env sugere — a variável `PG_MAX_CONNECTIONS` não é reconhecida pela imagem
oficial `postgres:14`; corrigir exige `command: postgres -c max_connections=...` **e**
restart do banco (compartilhado por evolution/n8n_queue/dify/flowise/typebot/nocodb) — não
executado aqui, ver §3.

### 1.2 Schema `evo` (mirror/CRM sobre a Evolution, Supabase self-hosted)

Achado mais grave: o mirror de `wpp2` está **defasado/parado** — 16.786 linhas reais em
`evo.evolution_messages_wpp2` contra 102.994 reportadas pela API (gap de 83,6%), sem
mensagem nova desde 2026-06-21. `evolution_mirror_runs/checkpoints/batches` mostram 0
execuções recentes. A migração em lote `wpp2_to_v2` (`evo.migration_watermark`) está
parada há ~2 dias no momento da auditoria. **Não corrigido nesta sessão** — depende de
diagnosticar o worker de mirror, e provavelmente vai se resolver parcialmente assim que
`wpp2` for repareada (item gated do §3), mas o gap histórico exige backfill à parte.

RLS: 100% das tabelas com RLS habilitado, mas a maioria com policy `USING(true)` para
`authenticated` — inclusive tabelas internas de pipeline (dlq, mirror_runs, audit_log).
O caso mais grave, `evo.evolution_instance_credentials` (armazena `api_key`), foi corrigido
nesta sessão. As demais ~168 tabelas ficam como follow-up (risco vs. esforço: são tabelas
de infraestrutura de pipeline, não dados de usuário final, mas merecem revisão).

Particionamento mensal de `evolution_webhook_events_v2`: **tem automação real** via
`pg_cron` (job `auto-create-monthly-partitions`, mensal) — não é manual como uma leitura
rápida sugeriria — mas o histórico de execução do job é apagado por outra rotina de limpeza
antes do próximo ciclo, criando ponto cego de monitoramento (recomendação: log próprio,
não depender de `cron.job_run_details`).

123 pares de "índices duplicados" foram reportados pela ferramenta de auditoria — mas a
inspeção de um caso (`idx_alerts_unresolved`) revelou que é na verdade um **índice parcial**
(`WHERE resolved = false`), não uma duplicata real, apesar de reportar as mesmas colunas
"top-level". Por esse motivo **não dropamos nenhum em lote** nesta sessão — cada um precisa
ter sua definição completa (`indexdef`, incluindo `WHERE`) inspecionada antes de remover.

### 1.3 Schema `zapp` (aplicação/CRM)

O incidente de DROP DDL de 2026-07-04 22:34–22:41 (role `supabase_admin`) foi totalmente
reconstruído via `ops.ddl_audit`: de 4 objetos citados nos alertas, **3 foram recriados na
mesma janela** (14ms a 26s depois — `zapp.whatsapp_connections`, `ops.v_health_deadman`,
`public.v_evolution_pipeline_dashboard`, todos existentes e funcionais hoje). Apenas
**`public.processed_webhook_events` permaneceu ausente** — corrigido nesta sessão (ver §2).
Evidência forte (`ops.schema_changelog`, 20 linhas `applied_by='claude_audit'` ~2h depois,
tocando os mesmos objetos) aponta para um agente de IA operando via ferramenta
administrativa de banco, não um humano no SQL editor — recomendação: exigir que DDL
destrutivo de automação grave `rollback_sql` em `monitoring.architecture_changelog`
**antes** de executar (nenhuma entrada existe lá para este burst).

RLS: 100% das 155 tabelas com RLS habilitado (o bug "RLS on + zero policies" não ocorre),
mas 138/155 (89%) dependem de ao menos uma policy `USING(true)` para `authenticated`. Os
dois casos mais graves e concretos (exposição de QR code/instance_id de conexão WhatsApp
via `whatsapp_connections`, e de credentials/config via `channel_connections`) foram
corrigidos nesta sessão. O padrão sistêmico mais amplo (as outras ~136 tabelas) fica como
follow-up — decisão de modelo tenant necessária antes de qualquer mudança em massa.

Direção tabela-real/view inconsistente entre pares: `channel_connections` tem `zapp` como
fonte real (correto, documentado); `whatsapp_connections`, `queues`, `automation_rules` e
`automation_executions` têm a **fonte real em `public`/`zapp` invertida** caso a caso
(confirmado durante a aplicação das FKs do §2 — tivemos que descobrir isso na prática ao
tentar `ALTER TABLE public.queues`, que falhou por ser view). Recomendação: ADR formal
documentando a direção esperada por tabela, para não repetir esse tipo de erro.

### 1.4 Causa-raiz: `wpp2` e `wpp_pink_test` desconectados

`wpp2`: `tag=conflict`/`type=device_removed` (401) em 2026-07-04T15:00:44Z — assinatura
clássica de login simultâneo em outro dispositivo/sessão, não de ban explícito. Alerta
`pipeline_dead_man` já apontava ~13 dias sem mensagem em horário comercial. `wpp_pink_test`:
"Connection Failure" (401, `location=frc`) em 2026-07-04T13:39:07Z, 42s após um redeploy
simultâneo de `watchdog-baileys`/`baileys-error-monitor`/`wa-version-monitor` — correlação
temporal forte com causa de infraestrutura, não prova definitiva.

`watchdog-baileys` detectou corretamente o `device_removed`, mas suprime qualquer nova
notificação após o primeiro alerta ("already alerted") — por isso a queda persistiu ~13
dias sem escalonamento. Os dois monitores desenhados especificamente para esse padrão
(`baileys-error-monitor`, `wa-version-monitor`) estavam com **0 containers** — corrigido
nesta sessão (§2), mas eles não existiam para alertar durante a maior parte da janela.

Não há como confirmar via API se houve banimento definitivo do número — só abrindo o
WhatsApp no aparelho físico. Um QR code novo foi gerado nesta sessão para `wpp2` usando o
nome correto da instância (não o UUID, evitando repetir o bug da "instância fantasma" já
corrigido na sessão 5) — **requer scan físico do celular**, não automatizável.

### 1.5 Loop de erro "Missing webhook signature"

Causa raiz confirmada (não hipótese): o mecanismo **global** de auto-relato de erro da
Evolution (`WEBHOOK_EVENTS_ERRORS_WEBHOOK`) faz POST para a Edge Function
`evolution-webhook` **sem nenhum header de assinatura**, e a função exige `STRICT_MODE=true`.
Os webhooks de **dados** por instância (wpp2, wpp_pink_test) estão corretos — secret
sincronizado (hash SHA-256 idêntico confirmado nos dois lados, sem imprimir o valor), 0
erros nas últimas 48h em `evolution_webhook_events_v2`. A hipótese de dessincronização de
secret foi **refutada**. O volume de rejeições nesta sessão (~65 em 28min) correlaciona com
o container `evolution_evolution` em crash-loop (healthcheck falhando a cada 5s antes de
reiniciar) — tratado como achado de infra separado. Fix correto:
`WEBHOOK_EVENTS_ERRORS=false` (ou redirecionar para endpoint sem `STRICT_MODE`) — requer
redeploy do serviço `evolution_evolution`, não executado nesta sessão (container já frágil).

### 1.6 Versão e segurança (pesquisa web)

`EvolutionAPI/evolution-api` foi rebrandeado para `evolution-foundation/evolution-api`
(mesmo projeto/mantenedores, URLs antigas continuam funcionando como alias). **2.3.7 é a
última versão estável publicamente disponível** — não há defasagem de release estável.
Achado crítico: a dependência `baileys` fixada em `7.0.0-rc.9` está na faixa afetada pela
CVE-2026-48063/GHSA-qvv5-jq5g-4cgg (CVSS 9.3, spoofing de mensagens/corrupção de app-state,
divulgada 2026-05-20), corrigida só em `baileys >= 7.0.0-rc12`. O único jeito de obter o fix
hoje é a branch `2.4.0` (ainda release candidate, com breaking change de ativação de
licença obrigatória) — **não aplicado nesta sessão**, requer teste em staging.

### 1.7 Infraestrutura Portainer/Swarm

Host de nó único (12 vCPU / 23,5GiB RAM, sem swap, `OomKillDisable=true`). Um evento de
restart em massa ~11h antes da sessão (15+ stacks não relacionados saindo com código
137/255 no mesmo intervalo) é consistente com OOM ou reboot do host inteiro — não
confirmável via Portainer (sem acesso a `dmesg`/`journalctl`). Redis já tem
`maxmemory=2GB`+`allkeys-lru`+`activedefrag` corretamente configurados (uso real ~15MB,
folga saudável). `baileys-error-monitor` e `wa-version-monitor` tinham **0 containers**
(RestartPolicy `on-failure`/`MaxAttempts=5` esgotada silenciosamente) — corrigido nesta
sessão via force-update dos serviços. `schema-drift-guard` parou de iterar ~8h antes do
incidente de DROP DDL (por isso não o pegou) — corrigido via restart do container.
`evolution-db-purge` falha 5x/noite com "invalid transaction termination" antes de suceder
na 6ª tentativa, e pula VACUUM nas tabelas grandes por falta de ownership — não corrigido
nesta sessão (procedure vive no banco nativo, precisa de leitura cuidadosa do código antes
de mexer).

---

## 2. O que foi executado nesta sessão (produção, todas reversíveis)

Ver rollback completo em:
- `supabase/migrations/20260705013000_evo_zapp_security_and_integrity_hardening.sql`
- `db/remediation/APPLIED_2026-07-05_evolution_native_db.sql`

1. **RLS `zapp.whatsapp_connections`**: mascarado `qr_code`/`instance_id`/`evo_instance_id`
   para não-admin (mesmo padrão de `whatsapp_connections_safe`).
2. **RLS `evo.evolution_instance_credentials`**: restrito a `service_role` apenas.
3. **Grants `zapp.channel_connections`**: revogado SELECT de `credentials`/`config` para
   `authenticated`.
4. **`whatsapp-cloud-webhook/index.ts`**: repontado para usar o helper compartilhado
   `markEventProcessed`/`webhook_events_processed` (mesmo padrão do `evolution-webhook`,
   elimina também uma race condition select-then-insert na deduplicação).
5. **4 índices de FK** criados no banco nativo (N8n/OpenaiBot/IntegrationSession).
6. **`effective_cache_size`** recalibrado para 3584MB (reload, sem restart).
7. **4 FKs de `department_id`** adicionadas (profiles/queues/automation_rules/
   automation_executions → departments), 0 órfãos confirmados antes.
8. **`zapp.messages_whatsapp_deprecated`**: arquivada em `archive.*` e dropada.
9. **VACUUM FULL** em 3 tabelas bloatadas vazias (`media_download_queue`,
   `media_scan_log`, `instance_registry`) + **ANALYZE** completo (estatísticas haviam
   zerado após restart do Postgres em 2026-07-04T19:42Z).
10. **Redeploy forçado** de `baileys-error-monitor` e `wa-version-monitor` (0 containers →
    rodando); **restart** de `schema-drift-guard` (parado de iterar → rodando).
11. **QR code novo gerado** para `wpp2` via nome correto da instância (pronto para scan
    físico — ver §3).

---

## 3. Itens deliberadamente NÃO automatizados (gated)

Mesma postura das sessões 3–5: o que seria destrutivo, físico, ou de alto blast-radius
sobre um pipeline que hoje funciona não foi executado sem janela/decisão humana.

| Item | Por que não foi automatizado | Próximo passo |
|---|---|---|
| 🔴 Reconectar `wpp2` | Requer escanear QR num celular físico | QR já gerado nesta sessão; Manager → wpp2 → Connect, ou repetir `evo_instance_connect` (expira em segundos) |
| 🔴 CVE-2026-48063 no Baileys | Fix só em 2.4.0-rc (breaking change de licença); patch manual no vendor em container já instável é arriscado | Testar 2.4.0-rc2 em staging, ou aplicar override de `baileys>=7.0.0-rc12` com testes de regressão antes de produção |
| 🟠 `max_connections` real=100 | Requer restart do Postgres nativo compartilhado por 6 apps (evolution/n8n_queue/dify/flowise/typebot/nocodb) | Agendar janela de manutenção coordenada |
| 🟠 `WEBHOOK_EVENTS_ERRORS` da Evolution | Requer redeploy do `evolution_evolution` (container já em crash-loop parcial) | Agendar junto com outras mudanças de env, fora de janela de instabilidade |
| 🟠 Restart em massa do host (~11h antes) | Sem acesso a `dmesg`/`journalctl` via Portainer/MCP | Pedir ao dono da VPS os logs do kernel/systemd desse horário |
| 🟡 123 índices "duplicados" em `evo` | 1 caso investigado era índice parcial disfarçado de duplicata — risco de dropar algo funcionalmente distinto | Script de limpeza dedicado, índice a índice, com `indexdef` completo |
| 🟡 RLS `USING(true)` em ~136 tabelas remanescentes de `zapp`/`evo` | Escopo grande demais para uma passada às cegas; depende de decisão de modelo tenant | Levantamento dedicado + priorização por sensibilidade de dado |
| 🟡 Gap de mirror de `wpp2` (83,6%) | Depende da reconexão física + investigação do worker de mirror parado | Após reconexão, investigar `evolution_mirror_runs`/`migration_watermark` e rodar backfill |
| 🟢 Upgrade major do Postgres 14 (EOL ~nov/2026) | Mudança de major version requer teste de compatibilidade do Prisma Client | Planejar como projeto à parte |

Itens já gatilhados em sessões anteriores e ainda pendentes (não re-investigados aqui):
rotação da API key pública default, decisão S3 (R2) vs MinIO para mídia, e revisão dos
critérios de auto-reciclagem do `infra-boot-guard`/`swarm-task-guardian` sobre bancos de
dados (confirmado novamente ativo nesta sessão: o container `evolution_evolution` reiniciou
mais uma vez durante a própria execução deste relatório).

---

*Sessão 6 executada por auditoria automatizada (Claude Code) em 2026-07-05. Nenhum
segredo (API keys, tokens de instância, senhas, hashes) foi incluído neste documento.*
