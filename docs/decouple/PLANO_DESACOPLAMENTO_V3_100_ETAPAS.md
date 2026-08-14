# PLANO V3 — Desacoplamento Zapp Web V3 ↔ Evolution API · 100 etapas finais

**Data:** 2026-08-14 · **Autor:** Hermes (análise exaustiva pós-V1/V2) · **Baseline medido:** ver `RELATORIO_VALIDACAO_MIGRACAO_20260814.md` §3
**Escopo:** fechar os 12 resíduos reais. NÃO refazer o que está pronto (74 tabelas migradas, 4 portas fechadas, health A+).
**Convenção:** `[R]` reversível sem deploy · `[D]` deploy/DDL · `[!]` toca produção · `[⛔]` requer APROVADO de Joaquim.
**Regras de ouro:** worktree isolado por AGENTS.md · 1 arquivo/fix por commit · `--no-verify` · PR por fase · nunca desligar Evolution em prod · banco é fonte de verdade.

---

## F0 · Baseline e rede de segurança (1–10) — [R], 1 dia

1. [R] Tag `decouple-v3-baseline` em zapp-web-v3 (`fcf2f9b`) **e** em evolution-stack (`2b230c9`) — fecha resíduo 9.
2. [R] Registrar digests de prod no `docs/decouple/BASELINE.md`: evolution `6f9f1d35`, consumer `75210b9f`, web `production-b87b4e9718a5` (já medidos).
3. [R] Snapshot da tabela `ops.fn_bodies_backup` (INSERT dos 6 corpos atuais: `fn_outbound_dispatch`, `fn_reconcile_dispatch`, `fn_notify_critical_alerts`, `fn_sync_lid_from_api`×2, `fn_validate_whatsapp_connection_url`×2, `fn_evo_url`, `fn_evo_key`).
4. [R] Refresh do critério de abort: erro de envio >1%, DLQ >0 novos, p95 >2× baseline, health <95 — registrar em `BASELINE.md`.
5. [R] Rodar `node scripts/decouple/inventory.mjs` e `ownership-gate.mjs` — arquivar saída verde como golden da fase.
6. [R] Medir e registrar: msgs/24h (5.077), DLQ (0), health (100.0 A+) — números de hoje viram baseline oficial do V3.
7. [R] Verificar chamadores restantes de `rpc_upsert_contact` (PostgREST positional × named) e registrar veredito (S10).
8. [R] Branch `feat/decouple-v3` criada a partir de worktree isolado (protocolo AGENTS.md).
9. [R] PR de F0 aberta (docs+branch) — merge rápido, sem tocar código.
10. [R] Conferir CI verde do PR (decouple-guard + ownership-gate + build) antes do merge.

## F1 · Hardening dos gates — travar a vitória (11–20) — [R], 1–2 dias

11. [R] Inventariar TODOS os arquivos que casam nas 3 métricas do inventory por comentário/string (tooling: `eslint.config.js`, `inventory.mjs`, testes, docs) — whitelist explícita.
12. [R] Extender `inventory.mjs` com **métrica 4**: front construindo URL Evolution direta (`VITE_EVOLUTION_API_URL`, `fetch(...evolution.../message/send...)`) fora de `src/lib/whatsappAdapter*` — fecha o buraco da classe zombie (resíduo 2).
13. [R] Atualizar `BASELINE` do inventory para o estado real: 0/0/0/0 e delta medido contra o baseline histórico (9/0/6).
14. [R] `decouple-guard.yml`: threshold de `>15` → `>0` com whitelist de tooling (S1) — qualquer bypass novo bloqueia PR.
15. [R] Promover ESLint decouple (`no-restricted-syntax` invoke + import evolutionExternal) de `warn` → `error` (resíduo 3).
16. [R] Gate SQL refinado: contar fns com `net.http_(get|post)` + leitura direta de `vault.decrypted_secrets WHERE name='evolution_api_url'` fora do whitelist `{fn_evo_url, fn_evo_key}` — mata falso-positivo de strings de erro.
17. [R] Rodar `npx vitest run` + `deno check` nas edge fns tocadas — CI local verde antes do PR.
18. [R] PR F1 → main; verificar decouple-guard passando com TOTAL=0.
19. [R] Testar o guard deliberadamente (PR dummy com 1 bypass) — deve FALHAR; registrar prova.
20. [R] Reverter o teste do passo 19 e arquivar evidência.

## F2 · Zombie coupling — extirpar os clientes mortos (21–30) — [R][D], 1–2 dias

