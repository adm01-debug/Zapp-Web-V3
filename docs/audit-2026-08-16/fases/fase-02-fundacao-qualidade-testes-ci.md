# FASE 2 — FUNDAÇÃO DE QUALIDADE (testes/CI)

## Etapa 11 — Erradicar testes fantasma team-chat e provar RLS ao vivo
**Objetivo:** substituir os 270 testes team-chat (218 `expect(true)`) e os 52 security-gaps (`expect(true)`) por testes reais contra o SUT, provando os gaps de RLS com execução ao vivo.
**Base:** findings-07:31-32 (17:259-260, 17:279-280); pendencias-consolidadas.md:236-237.

### Subetapas
- [ ] 11.1 Localizar as 2 suítes team-chat (comprehensive 270 + security-gaps 52) e gerar inventário de todas as ocorrências `expect(true)`/`toBe(true)` com `grep -rn "expect(true)" src/` (arquivo + linha).
- [ ] 11.2 Mapear cada bloco de teste ao SUT real (TeamChatPanel, useTeamChatPanel, DepartmentMembersView/InvitesView/AuditView, mutations) — tabela bloco → SUT.
- [ ] 11.3 Reescrever bloco mensagens/reply/edição/áudio/scroll/busca contra hooks e helpers reais (nunca lógica inline).
- [ ] 11.4 Reescrever bloco CRUD de departamentos/membros/convites/auditoria com mock do supabase espelhando as políticas reais.
- [ ] 11.5 Reescrever bloco transferência entre departamentos, incluindo asserção de que `transferred_by` usa o usuário autenticado (17:286 — hoje hardcoded `'Support Agent'`).
- [ ] 11.6 Reescrever os 52 security-gaps como testes de contrato de policy (mock reflete `pg_policies` real; remoção da policy deve quebrar o teste).
- [ ] 11.7 Prova ao vivo via MCP Supabase: `SELECT * FROM pg_policies` filtrando `team_messages`/`team_conversations` e documentar INSERT sem membership check + ausência de DELETE policy (17:280).
- [ ] 11.8 Simulação `SET ROLE authenticated` + JWT claims (membership=false) tentando INSERT em `team_messages` e DELETE em `team_conversations` — registrar resultado real (passou = bug confirmado).
- [ ] 11.9 Se gap confirmado: criar migration de policy (membership check no INSERT; DELETE para owner/member) + teste de regressão na suíte reescrita.
- [ ] 11.10 Rodar `bun run test -- team-chat` e garantir 0 `expect(true)` restantes; prova de morte: remover 1 policy no ambiente de teste → CI deve falhar.

### Critério de conclusão (checklist da etapa)
- [ ] 0 ocorrências de `expect(true)`/`toBe(true)` nas 2 suítes (grep documentado na PR).
- [ ] Nº de asserções reais > nº de testes (nenhum teste sem asserção) nas suítes team-chat.
- [ ] Relatório `pg_policies` + resultado da simulação SET ROLE anexado à PR (findings-07:32 encerrado).
- [ ] Prova de morte executada: remover 1 policy → CI vermelho.

## Etapa 12 — Corrigir cobertura negativa webhookStatusPriority e os 5+ testes-espelho
**Objetivo:** eliminar cobertura que afirma o oposto do runtime (`played=4` vs `3`, `failed` condicional vs incondicional) e ~934 linhas verdes de espelhos que não tocam produção.
**Base:** findings-11:718 (35:A1), findings-11:727 (35:A3); pendencias-consolidadas.md:461.

### Subetapas
- [ ] 12.1 Apagar a cópia inline de `shouldUpdateStatus`/`STATUS_PRIORITY` em `webhookStatusPriority.test.ts` e importar de `evolution-helpers.ts` (35:199-225).
- [ ] 12.2 Alinhar constantes do teste à produção: `played=4` (evolution-helpers.ts:321), `failed` condicional (:332).
- [ ] 12.3 Reescrever os casos :104-110 do `webhookStatusPriority.test.ts` exercitando o SUT importado (feliz + borda + erro).
- [ ] 12.4 Catalogar os espelhos restantes: `rateLimiter`, `groupsAutoSync`, `phoneNormalization`, `rlsGroupAccess`, `centenarias`, `whatsappFileTypes`, `imageCompression` (35:A3, 39:A1/A4).
- [ ] 12.5 `rateLimiter.test.ts`: verificar existência de `RATE_LIMIT_MAX_EVENTS` (35:252-254); se renomeada, importar o SUT real — nunca constante inline.
- [ ] 12.6 `groupsAutoSync.test.ts` e `phoneNormalization.test.ts`: substituir lógica inline por import do módulo real.
- [ ] 12.7 `rlsGroupAccess.test.ts`: importar a policy/SQL real — `DROP POLICY` deve quebrar o teste (35:260-262).
- [ ] 12.8 `whatsappFileTypes.test.ts`: apagar tautologia l.10-14 e cobrir os 15 exports reais (validação de upload/executáveis) (39:A1).
- [ ] 12.9 `imageCompression.test.ts`: reescrever os 5 casos importando o SUT (39:A4); `centenarias.simulacao.test.ts`: importar a lógica real.
- [ ] 12.10 Criar detector de espelho (script: teste sem nenhum import de `src/` = candidato a espelho) e zerar falsos verdes com allowlist documentada.

