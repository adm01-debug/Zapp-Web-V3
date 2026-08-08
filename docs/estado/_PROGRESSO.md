# _PROGRESSO.md — rastreador do inventário ESTADO.md

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
- [ ] `ESTADO.md` na raiz

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

## Bloqueio ativo — 2026-08-08

**Fase 1 nao pode ser executada.** O container `claude-code` (stack 122) tem o token
OAuth expirado. `code_task` retorna:

> Failed to authenticate. API Error: 401 OAuth access token has expired. Re-authenticate to continue.

Diagnostico: `~/.claude/.credentials.json` datado de 2026-07-05. Nao existe
`ANTHROPIC_API_KEY` no ambiente do container, logo nao ha fallback headless —
a delegacao depende inteiramente do OAuth.

Duas saidas:
1. `claude login` dentro do container (interativo, volta a expirar).
2. Injetar `ANTHROPIC_API_KEY` como variavel/secret da stack 122 e redeploy.
   Sobrevive a expiracao e e o unico caminho que mantem `code_task` headless.

Recomendado: opcao 2.

---

## Correcao de escopo do bloco 1A — 2026-08-08

`src/App.tsx` (199 linhas) **nao declara rotas**. E apenas o shell da aplicacao:
`AppProviders`, `BrowserRouter`, `ErrorBoundary`, `GlobalKeyboardProvider`,
`TransitionProvider`, toasters, `ThemeInitializer`, `SkipLinks`, `LiveRegion`,
`ServiceWorkerUpdateBanner` e widgets de debug carregados via `lazyWithRetry`.

O router real e `src/components/routing/AppRoutes.tsx`. O bloco 1A deve ler
**esse** arquivo como ponto de entrada, nao `App.tsx`.

Tambem pertencem ao 1A, por afetarem montagem e disponibilidade de rota:
- `src/main.tsx` — bootstrap, handlers globais de erro
- `src/components/providers/AppProviders.tsx` — cadeia de contextos
- `src/lib/lazyWithRetry.ts` — mecanismo de lazy loading de toda rota
- `src/components/errors/ErrorBoundary.tsx` — o que acontece quando rota quebra
