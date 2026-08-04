# SCHEMA SNAPSHOT — ZAPP-WEB

> **Snapshot do banco de dados de produção.**
> Gerado: 2026-08-04 | Instância: `https://supabase.atomicabr.com.br` (Self-Hosted)
> Para o estado de migrations vs DB, ver `docs/AUDIT_MIGRATION_VS_DB_50_STEPS.md`.

---

## Contagens por Schema (Live — 2026-08-04)

| Schema | Tabelas Físicas | Views | Funções | Policies RLS | Notas |
|--------|----------------|-------|---------|-------------|-------|
| **`zapp`** | **321** | **380** | **1.058** | **729** | Schema principal da aplicação |
| **`evo`** | **172** | — | — | 100% | Evolution API (WhatsApp) |
| `public` | 1 | 511 | — | — | `_wal_slot_guard_events` + 511 VIEW proxies |
| `auth` | 21 | — | — | — | Auth GoTrue do Supabase |
| `bpm` | 41 | — | — | — | BPM/workflows |
| `email_app` | 33 | — | — | — | Integração Gmail |
| `ai` | 31 | — | — | — | IA e embeddings |
| `archive` | 25 | — | — | — | Dados arquivados |
| `financeiro` | 16 | — | — | — | Módulo financeiro |
| `vendas` | 13 | — | — | — | Módulo vendas |
| `ops` | 20 | — | — | — | Operações internas |

---

## Saúde do Schema `zapp`

| Métrica | Valor | Estado |
|---------|-------|--------|
| Tabelas sem RLS (`rls_missing`) | **0** | ✅ Todas protegidas |
| Policies RLS ativas | 729 | ✅ |
| Funções totais | 1.058 | ✅ |
| Crons ativos | 146 | ✅ |
| Tabelas na publication `supabase_realtime` | 68 (todos schemas) | ✅ |

---

## Publication `supabase_realtime` — Tabelas Monitoradas (68 total)

A publication tem `publish_via_partition_root = true`. **Assinar sempre pela tabela raiz.**

### Schema `zapp` (confirmadas)
`agent_stats`, `app_notifications`, `audio_memes`, `audit_logs`, `calls`,
`dispatch_error_logs`, `evolution_sentiment_analysis`, `failed_messages`,
`payment_links` *(proxy financeiro)*, `qr_attempts`, `queue_members`,
`queue_positions`, `queues`, `sales_deals`, `sentiment_alerts`,
`talkx_campaigns`, `talkx_recipients`, `team_messages`, `user_settings`,
`warroom_alerts`, `whatsapp_connections`, `workspace_settings`

### Schema `evo` (raízes particionadas)
`evolution_messages` ← raiz (NÃO `evolution_messages_wpp2`)
`evolution_conversations` ← raiz (NÃO `evolution_conversations_wpp2`)

### Schema `email_app`
`email_accounts`, `email_threads`

### Schema `financeiro`
`payment_links` (tabela física)

> Para a lista completa das 68 tabelas, executar:
> ```sql
> SELECT schemaname, tablename FROM pg_publication_tables
> WHERE pubname = 'supabase_realtime'
> ORDER BY schemaname, tablename;
> ```

---

## Tabelas Principais do Schema `zapp` (com contagens)

| Tabela | Linhas | Tamanho | Notas |
|--------|--------|---------|-------|
| `empresas` | ~51.688 | — | Clientes/empresas |
| `webhook_audit_log` | ~58.232 | 19 MB | Log de webhooks |
| `webhook_events_processed` | ~58.076 | 31 MB | Eventos processados |
| `app_notifications` | ~14.283 | — | Notificações push/in-app |
| `audit_logs` | ~4.356 | — | Auditoria de ações |
| `profiles` | 17 | — | Usuários internos |
| `workspace_members` | 15 | — | Membros por workspace |
| `user_roles` | 14 | — | Permissões |
| `instance_registry` | 23 | — | Instâncias registradas |
| `whatsapp_connections` | 3 | — | Conexões WA ativas |

---

## Tabelas Principais do Schema `evo`

| Tabela | Linhas | Tamanho | Notas |
|--------|--------|---------|-------|
| `evolution_contacts` | ~20.563 | 18 MB | Contatos WhatsApp |
| `evolution_media` | ~23.366 | 10 MB | Mídias |
| `evolution_whatsapp_status` | ~14.789 | 10 MB | Status WA |
| `evolution_messages` | particionada | — | Raiz (25 partições por instância) |
| `evolution_conversations` | particionada | — | Raiz (25 partições por instância) |

**Partições de `evolution_messages`:**
`wpp2`, `wpp2_archive`, `artes`, `comercial_01`–`comercial_15`,
`compras`, `default`, `financeiro`, `gravacao`, `logistica`, `marketing`

---

## Storage Buckets (13 buckets em produção)

| Bucket | Público | Limite | Notas |
|--------|---------|--------|-------|
| `audio-memes` | não | 5 MB | |
| `audio-messages` | **sim** | — | PTTs WA. `allowed_mime_types: [ogg,webm,mpeg,mp3,aac,mp4]`. BUG-38 resolvido. |
| `avatars` | sim | 5 MB | |
| `comprovantes-financeiro` | não | 20 MB | |
| `custom-emojis` | sim | 512 KB | |
| `email-attachments` | não | — | |
| `etiquetas-remessa` | não | 10 MB | |
| `fechamentos` | não | 20 MB | |
| `quarantine` | não | — | |
| `recibos-entrega` | sim | 10 MB | |
| `stickers` | sim | 512 KB | |
| `team-chat-files` | não | — | |
| `whatsapp-media` | não | — | |

---

## Nota sobre SECDEF sem `search_path`

A query de auditoria de 2026-08-04 retornou `secdef_no_searchpath = 600`. Este número
inclui funções SECDEF em **todos os schemas** (`bpm`, `ai`, `email_app`, `vendas`, `ops`, etc.)
que usam `search_path` diferente de `search_path=zapp`. A query anterior (sessão 2026-07-17)
retornou `0` porque usava predicado `proconfig @> ARRAY['search_path=zapp']` — contando apenas
funções SEM `search_path=zapp` especificamente, o que excluía funções em outros schemas com
seus próprios search_path válidos.

**Ação:** O Etapa 14 do plano `AUDIT_MIGRATION_VS_DB_50_STEPS.md` cobre a auditoria
detalhada de funções SECDEF por schema. Executar query discriminada por schema antes de agir.

---

## GAP Crítico de Migrations vs DB (GAP-S1)

O schema `zapp` tem **321 tabelas físicas** mas a migration canônica
`20260804000000_canonical_schema.sql` só cria ~12 explicitamente.
As demais 309 tabelas preexistem ao sistema de migrations.

**Solução:** Gerar `supabase/ci/baseline-schema-2026-08-04.sql` via `pg_dump` da instância
de produção para garantir restore completo. Ver Etapa 1 do plano `AUDIT_MIGRATION_VS_DB_50_STEPS.md`.

```bash
# Comando de geração (requer acesso SSH ao VPS)
pg_dump \
  --schema-only \
  --no-owner \
  --no-acl \
  -n zapp -n evo -n bpm -n email_app -n ai -n archive \
  -n financeiro -n vendas -n ops \
  postgresql://postgres:SENHA@localhost:5432/postgres \
  > supabase/ci/baseline-schema-2026-08-04.sql
```

---

*Última atualização: 2026-08-04 | Próxima revisão recomendada: 2026-09-01*
