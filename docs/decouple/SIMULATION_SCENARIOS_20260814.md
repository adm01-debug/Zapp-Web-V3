# Simulação de Cenários — Atualização de Documentação Pós-Desacoplamento
## Doc Update 30 Etapas · 10 Agentes · 2026-08-14

> Autor: Orquestrador (Claude Sonnet 4.6)  
> Escopo: evolution-stack + zapp-web-v3  
> Status: PRÉ-EXECUÇÃO — leitura obrigatória antes de qualquer commit

---

## 1. Matriz de Riscos Global

| ID | Risco | Prob | Impacto | Score | Dono |
|----|-------|------|---------|-------|------|
| R01 | Agente commita em `main` em vez do branch docs | Alta | Alto | 🔴 CRÍTICO | Orquestrador |
| R02 | Contrato de verbos divergente entre evo e zapp | Alta | Alto | 🔴 CRÍTICO | A3 + A7 |
| R03 | Grafo desatualizado — A6/A7/A8 navegam deps erradas | Alta | Médio | 🟠 ALTO | E1 |
| R04 | Tocar arquivo HISTÓRICO datado (auditoria, cutover) | Média | Alto | 🟠 ALTO | Todos |
| R05 | ADR-006 SUPERSEDED reescrito em vez de anotado | Média | Alto | 🟠 ALTO | A7 |
| R06 | Regressão: callEvolutionApi "removido" de volta | Baixa | Alto | 🟠 ALTO | A5/A7 |
| R07 | ESTADO.md perde inventário de edge fns (varredura real) | Média | Médio | 🟡 MÉDIO | A4 |
| R08 | evolution-stack branch só local — commits perdidos no push | Média | Médio | 🟡 MÉDIO | A1-A3 |
| R09 | TECHNICAL_DOCUMENTATION.md (91KB) editado com churn | Alta | Médio | 🟡 MÉDIO | A6 |
| R10 | BOUNDARY-zapp.md criado com verbos incorretos | Média | Alto | 🟠 ALTO | A3 |
| R11 | docs/decouple/HANDOFF datados tratados como VIVOS | Média | Médio | 🟡 MÉDIO | A10 |
| R12 | Conflito de merge se outro agente (Hermes) commitar concomitante | Baixa | Alto | 🟡 MÉDIO | Orquestrador |
| R13 | README do evo menciona "T1-T20" mas architecture diz "T1-T6" inconsistente | Alta | Baixo | 🟢 BAIXO | A1 |
| R14 | evolution-stack/docs/architecture-atomica.md cita stack 20 (órfão morto) | Média | Baixo | 🟢 BAIXO | A1 |

---

## 2. Gaps Identificados (código vs documentação atual)

### G01 — Contagem de verbos ERRADA na orquestração
- **Estado atual**: orquestração doc A0 diz "11 verbos"
- **Real no código** (`_shared/providers/evolution/client.ts`): **12 verbos**
  - 10 nomeados: `sendText`, `sendMedia`, `sendSticker`, `getConnectionState`, `getQrCode`, `restartInstance`, `listInstances`, `listGroups`, `checkWhatsApp`, `getProfilePicture`
  - 2 genéricos: `get<T>`, `post<T>`
- **Impacto**: A3 escreve 11 no evo, A7 escreve 12 no zapp → divergência de contrato
- **Ação**: Fixar em 12 (10 + 2 genéricos) em AMBOS os docs

### G02 — Grafo stale (`a4456a08` vs HEAD `fcf2f9b6`)
- **Estado atual**: `graphify-out/GRAPH_REPORT.md` gerado do commit `a4456a08`
- **HEAD**: `fcf2f9b6` (2 commits à frente, incluindo F3-edge RPCs)
- **Impacto**: A6/A7/A8 podem mapear dependências erradas
- **Ação**: Rebuild obrigatório (E1, já disparado em background)

### G03 — ADR-006 não atualizado pós-desacoplamento
- **Estado atual**: marcado `SUPERSEDED (2026-07-15)`, descreve dual-Supabase que não existe mais
- **Real**: single self-hosted Supabase, gateway pattern ADR-009
- **Impacto**: ADR referenciado por A7 ainda contradiz a realidade
- **Ação**: Adicionar bloco "Situação 2026-08-13 pós-desacoplamento" apontando para ADR-009 (não reescrever)

