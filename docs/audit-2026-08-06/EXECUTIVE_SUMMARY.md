# SUMÁRIO EXECUTIVO — Auditoria Container × Supabase
## ZAPP-WEB — 2026-08-06

> **Status:** CONCLUÍDA (Fases 0–7)  
> **Executor:** Claude Code — Arquiteto Sênior  
> **Instância:** Supabase Self-Hosted — PG 15.8.1.085 — VPS AtomicaBR  
> **Scope:** 8 dimensões × 40+ checagens × read-only

---

## Dashboard de Severidade

```
╔══════════════════════════════════════════════════════════════╗
║            RESULTADOS DA AUDITORIA — 2026-08-06             ║
╠══════════════════════════════════════════════════════════════╣
║  🔴 P0 CRÍTICO    │  1  │ Ação imediata (< 24h)             ║
║  🟠 P1 ALTO       │  5  │ Ação urgente (< 72h)              ║
║  🟡 P2 MÉDIO      │  6  │ Melhoria (< 1 semana)             ║
║  ✅ SEM DRIFT     │ 28  │ Operando conforme esperado         ║
╠══════════════════════════════════════════════════════════════╣
║  TOTAL CHECAGENS  │ 40  │                                    ║
╚══════════════════════════════════════════════════════════════╝
```

---

## 🔴 P0 — CRÍTICO (Ação Imediata)

### ❌ DADO-01 — auth.users × zapp.profiles: UUID Mismatch Completo

**Impacto:** RLS completamente quebrado para todos os usuários da plataforma.

| Métrica | Valor |
|---------|-------|
| auth.users total | 19 |
| zapp.profiles total | 19 |
| users_sem_profile | **19** (100%) |
| profiles_sem_user | **19** (100%) |
| Sobreposição UUID | **ZERO** |

**Causa raiz:** Trigger `on_auth_user_created` falhou ou não estava ativo quando os usuários foram criados. Perfis foram inseridos com UUIDs gerados independentemente, desvinculando completamente da tabela `auth.users`.

**Consequência:** Qualquer política RLS que verifique `auth.uid() = id` em `zapp.profiles` retorna false para todos os usuários. O sistema está essencialmente sem RLS efetivo.

**Ação imediata:** Reconciliar UUIDs fazendo `UPDATE zapp.profiles SET id = auth.users.id WHERE email = auth.users.email` após confirmar o match por email. Ver procedimento detalhado em `RECONCILIATION_MATRIX.md#DADO-01`.

---

## 🟠 P1 — ALTO (Ação Urgente < 72h)

### ❌ DADO-02 — WAL Slot com 281 MB de Lag Crescente

Slot `cainophile_tqoilw2f` (provável Cainophile CDC) com lag crescendo durante a sessão de auditoria (271 MB → 281 MB). Status "reserved" indica que o consumer não está consumindo. Risco de crescimento sem limite levando a disco cheio no servidor.

**Ação:** Verificar se o consumer está vivo. Se slot abandonado, dropar após confirmação.

### ❌ DADO-03/REDE-05/SAUDE-03 — evolution-db-purge com OOM e Command Not Found

Múltiplas instâncias do container `evolution-db-purge` com:
- Exit 137 = OOM killed (limite de memória insuficiente)
- Exit 127 = command not found (problema de imagem ou entrypoint)

Indica falha recorrente na limpeza de dados da Evolution API, podendo causar crescimento não controlado de dados.

**Ação:** Aumentar limite de memória; verificar imagem e entrypoint do container de purge.

### ❌ ARTEF-02 — Sub-rotas Evolution API ausentes no repositório

As seguintes edge functions estão referenciadas na documentação mas **não existem** em `supabase/functions/`:
- `find-status-messages`
- `get-webhook`
- `send-chat-presence`
- `set-webhook`

**Ação:** Implementar ou re-implantar essas funções.

### ❌ MIGR-02 — Schema `evo` com 143 tabelas vs 172 esperadas (-29)

O schema `evo` (Evolution API) tem 143 tabelas presentes vs. 172 documentadas em versões anteriores. Diferença de 29 tabelas.

**Ação:** Auditar se as 29 tabelas foram removidas intencionalmente ou estão faltando. Ver query em `RECONCILIATION_MATRIX.md#MIGR-02`.

---

## 🟡 P2 — MÉDIO (< 1 semana)

