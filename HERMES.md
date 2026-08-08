# HERMES.md — Agente Hermes no ZAPP Web

> Este arquivo é lido por agentes Hermes antes de qualquer execução no projeto.
> Para contexto de infra, banco e edge functions leia também:
> - [`CLAUDE.md`](./CLAUDE.md) — regras obrigatórias e contexto profundo
> - [`ESTADO.md`](./ESTADO.md) — o que está ligado, o que foi arquivado, pendencias abertas
> - [`AGENTS.md`](./AGENTS.md) — regras de engajamento para qualquer agente (banco, schemas, migrations)

---

## O que é o Hermes neste projeto

Hermes é o framework de agentes de IA que opera sobre o ZAPP Web. Ele tem três componentes:

| Componente | Onde vive | Papel |
|---|---|---|
| **Gateway** | Docker Swarm `hermes_gateway` (imagem `ghcr.io/openclaw/openclaw`) | Ponto de entrada HTTP para tarefas automáticas |
| **Agentes paralelos** | Sessões Claude Code no VPS (`claude-code`, stack 122) | Executam planos multi-etapa (E1–E10 pattern) |
| **Logs de execução** | `.hermes/` no repo | Rastreamento de auditorias, planos e incidentes |

---

## Regras de execução para agentes Hermes

### Antes de qualquer tarefa

1. **Leia `ESTADO.md`** — verifica o que já existe antes de construir.
2. **Leia `CLAUDE.md`** — regras de banco, schemas e edge functions.
3. Se for tarefa de infra (stacks, Evolution, Supabase): leia também o runbook relevante em `infra/runbooks/`.

### Padrões obrigatórios

**Commits:** sempre via `git commit --no-verify -m 'tipo(escopo): mensagem'` no container VPS. Não usar Lovable ou commit direto pelo chat.

**Branch:** mudanças de produção vão para `main`. Mudanças de documentação vão para branches `docs/` ou `fix/` e são mergeadas com push direto (o token do runner tem bypass de branch protection).

**Edge functions:** toda função nova declara o chamador no mesmo commit. Sem chamador, não entra. Referencia à regra no `ESTADO.md`.

**Deploy de edge functions:** push na `main` que toque `supabase/functions/**` dispara `edge-deploy.yml` automaticamente. Não copiar arquivos manualmente para o volume.

**Banco — schema correto:**
- Tabelas da aplicação → schema `zapp`
- Dados WhatsApp/Evolution → schema `evo`
- Nunca criar tabela em `public`
- Migrations com nome `YYYYMMDDHHMMSS_descricao.sql`

### Padrões proibidos

- Executar DDL direto em produção sem migration versionada
- Ligar `cleanup-storage-orphans` sem medir o que será deletado antes
- Alterar `VERIFY_JWT` ou credenciais de prod sem registrar no runbook
- Commitar `apikey: ***` literal (gate de CI bloqueia)

---

## Padrão de execução paralela (Ondas E1–E10)

Quando uma tarefa é dividida em agentes paralelos:

1. O orquestrador cria o tracking board em `.hermes/auditoria-*/TRACKING.md`
2. Cada agente (E1–E10) relata em `.hermes/execucao-*/EN-nome.md`
3. O orquestrador consolida e atualiza o tracking ao final de cada onda
4. Etapas não executadas ficam como `⏳ pendente` com ponteiro para a próxima onda

Não feche uma onda sem atualizar o tracking board. Não inicie uma onda sem ler o estado da anterior.

---

## Estado atual da infraestrutura Hermes

| Item | Estado |
|---|---|
| Gateway (`hermes_gateway`) | UP — container `e073c40809c3`, stack `hermes` |
| Backup do workspace (`hermes-backup`) | UP |
| Guard (`hermes-guard`) | UP |
| Container VPS Claude Code (stack 122) | UP — `/workspace` persistido |
| Runner self-hosted GitHub Actions | UP — label `vps-zapp`, org-level |

---

## O que o Hermes não deve fazer sozinho

- Tomar decisões de arquitetura que afetam mais de um sistema (ex.: trocar de provider WhatsApp)
- Apagar arquivos de storage sem cruzar com 4 fontes de referencia primeiro
- Mergear na `main` mudanças que não passaram pelo `edge-deploy.yml`
- Criar nova dependência externa sem registrar em `ESTADO.md`

Essas decisões requerem aprovação explícita do responsável: **Joaquim (adm01@promobrindes.com.br)**.
