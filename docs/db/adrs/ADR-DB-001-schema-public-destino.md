# ADR-DB-001 — Destino do Schema `public`

**Status:** APROVADO — Opção A  
**Data:** 27/07/2026  
**Autores:** time de plataforma  
**Contexto:** Etapa 6 do Plano DB de 50 etapas

---

## Contexto

O schema `public` do Supabase é exposto pelo PostgREST por padrão. O app ZAPP Web chama `/rest/v1/*`, que mapeia para `public.*`. Atualmente `public` contém:

- **539 views** (API facade): 300 → `zapp`, 182 → `evo`, 41 → `bpm`, 12 → `vendas`, 3 → `logistica`
- **145 funções** RPC (contrato de API)
- **1 tabela real** (`_wal_slot_guard_events` — fora do lugar, ver etapa 7)
- **9 extensões** (fora do lugar, ver etapa 8)

A questão é: o que fazemos com o `public` a longo prazo?

---

## Opções avaliadas

### Opção A — `public` como camada de API imutável (ESCOLHIDA)

**Descrição:** manter `public` como corredor de API — somente views `security_invoker` e RPCs de contrato. Regra: "nenhuma tabela de negócio, nenhuma extensão, nenhuma lógica nova".

**Vantagens:**
- Zero mudança na configuração do PostgREST
- Zero mudança no app (continua chamando `/rest/v1/*`)
- Risco de migração **nulo** (só governança nova, sem refactoring)
- Compatível com o cron `ensure-evolution-backcompat-views` (que mantém as views ativas)
- Reversível a qualquer momento

**Desvantagens:**
- `public` continua sendo uma fachada, não um schema "limpo"
- Desenvolvedores precisam ser educados sobre o que é view vs tabela
- Continua aceitando novas views sem controle se o CI não for rigoroso

**Riscos gerenciados por:**
- CI-01: falha se qualquer tabela de negócio for criada em `public`
- CI-02: falha se extensão for adicionada em `public`
- DDL-FREEZE-POLICY: uma mudança por vez, sempre via migration

---

### Opção B — Esvaziar `public` reconfigurandoo PostgREST

**Descrição:** configurar `PGRST_DB_SCHEMAS = zapp,evo,bpm,...` e reapontar o cliente Supabase para os schemas de domínio diretamente. Remover as 539 views do `public`.

**Vantagens:**
- `public` fica genuinamente neutro
- Arquitetura mais "limpa"

**Desvantagens:**
- **Obra maior:** o app usa `supabase.from('profiles')` que resolve para `public.profiles`; seria necessário mudar CADA chamada de API para qualificar o schema
- Requer configuração de múltiplos schemas no PostgREST (impacto em CORS, JWT claims, etc.)
- **Alto risco de regressão** — cada view de compat depende de `security_invoker` e a remover todas expõe possíveis gaps de RLS
- Incompat com o cron `ensure-evolution-backcompat-views` (etapa 11 — primeiro governar, depois decidir)
- Não testável sem staging completo (etapa 1)

**Conclusão:** não antes de ter staging + baseline squash (etapas 1+16). Pode ser retomado em 6–12 meses.

---

## Decisão

**Opção A aprovada.**

O `public` continua como camada de API imutável com as seguintes regras obrigatórias:

1. **Nenhuma tabela de negócio** em `public`. A única exceção histórica (`_wal_slot_guard_events`) será movida para `ops` (etapa 7).
2. **Nenhuma extensão** em `public`. As 9 existentes serão movidas para `extensions` (etapa 8, ALTO RISCO — fazer por último).
3. **Toda nova view** em `public` deve ter `security_invoker=on` e apontar para o schema dono dos dados.
4. **Nenhuma lógica nova** em `public`. Toda lógica vai no schema dono.
5. CI valida regras 1–4 em cada PR.

---

## Consequências

- `public` permanece com 539 views + 145 funções RPC de contrato
- O cron `ensure-evolution-backcompat-views` continua operando (governado pela etapa 11)
- Opção B é postponed indefinidamente — reavaliar após baseline squash + 6 meses de estabilidade

---

## Revisão

Esta ADR deve ser revisada se:
- A equipe decidir migrar para o Supabase Cloud (que tem controle de schema diferente)
- A opção B se tornar viável após staging ser estabelecido
- O PostgREST for atualizado para facilitar multi-schema sem refactoring
