# Auditoria — Triggers em `zapp.whatsapp_connections` (F6-11)

- **Data:** 2026-08-02
- **Origem:** Achado F6-11 (docs/audits/INDICE_ACHADOS.md, docs/audits/PLANO_IMPLEMENTACAO_100.md)
- **Escopo desta auditoria:** apenas **documentar** os 6 triggers e as duplicatas. **NENHUM trigger foi dropado** (decisão de execução segue o plano).
- **Fonte:** banco vivo via Supabase MCP (role `postgres`, PG 15.8) + migrations do repo.

## Resumo executivo

| # | Trigger | Timing | Função vinculada (tgfoid) | Classificação |
|---|---------|--------|---------------------------|---------------|
| 1 | `clear_qr_on_connect_trigger` | BEFORE UPDATE | `zapp.clear_qr_on_connect()` | **Duplicata** (par A — antiga/incompleta) |
| 2 | `trg_clear_qr_connect` | BEFORE UPDATE | `zapp.fn_clear_qr_on_connect()` | **Duplicata** (par A — nova/completa) |
| 3 | `trg_log_whatsapp_connection_state_change` | AFTER UPDATE OF status | `zapp.fn_log_whatsapp_connection_state_change()` | Único |
| 4 | `trg_validate_whatsapp_connection_url` | BEFORE INSERT OR UPDATE OF api_url | `zapp.fn_validate_whatsapp_connection_url()` | Único |
| 5 | `trg_wconn_updated_at` | BEFORE UPDATE | `zapp.fn_wconn_updated_at()` | **Duplicata** (par B) |
| 6 | `update_whatsapp_connections_updated_at` | BEFORE UPDATE | `zapp.update_updated_at_column()` | **Duplicata** (par B) |

**6 triggers → 4 duplicatas (2 pares) + 2 únicos.** Todos `ENABLED` (`tgenabled='O'`), nenhum internal.

> ⚠️ **Ordem de disparo (mesmo timing, BEFORE UPDATE):** triggers disparam em ordem alfabética por nome:
> `clear_qr_on_connect_trigger` → `trg_clear_qr_connect` → `trg_wconn_updated_at` → `update_whatsapp_connections_updated_at`.

## Trigger a trigger

### 1. `clear_qr_on_connect_trigger` — DUPLICATA (par A, versão antiga)

```sql
CREATE TRIGGER clear_qr_on_connect_trigger BEFORE UPDATE ON zapp.whatsapp_connections
FOR EACH ROW EXECUTE FUNCTION clear_qr_on_connect();
```

- **Função:** `zapp.clear_qr_on_connect()` — **SECURITY DEFINER**, `SET search_path TO 'zapp','evo','monitoring'`.
- **Comportamento:** se `NEW.status='connected' AND OLD.status!='connected' AND NEW.qr_code IS NOT NULL` → `NEW.qr_code := NULL`. Nada mais.
- **Origem:** migration `supabase/migrations/archive/20260404174354_30f2c688-...sql` (criada como `public.clear_qr_on_connect`; hoje em `zapp`).
- **Risco adicional:** SECURITY DEFINER desnecessário — a operação é escrita na própria tabela do trigger; deveria ser INVOKER como a #2.

### 2. `trg_clear_qr_connect` — DUPLICATA (par A, versão nova/completa)

```sql
CREATE TRIGGER trg_clear_qr_connect BEFORE UPDATE ON zapp.whatsapp_connections
FOR EACH ROW EXECUTE FUNCTION fn_clear_qr_on_connect();
```