| ID | Problema | Ação |
|----|---------|------|
| DADO-05 | `audio-memes` (public=true no DB, CLAUDE.md diz private) e `audio-messages` (public=false no DB, CLAUDE.md diz public) | Alinhar DB ou CLAUDE.md |
| DADO-06 | Cron jobs: 151 no DB vs. 146 no CLAUDE.md (+5 drift) | Atualizar CLAUDE.md |
| MIGR-03 | Schema `zapp`: 323 tabelas vs. 321 no CLAUDE.md (+2 drift) | Atualizar CLAUDE.md |
| MIGR-04 | 5 schemas não documentados: artes, graveyard, logistica, monitoring, parity_audit | Documentar no CLAUDE.md |
| ARTEF-05 | Extensão `http` ausente (pg_net presente como alternativa funcional) | Confirmar se `http` é realmente necessária |
| SECRET-04 | Varredura de hardcoded secrets (git grep) não executada | Executar varredura de segurança no repo |

---

## ✅ Confirmado Sem Drift

| Área | Status |
|------|--------|
| JWT secret consistency (GoTrue × PostgREST × Storage × Functions × Realtime) | ✅ Todos usam `supabase_jwt_secret_v1` |
| PGRST_DB_SCHEMAS vs schemas no DB | ✅ Todos os 7 schemas existem |
| GoTrue SITE_URL | ✅ `https://zapp.atomicabr.com.br` |
| PG Timezone | ✅ `America/Sao_Paulo` |
| supabase_meta | ✅ Rodando há 12h (crash-loop histórico resolvido) |
| Storage backend | ✅ Filesystem, 13 buckets |
| Extensions críticas | ✅ pg_cron, pg_net, pgcrypto, vector, pg_graphql, pgjwt |
| Realtime publication | ✅ 68 tabelas, publish_via_partition_root=true |
| Edge Functions — schema zapp | ✅ `db-client.ts` correto |
| Edge Functions — SUPABASE_URL → Kong | ✅ `http://kong:8000` |
| Rede interna Swarm | ✅ AtomicaBRNet 10.0.1.x/24 |
| Functions volume mount | ✅ Bind mount host → container |
| GoTrue RestartCount | ✅ 0 |
| supabase_storage | ✅ Up, saudável |
| supabase_realtime | ✅ Up, saudável |
| PostgreSQL versão | ✅ 15.8.1.085 |
| supabase-js versão | ✅ @2.49.1 |

---

## Métricas do Sistema (snapshot 2026-08-06)

| Métrica | Valor |
|---------|-------|
| PostgreSQL versão | 15.8.1.085 |
| Schema `zapp` — tabelas | 323 |
| Schema `evo` — tabelas | 143 |
| Extensões instaladas | 21 |
| Storage buckets | 13 |
| Cron jobs ativos | 151 |
| auth.users | 19 |
| zapp.profiles | 19 |
| WAL slot lag | 281 MB (crescendo) |
| Realtime tables | 68 |
| Edge Functions runtime | 1.5 GB / 1 CPU |
| GoTrue memory limit | 1 GB |

---

## Próximos Passos Recomendados

```
Prioridade 1 (HOJE):
  □ Reconciliar UUIDs auth.users × zapp.profiles via UPDATE por email match
  □ Verificar e reativar trigger on_auth_user_created
  □ Confirmar RLS funcionando após reconciliação

Prioridade 2 (ATÉ AMANHÃ):
  □ Investigar WAL slot cainophile_tqoilw2f — dropar se consumer inativo
  □ Corrigir evolution-db-purge (memória + entrypoint)
  □ Implementar sub-rotas Evolution API ausentes

Prioridade 3 (ESTA SEMANA):
  □ Atualizar CLAUDE.md com contagens corretas
  □ Auditar buckets audio-memes/audio-messages e corrigir flag public
  □ Documentar schemas artes/graveyard/logistica/monitoring/parity_audit
  □ Executar varredura de hardcoded secrets (git grep)
  □ Verificar evo schema — 29 tabelas faltando
```

---

_Artefatos desta auditoria:_  
- `RECONCILIATION_MATRIX.md` — matriz completa com evidências  
- `reconciliation.json` — dados estruturados P0/P1/P2  
- `reconciliation.csv` — formato tabulado para exportação  
- `VALIDATION_PLAN_100_STEPS.md` — progresso das 100 etapas

_Gerado em 2026-08-06 | Branch: `claude/evolution-api-audit-kdfenp`_
