# PLANO-ESTADO.md

> Plano de execução para produzir `INVENTARIO-SISTEMA.md` — o inventário exaustivo do sistema `zapp-web-v3`.
> **Este arquivo é o plano. O rastreador de progresso vive em `docs/estado/_PROGRESSO.md`.**
> Criado: 2026-08-08 · Repo: `adm01-debug/zapp-web-v3` · Branch: `main`

---

## 1. Objetivo

Produzir `INVENTARIO-SISTEMA.md` na raiz do repositório, contendo para **cada componente do sistema**:

1. **O que é** — propósito, tipo (página, hook, service, edge function, tabela, RPC, workflow, stack, worker).
2. **O que faz** — funcionalidades enumeradas, uma por uma.
3. **Está funcionando?** — veredito validado contra runtime, não contra o código.
4. **Foi totalmente implementado?** — se não, **o que exatamente falta**.
5. **Quem ele chama** — dependências de saída (imports, fetch, RPC, webhook, fila).
6. **Quem chama ele** — dependências de entrada (quem morre se isso quebrar).
7. **Correlações** — acoplamentos indiretos (mesma tabela, mesma fila, mesmo canal).
8. **Papel no sistema** — por que existe.

E ser **leitura obrigatória** para qualquer agente de IA que toque o repositório.

---

## 2. Por que dividido em fases

Uma passada única produz documento raso. O sistema tem duas verdades que precisam ser cruzadas:

| Verdade | Onde vive | Quem lê |
|---|---|---|
| **Estática** — o que o código diz que existe | repo em disco | Claude Code (container `claude-code`, stack 122) |
| **Runtime** — o que de fato está rodando | Supabase, Swarm, N8N, Evolution, Cloudflare, Vercel | Claude via MCPs |

Componente que existe no código mas não está deployado é **código morto**. Componente deployado que não existe mais no código é **órfão**. Nenhum dos dois aparece se olharmos só um lado. `INVENTARIO-SISTEMA.md` só tem valor se separar os dois.

---

## 3. As 10 etapas

### Fase 0 — Preparação *(concluída)*
- Commit deste plano e do rastreador.
- Criar `docs/estado/` como área de trabalho para saídas parciais.
- **Saída:** `PLANO-ESTADO.md`, `docs/estado/_PROGRESSO.md`

### Fase 1 — Inventário estático: frontend
Executor: Claude Code, por blocos.
- 1A `src/pages` + `src/App.tsx` — árvore de rotas, guards, lazy loading
- 1B `src/features` — módulos de domínio
- 1C `src/components` + `src/shared` — biblioteca de UI, o que é usado vs. órfão
- 1D `src/hooks` + `src/adapters` + `src/integrations`
- 1E `src/services` + `src/lib` + `src/utils` + `src/types`
- **Saída:** `docs/estado/01-frontend.md`

### Fase 2 — Inventário estático: backend
Executor: Claude Code.
- 2A `supabase/functions` — cada edge function: rota, auth, payload, quem invoca
- 2B `supabase/migrations` + `db/` — tabelas, colunas, índices, constraints
- 2C RPCs, triggers, views, políticas RLS declaradas no código
- **Saída:** `docs/estado/02-backend.md`

### Fase 3 — Inventário estático: infra e automação
Executor: Claude Code + leitura de config.
- 3A `infra/`, `ops/`, `docker-compose.yml`, `Dockerfile`, `nginx*.conf`, `vercel.json`
- 3B `.github/workflows` — CI/CD, o que roda em que gatilho
- 3C `scripts/` — scripts operacionais e se ainda são chamados
- **Saída:** `docs/estado/03-infra.md`

### Fase 4 — Validação de runtime
Executor: Claude via MCPs. **A fase que dá veracidade ao documento.**
- 4A Supabase self-hosted: tabelas reais, RLS ativas, RPCs existentes, triggers, pg_cron, edge functions deployadas
- 4B Swarm/Portainer: stacks, serviços, réplicas, health, imagens
- 4C N8N: workflows ativos/inativos, taxa de erro, credenciais
- 4D Evolution API: instância `wpp2`, webhooks, estado de conexão
- 4E Cloudflare Workers + Vercel: o que está publicado
- **Saída:** `docs/estado/04-runtime.md`

### Fase 5 — Reconciliação código x runtime
Executor: Claude.
- Diff das Fases 1-3 contra a Fase 4.
- Classifica: `EM_USO` · `CODIGO_MORTO` · `ORFAO_RUNTIME` · `DIVERGENTE`
- **Saída:** `docs/estado/05-reconciliacao.md`

### Fase 6 — Grafo de dependências
Executor: Claude Code (análise de imports/chamadas) + Claude (arestas de runtime: webhook, fila, cron).
- Quem chama quem, quem é chamado por quem, correlações indiretas.
- Identificar pontos únicos de falha (nós com muitos dependentes).
- **Saída:** `docs/estado/06-grafo.md`