21. [D] Auditar importadores reais de `src/integrations/zappweb/evolutionClient.ts` e `src/lib/healthCheck.ts` (hoje: 0 vivos; `supabaseClient.ts` é ele próprio sem importadores).
22. [R] Varrer bundle de prod (`zapp-web-prod_web`): `grep` nos assets JS por `evolutionClient`/`healthCheck`/`VITE_EVOLUTION_API_URL` — confirmar ausência no bundle servido (S2).
23. [D] Arquivado: healthCheck.ts → src/_archive/ com banner deprecação (2026-08-14) `evolutionClient.ts`, `healthCheck.ts` e `supabaseClient.ts` (zappweb) para `src/_archive/` com banner de deprecação — sem delete físico neste ciclo.
24. [D] VITE_EVOLUTION_API_URL e VITE_EVOLUTION_API_KEY marcados DEPRECATED em .env.example (2026-08-14) e `docs/ENV_SETUP.md` (ou marcar deprecated com ponteiro para `_shared/providers/evolution/client.ts`).
25. [R] ESLint: proibir `VITE_EVOLUTION_API_URL` fora de `src/_archive/` e `whatsappAdapter`.
26. [D] Grep global concluído — 0 referências fora de _archive/adapter (2026-08-14) por classes de bypass não cobertas: `fetch(\`${...evolution`, `EVOLUTION_API_URL` em `src/` (não-supabase/functions) — inventário final.
27. [R] `IntegrationKeysSection.tsx`: conferir se exibe URL legada — trocar por status via edge `evolution-credentials`/health, sem expor env.
28. [D][!] Build + deploy do front (pipeline GitHub→GHCR→Portainer 157); smoke do inbox (enviar/receber texto na wpp2).
29. [R] Pós-deploy: re-grep no bundle servido — 0 referências a `VITE_EVOLUTION_API_URL`.
30. [R] PR F2 → main; inventory 0/0/0/0 confirmado no CI.

## F3 · Formalizar o gateway SQL (`ops.fn_evo_url`/`fn_evo_key`) (31–40) — [R][D], 1–2 dias

31. [R] Documentar em `docs/decouple/ADR-010-sql-gateway.md` o design real: resolvers únicos de url/key + regra "nenhuma fn SQL monta endpoint sem os resolvers" (substitui a prescrição `fn_provider_http` do V2 que nunca existiu).
32. [R] Capturar corpos atuais das 6 fns no `ops.fn_bodies_backup` (refresh do passo 3).
33. [R] Corrigir strings de erro que citam `evolution_api_url ausente` para `ops.fn_evo_url() ausente` — elimina os 4 falsos-positivos do gate (S7).
34. [R] Conferir `SECURITY DEFINER` + owner nas 6 fns após qualquer `CREATE OR REPLACE`.
35. [D] Criar view de auditoria `ops.v_sql_egress` (fn → provider → endpoint → último uso) para monitorar a 4ª porta.
36. [R] Gate SQL do passo 16 rodando no CI (script `scripts/decouple/sql-gate.mjs`).
37. [D][!] Validar `fn_validate_whatsapp_connection_url` (trigger de config) e `fn_sync_lid_from_api` (cron 329) pós-edição — 1 ciclo do cron.
38. [R] Cron-watch 48h: 0 falhas novas em 317/318/329/429.
39. [R] Atualizar ADR-009 com referência cruzada à ADR-010 (porta SQL é a 4ª porta do gateway pattern).
40. [R] PR F3 → main.

## F4 · Consolidação de segredos no vault (41–50) — [D][!][⛔], requer APROVADO na E46–E48

41. [R] Inventariar consumidores dos 10 secrets `evolution_*` (edge env, stack 25, consumer, SQL resolvers) — tabela secreto×consumidor.
42. [R] Classificar pares duplicados: `evolution_api_key` × `_v2`; `evolution_webhook_secret` × `webhook_secret_evolution` — decidir canônico por evidência de uso real.
43. [R] Documentar plano de consolidação em `docs/decouple/VAULT_SECRETS.md` — sem executar nada.
44. [⛔] APROVADO → expand: garantir que TODOS os consumidores leem o canônico (resolvers, stack secrets, consumer env).
45. [⛔][!] Migrar consumidor a consumidor (1 por commit); verificar cada um antes do próximo (S3).
46. [⛔][!] Rotacionar a key canônica (nova apikey na Evolution) — janela noturna; critério de abort: >1% falha de envio.
47. [⛔][!] Após 48h verdes: apagar o par obsoleto do vault; atualizar `ops.fn_bodies_backup`.
48. [⛔][!] Conferir mapping de secrets do stack 25 (`evolution_api_key_v6→v4` — G7) e normalizar alias na stack file.
49. [R] Atualizar `vault` docs + runbook de rotação (prazo, passos, rollback).
50. [R] PR F4 → main (docs + scripts); executado só com APROVADO nas etapas marcadas.

## F5 · Prova de desacoplamento — fechar F6 do V2 (51–60) — [R], 2–3 dias

