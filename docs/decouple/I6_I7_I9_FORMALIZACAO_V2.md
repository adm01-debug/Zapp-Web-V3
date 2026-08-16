# I6 / I7 / I9 — Formalização v2 (PASS + evidência + fechamento)

> **Status:** scoreboard v2. Enquanto o sweep de `.github/workflows` de outro agente estiver em andamento, o `measure-invariants.yml` continua medindo com a **semântica v1** (advisory). Nenhum resultado v1 é comparado com v2.
> **Data:** 2026-08-16 · **Escopo:** apenas este documento (`docs/decouple/`).

---

## 1. Definição de PASS (semântica v2)

| ID | Definição v2 (PASS quando TODOS os itens) |
|---|---|
| **I6 — Soberania de deploy** | 100% dos stacks Swarm do namespace Evolution estão versionados em `evolution-stack/stacks/` **e** mapeados no STACK_MAP do `gitops-stacks.yml` (ID → arquivo → guardrail). Zero stack "deploy via UI" ou conhecido só por snapshot. |
| **I7 — Dono de migrations evo** | (a) gate **E43** ativo com runs verdes recentes; (b) **ADR-015** publicado (dono + fluxo de migrations `evo.*`); (c) **gate espelho** no `zapp-web-v3` bloqueando DDL `evo.*` em migrations do repo zapp (cobre o inverso do E43). |
| **I9 — Troca de provider** | **Prova estrutural:** (a) `whatsappAdapter.ts` com `case 'cloud'` em todos os verbos + grupos `@g.us` sempre evolution; (b) `resolveTransport()` com 3 estados (unofficial→evolution; official+creds→cloud; official sem creds→degraded); (c) testes de paridade mock verdes; (d) contrato Zod (`parseOrReject`/`CONTRACT_SCHEMAS`) na edge `whatsapp-cloud-send`; (e) harness denotest W10 (67 tests). Smoke real com credencial Meta = bônus, não requisito. |

## 2. Evidência necessária por invariante

- **I6:** STACK_MAP com 100% dos IDs (incl. 230, 232, postgres); arquivo versionado em `stacks/` para cada stack; snapshot Portainer reconciliado runtime×repo; run verde do `gitops-stacks.yml` após deploy via pipeline.
- **I7:** runs `completed/success` recentes do E43 (`gh run list --workflow zapp-ddl-gate.yml`); conteúdo/link do ADR-015 (localizar nos 3 dirs de ADR antes de afirmar); PR do gate espelho mergeado + 1 run verde.
- **I9:** teste de paridade verde no CI; contrato Zod presente na edge; harness W10 ok; (bônus) log de envio real via `whatsapp-cloud-send` com credencial Meta.

## 3. Estado real hoje (2026-08-16)

- **I6 — PARCIAL.** STACK_MAP cobre 10 stacks (25, 113, 238, 240, 262, 264, 225, 254, 255, 259). **Faltam: 230** (whatsapp-watchdog, deploy via UI), **232** (ag6-watchdogs, existe só no snapshot 2026-08-14), **postgres.yml** (sem ID). Obs.: 265 (zapp-functions-health) citado no CLAUDE.md sem arquivo — investigar junto.
- **I7 — MECANISMO PRONTO.** E43 **ativo** (3 runs verdes 2026-08-16); **ADR-015 existe**. **Pendente:** gate espelho zapp (E43 é grep que só pega DDL `zapp.*` — gap conhecido).
- **I9 — ESTRUTURALMENTE PRONTO.** Adapter dual-mode + transport + testes + zod + harness OK. **Pendente:** credencial Meta (`WHATSAPP_CLOUD_ACCESS_TOKEN`/`WHATSAPP_CLOUD_PHONE_NUMBER_ID`) para a prova de fogo — não bloqueia PASS estrutural.

## 4. Plano de fechamento (ordem)

1. **I6:** versionar composes de 230/232/postgres em `evolution-stack/stacks/` (fora da zona proibida). ⚠️ O STACK_MAP vive em `.github/workflows/gitops-stacks.yml` → **edição do mapa fica bloqueada até o sweep terminar**. Deixar composes prontos e reconciliar com snapshots Portainer.
2. **I7:** ADR-015 já publicado ✓. Criar o gate espelho (novo workflow no `zapp-web-v3` — zona proibida). ⚠️ **Merge só após o sweep terminar.**
3. **I9:** solicitar credencial Meta e rodar o smoke real como bônus. PASS estrutural já declarável — anexar evidência ao PR do scoreboard.
4. **Scoreboard v2:** atualizar `measure-invariants.yml` (zapp-web-v3) com a semântica v2 **somente DEPOIS** que o sweep de workflows terminar. Até lá: scoreboard roda v1, sem misturar métricas.

## ⛔ ZONA PROIBIDA (vigente durante o sweep)

- `.github/workflows/**` de TODOS os repos (evolution-stack, zapp-web-v3, atomica-platform): não criar, editar, commitar nem mergear workflows até o sweep concluir.
- Nenhuma operação git neste workspace; entrega é apenas este documento.

## Regra de ouro

Ao reportar "PASS", cite a versão da semântica (v1 = medida atual do scoreboard; v2 = esta formalização). I6/I7/I9 mudaram de significado — "9/9 v1" ≠ "9/9 v2".
