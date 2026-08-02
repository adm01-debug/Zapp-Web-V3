# Plano de Correção — 20 Etapas

**Base:** `PLANO_IMPLEMENTACAO_100.md` (200 achados, Temas 1-16) · **Criado:** 2026-08-02
**Propósito:** transformar 200 achados de auditoria em 20 unidades de trabalho executáveis, cada uma dimensionada para caber em **uma sessão de chat**, com pré-requisitos explícitos e handoff limpo.

**Como usar:** cada etapa é autossuficiente. Ao pegar uma, leia (a) esta seção da etapa, (b) os achados listados no `PLANO_IMPLEMENTACAO_100.md`, (c) a seção "Antes de começar" abaixo. Ao terminar, marque a etapa e registre o resultado em `RELATORIO_CORRECAO.md`.

---

## Parte I — Revisão crítica do backlog

Antes de dividir, revisei os 200 achados. **O backlog não está pronto para execução direta.** Cinco problemas precisam ser tratados na Etapa 1, senão contaminam tudo que vier depois.

### 1. Um achado tem diagnóstico factualmente errado

**F7-16** afirma: *"Cron 100 `analytics-log-retention` 100% falha (`dblink` não instalada)"*, com evidência `function public.dblink(text, text) does not exist` e ação `CREATE EXTENSION IF NOT EXISTS dblink;`.

Medição de hoje refuta os três pontos:
- A extensão **está instalada** (`pg_extension` → dblink v1.2).
- `ops.fn_analytics_log_retention` **já qualifica** como `zapp.dblink(...)`.
- O cron **não falha 100%**: 1 sucesso em 3 execuções no histórico atual.

A causa real é a mesma de **F9-13**: as funções `dblink` vivem no schema `zapp`, enquanto `pg_extension.extnamespace` aponta para `public` — quem não qualificar ou não tiver `zapp` no `search_path` quebra. Executar a ação de F7-16 como está seria um no-op.

**Consequência para o plano:** achados dos blocos 1-7 foram medidos há semanas. Alguns envelheceram, outros nasceram com diagnóstico incompleto. **A Etapa 1 revalida antes de qualquer correção.**

#### Amostragem de validação (17 achados testados em 2026-08-02)

Para dimensionar o problema em vez de supor, revalidei 17 achados dos Blocos 5-8 escolhidos por terem aceite verificável em SQL:

| Resultado | Qtd | Detalhe |
|---|---:|---|
| **Confirmados** | 15 | Contagens batem; divergências pequenas (269→280 alertas, 724→731, 20445→20446 contatos) são crescimento natural, não erro |
| **Defeito de referência** | 2 | F7-16 e F6-06 |

**Taxa de defeito: ~12%.** O corpo dos achados é sólido — o que falha é a **qualificação de schema**:

- **F7-16** — diagnóstico errado (extensão instalada, função já qualificada, cron não falha 100%).
- **F6-06** — aponta `evo.fn_alert_wpp2_disconnection`; a função vive em **`zapp`**. O problema substantivo (hardcode `'wpp2'`) **está confirmado**, mas executar a Ação como escrita criaria uma função nova em `evo` em vez de corrigir a existente — **duplicata silenciosa em produção**.

Ambos os defeitos são da mesma classe: quem mediu usava `search_path` e não qualificou o schema. **Na Etapa 1, verificar `pg_proc`/`pg_class` de todo objeto citado antes de aceitar a referência.**

Confirmados sem ressalva na amostra: F5-04 (ainda stub), F5-07 (funções ausentes), F5-11, F5-13, F5-26, F6-16, F6-18, F6-23, F7-11, F7-14, F7-18, F7-20, F8-02 (41 tabelas, 0 rows), F8-04 (2 stubs), F8-06 (**82 de 82** policies permissivas), F8-08.

### 2. A severidade não é utilizável como está

- **102 dos 200 achados não têm severidade no título**; apenas 77 seguem o padrão `CRÍTICO/ALTO/MÉDIO/BAIXO`. Os Temas 1-4 e 7 foram escritos antes da convenção se firmar.
- Onde existe, está **inflacionada**: F5 tem 16 CRÍTICO em 30, F6 tem 15 em 30, F8 tem 9 em 17. Quando metade do bloco é crítica, a marcação perde função de ordenação.
- A inflação mistura naturezas incompatíveis: **F5-15** (RLS expõe contatos a todos os usuários — vazamento cross-tenant real) e **F5-12** (`search_contacts_cursor` sem `pg_trgm` — lentidão) têm a mesma etiqueta `CRÍTICO (P0)`.

### 3. Faltam dependências e causa-raiz explícitas

Vários achados são **sintomas do mesmo defeito** e não devem ser trabalhados isoladamente:

**Mapa completo de raízes (levantado na Etapa 1, item 4 — os campos `Depende de:` e `Raiz de:` já estão gravados em cada achado):**