### G04 — ESTADO.md com data pré-desacoplamento
- **Estado atual**: "Última verificação: 2026-08-08" — 4 dias antes do desacoplamento (2026-08-12)
- **Impacto**: Leitores pensam que o inventário de edge fns reflete o estado atual
- **Ação**: Adicionar blurb "Nota pós-desacoplamento 2026-08-12" sem alterar inventário (que foi varredura real)

### G05 — evolution-stack sem branch remote `docs/pos-desacoplamento-20260814`
- **Estado atual**: branch existe só localmente (não em `origin/`)
- **Impacto**: commits A1-A3 ficam locais, PR não abre
- **Ação**: `git push -u origin docs/pos-desacoplamento-20260814` ao final de A3

### G06 — `callEvolutionApi` em testes (não é bypass, mas confunde)
- **Estado atual**: removido de produção (`whatsappConnectionRepository.ts` linha 90, comentário), mas ainda em mocks de teste
- **Impacto**: docs dizem "removido" mas grep encontra o nome → agentes confusos
- **Ação**: A7/A5 docume: "callEvolutionApi = @deprecated, removido de runtime, presente apenas em mocks de teste legado"

### G07 — docs/HANDOFF-2026-08-12 no evo lista pendências que foram resolvidas
- **Estado atual**: `[~] Portainer GitOps git-backed: inviável no CE 2.39.5 — substituído`
- **Real**: gitops-watchdogs.yml implementado e funcionando
- **Ação**: A3 atualiza status para `[x]` com data de resolução

### G08 — architecture-atomica.md cita "stack 20 (órfão morto 23/04)"
- **Estado atual**: doc descreve Postgres direto da Evolution (stack 20) como "órfão morto"
- **Real**: toda gravação vai agora para Supabase self-hosted via consumer
- **Ação**: A1 atualiza para refletir estado atual (stack 20 descomissionado, schema evo no self-hosted)

### G09 — BOUNDARY-zapp.md NÃO EXISTE em evolution-stack
- **Estado atual**: arquivo planejado por A3 mas não criado
- **Real**: precisa ser criado do zero
- **Ação**: A3 cria `docs/BOUNDARY-zapp.md` com os 12 verbos + RPCs + eventos webhook

### G10 — TECHNICAL_DOCUMENTATION.md (91KB) tem seções desatualizadas
- **Estado atual**: Descreve Evolution como componente embutido no zapp
- **Real**: Evolution é serviço externo (evolution-stack)
- **Ação**: A6 cirurgia mínima: atualizar apenas seções "Evolution API" e "Infraestrutura", não reescrever o documento inteiro

---

## 3. Simulação por Agente — Falhas Previstas e Mitigações

### A1 (evo — Núcleo)
**Falha prevista**: Confundir `T1-T20` (patches do Dockerfile) com `T1-T6` (topology levels).
- README atual diz "Patches T1-T20" → verificar `image/build-patches-2.4.mjs` para count real
- **Gate**: Número de patches = número de funções em `image/build-patches-2.4.mjs`

**Falha prevista**: Preservar referência "stack 20" do arquivo architecture-atomica.md como dado atual
- **Gate**: Confirmar stack 20 está descomissionado antes de editar

### A2 (evo — Ops)
**Falha prevista**: Runbooks que referenciam scripts movidos (ex: `evo-forceupdate.sh`) com caminhos antigos do zapp
- **Gate**: grep em todos os runbooks por paths `/workspace/repos/zapp-web-v3` ou `adm01-debug/zapp-web-v3/scripts/`

**Falha prevista**: WATCHDOG_DEPLOY_SOP.md pode referenciar stacks inexistentes
- **Gate**: Verificar que todos os Stack IDs no runbook batem com `stacks/README.md`

### A3 (evo — Fronteira)
**Falha prevista**: BOUNDARY-zapp.md com verbos errados (11 em vez de 12)
- **Mitigação**: usar a lista canônica da seção 5 abaixo. Não contar — copiar.
- **Gate**: `grep -c 'evolutionClient\.' docs/BOUNDARY-zapp.md` = 12

**Falha prevista**: ADR-004 reescrito em vez de anotado
- **Regra**: ADR-004 é HISTÓRICO de decisão — adicionar apenas bloco "Status 2026-08-13" ao final

