> **📜 DOCUMENTO HISTÓRICO** — Reflete o estado do sistema na data indicada. A arquitetura atual usa um único Supabase Self-Hosted com schema `zapp`. Veja [SCHEMA_REFERENCE.md](docs/SCHEMA_REFERENCE.md).

# Auditoria de Paridade — Lovable Cloud → Supabase Self-Hosted (schema `zapp` e correlatos)

**Data:** 2026-07-04
**Origem auditada:** Lovable Cloud — projeto **ZAPP WEB - V3** (`22c0b518-7895-4f4f-9ea0-978457a2c37a`, Supabase ref `allrjhkpuscmgbsnmjlv`)
**Destino auditado:** Supabase self-hosted (`supabase.atomicabr.com.br`)
**Método:** comparação objeto-a-objeto via MCPs (Lovable, Supabase self-hosted, Portainer) — tabelas, colunas, functions, triggers, enums, views, RLS/policies, cron jobs, edge functions, storage buckets, extensões, secrets e volumetria de dados.

---

## Veredito

**A importação está essencialmente completa (~99%).** Todos os objetos estruturais do Lovable Cloud existem no self-hosted — nenhuma tabela, coluna, function, enum, view, bucket, extensão, cron job ou edge function está faltando. Os gaps encontrados são pontuais: **8 triggers funcionais não religados** (as functions existem, mas não estão vinculadas às tabelas) e **secrets não provisionados no container de edge functions** — este último é o item mais crítico.

Ponto de arquitetura importante: o self-hosted **não é uma cópia 1:1** — o schema monolítico `public` do Lovable foi **deliberadamente decomposto** em múltiplos schemas (`zapp`, `ai`, `email_app`, `evo`, `financeiro`, `vendas`, `bpm`, `ops`, `archive`), e o `public` do self-hosted mantém **views de compatibilidade** com os nomes originais. Além disso, a direção dos dados se inverteu: o Lovable Cloud está vazio (0 contatos, 0 mensagens) e configurado com `USE_EXTERNAL_ONLY` + `EXTERNAL_SUPABASE_*` apontando para o VPS — **o self-hosted é a produção** (20.056 contatos, 1.836.662 mensagens).

---

## 1. Tabelas — ✅ 146/146 cobertas

| Métrica | Resultado |
|---|---|
| Tabelas no Lovable (`public`) | 146 |
| Encontradas como tabela física no self-hosted | 144 |
| Convertidas em views de compatibilidade (intencional) | 2 (`contacts`, `messages`) |
| Tabelas faltando | **0** |
| Tabelas com MENOS colunas que no Lovable | **0** |

Distribuição das 144 tabelas físicas no self-hosted: **zapp: 82**, public: 44, email_app: 7, ai: 6, evo: 3, financeiro: 1 (`payment_links`), vendas: 1 (`products`).

- `public.contacts` → view sobre `evo.evolution_contacts` (com triggers INSTEAD OF insert/update/delete).
- `public.messages` → view sobre `evo.evolution_messages` (com triggers INSTEAD OF). `zapp.messages` também é view de compatibilidade.
- O schema `zapp` tem 148 tabelas (82 vindas do Lovable + 66 criadas localmente, ex.: `agent_memories`, `conversation_threads`, `contact_phones`, `media_*`, `outbound_message_queue`, `provider_*`).
- Toda tabela comum tem **colunas iguais ou a mais** no self-hosted (ex.: `instance_registry` 43→45, `profiles` 24→25, `user_settings` 35→36).

## 2. Functions, Enums e Views — ✅ 100%

- **Functions:** 93/93 nomes do Lovable presentes no self-hosted (que tem 1.047 functions no total nos schemas de aplicação). Faltantes: **0**.
- **Enums:** 4/4 (`ai_provider_type`, `app_role`, `channel_type`, `service_account_type`). Self-hosted tem 17 no total.
- **Views:** 10/10 do Lovable presentes (`channel_connections_safe`, `departments_safe`, `gmail_accounts_safe`, `password_reset_requests_safe`, `profiles_public`, `v_pending_transfers`, `whatsapp_connections_agent/public/safe`, `whatsapp_official_credentials_safe`). Self-hosted tem 573 views no total.

