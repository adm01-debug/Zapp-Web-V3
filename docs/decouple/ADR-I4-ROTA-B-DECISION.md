# ADR-I4: Decisão de Rota B — dado de negócio permanece em `zapp`; `evo` é observabilidade formal

**Data:** 2026-08-16
**Status:** ✅ APROVADO pelo dono (Joaquim)
**Supersede:** [`ADR-I4-E73-E77-PLANO-JANELA.md`](./ADR-I4-E73-E77-PLANO-JANELA.md) (plano de janela da Rota A — **não executar**)
**Invariante afetado:** I4 — "O dado da Evolution reside no schema da Evolution"

---

## 1. Decisão

**O dado de negócio de WhatsApp (mensagens, conversas, contatos) permanece fisicamente no schema `zapp`.** O schema `evo` é declarado formalmente como **observabilidade do ecossistema Evolution** (monitoria, mídia, LID, auditoria de webhook, filas, watchdog) — papel que já exerce hoje. As views de contrato em `public.*` continuam sendo o canal de leitura do app.

Isto é a **Rota B** do `PLANO_INDEPENDENCIA_100_ETAPAS_20260815.md` (§2). O placar de invariantes passa a registrar **I4 = PASS por design** (decisão de arquitetura declarada, não pendência de execução).

## 2. Contexto e justificativa

### 2.1 O que o plano pedia
O plano original foi escrito para a Rota A (mover `evolution_messages`/`conversations`/`contacts` + 14 partições para `evo`), com a ressalva explícita de que a Rota B era alternativa válida e mais barata. A decisão ficou pendente — o `ADR-I4-E73-E77-PLANO-JANELA.md` (16/08) congelou a janela da Rota A aguardando aprovação.

### 2.2 Fatos medidos que mudaram a análise desde o T0 (15/08)

| Fato | Medição (banco de produção, 16/08) |
|---|---|
| FKs cruzadas evo↔zapp | **0** (E64–E66 executados — era pré-requisito das duas rotas) |
| `search_path` cruzado evo↔zapp | **zerado** (E46–E48) |
| I1 — fns `evo` citando `zapp.*` | **14** (T0: 64) — dezenas de fns de monitoria já movidas com smoke test |
| I2 — fns `zapp` citando `evo.*` | escrita estrita **0** |
| Views de contrato `public.evolution_*` | **já existem e apontam para `zapp`** |
| Realtime (`evolution_contacts` na publication) | continua em `zapp` — sem janela necessária |
| Infraestrutura de deploy | **separada** (atomica-platform; gitops-stacks só evolution*; zapp-functions-health ativa) |

### 2.3 Argumentos que decidiram

1. **O ZAPP é o CRM — o histórico de conversas é ativo de negócio dele.** A arquitetura pedida ("ZAPP pode escolher outra API") exige que trocar de provedor não dependa de migrar dados nem de "seguir" o schema de um provedor. Dado em `zapp` = troca de aparelho sem mexer no arquivo.
2. **O sistema já está em Rota B de facto.** Views de contrato apontam para `zapp`, RPCs de escrita escrevem em `zapp`, `evo` opera como monitoria. Executar a Rota A agora seria reverter esse estado e reescrever ~150 funções + janela de Realtime — risco sem retorno de negócio visível.
3. **O ganho da Rota A (separação física futura do schema `evo`) é fraco na prática:** a Evolution API real já tem banco PostgreSQL próprio isolado (stack `postgres`/20). O schema `evo` no Supabase é telemetria — levá-la para outro cluster não isola o provedor, isola a monitoria.
4. **A soberania que o plano realmente persegue (I6) já foi entregue** — repos, stacks, deploys e contratos HTTP estão separados **independentemente de onde mora a tabela**.

## 3. Consequências

### 3.1 Etapas do plano que mudam de status

| Etapa | Antes (Rota A) | Agora (Rota B) |
|---|---|---|
| E67–E71 (indireção 161 fns) | obrigatórias antes do move | **canceladas** — sem move, sem reescrita |
| E72–E77 (janela de move) | executar | **canceladas** — ADR-I4-E73-E77 supersedido |
| E78–E80 (contrato de leitura) | manter | **mantidas** — views `public.*` são o contrato |
| E89 (consumer sem `PG_EVOLUTION_URL`) | pendente | **pendente — agora é a pendência nº 1 da fronteira de escrita** |
| E82 (remover `evolution-proxy`) | pendente | **pendente** (arquivar) |
| E96 (avaliar corte físico) | dependia de E73 | **fica sem objeto imediato** — registrar "não fazer" como saída válida |

### 3.2 Placar de invariantes

- **I4 = PASS por design** (declarado neste ADR). O `boundary-audit` deve tratar a presença das 3 tabelas em `zapp` como estado aceito, e monitorar apenas regressões dos demais invariantes.

### 3.3 Riscos declarados (aceitos)

- O dado de WhatsApp e o dado do ZAPP compartilham o mesmo cluster — já era o caso e não piora.
- `evo` não pode ser movido para outro banco sem mover também as views de contrato — decisão registrada; se um dia houver necessidade, reavaliar com ADR próprio.

## 4. Critérios de aceitação

- [x] Decisão aprovada pelo dono (16/08/2026)
- [ ] `ADR-I4-E73-E77-PLANO-JANELA.md` marcado como supersedido no cabeçalho
- [ ] Plano/placar atualizados: I4 = PASS por design
- [ ] `DECOUPLING.md` / docs de fronteira sem instruções de execução da Rota A

## 5. Pendências que destravam Fases 5–8 (pós-decisão)

1. **E89** — remover conexão Postgres direta do consumer (`PG_EVOLUTION_URL`/psycopg2); telemetria via HTTP.
2. **E82** — arquivar `evolution-proxy` (substituído por `evolution-api` gateway).
3. **E97/E98** — ativar `boundary-audit` como gate bloqueante + ratchet nos dois repos.
4. Reconciliar `main` × branch decouple (trabalho real E41/E47-48/E64-66/E80/E86 está em `main`).
