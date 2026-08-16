# Simulação de falhas — Onda de 10 agentes para fechar o inventário de estado

**Data:** 2026-08-16 · **Orquestrador:** Claude (claude.ai/code) · **Branch:** `claude/validar-levantamento-sistema-uxonxc`
**Objetivo da onda:** fechar as lacunas do inventário `docs/estado/` (Fase 1D residual + 1E + Fases 2/3), corrigir
defasagem de topologia e reconciliar os inventários paralelos que existem hoje no repo.

> Esta simulação é executada **antes** do disparo dos agentes, conforme convenção de `docs/simulation/`
> e a regra do `HERMES.md` de não iniciar onda sem ler o estado da anterior.

---

## 1. Diagnóstico de partida (medido, não presumido)

### 1.1 Cobertura real do inventário existente

Medição por cruzamento dos nomes de arquivo citados em `docs/estado/*.md` contra a árvore do repo:

| Diretório | Arquivos | Auditados | Cobertura |
|---|---|---|---|
| `src/pages` | 148 | 146 | 100% |
| `src/features` | 661 | 603 | 99% |
| `src/components` | 591 | 581 | 100% |
| `src/shared` | 6 | 6 | 100% |
| `src/hooks` | 391 | 389 | 100% |
| `src/integrations` | 39 | 30 | 81% |
| `src/adapters` | 6 | 3 | 50% |
| `src/services` | 46 | 3 | 7%¹ |
| `src/lib` | 208 | 11 | 5%¹ |
| `src/utils` | 20 | 0 | 0% |
| `src/types` | 9 | 1 | 11%¹ |

¹ Ocorrências incidentais (arquivo citado como dependência de outro), não auditoria. Valor efetivo ≈ 0.

**Backend/infra: zero.** 109 edge functions, 325 migrations, 45 workflows, 110 scripts sem nenhuma saída de inventário.

### 1.2 O achado estrutural — quatro inventários paralelos e mutuamente cegos

| Artefato | Autor/onda | Data | Eixo | Estado |
|---|---|---|---|---|
| `FEATURE_REGISTRY.md` | 3 agentes de inventário | 2026-08-06 | **Funcional** — 131 features Full/Partial/Suggested | 10 dias |
| `docs/audit-2026-08-06/` | auditoria container×Supabase | 2026-08-06 | Reconciliação, 40 checks | 10 dias |
| `ESTADO.md` | agente ESTADO | 2026-08-08/15 | **Operacional** — 107 EFs por chamador | corrente |
| `docs/estado/` | trilha inventário | 2026-08-09 | **Estático** — 1.758 arquivos | 7 dias, abandonado em 1D |
| `docs/decouple/` | lanes de desacoplamento | 2026-08-12→16 | Fronteira evo×zapp | corrente |

Nenhum referencia o outro sistematicamente. **A pergunta original do dono — "o que o sistema deveria ter × o que
foi implementado" — já está respondida em `FEATURE_REGISTRY.md`**, não na trilha `docs/estado/`. A trilha estática
responde outra pergunta ("que arquivos existem e quem os importa").

**Consequência de método:** o valor marginal de auditar arquivo-a-arquivo os 208 utilitários de `src/lib` é baixo;
o valor marginal de reconciliar os quatro inventários numa verdade única e corrente é alto. A onda é dimensionada
por esse critério, não por completude cega do plano original.

### 1.3 Defasagem já confirmada

- **11 documentos** de `docs/estado/` citam `evo.evolution_messages` / `_contacts` / `_conversations`
  (30 ocorrências). Topologia migrada para `zapp.*` em 2026-08-15 — as referências estão erradas hoje.
- **O próprio `CLAUDE.md` está defasado contra produção** (medido ao vivo nesta sessão via MCP):

| Schema | CLAUDE.md | Produção (16/08) | Δ |
|---|---|---|---|
| `zapp` | 323 tabelas | **386** | +63 |
| `evo` | 136 tabelas | **70** | −66 |
| `ops` | 20 tabelas | **51** | +31 |
| `archive` | 25 tabelas | **36** | +11 |

Isso não é ruído: o movimento evo→zapp (ADR-I4, executado 16/08) explica o sinal, e qualquer agente que leia
`CLAUDE.md` como verdade vai documentar topologia errada. **Mitigação obrigatória: briefing de topologia
idêntico e explícito nos 10 prompts, sobrepondo o CLAUDE.md.**

---

## 2. Cenários de falha previstos

Severidade: 🔴 crítico (corrompe trabalho alheio ou produção) · 🟠 alto (invalida a entrega) · 🟡 médio (retrabalho)

### 🔴 S1 — Agente escreve em produção