### Critério de conclusão (checklist da etapa)
- [ ] `webhookStatusPriority.test.ts` importa `evolution-helpers.ts` (grep na PR) e está verde.
- [ ] 0 testes em `src/**/*.test.ts` sem import de `src/` (fora da allowlist).
- [ ] Remover `STATUS_PRIORITY` de produção → teste falha (prova de acoplamento real).

## Etapa 13 — E2E: eliminar 6/13 specs sem asserção, drift de portas e specs contra produção
**Objetivo:** fazer os 13 specs e2e executarem asserção real contra o PR (nunca produção externa), com 1 porta única e env completo.
**Base:** findings-12:739 (40:A1/A2/A3), findings-12:515 (40:A4); pendencias-consolidadas.md:512-515.

### Subetapas
- [ ] 13.1 Auditar os 13 specs e marcar quais caem em `test.skip` gracioso (4 inbox por `RUN_INBOX_E2E`; app-metrics/auth-session-toggle por porta 8080) (40:80-85).
- [ ] 13.2 Decidir `RUN_INBOX_E2E`: definir a var nos workflows (ci.yml + quality-gate.yml) e ativar os 4 specs inbox (847 ln) OU remover o gate e os specs — registrar decisão (40:90-103).
- [ ] 13.3 Unificar porta: escolher 1 entre `vite.config.ts:116` (8080) × `playwright.config.ts:19,24` (5173) × `playwright.e2e.config.ts` (4173) e propagar (40:105-119).
- [ ] 13.4 Remover hardcode `localhost:8080` dos 4 specs que caem no skip gracioso.
- [ ] 13.5 `no-workbook-after-reload`: trocar `https://zapp-web-v3.vercel.app/` pela baseURL do PR (40:121-136).
- [ ] 13.6 Redirecionar os 2 previews `*.lovable.app` para o deploy do PR.
- [ ] 13.7 `page.goto()` com `failOnStatusCode: true` ou asserção de URL — eliminar verde-vácuo em 404.
- [ ] 13.8 Adicionar `VITE_SUPABASE_PUBLISHABLE_KEY` ao `quality-gate.yml:17-22` e ao harness `test.env` (paridade com `ci.yml:26`) (40:193-234).
- [ ] 13.9 Rodar os 13 specs no CI e conferir no report (junit/JSON) que cada spec tem `asserts > 0`.
- [ ] 13.10 Adicionar script de validação (1+ expect por spec) ao quality-gate e atualizar `docs/estado/40-e2e-harness-data.md`.

### Critério de conclusão (checklist da etapa)
- [ ] 13/13 specs com `asserts > 0` no report do CI.
- [ ] 0 URLs de produção externa em specs (grep `zapp-web-v3.vercel.app|lovable.app`).
- [ ] 1 única porta em todos os configs (vite/playwright/playwright.e2e).
- [ ] `ci.yml` e `quality-gate.yml` com o mesmo conjunto de envs.

## Etapa 14 — Reativar auth do proxy.test (31% skips) e suítes desligadas (absorve: externalProxy — suíte única)
**Objetivo:** eliminar os 8/26 skips sem justificativa no gateway `evoApi` (cache de token TTL 30s, fallback anon) e dar destino às 1.118 linhas comentadas de suítes de módulo vivo.
**Base:** findings-11:720-721 (39:A2, 35:A2); pendencias-consolidadas.md:457,462.