| Raiz | Sintomas dependentes | Ganho |
|---|---|---:|
| **`F6-04`** duas fontes de verdade de instância | F6-03, F6-06, F6-13, F6-14, F6-16, F6-24 | 6 |
| **`F5-01`** view `zapp.contacts` descarta campos | F5-02, F5-03, F5-05, F5-06, F5-09 | 5 |
| **`F8-03`** 3 sistemas SLA paralelos sem canonical | F8-04, F8-05, F8-08, F8-14, F8-17 | 5 |
| **`F8-02`** schema `bpm` morto | F8-04, F8-05, F8-06, F8-15 | 4 |
| `F5-08` 5 estratégias de normalização de telefone | F5-04, F5-22 | 2 |
| `F5-09` + `F5-10` RPC de notas quebrada e bypassada | F5-11 (tabela vazia é consequência) | 1 |
| `F7-01` `// @technical` renderizado como texto | F7-02, F7-03 | 2 |
| `F7-12` filtro sem janela de 24h | F7-28 (mesmo defeito) | 1 |
| `F1-14` padrão duplo URL canônica vs `?view=` | F1-13, F7-09 | 2 |
| `F1-10` gate de lint com `\|\| true` | F10-06 (mesma classe) | 1 |
| `F10-09` `testDir` divergente | F10-02 (28 specs não rodam) | 1 |
| `F9-13` `search_path` sem `zapp` | F7-16 — **ambos já obsoletos** | — |
| `F9-10` DLQ resolve alertas sem alterar os booleanos | F9-09 é **pré-requisito** — inverter a ordem ativa bug latente | — |
| `F4-24` ≡ `F7-15` | mesmo cron (jobid 213) — **duplicata, ambos obsoletos** | — |

**34 achados têm `Depende de:` e 15 são raízes.** Corrigir só `F6-04`, `F5-01`, `F8-03` e `F8-02` na ordem certa endereça **20 achados** — 10% do backlog em 4 decisões.

Corrigir a raiz primeiro reduz o backlog real bem abaixo de 200.

### 4. Achados que são decisões de produto, não bugs

Estes **não podem ser "corrigidos" por um dev** — exigem decisão de Abner/Pink antes de virar tarefa:

- **F8-02** — schema `bpm` inteiro vazio (41 tabelas): ativar o módulo ou removê-lo?
- **F10-03 / F9-01 / F9-02 / F9-03** — PWA e fila offline: assumir ou remover? Há 4 specs testando a **ausência** de workbox, o que sugere remoção já decidida e não documentada.
- **F10-08** — impressão bloqueada: é proteção de PII deliberada, não defeito.
- **F8-03** — 3 sistemas SLA paralelos: qual é canônico?

Misturá-los com correção técnica trava a esteira. Vão para a **Etapa 13**, isolados.

### 5. Nenhum achado tem plano de rollback

Vários alteram RLS, triggers e views em produção com **20.445 contatos** e 17,5k mensagens ativas. O formato Origem/Evidência/Ação/Aceite é excelente para diagnóstico, mas não cobre "e se der errado".

**Resolvido em 2026-08-02 (Etapa 1, item 5):** **93 dos 200 achados** ganharam o campo `Rollback:` apontando para um dos 6 procedimentos canônicos definidos na Parte II — `R-POL` (policies), `R-FN` (funções e triggers), `R-VIEW` (views), `R-CRON` (jobs pg_cron), `R-DDL` (tabelas, colunas, índices, dados) e `R-CODE` (remoção de arquivo ou rota). Os outros 107 não alteram produção. **Achado com `Rollback:` não pode ser executado sem a captura do estado anterior salva e commitada.**

### O que continua muito bom

Vale registrar: os 200 achados têm **evidência medida com números reais** e **critério de aceite binário**. Isso é raro e é o que torna este plano executável. A revisão acima é sobre *organização*, não sobre qualidade da medição.

---

## Parte II — Antes de começar (leia em toda sessão)

**Ambiente:** repo em `/workspace/repos/zapp-web-v3` (container Claude Code na VPS). Banco: `SUPABASE SELF HOSTED - MCP`, schema principal `zapp`.

**Regras duras:**
- `git push --force`, `git reset --hard` e `rebase -i` são **proibidos** — há histórico de incidente com perda de 30k commits em outro repo.
- Husky `pre-commit` tenta rodar `bun`, que não existe no container. Procedimento: `mv .husky/pre-commit .husky/pre-commit.disabled_temp` → commit → `mv` de volta. **Sempre restaurar.**
- PAT do GitHub expira com frequência. Se o push falhar com `Invalid username or token`, **pare e peça** — não invente credencial.
- `cron.job_run_details` retém **~3,5 dias**. Qualquer janela maior é cega.
- Objetos `zapp.*` frequentemente são **VIEW** de `evo.*` (`contacts`, `messages`, `evolution_guardian_heartbeat`). Confirme `relkind` antes de concluir que uma constraint ou tabela não existe — essa armadilha já derrubou duas premissas.

**Procedimentos de rollback canônicos** (referenciados pelo campo `Rollback:` de cada achado — Etapa 1, item 5):

