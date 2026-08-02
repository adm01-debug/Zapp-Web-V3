# HANDOFF — Revisão completa do corpo dos 172 achados (Blocos 1-8)

**Repo:** `adm01-debug/zapp-web-v3` · **branch:** `main`
**Base:** `docs/audits/PLANO_IMPLEMENTACAO_100.md` — 200 achados, 1.962 linhas
**Escopo desta missão:** os **172 achados dos Blocos 1-8** (F1-01 até F8-17), que ocupam as **linhas 12 a 1.437** do PLANO.
**Fora de escopo:** Temas 15, 15B e 16 (F9-*, F10-* — 28 achados). Já foram revisados na sessão de origem; não reabrir.

> **Correção de registro:** sessões anteriores citaram "171 achados". A contagem exata é **172** (14+13+12+24+30+30+32+17). Use 172.

---

## 1. Por que esta missão existe

A auditoria de 100 etapas produziu 200 achados com evidência medida e aceite binário — material de boa qualidade. Mas os Blocos 1-8 foram escritos **semanas antes** dos Blocos 9-10, e uma amostragem de 17 achados feita em 2026-08-02 encontrou **~12% com defeito de referência**:

- **F7-16** — afirma que o cron 100 falha 100% porque "`dblink` não está instalada" e manda rodar `CREATE EXTENSION`. Medição real: a extensão **está** instalada (v1.2), `ops.fn_analytics_log_retention` **já** qualifica como `zapp.dblink(...)`, e o cron teve sucesso. A ação proposta é no-op.
- **F6-06** — aponta `evo.fn_alert_wpp2_disconnection`. A função vive em **`zapp`**. O problema substantivo (hardcode `'wpp2'`) está confirmado, mas executar a Ação como escrita **criaria uma função nova em `evo`** — duplicata silenciosa em produção.

Os dois têm a mesma causa: quem mediu usava `search_path` e não qualificou o schema. **Não é erro aleatório — é padrão sistemático, logo previsível e pesquisável.**

O risco de não fazer esta revisão: a esteira de correção (20 etapas) executa Ações erradas em produção, criando duplicatas e desperdiçando sessões.

---

## 2. O que exatamente verificar em cada achado

Para cada um dos 172, produzir um veredito em **quatro dimensões**. Achado sem as quatro não está revisado.

| # | Dimensão | Como verificar | Falha significa |
|---|---|---|---|
| 1 | **Referência existe e está no schema certo** | `pg_proc` / `pg_class` / `pg_policies` / `pg_indexes` para objetos de banco; `test -f` / `grep` para arquivos | Ação criaria duplicata ou falharia |
| 2 | **Evidência ainda é verdadeira** | Re-executar a query/grep citada na Evidência | Achado obsoleto — já corrigido ou mudou |
| 3 | **Ação é executável como escrita** | Ler criticamente: os comandos rodam? o objeto citado aceita essa alteração? | Ação precisa reescrita |
| 4 | **Aceite é verificável e binário** | O critério tem comando concreto e resposta sim/não? | Aceite precisa reescrita |

### Vereditos possíveis (use exatamente estes rótulos)

- `✅ VÁLIDO` — as quatro dimensões passam.
- `⚠️ REFERÊNCIA` — problema substantivo real, mas objeto/schema/caminho errado. **Corrigir a referência no PLANO.**
- `🔄 OBSOLETO` — a condição não existe mais. **Marcar `~~OBSOLETO~~` com a evidência da revalidação; não deletar.**
- `📝 AÇÃO FRÁGIL` — diagnóstico certo, mas a Ação não roda ou o Aceite não é verificável. **Reescrever Ação/Aceite.**
- `❓ INDETERMINÁVEL` — não dá para verificar sem ambiente de execução (ex.: comportamento de UI em browser). **Registrar como tal e seguir** — não inventar veredito.

---

## 3. Divisão em 3 lotes

172 achados não cabem numa sessão. Divididos por **natureza da ferramenta de verificação**, que é o que muda o método:

| Lote | Blocos | Achados | Ferramenta dominante |
|---|---|---:|---|
| **A** | F2 (13) + F5 (30) + F8 (17) | **60** | SQL — 77 menções de banco em F5, 52 em F8 |
| **B** | F4 (24) + F6 (30) | **54** | Misto — inbox/conexões tocam banco e código |
| **C** | F1 (14) + F3 (12) + F7 (32) | **58** | `grep`/leitura de código — 17 menções de arquivo em F7 |

**Faça um lote por sessão.** Ao terminar, commite e atualize a tabela de progresso (§7). O lote seguinte pega daí.

Se o contexto apertar no meio de um lote, **pare num limite de bloco** (ex.: terminou F5, não começou F8), registre e commite. Nunca deixe um bloco pela metade sem registrar até onde foi.

---

## 4. Método eficiente (importa muito — 172 é bastante)

**Não verifique um por um em chamadas separadas.** O padrão que funciona:

1. **Leia o lote inteiro de uma vez** do PLANO:
   ```bash
   sed -n '<linha_inicio>,<linha_fim>p' docs/audits/PLANO_IMPLEMENTACAO_100.md
   ```
   Mapa de linhas: Tema 1 (l.12), Tema 2 (40), Tema 3 (48), Tema 4 (65), Tema 5 (84), Tema 6 (98), Tema 7 (108), Tema 8 (147), Tema 9 (320), Tema 10 (324), Tema 11 (330), Tema 12 (634), Tema 13 (951), Tema 14 (1258), **fim do escopo: linha 1437**.

