# Relatório de Discrepâncias — Schemas Zod × types.ts × Código
_Gerado em 2026-07-08 · base: banco Lovable Cloud (146 tabelas + 6 views)._

## Sumário
- **32 tabelas fantasma** referenciadas em `src/` que **não existem** no banco.
- **90 arquivos** afetados por pelo menos uma referência fantasma.
- **3 tabelas críticas** com colunas fantasma bloqueando saneamento do `@ts-nocheck`.
- `src/integrations/supabase/types.ts` está sincronizado com o banco — as
  discrepâncias vêm do **código**, não dos tipos.

## Metodologia
1. `SELECT table_name FROM information_schema.tables WHERE table_schema='public'`
   → 146 tabelas base + views.
2. `rg "\.from\('([a-z_]+)'"` em `src/` → 157 referências únicas.
3. `comm -23 usadas db` → 32 fantasmas.
4. Para tabelas reais com uso suspeito, `information_schema.columns` valida colunas.

---

## 1. Tabelas fantasma (ordenadas por impacto)

| # refs | Tabela                          | Categoria                       | Ação recomendada |
|-------:|---------------------------------|---------------------------------|------------------|
| 19     | `evolution_messages`            | DB externo Fator X              | Manter via `USE_EXTERNAL_DB` (ver `mem://database/migration/external-fator-x-transition`). Adicionar guard em runtime. |
| 7      | `evolution_contacts`            | DB externo Fator X / obsoleta   | Migrar `useChatMediaSending.ts` para `contacts` (chave: `phone`). |
| 4      | `automation_executions`         | Nunca criada                    | Criar migration OU remover UI de logs. |
| 4      | `contact_emails`                | Normalizada mas não migrada     | Usar `contacts.email` (coluna existente). |
| 4      | `contact_phones`                | Normalizada mas não migrada     | Usar `contacts.phone` + `contacts.phone_variants`. |
| 4      | `salespeople`                   | Feature abandonada              | Remover código de teste. |
| 3      | `conversation_audit_logs`       | Nunca criada                    | Usar `audit_logs` genérica com `entity_type='conversation'`. |
| 3      | `hmac_selftest_audit`           | Nunca criada                    | Criar migration se o painel `/admin/webhook-secret-status` for mantido. |
| 3      | `provider_message_log`          | Renomeada                       | Substituir por `dispatch_error_logs` + `messages`. |
| 2      | `service_channels`              | Renomeada                       | Substituir por `channel_connections` (view: `channel_connections_safe`). |
| 2      | `evolution_conversations`       | DB externo Fator X              | Manter em modo externo apenas. |
| 2      | `sla_delivery_rules`            | Nunca criada                    | Consolidar em `sla_rules` + `conversation_sla`. |
| 2      | `system_connections`, `email_drafts`, `email_revalidation_jobs`, `avatars` | Nunca criadas | Remover ou criar migration. |
| 1 cada | `sla_history`, `sla_alert_preferences`, `sla_delivery_violations`, `outbound_delivery_audit`, `media_cache`, `stress_test_runs`, `stress_test_metrics`, `sts_troubleshooting_report`, `dev_diagnostic_logs`, `app_settings`, `email_signatures`, `whisper_files`, `team_message_reactions`, `evolution_send_idempotency`, `evolution_instances_public`, `provider_configs` | Órfãs / obsoletas | Auditoria individual — a maioria pode ser removida. |

## 2. Colunas fantasma em tabelas reais

### `public.automations` (12 colunas reais)
Colunas usadas no código **e ausentes** no banco:
- `priority`
- `cooldown_seconds`
- `channel_id`
- `department_id`

Impacto: `src/hooks/admin/useAdminAutomations.ts` (interface `Rule`, `save()`,
`adjustPriority()`). Correção: migration que adicione as 4 colunas OU remover
os campos da UI. Recomendado: **remover `adjustPriority` e ordenar por `name`**
(comportamento já implementado no fallback atual).

### `public.team_messages` (11 colunas reais)
Coluna usada e ausente:
- `status` (esperado 'sent'|'delivered'|'read')

Impacto: `useTeamChatMutations.ts`. Correção: migration `ALTER TABLE team_messages ADD COLUMN status text DEFAULT 'sent'` — coluna barata e usada por UI de receipts.

### `public.departments` (9 colunas reais)
Coluna usada e ausente:
- `department_id` (auto-referência, provavelmente confusão semântica)

Impacto: código genérico de admin. Correção: refatorar callers para usar `id`.

## 3. Cobertura Zod atual

