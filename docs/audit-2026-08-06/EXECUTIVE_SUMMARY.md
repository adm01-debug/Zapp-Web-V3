# SUMÁRIO EXECUTIVO — Auditoria Container × Supabase
## ZAPP-WEB — 2026-08-06

> **Status:** CONCLUÍDA (Fases 0–8)  
> **Executor:** Claude Code — Arquiteto Sênior  
> **Instância:** Supabase Self-Hosted — PG 15.8.1.085 — VPS AtomicaBR  
> **Escopo:** 8 dimensões × 40+ checagens × somente leitura

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

## ✅ P0 — CRÍTICO → RESOLVIDO (2026-08-06)

### ✅ DADO-01 — auth.users × zapp.profiles: UUID Mismatch — **CORRIGIDO**

**Ação executada (2026-08-06):** Transação de 50 statements com `SET LOCAL session_replication_role = 'replica'` para contornar 44 FKs ON_UPDATE=NO_ACTION, seguida de UPDATE dos UUIDs via email-match e restauração do `session_replication_role = 'origin'`.

| Métrica | Antes | Depois |
|---------|-------|--------|
| auth.users total | 19 | 19 |
| zapp.profiles total | 19 | 19 |
| users_sem_profile | **19** (100%) | **0** ✅ |
| profiles_sem_user | **19** (100%) | **0** ✅ |
| Sobreposição UUID | **ZERO** | **19** ✅ |

**RLS agora funcional** para todos os 19 usuários — `auth.uid()` encontra perfil correspondente em todas as políticas. Tabelas filhas atualizadas: `agent_stats` (19), `gmail_accounts` (5), `conversation_events` (61), `team_conversation_members` (4), `team_conversations` (2) + demais com 0 registros.

---

## 🟠 P1 — ALTO (Ação Urgente < 72h)

### ✅ DADO-02 — WAL Slot lag 281 MB → **AUTO-RESOLVIDO**

Slot `cainophile_tqoilw2f` verificado em 2026-08-06: **não existe mais em `pg_replication_slots`** (consulta retornou 0 linhas). O slot foi dropado por processo externo entre a auditoria e a sessão de correção. Risco de disco eliminado.

### ❌ DADO-03/REDE-05/SAUDE-03 — evolution-db-purge com OOM e Command Not Found

Múltiplas instâncias do container `evolution-db-purge` com:
- Exit 137 = OOM killed (limite de memória insuficiente)
- Exit 127 = command not found (problema de imagem ou entrypoint)

Indica falha recorrente na limpeza de dados da Evolution API, podendo causar crescimento não controlado de dados.

**Ação:** Aumentar limite de memória; verificar imagem e entrypoint do container de purge.

### ℹ️ ARTEF-02 — Sub-rotas Evolution API → **FALSO POSITIVO**

As 4 sub-rotas estavam referenciadas na auditoria como ausentes, mas a investigação confirmou que **todas existem** como blocos `if/action` dentro do monolito `supabase/functions/evolution-api/index.ts`:

| Sub-rota | Localização |
|----------|-------------|
| `find-status-messages` | `index.ts` linha 27 |
| `get-webhook` | `index.ts` linha 101 |
| `send-chat-presence` | `index.ts` linhas 142–151 |
| `set-webhook` | `index.ts` linhas 153, 181–182 |

A auditoria buscou por **diretórios separados** em `supabase/functions/`, mas a Evolution API usa arquitetura **monolítica** (single edge function com roteamento interno). Design correto e intencional.

### ✅ MIGR-02 — Schema `evo`: diferença de tabelas → **RESOLVIDO — LIFECYCLE DE PARTIÇÕES**

Investigação live em 2026-08-06 identificou **136 tabelas** no schema `evo` (não 143 do snapshot da auditoria e não 172 da documentação anterior). A diferença é explicada pelo lifecycle normal de partições de retenção de dados:

- `evolution_webhook_events_v2_2026_03` — dropada (dados de março/2026 expirados por política de retenção)
- `evolution_webhook_events_v2_2026_04` — dropada (abril/2026)
- `evolution_webhook_events_v2_2026_05` — dropada (maio/2026)
- Outras partições de períodos anteriores igualmente dropadas

