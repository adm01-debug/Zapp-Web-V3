# Validação adversarial da auditoria de estado — consolidado

> **Data:** 2026-08-16 · **Método:** 6 agentes validadores com postura de **refutar**, não confirmar,
> mais reverificação direta do orquestrador contra código e banco de produção (somente leitura).
>
> Objetivo: descobrir onde a auditoria mergeada no PR #1108 está **errada**. Um validador que
> confirma tudo não serviu para nada.

---

## 1. Placar

| Fonte | Confirmado | Superdimensionado | Refutado | Não verificável |
|---|---|---|---|---|
| V1 — `src/lib` raiz | 8 | 6 | 0 | 0 |
| V2 — `src/lib` subdirs, utils, types | 9 | 2 | 1 | 0 |
| V3 — testes (`35` + `39`) | 15 | 4 | 0 | 1 |
| V4 — e2e e harness | 6 | 0 | 0 | 0 |
| V5 — edge functions | 4 | 2 | **2** | 0 |
| V6 — infra, CI, scripts | 5 | 2 | 1 | 1 |
| Orquestrador (direto) | 9 | 1 | **2** | 0 |
| **Total** | **56** | **17** | **5** | **2** |

**Nenhum documento caiu por inteiro.** A auditoria resistiu no essencial: 56 de 80 alegações
testadas se sustentam integralmente. O que apareceu foi **severidade inflada** (17 casos) e **cinco
erros factuais** — **três deles do próprio orquestrador**, no documento executivo.

Os cinco refutados estão em §2 (três) e §8 (dois, trazidos pelo V5 — os mais graves da rodada).

---

## 2. Os três primeiros achados refutados
> Os outros dois — `login-attempts` e a exclusividade da violação de gateway — estão em §8.

### 2.1 🔴 "Subsistema de filas dormente" — FALSO (erro do orquestrador)

`estado_atualizado.md` §4 e `_RECONCILIACAO` §D4 afirmavam *"SLA/filas Full e comprovadamente
dormente — 0 de 20.743 contatos atribuídos"*. **A parte de filas é falsa.**

| objeto | afirmado | real (`count(*)` exato) |
|---|---|---|
| `zapp.queues` | 0 | **1** (Atendimento Geral) |
| `zapp.queue_members` | 0 | **14** |
| contatos com `assigned_to` | 0 / 20.743 | **21.934 / 21.945** |
| cron `queue-autoassign-tick` (jobid 335) | — | **ativo, `* * * * *`** |

Distribuição uniforme (~1.870 por agente) prova roteador operando. `queue_positions` = 0 porque
tudo foi atribuído. **SLA e CSAT seguem genuinamente dormentes** (10 tabelas com contagem exata zero,
e nenhum cron de CSAT em produção).

**Duas causas, ambas do orquestrador:**
1. `pg_stat_user_tables.n_live_tup` é *estimativa* e retornou 0 para tabelas com linhas reais.
2. O "0/20.743" veio de um handoff de 2026-08-09, anterior à ativação do subsistema, e foi
   repassado sem remedir.

### 2.2 `exportReport` — risco inventado (V2, achado A10 do doc 34)

O achado alegava 3 importadores de produção recebendo exceção garantida. Os três importam
**apenas o tipo `ReportData`**. `exportToPDF`/`exportToExcel` não aparecem em código de produção —
só em 2 testes — e `ExportButton.tsx:29` sequer chama: dispara um toast.

### 2.3 Contagem de workflows (V6, doc 38)

São **45 `.yml` + 1 `.md` = 46 arquivos** (5.312 linhas), não 44+1. O ausente do inventário é
`score-ratchet.yml` (71 linhas, advisory) — que reimplementa inline a lógica do `score-ratchet.mjs`
que o mesmo documento marca como script órfão. Também ficaram fora `extract_cron_schedules.py` e
`sql/media-bucket-verification.sql`.

---

## 3. Rebaixamentos relevantes

| Achado | Era | Vira | Razão |
|---|---|---|---|
| `webhookStatusPriority` teste-espelho (doc 35, A1) | 🔴 | 🟡 | A regra **não está desprotegida**: `evolution-helpers-wiring.test.ts` (802 l) importa o `shouldUpdateStatus` real e cobre as 3 regras divergentes (`:225`, `:226`, `:254`), e é coletado. O espelho é lixo obsoleto — apagar, não consertar. *(São 3 divergências, não 2.)* |
| `security-invoker-gate` trava PR (doc 38, A2) | 🔴 | 🟠 | Os fatos procedem (tem `paths:`, consta do `EXPECTED_CONTEXTS`, sem `if: always()`), mas `infra/github/branch-protection-main.md` registra a proteção como `enforcement_level:"off"`, `contexts:[]`. Risco condicional, não ativo. |
| `whatsappInstances` contraditório (doc 34, A2) | 🟠 | 🟡 | Fato confirmado por 4 fontes independentes, mas impacto de runtime zero: os 25 consumidores usam as constantes corretas, e há teste que quebra o CI se alguém "corrigir" na direção errada. |
| `SELECTABLE_WHATSAPP_INSTANCES` (doc 34, A3) | 🟠 | 🟢 | O único consumidor é um filtro de página admin com default "Todas" — não alimenta a sidebar da Inbox, logo não reproduz o incidente citado. |
| `healthCheck.ts` stub (doc 33, A2) | 🟠 | 🟢 | Zero consumidores vivos, `@deprecated`, substituto nomeado. Alto sem caminho de execução. |
| `env.ts` órfão (doc 33, A1) | 🟠 | 🟡 | O literal hardcoded também está em `client.ts:24`, `whatsappAdapter.ts:495`, `connectivityMonitor.ts:113`, `useConnections.ts:85`. Ligar `env.ts` em `mediaUrl.ts` não entrega o benefício prometido. |

