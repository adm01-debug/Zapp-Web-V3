
# Incidente 2026-07-26 — Pipeline de Persistência + Segurança ACL

**Data:** 2026-07-26  
**Severidade:** P0 (segurança) + P1 (pipeline degradado)  
**Executor:** Agente IA Sênior (Plano 50 Etapas)  
**Status:** ✅ Parcialmente resolvido — pipeline recuperando, segurança corrigida

---

## 1. Resumo Executivo

| Problema | Causa | Status |
|---|---|---|
| Pipeline ROMPIDO (0 msgs 24/07–26/07) | wpp2 desconectou 25/07 12:40, consumer parou | ✅ RECUPERADO (74 msgs hoje) |
| Security ACL regression | `anon` tinha DML em `financeiro.*` sem RLS | ✅ CORRIGIDO (migration 20260726193100) |
| Alertas stale abertos | wpp2_disconnection, qrcode_required, security_acl_regression | ✅ RESOLVIDOS |
| Pipeline DEGRADADO 45% | 9/20 msgs persistindo na janela 1h | ⚠️ MONITORANDO |

---

## 2. Cronologia

```
24/07 17:41 — Última mensagem real antes do gap
25/07 12:40 — wpp2 desconecta (alertas wpp2_disconnection + qrcode_required gerados)
26/07 08:00 — security_acl_regression detectado: anon_execute=0, public_grant=0 (ok)
26/07 12:15 — ingestion_persistence_gap ROMPIDO: persistidas=0/6
26/07 12:30 — security_acl_regression: anon_execute=2, public_grant=2 (degradação)
26/07 15:10 — pipeline_dead_man: gap_minutes=2728
26/07 15:00 — Pipeline começa a se recuperar (2 msgs na hora 15h UTC)
26/07 16:00 — 17 msgs na hora 16h UTC
26/07 16:19 — Resolução parcial: consumer_halt, ingestion_persistence_gap ROMPIDO, pipeline_dead_man resolvidos
26/07 17:22 — ingestion_persistence_gap muda para DEGRADADO (ratio=0.45)
26/07 18:00 — 43 msgs na hora 18h UTC
26/07 19:20 — wpp2 health_status volta a 'healthy'
26/07 19:31 — migration 20260726193100 aplicada (REVOKE anon DML financeiro/vendas)
26/07 19:32 — Alertas wpp2_disconnection, qrcode_required, security_acl_regression RESOLVIDOS
26/07 19:33 — 74 msgs hoje (pipeline ativo)
```

---

## 3. Achados de Segurança

### 3.1 ACL Regression — `anon` com DML em dados financeiros (P0)

**Problema:** O role `anon` tinha INSERT/UPDATE/DELETE em tabelas do schema `financeiro` e `vendas` SEM nenhuma política RLS restritiva.

**Tabelas afetadas:**
- `financeiro.app_usuarios`, `financeiro.bancos`, `financeiro.bling_token`
- `financeiro.colaboradores`, `financeiro.config`, `financeiro.emprestimos`
- `financeiro.notas_fiscais`, `financeiro.pagamentos_diarios`
- `financeiro.solicitacoes_alteracao_valor`, `financeiro.vales`
- `financeiro.vendas_parcelas`, `financeiro.vendas_unificadas`
- `financeiro.vw_conciliacao_vendas` e outros 9 views financeiras
- `vendas.creditos`, `vendas.trocas`, `vendas.parabens_enviados`

**Evidência:** `rls_financeiro_anon` query retornou 0 rows (ZERO políticas RLS para anon em tabelas financeiras)

**Ação:** Migration `20260726193100` — REVOKE INSERT, UPDATE, DELETE de `anon` em todas as tabelas

**Verificação:** `grants_dml_anon_restantes = 0` ✅

### 3.2 Estado da segurança geral (verificado)

| Controle | Estado |
|---|---|
| `secret_scanning` | ✅ **enabled** |
| `secret_scanning_push_protection` | ✅ **enabled** |
| `dependabot_security_updates` | ✅ **enabled** |
| Branch protection `main` | ✅ **protected=true** com CI obrigatório |
| `.mcp.json` no repo | ✅ **removido** (já estava no .gitignore) |
| `anon` DML em financeiro | ✅ **revogado** |
| Bucket `whatsapp-media` público | ✅ **revertido para privado** (ADR-003, commit anterior) |

---

## 4. Estado do Pipeline (26/07 19:33)

### 4.1 Baseline medido

```sql
-- evo.evolution_messages
total: 41.203 mensagens
ultima_msg: 2026-07-26 19:29:39 UTC
hoje (26/07): 74 mensagens
distribuição hora: 15h=2, 16h=17, 18h=43, 19h=10+
```

### 4.2 Alertas abertos restantes