### A4 (zapp — Topo)
**Falha prevista**: ESTADO.md perde dados de inventário (varredura de 2.911 arquivos, 107 edge fns)
- **Regra RÍGIDA**: Não remover nenhuma tabela ou linha da seção inventário. Só adicionar nota de contexto no topo.
- **Gate**: `wc -l ESTADO.md` deve aumentar, nunca diminuir.

**Falha prevista**: CHANGELOG.md perde entries históricas
- **Regra**: Adicionar nova entry no TOPO. Não mover/remover entries anteriores.

### A5 (zapp — Context)
**Falha prevista**: CLAUDE.md perde regras de trabalho específicas do zapp
- **Gate**: Comparar seção "Regras" antes/depois. Não remover rules, apenas adicionar/anotar.

### A6 (zapp — Arquitetura)
**Falha prevista**: TECHNICAL_DOCUMENTATION.md reescrito em vez de atualizado cirurgicamente
- **Regra RÍGIDA**: diff deve mostrar `<100 linhas modificadas` no TECHNICAL_DOCUMENTATION.md. Se maior, pare e revise.
- **Gate**: `git diff --stat HEAD -- docs/TECHNICAL_DOCUMENTATION.md` → lines changed < 100

**Falha prevista**: Grafo ainda stale quando A6 executar
- **Check**: `cat /tmp/graph_rebuild.log | grep GRAPH_DONE` antes de A6

### A7 (zapp — Contrato)
**Falha prevista**: EVOLUTION_API_REFERENCE.md (38KB) reescrito do zero perdendo referências de endpoints válidos
- **Regra**: Adicionar seção "Acesso pós-desacoplamento" no topo. Não remover tabelas de endpoints existentes.

**Falha prevista**: ADR-006 reescrito (perda de histórico de decisão)
- **Regra**: Adicionar bloco "Situação 2026-08-13" ao final do ADR-006. ADRs são imutáveis na parte histórica.

### A8 (zapp — DB)
**Falha prevista**: ADR-DB-002 (57KB de análise + inventário) modificado perdendo inventário de 20 funções
- **Regra RÍGIDA**: ADR-DB-002 é HISTÓRICO de análise (2026-08-06). Banner só. Zero edição de conteúdo.
- **Gate**: `git diff --stat HEAD -- docs/db/adrs/ADR-DB-002*` → zero changes ou apenas 1-2 linhas (banner)

### A9 (zapp — Infra)
**Falha prevista**: PORTAINER_ZAPP_FOOTPRINT.md inclui stacks da Evolution que foram movidos
- **Gate**: Verificar que nenhum stack 25/113/126/225/230/234/236 aparece no doc PORTAINER_ZAPP_FOOTPRINT.md como "pertencente ao zapp"

### A10 (zapp — Consolidação)
**Falha prevista**: FEATURE_REGISTRY.md (26KB) perde features catalogadas ao ser "atualizado"
- **Regra**: Apenas adicionar features novas ao registry. Não remover.

**Falha prevista**: ARCHIVE_INDEX.md marca docs VIVOS como histórico
- **Gate**: Todo arquivo listado como HISTÓRICO deve ter data no nome ou estar em `docs/_archive/` ou `docs/history/`

---

## 4. Dependências entre Etapas (grafo de bloqueio)

```
E1 (rebuild grafo) ──blocks──► E19 (A6), E21 (A7), E23 (A8)
E2 (branches) ────blocks──► tudo
E4 (contrato canônico) ──blocks──► E12 (A3 BOUNDARY-zapp.md), E21 (A7 BOUNDARY-evolution.md)
E5-E7 (A1) ──blocks──► E8-E10 (A2)  [sequential no mesmo repo]
E8-E10 (A2) ──blocks──► E11-E13 (A3)
E14-E16 (A4) ──parallel──► E5-E13 (evo) [repos independentes]
```

---

## 5. Contrato Canônico — 12 Verbos do Gateway (LOCK)

> Este bloco é a fonte-de-verdade. A3 e A7 copiam exatamente este texto nos seus docs.
> Não editar abaixo desta linha neste arquivo.

