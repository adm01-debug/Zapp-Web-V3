# CENARIOS V4 — Log de cenários de risco (E1–E30) · 2026-08-14

**Data:** 2026-08-14 · **Onda:** 10 agentes + reconciliação da `main` @`8ff014fb0` · **Autor:** Agente 8 (docs) · **Base:** `PLANO_DESACOPLAMENTO_V4_CLAUDE_100_ETAPAS_20260814.md` (F1–F9) + [`BASELINE_V4.md`](./BASELINE_V4.md)

> **Legenda de veredito:** **Mitigado** = risco coberto por desenho ou fix já aplicado (indicado "onde") · **Aceito** = risco assumido com monitoramento/documentação · **Ação** = requer intervenção (fix nesta onda ou pendência aberta).
>
> **Procedência:** E1–E18 = cenários do desenho V4-Claude (veredito "mitigação presente no desenho"); E19–E25 = cenários medidos/confirmados nesta onda a partir do baseline; E26–E30 = novos cenários identificados nesta onda.

---

## Matriz E1–E30

| ID | Cenário | Veredito | Onde está a mitigação |
|---|---|---|---|
| E1 | Threshold 0 trava CI por falso-positivo de string em teste/doc novo | Mitigado (presente no desenho) | V4-Claude F1 #24: whitelist de tooling explícita, nunca relaxar o threshold. Estado real: ver E21/E26 (fix nesta onda) |
| E2 | `verb-contract-gate.mjs` conta métodos de protótipo/mixins e infla verbos | Mitigado (presente no desenho) | V4-Claude F1 #15: contagem via AST de exports nomeados + teste do próprio gate contra fixture conhecida |
| E3 | Contrato Zod fica desatualizado silenciosamente | Mitigado (presente no desenho) | V4-Claude F1 #18: contrato roda em TODO PR que toca `client.ts` (path-based CI trigger) |
| E4 | `run-all-gates.mjs` mascara qual gate falhou | Mitigado (presente no desenho) | V4-Claude F1 #14: saída agregada com seção por gate, exit code composto, log completo preservado |
| E5 | Smoke test de gateway usa fixture solta e passa com client quebrado | Mitigado (presente no desenho) | V4-Claude F1 #19 + F2 #27: smoke usa o MESMO schema Zod do contrato real |
| E6 | Fake provider com shape sutilmente diferente do real | Mitigado (presente no desenho) | V4-Claude F2 #27: mesmo schema Zod valida fake E evolution real — fake não diverge sem quebrar teste |
| E7 | Fixtures de replay vazam PII real para o repo | Mitigado (presente no desenho) | V4-Claude F2 #34: revisão de segurança dedicada + anonimização obrigatória antes de commitar |
| E8 | `PROVIDER_UNDER_TEST=fake` vaza para produção | Mitigado (presente no desenho) | V4-Claude F2 #38: guard testado — `DENO_ENV` fora de `test` sempre ignora `PROVIDER_UNDER_TEST`. Nota: recurso ainda ausente no código (BASELINE 5.6) |
| E9 | Ensaio cronometrado consome ambiente compartilhado | Mitigado (presente no desenho) | V4-Claude F3 #47: `DENO_ENV=test` isolado, sem contenção com produção |
| E10 | Caminho inverso (rollback real sob estresse) nunca testado | Mitigado (presente no desenho) | V4-Claude F3 #50: passo de rollback medido e testado explicitamente |
| E11 | Dimensão 9 declarada 10/10 sem lastro (só fake) | Mitigado (presente no desenho) | V4-Claude F3 #54: nota do scorecard explicita escopo provado (mecanismo, não Cloud) |
| E12 | Dedup de secrets remove o par errado | Mitigado (presente no desenho) | V4-Claude F4 #58 (consumidores mapeados por evidência ANTES) + #60 (soak 48h antes do delete). Estado real: 2 pares duplicados (BASELINE 3.8) |
| E13 | Congelamento de `evo` revoga grant necessário ao cron de backcompat views | Mitigado (presente no desenho) | V4-Claude F5 #70: decisão cross-referenciada com `BACKCOMPAT-VIEWS.md`; só revoga grants de `authenticated` (já 0 — BASELINE 3.3), nunca o role da função de compat |
| E14 | Branch zumbi deletada com PR aberta | Mitigado (presente no desenho) | V4-Claude F5 #65: registrar SHA antes de deletar + `gh pr list --head` confirmando 0 PRs |
| E15 | RPC audit remove overload errado | Mitigado (presente no desenho) | V4-Claude F5 #72: protocolo V3 (verificar chamadores PostgREST positional × named). Estado real: `rpc_upsert_contact` = 1 overload (BASELINE 3.7) |
| E16 | Banner HISTÓRICO quebra link relativo de outro doc | Mitigado (presente no desenho) | V4-Claude F6 #79: banner adicionado sem mover/renomear o arquivo |
| E17 | Índice `docs/decouple/` desatualiza no mesmo dia da criação | Mitigado (presente no desenho) | V4-Claude F8 #93: recontagem de arquivos vs entradas do índice na validação final |
| E18 | PR final conflita com commit concorrente na `main` | Mitigado (presente no desenho) | V4-Claude F9: `git fetch` + `git log main..feat/decouple-v4` antes do merge; nunca `--theirs/--ours` às cegas. Onda atual: ver E27/E28 |
| E19 | `deploy-edge.sh` só sincroniza `_shared` raiz → drift de `registry.ts` (volume `aca0cb90` × repo `45f22b96`) | **Ação — fix nesta onda** | `infra/edge-deploy/deploy-edge.sh` linha 258 (`find -maxdepth 1`); fix da onda estende a sincronização para `_shared/providers/` (BASELINE 2.1/6.3) |
| E20 | Path Windows no inventory → `TOTAL=1` falso-positivo (gateway `client.ts` contado como bypass) | **Mitigado — fix nesta onda** | `scripts/decouple/inventory.mjs` linhas 124–125 (exclusão `providers/evolution` não casava com `\` no Windows); CI Linux sempre verde (BASELINE 1.1/6.1). Detalhe: E26 |
| E21 | Threshold CI `-gt 15` prematuro — gate frouxo permite até 15 bypasses novos | **Ação — fix nesta onda** | `.github/workflows/decouple-guard.yml` linha 61; endurecido na onda (BASELINE 1.2/6.2) |
| E22 | `registry.ts` sem consumidores (0 functions consomem o registry) | Aceito (monitorar) | BASELINE 5.7; agravado por E19 (arquivo nem chegava ao volume) — pós-fix do deploy, revalidar consumo real |
| E23 | Realtime `evo` no congelamento de tabelas | Aceito (desenho cobre) | V4-Claude F5 #70 + `BACKCOMPAT-VIEWS.md`: congelamento não toca roles de cron/realtime/backcompat; 0 grants de escrita (BASELINE 3.3) |
| E24 | 115 funções `evo.*` com EXECUTE para `authenticated` (default PUBLIC) | **Ação (revisar)** | BASELINE 3.4; mitigação parcial já presente: 0 grants de escrita; revisar EXECUTE como parte do congelamento formal (F5) |
| E25 | `evolution-templates` 401 provável | **Ação (investigar)** | BASELINE 5.9; investigar auth/credenciais da edge fn antes de declarar fechado |
| E26 | Falso-positivo Windows confirmado E corrigido (evidência da onda) | Mitigado | `inventory.mjs` 124–125 corrigido na onda; evidência: TOTAL=1 só em Windows, CI Linux 0 — bug de path, não regressão real (BASELINE 1.1) |
| E27 | Colisão entre os 10 agentes paralelos no mesmo worktree/repo | Mitigado | Partição disjunta de escopo por agente (cada agente só toca arquivos próprios) + regra de não tocar arquivo alheio; `SIMULATION_SCENARIOS_20260814.md` seção 4 (grafo de bloqueio) |
| E28 | `main` em fluxo durante a onda (commits concorrentes) | Mitigado (aceito) | Execução sincronizada com a `main` @`8ff014fb0` em janela com **0 PRs** concorrentes; reconciliação feita antes de medir o baseline |
| E29 | Poda de actions/scripts quebra chamadores (grep callers antes) | **Ação (regra)** | Regra da onda: antes de podar qualquer action/script, `grep` de chamadores e registrar uso/SHA — mesma disciplina de E14 (V4-Claude F5 #65) |
| E30 | Código zumbi da key de `evolution-credentials` (GET = 410 Gone) | **Ação (preservar UI)** | BASELINE 5.8; GET removido (410), mas a UI admin ainda usa **POST save/delete** — preservar esses verbos e o código da key; não remover sem migrar a UI |

---

## Notas de fechamento

- **E1–E18** foram validados como "mitigação presente no desenho" do V4-Claude (F1–F9); nenhum deles exige redesenho nesta onda.
- **E19–E25** nasceram das medições do baseline (BASELINE_V4.md seções 1–5); E19, E20 e E21 receberam fix **nesta onda**.
- **E26–E30** são os aprendizados novos da onda (partição disjunta, janela de `main`, poda com grep, credentials zumbi, falso-positivo Windows).
- Cobertura por fase do V4-Claude: F1 → E1–E5; F2 → E6–E8; F3 → E9–E11; F4 → E12; F5 → E13–E15, E23, E24; F6 → E16; F8 → E17; F9 → E18.
