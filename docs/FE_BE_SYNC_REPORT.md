# Relatório de Sincronismo Frontend ↔ Backend (camada de banco)

> **Arquitetura atual**: Supabase Self-Hosted (`supabase.atomicabr.com.br`), schema `zapp`. Veja [SCHEMA_REFERENCE.md](SCHEMA_REFERENCE.md).


> Auditoria focada em verificar se **toda chamada do frontend ao Supabase** (`rpc()` e `.from()`) tem uma **definição correspondente** em `supabase/migrations`. Complementa o `check-edge-function-sync.sh` (que cobre apenas Edge Functions).

## Sumário executivo

| Categoria | Qtde | Efeito |
|---|---:|---|
| RPCs chamadas sem `CREATE FUNCTION` em migrations | 22 | App chama função inexistente → erro em runtime |
| Tabelas/views usadas sem definição em migrations | 14 | `.from()` falha / feature quebra silenciosamente |
| Migration com `ALTER FUNCTION` sem `CREATE` | 1 | Quebra `supabase db reset` |
| Artefato de build versionado (`.dist-backups/`) | ~100 MB | Repositório inchado (5.521 arquivos) |

A causa-raiz do mascaramento é sistêmica: casts como `(supabase as any).from(...)` e `.rpc(... as never)` **enganam o TypeScript**, então o `typecheck` não pega. O guard deste PR pega no nível de string literal, como o check de Edge Functions já faz.

## Metodologia

Cruzamento estático: extração de todos os `.rpc('x')` / `.from('y')` em `src/**/*.ts(x)` vs. todos os `CREATE FUNCTION|TABLE|VIEW|MATERIALIZED VIEW` em `supabase/migrations`, `supabase/fatorx-migrations` e `supabase/migrations-from-lovable`. Falsos-positivos foram eliminados manualmente em call-level:

- **Buckets de Storage** (`storage.from('bucket')`) — não são tabelas. Excluídos.
- **Bancos externos** (`externalClient.ts` → FATOR X; `zappweb/supabaseClient.ts`) — relações/RPCs que legitimamente não têm migration neste repo. Listados em `scripts/.sync-ignore`.
- **`CREATE OR REPLACE VIEW`** e views já existentes — contadas como definidas.

## [A] RPCs órfãs (22)

Bloco de e-mail (maior ofensor): `rpc_email_archive_thread`, `rpc_email_assign_thread`, `rpc_email_search_threads`, `rpc_email_star_thread`, `rpc_email_top_contacts`, `rpc_email_tracking_stats`, `rpc_get_email_health_summary`, `rpc_log_email_health`, `rpc_update_email_health_state`, `get_own_email_accounts`.

Outras: `fn_test_alert_channel`, `get_contact_conversations`, `get_contact_notes`, `get_csat_stats`, `get_platform_health`, `get_sla_dashboard`, `mark_follow_up_done`, `rpc_search_insights`, `rpc_upsert_whatsapp_provider`, `smart_assign_conversation`, `rpc_log_search_event`, `rpc_record_search_click`.

## [B] Tabelas/views órfãs (14)

`agent_presence`, `agents`, `email_contact_scores`, `email_daily_metrics`, `email_drafts`, `email_health_summary`, `email_revalidation_jobs`, `email_signatures`, `email_tracked_links`, `email_tracked_messages`, `email_tracking_events`, `v_alerts_active`, `v_email_sla_dashboard`, `v_webhook_health`.

## [C] Migration quebrada

`supabase/migrations/20260506203453_23197100-f6ed-46dc-b9d2-8bd980c06f6c.sql` faz `ALTER FUNCTION` em 4 funções nunca criadas neste repo (`rpc_record_search_click`, `rpc_log_search_event`, `match_kb_chunks`, `search_knowledge_base_rag`). Num banco limpo isso aborta com *function ... does not exist* — ou seja, o schema **não é reproduzível do zero** hoje.

## Confirmação (não é drift)

Exonerados após verificação call-level: buckets de Storage (`avatars`, `stickers`, `audio-memes`, `audio-messages`, `custom-emojis`, `team-chat-files`, `whatsapp-media`, `chat-media`); relações/RPCs de FATOR X e zappweb (ver `.sync-ignore`); e views já definidas (`whatsapp_official_credentials_safe`, `sts_performance_metrics`, `sts_troubleshooting_report`).

---

## Anexo — Verificação ao vivo via MCP (2026-07-01)

> Consulta aos bancos reais via MCP, **somente leitura** (introspecção). Nenhuma alteração foi feita em nenhum banco.

### Achado crítico: divergência entre múltiplos bancos

| Referência no repo | Onde | Situação verificada |
|---|---|---|
| `config.toml` → `allrjhkpuscmgbsnmjlv` | Cloud (Lovable original) | **Inacessível** ("no permission"). Provável source-of-truth das migrations. |
| `.env.example` → `supabase.atomicabr.com.br` | Self-hosted (PG 15.8, 7 GB) | Acessível. **NÃO tem** as tabelas core do app. |
| `.env.example` → `pgxfvjmuubtbowutlide.supabase.co` | Cloud externo | Client separado (`externalClient`/`zappweb`). |

O banco self-hosted (para onde o frontend aponta em produção) tem **125 tabelas / 541 views / 940 funções**, mas **não possui** `inbox_conversations`, `chat_messages`, `contacts` nem `evolution_instances`. Em vez disso, contém um domínio de negócio diferente misturado (logística/cotações: `cotacoes`, `cotacao_eventos`, `transportadoras`, `colaboradores`, `empresas`, `solicitacoes_vale`, `supplier_pix_keys`). É uma instância **compartilhada/diferente**, não o banco 1:1 das migrations.

**Consequência:** não é seguro gerar migrations de reconciliação automaticamente. O banco que corresponde às migrations está inacessível; gerar DDL do banco errado injetaria SQL incorreto. **Ação necessária:** confirmar o banco autoritativo e fornecer `supabase db dump --schema public`.

### Drift confirmada no banco atual

Das 24 funções ausentes das migrations, **14 existem** no banco atual; **10 não existem em nenhum banco acessível** (features provavelmente quebradas): `get_contact_conversations`, `get_contact_notes`, `get_csat_stats`, `get_platform_health`, `get_sla_dashboard`, `mark_follow_up_done`, `match_kb_chunks`, `rpc_upsert_whatsapp_provider`, `search_knowledge_base_rag`, `smart_assign_conversation`. Relações ausentes em todos: `email_daily_metrics`, `v_email_sla_dashboard`. As demais são drift de versionamento (existem no banco, faltam nas migrations).

## Pendências (requerem decisão/acesso do time)

1. Confirmar o banco autoritativo e reconciliar migrations ↔ banco (dump necessário).
2. Implementar (ou remover do frontend) as 10 funções + 2 relações genuinamente ausentes.
3. Corrigir a migration quebrada `20260506203453_*.sql`.
4. Resolver a divergência de ambiente: o frontend aponta para um banco sem as tabelas core.