**Precedente real neste projeto.** `docs/decouple/AGENTES_LANES.md`, nota de 2026-08-16: duas sessões criaram
os mesmos objetos `ops.*`; o apply parou na linha 66 e deixou resíduo (overload quebrado de
`ops.log_pgnet_call`, policies duplicadas). Lição já registrada pelo agente: *"re-verificar estado do banco
imediatamente antes de qualquer apply, sempre."*

**Mitigação:** nenhum agente desta onda recebe tarefa de escrita. Instrução literal nos 10 prompts:
*somente SELECT / introspecção; zero DDL, zero DML, zero migration.* O único agente com acesso ao banco (E7)
tem escopo explicitamente read-only. Nenhum `apply_migration` é chamado por ninguém.

### 🔴 S2 — Agente sobrescreve documento de outro agente

Zonas produzidas por outras trilhas e **congeladas** para esta onda: `ESTADO.md`, `FEATURE_REGISTRY.md`,
`docs/decouple/**`, `.hermes/**`, `docs/audit-2026-08-06/**`, `supabase/migrations/**`, `src/**`, `main`.

**Mitigação:** allowlist de escrita por agente. Cada um dos 10 tem **um único arquivo de saída, pré-alocado e
exclusivo** — colisão impossível por construção. Divergências que um agente encontre em zona congelada viram
*linha de relatório*, nunca edição.

### 🟠 S3 — Autocompact thrashing mata o batch

**Limite medido pela trilha anterior:** batch de 18.620 linhas morreu com *"Autocompact is thrashing"*;
teto seguro ≈ **13.000 linhas**. Contagem de arquivos importa menos que volume.

**Mitigação:** fatiamento por linhas medidas (§3), não por contagem de arquivos. Escopos acima do teto
(`src/lib/__tests__` 18,5k; edge functions 54k; migrations 51k; scripts 81k) recebem **altitude de análise
mais alta** — inventário por módulo/função com evidência, não leitura linha a linha — e delegação interna.

### 🟠 S4 — Inventário internamente contraditório

Agentes novos documentam `zapp.evolution_messages`; os 11 docs antigos dizem `evo.*`. Entrega fica
auto-contraditória e perde credibilidade.

**Mitigação:** E9 dedicado a errata de topologia + briefing idêntico nos 10 prompts. Correções registradas
uma a uma (aditivo e rastreável, não reescrita silenciosa do trabalho alheio).

### 🟠 S5 — Duplicação do que já existe

E6 (edge functions) pode produzir um inventário que contradiz `ESTADO.md`, que é mais recente e foi medido
com critério explícito de chamador ("menção em teste/doc não conta").

**Mitigação:** E6 recebe `ESTADO.md` como **fonte a reconciliar, não a recriar**. Entrega = delta por função
(o que o ESTADO.md não cobre: status de implementação, tabelas tocadas, secrets, divergências), preservando
a classificação A–F existente.

### 🟠 S6 — Falso "concluído"

Agente relata `N/N` sem ter lido. A trilha anterior já convive com isso: `_HANDOFF.md` afirma "8H RODANDO"
para um arquivo que nunca existiu.

**Mitigação:** cabeçalho obrigatório `Arquivos lidos: N/N` + **verificação independente do orquestrador**:
recontagem por basename de cada saída contra a árvore real (o mesmo método que expôs a lacuna original).
Agente que não bater é relançado.

### 🟡 S7 — Agente morre em silêncio

**Mitigação:** ao fim da onda, conferir existência + tamanho de cada uma das 10 saídas; relançar as ausentes.

### 🟡 S8 — Ausência de toolchain

Não há `node_modules` no working tree. `tsc`, `vitest` e `eslint` **não rodam**.

**Mitigação:** análise estática via `rg`/`grep` apenas. Nenhuma saída pode afirmar "compila" ou "testes
passam". Declarado como limitação na entrega. Não instalar dependências: `bun install` neste sandbox é risco
de tempo sem retorno para o objetivo documental.

### 🟡 S9 — Clone raso quebra operações de git

`git rev-parse --is-shallow-repository` = **true**; `main` truncada em 74 commits e `merge-base` com
`docs/estado-inventario` retorna vazio. Um `git merge` entre as duas exigiria `--allow-unrelated-histories`
e produziria um resultado sujo.

**Mitigação:** nada de merge. Os 34 documentos foram trazidos por `git checkout origin/docs/estado-inventario --
docs/estado` sobre a base corrente de `main` — aditivo, e a branch de origem permanece intacta no remoto.

### 🟡 S10 — Estouro de contexto do orquestrador

10 agentes × relatório longo satura minha própria janela e degrada a consolidação (Fase 8).