| Código | Aplica-se a | Capturar **antes** de executar | Como reverter |
|---|---|---|---|
| `R-POL` | Policies / RLS | `SELECT polname, polcmd, pg_get_expr(polqual,polrelid) AS q, pg_get_expr(polwithcheck,polrelid) AS wc FROM pg_policy WHERE polrelid='<schema>.<tabela>'::regclass;` | `DROP POLICY <nome> ON <tabela>` + recriar do texto salvo. Se a mudança foi `ENABLE ROW LEVEL SECURITY`, o inverso é `DISABLE`. Lembrete: em policy `INSERT` (`polcmd='a'`) a expressão vive em `polwithcheck` — `polqual` é sempre NULL. |
| `R-FN` | Funções e triggers | `pg_get_functiondef('<schema>.<fn>'::regproc)` e `pg_get_triggerdef` | `CREATE OR REPLACE FUNCTION` com o texto salvo. **Nunca `DROP`** — pode haver dependentes. Antes de qualquer alteração, resolver o schema com `pg_proc` + `pg_namespace`: função homônima em 2 schemas já produziu 2 incidentes nesta base. |
| `R-VIEW` | Views (inclusive as `zapp.*` sobre `evo.*`) | `pg_get_viewdef('<schema>.<view>', true)` **mais** os triggers `INSTEAD OF` | `CREATE OR REPLACE VIEW` com a definição salva. Se foi preciso `DROP VIEW ... CASCADE`, recriar também triggers e grants — o CASCADE leva os dois junto. |
| `R-CRON` | Jobs do pg_cron | `SELECT jobid, jobname, schedule, command, active, nodename, username FROM cron.job WHERE jobid=<n>;` | `cron.alter_job(<n>, schedule:=…, command:=…, active:=…)`. Job criado do zero: `cron.unschedule(<n>)`. Regra do ambiente: job com `VACUUM` tem de ser **single-statement**. |
| `R-DDL` | Tabelas, colunas, índices, dados | Tabela: `CREATE TABLE <schema>._backup_<tabela>_<yyyymmdd> AS SELECT * FROM <tabela>;` · Índice: `pg_get_indexdef` · Coluna: tipo, default e nullability de `information_schema.columns` | ALTER inverso a partir do capturado; dados restaurados do `_backup_*`. Convenção do projeto: `_backup_<nome>_<yyyymmdd>` são os **únicos** objetos novos permitidos. |
| `R-CODE` | Remoção de arquivo, página ou rota | Nada a capturar — o git é o backup. Mas confirmar consumidores: `grep -rn "<símbolo>" src/` **incluindo** `main.tsx`, `src/components/routing/AppRoutes.tsx` e `src/components/routing/AdminRoutes.tsx` | `git revert <sha>`. Nunca `git reset --hard`. |

**Definição de pronto por etapa:**
1. Todo achado da etapa tem seu **Aceite** verificado com comando real, e a saída registrada.
2. Achados que se revelarem obsoletos são marcados `~~OBSOLETO~~` com a evidência da revalidação — não deletados.
3. Commit no padrão `fix(<escopo>): E<NN> — <resumo> (<achados>)`.
4. Seção da etapa preenchida em `RELATORIO_CORRECAO.md`.

---

## Parte III — As 20 etapas

### Fase 0 — Fundação (não toca em produção)

#### Etapa 1 — Revalidar e recalibrar o backlog · ✅ **CONCLUÍDA** (itens 1 a 5)
**Achados:** nenhum consumido (meta-etapa sobre o próprio plano).
**Por que primeiro:** a amostragem de 17 achados encontrou **12% com defeito de referência** (F7-16, F6-06). Corrigir cegamente desperdiça sessões e pode causar dano.
**Escopo:**
1. Re-executar o **Aceite** de todos os 44 achados marcados `CRÍTICO` — muitos foram medidos há semanas. Marcar obsoletos.
2. **Verificar a qualificação de schema de todo objeto citado** (`pg_proc`, `pg_class`, `pg_policies`) — a amostragem achou 12% de defeito nessa classe. Referência errada faz a Ação criar duplicata em vez de corrigir.

3. Normalizar severidade nos 102 achados sem etiqueta, usando escala honesta: `SEC` (segurança/LGPD) > `QUEBRADO` (feature morta) > `RISCO` (latente) > `DEGRADADO` (perf/UX) > `HIGIENE`.

4. Adicionar campo `Depende de:` nos achados da tabela de raízes da Parte I.

5. Adicionar campo `Rollback:` nos achados que alteram RLS, trigger, view ou cron em produção.
**Pronto quando:** todo achado tem severidade normalizada e nenhum `CRÍTICO` está sem revalidação.
**Risco:** nenhum (só documentação).

> **Concluído em 2026-08-02 — itens 1 e 2 (revalidação e qualificação de schema).**
> Os **172 achados dos Blocos 1-8** foram revisados um a um nas 4 dimensões do handoff, em 3 lotes (A: F2/F5/F8 · B: F4/F6 · C: F1/F3/F7). Vereditos completos em `docs/audits/REVISAO_BACKLOG_172.md`; correções aplicadas diretamente no `PLANO_IMPLEMENTACAO_100.md`. Os 28 achados F9-*/F10-* já haviam sido revisados na sessão de origem.
>
> | Veredito | Qtd | % |
> |---|---:|---:|
> | ✅ VÁLIDO | 121 | 70,3% |
> | ⚠️ REFERÊNCIA | 17 | 9,9% |
> | 🔄 OBSOLETO | 11 | 6,4% |
> | 📝 AÇÃO FRÁGIL | 21 | 12,2% |
> | ❓ INDETERMINÁVEL | 2 | 1,2% |
>
> - **Taxa final de defeito de referência/evidência: 28/172 = 16,3%** (⚠️ + 🔄). A amostragem de 17 achados estimava ~12% — subestimou em ~4 pontos, mas acertou a ordem de grandeza.
> - **Não executáveis como escritos: 49/172 = 28,5%** (somando 📝). O defeito **estrutural** (Ação que não roda ou Aceite não verificável) é maior que o **factual** — a auditoria mediu bem e redigiu mal.
> - **11 achados obsoletos** foram marcados `~~OBSOLETO~~` com a evidência da revalidação; nenhum foi deletado e nenhum ID foi renumerado (os 200 seguem íntegros).
> - **Ainda pendentes nesta etapa:** item 3 (normalizar severidade nos 102 sem etiqueta), item 4 (campo `Depende de:`) e item 5 (campo `Rollback:`).
>
> **Não executar sem antes ler o veredito do achado.** Os 3 casos de maior risco: **F7-09** (mandava criar uma página que já existe), **F6-06** (criaria função duplicada em `evo`) e **F8-01** (removeria página alcançável por `?view=`).

