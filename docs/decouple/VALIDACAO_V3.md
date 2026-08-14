# RELATÓRIO DE VALIDAÇÃO — Migração & Planos de Desacoplamento Zapp Web V3 ↔ Evolution API

**Data:** 2026-08-14 · **Validador:** Hermes (deepseek-v4-pro) · **Método:** evidência empírica fresca (banco vivo, Portainer, Evolution MCP, GitHub API), não docs de terceiros.

---

## 1. Veredito sobre a migração iniciada pelo outro Claude — ✅ APROVADA (com 12 resíduos)

### 1.1 Separação de infra `zapp-web-v3` → `evolution-stack` (2026-08-12/13)

| Item | Estado | Evidência fresca |
|---|---|---|
| Repo evolution-stack populado (image/consumer/stacks/watchdogs/runbooks/db/GitOps) | ✅ | 61 arquivos, tree verificada via API |
| Imagem em prod = GHCR novo | ✅ | `evolution_evolution` = `ghcr.io/adm01-debug/evolution-stack/evolution-api-custom@6f9f1d35` (Portainer, hoje) |
| Consumer em prod = namespace novo | ✅ | `evolution-rabbit-consumer@75210b9f`, 2 réplicas |
| GitOps stacks (gitops-stacks.yml + guardrail `[deploy-prod]`) | ✅ | `docs/GITOPS.md` + workflow no repo |
| GitOps watchdogs E14/E15 (configs Swarm via Portainer API) | ✅ | commits 2026-08-14 + 5 serviços watchdog redeployados hoje 10:24–10:26 |
| CI guard anti-regressão no zapp (`decouple-guard.yml`, `ownership-gate.yml`) | ✅ | ambos no `.github/workflows/` |
| Zapp deployado na tag mais recente | ✅ | `zapp-web-prod_web` = `production-b87b4e9718a5` (HEAD de hoje) |

### 1.2 Migração física de tabelas `evo` → `zapp` (74 tabelas)

| Item | Estado | Evidência fresca |
|---|---|---|
| `zapp.evolution_*` = 74 · `evo.evolution_*` = 27 (todas Grupo A) | ✅ | `pg_class` agora |
| Health score | ✅ | **100.0 A+** |
| Grants escrita `authenticated` em Grupo A ([H2]) | ✅ | **0 linhas** |
| `rpc_upsert_contact` consolidado (E93) | ✅ | 1 overload (14-args) no `pg_proc` |
| RPCs da porta de ingestão (`rpc_claim_outbound_message`, `rpc_update_incoming_message`) | ✅ | existem em `zapp` |
| Backup de corpos SQL (`ops.fn_bodies_backup`) | ✅ | existe |
| Pipeline vivo | ✅ | **5.077 msgs/24h · DLQ = 0** |
| Crons (outbound-dispatch 317, stalled-alert 318, lid-sync 329, canary 429) | ✅ | todos `active=true` |
| Evolution API viva | ✅ | wpp2 `state=open`, isHealthy, 320.270 mensagens |

### 1.3 Desacoplamento de runtime (as 4 portas) — ✅ fechado com resíduos pontuais

| Porta | Estado | Resíduo |
|---|---|---|
| R2 egresso front | ✅ adapter + F3 completo | `invoke('evolution-api')` fora do adapter = 0 (só `withRequestId.ts`, comentário) |
| R4 gateway edge (client.ts 11 verbos) | ✅ 17→1 | strings de erro ainda citam `EVOLUTION_API_URL` (3 arquivos, inofensivo) |
| R3 porta de ingestão | ✅ ingest-port + RPCs | nenhum |
| **4ª porta SQL (egresso via Postgres)** | ✅ | as 5 fns usam `ops.fn_evo_url()`/`ops.fn_evo_key()`; o "match" de regex é só em mensagens de erro (`'evolution_api_url ausente'`) |
| R1 modelo canônico | 🔶 parcial | `src/domain/messaging` + normalizers + tests existem; **ADR-008 continua stub (1.161 bytes)** |
| F6 prova de troca | 🔶 parcial | fake provider existe; **RUNBOOK_TROCA_PROVIDER.md, RETRO_V2.md, CANONICAL_COLUMN_MAP.md não existem**; ensaio cronometrado nunca feito |