## 3. Triggers — ⚠️ 66/74 equivalentes; 8 gaps funcionais

Dos 74 triggers do Lovable, a grande maioria existe com **nome trocado** (`update_X_updated_at` → `set_updated_at`, função `handle_updated_at`) — equivalência funcional confirmada tabela a tabela. Os gaps reais (function existe no banco, mas o trigger **não está ligado**):

| # | Trigger Lovable | Tabela destino | Impacto |
|---|---|---|---|
| 1 | `sanitize_reset_request_trigger` | `public.password_reset_requests` | **Segurança** — sanitização de dados do request não roda |
| 2 | `trg_rate_limit_reset` | `public.password_reset_requests` | **Segurança** — rate-limit de reset de senha não roda no banco |
| 3 | `on_contact_created_auto_assign` + `on_contact_queue_auto_assign` | `evo.evolution_contacts` | Auto-atribuição de contatos a agentes/filas não ocorre via trigger |
| 4 | `trg_log_assignment_change` | `evo.evolution_contacts` | Auditoria de mudança de atribuição ausente |
| 5 | `on_agent_stats_update_level` / `update_level_on_xp_change` | `zapp.agent_stats` | Gamificação — nível não recalcula ao ganhar XP |
| 6 | `on_profile_created_init_stats` | `public.profiles` | `agent_stats` não é inicializado ao criar perfil |
| 7 | `ensure_single_default_filter_trigger` | `public.saved_filters` | Pode haver mais de um filtro default por usuário |
| 8 | `trg_sicoob_reply` (fn `notify_sicoob_on_reply`) | `messages` | Integração Sicoob — notificação de resposta não dispara via banco (existe a edge function `sicoob-bridge-reply` como caminho alternativo) |

Menores: `user_devices` sem triggers de `last_seen`; `user_roles.audit_user_role_changes` ausente (mas `tr_log_role_changes`/`on_role_change` cobre o log). Em `evo.evolution_contacts`, `trg_normalize_contact_phone` foi substituído por `trg_extract_phone` (equivalente).

## 4. Cron jobs — ✅

O Lovable tem **1 único job**: `purge_query_telemetry_daily` (`0 3 * * *`) → **existe no self-hosted** (jobid 86, idêntico). O self-hosted tem 49 jobs ativos no total (dispatch de outbound, health checks, purges, reconcile, partições etc.) — todos adicionais, nenhum regressivo.

## 5. Edge Functions — ✅ 109/109 (+7 extras)

- Repositório (espelho do Lovable): 109 functions → **todas presentes** em `/home/deno/functions` do container `supabase_functions` (edge-runtime v1.71.2, running).
- Extras só no self-hosted: `audio-transcribe`, `evolution-bitrix-sync`, `evolution-chatbot`, `evolution-followup`, `evolution-sender`, `evolution-sentiment`, `evolution-templates`.

## 6. Storage e Extensões — ✅

- **Buckets:** 7/7 do Lovable presentes com mesma visibilidade (`audio-memes`, `audio-messages`, `avatars`, `custom-emojis`, `stickers`, `team-chat-files`, `whatsapp-media`). Self-hosted tem 9 buckets adicionais (`quarantine`, `email-attachments`, financeiro etc.).
- **Extensões:** 8/8 do Lovable presentes (`pg_cron`, `pg_net`, `pg_stat_statements`, `pg_trgm`, `pgcrypto`, `plpgsql`, `supabase_vault`, `uuid-ossp`) + 12 extras (`vector`, `pgmq`, `hypopg`, `index_advisor`, `pgsodium` etc.).

## 7. RLS / Policies — ✅ habilitado em 100%, ⚠️ modelo simplificado