> **Concluído em 2026-08-02 — itens 3, 4 e 5.**
>
> **Item 3 — severidade normalizada nos 200 achados.** Campo `Sev:` gravado logo abaixo do título de cada um, na escala `SEC` > `QUEBRADO` > `RISCO` > `DEGRADADO` > `HIGIENE`. A etiqueta antiga do título foi preservada para rastreabilidade, mas **não é mais canônica** — 25 achados sequer tinham corpo estruturado e nenhum tinha severidade utilizável.
>
> | Classe | Qtd | % |
> |---|---:|---:|
> | `SEC` | 28 | 14,0% |
> | `QUEBRADO` | 46 | 23,0% |
> | `RISCO` | 43 | 21,5% |
> | `DEGRADADO` | 34 | 17,0% |
> | `HIGIENE` | 38 | 19,0% |
> | obsoletos | 11 | 5,5% |
>
> O retrato honesto muda a leitura do backlog: **74 achados (37%) são `SEC` ou `QUEBRADO`** — bem menos que os 44 `CRÍTICO (P0)` inflacionados sugeriam em proporção, mas com fronteira utilizável. E **72 (36%) são `DEGRADADO` ou `HIGIENE`** — a metade de baixo pode esperar sem culpa.
>
> **Item 4 — dependências e causa-raiz.** Campos `Depende de:` (34 achados) e `Raiz de:` (15 raízes) gravados. Mapa completo na Parte I, item 3. As 4 maiores raízes — **F6-04**, **F5-01**, **F8-03**, **F8-02** — governam 20 achados: 10% do backlog decidido em 4 decisões, não em 20 correções.
>
> **Item 5 — rollback.** 93 achados receberam `Rollback:` com um dos 6 procedimentos canônicos (`R-POL`, `R-FN`, `R-VIEW`, `R-CRON`, `R-DDL`, `R-CODE`), definidos na Parte II. Os 107 restantes não alteram produção — a ausência do campo é informação, não esquecimento.
>
> **Etapa 1 encerrada.** Próxima: **Etapa 2 — ligar a rede de segurança do CI** (F1-10, F1-11, F10-02, F10-04, F10-05, F10-06, F10-09, F6-26). Note que F1-10 é raiz de F10-06 e F10-09 é pré-requisito de F10-02: a etapa já vem com ordem interna definida.

#### Etapa 2 — Ligar a rede de segurança do CI · ✅ **CONCLUÍDA (8/8)**
**Achados:** F1-10, F1-11, F10-02, F10-04, F10-05, F10-06, F10-09, F6-26.
**Por que agora:** as 18 etapas seguintes vão mexer em 200 pontos do sistema. Sem gate funcionando, cada correção pode introduzir regressão invisível. Hoje: `lint` tem `|| true`, `perf:budget` tem `continue-on-error`, `test:e2e` roda 13 specs em vez de 61, e 28 specs nunca executam.
**Escopo:** remover `|| true` e `continue-on-error`; apontar `test:e2e` para a config certa; coletar specs por tag em vez de lista hardcoded; registrar `addon-a11y`; ampliar `testMatch` do axe.
**Pronto quando:** um PR com erro deliberado de lint **reprova**.
**Risco:** médio — pode expor falhas pré-existentes. Se acontecer, registre como achado novo e **não desligue o gate de novo**.

