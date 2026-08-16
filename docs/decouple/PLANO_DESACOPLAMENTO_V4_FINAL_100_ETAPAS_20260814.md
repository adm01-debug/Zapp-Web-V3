# PLANO V4-FINAL — Desacoplamento Zapp Web V3 ↔ Evolution API · 100 etapas de fechamento

**Data:** 2026-08-14 · **Autores:** Hermes (orquestrador) + Claude Agent A8 + onda de 10 agentes validadores · **Base:** `PLANO_DESACOPLAMENTO_V4_CLAUDE_100_ETAPAS_20260814.md` (B, canônico) + importações do V4-Hermes (A) + 10 relatórios de validação com evidência fresca
**Escopo:** fechar as dimensões **9** (prova de troca de provider) e **10** (governança/gates) do SCORECARD_V3, corrigindo os fatos desatualizados que a onda de validação expôs, sem regredir as dimensões 1–8.
**Convenção:** `[R]` reversível sem deploy · `[D]` deploy/DDL · `[!]` toca produção · `[⛔]` requer APROVADO de Joaquim · `[herdado V3 #N]` pré-requisito concluído no V3.
**Regras de ouro:** worktree isolado · 1 fix por commit · PR por fase · **nunca desligar Evolution em produção** · banco é fonte de verdade · nunca renomear schema/tabela/coluna sem caminho de compatibilidade (`BACKCOMPAT-VIEWS.md` + `SCHEMA-CONTRACT.md`).

---

## Fatos corrigidos pela onda de validação (2026-08-14) — o V4-FINAL parte DAQUI, não dos docs antigos

