> [!NOTE] **STATUS 2026-08-14 — pós-onda de 10 agentes (reconciliação `main` @`8ff014fb0`)**
> Este arquivo é o **desenho** do Plano V4 (100 etapas). O retrato **medido** do estado do desacoplamento está em [`BASELINE_V4.md`](./BASELINE_V4.md) e a matriz de cenários E1–E30 em [`CENARIOS_V4_LOG.md`](./CENARIOS_V4_LOG.md). Banner inserido em 2026-08-14 (Agente 8) — o conteúdo abaixo permanece integralmente preservado.

# PLANO V4 — Desacoplamento Zapp Web V3 ↔ Evolution API · 100 etapas de fechamento

**Data:** 2026-08-14 · **Autor:** Claude Agent A8 (análise exaustiva pós-V3, dev sênior) · **Baseline:** `PLANO_DESACOPLAMENTO_V3_100_ETAPAS.md` + `SCORECARD_V3.md` + `VALIDACAO_V3.md` (nota 8,5/10, migração ✅ APROVADA, 12 resíduos)
**Escopo:** fechar as dimensões **9** (prova de troca de provider) e **10** (governança/gates) do `SCORECARD_V3.md`, hoje em 5/10 e 6/10, sem regredir as dimensões 1–8 (já em 9–10/10).
**Convenção:** `[R]` reversível sem deploy · `[D]` deploy/DDL · `[!]` toca produção · `[⛔]` requer APROVADO de Joaquim · `[herdado V3 #N]` pré-requisito já concluído no V3 — citado como dependência, **não reexecutado**.
**Regras de ouro (herdadas):** worktree isolado por AGENTS.md · 1 arquivo/fix por commit · nunca `--no-verify` · PR por fase · **nunca desligar Evolution em produção** · banco é fonte de verdade · **nunca renomear schema/tabela/coluna sem caminho de compatibilidade** (`docs/db/BACKCOMPAT-VIEWS.md` + `docs/db/SCHEMA-CONTRACT.md`).

---

## F0 · Reconciliação — corrigir a leitura do SCORECARD com evidência fresca (1–8) — [R], 0,5 dia

O SCORECARD_V3 foi escrito na manhã de 2026-08-14; comits posteriores no mesmo dia já resolveram parte das pendências que ele lista. F0 audita isso ANTES de planejar em cima de um retrato desatualizado — evita retrabalho (reabrir o que já fechou) e detecta o que genuinamente falta.

