# Orquestracao — Atualizacao de Documentacao Pos-Desacoplamento (Zapp <-> Evolution)

- Data: 2026-08-14
- Branch: docs/pos-desacoplamento-20260814 (ambos os repos)
- Escopo: zapp-web-v3 + evolution-stack
- Coordenacao: 10 agentes especializados, execucao sequencial em branch unica, commit --no-verify, diff verificado pelo orquestrador por agente.

## 1. Objetivo

Reconciliar toda a documentacao VIVA dos dois sistemas com o estado pos-desacoplamento. NAO reescrever registros historicos (auditorias datadas, session logs, cutover reports, docs/_archive/, docs/history/) — sao imutaveis; no maximo recebem um banner apontando para o doc canonico quando forem enganosos.

## 2. Modelo do desacoplamento (resumo canonico)

Duas camadas:

### 2.1 Separacao de repositorio/infra (2026-08-12/13)
Saiu de zapp-web-v3 -> evolution-stack:
- Servidor Evolution API (Dockerfile, build-patches T1-T6, docker-entrypoint) -> imagem ghcr.io/adm01-debug/evolution-stack/evolution-api-custom
- Consumer RabbitMQ->Supabase (consumer/) -> imagem ghcr.io/adm01-debug/evolution-stack/evolution-rabbit-consumer
- Stacks Portainer (stacks/evolution*.yml), 61 swarm-configs, watchdogs, scripts operacionais, workflows de build, GitOps, runbooks de infra, ADR-004.

Ficou em zapp-web-v3:
- Adapters/hooks/libs TS cliente (src/adapters|hooks|lib/evolution*), edge functions supabase/functions/evolution-*, migrations *evolution*, testes.

### 2.2 Desacoplamento de runtime (gateway pattern — ADR-009)
- Toda saida HTTP para a Evolution passa por gateway unico supabase/functions/_shared/providers/evolution/client.ts (11 verbos). 17 edge fns que liam EVOLUTION_API_URL direto -> 1 gateway. inventory.mjs = 0 bypasses.
- Cliente do app React usa whatsappAdapter; callEvolutionApi @deprecated/removido.
- Egresso adicional via Postgres: writes de mensagem via RPCs (rpc_claim_outbound_message, rpc_update_incoming_message) + normalizer canonico. Fronteira de schema evo (Evolution) vs zapp (negocio).
- CI guard decouple-guard.yml (E22) impede regressao.

## 3. Fontes-de-verdade (todo agente le antes de editar)

zapp:
- docs/decouple/HANDOFF_POS_DESACOPLAMENTO_20260813.md
- docs/decouple/HANDOFF.md, HANDOFF_FINAL_20260813.md
- docs/decouple/ADR-008-canonical-domain-model.md, ADR-009-gateway-pattern.md
- docs/BOUNDARY-evolution.md
- docs/db/adrs/ADR-DB-002-fronteira-zapp-evo.md, ADR-DB-004-fks-zapp-evo-e-cross-modulo.md
- graphify-out/GRAPH_REPORT.md (rebuild 2026-08-14 @ HEAD)
- codigo real (src/, supabase/functions/) — validar, nao presumir

evolution-stack:
- README.md, docs/HANDOFF-2026-08-12-pendencias-pos-cutover.md
- docs/decisions/ADR-004-evolution-api-webhook-bridge.md
- docs/architecture-atomica.md, docs/GITOPS.md, swarm-configs/README.md

## 4. Politica de escopo por arquivo
- VIVO (atualizar): README, ESTADO, HERMES, CLAUDE, AGENTS, docs de arquitetura/contrato/infra/db/ops atuais, ADRs de fronteira, indices.
- HISTORICO (NAO reescrever): docs/history/, docs/_archive/, docs de auditoria datados, EVOLUTION_API_AUDIT_2026-*, docs/cutover/, session/simulation logs datados. Acao permitida: 1 linha de banner apontando para o doc canonico.

## 5. Matriz de agentes