| # | Doc antigo dizia | Realidade medida (evidência) |
|---|---|---|
| 1 | inventory TOTAL = 0 | **TOTAL = 1** — `supabase/functions/connection-health-check/index.ts:193` lê `EVOLUTION_API_URL` fora do gateway (backendUrlBypass) |
| 2 | inventory.mjs confiável | **2 bugs**: join() com separador do SO (Windows conta bypass fantasma, Linux não) + regex cega a invokes sub-path/dinâmicos (`evolution-api/get-media-base64`, template literals) |
| 3 | deploy-edge.sh sincroniza functions | **Não sincroniza `_shared/providers/**`** — registry.ts no volume de prod é V2 stale (hash `aca0cb90`) vs repo V3 (`45f22b96`); `providers/fake/` nem existe no runtime |
| 4 | 27 tabelas evo remanescentes | **29** (16 operacionais + 13 partições `evolution_webhook_events_v2_*`); zapp.evolution_* = **99** |
| 5 | 5.077 msgs/24h | **3.358** msgs/24h (medido hoje; baseline V3 era de outro dia) |
| 6 | guardian/pgbackrest fora de stack (G4) | **Já estão em stack** (262/264) — G4 fechado, V3 desatualizado |
| 7 | web digest `production-b87b4e9718a5` | **`production-ccdb663ba68d`** (deploy mais novo) |
| 8 | functions-health = 239 | **265** (239 deletado; V3 #79 e VALIDACAO_V3 errados) |
| 9 | fake provider cobre 12 verbos | **11/12** — falta `getProfilePicture`; tem `sendAudio` que o client real não exporta |
| 10 | evolution-credentials entrega apikey ao browser | GET já morreu com **410 Gone** (fix 14/08), mas ~66 linhas de código zumbi da key permanecem sem aposentadoria formal |
| 11 | Nenhum doc cita realtime no congelamento | **3+ subscriptions realtime ativas no schema `evo`** — congelar grants sem inventário as quebra |
| 12 | Grants evo limpos | Tabelas: 0 escrita ✅, mas **115 funções `evo.*` executáveis por `authenticated`** via grant PUBLIC default |
| 13 | Nenhuma function consome registry | Confirmado: **0 functions de produção importam `_shared/providers/registry`** — o mecanismo de troca não tem consumidor real ainda |
| 14 | evolution-templates saudável | Browser chama via `useWhatsAppTemplates` → **401 provável / feature quebrada** em produção |
| 15 | CANONICAL_COLUMN_MAP não existe | **Existe** (9.068 bytes, commit bb8daec5e) — B etapa 76 precisa virar "completar/validar", não "criar" |

---

## F0 · Reconciliação e proteção dos artefatos (1–8) — [R], 0,5 dia

- [ ] **1.** [R] Commit imediato dos planos V4 no worktree (hoje `??` não commitados — risco de perda apontado pelo agente docs-governance): `PLANO_DESACOPLAMENTO_V4_100_ETAPAS_20260814.md` (A), `PLANO_DESACOPLAMENTO_V4_CLAUDE_100_ETAPAS_20260814.md` (B) e este V4-FINAL.
  - Artefato: commit na branch do worktree. · Validação: `git status` limpo. · Rollback: `git reset`. · Dep: nenhuma.
- [ ] **2.** [R] Escrever `docs/decouple/BASELINE_V4.md` com os 15 fatos corrigidos da tabela acima (cada um com query/comando/hash de evidência).
  - Validação: 15/15 fatos com evidência linkada. · Rollback: `git rm`. · Dep: #1.
- [ ] **3.** [R] Banner de correção no topo de `SCORECARD_V3.md` e `VALIDACAO_V3.md`: "parcialmente desatualizado no mesmo dia — ler BASELINE_V4.md primeiro" (sem reescrever o histórico).
  - Validação: banner + link. · Rollback: `git revert`. · Dep: #2.
- [ ] **4.** [R] Corrigir o stub typo `HANDOFF_POS_DESACOPLOMENTO_20260813.md` (240B) que aponta para o alvo errado (V3 em vez de `HANDOFF_POS_DESACOPLAMENTO_20260813.md`); registrar o ponteiro quebrado `RELATORIO_VALIDACAO_MIGRACAO_20260814.md` (referenciado pelo V3, nunca existiu) como errata no BASELINE_V4.
  - Validação: stub corrigido; errata registrada. · Rollback: `git revert`. · Dep: #2.
- [ ] **5.** [R] Registrar digests de prod atuais no BASELINE_V4: evolution `6f9f1d35` · consumer `75210b9f` · web `production-ccdb663ba68d` · functions-health stack **265**.
  - Validação: Portainer fresco citado com data. · Rollback: n/a. · Dep: #2.
- [ ] **6.** [R] Refresh do snapshot `ops.fn_bodies_backup` (5 linhas confirmadas hoje) + critérios de abort oficiais do V4 (erro envio >1% · DLQ >0 · p95 >2× baseline · health <95 · gate crítico >0).
  - Validação: `SELECT count(*) FROM ops.fn_bodies_backup` ≥ 5 com `backed_at` fresco. · Rollback: n/a. · Dep: nenhuma.
- [ ] **7.** [R] Branch `feat/decouple-v4` de worktree isolado novo (protocolo AGENTS.md), a partir de `main` atualizado.
  - Validação: `git branch --show-current`. · Rollback: `git branch -D`. · Dep: #1.
- [ ] **8.** [R] PR F0 → main (só docs: BASELINE_V4 + banners + stubs); CI verde; merge; tag `decouple-v4-baseline`.
  - Validação: tag existe. · Rollback: `git tag -d` + revert. · Dep: #2–7.

---

## F1 · Bloqueadores P0 — corrigir o que invalida o plano antes de endurecer gates (9–16) — [R][D], 1 dia

> Estes 4 bloqueadores foram descobertos pela onda de validação e **não estavam em nenhum plano anterior**. Sem eles, a F2 (threshold 0) quebra o próprio CI e a F4/F5 (ensaio) prova um mecanismo que não existe no runtime.

- [ ] **9.** [D] Corrigir o bypass real `backendUrlBypass=1`: `supabase/functions/connection-health-check/index.ts:193` deve resolver a URL via `ops.fn_evo_url()` (ou entrar na whitelist com justificativa documentada se for health-check intencionalmente direto).
  - Validação: `node scripts/decouple/inventory.mjs` → `TOTAL: 0` real. · Rollback: `git revert`. · Dep: nenhuma. **Bloqueia #17.**
- [ ] **10.** [R] Corrigir bug de path separator no `inventory.mjs`: normalizar `p.replace(/\\/g,'/')` antes de qualquer `includes()` de path (hoje Windows e Linux divergem — validação local falsa nos dois sentidos).
  - Validação: mesmo TOTAL rodando no Windows e no runner Linux. · Rollback: `git revert`. · Dep: nenhuma. **Bloqueia #17.**
- [ ] **11.** [R] Fechar a cegueira do `inventory.mjs` a invokes sub-path/dinâmicos: regex deve casar `invoke('evolution-api/...')`, `invoke(\`evolution-api/${...}\`)` e `invoke(` com template literal — sem inflar falsos-positivos de comentário/doc.
  - Validação: fixture com os 3 padrões é contada; comentários não. · Rollback: `git revert`. · Dep: #10.
- [ ] **12.** [R] Extrair `TOOLING_MARKERS` inline do inventory para `scripts/decouple/inventory.whitelist.json` versionado + adicionar **exit code** ao script (hoje a decisão vive só no shell do workflow).
  - Validação: script sai !=0 quando TOTAL>0; whitelist externa carrega. · Rollback: `git revert`. · Dep: #10–11.
- [ ] **13.** [D][!] **Corrigir `deploy-edge.sh`**: sincronizar `_shared/**` recursivamente (não só `*.ts` raiz — linha 255) + `force` no serviço `supabase_functions`; validar pós-deploy comparando hash de `_shared/providers/registry.ts` no volume vs repo (hoje: `aca0cb90` stale vs `45f22b96` repo — drift P0 comprovado).
  - Validação: `docker exec supabase_functions sha256sum /home/deno/functions/_shared/providers/registry.ts` == hash do repo; `providers/fake/` presente no volume. · Rollback: `git revert` + sync manual + force (runbook conhecido do incidente P0 de 13/08). · Dep: nenhuma. **Bloqueia #50, #55–56.**
- [ ] **14.** [R] Rodar `inventory.mjs` (corrigido) + `sql-gate.mjs` até ambos reportarem 0 real; arquivar saída como golden da F1.
  - Validação: 0/0/0/0 + sql-gate 0. · Rollback: n/a. · Dep: #9–12.
- [ ] **15.** [R] Teste deliberado: branch dummy com 1 bypass → inventory deve falhar com exit !=0 (prova o mecanismo, não o workflow).
  - Artefato: log em `docs/decouple/GUARD_PROOF_V4.md`. · Rollback: deletar branch dummy. · Dep: #12.
- [ ] **16.** [R] PR F1 → main; merge; checkpoint: CI verde com inventory corrigido e TOTAL=0.
  - Dep: #9–15.

---

## F2 · Gates CI — travar a dimensão 10 (17–28) — [R][D], 1–2 dias

- [ ] **17.** [R] Endurecer `decouple-guard.yml` linha 61: `-gt 15` → `-gt 0` + mensagem `baseline=0` (agora seguro: F1 zerou o TOTAL real).
  - Validação: PR sintético com 1 bypass → CI vermelho; evidência em `GUARD_PROOF_V4.md`. · Rollback: `git revert`. · Dep: #16.
- [ ] **18.** [D] Adicionar `sql-gate.mjs` como step bloqueante do `decouple-guard.yml` (existe como script v1 mas **não está em nenhum workflow** — confirmado).
  - Validação: `grep sql-gate .github/workflows/decouple-guard.yml`; fn fora do whitelist `{fn_evo_url, fn_evo_key}` falha. · Rollback: remover step. · Dep: #16.
- [ ] **19.** [R] Criar `scripts/decouple/run-all-gates.mjs` consolidando inventory + ownership-gate + sql-gate com saída por gate (sem mascarar qual falhou) e exit code composto.
  - Validação: falha injetada em cada gate → log identifica o gate certo. · Rollback: manter 3 steps separados. · Dep: #17–18.
- [ ] **20.** [R] Criar `verb-contract-gate.mjs`: contar exports de `providers/evolution/client.ts` via AST de exports nomeados (não `Object.keys`) e falhar se ≠ 12 (10 verbos + `get<T>`/`post<T>`).
  - Validação: 12/12 verde; fixture com 11 falha. · Rollback: remover step. · Dep: #17.
- [ ] **21.** [D] Escrever contrato Zod dos 12 verbos em `supabase/functions/_shared/providers/evolution/contract.zod.ts` (request/response por verbo, tipos de `src/domain/messaging/types.ts` — ADR-008 já aceito, 6,7KB).
  - Validação: `deno check` verde. · Rollback: `git rm`. · Dep: nenhuma.
- [ ] **22.** [R] `contract.test.ts`: cada verbo do client real validado contra o Zod com fixtures de produção já existentes nos testes de paridade.
  - Validação: `deno test` 12/12. · Rollback: `git rm`. · Dep: #21.
- [ ] **23.** [D] Smoke test de gateway no CI: chamada ao client via provider fake (`DENO_ENV=test`) — mesma shape Zod do contrato (fixture não pode divergir do contrato).
  - Validação: step CI verde <5s. · Rollback: remover step. · Dep: #21–22, #13.
- [ ] **24.** [R] Trigger path-based: testes de contrato + verb-gate rodam em TODO PR que toca `_shared/providers/**`, `evolution-api/**`, `evolution-proxy/**`.
  - Validação: PR sintético quebrando 1 campo → CI vermelho. · Rollback: `git revert`. · Dep: #22–23.
- [ ] **25.** [R] `npx vitest run` + `deno check` full local com os artefatos novos — verde antes do PR.
  - Dep: #21–24.
- [ ] **26.** [R] PR F2 → main; 6 gates verdes (threshold 0, sql-gate, run-all, verb-contract, Zod contract, smoke). Merge.
  - Dep: #17–25.
- [ ] **27.** [R] `docs/decouple/CI_GATES_V4.md`: os 6 gates, o que cada um verifica, comando local de cada.
  - Dep: #26.
- [ ] **28.** [R] Watch 24h de falsos-positivos no threshold 0; qualquer falso-positivo → whitelist JSON (nunca relaxar threshold).
  - Dep: #26.

---

## F3 · Superfície de egresso — fechar o que os planos anteriores nunca inventariaram (29–38) — [R][D], 1–2 dias

- [ ] **29.** [R] Inventário formal das 10 edge functions evolution-* em `docs/decouple/EGRESS_SURFACE_V4.md`: papel, chamadores, classificação (PORTA OFICIAL / SUPORTE VÁLIDO / APOSENTAR / RISCO), status de deploy (todas deployadas — confirmado via exec no container).
  - Validação: 10/10 classificadas com grep de chamadores. · Rollback: `git rm`. · Dep: nenhuma.
- [ ] **30.** [D] Aposentadoria formal da `evolution-credentials`: remover as ~66 linhas de código zumbi que serviam a apikey (`X-Evolution-Key`), manter o 410 Gone do GET, documentar no EGRESS_SURFACE; auditar `useEvolutionApiIntegration.ts` (ainda chama save/delete de key).
  - Validação: nenhum código no repo serve apikey ao browser; UI admin testada. · Rollback: `git revert`. · Dep: #29.
- [ ] **31.** [D] Corrigir ou aposentar `evolution-templates`: hoje `useWhatsAppTemplates` (browser) chama direto e recebe 401 provável — feature quebrada em produção. Decisão: rotear via gateway com auth ou aposentar com banner.
  - Validação: feature funciona ou está visivelmente desabilitada (não quebrada em silêncio). · Rollback: `git revert`. · Dep: #29.
- [ ] **32.** [R] Podar actions mortas: alinhar hook × edge fn nos casos `set-presence`/`delete-instance` (chamadas vivas que resultariam 404) e remover actions sem caller nem handler.
  - Validação: 0 action chamada sem handler; 0 handler sem caller documentado como intencional. · Rollback: `git revert`. · Dep: #29.
- [ ] **33.** [R] ADR de gateway único de egresso edge: hoje coexistem `evolution-proxy` (allowlist 6 paths, usado só pela demo) e `evolution-api` (router ~50 actions, egresso real do app). Decisão recomendada: **formalizar `evolution-api` como a porta edge canônica** (com allowlist de actions documentada) e deprecar `evolution-proxy` — OU expandir o proxy para os verbos usados e migrar o adapter. Registrar em `ADR-011-egress-gateway.md`.
  - Validação: ADR aceito; matriz de substituibilidade (#48) referencia 1 porta, não 2. · Rollback: `git revert`. · Dep: #29.
- [ ] **34.** [D] Piloto de adoção do registry: 1 function real (a porta escolhida em #33) passa a resolver provider via `_shared/providers/registry.ts` em vez de importar `providers/evolution` direto — hoje **0 functions consomem o registry**, sem isso o ensaio da F5 prova um mecanismo sem consumidor.
  - Validação: deploy + smoke da function; log mostra resolução via registry. · Rollback: `git revert` + redeploy. · Dep: #13, #33.
- [ ] **35.** [R] Documentar `sendPtv` (FormData direto ao evolution-api) como exceção formal no EGRESS_SURFACE + teste de smoke.
  - Dep: #29.
- [ ] **36.** [R] `ZappWebbDemoPage`: migrar as 2 calls restantes do `evolution-proxy` para o caminho canônico decidido em #33, ou marcar a página como demo-only com banner.
  - Dep: #33.
- [ ] **37.** [R] Pós-deploy: re-grep no bundle de prod servido — 0 `VITE_EVOLUTION_API_URL`, 0 `evolutionClient`, 0 URL evolution direta (estado já confirmado hoje; reconfirmar após mudanças).
  - Dep: #30–36 deployados.
- [ ] **38.** [R] PR F3 → main; CI verde; EGRESS_SURFACE_V4 publicado.
  - Dep: #29–37.

---

## F4 · Prova de substituibilidade — fechar a dimensão 9 (39–52) — [R][D], 2–3 dias

- [ ] **39.** [D] Completar o fake provider para **12/12**: implementar `getProfilePicture` e alinhar a nomenclatura `sendAudio` (existe no fake, não no client real — decidir: adicionar ao contrato ou remover do fake).
  - Validação: `FAKE_PROVIDER_COVERAGE.md` = 12/12 com mesma assinatura. · Rollback: `git revert`. · Dep: #21.
- [ ] **40.** [R] Estender `contract.test.ts` para rodar o MESMO schema Zod contra fake e real — impossível o fake divergir sem quebrar o teste.
  - Dep: #39.
- [ ] **41.** [R] Suite e2e com transport fake: inbox renderiza, envia (stub), recebe (fixture) — 0 chamadas de rede reais (intercept confirma).
  - Dep: #39.
- [ ] **42.** [R] Caso de degradação: fake retorna erro em `sendText` → UI mostra erro explícito, render não quebra.
  - Dep: #41.
- [ ] **43.** [R] Suites de paridade existentes (`parity.test.ts`, `whatsapp-cloud-normalizer.test.ts`, `evolution-response-normalizers.test.ts`) 100% verdes.
  - Dep: #39–42.
- [ ] **44.** [R] `scripts/decouple/_archive/coverage-report.mjs` + `docs/decouple/COVERAGE_V4.md`: % real de operações de mensageria passando pelas portas com contrato (fórmula documentada; contar actions do router evolution-api, não só os 12 verbos do client).
  - Dep: #21, #33.
- [ ] **45.** [R] Se cobertura <100%: seção "Gaps conhecidos" com arquivo:linha de cada operação fora do contrato (sem inflar).
  - Dep: #44.
- [ ] **46.** [D] Fixtures de replay: capturar N mensagens recentes via view read-only, anonimizar (telefone hasheado/truncado), versionar em `providers/fake/__fixtures__/`.
  - Dep: #39.
- [ ] **47.** [R] Revisão LGPD das fixtures antes do commit (checklist: sem nome completo, sem telefone cru).
  - Rollback: deletar e regenerar. · Dep: #46.
- [ ] **48.** [R] `docs/decouple/SUBSTITUABILITY_MATRIX_V4.md`: para cada porta (P1 front adapter, P2 edge gateway, P3 ingest webhook/RPC, P4 SQL resolvers) — o que muda para trocar de provider, esforço, pronto vs pendente (com evidência).
  - Dep: #33–34, #44.
- [ ] **49.** [R] Cruzar matriz × `RUNBOOK_TROCA_PROVIDER.md` §2; corrigir divergências.
  - Dep: #48.
- [ ] **50.** [D] Implementar `PROVIDER_UNDER_TEST` no `registry.ts` (só honrado com `DENO_ENV=test`) + `docs/ENV_SETUP.md` — pré-condição do ensaio; hoje a variável não existe em lugar nenhum.
  - Validação: `DENO_ENV=test PROVIDER_UNDER_TEST=fake` resolve fake; sem flag resolve evolution. · Rollback: `git revert`. · Dep: #13.
- [ ] **51.** [R] Teste unitário do guard: `DENO_ENV=production PROVIDER_UNDER_TEST=fake` → resolve `evolution` (fake nunca vaza para prod).
  - Dep: #50.
- [ ] **52.** [R] PR F4 → main; CI verde (contrato 12/12 × 2 providers, e2e fake, guard). Merge.
  - Dep: #39–51.

---

## F5 · Ensaio cronometrado — executar o que nunca foi executado (53–62) — [R][!], 1 dia

> Spec de ambiente (agente ensaio-designer): **container efêmero na VPS** com a mesma imagem de prod `supabase/edge-runtime:v1.74.0`, código copiado seletivamente para `/tmp`, `DENO_ENV=test`, porta efêmera `127.0.0.1`, **sem deploy-edge.sh** — zero toque no volume/serviço de produção.

- [ ] **53.** [R] Gates de entrada do runbook §1 verdes: CI decouple (threshold 0), health A+, DLQ 0, msgs/24h ≈ baseline (3.358–5.077, faixa medida).
  - Abortar se qualquer um vermelho. · Dep: F2, F4.
- [ ] **54.** [R] Anexo "Ensaio Fake (V4)" no runbook: 8 passos mapeados 1:1 para troca via `PROVIDER_UNDER_TEST`.
  - Dep: #50.
- [ ] **55.** [R] Preparar container efêmero: copiar `_shared` (agora sincronizado, pós-#13) + function-sonda para `/tmp/ensaio-v4/`, subir edge-runtime efêmero na VPS, verificar hash de `registry.ts` == repo.
  - Validação: hash confere; prod intocado (serviço `supabase_functions` sem redeploy). · Rollback: remover container. · Dep: #13.
- [ ] **56.** [D] Function-sonda dedicada que consome o registry (#34 piloto) — o ensaio mede a troca **na sonda**, com nota explícita de que a adoção em massa pelas demais functions é trabalho posterior (#34 escala).
  - Dep: #34, #55.
- [ ] **57.** [!] Ensaio cronometrado dos 8 passos (evolution→fake→evolution na sonda) — timestamps reais em `docs/decouple/ENSAIO_V4_LOG.md`; monitorar critérios de abort.
  - Rollback: remover flag + destruir container. · Dep: #54–56.
- [ ] **58.** [R] Registrar tempo total real vs estimativa do runbook (30–60 min); corrigir a estimativa.
  - Dep: #57.
- [ ] **59.** [R] Degradação durante o ensaio: fake forçado a errar → comportamento documentado (log/screenshot).
  - Dep: #57.
- [ ] **60.** [R] Rollback cronometrado (fake→evolution) — tempo de reversão medido, não assumido.
  - Dep: #57.
- [ ] **61.** [R] Atualizar runbook §8 (evidências datadas) e §5 (pontos de falha: confirmado / não observado no ensaio).
  - Dep: #57–60.
- [ ] **62.** [⛔] Decisão com Joaquim: ensaio Cloud real (Meta) fica como trabalho futuro explícito OU entra no escopo; registrar decisão datada + PR F5 → main.
  - Nota honesta no scorecard: dimensão 9 fecha como "mecanismo provado e ensaiado com provider substituto controlado", não "Cloud em produção". · Dep: #61.

---

## F6 · Vault/Secrets — dedup com evidência fresca (63–70) — [D][!][⛔]

- [ ] **63.** [R] Confirmar com SQL fresco: 10 secrets `evolution_*` (nomes apenas) e os 2 pares duplicados (`evolution_api_key`/`_v2`, `evolution_webhook_secret`/`webhook_secret_evolution`) — já confirmado hoje; reconfirmar na véspera da execução.
  - Artefato: `VAULT_SECRETS_V4.md`. · Dep: nenhuma.
- [ ] **64.** [R] Mapa secreto×consumidor (edge env, stack 25, consumer, resolvers SQL) com evidência de uso real por consumidor.
  - Dep: #63.
- [ ] **65.** [⛔] APROVADO → expand: todos os consumidores migram para o canônico (1 commit por consumidor).
  - Dep: #64 + APROVADO.
- [ ] **66.** [⛔][!] Soak 48h (erro envio ≤1%, DLQ 0) com canônico exclusivo antes de qualquer delete.
  - Dep: #65.
- [ ] **67.** [⛔][!] Delete dos obsoletos + refresh `ops.fn_bodies_backup`.
  - Rollback: recriar a partir de backup em cofre. · Dep: #66.
- [ ] **68.** [R] Normalizar alias `evolution_api_key_v6→v4` no stack file 25 (resíduo G7).
  - Dep: #67.
- [ ] **69.** [R] Runbook §5: remover "vault duplicado" dos pontos de falha.
  - Dep: #67.
- [ ] **70.** [R] PR F6 → main (ou PR só-documental se APROVADO não veio — nunca ambíguo).
  - Dep: #63–69.

---

## F7 · Resíduos e banco — aposentar sem quebrar realtime nem backcompat (71–80) — [R][D], 1 dia

- [ ] **71.** [R] Branches zumbis (`feat/decouple-v2`, `feat/decouple-provider`, `chore/remove-evolution-infra-to-evolution-stack`, `docs/pos-desacoplamento-20260814`): registrar SHA de cada uma, confirmar 0 PRs abertas (`gh pr list --head`), deletar.
  - Dep: nenhuma.
- [ ] **72.** [R] Recriar `check-publish-evo-fallbacks` em `evolution-stack/image/tests/` (ou nota com path exato se o repo não estiver acessível na sessão).
  - Dep: nenhuma.
- [ ] **73.** [R] Auditoria das **29** tabelas `evo.*` (16 operacionais + 13 partições): acessos diretos nos últimos 7 dias por tabela (pg_stat / logs).
  - Artefato: `EVO_RETIREMENT_V4.md`. · Dep: nenhuma.
- [ ] **74.** [R] **Inventário de realtime subscriptions no schema `evo`** (3+ ativas — achado da onda): listar canais/publications que escutam `evo.*` ANTES de qualquer revogação; o congelamento não pode derrubá-las.
  - Artefato: seção em `EVO_RETIREMENT_V4.md`. · Dep: #73.
- [ ] **75.** [D] Congelamento formal (NUNCA drop): `COMMENT ON TABLE ... 'CONGELADO 2026-08-XX'` + revogar apenas grants residuais a `authenticated`/`anon` (já 0) — **sem tocar** o role da `evo.fn_ensure_evolution_backcompat_views` (cron 6h) nem as subscriptions de #74.
  - Rollback: `COMMENT ... IS NULL`. · Dep: #73–74.
- [ ] **76.** [R] ADR-008: seção registrando a decisão congelamento-não-drop, citando `BACKCOMPAT-VIEWS.md` e o inventário de realtime como razões.
  - Dep: #75.
- [ ] **77.** [R] Decisão sobre as **115 funções `evo.*` executáveis por `authenticated`** via PUBLIC default: REVOKE EXECUTE nas que não são contrato público OU documentar como superfície aceita — com lista nominal.
  - Artefato: seção em `EVO_RETIREMENT_V4.md`. · Dep: #73.
- [ ] **78.** [R] Validar chamadores restantes de `rpc_upsert_contact` (0 erros PGRST de overload antigo em 7 dias) + `RPC_AUDIT_V4.md` com overloads de todos os RPCs de escrita (meta: 1 overload ativo cada).
  - Dep: nenhuma.
- [ ] **79.** [R] `zapp.dispatch_error_logs` com 1 registro: investigar origem (DLQ alternativa?) e zerar ou documentar.
  - Dep: nenhuma.
- [ ] **80.** [R] PR F7 → main + entrada no `CHANGELOG.md` (gates endurecidos, ensaio executado, secrets dedup, evo congelado).
  - Dep: #71–79.

---

## F8 · Documentação canônica (81–88) — [R], 1 dia

- [ ] **81.** [R] ADR-008: seção "Contrato executável" linkando `contract.zod.ts` (#21) como versão testável do modelo.
  - Dep: #21.
- [ ] **82.** [R] `CANONICAL_COLUMN_MAP.md` **já existe** (9KB) — validar cobertura coluna×campo contra `src/domain/messaging/types.ts` e completar lacunas (não recriar).
  - Dep: nenhuma.
- [ ] **83.** [R] `docs/BOUNDARY-evolution.md`: fronteira lógica final — 4 portas + decisão de gateway único (#33) + prova V4 + links para matriz/coluna/RPC audit.
  - Dep: #33, #48, #82.
- [ ] **84.** [R] Criar `docs/decouple/README.md` — índice canônico de todos os arquivos da pasta com status vivo/histórico/lixo (planejado há 3 gerações de plano, nunca criado).
  - Dep: todos os docs V4 criados.
- [ ] **85.** [R] Banners HISTÓRICO nos planos V1/V2/V3 e nos 2 V4 anteriores (A e B) apontando para este V4-FINAL; corrigir stubs typo de 240B (um aponta para o alvo errado — #4).
  - Dep: #84.
- [ ] **86.** [R] Atualizar `README.md` raiz (Integrações → WhatsApp), `FEATURE_REGISTRY.md` (adicionar, nunca remover) e `docs/README.md` pai (índice parcial desatualizado — lista só 3 dos 26+ arquivos).
  - Dep: #83–84.
- [ ] **87.** [R] Checklist de conformidade com `SCHEMA-CONTRACT.md`: 0 objetos de negócio novos em `public`, 0 dependências `evo → zapp` criadas pelo V4.
  - Dep: F3–F7.
- [ ] **88.** [R] PR F8 → main (docs). CI verde.
  - Dep: #81–87.

---

## F9 · Simulação, validação independente e cutover (89–100) — [R][!], 1–2 dias

- [ ] **89.** [R] Simulação pré-F1/F2: cenários E1–E5 + E19–E21 (CI/gates) com veredito em `CENARIOS_V4_LOG.md`.
  - Dep: tabela de cenários abaixo.
- [ ] **90.** [R] Simulação pré-F3/F4: E6–E11 + E22 + E25.
  - Dep: #89.
- [ ] **91.** [R] Simulação pré-F5/F6: E12 + E8–E10 revisitados.
  - Dep: #90.
- [ ] **92.** [R] Simulação pré-F7/F8: E13–E18 + E23–E24.
  - Dep: #91.
- [ ] **93.** [R] Consolidação: 25/25 cenários com mitigação confirmada no desenho ou ação corretiva adicionada ao plano.
  - Dep: #89–92.
- [ ] **94.** [R] Onda de validação independente (6 frentes, evidência fresca, não docs): (a) gates CI rodando, (b) contrato Zod × 2 providers, (c) ensaio cronometrado arquivado, (d) vault pós-dedup, (e) evo congelado sem quebra de realtime/backcompat, (f) docs canônicos íntegros.
  - Artefato: 6 relatórios. · Dep: F1–F8.
- [ ] **95.** [R] Consolidar em `docs/decouple/VALIDACAO_V4.md` (1 seção por frente, outputs reais).
  - Dep: #94.
- [ ] **96.** [R] Não-regressão: tabela comparativa dimensões 1–8 (SCORECARD_V3 vs medido agora) — nenhuma dimensão pode descer; se desceu, bloqueia o cutover.
  - Dep: #95.
- [ ] **97.** [R] `SCORECARD_V4.md` final: dimensões 9 e 10 com evidência linkada; nota de escopo honesto ("mecanismo provado", não "Cloud em produção").
  - Dep: #95–96.
- [ ] **98.** [R] PR sintético final: todos os gates verdes + saúde operacional reconfirmada (wpp2 open, DLQ 0, msgs/24h na faixa baseline).
  - Dep: #97.
- [ ] **99.** [R] PR final `feat/decouple-v4` → `main`: `git fetch` + `git log main..feat/decouple-v4` limpos (sem concorrência), CI verde, merge squash; tag `decouple-v4-complete`.
  - Rollback: `git revert` do merge. · Dep: #98.
- [ ] **100.** [R] Encerramento: `RETRO_V4.md` final (números medidos, gaps explícitos: Cloud real, adoção em massa do registry além do piloto, DROP físico das evo); banner HISTÓRICO no SCORECARD_V3 apontando para o V4; `docs/decouple/README.md` marca V4-FINAL como canônico; deletar branch + worktree (cleanup AGENTS.md).
  - Dep: #99.

---

## Cenários extremos (25 — E1–E18 herdados do V4-Claude, E19–E25 novos da onda de validação)

| # | Cenário | Impacto se errado | Mitigação no V4-FINAL |
|---|---|---|---|
| E1 | Threshold 0 trava CI por falso-positivo de tooling | PRs legítimos bloqueados | #12 whitelist JSON versionada; #28 watch 24h; nunca relaxar threshold |
| E2 | verb-contract-gate conta métodos herdados | Gate falha em número errado | #20 contagem por AST de exports nomeados + fixture conhecida |
| E3 | Contrato Zod desatualiza silenciosamente | CI verde divergente de prod | #24 trigger path-based em todo PR que toca providers |
| E4 | run-all-gates mascara qual gate falhou | Debug lento | #19 saída por gate + exit code composto |
| E5 | Smoke com fixture desatualizada passa com client quebrado | Falsa segurança | #23 smoke usa o MESMO Zod do contrato |
| E6 | Fake com shape divergente "prova" troca falsa | Nota inflada sem lastro | #40 mesmo Zod valida fake e real |
| E7 | Fixtures replay vazam PII | Incidente LGPD | #46–47 anonimização + revisão dedicada |
| E8 | PROVIDER_UNDER_TEST vaza para produção | Mensagens reais não enviadas | #50–51 guard testado: fora de DENO_ENV=test a flag é ignorada |
| E9 | Ensaio consome recurso compartilhado | Ruído para o time | #55 container efêmero isolado, porta 127.0.0.1, sem tocar serviço de prod |
| E10 | Rollback nunca testado sob falha | Reversão falha na hora H | #60 rollback cronometrado explicitamente |
| E11 | Nota 10/10 lida como "Cloud pronto" | Expectativa desalinhada | #62 + #97 nota de escopo explícita |
| E12 | Dedup remove secret errado | Envio quebra em prod | #64 mapa por evidência; #66 soak 48h; #67 rollback por backup |
| E13 | Congelamento evo quebra cron backcompat 6h | Views compat param em até 6h | #75 só revoga authenticated/anon; role da função intocado; #76 ADR |
| E14 | Branch deletada com PR aberta | PR orfã/CI fantasma | #71 SHA registrado + `gh pr list --head` antes |
| E15 | RPC audit remove overload errado | Chamador PostgREST positional quebra | #78 protocolo V3 (verificar chamadores antes) |
| E16 | Banner HISTÓRICO quebra link relativo | Agente segue link morto | #85 banner sem mover/renomear arquivo |
| E17 | Índice decouple/README desatualiza no mesmo dia | Índice mente | #94(f) recontagem arquivo×entrada na validação final |
| E18 | Merge final conflita com agente concorrente | Squash perde commits | #99 fetch+log imediatamente antes; conflito manual, nunca --theirs cego |
| **E19** | **deploy-edge.sh não sincroniza `_shared/**`** (registry stale em prod — hash `aca0cb90` vs `45f22b96`) | Contratos/registry/fake novos nunca chegam ao runtime; ensaio e gates provam código que não roda | **#13** corrige o deploy + validação de hash pós-deploy; bloqueia #50/#55 |
| **E20** | **inventory.mjs diverge Windows×Linux** (join com separador do SO) | Validação local falsa nos dois sentidos | **#10** normalização de path; CI roda no Linux como referência |
| **E21** | **Threshold 0 com TOTAL=1 real** (connection-health-check:193) | O próprio PR da F2 quebra o CI; pressão para relaxar o gate | **#9** corrige o bypass ANTES de #17; ordem de dependência explícita |
| **E22** | **Nenhuma function real consome o registry** | Ensaio prova mecanismo oco; "substituível" só no papel | **#34** piloto de adoção real + #56 sonda declara escopo da prova |
| **E23** | **Congelamento evo derruba 3+ realtime subscriptions** | Inbox para de atualizar em tempo real, silenciosamente | **#74** inventário de subscriptions ANTES de revogar; #75 preserva canais |
| **E24** | **115 funções evo executáveis por authenticated** (PUBLIC default) | Superfície de API não auditada exposta via PostgREST | **#77** REVOKE ou decisão documentada com lista nominal |
| **E25** | **evolution-templates 401 silencioso** (browser chama direto) | Feature quebrada em produção sem ninguém saber | **#31** corrigir ou aposentar com banner — nunca deixar quebrada em silêncio |

---

## Critérios objetivos de conclusão do desacoplamento

1. **Mecanismo de troca provado**: fake implementa 12/12 verbos, validado pelo MESMO Zod do real, e2e verde sem Evolution no ar — E pelo menos 1 function real (piloto) resolve provider via registry (#34).
2. **Zero bypass estrutural medido**: inventory corrigido (path-normalizado, sub-path aware) reporta TOTAL=0, travado no CI com threshold 0, testado contra regressão (#15, #17).
3. **Contrato formal**: 12 verbos com Zod versionado, testado em todo PR que toca `_shared/providers/**`.
4. **Ensaio cronometrado real**: execução ponta a ponta medida com rollback medido, em container efêmero sem tocar produção (#57–60).
5. **Runbook operacional**: evidências datadas do ensaio + pontos de falha confirmados/refutados (#61).
6. **Modelo canônico congelado**: ADR-008 aceito + contrato executável + mapa coluna×campo validado (#81–82).
7. **Governança contínua**: 6 gates bloqueantes no CI; bypass novo falha PR automaticamente.
8. **Sem regressão**: dimensões 1–8 mantêm nota com evidência comparativa (#96).
9. **Produção intocada**: wpp2 open, DLQ 0, msgs/24h na faixa baseline durante todo o V4 (#98).
10. **Superfície inventariada e honesta**: 10 functions evolution-* classificadas (#29), evolution-credentials formalmente aposentada (#30), escopo não coberto (Cloud real, drop evo, adoção em massa do registry) documentado como decisão, não lacuna escondida (#62, #100).

---

## Modelo de execução

| Fase | Risco | Modo | Gate de entrada |
|---|---|---|---|
| F0 | nenhum | sequencial rápido | — |
| F1 | baixo (CI/scripts) | sequencial | E19–E21 simulados |
| F2 | baixo (CI) | sequencial | F1 merged, TOTAL=0 real |
| F3 | médio (edge functions prod) | sequencial, 1 function por commit | EGRESS_SURFACE aprovado |
| F4 | médio (testes) | sequencial | E6–E8 simulados |
| F5 | médio (ensaio isolado) | sequencial estrito | gates runbook §1 verdes |
| F6 | alto (secrets prod) | sequencial estrito | APROVADO + expand/contract |
| F7 | médio (DDL congelamento) | sequencial | #74 subscriptions inventariadas |
| F8 | baixo (docs) | paralelizável | fontes-de-verdade lidas |
| F9 | nenhum (read-only) | onda paralela + merge final | baseline V4 registrado |

**Estimativa total:** 7–10 dias úteis (F6 depende de APROVADO; F5 depende de #13 e #34).

**Regras de abort:** erro envio >1% · DLQ >0 · p95 >2× baseline · health <95 · gate crítico >0 · qualquer sinal de Evolution real afetada pelo ensaio.

**Rollback universal:** `git revert` · `ops.fn_bodies_backup` → `CREATE OR REPLACE` · tag `decouple-v4-baseline` · remover `PROVIDER_UNDER_TEST` · recriar secret do backup · `docker rm` do container efêmero.

---

## O que este plano deliberadamente NÃO faz

- Não implementa client `providers/cloud/` completo (Meta app, phone number, templates = fora do escopo de código; decisão em #62).
- Não executa `DROP TABLE` nas 29 tabelas `evo.*` — só congelamento formal, protegendo o cron de backcompat 6h e as realtime subscriptions (#74–76).
- Não renomeia tabelas, colunas, schemas ou edge functions.
- Não desliga Evolution em produção em nenhum momento.
- Não escala a adoção do registry para todas as functions — só o piloto (#34); adoção em massa é trabalho pós-V4 explícito.
- Não toca infra do evolution-stack (G5 imagem base de watchdog, G6 EXPECTED_DIGEST) — G4 já está fechado (guardian/pgbackrest em stack 262/264, medido); G5/G6 ficam como anexo pós-V4 aguardando APROVADO.
- Não executa git push/PR automaticamente — a execução é sessão por sessão, com revisão humana nos pontos `[⛔]`.

---

*V4-FINAL = V4-Claude (base canônica, factualmente verificada) + bloqueadores P0 descobertos pela onda de 10 agentes (deploy-edge.sh `_shared`, inventory TOTAL=1 + 2 bugs, registry sem consumidores, realtime evo, 115 funções PUBLIC, templates 401, credentials zumbi) + correções factuais (29 tabelas, 3.358 msgs/24h, tag web ccdb663, G4 fechado, stack 265). Estado de partida medido em 2026-08-14: migração de infra/tabelas aprovada, produção saudável, wpp2 open (322.430 mensagens).*