### 1.4 Resíduos reais encontrados (12) — priorizados

1. **🔴 Guard CI estale**: `decouple-guard.yml` só falha se `TOTAL > 15` (baseline de 9+0+6). Código real está em **0** — qualquer regressão de até 15 arquivos entra silenciosamente. Travar em 0.
2. **🔴 inventory.mjs não cobre a classe "fetch direto do browser"**: `src/integrations/zappweb/evolutionClient.ts` (cliente HTTP front→Evolution com `VITE_EVOLUTION_API_URL`) e `src/lib/healthCheck.ts` (ping direto) são **código morto hoje** (0 importadores vivos), mas continuam no repo — "zombie coupling": se alguém reimportar, fura o adapter sem nenhum gate detectar. Arquivar + criar métrica 4 no inventory.
3. **🟠 ESLint decouple em `warn`** (E94): promover para `error` (V2 E27 nunca executado).
4. **🟠 Vault: 10 secrets `evolution_*`, 2 pares duplicados**: `evolution_api_key`/`evolution_api_key_v2` e `evolution_webhook_secret`/`webhook_secret_evolution`. Consolidação (V2 E67) pendente — risco de rotação errar o par.
5. **🟠 evolution-stack — G4 aberto**: `evolution-security-guardian` e `evolution-pgbackrest-backup` rodam **fora de stack** (confirmado no Portainer hoje).
6. **🟠 evolution-stack — G5 aberto**: watchdogs com `apk add` no boot (base alpine:3.19).
7. **🟠 evolution-stack — G6**: `EXPECTED_DIGEST` do drift-check (validar, pode ainda estar vazio).
8. **🟡 ADR-008 stub**; **BOUNDARY-evolution.md** cobre só fronteira física (falta a lógica das 4 portas — V2 E96).
9. **🟡 Tags**: sem `decouple-v2-baseline` no zapp; **evolution-stack não tem nenhuma tag** (V2 E1/E2).
10. **🟡 G1**: teste `check-publish-evo-fallbacks` foi removido do zapp mas **não recriado** no evolution-stack (`image/tests/`).
11. **🟡 Branches zumbis**: `feat/decouple-v2` (2/9), `feat/decouple-provider` (36/25), `chore/remove-evolution-infra-to-evolution-stack` (3/27), `docs/pos-desacoplamento-20260814` (0/1).
12. **🟡 Docs V1 + 4 HANDOFFs** não marcados HISTÓRICO (S10 do V2); README do evolution-stack cita stack IDs antigos (purge 126/watchdogs 234/functions-health 236 — reais: 238/240/239).

---

## 2. Análise dos planos de 100 etapas existentes

### PLANO V1 (docs/decouple/PLANO_DESACOPLAMENTO_100_ETAPAS.md) — Nota: 8.5/10
**Acertos:** diagnóstico das 4 raízes (R1–R4) é o mapa certo do problema; proibição explícita de renomear tabelas/schema (E77) evitou a armadilha clássica; simulação de cenários ANTES do plano (8 cenários com mitigação); expand/contract; nunca desligar Evolution em prod.
**Falhas:** (a) E77 proibiu mover tabelas e a execução moveu 74 — deu certo, mas o plano ficou obsoleto como referência (o próprio V2 admite); (b) não detectou a 4ª porta de egresso (5 fns SQL chamando Evolution via `net.http_post`); (c) não cobria a classe "fetch direto browser" (evolutionClient/healthCheck); (d) F2 prescrevia ordem "modelo canônico antes de portas" — a execução inverteu (portas primeiro) e funcionou melhor.