---

## 4. Achados NOVOS que a auditoria não viu

### 4.1 🔴 ADR-005 quebrada em produção — fila offline não funciona (V1)

Verificado diretamente:
- `src/lib/offlineQueue.ts:137` registra a tag **`send-queued-messages`**
- `public/sw.js:149` escuta a tag **`send-messages`** — **não batem**
- e o handler `sendQueuedMessages()` (`sw.js:152`) é **um `console.log` vazio**

Duas metades incompatíveis, e a quebrada é a servida em produção. Não é "feature não ligada": é
feature que aparenta existir e não faz nada. Mensagem enfileirada offline nunca é enviada.

### 4.2 🟠 Asserção tautológica é literal, não hipotética (V4)

`VITE_SUPABASE_PUBLISHABLE_KEY` **é** definida em 8 arquivos — a alegação mais forte de um agente
anterior ("não é definida em lugar nenhum") está refutada. O problema real é mais sutil:
`quality-gate.yml` **não** a define e roda a mesma suíte vitest que o `ci.yml` (que define). Logo
`TextToAudioButton.auth.test.tsx:16,50,59` — a guarda de regressão da issue #1000, sobre token de
sessão × anon key numa edge function paga — **muda de força entre dois workflows no mesmo commit**.

### 4.3 🟡 `PUBLIC_BUCKETS` já divergiu (V1)

A duplicação apontada em `mediaUrl.ts:202` × `useMediaUrl.ts:41` **não é mais teórica**:
`recibos-entrega` existe só numa das duas cópias.

---

## 5. Precisão das citações — a fraqueza sistemática

O padrão mais frequente não é achado falso: é **citação `arquivo:linha` deslocada**.

- V4 catalogou **13 citações erradas** no doc 40 (ex.: conflito de porta é `playwright.config.ts:15`
  e `:21`, não `:19` e `:24` — a substância procede, o ponteiro não)
- V6: `A5` cita `:157`/`:82-88`, reais `:152`/`:75-84`
- V3: doc 35/A3 diz 934 linhas de espelho, são 925; headline do doc 39 diz 4.767, são 4.984
- V1: A6 diz 1.936 linhas, são 2.274; A14 diz "~15 testes", são 78
- V2: `utils` tem 994 linhas, não 1.043 (a própria tabela do documento soma 994)

**Consequência prática:** os achados são confiáveis como diagnóstico, mas **quem for corrigir deve
localizar pelo símbolo, não pela linha citada**.

Erro de classificação correlato (V1, V2): arquivos com importador **apenas de teste** foram contados
como órfãos em alguns docs — pela legenda dos próprios documentos, seriam `EM_USO (teste)`. No doc 33
isso muda 12 órfãos para **7 órfãos estritos**.

---

## 6. O que resistiu integralmente

- **Cobertura de `src/` em 100%** — e substantiva: amostra de 40 arquivos, 40 com linha de tabela ou
  seção dedicada. Nenhuma menção solta contada como auditoria.
- **9 de 9 "testes-espelho"** — nenhum importa o SUT, nem indireto, nem via `vi.mock`, nem helper.
  A alegação mais repetida da auditoria é sólida.
- **0 de 8 "scripts órfãos" têm chamador** — alegação de ausência sobreviveu a busca ampla
  (workflows, `package.json`, husky, Dockerfile, docs, runbooks).
- **Zero SUT ausente** — resistiu a teste mais duro: 108 pares incluindo `vi.mock` e `import()`
  dinâmico, mais checagem simbólica em 71 símbolos.
- **Conformidade Realtime em `src/lib`** — reteste com 10 padrões alternativos: zero violações.
- **441 linhas em `Deno.test` sem runner** — confirmado em todos os componentes.
- **`A6` do doc 38** — `check-column-map.mjs` e `phys-refs-gate.mjs` são anunciados como bloqueio de
  PR ativo e nenhum CI os executa. Cruzado com os 39 caminhos invocados pelos workflows e os 55
  entries do `package.json`.
- **Números de runtime do doc 37** — RLS 386/386, drift de migrations, 222 cron jobs.
- **`login-attempts`** — listada como arquivável, chamada em `loginAttempts.ts:88` via `invoke<T>()`.
- **`FEATURE_REGISTRY`** — 110 Full em 180 features; o sumário do próprio documento erra por 2,4×.

