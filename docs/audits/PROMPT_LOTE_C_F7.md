# PROMPT — Lote C / estágio 2 (F7, 32 achados) — fecha a missão

Cole o bloco abaixo num chat novo.

---

Preciso que você **feche a revisão do backlog de auditoria do `zapp-web-v3`**, executando o último bloco pendente: **F7 (32 achados)**.

**Leia primeiro, nesta ordem, via `CLAUDE CODE - VPS - MCP` (`code_read_file`, caminhos relativos a `/workspace`):**

1. `repos/zapp-web-v3/docs/audits/HANDOFF_REVISAO_BACKLOG.md` — metodologia, 4 dimensões de verificação, 5 vereditos, método eficiente (§4), armadilhas do ambiente (§5), formato do entregável (§6).
2. `repos/zapp-web-v3/docs/audits/REVISAO_BACKLOG_172.md` — os **140 vereditos já emitidos** (Lotes A, B e C-estágio-1). **Leia a seção final "Regras acumuladas"** — é o que economiza a sessão.

Ambos são autossuficientes. Não repito a metodologia aqui.

## Estado atual

| Lote | Blocos | Achados | Status |
|---|---|---:|---|
| A | F2, F5, F8 | 60 | ✅ concluído — 40 ✅ · 6 ⚠️ · 3 🔄 · 10 📝 · 1 ❓ |
| B | F4, F6 | 54 | ✅ concluído — 44 ✅ · 4 ⚠️ · 2 🔄 · 4 📝 |
| C (est. 1) | F1, F3 | 26 | ✅ concluído — 13 ✅ · 4 ⚠️ · 2 🔄 · 6 📝 · 1 ❓ |
| **C (est. 2)** | **F7** | **32** | **⬜ SUA MISSÃO** |

**140/172 revisados. Taxa de defeito de referência/evidência acumulada: 21/140 = 15%** (a amostragem de origem estimava ~12%).

Último commit: `27a02da9d`. Branch `main`, sincronizada com `origin`.

## Escopo exato

Os **32 achados F7-01 a F7-32** ocupam as **linhas 1003 a 1307** de `docs/audits/PLANO_IMPLEMENTACAO_100.md`.
Confirme o range antes de ler (o arquivo cresceu com as notas de revisão dos lotes anteriores):

```bash
grep -n "^### F7-" docs/audits/PLANO_IMPLEMENTACAO_100.md | head -3
grep -n "^### F7-" docs/audits/PLANO_IMPLEMENTACAO_100.md | tail -1
```

**Fora de escopo:** F1-F6, F8, F9-*, F10-*. Já revisados — não reabrir.

F7 é o bloco **mais dependente de `grep`** (17 menções de arquivo). É onde as regras 1, 2 e 6 abaixo mais rendem.

## As 7 regras que os lotes anteriores produziram — aplique TODAS

1. **O roteador de rotas é `src/components/routing/AppRoutes.tsx`.** Não é `src/App.tsx`, nem `src/pages/ViewRouter.tsx`, nem `src/pages/lazyViews.ts` — esses três existem, mas não registram `<Route>`. `?view=` é resolvido por `src/pages/lazyViews.ts` (76 imports dinâmicos). **Órfã ≠ inalcançável.** Esse erro sozinho produziu 3 falsos positivos (F8-01, F8-10, F1-13).
2. **Nenhum achado de remoção sem grep de consumidores em `src/` inteiro** — incluindo `src/main.tsx` e `AppRoutes.tsx`. O padrão "deletar algo que está em uso" apareceu **4 vezes** (F8-01, F8-10, F3-03, F3-08). Se um achado manda `git rm` ou `DROP`, prove que ninguém consome antes de validar.
3. **Policies: `polcmd='a'` → ler `polwithcheck`, nunca `polqual`.** Em policy `INSERT` o `polqual` é sempre NULL por definição. Foi assim que F5-14 virou falso positivo.
4. **Conferir se o Aceite fecha com a Ação.** Pergunta padrão: *"se eu executar exatamente os passos da Ação, o comando do Aceite retorna o valor esperado?"* Três achados do Lote B falharam nisso (F6-06, F6-07, F4-22).
5. **Confirmar existência de todo alvo citado como destino**, não só como origem (`zapp.evolution_pending_deletes`, `docs/audits/secdef-zapp.csv` e `docs/audits/history/` eram citados como se existissem — nenhum existe).
6. **Ignorar números de linha — localizar por símbolo.** Em F4 os 16 estavam defasados; em F3-01 a linha citada apontava para outro achado. Cuidado com **homônimos de arquivo**: `useRealtimeMessages.ts`, `useMediaUrl.ts`, `useContactsSearch.ts`, `useContactIntelligence.ts`, `useSLAHistory.ts`, `SLADashboard.tsx` existem em mais de um diretório e **não são re-exports**.
7. **Conferir assinatura de RPC antes de aceitar chamada proposta em Ação.** `zapp.log_security_event` exige 5 params sem DEFAULT; a Ação do F3-02 chamava com 1.