**Mitigação:** cada agente **escreve no arquivo** e devolve resumo ≤ 25 linhas. Eu componho a partir dos
arquivos, não dos relatórios.

### 🟡 S11 — Runtime continua `NAO_VERIFICADO`

Todas as 30 saídas atuais carregam `Runtime: NAO_VERIFICADO`. Pelo critério do próprio projeto
(*"pronto = ligado em produção com tráfego real"*), um inventário 100% estático não atinge 10/10 —
falha justamente no eixo que o `CLAUDE.md` define como decisivo.

**Mitigação:** E7 valida ao vivo (read-only) contra o self-hosted: existência de RPCs/triggers/views, cron
jobs ativos, últimas execuções. MCP testado e respondendo antes do disparo.

### 🟡 S12 — Branch protection

`main` exige PR + 11 checks + 1 review. Não é caminho desta onda.

**Mitigação:** trabalho em `claude/validar-levantamento-sistema-uxonxc`, entrega por PR draft.

---

## 3. Desenho da onda — 10 lanes sem sobreposição

| Agente | Escopo | Volume | Saída exclusiva |
|---|---|---|---|
| **E1** | 1D residual (batch 8H): `src/adapters` restantes + `src/integrations/__tests__` | 10 arq | `31-adapters-e-integrations-tests.md` |
| **E2** | 1E-a: `src/services` | 46 arq / 5,4k | `32-services.md` |
| **E3** | 1E-b: `src/lib` raiz | 87 arq / 14,4k | `33-lib-raiz.md` |
| **E4** | 1E-c: `src/lib` subdirs + `src/utils` + `src/types` | 121 arq / 11,4k | `34-lib-subdirs-utils-types.md` |
| **E5** | 1E-d: `src/lib/__tests__` (altitude de suíte) | 18,5k | `35-lib-tests.md` |
| **E6** | Fase 2A: 109 edge functions, reconciliando `ESTADO.md` | 257 arq / 54k | `36-backend-edge-functions.md` |
| **E7** | Fase 2B/2C + **Fase 4 (runtime read-only)**: schema, RPCs, triggers, views, RLS, cron | 325 mig / 51k | `37-backend-db-runtime.md` |
| **E8** | Fase 3: `.github/workflows` + `scripts/` + infra | 155 arq | `38-infra-ci-scripts.md` |
| **E9** | Errata de topologia nos 30 docs existentes | 30 docs | `_ERRATA-TOPOLOGIA.md` |
| **E10** | Fase 5: reconciliação cruzada dos 4 inventários | 4 acervos | `_RECONCILIACAO-INVENTARIOS.md` |

Consolidação (Fase 8) e atualização de rastreadores ficam com o orquestrador, após verificação das 10 saídas.

---

## 4. Invariantes da onda (violação = abortar)

1. Zero escrita no banco de produção. Somente `SELECT`/introspecção.
2. Zero escrita fora de `docs/estado/` e `docs/simulation/`.
3. Zero alteração em `ESTADO.md`, `FEATURE_REGISTRY.md`, `docs/decouple/`, `.hermes/`, `src/`, `supabase/`.
   *Exceção única e explícita:* a linha de declaração de lane em `docs/decouple/AGENTES_LANES.md`, que o
   próprio protocolo do projeto exige que cada agente acrescente antes de agir — inserção aditiva, feita
   pelo orquestrador, nunca pelos 10 agentes.
4. Um arquivo de saída por agente, exclusivo.
5. Toda afirmação com evidência (caminho:linha, objeto de banco, jobid). Sem inferência apresentada como fato.
6. Runtime só é declarado `VERIFICADO` com prova ao vivo; na dúvida, `NAO_VERIFICADO`.
7. Nenhuma saída afirma resultado de build/teste — a toolchain não roda aqui.

---

## 5. Gaps que esta onda NÃO fecha (declarados, não escondidos)

- **Fases 6 e 7** (grafo de dependências e veredito por componente) exigem as saídas desta onda como insumo —
  ficam para a onda seguinte, com ponteiro no `_PROGRESSO.md`.
- **Runtime de superfícies não-banco** (Swarm/Portainer, N8N, Cloudflare, Vercel) fica fora: E7 cobre o
  Postgres, que é onde está a maior densidade de risco. Declarado como pendência.
- **Classificação dos ~122 órfãos** de 1C só-tagueados permanece backlog delegado, como já registrado.
- **Auditoria linha a linha** de `scripts/` (81k) e `migrations/` (51k) não acontece — a altitude é por
  módulo/objeto. Auditoria exaustiva desses dois exigiria onda dedicada e tem valor marginal baixo.