| # | Repo | Dominio | Alvos principais |
|---|---|---|---|
| A1 | evolution-stack | Nucleo & Arquitetura | README.md, CLAUDE.md, docs/architecture-atomica.md, image/README.md, stacks/README.md, db/README.md |
| A2 | evolution-stack | Ops & Runbooks | runbooks/*, docs/GITOPS.md, swarm-configs/README.md, consumer/REMEDIATION-hmac.md |
| A3 | evolution-stack | Fronteira & Changelog | docs/decisions/ADR-004, docs/SETTINGS.md, docs/EVOLUTION-CHANGELOG.md, docs/HANDOFF-...pos-cutover, novo docs/BOUNDARY-zapp.md |
| A4 | zapp-web-v3 | Docs canonicos de topo | README.md, ESTADO.md, PLANO-ESTADO.md, CHANGELOG.md, CONTRIBUTING.md |
| A5 | zapp-web-v3 | Context docs de agente | CLAUDE.md, AGENTS.md, HERMES.md, .hermes.md, .claude/skills, .agents/skills, .codex/AGENTS.md |
| A6 | zapp-web-v3 | Arquitetura & fluxo | docs/TECHNICAL_DOCUMENTATION.md, docs/ARCHITECTURE_AND_FLOW.md, docs/architecture/JORNADA_MENSAGEM_WHATSAPP.md, evolution-api-mapping.md, edge-functions.md, ARQUITETURA_INSTANCIAS_TRANSFERENCIAS.md |
| A7 | zapp-web-v3 | Contrato de integracao & boundary | docs/API_CONTRACT.md, docs/EVOLUTION_API_REFERENCE.md, docs/BOUNDARY-evolution.md, docs/arquitetura/zapp-facade-layer.md, edge-auth.md, docs/decisions/ADR-006, docs/INTEGRATION_INVARIANTS.md, docs/EDGE_CONTRACT_VALIDATION.md |
| A8 | zapp-web-v3 | Banco & fronteira DB | docs/db/SCHEMA-CONTRACT.md, docs/db/adrs/*, docs/db/schemas/{evo,zapp,ops}.md, docs/db/FUNCTIONS.md, CRONS.md, EXTERNAL-DEPENDENCIES.md, docs/SCHEMA_REFERENCE.md |
| A9 | zapp-web-v3 | Infra, deploy & ops | docs/INFRA.md, docs/INVENTARIO_INFRA.md, docs/DEPLOYMENT.md, docs/OPERACAO_BUILD_DEPLOY_V3.md, docs/PORTAINER_ZAPP_FOOTPRINT.md, infra/runbooks/*, docs/ops/*, docs/runbooks/APPLY_ZAPP_EVOLUTION_BRIDGES.md |
| A10 | zapp-web-v3 | Consolidacao, ADRs & indice | docs/decouple/* (finalizar), FEATURE_REGISTRY.md, docs/README.md, docs/history/ARCHIVE_INDEX.md, novo DECOUPLING.md (raiz) |

## 6. Protocolo de execucao
1. Rebuild grafo zapp (feito 2026-08-14) antes de A4-A10.
2. Cada agente: le fontes (secao 3) -> edita so alvos do dominio -> diff minimo, sem churn -> commit git commit --no-verify -m docs(decouple): A<N> <dominio>.
3. Orquestrador valida o diff de cada agente antes de marcar OK.
4. Um PR por repo ao final.

## 7. Status
| Agente | Estado |
|---|---|
| A0 orquestracao | ✅ OK |
| A1 nucleo & arquitetura (evo) | ✅ OK — 2026-08-14 |
| A2 ops & runbooks (evo) | ✅ OK — 2026-08-14 |
| A3 fronteira & changelog (evo) | ✅ OK — 2026-08-14 (BOUNDARY-zapp.md criado) |
| A4 docs de topo (zapp) | ✅ OK — 2026-08-14 |
| A5 context de agente (zapp) | ✅ OK — 2026-08-14 |
| A6 arquitetura & fluxo (zapp) | ✅ OK — 2026-08-14 |
| A7 contrato & boundary (zapp) | ✅ OK — 2026-08-14 |
| A8 banco & DB (zapp) | ✅ OK — 2026-08-14 |
| A9 infra & deploy (zapp) | ✅ OK — 2026-08-14 |
| A10 consolidacao & indices (zapp) | ✅ OK — 2026-08-14 |