Todas as 144 tabelas migradas têm **RLS habilitado e ≥1 policy**. Porém o modelo foi consolidado: o Lovable tinha ~370 policies granulares (média 2,5/tabela, muitas com regras por papel admin/supervisor/agente), enquanto no self-hosted a maioria das tabelas tem 2 policies genéricas. **Recomendação:** revisão semântica por amostragem nas tabelas sensíveis (`profiles`, `user_roles`, `whatsapp_official_credentials`, `password_reset_requests`, `gmail_accounts`) para confirmar que as policies consolidadas mantêm as restrições por papel do Lovable.

## 8. Secrets / Env do edge-runtime — 🔴 item mais crítico

O Lovable tem 16 secrets (5 preenchidos de verdade: `EVOLUTION_API_KEY`, `EVOLUTION_API_URL`, `EXTERNAL_SUPABASE_SERVICE_ROLE_KEY`, `LOVABLE_API_KEY`, `USE_EXTERNAL_ONLY`). O container `supabase_functions` do VPS expõe **apenas 6 variáveis**:

```
PROMOGIFTS_SUPABASE_ANON_KEY, PROMOGIFTS_SUPABASE_URL,
SUPABASE_URL, SUPABASE_ANON_KEY, VERIFY_JWT, WEBHOOK_SECRET
```

Faltam no ambiente do edge-runtime (a menos que as functions leiam do Vault do banco): `SUPABASE_SERVICE_ROLE_KEY`, `JWT_SECRET`, `EVOLUTION_API_KEY/URL`, `LOVABLE_API_KEY` (gateway de IA), `RESEND_API_KEY`, `GOOGLE_CLIENT_ID/SECRET/REDIRECT_URI`, `ELEVENLABS_*`, `MAPBOX_PUBLIC_TOKEN`, `SIP_PASSWORD`. Sem `SUPABASE_SERVICE_ROLE_KEY`, qualquer function que use service-role client falha; sem `JWT_SECRET`, `VERIFY_JWT=true` rejeitaria tudo. **Ação: provisionar os secrets no stack do edge-runtime (Portainer) ou confirmar que há mecanismo alternativo (Vault) em uso.**

## 9. Dados — direção invertida (esperado)

| Tabela | Lovable Cloud | Self-hosted |
|---|---:|---:|
| profiles | 3 | 17 |
| contacts | 0 | 20.056 |
| messages | 0 | 1.836.662 |
| whatsapp_connections | 0 | 2 |
| stickers / audio_memes | 0 / 0 | 228 / 20 |
| user_roles | 7 | 15 |

O Lovable é hoje só o frontend/build; o banco de produção é o VPS. Nada a migrar de dados do Lovable → VPS.

## 10. Infraestrutura observada (Portainer)

Stack Supabase completo e saudável: db (postgres 15.8), kong, auth (gotrue), rest (postgrest), realtime, storage+imgproxy, functions (edge-runtime), studio, analytics (logflare), vector, supavisor, meta — todos `running`. Guards adicionais: `schema-drift-guard`, `zapp-health-guard`, `supabase-backup` (+ backups daily/weekly/monthly S3), `dlq-inspector`. O schema `parity_audit` (`zapp_manifest`, `execution_log`) indica rastreamento contínuo de paridade pela equipe.

---

## Plano de ação recomendado (prioridade)

1. **[ALTA] Provisionar secrets no edge-runtime** (§8) — ou documentar/confirmar o mecanismo de Vault.
2. **[ALTA] Religar os 2 triggers de segurança de `password_reset_requests`** (sanitize + rate-limit).
3. **[MÉDIA] Religar auto-assign/log de atribuição em `evo.evolution_contacts`** — ou confirmar que a atribuição agora é feita pelo pipeline evo/edge functions.
4. **[MÉDIA] Revisão semântica das policies consolidadas** nas 5 tabelas sensíveis (§7).
5. **[BAIXA] Religar triggers de gamificação (`agent_stats`), `saved_filters` default único, `user_devices.last_seen`, `init_agent_stats` em profiles e `trg_sicoob_reply`** — conforme relevância de cada feature.