**Extra:** `pg_stat_statements` foi resetado em **2026-07-31 18:36** — qualquer número de performance anterior a essa data não é reproduzível; marque `❓ INDETERMINÁVEL` em vez de inventar.

## Método (§4 do handoff — obrigatório)

32 achados só cabem se você **agrupar**:

1. Leia o bloco F7 inteiro de uma vez com `sed -n '<ini>,<fim>p'`.
2. Extraia **todos** os arquivos citados e faça **um único `code_exec`** que testa existência (`test -f`), conta linhas e grepa os símbolos — com greps **por arquivo**, não `grep -r` global com `head` (o `head` trunca e produz falso "0 hits"; isso quase me enganou no Lote B).
3. Todos os objetos de banco numa query só, com `UNION ALL` / `supabase_db_batch_query`.
4. Só então leia criticamente Ação/Aceite dos que sobraram.

Orçamento: **12-20 tool calls**. Um a um estoura o contexto antes do bloco terminar.

## Entregável

1. **Vereditos:** append em `docs/audits/REVISAO_BACKLOG_172.md`, seguindo o formato das seções já existentes (tabela `| Achado | Veredito | Evidência da revisão | Correção necessária |`), mais um resumo executivo do bloco. Atualize a tabela de status do topo.
2. **Correções no PLANO:** editar `docs/audits/PLANO_IMPLEMENTACAO_100.md` direto. `⚠️ REFERÊNCIA` e `📝 AÇÃO FRÁGIL` → corrigir referência / reescrever Ação-Aceite. `🔄 OBSOLETO` → prefixar o título com `~~OBSOLETO~~` e adicionar `- **🔄 Revalidado em 2026-XX-XX:** <evidência>`. **Nunca deletar achado nem renumerar.**
3. **Fechamento da missão** (só depois de F7):
   - `docs/audits/HANDOFF_REVISAO_BACKLOG.md` §7 → Lote C ✅ concluído.
   - `docs/audits/PLANO_CORRECAO_20_ETAPAS.md` → marcar a **Etapa 1** (revalidação) como feita e **registrar a taxa final de defeito dos 172**.
4. **Verificação de integridade antes do commit:**
   ```bash
   grep -c "^### F" docs/audits/PLANO_IMPLEMENTACAO_100.md      # DEVE ser 200
   grep -m1 "Total de achados" docs/audits/PLANO_IMPLEMENTACAO_100.md  # DEVE dizer 200
   for b in 1 2 3 4 5 6 7 8; do echo -n "F$b: $(grep -c "^### F$b-" docs/audits/PLANO_IMPLEMENTACAO_100.md) "; done
   # esperado: F1:14 F2:13 F3:12 F4:24 F5:30 F6:30 F7:32 F8:17
   ```
5. **Commit:** `docs(audit): revisao do corpo -- Lote C estagio 2: F7 (32 achados: X validos, Y referencia, Z obsoletos, W acao fragil)`

## Ambiente

- Repo: `/workspace/repos/zapp-web-v3` (container Claude Code na VPS, via `CLAUDE CODE - VPS - MCP`). **`code_read_file` usa caminho relativo a `/workspace`** — `repos/zapp-web-v3/...`, sem barra inicial.
- Banco: `SUPABASE SELF HOSTED - MCP` (`supabase.atomicabr.com.br`), schema principal `zapp`. Use `supabase_db_batch_query` para agrupar (máx. 20 queries por chamada).
- **`python3` não existe** no container. Use `perl`, `awk` ou `sed`. Para editar o PLANO, script `perl` com `s/\Q...\E/.../` e log de OK/FALHOU por substituição.
- **Husky `pre-commit` chama `bun`, que não existe.** Procedimento: `mv .husky/pre-commit .husky/pre-commit.disabled_temp` → commit → `mv` de volta. **Sempre restaurar.**
- **Git já está configurado e funcionando.** O `push` foi destravado: havia uma regra `url.<...>.insteadOf` no `/root/.gitconfig` injetando um PAT expirado, que foi removida; hoje usa `credential.helper=store`. Se o push falhar, cheque **primeiro**: `git config --global --list | grep -i insteadof` (deve retornar vazio). Não invente credencial — pare e peça.
- **Proibido:** `git push --force`, `git reset --hard`, `rebase -i`.

## Objetivos de qualidade

- Prefira **precisão a volume**: um veredito errado custa mais que um `❓ INDETERMINÁVEL` honesto.
- Registre **achados novos** que aparecerem durante a revisão (a seção existe no documento) — mas **não corrija código nem banco**. Esta missão revisa o *backlog*.
- Não narre cada passo. Meça em lote, registre, siga.
