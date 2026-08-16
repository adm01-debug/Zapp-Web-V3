# ADR-017: Corte físico do schema `evo` — NÃO EXECUTAR AGORA

**Data:** 2026-08-16
**Status:** ✅ AVALIADO — decisão explícita: **não executar**
**Etapa:** E96 | **Relacionado:** ADR-I4-ROTA-A-MANTIDA, ADR-015, ADR-017

---

## 1. Decisão

**Não separar fisicamente o schema `evo` em cluster próprio neste momento.** A avaliação foi feita (E96) e a saída "não fazer" é a registrada — opção válida no plano.

## 2. Contexto — condições técnicas

As pré-condições do plano para o corte físico estão **satisfeitas**:
- E65: FKs cruzadas zeradas (I3=0) ✅
- E46–E48: search_path cruzado zerado (aux=0) ✅
- Rota A: dado do provider já isolado em `evo` (I4=0) ✅

## 3. Por que NÃO executar

| Pró | Contra |
|---|---|
| Isolamento total de ciclo de vida (upgrade/backup do provider sem tocar o ZAPP) | A Evolution API real já tem banco próprio (stack `postgres`/20); o `evo` no Supabase é telemetria + dado de mensagens — a separação física isolaria telemetria, não o aparelho |
| Carga isolada | Volume atual é pequeno (mensagens ~340 MB em partições); sem dor de performance |
| | Custo operacional: FDW/replicação lógica + monitoramento duplo + backup duplo |
| | Views de contrato e bridge views atravessariam a fronteira (complexidade de grants/RLS) |
| | Risco de latência em leituras quentes do inbox (mensagens via FDW) |

## 4. Gatilhos que reabrem a discussão

1. Crescimento de volume > 10× atual ou latência de ingest→visível degradando (baseline E10).
2. Requisito regulatório/LGPD de separação física de dados do provider.
3. Custo do cluster Supabase compartilhado superar o custo de um cluster dedicado + operação.
4. Necessidade de upgrade de versão do Postgres incompatível entre os dois lados.

## 5. Ação registrada

- Reavaliar na rotina trimestral (E99 — `ROTINA_TRIMESTRAL.md`).
- Se algum gatilho disparar, novo ADR com custos medidos antes de qualquer execução.