- [ ] **1.** [R] Rodar `node scripts/decouple/inventory.mjs` agora e registrar TOTAL real.
  - Objetivo: confirmar se o TOTAL ainda é 0 (medido nesta sessão: **0/0/0/0**, baseline antigo 15).
  - Artefato: saída bruta anexada a `docs/decouple/BASELINE_V4.md` (novo arquivo).
  - Validação: `TOTAL: 0` no stdout.
  - Rollback: nenhum (leitura).
  - Dependências: [herdado V3 #12–14, #26].

- [ ] **2.** [R] Conferir severidade real do bloco ESLint decouple (`eslint.config.js`) — hoje já está em `"error"` (linhas 246–268), não `warn` como o SCORECARD dimensão 10 registra.
  - Objetivo: corrigir a leitura factual antes de represcrever um fix que já existe.
  - Artefato: nota em `BASELINE_V4.md`: "ESLint decouple = error (confirmado grep 2026-08-14), pendência do SCORECARD já fechada".
  - Validação: `grep -n '"error"' eslint.config.js` nas 3 regras decouple (invoke, evolutionExternal, VITE_EVOLUTION_API_URL).
  - Rollback: nenhum.
  - Dependências: [herdado V3 #15, #29].

- [ ] **3.** [R] Conferir estado real do `ADR-008-canonical-domain-model.md` — hoje 6.763 bytes, `Status: Aceito (2026-08-14)`, não mais o stub de 1.161 bytes citado no SCORECARD/VALIDACAO.
  - Objetivo: mesma correção de leitura — ADR-008 já tem modelo canônico completo, mapeamento Baileys↔Meta↔canônico e tabela de tipos.
  - Artefato: nota em `BASELINE_V4.md`.
  - Validação: `wc -c docs/decouple/ADR-008-canonical-domain-model.md` > 5000 e seção "Modelo canônico" presente.
  - Rollback: nenhum.
  - Dependências: [herdado V3 #61].

- [ ] **4.** [R] Confirmar o gap REAL da dimensão 10: `decouple-guard.yml` linha 61 ainda usa `if [ "$TOTAL" -gt 15 ]` — threshold frouxo não foi endurecido.
  - Objetivo: isolar o único item genuinamente pendente da dimensão 10 no lado CI.
  - Artefato: nota em `BASELINE_V4.md` com o trecho exato do workflow.
  - Validação: `grep -n "gt 15" .github/workflows/decouple-guard.yml` retorna 1 linha.
  - Rollback: nenhum.
  - Dependências: [herdado V3 #14, #28] (prescreveram o endurecimento; nunca executado).

- [ ] **5.** [R] Confirmar o gap REAL da dimensão 9: `RUNBOOK_TROCA_PROVIDER.md` existe e é completo (8 passos, rollback, 4 portas mapeadas), mas o próprio documento declara no rodapé "a troca real NUNCA foi executada nem ensaiada em produção" — o ensaio cronometrado (V3 #57) nunca rodou.
  - Objetivo: confirmar que falta EXECUÇÃO, não desenho — o runbook está pronto, falta o ensaio medido.
  - Artefato: nota em `BASELINE_V4.md`.
  - Validação: leitura da seção 8 do runbook ("Evidências a arquivar") vazia de números reais.
  - Rollback: nenhum.
  - Dependências: [herdado V3 #56].

- [ ] **6.** [R] Confirmar ausência de client `providers/cloud/` — só existem `providers/evolution/` e `providers/fake/`; `registry.ts` lança `not yet implemented` para `'cloud'`.
  - Objetivo: estabelecer que a prova de substituibilidade real desta rodada usa o **fake provider** (já existe, seguro, sem custo de integração Meta), não uma implementação Cloud completa — isso é um limite explícito do V4, não um débito escondido.
  - Artefato: nota em `BASELINE_V4.md`.
  - Validação: `find supabase/functions/_shared/providers -maxdepth 1 -type d` lista só `evolution` e `fake`.
  - Rollback: nenhum.
  - Dependências: nenhuma.

- [ ] **7.** [R] Consolidar `docs/decouple/BASELINE_V4.md`: TOTAL 0, ESLint error, ADR-008 aceito, guard `DENO_ENV=test` presente em `registry.ts`, threshold CI ainda 15, ensaio cronometrado ainda não feito, vault 10 secrets com 2 pares duplicados (herdado, não verificado nesta rodada — SQL requer acesso vivo ao Postgres self-hosted, fora do escopo de leitura de repo; confirmar em F4 com MCP Supabase).
  - Objetivo: baseline único e datado para o V4, sem depender de docs desatualizados.
  - Artefato: `docs/decouple/BASELINE_V4.md`.
  - Validação: arquivo existe e cobre os 6 itens acima.
  - Rollback: `git rm` do arquivo se descartado.
  - Dependências: #1–#6.

- [ ] **8.** [R] Branch `feat/decouple-v4` a partir de worktree isolado (protocolo AGENTS.md); PR de F0 (só docs) aberta.
  - Objetivo: isolar a execução do V4 sem tocar `main` diretamente.
  - Artefato: branch + PR.
  - Validação: `git branch --show-current` = `feat/decouple-v4`; CI verde no PR de docs.
  - Rollback: `git branch -D feat/decouple-v4` (worktree ainda não tem trabalho de risco).
  - Dependências: [herdado V3 #8–10].

---

## F1 · Gates CI — travar a dimensão 10 de vez (9–24) — [R][D], 1–2 dias

- [ ] **9.** [R] Editar `decouple-guard.yml` linha 61: `TOTAL -gt 15` → `TOTAL -gt 0`.
  - Objetivo: qualquer regressão de 1+ bypass passa a falhar o PR.
  - Artefato: diff de 1 linha em `.github/workflows/decouple-guard.yml`.
  - Validação: `grep -n "gt 0" .github/workflows/decouple-guard.yml`.
  - Rollback: `git revert` do commit.
  - Dependências: F0 #4.

- [ ] **10.** [R] Atualizar a mensagem de erro do workflow (`baseline=15` → `baseline=0`) para não confundir o próximo agente.
  - Objetivo: consistência da mensagem com o novo threshold.
  - Artefato: mesma linha do diff #9.
  - Validação: leitura do texto do `::error::`.
  - Rollback: junto com #9.
  - Dependências: #9.

- [ ] **11.** [R] Testar o guard deliberadamente: branch dummy com 1 `invoke('evolution-api', ...)` fora do adapter → abrir PR sintético → **deve falhar**.
  - Objetivo: prova empírica de que o threshold 0 realmente bloqueia (evita repetir o erro do V3 que nunca testou na prática, só prescreveu).
  - Artefato: screenshot/log do CI vermelho, arquivado em `docs/decouple/GUARD_PROOF_V4.md`.
  - Validação: PR sintético mostra `::error::Regressão detectada! TOTAL=1 > baseline=0`.
  - Rollback: fechar o PR sintético sem merge.
  - Dependências: #9–10.

- [ ] **12.** [R] Reverter a alteração de teste do passo 11 (branch dummy deletada) e arquivar a evidência.
  - Objetivo: não deixar código de teste no ar.
  - Artefato: branch dummy removida.
  - Validação: `git branch -a | grep dummy` vazio.
  - Rollback: n/a.
  - Dependências: #11.

- [ ] **13.** [D] Promover `scripts/decouple/sql-gate.mjs` de script manual para step obrigatório do `decouple-guard.yml` (hoje só é citado como "roda no CI" no V3 #36 — confirmar se está de fato no workflow; se não estiver, adicionar).
  - Objetivo: o gate SQL (5 fns usando `ops.fn_evo_url`/`fn_evo_key`) vira bloqueante de PR, não só script solto.
  - Artefato: step novo em `.github/workflows/decouple-guard.yml` chamando `sql-gate.mjs`.
  - Validação: `grep -n "sql-gate" .github/workflows/decouple-guard.yml`.
  - Rollback: remover o step.
  - Dependências: [herdado V3 #16, #36].

- [ ] **14.** [R] Consolidar `ownership-gate.mjs` + `inventory.mjs` num único runner CI (V3 #85 nunca executado) — reduzir 2 scripts sobrepostos a 1 chamada no workflow, sem perder cobertura de nenhum dos dois.
  - Objetivo: menos superfície de manutenção, menos chance de um dos dois cair fora do CI silenciosamente.
  - Artefato: `scripts/decouple/run-all-gates.mjs` (novo) chamando os 3 (`inventory`, `ownership-gate`, `sql-gate`) e agregando saída única.
  - Validação: `node scripts/decouple/run-all-gates.mjs` roda os 3 e retorna exit code não-zero se qualquer um falhar.
  - Rollback: manter os 3 steps separados no workflow (reverter só a consolidação, não os gates).
  - Dependências: [herdado V3 #85], #13.

- [ ] **15.** [R] Adicionar ao CI um step de **contrato de verbos**: contar `evolutionClient.*` exportados em `providers/evolution/client.ts` e falhar se ≠ 12 (10 nomeados + `get<T>`/`post<T>`) — trava o número que a `SIMULATION_SCENARIOS_20260814.md` já identificou como fonte de divergência entre docs (G01).
  - Objetivo: gate estrutural que impede o client crescer/encolher sem atualizar `BOUNDARY-evolution.md` e `RUNBOOK_TROCA_PROVIDER.md` no mesmo PR.
  - Artefato: `scripts/decouple/verb-contract-gate.mjs`.
  - Validação: rodar contra o client atual → 12/12 verde; rodar contra uma cópia com 1 verbo a menos → falha.
  - Rollback: remover o step.
  - Dependências: F0 #6, `SIMULATION_SCENARIOS_20260814.md` §5 (contrato canônico).

- [ ] **16.** [D] Escrever contrato Zod para os 12 verbos do gateway (`src/domain/messaging/contracts/evolutionGateway.zod.ts`, novo) — schema de request/response por verbo, usando os tipos canônicos já existentes em `src/domain/messaging/types.ts` (ADR-008).
  - Objetivo: fecha a ação P1 da dimensão 4 do SCORECARD ("cobrir o adapter com teste de contrato Zod") e a ação P1 da dimensão 10 ("exigir teste de contrato Zod nos PRs que toquem resolvers/gateway").
  - Artefato: novo arquivo de schemas Zod.
  - Validação: `deno check` / `tsc --noEmit` passa; import do arquivo em `client.ts` sem erro de tipo.
  - Rollback: `git rm` do arquivo (não quebra runtime, é validação adicional).
  - Dependências: [herdado V3 #61] (ADR-008), F0 #3.

- [ ] **17.** [R] Adicionar teste unitário que valida CADA verbo do `providers/evolution/client.ts` contra o schema Zod do passo 16 usando fixtures reais capturadas de produção (payloads já existentes em `__tests__/` de paridade).
  - Objetivo: gate de contrato executável, não só declarativo.
  - Artefato: `supabase/functions/_shared/providers/evolution/__tests__/contract.test.ts`.
  - Validação: `deno test` 12/12 verbos verdes.
  - Rollback: `git rm` do teste.
  - Dependências: #16.

- [ ] **18.** [R] Adicionar o teste de contrato (#17) como step obrigatório do CI (`decouple-guard.yml` ou workflow de testes existente).
  - Objetivo: qualquer mudança de shape no client sem atualizar o contrato falha o PR.
  - Artefato: step novo no workflow.
  - Validação: PR sintético que quebra 1 campo do shape → CI vermelho.
  - Rollback: remover o step.
  - Dependências: #17.

- [ ] **19.** [D] Smoke test de egresso edge no CI (ação P0 da dimensão 5 do SCORECARD): chamada real ao gateway `client.ts` contra fixture/stub controlado, rodando em ambiente de teste (`DENO_ENV=test`, provider `fake`) — sem tocar Evolution real.
  - Objetivo: prova de que o gateway edge está de fato saudável a cada PR, não só nos deploys manuais.
  - Artefato: `supabase/functions/_shared/__tests__/gateway-smoke.test.ts` + step CI.
  - Validação: teste roda em <5s, 200 OK simulado via fake provider.
  - Rollback: remover o step (não é [!], não toca prod).
  - Dependências: F0 #6, [herdado V3 #51] (guard `DENO_ENV=test`).

- [ ] **20.** [R] Rodar `npx vitest run` + `deno check` no repo inteiro com os 3 novos artefatos (contrato Zod, teste de contrato, smoke gateway) — CI local verde antes de qualquer PR.
  - Objetivo: mesma disciplina do V3 #17, agora cobrindo os novos gates.
  - Artefato: log de execução arquivado.
  - Validação: exit code 0 em ambos comandos.
  - Rollback: n/a (só leitura/execução).
  - Dependências: #16–19.

- [ ] **21.** [R] PR F1 → `feat/decouple-v4`; CI com os 6 gates novos (threshold 0, sql-gate bloqueante, verb-contract-gate, contrato Zod, smoke gateway, run-all-gates consolidado) todos verdes.
  - Objetivo: fase F1 fechada e mergeável.
  - Artefato: PR.
  - Validação: todos os checks verdes no GitHub.
  - Rollback: fechar PR sem merge.
  - Dependências: #9–20.

- [ ] **22.** [R] Merge de F1 em `feat/decouple-v4` (não em `main` ainda — V4 usa 1 branch de release, PRs internos por fase, merge final em F9).
  - Objetivo: manter histórico de fases igual ao V3, mas só 1 PR grande para `main` no fim (reduz ruído de 10 PRs pequenos vs 1 squash final — decisão explícita de pragmatismo).
  - Artefato: merge commit em `feat/decouple-v4`.
  - Validação: `git log feat/decouple-v4` mostra o merge.
  - Rollback: `git revert` do merge commit.
  - Dependências: #21.

- [ ] **23.** [R] Documentar em `docs/decouple/CI_GATES_V4.md` a lista final de gates ativos, o que cada um verifica e o comando para rodar localmente antes de abrir PR.
  - Objetivo: onboarding de próximo agente/dev sem precisar ler o workflow YAML linha a linha.
  - Artefato: novo doc.
  - Validação: doc lista os 6 gates + comando local de cada.
  - Rollback: `git rm`.
  - Dependências: #9–20.

- [ ] **24.** [R] Cron-watch de 24h no CI: monitorar se algum PR concorrente (Hermes ou outro agente) tropeça no novo threshold 0 por falso-positivo (ex.: string de doc/teste casando no regex) — se acontecer, adicionar à whitelist do `inventory.mjs`, não relaxar o threshold.
  - Objetivo: mitigação do cenário S1 do V3 (`decouple-guard.yml` travar por falso-positivo de tooling), agora sob threshold mais estrito.
  - Artefato: nota em `CI_GATES_V4.md` com o resultado do watch.
  - Validação: 0 falsos-positivos em 24h OU whitelist atualizada com justificativa.
  - Rollback: reverter a entrada da whitelist se abrir brecha real.
  - Dependências: #21, [herdado V3 #11] (whitelist de tooling).

---

## F2 · Prova de substituibilidade — fechar a dimensão 9 de verdade (25–44) — [R][D], 2–3 dias

Esta é a fase central do V4. O V3 criou o fake provider e o guard `DENO_ENV=test`; o V4 completa a prova ponta a ponta: cobertura medida, contrato formal, e2e sem Evolution no ar, e degradação controlada.

- [ ] **25.** [R] Auditar `providers/fake/` — confirmar que os 12 verbos do contrato canônico (F1 #15) têm implementação fake correspondente (não só um subconjunto).
  - Objetivo: sem os 12/12 implementados no fake, o ensaio de troca (F3) não é representativo.
  - Artefato: tabela de cobertura em `docs/decouple/FAKE_PROVIDER_COVERAGE.md`.
  - Validação: 12/12 verbos com stub fake funcional.
  - Rollback: n/a (auditoria).
  - Dependências: F1 #15.

- [ ] **26.** [D] Implementar no fake provider os verbos ausentes encontrados em #25 (se houver), seguindo a mesma assinatura do client real.
  - Objetivo: cobertura 100% do contrato no fake.
  - Artefato: diff em `providers/fake/client.ts`.
  - Validação: `FAKE_PROVIDER_COVERAGE.md` atualizado para 12/12.
  - Rollback: `git revert`.
  - Dependências: #25.

- [ ] **27.** [R] Validar teste de contrato Zod (F1 #17) também contra o fake provider — mesmo schema, dois providers.
  - Objetivo: garantir que fake e evolution real respeitam o MESMO contrato — pré-condição para uma troca de provider ser segura.
  - Artefato: extensão do `contract.test.ts` para rodar contra `providers/fake/` também.
  - Validação: 12/12 verbos do fake passam no mesmo schema Zod.
  - Rollback: `git revert`.
  - Dependências: #26, F1 #17.

- [ ] **28.** [R] Suite e2e com transport fake: inbox renderiza, envia (stub), recebe (fixture) — sem Evolution no ar (herda intenção do V3 #52, agora com contrato formal por trás).
  - Objetivo: prova de que o app funciona ponta a ponta com QUALQUER provider que respeite o contrato, não só com Evolution.
  - Artefato: `e2e/decouple-fake-provider.spec.ts` (ou local equivalente ao runner e2e do projeto).
  - Validação: suite verde, 0 chamadas de rede reais capturadas (mock/intercept confirma).
  - Rollback: `git rm` do teste.
  - Dependências: #26–27, [herdado V3 #51–52].

- [ ] **29.** [R] Teste de degradação: provider fake configurado para retornar erro em `sendText` → app degrada com erro explícito na UI, sem quebrar o render do inbox.
  - Objetivo: valida resiliência (V3 #53), agora como parte formal da suite de prova de substituibilidade.
  - Artefato: caso de teste adicional no `e2e/decouple-fake-provider.spec.ts`.
  - Validação: teste verde — erro visível, sem crash de render.
  - Rollback: `git rm` do caso de teste.
  - Dependências: #28.

- [ ] **30.** [R] Rodar as suites de paridade já existentes — `parity.test.ts`, `whatsapp-cloud-normalizer.test.ts`, `evolution-response-normalizers.test.ts` — confirmando 100% verdes (herdado V3 #54, reconfirmar hoje).
  - Objetivo: garantir que o trabalho novo (contratos Zod, fake ampliado) não quebrou paridade existente.
  - Artefato: log de execução.
  - Validação: 0 falhas.
  - Rollback: n/a.
  - Dependências: [herdado V3 #54].

- [ ] **31.** [R] Medir cobertura REAL: % de operações WhatsApp (front + edge + SQL) que passam pelas 4 portas do gateway vs. total de operações do domínio de mensageria — número honesto, não estimado (herdado V3 #55, agora com o contrato Zod como régua objetiva de "o que conta como porta").
  - Objetivo: publicar o número real de cobertura do desacoplamento, a métrica que sustenta a nota da dimensão 9.
  - Artefato: script `scripts/decouple/coverage-report.mjs` + saída em `docs/decouple/COVERAGE_V4.md`.
  - Validação: número calculado, não redigido a mão; fórmula documentada (operações com contrato Zod / operações totais de mensageria).
  - Rollback: `git rm`.
  - Dependências: #16, #27.

- [ ] **32.** [R] Se a cobertura medida em #31 for <100%, listar EXPLICITAMENTE as operações fora do contrato (ex.: `listGroups` só é usado em 1 fluxo administrativo pouco coberto) — sem inflar o número.
  - Objetivo: honestidade do relatório (mesma disciplina do V3 #59 "sem sucesso fabricado").
  - Artefato: seção "Gaps conhecidos" em `COVERAGE_V4.md`.
  - Validação: cada gap tem arquivo:linha de origem.
  - Rollback: n/a.
  - Dependências: #31.

- [ ] **33.** [D] Escrever adapter mínimo `providers/fake/` → modo "replay": capturar N mensagens reais recentes de produção (via view read-only, sem PII sensível além do já exposto no schema `zapp`) e reproduzi-las como fixture do ensaio de troca (F3), aumentando o realismo do teste além de payloads sintéticos.
  - Objetivo: o ensaio de troca fica mais próximo do tráfego real (5.077 msgs/24h) sem tocar produção.
  - Artefato: `scripts/decouple/capture-replay-fixtures.mjs` + fixtures versionadas (anonimizadas) em `supabase/functions/_shared/providers/fake/__fixtures__/`.
  - Validação: fixtures geradas, sem PII crua (números de telefone truncados/hasheados).
  - Rollback: `git rm` das fixtures.
  - Dependências: #26.

- [ ] **34.** [R] Revisão de segurança das fixtures do passo 33: confirmar que nenhum dado real de cliente (nome completo, telefone completo) vaza para o repo git.
  - Objetivo: LGPD/segurança — dados de teste não podem ser dados reais de produção sem anonimização.
  - Artefato: checklist de revisão em `COVERAGE_V4.md`.
  - Validação: grep manual + revisão humana confirmando anonimização.
  - Rollback: se falhar, deletar fixtures do passo 33 e regenerar anonimizadas.
  - Dependências: #33.

- [ ] **35.** [R] Documentar a "matriz de substituibilidade": para cada uma das 4 portas (P1 front, P2 edge, P3 ingest, P4 SQL), o que precisa mudar para trocar de Evolution para outro provider, com esforço estimado (baixo/médio/alto) e o que já está pronto vs. pendente.
  - Objetivo: visão executiva de quão "trocável" o sistema é HOJE, não em teoria.
  - Artefato: tabela em `docs/decouple/SUBSTITUABILITY_MATRIX_V4.md`.
  - Validação: 4 portas cobertas, cada uma com evidência (arquivo/teste que prova o estado).
  - Rollback: `git rm`.
  - Dependências: #25–32, [herdado V3 RUNBOOK_TROCA_PROVIDER.md §2].

- [ ] **36.** [R] Cruzar a matriz do passo 35 com o `RUNBOOK_TROCA_PROVIDER.md` §2 (mapa das 4 portas) — corrigir qualquer divergência entre o que o runbook descreve e o que a auditoria fresca encontrou.
  - Objetivo: runbook e matriz não podem divergir — um é o "como", o outro é o "quão pronto".
  - Artefato: diff no runbook se houver divergência.
  - Validação: leitura cruzada dos dois docs sem contradição.
  - Rollback: `git revert`.
  - Dependências: #35.

- [ ] **37.** [R] Adicionar ao `registry.ts` um modo de configuração explícito `PROVIDER_UNDER_TEST` (só ativo com `DENO_ENV=test`) que permite trocar entre `evolution` e `fake` via variável de ambiente, sem editar código — prepara a infraestrutura para o ensaio cronometrado da F3.
  - Objetivo: a troca de provider no ensaio deve ser operacional (flag), não uma edição de código ad-hoc.
  - Artefato: diff em `registry.ts` + `docs/ENV_SETUP.md` atualizado.
  - Validação: `PROVIDER_UNDER_TEST=fake DENO_ENV=test` resolve fake; ausente resolve evolution real; guard de produção intacto (fora de `DENO_ENV=test`, sempre evolution).
  - Rollback: `git revert`.
  - Dependências: [herdado V3 #51], #25.

- [ ] **38.** [R] Teste unitário do guard: confirmar que `PROVIDER_UNDER_TEST=fake` **fora** de `DENO_ENV=test` é ignorado (nunca deixa o fake vazar para produção) — mitigação direta do cenário S6 do V3 ("fake ativo em prod = mensagens não enviadas").
  - Objetivo: reforçar a defesa contra o pior cenário de toda a fase.
  - Artefato: teste em `registry.test.ts`.
  - Validação: teste passa simulando `DENO_ENV=production` + `PROVIDER_UNDER_TEST=fake` → resolve `evolution`, não `fake`.
  - Rollback: `git rm` do teste (mas manter o guard em si).
  - Dependências: #37.

- [ ] **39.** [R] Rodar a suite completa (#28–30, #38) uma vez mais após as mudanças de #33–37 — checkpoint de regressão antes de seguir para o ensaio cronometrado.
  - Objetivo: nenhuma mudança de infraestrutura de teste quebrou o que já estava verde.
  - Artefato: log de execução.
  - Validação: 100% verde.
  - Rollback: n/a.
  - Dependências: #28–38.

- [ ] **40.** [R] Atualizar `docs/BOUNDARY-evolution.md` com a fronteira lógica final: 4 portas + contrato Zod + matriz de substituibilidade (referenciar `SUBSTITUABILITY_MATRIX_V4.md`) — fecha o resíduo 8 do V3 de forma mais completa que o V3 #63 previa.
  - Objetivo: BOUNDARY vira o documento vivo único de fronteira, com prova formal anexada.
  - Artefato: diff em `docs/BOUNDARY-evolution.md`.
  - Validação: seção nova "Prova de substituibilidade (V4)" com links.
  - Rollback: `git revert`.
  - Dependências: [herdado V3 #63], #35.

- [ ] **41.** [R] PR F2 → `feat/decouple-v4`; CI verde incluindo os novos testes de contrato/e2e/fake.
  - Objetivo: fase F2 fechada e mergeável.
  - Artefato: PR.
  - Validação: checks verdes.
  - Rollback: fechar PR sem merge.
  - Dependências: #25–40.

- [ ] **42.** [R] Merge de F2 em `feat/decouple-v4`.
  - Objetivo: consolidar a prova de substituibilidade na branch de release.
  - Artefato: merge commit.
  - Validação: `git log`.
  - Rollback: `git revert` do merge.
  - Dependências: #41.

- [ ] **43.** [R] Publicar o número de cobertura (F2 #31) e a matriz de substituibilidade (F2 #35) no `SCORECARD_V4.md` (rascunho, será finalizado em F8) como evidência viva da dimensão 9.
  - Objetivo: preparar o scorecard final com dados já coletados, evitando trabalho de última hora em F8.
  - Artefato: rascunho de `docs/decouple/SCORECARD_V4.md`.
  - Validação: seção dimensão 9 preenchida com número real + matriz.
  - Rollback: `git rm` do rascunho.
  - Dependências: #31, #35.

- [ ] **44.** [R] Retro curta da F2 em `docs/decouple/RETRO_V4.md` (rascunho): o que a prova de substituibilidade revelou de novo (ex.: gaps de #32) — mesma disciplina de honestidade do V3 #59.
  - Objetivo: registrar aprendizado enquanto está fresco, antes do ensaio da F3.
  - Artefato: seção inicial de `RETRO_V4.md`.
  - Validação: pelo menos 1 achado concreto documentado.
  - Rollback: `git rm`.
  - Dependências: #25–43.

---

## F3 · Runbook de troca — executar o ensaio que nunca foi feito (45–56) — [R][!], 1–2 dias

- [ ] **45.** [R] Revisar `RUNBOOK_TROCA_PROVIDER.md` §1 (pré-requisitos) contra o estado medido em F0/F1/F2: CI decouple (threshold 0 agora — mais forte que o gate original do runbook), saúde (A+), pipeline (DLQ 0), baseline (5.077 msgs/24h).
  - Objetivo: confirmar que os gates de entrada do runbook estão todos verdes ANTES do ensaio.
  - Artefato: checklist preenchido em `docs/decouple/ENSAIO_V4_LOG.md` (novo).
  - Validação: 4/4 gates verdes.
  - Rollback: se algum gate estiver vermelho, abortar e não iniciar o ensaio.
  - Dependências: F1 #9, [herdado V3 #6, RUNBOOK §1].

- [ ] **46.** [R] Adaptar o runbook para o ensaio fake↔evolution (o runbook original é Evolution→Cloud; o ensaio real desta rodada é Evolution→Fake→Evolution, já que o client `cloud` não existe — F0 #6): mapear os 8 passos do runbook para a troca via `PROVIDER_UNDER_TEST` (F2 #37).
  - Objetivo: usar a infraestrutura de teste construída na F2 para o ensaio real, sem inventar um segundo runbook.
  - Artefato: seção "Anexo — Ensaio Fake (V4)" no `RUNBOOK_TROCA_PROVIDER.md`.
  - Validação: 8 passos do runbook mapeados 1:1 para o ensaio fake, com nota clara de que Cloud real fica para trabalho futuro (dimensão 9 fecha com a prova de mecanismo, não com Cloud em produção).
  - Rollback: `git revert` da seção.
  - Dependências: F2 #37, [herdado V3 RUNBOOK §3].

- [ ] **47.** [!] Janela de ensaio em ambiente de teste (`DENO_ENV=test`, isolado — **nunca** contra o banco/edge de produção): ligar `PROVIDER_UNDER_TEST=fake`, medir cada um dos 8 passos com cronômetro real.
  - Objetivo: números reais, não estimativa — fecha a pendência "(2) executar ensaio de troca em staging" do SCORECARD dimensão 9.
  - Artefato: `docs/decouple/ENSAIO_V4_LOG.md` com timestamp de início/fim de cada passo.
  - Validação: 8/8 passos executados com tempo registrado; critérios de abort (erro >1%, DLQ >0, p95 >2×) monitorados e verdes durante o ensaio.
  - Rollback: `PROVIDER_UNDER_TEST` removido (volta a resolver `evolution`); ambiente de teste é descartável, não há estado de produção envolvido.
  - Dependências: #45–46, F2 #38 (guard de produção intacto).

- [ ] **48.** [R] Medir e registrar o tempo total do ensaio (soma dos 8 passos) e comparar contra a estimativa do runbook original (30–60 min com ensaio prévio).
  - Objetivo: validar ou corrigir a estimativa de tempo do runbook com dado real.
  - Artefato: linha "Tempo real medido" em `ENSAIO_V4_LOG.md`.
  - Validação: número presente, com desvio calculado vs. estimativa.
  - Rollback: n/a.
  - Dependências: #47.

- [ ] **49.** [R] Executar o "passo 4" do runbook adaptado (degradação): forçar o fake a retornar erro durante o ensaio, confirmar que o app degrada como esperado (reforça F2 #29 em contexto de ensaio real, não só teste automatizado).
  - Objetivo: validar resiliência sob o próprio procedimento de troca, não só em isolamento.
  - Artefato: entrada em `ENSAIO_V4_LOG.md`.
  - Validação: degradação observada e documentada (screenshot ou log).
  - Rollback: reverter `PROVIDER_UNDER_TEST` para o estado normal do ensaio.
  - Dependências: #47, F2 #29.

- [ ] **50.** [R] Executar o "passo de rollback" do runbook (§4): reverter `PROVIDER_UNDER_TEST` para `evolution`, medir o tempo de rollback.
  - Objetivo: provar que o rollback é rápido e funcional, não só teórico (mitiga cenário onde o rollback documentado nunca foi testado na prática).
  - Artefato: entrada em `ENSAIO_V4_LOG.md` com tempo de rollback.
  - Validação: sistema volta a resolver `evolution` corretamente, testado via smoke (F1 #19).
  - Rollback: já É o rollback — não há rollback do rollback; se falhar, é um achado crítico a registrar, não a esconder.
  - Dependências: #47.

- [ ] **51.** [R] Atualizar `RUNBOOK_TROCA_PROVIDER.md` §8 (Evidências a arquivar) com os números reais do ensaio (#47–50) — remover a frase "ensaio nunca foi feito" e substituir pelo resultado datado.
  - Objetivo: o runbook deixa de ser só "documento de planejamento" e passa a ter 1 execução real documentada.
  - Artefato: diff no runbook.
  - Validação: seção 8 preenchida, rodapé do runbook atualizado com a data do ensaio.
  - Rollback: `git revert`.
  - Dependências: #47–50.

- [ ] **52.** [R] Atualizar `RUNBOOK_TROCA_PROVIDER.md` §5 (pontos de falha conhecidos) com qualquer surpresa encontrada durante o ensaio real (idempotência do `ingest_ledger`, envelope v1, etc. — confirmar se essas hipóteses se confirmaram ou não na prática).
  - Objetivo: pontos de falha deixam de ser só hipótese de design, viram achado validado (ou refutado) empiricamente.
  - Artefato: diff no runbook §5.
  - Validação: cada ponto de falha tem status "confirmado" ou "não observado no ensaio fake" anotado.
  - Rollback: `git revert`.
  - Dependências: #47–50.

- [ ] **53.** [⛔] Avaliar COM Joaquim se um ensaio real (Evolution↔Cloud, não só fake) é prioridade de negócio agora ou fica como trabalho futuro explícito — **decisão, não execução**: se não houver aprovação/orçamento para integração Meta Cloud, registrar como gap consciente, não como pendência disfarçada.
  - Objetivo: transparência sobre o limite do V4 — dimensão 9 fecha com "mecanismo de troca provado" (fake), não necessariamente com "troca para Cloud provada" (exigiria app Meta, phone number, aprovação de templates — fora do escopo de codebase).
  - Artefato: decisão registrada em `ENSAIO_V4_LOG.md` (aprovado seguir só com fake / aprovado investir em Cloud real).
  - Validação: resposta explícita de Joaquim registrada com data.
  - Rollback: n/a (é uma decisão, não uma ação técnica).
  - Dependências: #51–52.

- [ ] **54.** [R] Se Joaquim aprovar seguir só com fake (caminho pragmático, alinhado à regra 12 "seja pragmático"): documentar explicitamente em `SCORECARD_V4.md` que a nota 10/10 da dimensão 9 significa "mecanismo de troca provado e ensaiado com provider substituto controlado", não "troca para Meta Cloud em produção" — sem inflar o escopo da nota.
  - Objetivo: nota honesta, sem sucesso fabricado (mesma disciplina do V3 #59).
  - Artefato: nota explícita no scorecard rascunho.
  - Validação: texto presente e sem ambiguidade.
  - Rollback: `git revert`.
  - Dependências: #53.

- [ ] **55.** [R] PR F3 → `feat/decouple-v4`; CI verde; runbook e ensaio documentados.
  - Objetivo: fase F3 fechada.
  - Artefato: PR.
  - Validação: checks verdes, `ENSAIO_V4_LOG.md` e runbook atualizado presentes no diff.
  - Rollback: fechar PR sem merge.
  - Dependências: #45–54.

- [ ] **56.** [R] Merge de F3 em `feat/decouple-v4`.
  - Objetivo: consolidar a prova de troca executada.
  - Artefato: merge commit.
  - Validação: `git log`.
  - Rollback: `git revert`.
  - Dependências: #55.

---

## F4 · Vault/Secrets — dedup sem regredir a dimensão 7 (57–64) — [D][!][⛔], requer APROVADO

A dimensão 7 (egresso SQL/vault) já está em 9/10 no SCORECARD. F4 não é o foco do V4, mas a pendência (2 pares duplicados) é dependência real do runbook de troca (§5 "Vault com secrets duplicados") — resolvida aqui com o mesmo rigor expand/contract do V3 F4, sem regredir a nota já alcançada.

- [ ] **57.** [R] Consultar o vault via MCP Supabase (`supabase_db_vault_secrets` ou `db_query` equivalente) para confirmar hoje, com dado vivo, os 10 secrets `evolution_*` e os 2 pares duplicados citados no SCORECARD (`evolution_api_key`/`_v2`, `evolution_webhook_secret`/`webhook_secret_evolution`).
  - Objetivo: mesma disciplina de F0 — não assumir, medir.
  - Artefato: saída da query anexada a `docs/decouple/VAULT_SECRETS_V4.md`.
  - Validação: contagem real de secrets confirmada.
  - Rollback: n/a (leitura).
  - Dependências: [herdado V3 #41–42].

- [ ] **58.** [R] Mapear consumidores de cada par (edge env, stack secrets, resolvers SQL `ops.fn_evo_key`) — tabela secreto × consumidor, igual ao V3 #41 mas atualizada.
  - Objetivo: saber exatamente quem quebra se o secreto errado for removido.
  - Artefato: tabela em `VAULT_SECRETS_V4.md`.
  - Validação: 100% dos consumidores mapeados (nenhum "desconhecido" na tabela).
  - Rollback: n/a.
  - Dependências: #57.

- [ ] **59.** [⛔] APROVADO de Joaquim → expand: garantir que TODOS os consumidores mapeados em #58 leiam o secreto canônico (decidido por evidência de uso real, não por ordem alfabética).
  - Objetivo: preparar o terreno antes de remover qualquer secreto.
  - Artefato: diff nos resolvers/config que ainda apontam para o par não-canônico.
  - Validação: 0 consumidores restantes no par obsoleto.
  - Rollback: `git revert` por consumidor (1 commit por consumidor, como V3 #45).
  - Dependências: #58, aprovação explícita.

- [ ] **60.** [⛔][!] Janela noturna: confirmar 48h sem regressão (erro de envio ≤1%, DLQ 0) com o secreto canônico em uso exclusivo, ANTES de apagar o par obsoleto.
  - Objetivo: contract, não só expand — mesma disciplina do V3 (mitigação S3: "algum consumidor com config cacheada quebra").
  - Artefato: log de monitoramento de 48h.
  - Validação: 0 incidentes atribuíveis à troca de secreto.
  - Rollback: reverter para o par obsoleto se houver qualquer regressão.
  - Dependências: #59.

- [ ] **61.** [⛔][!] Apagar o par obsoleto do vault; atualizar `ops.fn_bodies_backup` com o estado pós-remoção.
  - Objetivo: fechar a dimensão 7 para 10/10 sem reabrir risco.
  - Artefato: DDL de remoção do secreto + snapshot atualizado.
  - Validação: vault com 8 secrets `evolution_*` (10 − 2 duplicados), 0 pares.
  - Rollback: recriar o secreto a partir do backup se algo depender dele inesperadamente.
  - Dependências: #60.

- [ ] **62.** [R] Normalizar o alias `evolution_api_key_v6→v4` do stack 25 (resíduo G7 do V3, nunca fechado) na mesma leva — documentar na rotação.
  - Objetivo: fechar o último resíduo pontual de nomenclatura de secret.
  - Artefato: diff no stack file + nota em `VAULT_SECRETS_V4.md`.
  - Validação: alias único, sem verskoesao dupla.
  - Rollback: `git revert`.
  - Dependências: [herdado V3 #48], #61.

- [ ] **63.** [R] Atualizar `RUNBOOK_TROCA_PROVIDER.md` §5 removendo a menção a "Vault com secrets duplicados" como ponto de falha conhecido (já resolvido) — runbook deixa de citar um risco que não existe mais.
  - Objetivo: runbook sempre reflete o estado real do vault.
  - Artefato: diff no runbook.
  - Validação: seção §5 atualizada.
  - Rollback: `git revert`.
  - Dependências: #61.

- [ ] **64.** [R] PR F4 → `feat/decouple-v4` (executado só se #59 teve APROVADO explícito; caso contrário, PR documenta o plano sem executar, igual ao V3 #43).
  - Objetivo: fase F4 fechada — executada ou conscientemente adiada, nunca ambígua.
  - Artefato: PR.
  - Validação: CI verde; estado do vault documentado de qualquer forma.
  - Rollback: fechar PR sem merge se não aprovado.
  - Dependências: #57–63.

---

## F5 · Aposentadoria de resíduos — fechar os 12 itens do V3 que sobraram (65–74) — [R], 1 dia

- [ ] **65.** [R] Branches zumbis: conferir estado de `feat/decouple-v2`, `feat/decouple-provider`, `chore/remove-evolution-infra-to-evolution-stack`, `docs/pos-desacoplamento-20260814` — se sem PR aberta, deletar (resíduo 11 do V3, [herdado V3 #83], nunca executado).
  - Objetivo: higiene de repo, sem risco (branches não são código em produção).
  - Artefato: lista de branches deletadas em `docs/decouple/RETRO_V4.md`.
  - Validação: `git branch -a` não lista mais essas 4.
  - Rollback: branches remotas deletadas podem ser recriadas a partir do último commit conhecido (registrar os SHAs antes de deletar).
  - Dependências: [herdado V3 #83], confirmar 0 PRs abertas antes.

- [ ] **66.** [R] Tag `decouple-v4-baseline` em zapp-web-v3, análoga à `decouple-v3-baseline` do V3 #1 — fecha o resíduo 9 remanescente (V2 nunca teve tag; V3 teve; V4 mantém a disciplina).
  - Objetivo: rastreabilidade de baseline por versão do plano.
  - Artefato: tag git.
  - Validação: `git tag -l "decouple-v4-baseline"`.
  - Rollback: `git tag -d`.
  - Dependências: F0 #8.

- [ ] **67.** [R] Recriar `check-publish-evo-fallbacks` no repo `evolution-stack` (`image/tests/`) com paths corretos — resíduo 10/G1 do V3, [herdado V3 #81], nunca executado (repo separado, fora do escopo de código deste repo, mas documentar a pendência com o path exato).
  - Objetivo: fechar o gap de teste identificado no V3, mesmo sendo em outro repositório.
  - Artefato: nota em `docs/decouple/RETRO_V4.md` com a ação pendente E o path exato esperado (`evolution-stack/image/tests/check-publish-evo-fallbacks`) para quem tiver acesso ao outro repo executar.
  - Validação: nota registrada; se o outro repo estiver acessível nesta sessão, executar diretamente.
  - Rollback: n/a.
  - Dependências: [herdado V3 #81].

- [ ] **68.** [R] Auditar as 27 tabelas `evo.*` remanescentes (Grupo A, migradas fisicamente para `zapp` — dimensão 2 do SCORECARD, 9/10) quanto à janela de observação: quanto tempo desde a migração, quantas leituras/escritas diretas ainda ocorrem nelas.
  - Objetivo: dado para decidir aposentadoria (drop ou congelamento formal) sem adivinhar — ação P2 do SCORECARD dimensão 2.
  - Artefato: query de auditoria + resultado em `docs/decouple/EVO_RETIREMENT_V4.md`.
  - Validação: contagem de acessos nos últimos 7 dias por tabela.
  - Rollback: n/a (leitura).
  - Dependências: nenhuma (independente, mas relacionado à dimensão 2 que já está em 9/10 — não regredir).

- [ ] **69.** [R] Se `#68` mostrar 0 acessos diretos em 7+ dias: **congelamento formal** (revogar grants restantes, marcar comentário SQL `-- CONGELADO 2026-08-XX, ver EVO_RETIREMENT_V4.md`) — **NÃO fazer DROP** nesta rodada (drop físico é irreversível e fora do escopo pragmático do V4; congelamento é reversível e já fecha o resíduo).
  - Objetivo: avançar a dimensão 2 rumo a 10/10 sem o risco de um DROP irreversível — decisão consciente de não regredir a produção.
  - Artefato: DDL de congelamento (comentário + revogação de grants residuais, se houver).
  - Validação: `evo.*` (27 tabelas) com 0 grants a `authenticated` (já é o caso, confirmar) + comentário de congelamento presente.
  - Rollback: `COMMENT ON TABLE ... IS NULL` reverte o comentário; grants não foram concedidos de volta automaticamente (decisão consciente).
  - Dependências: #68.

- [ ] **70.** [R] Atualizar ADR-008 com a decisão de congelamento (não-drop) das 27 tabelas `evo`, citando `docs/db/BACKCOMPAT-VIEWS.md` e `docs/db/SCHEMA-CONTRACT.md` como razão (as 27 tabelas ainda são base física das views de compat geridas por `evo.fn_ensure_evolution_backcompat_views` — dropar quebraria o cron de 6h que recria views).
  - Objetivo: registrar POR QUE não se dropou — decisão de engenharia, não negligência.
  - Artefato: seção nova em ADR-008.
  - Validação: seção presente, cross-referenciando os 2 docs normativos.
  - Rollback: `git revert`.
  - Dependências: #69, leitura de `BACKCOMPAT-VIEWS.md`/`SCHEMA-CONTRACT.md`.

- [ ] **71.** [R] Validar chamadores restantes de `rpc_upsert_contact` pós-consolidação (resíduo do V3 #96, "S10" — nunca reconfirmado formalmente no V4).
  - Objetivo: fechar o loop do único RPC que teve overload removido, garantindo que não sobrou nenhum chamador do formato antigo.
  - Artefato: query em `pg_stat_statements`/logs de erro por `PGRST` code, resultado anexado a `RETRO_V4.md`.
  - Validação: 0 erros de chamada com overload antigo em 7 dias.
  - Rollback: n/a (auditoria).
  - Dependências: [herdado V3 #96].

- [ ] **72.** [R] Auditar demais RPCs de ingestão quanto a overloads ausentes (ação P1 da dimensão 6 do SCORECARD, "garantir overload em todos os RPCs de escrita").
  - Objetivo: fechar a última pendência pontual da dimensão 6 (hoje 9/10) sem regredir.
  - Artefato: tabela de RPCs de ingestão × overloads em `docs/decouple/RPC_AUDIT_V4.md`.
  - Validação: cada RPC de escrita tem exatamente 1 overload ativo (mesmo padrão consolidado do `rpc_upsert_contact`).
  - Rollback: n/a (auditoria; correções pontuais seguem 1 commit por RPC se necessário).
  - Dependências: #71.

- [ ] **73.** [R] Atualizar `CHANGELOG.md` (zapp-web-v3) com os marcos do V4: gates CI endurecidos, ensaio de troca executado, secrets deduplicados (se aprovado), tabelas evo congeladas.
  - Objetivo: histórico do projeto reflete o fechamento real do desacoplamento.
  - Artefato: nova entrada no topo do `CHANGELOG.md`.
  - Validação: entrada presente com data e números (herdado V3 #90, agora com dados do V4).
  - Rollback: `git revert`.
  - Dependências: F1–F4 concluídas.

- [ ] **74.** [R] PR F5 → `feat/decouple-v4`; CI verde.
  - Objetivo: fase F5 fechada.
  - Artefato: PR.
  - Validação: checks verdes.
  - Rollback: fechar PR sem merge.
  - Dependências: #65–73.

---

## F6 · Documentação canônica — congelar o que o V4 provou (75–84) — [R], 1 dia

- [ ] **75.** [R] Congelar o modelo canônico do ADR-008 via contrato versionado: referenciar formalmente o schema Zod criado em F2 #16 como a "versão executável" do ADR (ação P1 da dimensão 8 do SCORECARD).
  - Objetivo: o ADR deixa de ser só prosa — vira prosa + contrato testável andando junto.
  - Artefato: seção "Contrato executável" em ADR-008 linkando `evolutionGateway.zod.ts`.
  - Validação: link presente, schema importável e testado (F1 #17).
  - Rollback: `git revert`.
  - Dependências: F0 #3, F1 #16.

- [ ] **76.** [R] Criar `docs/decouple/CANONICAL_COLUMN_MAP.md` (mapa coluna×campo, fonte: `src/domain/messaging/types.ts` + normalizers) — resíduo do V3 #62, nunca criado apesar de estar no plano.
  - Objetivo: fechar o gap documental que a `SIMULATION_SCENARIOS_20260814.md` também identificou como ausente.
  - Artefato: novo doc.
  - Validação: cada campo canônico (`ChannelMessage`, `ChannelContact`, `ChannelConversation`) mapeado para a coluna Postgres correspondente em `zapp.evolution_*`.
  - Rollback: `git rm`.
  - Dependências: [herdado V3 #62 — nunca executado], F0 #3.

- [ ] **77.** [R] Atualizar `docs/BOUNDARY-evolution.md` (já parcialmente feito em F2 #40) com o link para `CANONICAL_COLUMN_MAP.md` e `RPC_AUDIT_V4.md`.
  - Objetivo: BOUNDARY vira o hub central de toda a documentação de fronteira.
  - Artefato: diff.
  - Validação: 3 links novos presentes.
  - Rollback: `git revert`.
  - Dependências: #76, F5 #72.

- [ ] **78.** [R] Índice canônico `docs/decouple/README.md` — 1 entrada por doc, marcando vivo/histórico (herdado V3 #66, nunca criado) — agora incluindo os documentos novos do V4 (BASELINE_V4, ENSAIO_V4_LOG, SUBSTITUABILITY_MATRIX_V4, COVERAGE_V4, VAULT_SECRETS_V4, EVO_RETIREMENT_V4, RPC_AUDIT_V4, CI_GATES_V4, SCORECARD_V4, RETRO_V4).
  - Objetivo: próximo agente entra em `docs/decouple/` e sabe imediatamente o que ler primeiro.
  - Artefato: novo `README.md`.
  - Validação: todos os docs de `docs/decouple/` listados com status vivo/histórico.
  - Rollback: `git rm`.
  - Dependências: [herdado V3 #66], todos os docs criados até aqui.

- [ ] **79.** [R] Marcar HISTÓRICO (banner + link canônico, sem reescrever) os planos V1, V2 e V3 — o V3 vira histórico assim que o V4 for o plano vigente (mesma disciplina do V3 #64 aplicada a si mesmo).
  - Objetivo: próximo agente não confunde V3 como plano ativo depois que o V4 fechar.
  - Artefato: banner no topo de `PLANO_DESACOPLAMENTO_V3_100_ETAPAS.md` (e V1/V2 se ainda sem banner).
  - Validação: banner presente, sem edição do conteúdo histórico abaixo dele.
  - Rollback: `git revert`.
  - Dependências: F9 (só marcar HISTÓRICO depois que o V4 realmente fechar — este item referencia F9 como gate, mas a EDIÇÃO do banner é preparada aqui).

- [ ] **80.** [R] Cross-check final: nenhum doc VIVO em `docs/decouple/` referencia "relicto da fase Lovable" ou estado pré-desacoplamento sem banner (reconfirmar V3 #70, que já validou isso — checar se não regrediu com os novos docs do V4).
  - Objetivo: manter a higiene documental já alcançada.
  - Artefato: grep de verificação.
  - Validação: 0 ocorrências sem banner.
  - Rollback: adicionar banner onde faltar.
  - Dependências: [herdado V3 #70].

- [ ] **81.** [R] Atualizar `README.md` raiz do zapp: seção "Integrações → WhatsApp" aponta para ADR-009/010 + BOUNDARY + o novo `SUBSTITUABILITY_MATRIX_V4.md` (evolução do V3 #67).
  - Objetivo: ponto de entrada do repo reflete o estado mais recente.
  - Artefato: diff no `README.md`.
  - Validação: link novo presente e funcional.
  - Rollback: `git revert`.
  - Dependências: F2 #35, [herdado V3 #67].

- [ ] **82.** [R] Atualizar `FEATURE_REGISTRY.md` com o fechamento do desacoplamento (dimensões 9 e 10) como marco, complementando a entrada que o V3 #68 já adicionou para a migração física.
  - Objetivo: registro histórico do produto reflete o marco de fechamento, não só o de migração.
  - Artefato: nova entrada (adicionar, não substituir — regra da `SIMULATION_SCENARIOS_20260814.md` A10: "apenas adicionar features novas ao registry, não remover").
  - Validação: entrada nova presente, entradas antigas intactas.
  - Rollback: `git revert`.
  - Dependências: [herdado V3 #68].

- [ ] **83.** [R] Verificar `docs/db/SCHEMA-CONTRACT.md` quanto a qualquer objeto novo criado pelo V4 (schemas Zod não são objetos SQL — não se aplica; mas os secrets/tabelas congeladas de F4/F5 devem respeitar o contrato de schemas existente).
  - Objetivo: nenhuma etapa do V4 violou o contrato normativo de schemas.
  - Artefato: checklist de conformidade em `docs/decouple/RETRO_V4.md`.
  - Validação: 0 violações (nenhum objeto de negócio criado em `public`, nenhuma dependência `evo → zapp`).
  - Rollback: corrigir o objeto que violar, se houver.
  - Dependências: F4, F5.

- [ ] **84.** [R] PR F6 → `feat/decouple-v4` (docs apenas); CI verde.
  - Objetivo: fase F6 fechada.
  - Artefato: PR.
  - Validação: checks verdes.
  - Rollback: fechar PR sem merge.
  - Dependências: #75–83.

---

## F7 · Simulação de cenários extremos — estressar o plano antes de declarar vitória (85–90) — [R], 0,5 dia

F7 não são os 12 cenários já mitigados pelo V3 (S1–S12, herdados e válidos) — são cenários NOVOS, específicos das mudanças que o V4 introduz (threshold 0, contrato Zod, ensaio fake, congelamento de tabelas, dedup de secrets). A tabela completa (mínimo 15 cenários) está na seção seguinte; os 6 passos abaixo são a EXECUÇÃO da simulação antes de cada fase de risco.

- [ ] **85.** [R] Rodar a simulação da tabela de cenários (seção "Cenários extremos V4" abaixo) ANTES de iniciar F1 (gates) — focar nos cenários E1–E5 (relacionados a CI/threshold).
  - Objetivo: mesma disciplina do V3 (VALIDACAO_V3 §4: simulação ANTES de escrever/executar, não depois).
  - Artefato: linha de veredito por cenário em `docs/decouple/CENARIOS_V4_LOG.md`.
  - Validação: mitigação de cada cenário E1–E5 confirmada como já presente no desenho de F1.
  - Rollback: n/a (é simulação, não execução).
  - Dependências: seção "Cenários extremos V4".

- [ ] **86.** [R] Repetir para F2/F3 (prova de substituibilidade + ensaio) — cenários E6–E11.
  - Objetivo: idem, para a fase de maior novidade técnica do V4.
  - Artefato: idem, em `CENARIOS_V4_LOG.md`.
  - Validação: idem.
  - Rollback: n/a.
  - Dependências: seção "Cenários extremos V4".

- [ ] **87.** [R] Repetir para F4/F5 (secrets + aposentadoria) — cenários E12–E15.
  - Objetivo: idem, para a fase que toca produção de forma mais sensível (vault, congelamento de tabelas).
  - Artefato: idem.
  - Validação: idem.
  - Rollback: n/a.
  - Dependências: seção "Cenários extremos V4".

- [ ] **88.** [R] Repetir para F6/F8/F9 (docs + validação + cutover) — cenários E16–E18.
  - Objetivo: idem, para a fase de fechamento (onde erros de documentação/merge são o risco residual).
  - Artefato: idem.
  - Validação: idem.
  - Rollback: n/a.
  - Dependências: seção "Cenários extremos V4".

- [ ] **89.** [R] Consolidar `CENARIOS_V4_LOG.md`: qualquer cenário SEM mitigação clara no plano atual vira um item novo a adicionar antes de prosseguir (loop de segurança).
  - Objetivo: nenhum cenário fica "conhecido e ignorado" — ou tem mitigação, ou vira trabalho.
  - Artefato: log consolidado.
  - Validação: 18/18 cenários com mitigação confirmada ou ação corretiva registrada.
  - Rollback: n/a.
  - Dependências: #85–88.

- [ ] **90.** [R] PR F7 → `feat/decouple-v4` (docs apenas — o log de simulação).
  - Objetivo: fase F7 fechada.
  - Artefato: PR.
  - Validação: CI verde.
  - Rollback: fechar PR sem merge.
  - Dependências: #85–89.

### Cenários extremos V4 (mínimo 15 — tabela completa)

| # | Cenário | O que aconteceria se feito errado | Mitigação no V4 |
|---|---|---|---|
| E1 | Threshold 0 trava CI por falso-positivo de string em teste/doc novo (ex.: o próprio `contract.test.ts` casa no regex de bypass) | PRs legítimos bloqueados, pressão para relaxar o gate de volta | F1 #24: whitelist de tooling explícita, nunca relaxar o threshold — mesma disciplina do V3 S1 |
| E2 | `verb-contract-gate.mjs` (F1 #15) conta métodos herdados de protótipo/mixins e infla o número de verbos | Gate falha em 12 real vs. N contado errado | F1 #15: contagem via AST de exports nomeados, não `Object.keys` em runtime; teste do próprio gate contra fixture conhecida |
| E3 | Contrato Zod (F1 #16) fica desatualizado silenciosamente quando o client muda de shape sem que ninguém rode o teste localmente | Contrato "verde" no CI mas divergente da realidade em produção | F1 #18: contrato roda em TODO PR que toca `client.ts` (path-based CI trigger), não só sob demanda |
| E4 | `run-all-gates.mjs` (F1 #14) mascara qual dos 3 gates falhou, dificultando debug | Agente perde tempo tentando descobrir qual gate quebrou | F1 #14: saída agregada mas com seção por gate, exit code composto e log completo de cada um preservado |
| E5 | Smoke test de gateway (F1 #19) usa fixture desatualizada e passa mesmo com client real quebrado | Falso senso de segurança — CI verde, produção quebrada | F1 #19+F2 #27: smoke usa o MESMO schema Zod do contrato real, não fixture solta — qualquer drift de shape quebra os dois juntos |
| E6 | Fake provider (F2 #26) implementado com shape sutilmente diferente do real, ensaio "passa" mas não prova nada | Prova de substituibilidade fabricada, dimensão 9 nota inflada sem lastro | F2 #27: MESMO schema Zod valida fake E evolution real — impossível o fake divergir sem quebrar o teste |
| E7 | Fixtures de replay (F2 #33) vazam PII real para o repo git público/privado | Incidente de privacidade/LGPD | F2 #34: revisão de segurança dedicada antes de commitar, anonimização obrigatória, checklist explícito |
| E8 | `PROVIDER_UNDER_TEST=fake` vaza para produção por erro de config de ambiente (variável de ambiente compartilhada entre stacks) | Mensagens reais de clientes não são enviadas — pior cenário do plano inteiro | F2 #38: guard testado unitariamente — `DENO_ENV` fora de `test` sempre ignora `PROVIDER_UNDER_TEST`, sem exceção de config |
| E9 | Ensaio cronometrado (F3 #47) roda em horário comercial e consome recursos do ambiente de teste compartilhado, afetando outros devs | Ruído/lentidão para o time durante o ensaio | F3 #47: ambiente de teste isolado (`DENO_ENV=test`), sem contenção com produção; se compartilhado com CI, agendar fora de picos |
| E10 | Ensaio "prova" mecanismo de troca mas ninguém testa o CAMINHO INVERSO (rollback real sob estresse, não só reversão limpa) | Rollback documentado nunca validado sob falha real | F3 #50: passo de rollback é medido e testado explicitamente, não assumido |
| E11 | Dimensão 9 é declarada 10/10 mas na prática só prova troca para um provider FAKE, criando falsa sensação de que Cloud real está pronto | Expectativa de negócio desalinhada com a capacidade real do sistema | F3 #54: nota do scorecard explicita o escopo exato do que foi provado — mecanismo, não Cloud em produção |
| E12 | Dedup de secrets (F4 #61) remove o par errado por erro de leitura da tabela de consumidores | Rotação quebra envio de mensagens em produção | F4 #58 mapeia consumidores por evidência real de uso ANTES de decidir qual é o canônico; #60 exige 48h de soak antes do delete |
| E13 | Congelamento de tabelas `evo` (F5 #69) revoga um grant que na verdade era necessário para o cron de backcompat views (`evo.fn_ensure_evolution_backcompat_views`, roda a cada 6h) | Views de compat param de ser recriadas, quebra silenciosa em até 6h | F5 #70: decisão documentada e cross-referenciada com `BACKCOMPAT-VIEWS.md`; #69 só revoga grants a `authenticated` (já em 0), nunca toca o role que a função de compat usa |
| E14 | Branch zumbi deletada (F5 #65) tinha PR aberta que ninguém viu | PR fica orfã, CI fantasma, contribuidor perde trabalho | F5 #65: registrar SHA antes de deletar + confirmar 0 PRs abertas via `gh pr list --head <branch>` antes de qualquer delete (mitigação S9 do V3, reaplicada) |
| E15 | RPC audit (F5 #72) encontra um RPC de escrita com 2+ overloads ativos e "corrige" removendo o errado sem checar chamadores reais | Repete o mesmo risco que o `rpc_upsert_contact` já teve (S10 do V3) | F5 #72: qualquer remoção de overload segue o mesmo protocolo do V3 (verificar chamadores PostgREST positional × named antes de dropar) |
| E16 | Banner de HISTÓRICO no V3 (F6 #79) quebra um link relativo que outro doc usa | Próximo agente segue link morto | F6 #79: banner adicionado sem mover/renomear o arquivo — link relativo permanece válido, só o topo do doc muda |
| E17 | `docs/decouple/README.md` (F6 #78) fica desatualizado no mesmo dia em que é criado, porque um doc novo é adicionado depois sem atualizar o índice | Índice mente sobre o que existe | F8 #93 inclui recontagem de arquivos em `docs/decouple/` vs. entradas do índice como parte da validação final |
| E18 | PR final de F9 (merge para `main`) conflita com um commit concorrente do Hermes ou outro agente rodando em paralelo | Merge quebrado ou squash perde commits | F9: checar `git log main..feat/decouple-v4` e `git fetch` imediatamente antes do merge final; resolver conflito manualmente, nunca `git checkout --theirs/--ours` às cegas |

---

## F8 · Validação exaustiva independente (91–97) — [R][!], 1 dia

- [ ] **91.** [R] Onda de agentes paralelos (estilo V3 #91, adaptada ao escopo do V4): cada um valida 1 frente com EVIDÊNCIA FRESCA — (a) CI gates reais rodando, (b) contrato Zod + testes de contrato, (c) ensaio cronometrado documentado, (d) vault pós-dedup (se aprovado em F4), (e) tabelas evo congeladas, (f) docs canônicos atualizados.
  - Objetivo: mesma disciplina de validação cruzada e independente do V3, agora focada nas 2 dimensões que o V4 fecha.
  - Artefato: 6 relatórios de agente.
  - Validação: cada frente com evidência fresca (comando/query/output), não citação de doc.
  - Rollback: n/a (validação).
  - Dependências: F1–F7 concluídas.

- [ ] **92.** [R] Consolidar as 6 evidências em `docs/decouple/VALIDACAO_V4.md` (1 seção por frente, com output real).
  - Objetivo: documento de validação final, no mesmo padrão de `VALIDACAO_V3.md`.
  - Artefato: novo doc.
  - Validação: 6 seções preenchidas.
  - Rollback: `git rm`.
  - Dependências: #91.

- [ ] **93.** [R] Reconferir TODAS as dimensões 1–8 do SCORECARD (não só 9–10) para confirmar que nenhuma regrediu — gate explícito da regra 2 do V4 ("sem regredir as notas 9–10 já alcançadas").
  - Objetivo: a regra de não-regressão é validada com evidência, não assumida.
  - Artefato: tabela comparativa SCORECARD_V3 vs. estado medido agora, dimensão por dimensão.
  - Validação: dimensões 3, 4 mantêm 10/10; dimensões 1, 2, 5, 6, 7, 8 mantêm ≥9/10 (ou sobem, nunca descem).
  - Rollback: se alguma dimensão regrediu, é um bloqueador de F9 — corrigir antes de prosseguir.
  - Dependências: #91–92.

- [ ] **94.** [R] Recalcular a nota das dimensões 9 e 10 com a evidência coletada em F1–F3: threshold 0 ativo + contrato Zod + smoke gateway (dimensão 10); cobertura medida + matriz de substituibilidade + ensaio cronometrado executado (dimensão 9).
  - Objetivo: nota final, não estimada — baseada nos artefatos reais produzidos.
  - Artefato: `docs/decouple/SCORECARD_V4.md` (versão final, não mais rascunho).
  - Validação: cada dimensão com evidência linkada (arquivo/comando), igual ao padrão do SCORECARD_V3.
  - Rollback: `git rm` se a nota não puder ser sustentada por evidência real (não inflar).
  - Dependências: #93, F1–F3.

- [ ] **95.** [R] Rodar `decouple-guard.yml` + `ownership-gate.yml` (+ os novos gates de F1) num PR sintético de verificação final — todos verdes.
  - Objetivo: prova final de que o pipeline de gates está saudável antes do cutover.
  - Artefato: log do PR sintético.
  - Validação: 100% dos checks verdes.
  - Rollback: fechar o PR sintético sem merge.
  - Dependências: F1 completo.

- [ ] **96.** [R] Validar novamente a saúde operacional: health A+, msgs/24h ≈ baseline (5.077, desvio aceitável documentado), DLQ 0, wpp2 `open` — confirmar que NENHUMA etapa do V4 afetou produção.
  - Objetivo: prova final de que "nunca desligar Evolution em produção" foi respeitado à risca.
  - Artefato: métricas atuais anexadas a `VALIDACAO_V4.md`.
  - Validação: 4/4 métricas dentro do esperado.
  - Rollback: n/a — se alguma métrica degradou, é um incidente a investigar antes de qualquer merge final.
  - Dependências: todas as fases anteriores.

- [ ] **97.** [R] PR F8 → `feat/decouple-v4` (docs de validação); CI verde.
  - Objetivo: fase F8 fechada.
  - Artefato: PR.
  - Validação: checks verdes.
  - Rollback: fechar PR sem merge.
  - Dependências: #91–96.

---

## F9 · Cutover/Encerramento (98–100) — [R], 0,5 dia

- [ ] **98.** [R] PR final `feat/decouple-v4` → `main`; conferir `git fetch` + `git log main..feat/decouple-v4` para checar conflitos concorrentes (mitigação E18) antes do merge; CI verde; merge squash (protocolo AGENTS.md).
  - Objetivo: fechamento formal do V4 na branch principal.
  - Artefato: PR + merge.
  - Validação: `main` com o histórico do V4 mergeado; todos os gates novos ativos em `main`.
  - Rollback: `git revert` do merge commit se algo passar despercebido.
  - Dependências: F0–F8 completas.

- [ ] **99.** [R] `docs/decouple/RETRO_V4.md` final: números medidos (tempo real de cada fase, tempo do ensaio, cobertura %), o que ficou explicitamente de fora (Cloud real, DROP de tabelas evo, branches de outro repo), e comparação honesta com a estimativa deste plano.
  - Objetivo: fechar com a mesma disciplina de honestidade do V3 (E81/E59) — sem sucesso fabricado.
  - Artefato: `RETRO_V4.md` final.
  - Validação: números reais presentes, gaps explícitos listados.
  - Rollback: `git revert`.
  - Dependências: #98.

- [ ] **100.** [R] Encerramento: marcar `SCORECARD_V4.md` como o scorecard vigente (banner HISTÓRICO no `SCORECARD_V3.md` apontando para o V4); deletar branch + worktree do V4 (cleanup AGENTS.md); `docs/decouple/README.md` atualizado com o V4 como plano canônico.
  - Objetivo: fechamento limpo, sem ambiguidade sobre qual documento é a fonte de verdade daqui em diante.
  - Artefato: banners atualizados + cleanup de branch/worktree.
  - Validação: `docs/decouple/README.md` aponta para V4 como vigente; `git worktree list` não lista mais o worktree do V4.
  - Rollback: n/a — é o fechamento.
  - Dependências: #98–99.

---

## Critérios objetivos de conclusão do desacoplamento

"Independente da Evolution API" significa, neste projeto, TODOS os itens abaixo — cada um com evidência verificável, não opinião:

1. **Mecanismo de troca provado**: existe um segundo provider (ainda que fake/controlado) que implementa os 12 verbos do contrato canônico, validado pelo MESMO schema Zod que valida o provider real, com e2e verde sem Evolution no ar (F2 #25–28).
2. **Zero bypass estrutural**: `inventory.mjs` TOTAL = 0, travado no CI com threshold 0 (não frouxo), testado deliberadamente contra regressão (F1 #9–11).
3. **Contrato formal, não informal**: os 12 verbos do gateway têm shape definido em schema Zod versionado, testado a cada PR que toca o client (F1 #16–18).
4. **Ensaio cronometrado real**: ao menos 1 execução ponta a ponta da troca de provider foi medida com tempo real, incluindo rollback medido — não é só um documento de planejamento (F3 #47–50).
5. **Runbook operacional, não teórico**: `RUNBOOK_TROCA_PROVIDER.md` reflete uma execução real, com pontos de falha confirmados ou refutados empiricamente, não só hipóteses de design (F3 #51–52).
6. **Modelo canônico congelado**: ADR-008 aceito, com contrato executável (Zod) anexado, e mapa coluna×campo publicado (F6 #75–76).
7. **Governança contínua**: qualquer PR que reintroduza acoplamento (bypass de gateway, import direto de `evolutionClient`, `VITE_EVOLUTION_API_URL` fora do adapter, verbo fora do contrato de 12) falha o CI automaticamente, sem intervenção manual (F1 completo).
8. **Zero regressão nas dimensões já maduras**: dimensões 1–8 do SCORECARD mantêm ou melhoram a nota, com evidência comparativa (F8 #93).
9. **Produção intocada**: Evolution nunca foi desligada, `wpp2` permanece `open`, msgs/24h e DLQ dentro do baseline durante toda a execução do V4 (F8 #96).
10. **Transparência de escopo**: onde o desacoplamento NÃO foi provado até o fim (ex.: Cloud API real da Meta, DROP físico de tabelas `evo`), isso está documentado explicitamente como decisão consciente, não como lacuna escondida (F3 #53–54, F5 #69).

Cumpridos os 10 critérios, o sistema está "desacoplado" no sentido prático que importa para o negócio: **pode trocar de provider de WhatsApp sem reescrever a aplicação**, mesmo que a troca para um provider específico (Meta Cloud) ainda exija trabalho de integração que está fora do escopo de código (aprovação de app Meta, templates, phone number) — esse último trabalho é claramente rotulado como fora do escopo do V4, não fingido como concluído.

---

## Modelo de execução

| Fase | Risco | Modo | Gate de entrada |
|---|---|---|---|
| F0 | nenhum | sequencial rápido | — |
| F1 | baixo (CI) | sequencial | cenários E1–E5 simulados |
| F2 | médio (testes/infra de teste) | sequencial | cenários E6–E11 simulados |
| F3 | médio (ensaio em ambiente de teste) | sequencial estrito | gates de entrada do runbook §1 verdes |
| F4 | alto (secrets em produção) | sequencial estrito | APROVADO + expand/contract |
| F5 | baixo–médio (congelamento de tabelas) | sequencial | cenário E13 simulado |
| F6 | baixo (docs) | paralelizável (múltiplos docs independentes) | leitura de fontes-de-verdade |
| F7 | nenhum (simulação) | sequencial | — |
| F8 | nenhum (read-only) | onda paralela | baseline V4 registrado (F0) |
| F9 | baixo (merge) | sequencial estrito | F0–F8 concluídas, `git fetch` limpo |

**Estimativa total:** 6–9 dias úteis (F4 depende de janela de APROVADO; F3 depende da decisão de escopo em #53).

**Regras de abort (qualquer fase):** erro de envio >1% · DLQ com itens novos · p95 >2× baseline · health <95 · qualquer gate crítico voltando a >0 · qualquer sinal de que Evolution real foi afetada pelo ensaio de F3.

**Rollback universal:** `git revert` (código/docs) · `ops.fn_bodies_backup` → `CREATE OR REPLACE` (SQL, herdado) · tag `decouple-v4-baseline` (referência de estado) · `PROVIDER_UNDER_TEST` removido (volta a `evolution` imediatamente) · recriar secreto a partir de backup (vault).

---

## O que este plano deliberadamente NÃO faz

- Não implementa um client `providers/cloud/` completo para WhatsApp Cloud API da Meta — isso exige aprovação de app Meta Business, phone number dedicado e aprovação de templates, fora do escopo de mudança de código (F3 #53).
- Não executa `DROP TABLE` nas 27 tabelas `evo.*` remanescentes — apenas congelamento formal e documentado, respeitando `docs/db/BACKCOMPAT-VIEWS.md` (F5 #69).
- Não renomeia nenhuma tabela, coluna, schema ou edge function (mesma proibição do V1/V2/V3, agora reforçada pelo gate de contrato Zod que tornaria qualquer rename de shape um erro de CI).
- Não desliga o caminho Evolution em produção em nenhum momento — o ensaio de troca roda inteiramente em `DENO_ENV=test` com provider fake.
- Não altera infraestrutura do `evolution-stack` (watchdogs, guardian, pgbackrest) — isso é escopo da F7 do V3 (G4–G7), que permanece pendente de APROVADO e fora do V4 (V4 foca nas dimensões 9 e 10, que são código/gates deste repo, não infra do outro repo).
- Não executa `git add`/`commit`/`push`/PR automaticamente — este documento é o plano; a execução de cada etapa é trabalho subsequente, sessão por sessão, com revisão humana nos pontos `[⛔]`.