### Subetapas
- [ ] 14.1 Inventariar os 4 marcos de skip em `proxy.test.ts` (:185, :204, :355, :498) e classificar cada um (justificável com issue vs dívida).
- [ ] 14.2 Implementar os casos de auth do gateway: cache de token TTL 30s, fallback anon, 401, renovação e refresh concorrente.
- [ ] 14.3 Escrever ou remover o placeholder `it.skip` de `proxy.test.ts:204` (39:138-150) — sem placeholder vazio.
- [ ] 14.4 Preencher ou remover os `describe.skip` :355/:498 com casos reais de auth.
- [ ] 14.5 Decidir `externalProxy.test.ts` (601 linhas comentadas, placeholder :619-621): reativar OU remover o módulo — verificar os 5 importadores (incl. fallback de contato na inbox) (35:A2).
- [ ] 14.6 Se reativar: descomentar e ajustar mocks aos imports atuais; se remover: migrar call sites e apagar suíte — nunca estado "comentado no meio".
- [ ] 14.7 `resilienceSimulation.test.ts` (517 linhas comentadas, :536-538): mesma decisão — módulo `retryScheduleSimulation` é EM_USO (1 prod).
- [ ] 14.8 Corrigir o comentário do bloco `// DENO` no `vitest.config.ts` (afirma execução que não ocorre) (35:269-276).
- [ ] 14.9 Rodar as suítes reativadas no CI e medir delta de cobertura (auth do gateway).
- [ ] 14.10 Atualizar `docs/estado/39-residual-tests.md` e `35-lib-tests.md` com o status final de cada suíte.

### Critério de conclusão (checklist da etapa)
- [ ] `proxy.test.ts` com 0 `it.skip`/`describe.skip` (ou todos justificados por comentário + issue linkada).
- [ ] Cobertura de auth do gateway ≥ 80% dos casos (TTL, fallback, refresh, 401).
- [ ] `externalProxy.test.ts` reativada OU módulo removido — nenhum dos dois estados.
- [ ] `vitest.config.ts` sem bloco `// DENO` falso.

## Etapa 15 — Corrigir gates de CI que travam merge e guardas falsos
**Objetivo:** destravar merge (required com paths filter), desativar deploy DRAFT concorrente, religar observabilidade pós-deploy e ligar gates documentados como ativos.
**Base:** findings-12:740 (38:A2-A6, A10); pendencias-consolidadas.md:499-511.

### Subetapas
- [ ] 15.1 `security-invoker-gate.yml`: remover o `paths:` filter do check required — rodar sempre ou reportar contexto obrigatório (38:315).
- [ ] 15.2 Testar com PR que não toca os paths: status deve reportar ✓/✗ (nunca "Expected — Waiting for status").
- [ ] 15.3 `deploy-vps-selfhosted.yml`: desativar (marcado "⚠️ DRAFT — NÃO ativar" mas ATIVO) — comentar trigger ou remover; alinhar concurrency e retenção GHCR 9 vs 30 (38:316).
- [ ] 15.4 `post-deploy-check.yml`: corrigir trigger de `["deploy-vps.yml"]` para o nome real `🚀 Build & Deploy — ZAPP web v3` (38:317).
- [ ] 15.5 `notify-ci-failure.yml`: corrigir lista (5 dos 6 workflows não existem) para os nomes reais.
- [ ] 15.6 `branch-protection-sentinel.yml`: corrigir fail-open (sem `BRANCH_PROT_PAT` → `::warning` + `exit 0`, 38:82-88) e enumeração de 10 → 11 contextos (38:318).
- [ ] 15.7 Ligar `check-column-map.mjs` e `phys-refs-gate.mjs` nos workflows (hoje "bloqueiam PRs" sem nenhum chamador) (38:319).
- [ ] 15.8 `zapp-functions-health.yml:14,17`: criar `scripts/check-functions-health.sh` no repo ou remover a referência (38:323).
- [ ] 15.9 `seed-e2e-user.yml`: criar workflow chamador ou auto-recuperação do usuário E2E (38:320).
- [ ] 15.10 Validar os 10 gates required com PR de teste (tocar cada path) e atualizar `docs/estado/38-infra-ci-scripts.md`.

### Critério de conclusão (checklist da etapa)
- [ ] PR sem tocar os paths do security-invoker reporta status (não "Expected — Waiting").
- [ ] `deploy-vps-selfhosted.yml` inativo: 0 runs em 7 dias (GitHub Actions).
- [ ] `post-deploy-check` dispara após 1 deploy real (run confirmada no histórico).
- [ ] Sentinel enumera os 11 contextos e falha fechado (sem `BRANCH_PROT_PAT` → exit ≠ 0 em dry-run controlado).