---

## 7. Lição de método

A auditoria original **acertou o diagnóstico e errou a calibragem**. Três padrões, nesta ordem de
frequência:

1. **Severidade inflada** (14 casos) — quase sempre por não perguntar *"isto tem caminho de execução
   em produção?"*. Um `@deprecated` sem consumidor não é risco alto.
2. **Citação deslocada** (20+ casos) — substância certa, ponteiro errado.
3. **Erro factual** (3 casos) — dois por contexto faltante, um por **número herdado de documento
   antigo sem remedir**. Este último é o mais perigoso: o dado não é inventado, é **vencido**.

O caso das filas merece registro permanente: um número que **era verdade** quando escrito virou
falso ao ser copiado uma semana depois, e passou por 12 agentes e um orquestrador sem ser
questionado — porque tinha fonte confiável.

---

## 8. Adendo — V5 (edge functions): as duas refutações mais graves

O validador de edge functions chegou por último e trouxe o resultado mais consequente da rodada.
Ambos os pontos abaixo foram **reverificados diretamente pelo orquestrador**.

### 8.1 REFUTADO — "arquivar `login-attempts` quebraria a autenticação"

**Falso. É fail-open.** `src/lib/loginAttempts.ts:118-145`: as três funções exportadas
(`checkAccountLock`, `recordFailedLogin`, `clearLoginAttempts`) capturam qualquer erro e retornam
`DEFAULT_LOCK_STATUS` (`blocked:false`, `isLocked:false`); `useAuthForm.ts:181` prossegue para o
`signIn`.

Arquivá-la **degrada silenciosamente**: desliga lockout de força bruta, blocklist/whitelist de IP e
geo-blocking — sem nenhum sinal visível. Severidade permanece 🟠 (risco de segurança silencioso),
mas a consequência muda de "quebra" para "desprotege".

Este erro foi **repetido duas vezes pelo orquestrador em comunicação com o dono** antes de ser
pego. Corrigido em `estado_atualizado.md` §3.5.

### 8.2 REFUTADO — "1 única violação do gateway Evolution"

**São 3 em bypass total.** As duas que escaparam resolvem a base URL pelo **vault**, não pela
variável de ambiente que o grep procurava:

| função | evidência | o que faz |
|---|---|---|
| `evolution-templates` | `:53` `fn_get_vault_secret('evolution_api_url')` · `:81` `fetch(${cfg.url}/message/sendText/...)` | **envia WhatsApp** |
| `evolution-notification-dispatcher` | `:257`, `:270` mesmo padrão | **envia WhatsApp** |

Mais grave que o achado original (`connection-health-check`), que era leitura. Há ainda 2 bypasses
parciais (`evolution-group-sync`, `evolution-api`: `getBaseUrl()` + `fetch` cru).

> **Lição de método:** procurar violação de gateway pelo nome da variável de ambiente é
> insuficiente. O segredo pode vir do vault, de RPC, de variável intermediária ou de template
> literal. Buscar pelo **endpoint do provider** (`/message/sendText`) encontra o que o grep por
> `EVOLUTION_API_URL` perde.

### 8.3 Grupo F tem 4 falsos-negativos, não 2 — e 2 funções têm cron ativo

Além de `login-attempts` e `followup-bridge`: **`client-observability`**
(`src/lib/webVitals.ts:44,98` — nome vem da variável `OBS_FUNCTION`) e **`evolution-retry-metrics`**
(`useRetryMetrics.ts:75-76` — multi-linha + template literal + query string).

E duas funções marcadas "sem chamador" são disparadas por **cron ativo**, confirmado em `cron.job`:

| jobid | job | schedule | função |
|---|---|---|---|
| 476 | `sync-groups-daily` | `10 4 * * *` | `evolution-group-sync` |
| 477 | `check-whatsapp-numbers` | `*/15 * * * *` | — |
| 478 | `notif-dispatcher` | `*/5 * * * *` | `evolution-notification-dispatcher` |

São grupo **C**. Isso contradiz a afirmação do `ESTADO.md` de que apenas `nps-daily-trigger` chama
edge function. Candidatas a arquivar: 19 → **15**.

**Ironia registrada:** a única cujo arquivamento *de fato* derruba uma tela é
`evolution-retry-metrics` — cadeia viva `ViewRouter:138 → EvolutionMonitoringDashboard →
MonitoringWebhookPanel:133 → RetryMetricsPanel`, com `throw error` sem fallback — e é justamente a
que nenhum dos 12 auditores tinha visto.

### 8.4 Correção adicional do orquestrador — cron "determinístico" não era determinístico

`estado_atualizado.md` §3.7 dizia "três com bug de SQL **determinístico**, não intermitência". O
histórico de 7 dias mostra taxas de **0,4% a 12,5%** — intermitentes. Um bug determinístico falharia
em 100%. Além disso, duas das falhas foram **colaterais da migração I4** (janela de 11:47–11:52Z,
quando a tabela virou view — e view não tem `ctid`), e `auto_resolve_alerts` **já havia sido
corrigido por outra lane** antes desta validação.
