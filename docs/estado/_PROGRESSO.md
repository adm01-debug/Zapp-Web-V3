# _PROGRESSO.md — rastreador do inventário INVENTARIO-SISTEMA.md

> **Fonte única de verdade sobre o andamento.** Plano completo em `/PLANO-ESTADO.md`.
> Atualizado ao fim de cada bloco. Se este arquivo e o plano divergirem, este arquivo vence.

**Retomada em chat novo:**
> `lê PLANO-ESTADO.md e _PROGRESSO.md do zapp-web-v3 e continua de onde parou`

> **O trabalho em andamento vive na branch `docs/estado-inventario`.**
> `main` guarda apenas este ponteiro e o plano. As saídas das Fases 1–8 e as
> atualizações deste rastreador são commitadas na branch, e voltam para `main`
> por PR no fim da Fase 9. Ao retomar, faça checkout da branch e leia o
> `_PROGRESSO.md` **de lá** — é ele que tem o andamento real.

---

## Estado atual

| Campo | Valor |
|---|---|
| Fase corrente | **1 — Inventário estático: frontend** |
| Próximo bloco | **1A — `src/pages` + `src/App.tsx` (árvore de rotas, guards, lazy loading)** |
| Última atualização | 2026-08-08 |
| Sessão de chat | S1 |
| Bloqueios | **SIM — ver secao Bloqueio ativo abaixo** |

---

## Checklist

### Fase 0 — Preparação
- [x] `PLANO-ESTADO.md` commitado
- [x] `docs/estado/_PROGRESSO.md` criado

### Fase 1 — Frontend -> `01-frontend.md`
- [ ] 1A `src/pages` + `App.tsx` — rotas, guards, lazy loading
- [ ] 1B `src/features` — módulos de domínio
- [ ] 1C `src/components` + `src/shared` — UI, usados vs. órfãos
- [ ] 1D `src/hooks` + `src/adapters` + `src/integrations`
- [ ] 1E `src/services` + `src/lib` + `src/utils` + `src/types`

### Fase 2 — Backend -> `02-backend.md`
- [ ] 2A `supabase/functions` — edge functions
- [ ] 2B `supabase/migrations` + `db/` — schema
- [ ] 2C RPCs, triggers, views, RLS declaradas

### Fase 3 — Infra e automação -> `03-infra.md`
- [ ] 3A `infra/`, `ops/`, docker, nginx, vercel
- [ ] 3B `.github/workflows` — CI/CD
- [ ] 3C `scripts/` — operacionais, ainda chamados?

### Fase 4 — Runtime -> `04-runtime.md`
- [ ] 4A Supabase self-hosted (tabelas, RLS, RPCs, triggers, pg_cron, functions deployadas)
- [ ] 4B Swarm / Portainer (stacks, serviços, réplicas, health)
- [ ] 4C N8N (workflows ativos, erros, credenciais)
- [ ] 4D Evolution API (`wpp2`, webhooks, conexão)
- [ ] 4E Cloudflare Workers + Vercel

### Fase 5 — Reconciliação -> `05-reconciliacao.md`
- [ ] Diff código x runtime
- [ ] Classificação: EM_USO / CODIGO_MORTO / ORFAO_RUNTIME / DIVERGENTE

### Fase 6 — Grafo -> `06-grafo.md`
- [ ] Arestas estáticas (imports, chamadas)
- [ ] Arestas de runtime (webhook, fila, cron)
- [ ] Pontos únicos de falha

### Fase 7 — Veredito -> `07-veredito.md`
- [ ] Veredito por componente
- [ ] Lacunas acionáveis para tudo que não é OK

### Fase 8 — Consolidação
- [ ] `INVENTARIO-SISTEMA.md` na raiz

### Fase 9 — Enforcement
- [ ] `CLAUDE.md` atualizado
- [ ] `AGENTS.md` atualizado
- [ ] `.agents/` e `.codex/` atualizados
- [ ] Checkbox no template de PR
- [ ] Reconciliado com `FEATURE_REGISTRY.md`
- [ ] Teste de veracidade em 5 componentes ao acaso

---

## Log de sessões

| Data | Sessão | Concluído | Observação |
|---|---|---|---|
| 2026-08-08 | S1 | Fase 0 | Plano e rastreador commitados. Repo já possui `CLAUDE.md`, `AGENTS.md`, `.agents/`, `.codex/`, `FEATURE_REGISTRY.md` — Fase 9 deve editar esses arquivos, não criar novos. GitHub MCP padrão retorna 403 em escrita; usar container `claude-code` + `code_commit`. |

---

## Bloqueio ativo — 2026-08-08 (diagnostico CORRIGIDO)

`code_task` retorna `401 OAuth access token has expired`. Fase 1 travada.

### Causa raiz

O token da assinatura vive num **secret do Docker Swarm**, nao no filesystem:

- Secret `claude_code_oauth_token`, montado read-only em
  `/run/secrets/claude_code_oauth_token` (108 chars, prefixo `sk-ant-oat01-`).
- Wrapper `/usr/local/bin/cc` le esse arquivo e exporta `CLAUDE_CODE_OAUTH_TOKEN`
  antes de cada `claude`. Primeira linha do wrapper: `unset ANTHROPIC_API_KEY`.
