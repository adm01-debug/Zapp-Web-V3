# Contrato de Schemas (normativo)

> Define, por schema: **dono**, o que **pode** conter, o que **não pode**, e a direção de dependência.
> Qualquer objeto novo precisa respeitar este contrato. Violações devem falhar no CI (etapa 50 do plano).

## Direção de dependência

```
public (API)  ──▶  zapp / evo / domínios  ──▶  (dados)
     zapp  ──▶  evo   (SOMENTE via contrato curado de views/RPC)
     evo   ──✗──▶  zapp   (PROIBIDO: Evolution nunca depende do app)
```

## Contratos por schema

### `evo` — Domínio: Integração Evolution/WhatsApp
- **Dono:** time de integração WhatsApp.
- **Contém:** tabelas `evolution_*` e suas partições, `contact_id_graveyard`, funções de pipeline/partição da Evolution.
- **NÃO contém:** ferramental de ops/observabilidade; lógica de produto do app.
- ⚠️ **Fora do lugar hoje (a repatriar para `ops`):** `vps_comments`, `vps_diagnostic_runs`, `vps_etapas`, `vps_performance_snapshots`, `vps_scenario_status`, `vps_scenarios`, `vps_status_history`, `ops_runbooks`, `migration_watermark`, `_secure_config`, `idx_usage_audit`, `_snapshot_version_state` (+ funções `fn_vps_*`).

### `zapp` — Domínio: Produto (App ZAPP Web)
- **Dono:** time do app.
- **Contém:** tabelas do app (`profiles`, `empresas`, `user_roles`, `webhook_*`, etc.), RPCs (`rpc_*`), lógica de produto.
- **NÃO contém:** cópias de tabelas do `evo` como tabela base (só **contrato curado** de views).
- ⚠️ **Ponto de atenção:** hoje há 254 views espelhando o `evo` e ~30 funções `zapp.fn_*` que operam o pipeline WhatsApp. A fronteira app↔integração precisa de decisão formal (ADR-DB-002).

### `public` — Camada de API (PostgREST)
- **Dono:** plataforma/API.
- **Contém:** SOMENTE **views `security_invoker`** e **funções RPC** de contrato.
- **NÃO contém:** tabela com dado de negócio; extensão; lógica nova.
- ⚠️ **Fora do lugar hoje:** 1 tabela base (`_wal_slot_guard_events` → mover para `ops`) e 9 extensões (`amcheck`, `btree_gin`, `dblink`, `hypopg`, `index_advisor`, `pg_buffercache`, `pg_trgm`, `unaccent`, `vector` → mover para `extensions`).

### Domínios de negócio: `bpm`, `vendas`, `financeiro`, `email_app`, `ai`, `logistica`, `artes`
- **Contém:** cada módulo, isolado no seu schema.
- **NÃO contém:** objetos de outro módulo. Um módulo consome outro apenas via contrato explícito.

### Infra/Observabilidade: `ops`, `monitoring`
- **Contém:** crons de infra, auditoria (`ddl_audit`), guardrails, saúde, sentinelas de backup.
- **NÃO contém:** dado de negócio.

### Frio: `archive`, `_backups`
- **Contém:** backups datados (`*_backup_YYYYMMDD`), tabelas depreciadas.
- **NÃO contém:** objeto vivo em uso pelo app.

### Plataforma (não tocar): `auth`, `storage`, `realtime`, `_realtime`, `vault`, `pgsodium`, `net`, `graphql`, `extensions`, `cron`, `pgmq`, `supabase_*`.

## Storage (buckets) — contrato de visibilidade

| Regra | Situação (27/07) |
|---|---|
| Mídia de cliente e comprovantes → **privado** (URL assinada) | ⚠️ `whatsapp-media` está **público** (5.088 obj / 9,56 GB) e `recibos-entrega` **público** — corrigir |
| Assets genéricos (avatars, stickers, emojis) → público é aceitável | `avatars`, `audio-memes`, `custom-emojis`, `stickers` |
| Financeiro/anexos/etiquetas → **privado** | ✓ `comprovantes-financeiro`, `email-attachments`, `etiquetas-remessa`, `fechamentos`, `audio-messages`, `team-chat-files`, `quarantine` |