### Fase 7 — Veredito por componente
Executor: Claude.
- Cada componente recebe: `OK` (funcional e completo) · `PARCIAL` (funciona, falta X) · `QUEBRADO` · `NAO_IMPLEMENTADO` · `MORTO`
- Para tudo que não for `OK`: **o que falta, em termos acionáveis.**
- **Saída:** `docs/estado/07-veredito.md`

### Fase 8 — Consolidação do INVENTARIO-SISTEMA.md
Executor: Claude.
- Monta `INVENTARIO-SISTEMA.md` na raiz a partir das saídas parciais.
- Cabeçalho de leitura obrigatória, índice, regras de não-regressão.
- **Saída:** `INVENTARIO-SISTEMA.md`

### Fase 9 — Enforcement e validação
Executor: Claude.
- Plugar em `CLAUDE.md`, `AGENTS.md`, `.agents/`, `.codex/` (todos já existem — editar, não duplicar).
- Checkbox no template de PR: *li INVENTARIO-SISTEMA.md e atualizei as seções afetadas*.
- Cruzar com `FEATURE_REGISTRY.md` para eliminar contradição entre os dois.
- Teste final: pegar 5 componentes ao acaso e conferir se o doc bate com a realidade.
- **Saída:** arquivos de enforcement atualizados + nota de validação

---

## 4. Sobrevivência a estouro de contexto

O chat vai lotar. O plano assume isso.

**Três regras que tornam o trabalho retomável:**

1. **Nada existe só no chat.** Toda fase termina com commit em `docs/estado/`. Se o chat morrer no meio da Fase 4, as Fases 1-3 estão no repo, intactas.
2. **`_PROGRESSO.md` é a única fonte de verdade.** Atualizado ao fim de cada bloco, com o próximo passo escrito de forma explícita.
3. **Retomada em uma frase.** Em chat novo, basta: **"lê PLANO-ESTADO.md e _PROGRESSO.md do zapp-web-v3 e continua de onde parou"**. Sem cola, sem re-explicação, sem reconstruir contexto na mão.

**Divisão sugerida por sessão de chat** (estimativa, não regra):

| Sessão | Fases |
|---|---|
| S1 | 0, 1 |
| S2 | 2, 3 |
| S3 | 4, 5 |
| S4 | 6, 7 |
| S5 | 8, 9 |

Se uma sessão render mais, segue adiante. Se render menos, para no fim do bloco e commita.

---

## 5. Regras de execução

- **Zero invenção.** Componente não verificado entra como `NAO_VERIFICADO`, nunca como `OK`. Documento com veredito chutado é pior que documento ausente.
- **Saídas parciais são commitadas cruas.** Polimento só na Fase 8.
- **Um bloco por vez.** Bloco fechado = commit imediato.
- **`INVENTARIO-SISTEMA.md` só nasce na Fase 8.** Antes disso ele não existe, para não circular versão incompleta.
- **Divergência encontrada não é corrigida durante o inventário.** Registra e segue. Corrigir durante a auditoria contamina o retrato.

---

## 6. Risco conhecido

O documento envelhece. Em duas semanas sem manutenção ele passa a mentir, e um `INVENTARIO-SISTEMA.md` desatualizado é mais perigoso que nenhum — agente confia nele e age errado. Por isso a Fase 9 não é opcional: sem o gancho no template de PR, este trabalho tem prazo de validade curto.

---

## 7. Isolamento — trabalho de outro agente no mesmo repo

**Emenda de 2026-08-08.** Existe um `ESTADO.md` na raiz, produzido por **outro agente**
na branch `docs/estado-inventario-20260808` (commit `aaecf2b12`, 13:20). Ele e um
documento diferente, com escopo proprio: registro operacional de "o que esta ligado e
quem chama", 375 linhas, mais as pendencias P1-P6 de midia e storage.

**Regras, sem excecao:**

1. **Nao ler, nao copiar, nao mesclar, nao citar** o `ESTADO.md` daquela branch como
   insumo deste trabalho. As Fases 1-9 medem tudo de forma independente.
2. **Nao commitar em `docs/estado-inventario-20260808`** nem em qualquer branch que
   nao seja `docs/estado-inventario`.
3. **Nao criar nem editar `ESTADO.md` na raiz.** Aquele caminho pertence ao outro
   agente. O entregavel desta trilha e `INVENTARIO-SISTEMA.md`.
4. Trabalhar exclusivamente no worktree `/workspace/estado-inventario`.

**Por que o rename:** o pedido original era `ESTADO.md` na raiz. O caminho ja estava
ocupado quando este plano foi escrito — falha de verificacao minha, o plano nasceu
1h20 depois daquele commit sem checar o terreno. Renomear e a unica forma de os dois
trabalhos coexistirem sem que um sobrescreva o outro no merge.

**Nao confunda as branches.** Os nomes sao quase identicos:

| Branch | Dono | Entregavel |
|---|---|---|
| `docs/estado-inventario` | esta trilha | `INVENTARIO-SISTEMA.md` |
| `docs/estado-inventario-20260808` | outro agente | `ESTADO.md` |