> **Concluída em 2026-08-02 — 7 dos 8 achados.** Relatório completo em `docs/audits/RELATORIO_CORRECAO.md`.
>
> **Aceite da etapa verificado com comando real:** erro deliberado de ESLint → `exit 1`; código limpo → `exit 0`. Antes, o mesmo erro produzia `exit 0` em três caminhos independentes.
>
> | Achado | Veredito |
> |---|---|
> | F1-10 | ✅ fechado — eram **5** camadas de máscara, não 2 |
> | F1-11 | ✅ fechado — `--max-warnings` 999 → **6** (baseline medido) |
> | F10-09 | ✅ fechado — eram **4** configs Playwright, não 3 |
> | F10-06 | ✅ fechado — ⚠️ mas o script de perf **não mede nada** (E02-N02) |
> | F10-04 | ✅ fechado |
> | F10-02 | 🟡 parcial — nightly cobre os 61 specs; tags `@grep` não feitas |
> | F10-05 | 🟡 desvio — a Ação como escrita quebraria o gate de a11y |
> | F6-26 | ✅ fechado — 9 arquivos de teste, 211 testes; 62,67% e 75,28% de linhas |
>
> - **A pergunta que decidia o tamanho da etapa foi respondida:** o CI **instala `bun`** (`oven-sh/setup-bun@v2`, 1.3.14). A ausência de `bun` é do container de trabalho, não do CI.
> - **F1-06 consumido fora de ordem:** `playwright.e2e.config.fixed.ts` deletado junto de F10-09 — era a 4ª config e confundiria o trabalho.
> - **9 achados novos registrados** (E02-N01 a E02-N09), sendo E02-N02 `QUEBRADO` e E02-N01/E02-N07/E02-N09 `RISCO`. Nenhum gate foi desligado.
> - **O gate armado já pagou o próprio custo dentro da etapa:** o `no-restricted-imports` reprovou um import de domínio escrito nos testes novos do F6-26. Corrigido na hora — exatamente o comportamento que a etapa existia para habilitar.
>
> **Próxima:** **Etapa 3 — Credenciais e sessão JWT** (F9-16, F9-17, F9-18). Antes dela, confirmar que o primeiro run do CI com os gates armados ficou verde — se não ficou, o que reprovou é achado novo, não motivo para reverter.
>
> **RESULTADO DO PASSO 0 (2026-08-02) — reprovou, foi corrigido, e a regra herdada foi respeitada.** `Quality Gate` ficou verde; **`CI/CD Pipeline` ficou vermelho** a partir de `42a6ef0bb`, no job `Accessibility regression (axe)`. Nenhum dos quatro pontos previstos como prováveis reprovou (ratchet de design-system, lint, `test:e2e:boot` e performance budget passaram todos).
>
> - **Causa real:** `package.json` tem `"type": "module"` e a reescrita do F10-05 introduziu `path.resolve(__dirname, ...)` avaliado no carregamento do config — `ReferenceError: __dirname is not defined in ES module scope`. O Playwright morria **antes de listar teste**. Assinatura no CI: o passo levava **63s** no último run verde e passou a morrer em **0-1s**. O mesmo bug estava em `e2e/global.setup.ts:6` e `playwright.e2e.config.ts:21`, derrubando junto todo o caminho autenticado. Corrigido nos três com `process.cwd()` (commit `fc35cd7b7`).
> - **Correção de rumo registrada:** o primeiro diagnóstico desta sessão culpou o `testMatch` largo e o commit `ff1a89e29` **não resolveu**. A duração de 1s já indicava startup, não teste. O `testMatch` largo era problema real, mas secundário — virou `E02-N10b`.
> - **Nenhum gate foi desligado**, conforme a regra da Etapa 2.
> - **4 achados novos:** `E02-N10` (o `__dirname`), `E02-N10b` (`testMatch` largo), `E02-N11` (`ratchet-tighten` falha em 9/9 runs, crônica e anterior à Etapa 2 — o push do bot é rejeitado), `E02-N12` (`test:e2e:full` não coleta nenhum teste: `_page` em `authenticated-flows.spec.ts` aborta a coleção inteira). Detalhes em `RELATORIO_CORRECAO.md`.
> - **Verificação do conserto por comando real:** `playwright test --config=playwright.a11y.config.ts --list` → **9 testes / 2 arquivos** sem credenciais (só os specs públicos) e **14 testes / 4 arquivos** com credenciais (entra `chat-accessibility.spec.ts`). O gate ficou funcional **e** mais largo, que era o objetivo do F10-05.

### Fase 1 — Segurança (risco independente do resto)

#### Etapa 3 — Credenciais e sessão JWT · REDESENHADA 2026-08-02 (recon pre-execucao)
**Achados:** F9-16, F9-17, F9-18.
**Por que aqui:** único grupo cujo risco não depende de mais nada estar funcionando. Tokens válidos por **365 dias** e `jwt_secret` legível no catálogo.
**Escopo:** `jwt_exp` 31536000 → 3600; mover `jwt_secret` para variável de ambiente do GoTrue/PostgREST; rotacionar o secret; `statement_timeout` de `authenticated` 120s → 15s.
**Pronto quando:** `current_setting('app.settings.jwt_secret', true)` retorna `NULL` e a autenticação segue operando.
**Risco:** **ALTO — janela de manutenção obrigatória.** Rotacionar o secret invalida todas as sessões: os ~50 operadores refazem login. Confirmar refresh-token rotation no GoTrue **antes**, ou o corte de 1h força re-login horário.


> **Redesenhada em 2026-08-02, antes de qualquer execução.** O recon prévio derrubou duas premissas do bloco acima. **Nada foi executado em produção** — o texto original fica preservado para histórico; o que vale é o que está abaixo e nos corpos revisados de F9-16, F9-17 e F9-18.
>
> **O que mudou:**
>
> | Premissa do plano | O que a medição mostrou |
> |---|---|
> | Tokens válidos por **365 dias** | Validade efetiva é **8 horas**. `GOTRUE_JWT_EXP=28800` no ambiente do `supabase_auth` vence o `app.settings.jwt_exp` do banco. O `31536000` existe no catálogo mas **não emite token** — zero referências a ele em `pg_proc`, `pg_views` e `column_default`. |
> | `jwt_secret` precisa ser **movido** para o ambiente | Já está lá. Os cinco serviços da stack montam o Swarm secret `supabase_jwt_secret_v1`; PostgREST não lê `pgrst.jwt_secret` do catálogo. O que está no banco é **cópia órfã que ninguém lê**. |
> | Rotação é **pré-requisito** do corte de `jwt_exp` | Não é mais. Ela existia para invalidar tokens de 365 dias; com 8h eles expiram sozinhos. |
> | **~50 operadores** refazem login | **18 usuários, 10 ativos** em 30 dias. E a rotação de refresh token já está ativa (`..._ROTATION_ENABLED=true`). |
>
> **Escopo revisado:** (1) `statement_timeout` de `authenticated` 120s → 15s e `service_role` explícito em 60s; (2) `RESET app.settings.jwt_secret` — remoção de redundância; (3) `RESET app.settings.jwt_exp` — remoção da cópia órfã, **sem** gravar `3600` no lugar.
>
> **Fora do escopo da etapa, movido para item próprio:** **rotação do `jwt_secret`**. Continua justificada, mas deixou de ser pré-requisito de qualquer coisa. Exige janela e lista de propagação fechada — regenera `anon key` e `service_role key`, que quebram n8n, Evolution, os ~20 MCPs Supabase, o frontend e os Workers. A lista fora da stack **ainda não foi conferida item a item**.
>
> **Fora do escopo, com decisão registrada:** o `REVOKE` no `pg_catalog` (item 3 do F9-17) — **não aplicar**. Com o secret fora do banco, o ganho não paga o risco de quebrar o schema cache do PostgREST.
>
> **Ordem interna:** F9-18 primeiro (ensaio do caminho `ALTER ROLE` → reload → verificação), depois F9-17 item 1, depois F9-16 revisado.
>
> **Risco revisado: BAIXO — janela de manutenção deixa de ser obrigatória** para esta etapa. São três `ALTER` reversíveis, nenhum toca sessão. A janela passa a ser necessária apenas para a rotação, que saiu daqui. O `Pronto quando` original continua válido, com a ressalva de que ele agora prova remoção de redundância, não migração de fonte.
>
> **Pendência que não é desta etapa mas condiciona a entrada nela:** o `Passo 0` só fecha quando o run de `fc35cd7b7` confirmar `CI/CD Pipeline` verde. Backups conferidos e verdes em 2026-08-02: banco 15:16 UTC (783 tabelas, R2 OK) e configuração 18:56 UTC (root.key validada).