`src/shared/webhookEventSchemas.ts` cobre:
- ✅ Envelope Realtime (INSERT/UPDATE/DELETE) — `RealtimeEventEnvelopeSchema`
- ✅ Rows tolerantes a `null` para: `messages`, `contacts`, `whatsapp_connections`, `notifications`
- ✅ Payloads inbound: Evolution v1/v2, WhatsApp Cloud (Meta), Gmail Pub/Sub

**Gaps identificados:**
- ❌ `conversation_events`, `conversation_transfers`, `csat_surveys`, `nps_surveys`
  não têm schema Zod — chegam via Realtime e são consumidos sem validação.
- ❌ Payloads de `team_messages` (whisper) sem schema.
- ❌ Payloads de `email_messages` inbound (Gmail push) só validam envelope, não conteúdo.

`supabase/functions/_shared/webhook-schemas.ts` cobre Evolution + Meta no lado
Edge, mas nenhum handler frontend usa `safeParseEvent()` — validação está
apenas na borda de rede, não na borda de UI.

## 4. Plano de correção priorizado

| Prioridade | Ação | Custo | Risco |
|-----------|------|------:|------:|
| P0 | Aplicar `safeParseEvent()` nos handlers Realtime de `messages` e `notifications` | 2h | baixo |
| P0 | Migrar `useChatMediaSending.ts` de `evolution_contacts` → `contacts` | 1h | médio (fluxo crítico de envio) |
| P1 | Migration `ALTER TABLE team_messages ADD COLUMN status` | 15min | baixo |
| P1 | Migration `ALTER TABLE automations ADD COLUMN priority, cooldown_seconds, channel_id, department_id` **OU** simplificar UI | 30min | baixo |
| P2 | Substituir `service_channels` → `channel_connections` (2 arquivos) | 30min | baixo |
| P2 | Substituir `conversation_audit_logs` → `audit_logs` filtrado (3 arquivos) | 1h | baixo |
| P3 | Schemas Zod para `conversation_events`, `conversation_transfers`, `csat_surveys` | 2h | baixo |
| P3 | Remover código órfão de `salespeople`, `stress_test_*`, `sts_troubleshooting_report`, `dev_diagnostic_logs` | 1h | nenhum |

## 5. Como regenerar este relatório
```bash
# lista tabelas usadas no código
rg -oIN "\.from\(\s*['\"]([a-z][a-z0-9_]*)['\"]" -r '$1' src/ -t ts -t tsx | sort -u > /tmp/used.txt
# lista tabelas do banco
psql -c "SELECT table_name FROM information_schema.tables WHERE table_schema='public'" -tA | sort > /tmp/db.txt
comm -23 /tmp/used.txt /tmp/db.txt  # tabelas fantasma
```

---

## Atualizações — 2026-07-08 (sessão safeParseEvent + audit_logs)

**Concluído nesta sessão:**

- ✅ `safeParseEvent` aplicado em `useZappMessages` (Realtime `evolution_messages` INSERT/UPDATE), `useWarRoomAlerts` (INSERT `warroom_alerts`) e `useSLANotifications` (INSERT/UPDATE `conversation_sla`). Payloads inválidos são descartados com log em vez de propagar.
- ✅ Novos schemas Zod: `warRoomAlertRowSchema`, `conversationSlaRowSchema`, `evolutionMessageRowSchema`. Cobertos por 9 novos testes (missing/null/UUID inválido).
- ✅ Regressão SLA: `src/features/sla/hooks/__tests__/useSLANotifications.test.tsx` (4 casos: happy path, missing id, contact_id null, sem breach).
- ✅ `conversation_audit_logs` → `audit_logs` (entity_type='conversation', entity_id=<conversationId>, details={...}) em `messageSender.ts`, `externalMessageSender.ts` e leitura em `TicketHistorySheet.tsx`. `describeAudit` retrocompatível lê `action || event_type` e `details.*`. Teste de regressão em `TicketHistorySheet.audit-mapping.test.ts` garante que ninguém volte a chamar `.from('conversation_audit_logs')`.
- ✅ P3 órfão removido: `src/pages/admin/AdminStressTestPage.tsx` + rota `/admin/stress-test` deletados (dependiam de `stress_test_runs`/`stress_test_metrics`, tabelas inexistentes).

**Adiado (não removido nesta sessão):**

- `salespeople` — vive no **DB externo Fator X** (`getExternalSupabase`), não no schema Supabase Lovable Cloud. Ainda em uso ativo via `useExternalCargos` + aba CRM 360 “Vendedores”. Remoção exige plano separado com o time de dados; permanece no relatório apenas como referência.