- **Função:** `zapp.fn_clear_qr_on_connect()` — INVOKER (sem SECURITY DEFINER, sem search_path).
- **Comportamento (superset da #1):**
  - connect (`NEW.status='connected' AND OLD.status!='connected'`): `qr_code=NULL`, `qr_code_base64=NULL`, `connected_at=now()`, `last_connected_at=now()`;
  - disconnect (`NEW.status='disconnected' AND OLD.status='connected'`): `disconnected_at=now()`.
- **Origem:** **sem migration no repo** — criada direto no banco vivo (drift de rastreabilidade).
- **Impacto se mantida como única:** nenhuma perda — cobre tudo que a #1 faz, mais `qr_code_base64`, timestamps de connect e `disconnected_at`.

**Divergência par A:** a #1 só limpa `qr_code` (e apenas quando não-nulo); a #2 limpa `qr_code + qr_code_base64` e mantém `connected_at`/`last_connected_at`/`disconnected_at`. Como disparam em sequência (1 → 2), o efeito líquido em `qr_code` é o mesmo; **mas** se a #2 fosse removida, `qr_code_base64` ficaria retido e os timestamps de estado parariam de atualizar — o que degradaria `fn_alert_wpp2_disconnection` (usa `disconnected_at`/`last_connected_at`) e o histórico de conexão.

**Recomendação (plano F6-11):** manter `trg_clear_qr_connect` (#2); dropar `clear_qr_on_connect_trigger` + `zapp.clear_qr_on_connect` (#1). **Não executado nesta auditoria.**

### 3. `trg_log_whatsapp_connection_state_change` — ÚNICO

```sql
CREATE TRIGGER trg_log_whatsapp_connection_state_change AFTER UPDATE OF status ON zapp.whatsapp_connections
FOR EACH ROW EXECUTE FUNCTION fn_log_whatsapp_connection_state_change();
```

- **Função:** `zapp.fn_log_whatsapp_connection_state_change()` — INVOKER.
- **Comportamento:** em mudança de `status`, insere em `zapp.evolution_connection_history` (instance_name, state, previous_state, duration_seconds, metadata com phone_number/owner_jid/health_status/health_reason/source). `source` vem de `current_setting('app.reconcile_source', true)` com fallback `'app'`.
- **Origem:** **sem migration no repo** (referenciada apenas em comentário de `supabase/migrations/archive/20260717210001_schema_hardening_v13_fix_connection_history.sql`).
- **Sem duplicata.** Dependência funcional: tabela `zapp.evolution_connection_history`.

### 4. `trg_validate_whatsapp_connection_url` — ÚNICO

```sql
CREATE TRIGGER trg_validate_whatsapp_connection_url BEFORE INSERT OR UPDATE OF api_url ON zapp.whatsapp_connections
FOR EACH ROW EXECUTE FUNCTION fn_validate_whatsapp_connection_url();
```

- **Função:** `zapp.fn_validate_whatsapp_connection_url()` — INVOKER.
- **Comportamento:** valida `NEW.api_url` contra `vault.decrypted_secrets` `evolution_api_url` (fallback `https://evolution.atomicabr.com.br`); divergência → `RAISE EXCEPTION` (ERRCODE 23514).
- **Origem:** **sem migration no repo**.
- **Sem duplicata.**

### 5. `trg_wconn_updated_at` — DUPLICATA (par B)

```sql
CREATE TRIGGER trg_wconn_updated_at BEFORE UPDATE ON zapp.whatsapp_connections
FOR EACH ROW EXECUTE FUNCTION fn_wconn_updated_at();
```

- **Função:** `zapp.fn_wconn_updated_at()` — INVOKER. Corpo: `NEW.updated_at = now(); RETURN NEW;`.
- **Origem:** **sem migration no repo** — criada direto no banco vivo.

### 6. `update_whatsapp_connections_updated_at` — DUPLICATA (par B)

```sql
CREATE TRIGGER update_whatsapp_connections_updated_at BEFORE UPDATE ON zapp.whatsapp_connections
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

- **Função:** `zapp.update_updated_at_column()` — INVOKER, `SET search_path TO 'public'`. Corpo: `NEW.updated_at = now(); RETURN NEW;` — **idêntico ao da #5**.
- **Origem:** migration `supabase/migrations/archive/20251215024517_1c312256-...sql` (era Lovable, `public.update_updated_at_column`; hoje em `zapp`). Padrão genérico reaproveitado em várias tabelas.
- **Nota:** existe ainda `storage.update_updated_at_column` (outra cópia, fora do escopo desta auditoria).

**Divergência par B:** nenhuma — **duplicata funcionalmente pura** (mesmo corpo, mesmo efeito). Disparam `trg_wconn_updated_at` → `update_whatsapp_connections_updated_at`; ambas setam o mesmo valor, sem conflito.

**Recomendação (plano F6-11):** manter `trg_wconn_updated_at` (#5, padrão `fn_*` do schema zapp); dropar `update_whatsapp_connections_updated_at` (#6). **Não executado nesta auditoria.**

## Estado da tabela (contexto)

- 39 colunas; 3 instâncias: `wpp2` (connected, is_active, is_default), `wpp_pink_test` (disconnected, inativa), `wppmkt` (disconnected, inativa).
- `evo.evolution_alerts`: 17 alertas históricos `wpp2_disconnection` (94% nunca resolvidos — ver F6-08).

## Gaps de rastreabilidade identificados

1. **Triggers sem migration no repo** (#2, #3, #4, #5 e funções correspondentes): só existem no banco vivo. Um restore por migrations perde esses triggers silenciosamente. Recomenda-se materializar migrations para o estado atual.
2. **Triggers migrados de `public` → `zapp`** sem migration correspondente no repo (#1 originalmente `public.clear_qr_on_connect`; #6 originalmente `public.update_updated_at_column`).
3. **F6-06 (função de alerta)**: fix aplicado em produção em 2026-08-02 e versionado em `supabase/migrations/20260802213000_f6-06_fn_alert_wpp2_disconnection_dynamic.sql` — ver aquela migration para detalhes (assinatura `(p_instance_name text DEFAULT 'wpp2')`, `alert_type` dinâmico `{instance}_disconnection`, retorno `instance_status`/`instance_name`, DROP do overload antigo sem args).

## Próximos passos (NÃO executados — escopo de documentação)

Conforme F6-11 do plano (etapas de execução futura, fora do escopo desta auditoria):

1. `DROP TRIGGER clear_qr_on_connect_trigger ON zapp.whatsapp_connections` (+ avaliar `DROP FUNCTION zapp.clear_qr_on_connect()` — SECURITY DEFINER sem necessidade).
2. `DROP TRIGGER update_whatsapp_connections_updated_at ON zapp.whatsapp_connections`.
3. Manter `trg_clear_qr_connect` e `trg_wconn_updated_at`.
4. Materializar migrations para os triggers órfãos (#2–#5) para eliminar o drift.

**⚠️ Nenhum DROP foi executado nesta auditoria.**