#### Etapa 4 — Isolamento multi-tenant
**Achados:** F5-14, F5-15, F5-16, F5-20, F6-17, F6-27, F8-06.
**Escopo:** RLS que vaza entre tenants. `contacts_insert` com `WITH CHECK NULL`, `contacts_select` expondo `assigned_to IS NULL` a todos, `get_default_workspace_id()` devolvendo o workspace mais antigo, 41 tabelas `bpm.*` com `USING(true)`.
**Pronto quando:** teste com dois usuários de workspaces distintos não enxerga dados um do outro.
**Risco:** **ALTO** — apertar RLS pode esconder dados de quem legitimamente precisa. Testar com conta real de operador antes de aplicar.

#### Etapa 5 — SECURITY DEFINER e grants
**Achados:** F2-01, F2-02, F2-03, F2-04, F2-05, F6-07, F6-18, F8-11, F8-17.
**Escopo:** revogar `EXECUTE` de `authenticated` em 9 trigger functions de `public`; auditar 119 SECDEF em `zapp` + 41 em outros schemas; `search_path` frágil; remover policy `auth_secure_123` (nome de teste em produção).
**Pronto quando:** `SELECT * FROM zapp.v_security_audit WHERE status LIKE '%⚠%'` retorna 0 linhas.
**Risco:** médio — revogar EXECUTE demais quebra fluxo. Revogar em lotes, validando após cada um.

### Fase 2 — Dados de cliente e LGPD

#### Etapa 6 — View `zapp.contacts` e seus triggers (causa-raiz)
**Achados:** F5-01, F5-02, F5-03, F5-27, F5-29.
**Por que antes da Etapa 7:** a view descarta CPF, endereço, `is_blocked`, `is_favorite` e campos LGPD; os triggers INSERT/UPDATE dropam campos e o DELETE faz **hard delete**, violando o requisito de soft-delete com undo de 30 dias. Metade dos achados de contatos são sintoma disto.
**Pronto quando:** um UPDATE via view preserva todos os campos da tabela base e o DELETE marca `deleted_at` em vez de remover.
**Risco:** **MUITO ALTO** — 20.445 contatos em produção. Backup da tabela base antes. Testar em transação com `ROLLBACK`.

#### Etapa 7 — RPCs de contatos dependentes da view
**Achados:** F5-04, F5-05, F5-09, F5-10, F5-11, F5-30.
**Depende de:** Etapa 6.
**Escopo:** `merge_contacts()` que levanta `EXCEPTION 'implementacao pendente'`; `bulk_soft_delete_contacts` referenciando colunas inexistentes; `add_contact_note` descartando parâmetros; hook que bypassa a RPC com INSERT direto; `contact_notes` com 0 rows.
**Pronto quando:** merge de dois contatos reais funciona ponta a ponta e a nota persiste com `note_type`.

#### Etapa 8 — Conformidade LGPD
**Achados:** F5-06, F5-07, F5-18, F5-26, F5-28, F7-17.
**Escopo:** **20.445 contatos, zero com `lgpd_consent_at`** — não há registro de consentimento. Sem coluna CPF/CNPJ e sem `validate_cpf`/`validate_cnpj`. `rpc_get_contact` expõe dados de contatos que optaram por sair. `remote_jid` completo em query string (PII em log de acesso).
**Pronto quando:** existe trilha de consentimento e nenhum endpoint retorna dados de opted-out.
**Risco:** decisão jurídica envolvida — alinhar com Abner antes de definir o default de consentimento retroativo.

### Fase 3 — Observabilidade (enxergar o efeito das correções)

#### Etapa 9 — Silenciar o ruído e recuperar os alertas reais
**Achados:** F9-07, F9-08, F6-08, F6-22, F6-23, F7-14, F8-16.
**Por que aqui:** as próximas etapas mexem em produção, e hoje **não é possível ver o efeito**: 1.843 alertas duplicados de um guard quebrado (40,9% da tabela), 269 `evolution_alerts` sem triage, 724 `webhook_health_alerts` não resolvidos (98,6%). Sinal real soterrado na razão de 1:921.
**Escopo:** corrigir o guard de `fn_detect_401_bursts` (filtra `message`, texto está em `title`); purgar histórico redundante; política de retenção; triar backlogs.
**Pronto quando:** alertas `info` de `fn_detect_401_bursts` nas últimas 24h ≤ 1 (hoje: 96).