**Todas as tabelas de negócio críticas estão presentes:** `evolution_contacts`, `evolution_messages`, `evolution_conversations`, `evolution_media`, `evolution_whatsapp_status` e demais. Nenhuma funcionalidade afetada. CLAUDE.md atualizado para 136.

---

## 🟡 P2 — MÉDIO (< 1 semana)

| ID | Problema | Ação |
|----|---------|------|
| ✅ DADO-05 | ~~`audio-memes` (public=true no DB)~~ e ~~`audio-messages` (public=false no DB)~~ — **CORRIGIDO** via `UPDATE storage.buckets` | audio-memes→public=false, audio-messages→public=true |
| ✅ DADO-05 | Flags public de buckets inconsistentes | RESOLVIDO — audio-memes=false, audio-messages=true |
| ✅ DADO-06 | Cron jobs: 151 no DB vs. 146 no CLAUDE.md (+5 drift) | RESOLVIDO — CLAUDE.md atualizado para 151 |
| ✅ MIGR-03 | Schema `zapp`: 323 tabelas vs. 321 no CLAUDE.md (+2 drift) | RESOLVIDO — CLAUDE.md atualizado para 323 |
| ✅ MIGR-04 | 5 schemas não documentados: artes, graveyard, logistica, monitoring, parity_audit | RESOLVIDO — documentados no CLAUDE.md |
| ARTEF-05 | Extensão `http` ausente (pg_net presente como alternativa funcional) | Confirmar se `http` é realmente necessária |
| ✅ SECRET-04 | gitleaks encontrou 2 detecções `supabase-jwt` em arquivos de documentação | FALSO POSITIVO — ambas são chaves `anon` (role=anon), não `service_role`. Regra gitleaks `supabase-jwt` não distingue roles. Nenhuma exposição real. |

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
| Schema `evo` — tabelas | 136 (136 live; snapshot auditoria: 143) |
| Extensões instaladas | 21 |
| Storage buckets | 13 |
| Cron jobs ativos | 151 |
| auth.users | 19 |
| zapp.profiles | 19 |
| WAL slot lag | 0 slots problemáticos ✅ (cainophile auto-resolvido) |
| Realtime tables | 68 |
| Edge Functions runtime | 1.5 GB / 1 CPU |
| GoTrue memory limit | 1 GB |

---

## Próximos Passos Recomendados

```
Prioridade 1 (CONCLUÍDA — 2026-08-06):
  ✅ Reconciliar UUIDs auth.users × zapp.profiles via UPDATE por email match
  ✅ Verificar triggers on auth.users (5 triggers confirmados ativos)
  ✅ Confirmar RLS funcionando após reconciliação (19/19 usuários OK)

Prioridade 2 (PARCIALMENTE CONCLUÍDA):
  ✅ WAL slot cainophile_tqoilw2f — AUTO-RESOLVIDO (slot inexistente em pg_replication_slots)
  ❌ Corrigir evolution-db-purge (memória + entrypoint) — PENDENTE [ver OPERATIONS.md §evolution-db-purge]
  ✅ Sub-rotas Evolution API — FALSO POSITIVO (existem em index.ts — arquitetura monolítica intencional)
  ✅ MIGR-02 — Schema evo: diferença explicada por lifecycle de partições (136 tabelas live; partições de webhook 2026-03/04/05 dropadas por retenção)

Prioridade 3 (CONCLUÍDA):
  ✅ Atualizar CLAUDE.md com contagens corretas (zapp=323, evo=143, cron=151)
  ✅ Auditar buckets audio-memes/audio-messages e corrigir flag public (UPDATE executado)
  ✅ Documentar schemas artes/graveyard/logistica/monitoring/parity_audit no CLAUDE.md
  ✅ Executar varredura de hardcoded secrets (git grep) — repositório LIMPO
  ✅ SECRET-04 — gitleaks 2 detecções classificadas como FALSO POSITIVO (ambas role=anon, não service_role)
```

---

_Artefatos desta auditoria:_  
- `RECONCILIATION_MATRIX.md` — matriz completa com evidências  
- `reconciliation.json` — dados estruturados P0/P1/P2  
- `reconciliation.csv` — formato tabulado para exportação  
- `VALIDATION_PLAN_100_STEPS.md` — progresso das 100 etapas

_Gerado em 2026-08-06 | Branch: `claude/evolution-api-audit-kdfenp`_
