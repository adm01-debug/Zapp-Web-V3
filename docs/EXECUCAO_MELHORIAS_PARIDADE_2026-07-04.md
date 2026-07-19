> **📜 DOCUMENTO HISTÓRICO** — Reflete o estado do sistema na data indicada. A arquitetura atual usa um único Supabase Self-Hosted com schema `zapp`. Veja [SCHEMA_REFERENCE.md](docs/SCHEMA_REFERENCE.md).

# Execução das Melhorias de Paridade — 2026-07-04 (meta 10/10)

**Contexto:** plano de ação da auditoria `docs/AUDITORIA_PARIDADE_LOVABLE_VS_SELFHOSTED_2026-07-04.md` (PR #159).
**Método:** cada mudança passou por (1) pré-flight estático (inspeção de corpos de functions, colunas, constraints, tipos), (2) **simulação transacional viva** (`DO` block + `RAISE` para rollback forçado) e (3) aplicação idempotente com verificação. Tudo executado direto na produção do self-hosted via MCPs (Supabase self-hosted + Portainer), sem downtime além de ~10s do edge-runtime.

**SQL versionado:** `db/parity/2026-07-04_parity_hardening.sql` (+ rollback ao lado).

---

## Matriz de simulação — falhas PREVISTAS e corrigidas antes da aplicação

~300 cenários avaliados (10 mudanças × ~30 dimensões: NULLs, FKs, RLS, recursão, partições, search_path, concorrência, fila pg_net, secret ausente, ordem de triggers, idempotência, rollback, view vs tabela, auth.uid() service vs authenticated...). Falhas reais detectadas pela simulação:

| # | Falha que ocorreria em produção | Correção aplicada |
|---|---|---|
| S1 | `init_agent_stats` fazia `INSERT ... ON CONFLICT` na **view** `public.agent_stats` → erro | Reescrita para `zapp.agent_stats` |
| S2 | `zapp.agent_stats` sem `UNIQUE(profile_id)` → `ON CONFLICT` erro 42P10 | `CREATE UNIQUE INDEX` (0 duplicatas confirmadas antes) |
| S3 | `zapp.agent_stats` com 8 colunas NOT NULL **sem default** → insert mínimo falhava | `SET DEFAULT` (0/1) — drift vs Lovable corrigido |
| S4 | `auto_assign_contact` usava `NEW.whatsapp_connection_id` (coluna inexistente em `evo.evolution_contacts`) | Função adaptada: resolve conexão via `instance_name` |
| S5 | `evolution_contacts.assigned_to` é **varchar**, `conversation_events.*_agent_id` é uuid → erro de tipo (pego no teste T3) | `evo.fn_uuid_safe()` para cast seguro |
| S6 | `notify_sicoob_on_reply` usava `extensions.http_post` (extensão **não instalada**) + URL do Lovable hardcoded | Reescrita com `net.http_post` (pg_net, assíncrono) → gateway interno `http://functions:9000` |
| S7 | `sanitize` em UPDATE quebraria aprovação por admin autenticado | Trigger só `BEFORE INSERT` |
| S8 | `update_agent_level` chamava `calculate_level(numeric)` — função é `(integer)` → erro (pego no teste T2) | Cast `::int` + schema-qualificação + `SET search_path` |
| S9 | Trigger de log com FK `performed_by→profiles` poderia bloquear UPDATE de produção | Wrapper `EXCEPTION` (auditoria nunca bloqueia escrita) |
| S10 | Trigger sicoob em tabela com 1,8M msgs — custo por INSERT | `WHEN (from_me)` + lookup por PK + exception-safe + pg_net assíncrono |
| S11 | `ensure_single_default_filter` — risco de recursão via UPDATE interno | `AFTER ... OF is_default` + `WHEN (NEW.is_default IS TRUE)` |
| S12 | Policies de `user_roles` usando `is_admin_or_supervisor()` → **recursão de RLS** (a função lê a própria `user_roles`) | Checagem via `profiles` (mesmo padrão de `whatsapp_official_credentials`) |
| S13 | `docker exec env` não mostra exports do PID 1 → falso-positivo da auditoria sobre secrets | Verificação correta via `/proc/1/environ` |

## Testes transacionais executados (todos com rollback antes da aplicação real)

| Teste | Cenários | Resultado |
|---|---|---|
| T1 password_reset | service preserva token / autenticado sanitizado / 4º request na hora bloqueado | ✅ 3/3 |
| T2 gamificação | level recalcula por XP / init idempotente | ✅ 2/2 (após S2/S3/S8) |
| T3 auto-assign | contato novo auto-atribuído por regra de carteira / evento `unassign` auditado | ✅ 2/2 (após S5) |
| T4 saved_filters | 2º default derruba o 1º, sem recursão | ✅ 1/1 |
| T5 RLS (como `authenticated`) | escalação de role revertida / escrita em user_roles negada a agente / gmail e reset requests visíveis só ao dono / admin continua operante | ✅ 5/5 |

## Itens executados

### 1. [ALTA] Triggers de segurança em `password_reset_requests` ✅
`sanitize_reset_request_trigger` + `trg_rate_limit_reset` (BEFORE INSERT). Nenhum `reset_token` legado exposto (0 não-nulos).

### 2. [ALTA] Secrets do edge-runtime ✅ (com correção do achado original)
O achado do PR #159 era parcialmente **falso-positivo**: o `command` do serviço já injetava `JWT_SECRET`, `SUPABASE_DB_URL`, `SUPABASE_SERVICE_ROLE_KEY` via Docker Secrets, e o serviço vivo (out-of-band) já tinha `EVOLUTION_API_URL/KEY` (secret `evolution_api_key_v4_20260704`) e `WEBHOOK_SECRET` — `docker exec env` não mostra exports do PID 1.
**Aplicado** (rolling update do serviço, ~10s, health 200 OK depois): `EVOLUTION_WEBHOOK_SECRET` (derivado do secret já presente) e `EXTERNAL_SUPABASE_URL/ANON_KEY/SERVICE_ROLE_KEY` apontando para o próprio VPS (20 usos nas functions `external-db-*`).
**⚠️ Drift do stack file (ação humana recomendada):** o compose do stack `supabase` no Portainer está atrás do serviço vivo (não tem `WEBHOOK_SECRET`, `EVOLUTION_*`, `--request-wait-timeout 60000`, limites de memória, secret `evolution_api_key_v4_20260704`, nem os novos `EXTERNAL_*`/`EVOLUTION_WEBHOOK_SECRET`). Um `stack deploy` a partir do arquivo atual **regride** o serviço — mesmo bug documentado no próprio stack em 2026-07-02. Sincronizar o arquivo com o spec vivo (label do serviço: `com.atomicabr.audit=parity-env-external-webhook-2026-07-04`).
Não migráveis/não aplicáveis: `LOVABLE_API_KEY` (gerenciado pelo Lovable; ai-proxy self-hosted usa `ai.ai_providers`); `GOOGLE_*`, `RESEND_API_KEY`, `MAPBOX`, `SIP`, `ELEVENLABS_AGENT_ID` eram **placeholders** também no Lovable (nada a migrar); `SICOOB_GIFTS_URL/BRIDGE_SECRET` não existiam nem no Lovable (edge fn sicoob-bridge-reply já nascia sem eles).

### 3. [MÉDIA] Auto-assign + auditoria de atribuição em `evo.evolution_contacts` ✅
`trg_auto_assign_contact` (BEFORE INSERT, carteira de clientes via `client_wallet_rules`) + `trg_log_assignment_change` (AFTER UPDATE OF assigned_to → `zapp.conversation_events`). `client_wallet_rules` está vazia hoje — o wiring restaura a paridade para quando regras forem cadastradas. `auto_assign_to_queue_agent` do Lovable é **N/A** por arquitetura: `evolution_contacts` não tem `queue_id`; roteamento de fila no self-hosted é responsabilidade do pipeline `zapp.queue_items`/`queue_positions`.

### 4. [BAIXA] Triggers restantes ✅
- `zapp.agent_stats`: `update_level_on_xp_change` + defaults + unique(profile_id)
- `public.profiles`: `on_profile_created_init_stats`
- `public.saved_filters`: `ensure_single_default_filter_trigger`
- `public.user_devices`: `update_user_devices_last_seen`
- `public.user_roles`: `audit_user_role_changes` (audit_logs)
- `evo.evolution_messages` (25 partições): `trg_sicoob_reply` reescrito com pg_net → `sicoob-bridge-reply`

### 5. [MÉDIA] Endurecimento RLS ✅ — 3 regressões CRÍTICAS corrigidas
A revisão semântica encontrou muito mais que "modelo simplificado":

| Tabela | Antes (INSEGURO) | Depois |
|---|---|---|
| `public.user_roles` | `ALL true` p/ authenticated → **qualquer usuário podia se dar admin** | SELECT p/ autenticados; escrita só admin/dev |
| `public.password_reset_requests` | `ALL true` → ler/editar requests (e tokens) de terceiros | dono ou admin lê; dono insere; admin altera/apaga |
| `email_app.gmail_accounts` | `ALL true` → ler **tokens OAuth criptografados** de terceiros | dono lê; escrita só service_role |
| `public.profiles` | update próprio sem guarda → auto-promover `role` | trigger `prevent_privilege_escalation` (revert silencioso) |

`whatsapp_official_credentials` já estava correta (admin/dev only). `service_role` intocado em tudo.

## Verificação pós-mudança (produção)

- Edge-runtime: `GET /status` → `200 {"status":"ok","service":"zapp-web-edge"}` com todas as env novas em `/proc/1/environ`.
- Cron: 86 execuções OK / 0 falhas nos 15 min pós-mudança; fila pg_net sem erros.
- Pipeline: último tráfego WhatsApp é de ~4,5h **antes** das mudanças (madrugada) — nada quebrado pelas alterações.
- 34 triggers confirmados ativos (10 alvo + propagação nas 25 partições de `evolution_messages`).

## Placar final

| Item do plano | Status |
|---|---|
| 1. Secrets edge-runtime | ✅ (com falso-positivo corrigido + drift documentado) |
| 2. Triggers segurança password_reset | ✅ |
| 3. Auto-assign/log atribuição | ✅ (queue-assign N/A por arquitetura, documentado) |
| 4. Revisão RLS sensível | ✅ (3 críticas corrigidas + anti-escalação) |
| 5. Triggers gamificação/UX/sicoob | ✅ |

**Paridade funcional Lovable → self-hosted: 10/10 nos itens acionáveis.** Pendência única fora do banco: sincronizar o stack file do Portainer com o spec vivo do serviço `functions` (ação humana deliberada, instruções acima).