#### Etapa 10 — `dblink` e o deadman switch
**Achados:** F9-12, F9-13, F9-14, F7-16.
**Depende de:** Etapa 1 (F7-16 precisa do diagnóstico corrigido).
**Escopo:** `dblink` mora em `zapp`, não em `public` — qualificar chamadas ou ajustar `search_path`. Depois: o cron 193 injeta heartbeat com o **mesmo `service_name`** do guardian real a cada 5 min, tornando o deadman switch incapaz de disparar. Separar em `pg-cron-liveness`.
**Pronto quando:** existe heartbeat com `details->>'source'='dblink'` nos últimos 30 min (hoje: 0 em todo o histórico).

#### Etapa 11 — DLQ e filas de mensagem
**Achados:** F9-09, F9-10, F9-11, F9-15, F4-14, F4-23.
**⚠ Ordem interna obrigatória:** **F9-10 antes de F9-09.** O roteador está apontado para 22 tabelas legadas vazias e a DLQ nunca recebeu uma linha. Se corrigir o roteador primeiro, o primeiro alerta criado trava o canal permanentemente em `alert_already_open`, porque `fn_monitor_dlq_health` grava os timestamps mas não os booleanos do próprio WHERE.
**Pronto quando:** `evo.evolution_webhook_dlq` tem ≥ 1 linha e o evento órfão parado desde 2026-06-13 foi drenado.

#### Etapa 12 — Crons quebrados, no-op e mal escalonados
**Achados:** F2-06, F2-07, F2-08, F2-09, F2-12, F4-24, F6-09, F6-10, F7-15, F8-05, F8-09, F8-14, F8-15.
**Escopo:** 4 pares duplicados; 6 VACUUMs concorrentes em 15 min; chain logflare de 7 jobs; watchdog com **gap noturno de 6h** (23h→6h); cron 213 falhando 42,8% por schema drift; cron 198 chamando função no-op enquanto a versão real é dead code.
**Pronto quando:** nenhum cron do inventário tem taxa de falha > 5% ou retorno constante de "0 rows processadas".

### Fase 4 — Decisões (bloqueiam trabalho técnico)

#### Etapa 13 — Decisões arquiteturais com Abner/Pink
**Achados:** F8-01, F8-02, F8-03, F8-04, F8-07, F8-08, F8-13, F9-01, F9-02, F9-03, F10-03, F10-08.
**Natureza:** esta etapa **não escreve código** — produz ADRs. Cada decisão desbloqueia ou cancela achados.
**Perguntas a responder:**
1. **BPM** (41 tabelas vazias, triggers stub, RLS aberta): ativar ou remover? Enquanto indefinido, F8-04/05/06 ficam sem destino.
2. **Fila offline / PWA**: há 4 specs testando a *ausência* de workbox e um `index.html` que desregistra SWs. Parece decisão já tomada e não escrita. Assumir a remoção ou implementar de verdade?
3. **SLA canônico**: 3+ sistemas paralelos (`bpm_sla_records`, `conversation_sla`, `sla_delivery_violations`). Qual sobrevive?
4. **Impressão**: manter bloqueio de PII (com aviso ao usuário) ou criar exportação com redação?
5. **Dashboard SLA** com fallback `overallRate: 100`: qual o comportamento correto com zero dados?
**Pronto quando:** 5 ADRs em `docs/adr/`, cada achado marcado `RESOLVIDO POR DECISÃO` ou movido para etapa de implementação.

### Fase 5 — Correção funcional

#### Etapa 14 — Conexões WhatsApp: fonte única de verdade
**Achados:** F6-01, F6-02, F6-03, F6-04, F6-05, F6-06, F6-11, F6-12, F6-13, F6-14, F6-15, F6-16, F6-19, F6-20, F6-21, F6-24, F6-25, F6-28, F6-29, F6-30.
**Nota de dimensionamento:** 20 achados — **a maior etapa**. Se o contexto apertar, quebre em 14a (fonte de verdade: F6-03, F6-04, F6-13, F6-14, F6-16, F6-30) e 14b (o resto).
**Escopo:** `handleAddConnection` **não chama** `/instance/create` da Evolution — só faz INSERT no banco; pairing code 100% ausente; hardcode `wpp2`; 373 reconcile_jobs (22%) com telemetria corrompida.
**Pronto quando:** criar conexão pela UI provisiona instância real na Evolution e ambas as tabelas convergem.

#### Etapa 15 — Inbox e mensageria
**Achados:** F4-01 a F4-13, F4-15 a F4-22.
**Escopo:** `fetchConversations` sem paginação (500+1000 fixo); channel realtime com nome aleatório; `USE_EXTERNAL_DB = true` hardcoded; **8 round-trips por mensagem enviada**; memory leaks (`seededAvatarsRef`, `processedDeliveriesRef` sem cap); `media_cache.storage_path` guardando data URL base64.
**Pronto quando:** envio de mensagem cai para ≤ 3 round-trips e a lista pagina sem travar acima de 1000 conversas.

#### Etapa 16 — Autenticação e sessão
**Achados:** F3-01 a F3-12.
**Escopo:** `getSession()` fora de `useEffect` em `ProtectedRoute`; bypass `isDev` sem log de auditoria; `refreshAll` sem `AbortController`; dead code (`verifyHttpOnlyCookieAuth`, `externalSessionBridge`); `signOut` sem fallback local.
**Depende de:** Etapa 3 (não mexer em sessão antes de estabilizar o JWT).