## Etapa 16 — Build reprodutível do RUNNER DE CI (lockfile, base, env, flakiness)
**Objetivo:** garantir imagem Docker e CI reproduzindo exatamente o lockfile e o ambiente do dev, sem retries que mascarem flakiness e sem lixo versionado.
**Base:** findings-12:742 (38:A8); findings-12:523 (40:A12); findings-12:508 (38:A11); pendencias-consolidadas.md:506,508,515,523.

### Subetapas
- [ ] 16.1 `Dockerfile:6-8`: restaurar `--frozen-lockfile` no `bun install` (38:321).
- [ ] 16.2 Pin da base `oven/bun:1.3-alpine`: trocar tag flutuante por versão exata + digest (ex.: `bun:1.3.x-alpine@sha256:…`).
- [ ] 16.3 Confirmar/adicionar validação de lockfile no CI (`bun install --frozen-lockfile` em workflow dedicado).
- [ ] 16.4 Teste de reprodutibilidade: build da imagem 2× e diff das dependências resolvidas (`bun pm ls`).
- [ ] 16.5 `vitest.config.ts:14`: `retry: 2` → `0`; triar flakiness com o próprio `flaky-test-detector` (40:A12).
- [ ] 16.6 Remover os 3 `.pyc` versionados (`scripts/__pycache__/…`, raiz `ci_cost_analysis.cpython-314.pyc`, `.hermes/rollback-test/…`) e adicionar `__pycache__/` ao `.gitignore` (38:A11).
- [ ] 16.7 `quality-gate.yml`: adicionar `VITE_SUPABASE_PUBLISHABLE_KEY` (paridade com `ci.yml:26`) (40:A4).
- [ ] 16.8 Definir `test.env`/harness env documentado para que `TextToAudioButton.auth.test.tsx` nunca rode com `ANON` undefined.
- [ ] 16.9 Configurar renovação (Dependabot/Renovate) para a base pinada com PR de update.
- [ ] 16.10 Documentar o build canônico (comando + env) e decidir alvo oficial: `vercel.json` × Docker/Swarm/Portainer (38:A12).

### Critério de conclusão (checklist da etapa)
- [ ] `Dockerfile` contém `--frozen-lockfile`.
- [ ] `BASE_IMAGE` com versão+digest exatos (sem tag flutuante).
- [ ] CI de testes sem `retry` (0 retries em `vitest.config.ts`).
- [ ] `git ls-files | grep -c pyc` = 0 e `__pycache__/` no `.gitignore`.

## Etapa 17 — Resolver a quarentena de 27 suítes (Deno/NEEDS-ENV/ORPHAN/FAILING)
**Objetivo:** dar destino final às ~2.177 linhas não executadas por runner nenhum — migrar para Vitest, prover env ou remover com veredito.
**Base:** findings-12:525 (40:157-160); findings-11:192,196,219,231,245 (35:17-24, 35:71,77); findings-10:709 (28 L359-360); pendencias-consolidadas.md:459-460,525.

### Subetapas
- [ ] 17.1 Listar as 27 suítes do `exclude` do `vitest.config.ts` com motivo (ORPHAN/FAILING/DENO/NEEDS-ENV) e issue por grupo.
- [ ] 17.2 Migrar as 4 Deno para Vitest: `clientRateLimiter`, `healthCheck`, `queryTimeout`, `sanitize-extra` (35:145-157).
- [ ] 17.3 `useAudioRecorder.cleanup.test`: migrar de runner Deno (`deno.land/std` L11) para Vitest ou excluir (28 L359-360).
- [ ] 17.4 `contactsDB.test.ts` (NEEDS-ENV): localizar o "script de integração" ou definir workflow com vars; senão, converter em teste de integração com setup documentado (35:177-181).
- [ ] 17.5 Renomear `debug-dompurify-test.ts` → `debug-dompurify.test.ts` (fora do glob atual) (35:167-173).
- [ ] 17.6 `healthCheck.test.ts`: remover tautologia `assertEquals(true,true)` :13; decidir testar o stub ou removê-lo junto com o módulo órfão `healthCheck` (33:A2).
- [ ] 17.7 `stress-test.test.ts`: remover o `it.skip` ou reescrever contra staging — nunca 10 reqs contra produção (40:380-386).
- [ ] 17.8 Triar suítes FAILING: classificar cada uma (bug real vs teste frágil) e reabilitar ou deletar com veredito.
- [ ] 17.9 `src/test/realtimeEventParser.ts` (92 ln, 0 importadores): fazer o consumidor que reimplementa localmente passar a importá-lo (40:372-378).
- [ ] 17.10 Atualizar quarentena: `exclude` vazio ou allowlist mínima com issue linkada; atualizar docs 35/40.

