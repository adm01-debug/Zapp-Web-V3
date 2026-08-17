# AGENTS.md — Regras de execução do Plano 100 Etapas (auditoria 2026-08-16)

> **Para agentes de IA (Claude Code, Hermes, etc.) que forem executar este plano.**
> Leia isto ANTES de tocar em qualquer etapa. Você é EXECUTOR; a validação é externa.

## Onde estou

Pasta `docs/audit-2026-08-16/` do repo `adm01-debug/zapp-web-v3`. O plano completo está em `PLANO-100-ETAPAS.md`; a versão fatiada por fase (recomendada para execução) em `fases/`.

## Como executar

1. **Uma fase por vez, em ordem** (1 → 10). Dentro da fase, executar as etapas na numeração.
2. **Uma etapa por PR.** Branch: `fix/audit-20260816-etapa-NN-<slug>`. Nunca commitar direto na main.
3. **Leia a etapa inteira antes de começar**: Objetivo → Base (pendência real com evidência `finding:linha`) → 10 subetapas → Critério de conclusão.
4. **Execute as subetapas em ordem** (N.1 → N.10). Marque cada `[x]` no arquivo da fase conforme conclui (commit do progresso do checklist junto com o código, ou em PR separado de doc).
5. **Critério de conclusão = contrato.** Etapa só é DONE quando TODOS os itens do critério passam com evidência real (saída de comando, screenshot, query, log). Nunca marcar por "deveria funcionar".
6. **Validação por etapa** (camada VALIDA): após implementar, rodar a validação (claude -p com resumo compacto do diff + critérios; ver `~/.claude/CLAUDE.md`). REPROVADO → corrigir e revalidar (máx 3x).
7. **Gates locais antes do push**: `bunx tsc --noEmit`, `bun run lint`, `bunx vitest run <arquivos tocados>` — evidência no corpo do PR.

## Regras de segurança (não-negociáveis)

- **Etapa 93 é pré-condição global**: nenhuma ação destrutiva (rotação de segredo, deleção, `git filter-repo`, privatização de bucket, DROP) sem backup validado + rollback ensaiado. Se a Etapa 93 ainda não foi feita, FAÇA-A PRIMEIRO (está na Fase 10, mas pode ser executada antes).
- **Banco de produção é DB-as-source**: DDL via migration versionada (`YYYYMMDDHHMMSS`), registrada em `supabase_migrations.schema_migrations`. Migrações ADDITIVE (nunca DROP de PK/UNIQUE/FK/índice de suporte sem revisão sênior + aprovação do dono).
- **RLS**: toda mudança de policy com canário pré/pós (`archive._rls_canary_<data>`, SET ROLE + JWT claims) e prova de que `admin.pre == admin.post`.
- **Nunca expor segredo em chat/PR/commit.** Secrets só via vault/MCP; rotações com janela documentada.
- Etapas marcadas **[APROVAÇÃO]**: parar na 1ª subetapa e aguardar decisão do dono (Joaquim). Não "deduzir" a aprovação.
- **Worktree isolado** (nunca `git checkout -b` no checkout principal; repo é multi-agente): `git worktree add C:/... fix/... origin/main`.

## Pós-etapa

1. Atualizar o checklist da etapa no arquivo `fases/fase-XX-*.md` (marcar `[x]` + adicionar evidência).
2. PR com: o que mudou, evidência dos gates, critério de conclusão item a item.
3. Merge squash (via MCP GitHub). Delete branch. Cleanup do worktree.
4. Registrar progresso no `README.md` da pasta (tabela de status por fase, se existir).

## Armadilhas conhecidas do repo (respeitar sempre)

- Porta dev = 8080 (nunca 5173); `schema: 'zapp'` no PostgREST (nunca `evo` — PGRST106); edge functions não usam `.schema('evo')`.
- Realtime só funciona com tabelas FÍSICAS na publication `supabase_realtime` (views não entram).
- `supabase_apply_migration` bugado no self-hosted: DDL via `supabase_db_query` + INSERT manual no ledger.
- MSYS/git-bash: `cmd | tail` esconde exit code — validar com `> /tmp/out 2>&1; echo EXIT=$?`.
- Testes: usar `bunx vitest run <arquivo>` (nunca `bun test` — não carrega setup DOM).
- Portainer: resolver ID do container fresco antes de `exec` (IDs rotacionam).
- Docs `docs/estado/*` declaram `Runtime: NAO_VERIFICADO` — tratar status de docs antigos como estático; conferir o banco vivo antes de afirmar.