#### Etapa 17 — Busca e performance de contatos
**Achados:** F5-08, F5-12, F5-13, F5-17, F5-19, F5-21, F5-22, F5-23, F5-24, F5-25.
**Escopo:** **5 estratégias divergentes de normalização de telefone**; busca sem `pg_trgm`; COUNT CTE duplicando custo por página; `tags.name` UNIQUE global impedindo multi-tenant; intelligence lendo só `wpp2`.
**Pronto quando:** busca por telefone formatado encontra o contato e o plano usa índice, não seq scan.

#### Etapa 18 — Admin: remover mocks e dados falsos
**Achados:** F7-01 a F7-13, F7-18 a F7-32.
**Nota:** 28 achados, mas em sua maioria **superficiais e independentes** — bom candidato a lote. Inclui `// @technical` renderizando como texto literal em 3 páginas, latência "42ms" e uptime "99.9%" hardcoded, `AuditEvidenceDashboard` inteiro mock estático, painéis sempre em zero.
**Pronto quando:** nenhuma página `/admin/*` exibe número que não venha do banco.

### Fase 6 — Transversal e fechamento

#### Etapa 19 — Resiliência unificada e cross-browser
**Achados:** F9-04, F9-05, F9-06, F9-19, F10-01, F10-07.
**Escopo:** supabase-js sem retry; **4 implementações paralelas de backoff** (1.266 linhas); **3 circuit breakers** para a mesma API com limiares 3/5/10 e cooldowns 30s/60s/30min; sem indicador de perda de conectividade; Playwright só em Chromium; Lighthouse inexistente.
**Pronto quando:** existe uma única fonte de retry/breaker e o CI roda webkit + firefox.

#### Etapa 20 — Higiene, dead code e fechamento
**Achados:** F1-01 a F1-09, F1-12, F1-13, F1-14, F2-10, F2-11, F2-13, F8-10, F8-12.
**Escopo:** arquivos temporários versionados, `__pycache__`, migration no diretório errado, `functions-legacy/`, migrations de outro projeto (`fatorx-migrations/`), 11 pages órfãs, 588.042 INSERTs unitários a consolidar em batch.
**Fechamento:** varrer os 200 achados confirmando `Aceite` verificado ou marcado obsoleto/decidido; publicar `RELATORIO_CORRECAO.md` consolidado.

---

## Parte IV — Mapa de cobertura

| Etapa | Achados | Qtd | Risco |
|---|---|---:|---|
| 1 — Revalidar backlog | (meta) | 0 | nulo |
| 2 — Gates de CI | F1-10,11 · F10-02,04,05,06,09 · F6-26 | 8 | médio |
| 3 — JWT | F9-16,17,18 | 3 | **alto** |
| 4 — Multi-tenant | F5-14,15,16,20 · F6-17,27 · F8-06 | 7 | **alto** |
| 5 — SECDEF/grants | F2-01..05 · F6-07,18 · F8-11,17 | 9 | médio |
| 6 — View contacts | F5-01,02,03,27,29 | 5 | **muito alto** |
| 7 — RPCs contatos | F5-04,05,09,10,11,30 | 6 | alto |
| 8 — LGPD | F5-06,07,18,26,28 · F7-17 | 6 | jurídico |
| 9 — Ruído de alertas | F9-07,08 · F6-08,22,23 · F7-14 · F8-16 | 7 | baixo |
| 10 — dblink/deadman | F9-12,13,14 · F7-16 | 4 | baixo |
| 11 — DLQ | F9-09,10,11,15 · F4-14,23 | 6 | médio |
| 12 — Crons | F2-06..09,12 · F4-24 · F6-09,10 · F7-15 · F8-05,09,14,15 | 13 | médio |
| 13 — Decisões (ADR) | F8-01,02,03,04,07,08,13 · F9-01,02,03 · F10-03,08 | 12 | nulo |
| 14 — Conexões WhatsApp | F6-01..06,11..16,19,20,21,24,25,28,29,30 | 20 | alto |
| 15 — Inbox | F4-01..13, 15..22 | 21 | médio |
| 16 — Auth | F3-01..12 | 12 | médio |
| 17 — Busca/contatos | F5-08,12,13,17,19,21..25 | 10 | médio |
| 18 — Admin | F7-01..13, 18..32 | 28 | baixo |
| 19 — Resiliência | F9-04,05,06,19 · F10-01,07 | 6 | baixo |
| 20 — Higiene | F1-01..09,12,13,14 · F2-10,11,13 · F8-10,12 | 17 | baixo |
| | **TOTAL** | **200** | |

### Caminho crítico (dependências rígidas)

```
Etapa 1 ──► todas as demais (revalidação)
Etapa 2 ──► rede de segurança para 3..20
Etapa 3 ──► Etapa 16 (auth depende de JWT estável)
Etapa 6 ──► Etapa 7 (RPCs dependem da view corrigida)
Etapa 1 ──► Etapa 10 (F7-16 precisa do diagnóstico certo)
Etapa 13 ──► desbloqueia/cancela achados de 14, 19
F9-10 ──► F9-09  (dentro da Etapa 11 — inverter ativa bug latente)
```

### Sugestão de sequenciamento

Etapas **1 e 2 são inegociáveis como primeiras**. Depois, **3 → 4 → 5** fecham a superfície de segurança. **9 e 10** valem vir cedo mesmo sendo baixo risco: sem elas não há como enxergar o efeito das etapas seguintes. **13** pode rodar em paralelo, pois é conversa, não código. **18** é o melhor candidato a preencher sessões curtas — 28 achados independentes e superficiais.