### Critério de conclusão (checklist da etapa)
- [ ] `exclude` do `vitest.config.ts` = `[]` ou apenas allowlist com issue linkada.
- [ ] 0 arquivos `*-test.ts`/`debug-dompurify-test.ts` fora do glob do vitest.
- [ ] `bun run test` executa 100% das suítes do repo (nenhuma comentada/skip por config).
- [ ] `healthCheck.test.ts` sem tautologia.

## Etapa 18 — Remover testes duplicados, STUBs e asserções-vácuo
**Objetivo:** eliminar duplicatas (useTheme/useUrlFilters .ts+.tsx), 3 testes STUB de hooks, gmailHealthRLS hardcoded, asserção-vácuo e MockAuthProvider no-op.
**Base:** findings-10:709-710 (28 A2, 29 A1-A4, A9); findings-07:256 (30:185,222); findings-11:297 (39:A3); findings-12:521 (40:A10); pendencias-consolidadas.md:397-398,456.

### Subetapas
- [ ] 18.1 Consolidar `useTheme.test.ts` × `useTheme.test.tsx` (29 A1) — manter o que importa o SUT real; candidato a remoção não acrescenta cobertura.
- [ ] 18.2 Consolidar `useUrlFilters.test.ts` (291 ln) × `.test.tsx` (99 ln, duplicata parcial) (29 A2).
- [ ] 18.3 `useApplicableSLA.test`: remover `resolveApplicableSLA` inline e importar o hook real (28 L356-357).
- [ ] 18.4 `useSLACalculation.test`: instanciar o hook real com `renderHook` (29 A5 — hoje zero cobertura de renderHook).
- [ ] 18.5 `usePushNotifications.test`: reescrever os 8 testes `typeof fn` com comportamento real (permissão, subscribe/unsubscribe, VAPID, showNotification) (29 A3).
- [ ] 18.6 `useTextToSpeech.test`: cobrir speak/parada prematura/erros/enfileiramento ou remover (29 A4).
- [ ] 18.7 `gmailHealthRLS.test.ts` (34L, strings hardcoded): reescrever contra policies reais ou remover (30:185,222).
- [ ] 18.8 `TextToAudioButton.auth.test.tsx:50`: definir `ANON` no test env e substituir `expect(undefined).toBe(undefined)` por asserção real (39:A3).
- [ ] 18.9 `defaultShortcuts`: reconciliar 24 vs 25 entries (29 A9) e corrigir o teste.
- [ ] 18.10 `MockAuthProvider` no-op (`value: _value`): propagar `value` ao contexto e adicionar teste de logout que falha se o provider descartar value (40:A10).

### Critério de conclusão (checklist da etapa)
- [ ] 1 arquivo de teste por módulo (0 duplas `.ts`/`.tsx`).
- [ ] 0 testes com `typeof fn` como única asserção.
- [ ] 0 asserções com `undefined` literal (`expect(undefined).toBe(undefined)`).
- [ ] `grep resolveApplicableSLA` no arquivo de teste = 0 (importado do hook real).

## Etapa 19 — Regenerar types.ts e sanear typecheck (ts-nocheck, tsconfig, casts)
**Objetivo:** eliminar drifts de types.ts (RPCs DLQ não regenerados), `@ts-ignore`/`@ts-nocheck` e exclusões de tsconfig que escondem código morto.
**Base:** findings-07:28 (17:292 — `@ts-ignore` em useFailedMessages.ts:37); findings-12:522 (40:A11 — tsconfig.app.json:34-35, `src/_archive/**`); findings-14:870 (ts-nocheck falha ambiental git-bash); pendencias-consolidadas.md:522.