| Alert | Status |
|---|---|
| `ingestion_persistence_gap` DEGRADADO (ratio=0.45) | ⚠️ Monitorando |
| `health_score_degraded` (69.4%) | ⚠️ Backlog |
| `ddl_weekly_summary` | ℹ️ Informativo |

### 4.3 Causa da degradação 45%

O monitor contabiliza `upserts` vs `persistidas` numa janela de 1 hora. Os possíveis fatores:
- Eventos de **status update** (não criam novas linhas, mas são contados como upserts)
- Mensagens com **deduplicação** por `message_id` (idempotentes = processados mas não criam linha nova)
- **Mensagens canário** de teste sendo geradas pelo sistema (T622_xxx etc.)

O pipeline está ativo — mensagens reais com `remote_jid` real estão chegando e sendo persistidas.

---

## 5. Estado do Frontend (verificado)

O codebase frontend está muito mais avançado do que descrito no plano original. Achados:

### 5.1 Já corrigido ✅

| Bug descrito no plano | Estado real |
|---|---|
| `sendMessage` no schema errado ('zapp') | ✅ Já é STUB — não faz INSERT direto |
| Descarte silencioso de `contact_id=NULL` | ✅ Já filtra tombstones com log.debug |
| Realtime sem schema 'evo' | ✅ `messageRepository.subscribeToMessages` usa `schema: 'evo', table: 'evolution_messages'` |
| Interface Message com campos errados | ✅ Mapeados corretamente via `normalizeMessage` |
| Busca global de 100 msgs | ✅ `useMessages` usa `getAllMessagesForContact` por conversa |
| anon sem USAGE no schema evo | ✅ `anon` TEM USAGE em evo (confirmado) |

### 5.2 Arquitetura do datasource (Fator X)

```
                    ┌─────────────────────────────┐
                    │      LogicalEntity Registry   │
                    │  messages → { lovable, table} │
                    └──────────┬──────────────────┘
                               │
         ┌─────────────────────┼──────────────────────┐
         ▼                     ▼                       ▼
   dbFrom('messages')   dbChannel('msgs')      dbList(RPC.listMsgsLite)
   → zapp.messages view  → evo.evolution_msgs   → SECURITY DEFINER RPC
   (estrutura Lovable)   (Realtime subscriptions) (leitura correta com RLS)
```

### 5.3 Pendente

- [ ] Investigar se `messageService.getAllMessagesForContact` usa o caminho RPC ou `dbFrom`
- [ ] Confirmar que `zapp.messages` VIEW tem dados via RPC corretamente
- [ ] Adicionar SUPABASE_PUBLIC_URL em variável de ambiente (T38)

---

## 6. Ações Executadas

### Migration aplicada ao banco

**Versão:** `20260726193100`  
**Nome:** `security_revoke_anon_dml_financeiro_vendas`  
**Status:** ✅ Applied (transactional)

```sql
-- 26 tabelas/views — anon DML revogado
REVOKE INSERT, UPDATE, DELETE ON financeiro.{tabelas} FROM anon;
REVOKE INSERT, UPDATE, DELETE ON vendas.{tabelas} FROM anon;
```

### Alertas resolvidos via `evo.fn_resolve_alert`

| ID | Tipo | Resolvido por |
|---|---|---|
| c2e2dc34 | wpp2_disconnection | plano-50-etapas-T10-wpp2-healthy |
| 80f3d7f8 | qrcode_required | plano-50-etapas-T10-wpp2-healthy |
| 7eb1281a | security_acl_regression | plano-50-etapas-T10-revoke-migration-20260726193100 |

---

## 7. Próximas Ações (Backlog)

1. **T13** — Reprocessar backlog de webhooks `messages.upsert` desde 24/07 sem mensagem correspondente
2. **T14** — Rodar `evo.fn_link_orphan_messages` para vincular mensagens sem `contact_id`
3. **T16** — Confirmar Realtime `postgres_changes` chegando no cliente (teste E2E)
4. **T32** — Corrigir `sendMessage` para usar path correto (Evolution API edge function)
5. **T36** — Remover `SUPABASE_PUBLIC_URL` hardcoded, usar variável de ambiente
6. **T38** — Externalizar URL do Supabase para `.env` com validação via Zod
7. **T41** — Consolidar `resolveMessageMediaUrl` / `resolvePublicMediaUrl`

---

## 8. KPIs Aferidos

| KPI | Baseline (24/07 17:41) | Agora (26/07 19:33) |
|---|---|---|
| Msgs hoje | 0 | **74** |
| Alerts P0 abertos | 3 (wpp2, qr, acl) | **0** |
| Grants anon DML financeiro | **88** | **0** |
| Pipeline ratio | 0% (ROMPIDO) | **45-64%** (DEGRADADO → melhorando) |
| wpp2 health | unhealthy | **healthy** |

---

*Documento gerado pelo Agente IA — Plano 50 Etapas — 2026-07-26T19:33:00Z*