51. [R] Verificar guard `DENO_ENV=test` no `registry.ts` para o fake provider (S6) — se ausente, implementar ANTES de qualquer e2e.
52. [R] Suite e2e com transport fake: inbox renderiza, envia (stub), recebe (fixture) — sem Evolution no ar (E89 do V1).
53. [R] Teste de degradação: Evolution offline (client retorna erro) → app degrada com erro explícito, render não quebra.
54. [R] Rodar suites de paridade existentes: `parity.test.ts`, `whatsapp-cloud-normalizer.test.ts`, `evolution-response-normalizers.test.ts` — verdes.
55. [R] Medir cobertura real: % de operações WhatsApp (front+edge+SQL) passando pelas 4 portas — publicar número honesto (meta 100%).
56. [R] Escrever `docs/decouple/RUNBOOK_TROCA_PROVIDER.md`: passos, tempo estimado, pontos de falha, o que NÃO está coberto (resíduo F6).
57. [R] Ensaio cronometrado de troca fake↔evolution em ambiente de teste — medir tempo real.
58. [R] Se viável: ensaio real de troca (evolution→cloud→evolution) em janela noturna com critérios de abort (S11) — [!] só com APROVADO.
59. [R] Registrar resultado medido em `docs/decouple/RETRO_V2.md` — sem sucesso fabricado (E81 do V2).
60. [R] PR F5 → main.

## F6 · Fechamento documental (61–70) — [R], 1–2 dias (alinha com orquestração A0–A10 em curso)

61. [R] Reescrever ADR-008 com o modelo canônico FINAL (não mais stub de 1.161 bytes) — tipos, mapeamento Baileys↔Meta↔canônico, coluna Postgres↔campo.
62. [R] Criar `docs/decouple/CANONICAL_COLUMN_MAP.md` (mapa coluna×campo, fonte: `src/domain/messaging/types.ts` + normalizers).
63. [R] Atualizar `docs/BOUNDARY-evolution.md` com a fronteira LÓGICA: 4 portas (adapter front, client edge, ingest-port, resolvers SQL) + o que é Grupo A/B (resíduo 8).
64. [R] Marcar HISTÓRICO (banner + link canônico, sem reescrever): `PLANO_DESACOPLAMENTO_100_ETAPAS.md` (V1), 4 HANDOFFs de 2026-08-13, `PLANO_DESACOPLAMENTO_V2_100_ETAPAS.md` (superado por este V3) (S8).
65. [R] Completar matriz A1–A10 da `DOC_UPDATE_ORCHESTRATION_20260814.md` nos docs VIVOS restantes (README, ESTADO, docs de arquitetura).
66. [R] Índice canônico `docs/decouple/README.md` — 1 entrada por doc, marcando vivo/histórico.
67. [R] Atualizar `README.md` do zapp: seção "Integrações → WhatsApp" aponta para ADR-009/010 + BOUNDARY.
68. [R] Atualizar `FEATURE_REGISTRY.md`/`CHANGELOG.md` com o desacoplamento como marco (data, números).
69. [R] PR F6 → main (docs apenas).
70. [R] Verificar que nenhum doc VIVO referencia "relicto da fase Lovable" ou estado pré-desacoplamento sem banner.

## F7 · Governança de infra no evolution-stack — G4/G5/G6/G7 (71–80) — [⛔][D][!], só com APROVADO

71. [⛔][R] Snapshot das configs atuais de `evolution-security-guardian` e `evolution-pgbackrest-backup` (`docker service inspect` → salvar em `stacks/snapshots/`) (S4).
72. [⛔][D][!] G4a: `evolution-security-guardian` como stack versionada (`stacks/evolution-security-guardian.yml`) — deploy e verificação do heartbeat.
73. [⛔][D][!] G4b: `evolution-pgbackrest-backup` como stack versionada — conferir agendamento pós-redeploy.
74. [⛔][D] G5: imagem base de watchdog com bash/psql/curl/jq embutidos (Dockerfile em `image/watchdog-base/`) — build + push GHCR.
75. [⛔][D][!] Migrar 1 serviço watchdog por commit para a base nova, soak entre eles (S5): ordem trap-check → purge-errors → purge-liveness → webhook-check → drift-check.
76. [⛔][D] G6: preencher `EXPECTED_DIGEST` no `portainer-drift-check.sh` (evolution `6f9f1d35`, consumer `75210b9f`) e validar alerta sintético.
77. [⛔][R] G7: normalizar alias `evolution_api_key_v6→v4` (conclui F4 E48) e documentar na rotação.
78. [⛔][R] Contrato-test dos 11 verbos do gateway ANTES de qualquer upgrade Evolution 2.4.0-rc2 (S12) — registrar resultado.
79. [R] Corrigir README/architecture do evolution-stack: stack IDs reais (purge 238, watchdogs 240, functions-health 239) e tags/releases (resíduo 9/12).
80. [R] PR F7 → main no evolution-stack; CI dos workflows GitOps verde.

