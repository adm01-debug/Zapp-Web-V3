# ENSAIO V4 — Log de Execução (template) · ensaio cronometrado fake ↔ evolution

> **Alvo no repo:** `docs/decouple/ENSAIO_V4_LOG.md` (zapp-web-v3) · **Tarefa:** V4-FINAL #54
> **Status:** ⏳ TEMPLATE — NUNCA EXECUTADO (2026-08-14). Nenhum número abaixo é evidência; preencher na execução noturna.
> **Propósito:** log executável do **ensaio cronometrado fake↔evolution** (etapa 57 do Plano V3 / runbook `RUNBOOK_TROCA_PROVIDER.md`) — mede **TEMPO** e **ROLLBACK** do procedimento de troca de provider.
> **Divisão de cobertura:** o ensaio de mesa `supabase/functions/_shared/__tests__/ensaio-fake.test.ts` (PR #1082) já valida o **CONTRATO** (guard do registry, shapes canônicos dos 12 verbos, casamento com o normalizer, benchmark de mesa, paridade 12/12 fake×evolutionClient — E2b). Este ensaio **operacional** mede o que o de mesa não mede: **tempo real por passo, gates de entrada e rollback cronometrado**.
> **Estado real na main (2026-08-15):** `PROVIDER_UNDER_TEST` já existe no registry (`providers/registry.ts`); a proxy `evolution-proxy` já consome o registry (piloto #34 mergeado); o fake está **12/12** com `assertTestEnv()` por verbo (gap `getProfilePicture` fechado no #1088). O ensaio operacional exercita esse caminho já existente.

## 0. Metadados da execução

| Campo | Valor |
|---|---|
| Data (UTC) | |
| Janela (fora de pico) | |
| Operador / responsável | |
| SHA do repo | |
| PRs envolvidos (P1–P4) | |
| Baseline msgs/24h | 5.077 (`docs/decouple/BASELINE.md`) |
| PROVIDER_UNDER_TEST | `fake` (`supabase/functions/_shared/providers/fake/index.ts` — **12/12** verbos incluindo `getProfilePicture`, `assertTestEnv()` por verbo, `DENO_ENV=test`; gap 11/12 fechado no #1088) |
| Veredito final | ⏳ pendente / ✅ sucesso / ❌ abortado (passo __) |

## 1. Gates de entrada (TODOS verdes antes do passo 1)

| # | Gate | Critério | Como verificar | Resultado |
|---|---|---|---|---|
| G1 | CI decouple | inventory **0/0/0/0** no último PR mergeado (threshold do decouple-guard: `TOTAL=0`; sql-gate via fixture `scripts/decouple/fixtures/sql_report_snapshot.json`) | `decouple-guard.yml` + `ownership-gate.yml` verdes no GitHub | ⬜ |
| G2 | Saúde | health score **A+ (≥95)**, wpp2 `state=open` | `ops.v_health_latest` / dashboard / `connectionHealthCheck` | ⬜ |
| G3 | Pipeline | **DLQ = 0** e erro de envio ≤1% nas últimas 24h | `zapp.vw_dlq_pending` + `evolution-retry-metrics` | ⬜ |
| G4 | Baseline | msgs/24h registrado (5.077) | `docs/decouple/BASELINE.md` | ⬜ |
| G5 | Ensaio de mesa (verb-gate ativo) | `ensaio-fake.test.ts` verde (PR #1082) — contrato validado; E2b garante paridade **12/12** fake×evolutionClient (roda no CI via `deno-contract-tests.yml`) | `DENO_ENV=test deno test --allow-all supabase/functions/_shared/__tests__/ensaio-fake.test.ts` | ⬜ |
| G6 | Guard do fake | `registry.getProviderClient('fake')` só resolve com `DENO_ENV=test` | `assertTestEnv()` não lança em test; lança fora (E8 do `CENARIOS_V4_LOG.md`) | ⬜ |

> Abort antes de começar: qualquer gate permanece ⬜ após 2 tentativas de re-verificação.

## 2. Os 8 passos do runbook → PROVIDER_UNDER_TEST=fake

> Ordem das portas (runbook §3): P1 (modo) → P2 (client) → P3 (webhook) → P4 (SQL). **Evolution nunca é desligada** — troca dual até o fim. No ensaio, o "provider-alvo" é o **fake**; nada sai para rede real.

| Passo | Runbook (origem) | Ação concreta no ensaio (fake) | Verificação ✅ | Critério de abort do passo |
|---|---|---|---|---|
| 1 | Preparar provider (pré-deploy) | Preparar ambiente isolado: `DENO_ENV=test`, `fakeProvider.reset()` + mocks dos 12 verbos; conferir que nenhum secret/endpoint real é tocado | `assertSafe()` ok; mocks definidos; 0 chamadas a vault/URL reais | Qualquer escrita/leitura fora do sandbox fake |
| 2 | Contrato-test dos 12 verbos (P2) | Rodar contrato-test do gateway contra o client fake — mesmo schema Zod do contrato real (E6 do `CENARIOS_V4_LOG.md`) | 12/12 verbos respondem shape canônico (não shape Evolution) | Shape divergente do contrato → fake diverge, abortar |
| 3 | Implementar/registrar client (P2) | Garantir `registry.getProviderClient('fake')` resolve sem throw; guard `DENO_ENV=test` intacto | Resolução ok; teste unitário com fake mocks passa | Guard violado / resolve fora de `test` |
| 4 | Ligar modo no front (P1) | Alternar `getWhatsAppMode()` para o modo ensaio e invalidar cache (`invalidateWhatsAppModeCache`); smoke de envio de texto via adapter → edge em modo fake | Adapter resolve `transport='fake'`; smoke 1:1 chega no destino fake | Mensagem escapa para provider/instância real |
| 5 | Migrar webhook de entrada (P3) | Apontar `ingest-port` para a rota fake; disparar evento de teste; conferir normalização e gravação | Evento de teste chega e grava em `zapp.evolution_messages`; `ingest_ledger` registra canal fake | Webhook de entrada parado >10 min; evento não normaliza |
| 6 | Congelar ingestão Evolution (P3) | Desativar/ignorar eventos da instância wpp2 no `ingest-port` (NÃO deletar a instância) | `ingest_ledger` sem entradas novas do canal evolution; DLQ continua 0 | DLQ >0 novo; 4xx/5xx novos nos logs |
| 7 | Migrar as 5 fns SQL (P4) | Snapshot `ops.fn_bodies_backup` ANTES; editar fns para resolver via resolvers de ensaio; snapshot DEPOIS; gate SQL do CI verde | Diff pré/pós registrado; 1 ciclo do cron 317 sem erro; `SHOW search_path` correto | Gate SQL vermelho; cron com erro; diff vazio |
| 8 | Soak de 24h (reduzido no ensaio) | **Soak reduzido**: janela de observação de 15–60 min (o soak real de 24h pertence à troca, não é ensaiável integralmente) | Números ≈ baseline (5.077) com desvio ≤20%; DLQ 0; health ≥95 | Queda >20%; erro de envio >1%; health <95 |

## 3. Tabela de timestamps (preencher na execução)

| Passo | Início (UTC) | Fim (UTC) | Duração | Critério de abort | Passou? |
|---|---|---|---|---|---|
| 1 | | | | sandbox violado | ⬜ |
| 2 | | | | shape ≠ canônico | ⬜ |
| 3 | | | | guard violado | ⬜ |
| 4 | | | | escape p/ provider real | ⬜ |
| 5 | | | | webhook parado >10 min | ⬜ |
| 6 | | | | DLQ >0 / 4xx-5xx | ⬜ |
| 7 | | | | gate SQL vermelho | ⬜ |
| 8 (soak reduzido) | | | | desvio >20% | ⬜ |
| **Total passos 1–7** | | | | **alvo: ≤60 min** (runbook §7: 30–60 min com ensaio prévio; sem ensaio, dobre) | ⬜ |

## 4. Degradação observada

> No ensaio o tráfego real NÃO passa pelo fake — degradação a medir é a do ambiente compartilhado (health/DLQ do wpp2) e a da mecânica (tempos, retries, filas).

| Métrica | Baseline | Durante o ensaio | Pós-ensaio | Veredito |
|---|---|---|---|---|
| msgs/24h | 5.077 | | | |
| DLQ (`vw_dlq_pending`) | 0 | | | |
| Health (`ops.v_health_latest`) | ≥95 (A+) | | | |
| p95 envio | (registrar) | | | |
| Erros de envio | ≤1% | | | |
| Webhooks de entrada | fluxo contínuo | | | |

## 5. Rollback cronometrado

> Regra do runbook §4: Evolution permanece viva e configurada durante TODO o ensaio — rollback é sempre reverter flags/config, nunca restaurar infra. Medir cada faixa; alvos conforme runbook §7.

| Passo-falha | Ação de rollback | Início (UTC) | Fim (UTC) | Duração | Alvo |
|---|---|---|---|---|---|
| 1–3 (pré-produção) | Reverter o PR — nada em prod foi tocado | | | | < 5 min |
| 4–5 | `getWhatsAppMode()` → `unofficial` + `invalidateWhatsAppModeCache`; reconfigurar webhook Evolution (URL antiga) | | | | < 10 min |
| 6 | Reativar ingestão Evolution no `ingest-port` (idempotência do `ingest_ledger` absorve duplicatas do overlap) | | | | < 5 min |
| 7 | Restaurar corpos do `ops.fn_bodies_backup` + `CREATE OR REPLACE` de cada fn; verificar 1 ciclo do cron 317 | | | | < 15 min |
| **Rollback total (pior caso: falha no passo 7)** | | | | | **< 30 min** |

## 6. Critérios de abort globais (qualquer passo)

- Erro de envio >1%; DLQ >0 novo; p95 >2× baseline; health <95; webhook de entrada parado >10 min (runbook §1).
- Específicos do ensaio: qualquer escrita fora do sandbox fake; guard `DENO_ENV=test` violado; `PROVIDER_UNDER_TEST=fake` vazando para produção (E8 do `CENARIOS_V4_LOG.md`); 4xx/5xx novos nas edges; tentativa de tocar secrets reais.

## 7. Evidências a arquivar após a execução (sem sucesso fabricado)

- Este log preenchido (tabelas 3, 4 e 5 com tempos reais).
- Saída do contrato-test dos 12 verbos (passo 2 — fake).
- PRs do ensaio com CI verde (decouple-guard 0/0/0/0).
- Snapshots `ops.fn_bodies_backup` pré/pós (passo 7).
- Curvas de msgs/24h, DLQ e health da janela do ensaio (passo 8 reduzido).
- Tempos medidos vs estimativa do runbook §7 (30–60 min) — atualizar o runbook se divergir.
- Veredito + lições, referenciados em `RETRO_V2.md` / `RETRO_V3.md` (runbook §8).

## 8. Limites honestos

- O ensaio NÃO toca produção real de mensagens — o provider-alvo é o fake; o tempo da troca real (Cloud) pode diferir (latências próprias da Graph API, verificação de webhook Meta).
- O soak de 24h não é ensaiável integralmente; o ensaio valida a **mecânica, os tempos e o rollback** — não o comportamento de longo prazo.
- O contrato em si (shapes, normalização, paridade) é coberto pelo ensaio de mesa (PR #1082); aqui repete-se apenas o smoke por passo.
- Se a troca real for executada depois, este ensaio NÃO substitui o soak de 24h nem a decisão de desligar a Evolution (runbook §3 passo 8 — exige APROVADO de Joaquim).