2. **Extraia todos os objetos citados** e verifique em **uma query**:
   ```sql
   SELECT 'zapp.merge_contacts' AS citado,
          (SELECT string_agg(n.nspname,',') FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
            WHERE p.proname='merge_contacts') AS schemas_reais
   UNION ALL SELECT ...
   ```
   Uma query resolve 20-30 referências. Faça isso **antes** de qualquer verificação individual.

3. **Agrupe as revalidações de evidência** por tipo: todos os `COUNT(*)` numa query com `UNION ALL`; todos os greps num `code_exec` só.

4. Só então leia criticamente Ação/Aceite dos que sobraram.

**Orçamento estimado:** 12-20 tool calls por lote se seguir esse método. 60+ se verificar um a um — e aí o contexto acaba antes do lote.

---

## 5. Ambiente

**Repo:** `/workspace/repos/zapp-web-v3` (container Claude Code na VPS, via `CLAUDE CODE - VPS - MCP`).
**Banco:** `SUPABASE SELF HOSTED - MCP` — `supabase.atomicabr.com.br`, schema principal `zapp`.

**Armadilhas conhecidas (todas já custaram tempo):**
- Objetos `zapp.*` são frequentemente **VIEW** de `evo.*` (`contacts`, `messages`, `evolution_guardian_heartbeat`). Constraints não aparecem por view — foi assim que a sessão anterior concluiu erradamente que `uq_msg_msgid_instance` não existia.
- `cron.job_run_details` retém **~3,5 dias**. Achado que fala de "7 dias de histórico" não é mais verificável nessa janela.
- Extensões podem estar registradas num schema e ter as funções em outro (caso `dblink`: `extnamespace`=`public`, funções em `zapp`).
- `python3` **não existe** no container. Use `perl`, `awk` ou `sed`.
- Husky `pre-commit` chama `bun`, que não existe. Procedimento: `mv .husky/pre-commit .husky/pre-commit.disabled_temp` → commit → `mv` de volta. **Sempre restaurar.**
- PAT do GitHub expira. Se `git push` retornar `Invalid username or token`, **pare e peça** — não invente credencial. O commit local fica preservado.
- **Proibido:** `git push --force`, `git reset --hard`, `rebase -i`. Há histórico de perda de 30k commits em outro repo por force-push.

---

## 6. Entregável

### 6.1 Documento de vereditos
Criar/atualizar `docs/audits/REVISAO_BACKLOG_172.md` com uma linha por achado:

```markdown
| Achado | Veredito | Evidência da revisão | Correção necessária |
|---|---|---|---|
| F5-04 | ✅ VÁLIDO | `pg_get_functiondef` ainda contém `implementacao pendente` | — |
| F6-06 | ⚠️ REFERÊNCIA | função está em `zapp`, não `evo`; hardcode `'wpp2'` confirmado | trocar `evo.` por `zapp.` na Ação |
| F7-16 | 🔄 OBSOLETO | dblink v1.2 instalada; função já usa `zapp.dblink`; cron com sucesso | reescrever para apontar a F9-13 |
```

### 6.2 Correções aplicadas no PLANO
Para `⚠️ REFERÊNCIA` e `📝 AÇÃO FRÁGIL`, **editar o `PLANO_IMPLEMENTACAO_100.md` diretamente**. Para `🔄 OBSOLETO`, marcar o título com `~~OBSOLETO~~` e adicionar linha `- **Revalidado em 2026-XX-XX:** <evidência>`.

**Não altere a numeração F<n>-<nn> nem remova achados** — o `PLANO_CORRECAO_20_ETAPAS.md` referencia todos os 200 por ID, e a cobertura foi validada por script.

### 6.3 Verificação de integridade antes do commit
```bash
grep -c "^### F" docs/audits/PLANO_IMPLEMENTACAO_100.md   # deve continuar 200
grep -m1 "Total de achados" docs/audits/PLANO_IMPLEMENTACAO_100.md  # deve continuar 200
```

### 6.4 Commit
`docs(audit): revisao do corpo -- Lote <A|B|C> (<N> achados: X validos, Y referencia, Z obsoletos)`

---

## 7. Progresso (atualize ao fim de cada sessão)

| Lote | Blocos | Achados | Status | Sessão | Resultado |
|---|---|---:|---|---|---|
| A | F2, F5, F8 | 60 | ✅ concluído | 2026-08-02 | 40 ✅ · 6 ⚠️ · 3 🔄 · 10 📝 · 1 ❓ — ver `REVISAO_BACKLOG_172.md` |
| B | F4, F6 | 54 | ✅ concluído | 2026-08-02 | 44 ✅ · 4 ⚠️ · 2 🔄 · 4 📝 — ver `REVISAO_BACKLOG_172.md` |
| C | F1, F3, F7 | 58 | 🟡 parcial (26/58) | 2026-08-02 | F1+F3 revisados; **F7 (32) pendente** |

**Ao concluir os 3 lotes:** atualizar a Etapa 1 do `PLANO_CORRECAO_20_ETAPAS.md` marcando a revalidação como feita, e registrar a taxa final de defeito (a amostragem apontou ~12% — o número real sai daqui).

---

## 8. O que NÃO fazer

- **Não corrigir o código/banco.** Esta missão revisa o *backlog*, não executa correções. Se encontrar algo alarmante, registre e siga.
- **Não reabrir F9-* / F10-*.** Fora de escopo.
- **Não deletar achados obsoletos** — marcar preserva a rastreabilidade da auditoria.
- **Não inventar veredito** para o que não dá para verificar sem browser. Use `❓ INDETERMINÁVEL`.
- **Não renumerar nada.**
- **Não narrar cada passo.** Meça em lote, registre, siga.