## F8 · Higiene de repo e fechamento de gaps antigos (81–90) — [R], 1 dia

81. [R] Recriar `check-publish-evo-fallbacks` em `evolution-stack/image/tests/` com paths corretos (G1 — resíduo 10).
82. [R] Conferir `zero-success-rate-workflows.md` do zapp: workflows com 0% sucesso — arquivar ou corrigir (não é desacoplamento, mas CI morto polui o gate).
83. [R] Branches zumbis (resíduo 11): conferir PRs/estado e deletar `feat/decouple-v2`, `feat/decouple-provider`, `chore/remove-evolution-infra-to-evolution-stack`, `docs/pos-desacoplamento-20260814` (S9).
84. [R] Conferir CODEOWNERS dos 2 repos (boundary: evolution-stack = infra; zapp = app/edge).
85. [R] Auditar `scripts/decouple/ownership-gate.mjs` vs `inventory.mjs`: sobreposição, consolidar num único runner CI.
86. [R] `deno.json`/`bun.lock`/`package.json`: conferir deps órfãs pós-arquivo (F2) e `supabase-js` pinado (commit 6ab75df).
87. [R] Rodar suite completa do repo 1× (vitest + deno check) e arquivar resultado como baseline de CI.
88. [R] PR F8 → main.
89. [R] Verificar e2e `e2e-evolution-vps.yml`: asserts de infra pertencem ao evolution-stack (E21 do V1) — mover se ainda estiver.
90. [R] CHANGELOG dos 2 repos sincronizado com os marcos reais.

## F9 · Validação exaustiva independente e fechamento (91–100) — [R][!], 2 dias

91. [R] Onda de 10 agentes paralelos (estilo Joaquim): cada um valida 1 frente com EVIDÊNCIA FRESCA (não docs): DB, Portainer, repo×prod digests, bundle front, edge runtime, vault, crons, evolution-stack GitOps, CI gates, docs.
92. [R] Consolidar as 10 evidências em `docs/decouple/VALIDACAO_V3.md` (1 seção por agente, screenshot/query/output).
93. [R] Reconferir os 4 gates: inventory 0/0/0/0 · SQL egress whitelist · CI threshold 0 · grants authenticated em `evo.evolution_*` = 0.
94. [R] Reconferir saúde: health score A+, msgs/24h ≈ baseline, DLQ 0, wpp2 `open`.
95. [R] Rodar `decouple-guard.yml` + `ownership-gate.yml` num PR sintético de verificação — verdes.
96. [R] Validar chamadores de `rpc_upsert_contact` pós-E93 (S10) e registrar.
97. [R] Scorecard 10/10 (modelo Joaquim): 10 dimensões × nota com evidência — publicar em `docs/decouple/SCORECARD_V3.md`.
98. [R] PR final `feat/decouple-v3` → main; CI verde; merge squash (protocolo AGENTS.md).
99. [R] Retro `docs/decouple/RETRO_V3.md`: números medidos, tempo real, o que ficou de fora (explícito).
100. [R] Encerramento: deletar branch + worktree (cleanup AGENTS.md), marcar V3 como doc canônico do desacoplamento.

---

## Modelo de execução (estilo Joaquim — ondas, simulação, scorecard)

| Fase | Risco | Modo | Agentes paralelos | Gate de entrada |
|---|---|---|---|---|
| F0 | nenhum | sequencial rápido | 1 | — |
| F1 | baixo (CI) | sequencial | 1 (CI é serial) | simulação S1 |
| F2 | médio (bundle prod) | sequencial | 1 | simulação S2 + verificação bundle |
| F3 | médio (DDL fns) | sequencial | 1 | simulação S7 + backup corpos |
| F4 | alto (secrets) | sequencial estrito | 1 | APROVADO + expand/contract |
| F5 | médio (testes) | paralelo seguro | até 3 (suites independentes) | guard DENO_ENV verificado |
| F6 | baixo (docs) | ondas de até 10 | 10 (A1–A10 existente) | leitura de fontes-de-verdade |
| F7 | alto (infra prod) | sequencial estrito | 1 | APROVADO + snapshots |
| F8 | baixo | sequencial | 1 | — |
| F9 | nenhum (read-only) | onda de 10 | 10 | baseline V3 registrado |

**Estimativa total:** 9–12 dias úteis de execução (F4 e F7 dependem de janelas de APROVADO).

**Regras de abort (qualquer fase):** erro de envio >1% · DLQ com itens novos · p95 >2× baseline · health <95 · gate crítico >0.
**Rollback universal:** `git revert` (código) · `ops.fn_bodies_backup` → `CREATE OR REPLACE` (SQL) · tags `decouple-v3-baseline` (repos) · Portainer stack redeploy do digest anterior (infra).