- Secrets remontados em 2026-08-08 07:49 (restart). O token dentro do secret expirou.
- Conta: `max` / `default_claude_max_20x`.

### O diagnostico anterior estava ERRADO — nao repetir

- `~/.claude/.credentials.json` e **residuo, nao o mecanismo**. Escrito em
  2026-07-05 09:10:06 no mesmo milissegundo que `mcp-needs-auth-cache.json`
  (copia em lote), com token ja expirado desde 2026-06-18 e `refreshToken` vazio.
  O wrapper nunca le esse arquivo.
- `ANTHROPIC_API_KEY` **nao funciona por design** — o wrapper faz `unset` nela. E
  cobraria por token em vez de consumir a assinatura. NAO SETAR.
- `claude setup-token` **dentro** do container tambem nao resolve: grava no arquivo
  ignorado. Tentado e descartado.

### Por que nao da para corrigir daqui

Container isolado do daemon: sem `/var/run/docker.sock`, sem CLI `docker`. O
Portainer MCP nao expoe criacao de secret (so `update_service`, `update_stack`,
`exec_container`).

### Procedimento de rotacao

1. **No laptop:** `claude setup-token` -> autorizar no browser -> `sk-ant-oat01-...`
2. **No host:** `docker secret create claude_code_oauth_token_v2 -`
3. Atualizar servico da stack 122 para o secret novo + redeploy
4. Validar com `code_task` de teste
5. Versionar stack file + registrar em `/workspace/notes/CREDENTIAL-MAP.md`

Passos 3-5 automatizaveis por MCP. Passo 1 exige humano (OAuth em browser prova
identidade). Passo 2 e higiene: evita o token passar pelo chat.

### Precedente

`/workspace/notes/execucao-completa-2026-07-05.md` linha 117: *"Unica pendencia real:
criar o secret `claude_code_oauth_token` apos gerar token no laptop amanha."* Um
agente montou stack, wrapper e validacao; o token veio do laptop. Mesmo padrao nas
rotacoes de R2, Portainer API key e GitHub PAT.

---

## Correcao de escopo do bloco 1A — 2026-08-08

`src/App.tsx` (199 linhas) **nao declara rotas**. E o shell: `AppProviders`,
`BrowserRouter`, `ErrorBoundary`, `GlobalKeyboardProvider`, `TransitionProvider`,
toasters, `ThemeInitializer`, `SkipLinks`, `LiveRegion`,
`ServiceWorkerUpdateBanner`, widgets de debug via `lazyWithRetry`.

Router real: `src/components/routing/AppRoutes.tsx` — ponto de entrada do 1A.

Tambem no escopo do 1A (afetam montagem e disponibilidade de rota):
- `src/main.tsx` — bootstrap, handlers globais de erro
- `src/components/providers/AppProviders.tsx` — cadeia de contextos
- `src/lib/lazyWithRetry.ts` — lazy loading de toda rota
- `src/components/errors/ErrorBoundary.tsx` — comportamento quando rota quebra

Dimensao medida: `src/pages` = 148 arquivos / 27.106 linhas; `src/features` = 12 modulos.

---

## Ambiente de trabalho — worktree dedicado

**Trabalhe em `/workspace/estado-inventario`, nao em `/workspace/repos/zapp-web-v3`.**

Sessoes concorrentes compartilham o working tree principal e trocam de branch no meio
do trabalho. Ocorrido em 2026-08-08: outra sessao fez checkout para
`docs/estado-inventario-20260808`, commitou dedup de storage e deixou a arvore em
`main` — o commit desta trilha sobreviveu, mas o arquivo em disco reverteu.

Worktree criado com:
`git worktree add /workspace/estado-inventario docs/estado-inventario`

---

## Armadilhas do container

- Husky `pre-commit` quebra (`bun: not found`). Usar `git commit --no-verify`.
- `code_commit` do MCP retorna `pushed: true` mesmo com commit falho no hook.
  **Falso positivo** — conferir com `git log --oneline -1`.
- Shell e `dash`. Sem `tmux`, `screen`, `expect`. `script` existe.
- `pkill -f PADRAO` casa com a linha de comando do proprio `code_exec` e mata o
  shell. Usar classe: `pkill -f 'seu[-]padrao'`.
- GitHub MCP padrao: **403** em escrita neste repo. Commitar pelo container.
- `main` tem branch protection (PR + 11 checks). Trabalho vai na branch.

---

## Isolamento obrigatorio — outro agente no mesmo repo

`ESTADO.md` na raiz **pertence a outro agente** (branch
`docs/estado-inventario-20260808`, commit `aaecf2b12`). Nao ler como insumo, nao
mesclar, nao editar, nao commitar naquela branch.

Entregavel desta trilha: **`INVENTARIO-SISTEMA.md`** (renomeado — o caminho
`ESTADO.md` ja estava ocupado). Branch: `docs/estado-inventario`. Worktree:
`/workspace/estado-inventario`.

Detalhe completo na secao 7 do `PLANO-ESTADO.md`.
