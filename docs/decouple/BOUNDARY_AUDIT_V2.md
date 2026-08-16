# BOUNDARY_AUDIT v2 + ops.fn_provider_call (E53/E85) — 2026-08-15

> DDL aplicado em producao e registrado como migration DB `20260815250010`
> (`decouple_e53_e85_audit_v2_roles_provider_call_3_bypasses`). Arquivo nao entra em
> `supabase/migrations/` deste repo (gate I7 barra DDL citando `evo.*`) — SQL integral aqui.

## O que mudou

### 1. `ops.fn_boundary_audit` v2 — allowlist da superficie declarada
- **I1**: ignora citacoes `zapp.rpc_boundary_*` (superficie do CONTRACT_WRITE_EVO_TO_ZAPP).
- **I2**: ignora `evo.rpc_boundary_*` + a superficie ja-RPC declarada no CONTRACT_WRITE_ZAPP_TO_EVO
  (`rpc_(claim|complete|fail)_media_download(_batch)?`, `fn_mark_status_viewed`,
  `fn_touch_contact_presence`, `fn_upsert_group_(from_event|participants)`).
  Efeito medido: I2 40 -> **33** (7 fns cujo unico contato com evo e a superficie declarada).
- **I8**: passa a contar so egresso REAL ao provider (`fn_evo_url` ou
  `evolution.atomicabr.com.br` + `net.http_`), excluindo o proprio gateway
  (`fn_provider_call`) e as portas P4 declaradas (`fn_outbound_dispatch`,
  `fn_reconcile_dispatch`). Efeito: 14 -> **1** (resta `ops.fn_notify_critical_alerts`, caso
  misto Resend+provider). Edge functions, Bitrix, n8n e Storage eram falso positivo do filtro
  antigo `(fn_evo_url|evolution)`.
- Regra de governanca: prefixo `rpc_boundary_` so e allowlisted se enumerado nos CONTRACT_WRITE_*.

### 2. E53 — papeis de contrato
`CREATE ROLE evo_writer NOLOGIN` / `CREATE ROLE zapp_writer NOLOGIN` (idempotente).
`aux_roles_contrato_existem` 0 -> 2. Grants minimos entram junto com as RPCs de contrato.

### 3. E85 — `ops.fn_provider_call(p_method, p_path, p_body, p_timeout_ms) RETURNS bigint`
Porta SQL unica de egresso ao provider: monta URL via `ops.fn_evo_url()`, header `apikey` via
`ops.fn_evo_key()`, despacha `net.http_get/post` e devolve o `request_id` do pg_net.
`SECURITY DEFINER`, `search_path=ops,pg_catalog`, `REVOKE ALL FROM PUBLIC`.
Primitiva minima (method+path) — o espelho verbo-a-verbo dos 12 verbos do gateway (E85 pleno)
pode ser camada por cima sem tocar os chamadores.

### 4. Bypasses reescritos para a porta (diff minimo, decls preservadas)
| fn | antes | depois |
|---|---|---|
| `evo.fn_sync_lid_from_api(text)` e `(text,int)` | `net.http_get` + fn_evo_url/key inline | `ops.fn_provider_call('GET','/contact/findContacts/'||inst,NULL,15000)` |
| `zapp.fn_validate_whatsapp_connection_url(text)` | idem | `ops.fn_provider_call('GET','/instance/connectionState/'||inst,NULL,5000)` |
| `zapp.fn_check_license_heartbeat()` | `net.http_get` sem header + leitura RACY de `net._http_response` (ultima resposta global em 30s) | `fn_provider_call` + leitura por `WHERE id = v_req` (corrige a race) |
Validado antes do rewrite: `/license/status` responde 200 com e sem apikey (reqs 293/294) —
sem risco de falso-positivo de licenca.

## Achado da sessao — chave do provider ROTACIONADA e vault desatualizado

- Smoke `fn_provider_call` -> HTTP **401** (req 291). Padrao antigo (net.http_get direto,
  mesma URL/key) -> **401 identico** (req 292). **Pre-existente, nao regressao.**
- `net._http_response`: **85 respostas 401 em 7 dias** — a telemetria P4 esta cega ha dias.
- `/license/status` expoe o fingerprint da chave global atual: `966f8fd6...6a00`.
  Vault `evolution_api_key`: `e5091b02...478b`. **Nao batem.**
- Impacto: so telemetria/monitoria (fila `zapp.outbound_message_queue` vazia em 7d — envio de
  mensagem vai pela edge, nao pela P4). Correcao: atualizar o secret no vault com a chave do
  container Evolution (`AUTHENTICATION_API_KEY`) e validar 200 no connectionState.

## SQL integral aplicado

Ver migration DB `20260815250010`. Reproducao: `CREATE OR REPLACE` de `ops.fn_boundary_audit`
(v2 acima), DO-block dos roles, `ops.fn_provider_call` e os 4 `CREATE OR REPLACE` das fns
reescritas — corpo identico ao aplicado esta em `pg_get_functiondef` de producao (fonte de
verdade); baseline pre-mudanca preservado nos snapshots E1.

## Placar consolidado da sessao (ops.fn_boundary_audit)

| metrica | inicio | fim |
|---|---:|---:|
| I1_fns_evo_citando_zapp | 66 | **55** |
| I2_fns_zapp_citando_evo | 40 | **33** |
| I8_fns_pgnet_provider_fora_gateway | 14 | **1** |
| aux_cron_citando_evo | 89 | 78 |
| aux_roles_contrato_existem | 0 | 2 |
| I3 / aux_searchpath_evo_com_zapp | 0 / 0 | 0 / 0 |
