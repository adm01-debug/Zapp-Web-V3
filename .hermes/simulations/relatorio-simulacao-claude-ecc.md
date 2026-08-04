# Simulação de Falhas — Regressão `.claude/` / ECC Tools (zapp-web-v3)

**Data:** 2026-08-03 · **HEAD:** `7931beaa5` · **Método:** inspeção de árvore git (ls-tree), histórico (git log --all), hooks, configs de deploy e grep repo-wide (rg).

## Estado atual (fatos verificados)

- `.claude/` **não existe** no working tree nem em `origin/main`. Removido em `0873919e3` ("chore: remove ECC auto-generated bundles (.agents, .codex, .claude)").
- O bundle ECC (11 arquivos: `.claude/ecc-tools.json`, `.claude/identity.json`, `.claude/skills/zapp-web-v3/SKILL.md`, `.claude/homunculus/instincts/inherited/zapp-web-v3-instincts.yaml`, 4× `.codex/*`, 2× `.agents/*`) foi gerado pelo bot **ecc-tools** em 21/07/2026 e adicionado em 5 commits (5783c0267 → 39b309a42). **Sem segredos** (git grep por key/token/secret/password = 0 hits).
- **`.gitignore` NÃO cobre** `.claude/`, `.agents/` nem `.codex/`.
- Nada no repo lê `.claude/`: vercel.json (build = `vite build`), Dockerfile/.dockerignore, `.github/workflows/*`, `.husky/pre-commit`, `.lintstagedrc`, scripts/ — único hit repo-wide é `docs/audits/PROMPT_AGENTE_LOCAL_CORRECAO.md` citando `~/.claude/agents/` (home do usuário, não o repo).

---

## Cenário 1 — ECC Tools executado de novo e recria `.claude/`

**Risco: MÉDIO (P2)** — probabilidade baixa, impacto baixo-médio.

- Nada no repo dispara o ECC Tools (sem script em package.json, sem config, sem binário global). É ferramenta externa executada manualmente.
- Se rodar: recria `.claude/`, `.agents/`, `.codex/` como **untracked** (não há .gitignore). Consequências:
  - Poluição de `git status` (11 arquivos) e risco de commit acidental via `git add .` / `git add -A` — o bundle é código morto documentado (informação incorreta snake_case, score 0/7 no próprio manifesto, redundante com CLAUDE.md).
  - Claude Code/Codex locais passariam a ler `.claude/` se presente → instruções erradas em sessões futuras de agentes.
- **Mitigação:** adicionar `.claude/`, `.agents/`, `.codex/` ao `.gitignore` (defesa em profundidade, custo zero).

## Cenário 2 — Dev faz `git checkout` de commit/branch antiga com `.claude/`

**Risco: ALTO (P1)** — probabilidade alta (7 branches remotas contaminadas), impacto médio.

- **7 branches em `origin` ainda têm os 11 arquivos na árvore**: `fix/auth-abort-suppress`, `fix/esteira-etapas-3-20`, `fix/sla-fk-profile`, `fix/auth-delay-refresh`, `claude/chatpanel-corrections-improvements-yf7a6e`, `claude/chatpanel-exhaustive-qa-rp58i8`, `claude/fix-inv1-chatmessagesarea-realtime`. Só `main` e `fix/inbox-optimization-v2` contêm o commit de remoção.
- Efeito: checkout de qualquer uma dessas branches restaura `.claude/` como **tracked**; `git switch -c` a partir dela reentra o bundle; hooks/build não quebram (nada lê o dir), mas o código morto volta ao ciclo.
- **🔴 Achado real, não hipotético:** a branch `claude/plan-implementation-review-bq8j14` — **PR aberto AGORA** — contém os 11 arquivos. **Merge desse PR recria `.claude/` em main**, desfazendo a limpeza de `0873919e3`. Risco de reentrada iminente.
- **Mitigação:** (a) revisar/rebasar o PR `bq8j14` para incluir a remoção antes do merge; (b) deletar ou rebasar as 7 branches órfãs; (c) .gitignore como rede de segurança.

## Cenário 3 — Husky/pre-commit referenciando `.claude/`

**Risco atual: ZERO** — o hook atual roda `lint-staged` + `scripts/check-schema-usage.mjs` + checagem de frescor do graphify. Nenhuma referência a `.claude/`.

**Simulação (se adicionassem referência):**
- Referência **condicional** (`[ -f .claude/x ]`): passa silencioso → sem impacto, só código morto.
- Referência **incondicional** (`cat .claude/settings.json`, `node script.mjs .claude/...`): **hook falha em todo commit, para todos os devs** → bloqueio total de commits (P1 de velocidade), agravado por comportamento **inconsistente entre máquinas** (devs com branch antiga têm `.claude/`, devs limpos não) → CI/commits flaky.
- Classificação hipotética: **ALTO se incondicional; BAIXO se condicional**.

## Cenário 4 — Vercel/Netlify lendo `.claude/`

**Risco atual: ZERO** — vercel.json: `buildCommand: "bun run build"` (vite build), `installCommand: "bun install"`, output `dist`. **Não existe netlify.toml** (Netlify não configurado). Nenhum workflow CI lê `.claude/`.

**Simulação (se o build lesse `.claude/`):**
- `origin/main` não tem `.claude/` → **build falha imediatamente** → deploy Vercel (preview e produção) e CI bloqueados (P1 de disponibilidade). Rollback = reverter o commit, falha rápida e visível.
- Nuance: deploys de PRs de branches contaminadas (ex.: `fix/sla-fk-profile`) teriam `.claude/` no filesystem do build → comportamento divergente por branch → builds flaky.
- Nota Docker: `.dockerignore` não exclui `.claude` (só `.git`, `.github`, `.husky`, `node_modules`, `dist`...). Se o bundle existir no working tree num build Docker VPS, entra no contexto/imagem — inofensivo (nenhum leitor), mas bloat desnecessário.

---

## Classificação consolidada

| # | Cenário | Risco atual | Risco hipotético | Probabilidade | Impacto |
|---|---------|-------------|------------------|---------------|---------|
| 1 | ECC Tools recria `.claude/` | MÉDIO (P2) | — | Baixa | Commit acidental / poluição / agentes lendo instruções erradas |
| 2 | `git checkout` de commit antigo / branches | **ALTO (P1)** | — | **Alta (7 branches + 1 PR aberto)** | Reentrada do bundle em main; código morto de volta |
| 3 | Hook pre-commit referencia `.claude/` | ZERO | ALTO se incondicional / BAIXO se condicional | Baixa (não existe hoje) | Bloqueio total de commits, inconsistência entre devs |
| 4 | Vercel/Netlify lê `.claude/` | ZERO | ALTO (build fail) | Baixa | Deploy outage, rollback simples |

## Recomendações (custo baixo, elimina P1)

1. **Antes do merge do PR `bq8j14`:** rebasear/cherry-pick sobre `main` (já sem o bundle) ou reaplicar a remoção de `0873919e3` na branch — senão `.claude/` volta à main.
2. **Deletar/arquivar as 7 branches órfãs** contaminadas (estão 54–283 commits atrás de main).
3. **Adicionar ao `.gitignore`:** `.claude/`, `.agents/`, `.codex/` (rede de segurança para os cenários 1 e 2).
4. (Opcional) Adicionar `.claude/` ao `.dockerignore`.