### Subetapas
- [ ] 19.1 Regenerar `types.ts` via MCP Supabase (`supabase_generate_typescript_types`) contra o banco atual (pós-move 11:50Z — topologia evo física) e revisar o diff.
- [ ] 19.2 Confirmar RPCs `rpc_dlq_*` presentes nos tipos gerados; remover o `@ts-ignore` de `useFailedMessages.ts:37` (17:292).
- [ ] 19.3 Rodar typecheck completo (`tsc --noEmit` / `bun run typecheck`) e listar erros residuais.
- [ ] 19.4 `tsconfig.app.json:34-35`: remover exclusões dos 2 testes que não existem mais (40:396-402).
- [ ] 19.5 `src/_archive/**`: adicionar ao `exclude` do tsconfig OU remover do baseline (604 ln ainda type-checked) (40:A11).
- [ ] 19.6 Contabilizar e eliminar `@ts-nocheck` restantes (ex.: CRM, findings-22:1059) — resolver ou remover o arquivo.
- [ ] 19.7 Padronizar typecheck no CI: comando canônico que roda igual em ubuntu e git-bash (documentar o workaround do ts-nocheck falho no git-bash) (findings-14:870).
- [ ] 19.8 Corrigir casts degenerados conhecidos: `as unknown` (useSearchManagement 26 A6), `as never` (usePersonalStickers 25 A12), `SafeQueryBuilder = any` (30:191) com tipos reais.
- [ ] 19.9 Adicionar job de CI `typecheck` com `tsc -b` sem suppress (gate no quality-gate.yml).
- [ ] 19.10 Atualizar consumidores DLQ (DLQPanel/DLQAuditHistory) com os tipos regenerados e revisar `docs/estado/17-*`.

### Critério de conclusão (checklist da etapa)
- [ ] `types.ts` regenerado e commitado com diff revisado (RPCs `rpc_dlq_*` presentes).
- [ ] 0 `@ts-ignore`/`@ts-nocheck` novos na PR; contagem atual documentada e decrescente.
- [ ] `tsc --noEmit` verde local (git-bash) e no CI ubuntu.
- [ ] `src/_archive/**` fora do typecheck ou decisão documentada na PR.

## Etapa 20 — Converter testes tautológicos em SUT real + baseline de cobertura
**Objetivo:** fechar a fundação: nenhum teste verde sem tocar produção (realtimeFanoutWildcard, webhook-fuzzer, blocos RLS tautológicos) e thresholds de cobertura com baseline.
**Base:** findings-12:516-518 (40:A5/A6/A7), findings-12:524 (40:507-523), findings-12:519 (40:A8); pendencias-consolidadas.md:517-519.

### Subetapas
- [ ] 20.1 `realtimeFanoutWildcard.test.ts`: apagar a cópia local (espelho auto-declarado) e importar o SUT real `@/lib/realtime/edgeEvents` (usado por `realtimeFanoutEvents.test.ts:14`) (40:A5).
- [ ] 20.2 `webhook-fuzzer.test.ts`: importar `validateWebhookPayload` de produção (hoje definida no próprio teste; 1.100 execs sobre validador inexistente) (40:A6).
- [ ] 20.3 `security-and-performance.test.ts:43-77,150-170`: remover blocos tautológicos (mock devolve o que o teste mandou); manter os 2 describes legítimos (40:A7).
- [ ] 20.4 `dlq-transfers-rls.test.ts:52-100`: reescrever contra policies/mocks que reflitam o SQL real de RLS.
- [ ] 20.5 `sprint1-security-hardening.test.ts`: trocar grep sobre texto de migration (17 expects, zero SUT) por teste contra `pg_proc` (funções existem no banco) (40:507-523).
- [ ] 20.6 Instalar `coverage.thresholds` no vitest por módulo (lib/hooks/e2e) com baseline medido na 1ª execução e publicado como artifact.
- [ ] 20.7 Criar o gate anti-espelho no CI: falha se um teste não importa nenhum símbolo de `src/` (allowlist) — plugar no quality-gate.yml.
- [ ] 20.8 Estender `contractSnapshot.test.ts` (rpcCatalog, 40:412-442) para conferir ao vivo contra `pg_proc` (declaradas × vivas — 822 fns sem declaração, 37:A8).
- [ ] 20.9 Rodar cobertura completa, publicar report e atualizar QUALITY_METRICS/audits com o baseline.
- [ ] 20.10 Documentar política de testes (AGENTS.md/CLAUDE.md): proibido `expect(true)`, espelho, skip sem issue; atualizar docs de estado 35/39/40.

### Critério de conclusão (checklist da etapa)
- [ ] 0 testes sem import de `src/` fora da allowlist (gate anti-espelho verde no CI).
- [ ] `realtimeFanoutWildcard` e `webhook-fuzzer` importam o SUT real.
- [ ] `coverage.thresholds` ativos e verdes no CI com baseline documentado.
- [ ] `sprint1-security-hardening.test.ts` testa `pg_proc` (grep de migration removido).
- [ ] Política anti-teste-fantasma documentada no AGENTS.md/CLAUDE.md.


---