### PLANO V2 (docs/decouple/PLANO_DESACOPLAMENTO_V2_100_ETAPAS.md) — Nota: 9/10
**Acertos:** baseline validado empiricamente (banco + Portainer + container), não sobre docs; descobriu a 4ª porta; critérios de abort herdados; convenção [R]/[D]/[!]/[⛔] clara; simulação S1–S10 prévia; paralelismo explícito.
**Falhas/omissões:** (a) não reescreveu os gates para o novo mundo (CI estale em 15); (b) não previu o zombie coupling (evolutionClient/healthCheck); (c) F6 ficou sem dono — fake provider criado mas prova de troca (ensaio medido + runbook) nunca executada; (d) E67 (consolidação de secrets) virou órfã; (e) o gateway SQL nasceu com design diferente do prescrito (`ops.fn_evo_url`/`fn_evo_key` em vez de `fn_provider_http`) — decisão razoável, mas ninguém atualizou o ADR/gate para refleti-la; (f) E1/E2 (tags) não executadas.

**Veredito dos planos:** excelentes como instrumentos de navegação; defasados como contratos. O V3 abaixo parte do estado REAL medido hoje (2026-08-14, ~10:40 BRT) e fecha os 12 resíduos.

---

## 3. Estado medido hoje (baseline do plano V3)

| Métrica | Valor |
|---|---|
| zapp-web-v3 HEAD | `fcf2f9b` (edge-deploy --restart) |
| evolution-stack HEAD | `2b230c9` |
| Digests prod | evolution `6f9f1d35` · consumer `75210b9f` · web `production-b87b4e9718a5` |
| Inventory (invoke/url/writes) | 0 / 0 / 0 |
| SQL egress | 100% via `ops.fn_evo_url`/`fn_evo_key` (5/5 fns) |
| Health / pipeline | 100.0 A+ · 5.077 msgs/24h · DLQ 0 |
| `rpc_upsert_contact` | 1 overload (14 args) |
| Grants escrita authenticated em `evo.evolution_*` | 0 |
| Vault `evolution_*` | 10 secrets (2 pares duplicados) |
| CI coupling threshold | estale em `> 15` (código em 0) |

---

## 4. Simulação de cenários de falha do plano V3 (feita ANTES de escrevê-lo)

| # | Cenário | O que aconteceria se feito errado | Mitigação no V3 |
|---|---|---|---|
| S1 | Travar CI em TOTAL=0 com as regras atuais | `eslint.config.js`/`inventory.mjs`/testes casam nos próprios patterns → CI trava do nada | F1: métricas com whitelist de tooling antes de travar (E12–E14) |
| S2 | Arquivar `evolutionClient.ts`/`healthCheck.ts` sem varrer bundle | algum import dinâmico/lazy não visto no grep revive o módulo → runtime error | F2: checar bundle de prod (`grep` nos assets) antes de arquivar (E23) |
| S3 | Consolidar secrets deletando o par antigo direto | algum consumidor com config cacheada (edge env, stack secret) quebra | F4: expand/contract — criar canônico, migrar consumidores, esperar, rotacionar (E43–E47) |
| S4 | Mover guardian/pgbackrest para stack sem backup de config | config externa perdida no redeploy → watchdog morre | F7: exportar config atual (docker service inspect) antes (E72) |
| S5 | Rebasar imagem de watchdog e atualizar 5 serviços de uma vez | digest novo em 5 serviços simultâneos; 1 bug derruba todos os watchdogs | F7: 1 serviço por commit, soak entre eles (E74–E76) |
| S6 | Fake provider em e2e com `DENO_ENV` mal configurado | fake ativo em prod = mensagens não enviadas | F5: verificar guard `DENO_ENV=test` no registry ANTES de rodar a suite (E51) |
| S7 | Corrigir strings de erro das fns SQL | risco de esquecer `prosecdef`/owner no CREATE OR REPLACE | F3: capturar corpo atual em `fn_bodies_backup` antes (E32) |
| S8 | Marcar docs HISTÓRICO sem conferir referências cruzadas | próximo agente segue ponteiro morto | F6: banner + link canônico no mesmo commit (E64) |
| S9 | Deletar branches com PR aberta | PR orfã/CI fantasma | F8: conferir PRs/estado antes de deletar (E83) |
| S10 | Drop do overload 3-args de `rpc_upsert_contact` sem verificar chamadores | algum chamador PostgREST positional quebra | já executado (E93); V3 valida chamadores restantes (E96) |
| S11 | Ensaio de troca de provider em horário comercial | janela de erro em produção | F5: ensaio em janela noturna/fim de semana + critérios de abort (E58) |
| S12 | Upgrade Evolution 2.4.0-rc2 sem revalidar contrato dos 11 verbos | envelope/endpoint muda → gateway quebra em cascata | F7: contrato-test do gateway antes de aceitar upgrade (E78) |