```
Gateway: supabase/functions/_shared/providers/evolution/client.ts
Todos os acessos HTTP à Evolution API passam OBRIGATORIAMENTE por este gateway.
ZERO acesso direto a EVOLUTION_API_URL de outros módulos. (inventory.mjs = 0 bypasses)

VERBOS DE ALTO NÍVEL (evolutionClient.*):
  1. sendText(instance, number, text)           → POST message/sendText/{instance}
  2. sendMedia(instance, payload)               → POST message/sendMedia/{instance}
  3. sendSticker(instance, number, stickerUrl)  → POST message/sendSticker/{instance}
  4. getConnectionState(instance)               → GET  instance/connectionState/{instance}
  5. getQrCode(instance)                        → GET  instance/connect/{instance}
  6. restartInstance(instance)                  → DELETE instance/restart/{instance}
  7. listInstances()                            → GET  instance/fetchInstances
  8. listGroups(instance)                       → GET  {instance}/group/findGroups
  9. checkWhatsApp(instance, numbers[])         → POST chat/whatsappNumbers/{instance}
 10. getProfilePicture(instance, number)        → GET  chat/fetchProfilePictureUrl/{instance}

VERBOS GENÉRICOS (escape hatches):
 11. get<T>(path)                               → GET  /{path} qualificado
 12. post<T>(path, body)                        → POST /{path} qualificado

EGRESSO VIA POSTGRES (não HTTP):
  - rpc_claim_outbound_message(msg_id, instance, number, payload)
  - rpc_update_incoming_message(msg_id, status, error_code)
  - Normalizer canônico: fn_process_whatsapp_message (edge fn evolution-webhook v10)

ESQUEMAS DB:
  - `evo.*`  → propriedade Evolution / consumer RabbitMQ (READ por zapp via views contrato)
  - `zapp.*` → propriedade zapp / negócio (READ por evo só para monitoria — ADR-DB-002)
```

---

## 6. Política VIVO × HISTÓRICO (gate final de A10)

### VIVOS (atualizar — A4-A10 podem editar):
zapp: README, ESTADO, PLANO-ESTADO, CHANGELOG (nova entry no topo), CONTRIBUTING, CLAUDE, AGENTS, HERMES, .hermes, .claude/skills, .agents/skills, docs/TECHNICAL_DOCUMENTATION, docs/ARCHITECTURE_AND_FLOW, docs/BOUNDARY-evolution, docs/API_CONTRACT, docs/INTEGRATION_INVARIANTS, docs/EDGE_CONTRACT_VALIDATION, docs/EVOLUTION_API_REFERENCE (header only), docs/INFRA, docs/INVENTARIO_INFRA, docs/DEPLOYMENT, docs/OPERACAO_BUILD_DEPLOY_V3, docs/PORTAINER_ZAPP_FOOTPRINT, docs/db/{SCHEMA-CONTRACT,schemas/,FUNCTIONS,CRONS,EXTERNAL-DEPENDENCIES}, docs/db/adrs (apenas banner), docs/README (índice), docs/decouple/* (finalizar), FEATURE_REGISTRY (nova entry), novo DECOUPLING.md raiz

evo: README, CLAUDE, docs/architecture-atomica, image/README, stacks/README, db/README, todos os runbooks, docs/GITOPS, swarm-configs/README, consumer/REMEDIATION-hmac, docs/SETTINGS, docs/decisions/ADR-004 (append only), docs/EVOLUTION-CHANGELOG (nova entry), docs/HANDOFF-pendencias-pos-cutover (atualizar status), novo docs/BOUNDARY-zapp.md

### HISTÓRICOS (banner de 1 linha no máximo, zero edição de conteúdo):
zapp: docs/history/*, docs/_archive/*, docs/cutover/*, EVOLUTION_API_AUDIT_2026-*.md (15 arquivos), AUDITORIA_*_2026-*.md, docs/db/adrs/ADR-DB-002 (análise datada), HANDOFF_EVOLUTION_SECURITY_2026-04-12.md, qualquer session log datado

evo: docs/HANDOFF-2026-08-12-pendencias-pos-cutover (VIVO — status updates ok; seção de histórico de commits = HISTÓRICO)

---

## 7. Protocolo de Rollback

Se qualquer agente produzir diff problemático:
```bash
# Reverter último commit do agente
cd /workspace/repos/<REPO>
git revert HEAD --no-edit
# OU reset se não pushado:
git reset HEAD~1 --soft
```

Commit ok = todos esses critérios:
1. `git diff --stat HEAD~1 HEAD` mostra only .md files
2. Nenhum arquivo fora do escopo do agente aparece no diff
3. Nenhum arquivo HISTÓRICO teve mais que 2 linhas modificadas
4. Sem --force-push na branch docs/