---

## 5. O que este plano deliberadamente NÃO faz

- Não renomeia tabelas, colunas, schemas ou edge functions (armadilha E77 do V1 segue valendo).
- Não remove `evolutionAdapter.ts`, `evolution-api/index.ts` nem nenhuma edge function viva.
- Não desliga o caminho Evolution em produção em nenhum momento.
- Não toca no FDW nem no database `evolution` externo.
- Não executa nada da fase F7 (infra prod) nem rotação de secrets sem `APROVADO` explícito.

---

## 6. Rodada 2 — correções da validação (2026-08-14, tarde)

Fechamento dos achados da Rodada 1 (seções 1–5): PRs de correção mergeados na `main` e verificação empírica fresca pós-merge.

### 6.1 PRs mergeados

| PR | O que fechou | Merged (UTC) |
|---|---|---|
| **#1077** | follow-up 2 — testes F3/F5 (wcs adapter + markAsRead rpc) + merge main | 2026-08-14 15:03:17Z |
| **#1078** | onda de validação — 6 correções de gaps dos 10 agentes: ESLint decouple ativas (fusão flat config), sql-gate conformidade + crash (entry null), inventory fix Windows, fake guard por verbo, ts-nocheck baseline, banners docs | 2026-08-14 16:19:08Z |
| **#1080** | `rpc_insert_followup_sequence` no types.ts (V3 achou ausente) + cast removido no call site | 2026-08-14 16:38:02Z |
| **#1081** | migration-espelho das 5 RPCs órfãs do repo (DB-as-source) | 2026-08-14 16:58:22Z |

### 6.2 Verificação empírica pós-merge

| Item | Evidência |
|---|---|
| `rpc_insert_followup_sequence` no types.ts | presente — `grep -c` = 1 em `src/integrations/supabase/types.ts` (commit `2c67b7c06`, PR #1080) |
| ESLint decouple **6 selectors ativos** | bloco único fundido em `eslint.config.js` (3 selectors decouple: invoke evolution-api, import de valor de evolutionExternal, VITE_EVOLUTION_API_URL; + 3 selectors schema contract: `.schema('evo'|'email_app')`, `schema:'public'`, `information_schema`), todos nível `error` (PR #1078) |
| sql-gate com teste **5/5** | `node --test scripts/decouple/__tests__/sql-gate.test.mjs` → `tests 5 · pass 5 · fail 0` (executado localmente na rodada 2) — cobre: egresso hardcoded real → violação; fn compliant → sem violação; falsos positivos legítimos; entry null sem crash; report malformado → exit 2 |
| migration-espelho **5+1 RPCs** | `supabase/migrations/20260814210000_mirror_rpcs_claim_update_followup.sql` — 5 RPCs com `CREATE OR REPLACE` idempotente (`rpc_claim_outbound_message`, `rpc_update_incoming_message`, `rpc_insert_followup_sequence`, `rpc_delete_followup_sequence`, `rpc_toggle_followup_sequence`) + 1 entrada de tipo RPC (`rpc_insert_followup_sequence`) no types.ts (commit `c7394a75e`, PR #1081) |

### 6.3 Resíduos ainda abertos após a rodada 2

- **Wiring do sql-gate no CI + fixture commitado** (`scripts/decouple/fixtures/sql_report_snapshot.json` ainda não existe no repo) — design documentado no ADR-010 ("Integração com o CI"); regenerar via `node scripts/decouple/sql-gate.mjs --sample` e commitar.
- **Threshold do `decouple-guard`** segue `> 15` no workflow (código em 0) — endurecer para 0.
- **Ensaio fake↔evolution (etapa 57)** — em preparação (`SIMULATION_SCENARIOS_20260814.md` PRÉ-EXECUÇÃO); runbook de troca concluído como contrato de planejamento.
- Resíduos 4–12 da seção 1.4 (secrets duplicados, G4/G5/G6 evolution-stack, tags, G1, branches zumbis, docs HISTÓRICO).
