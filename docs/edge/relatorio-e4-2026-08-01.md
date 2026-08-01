# Fase E4 — Completar e desligar (2026-08-01)

## E30 — 8 funções ausentes no self-hosted ✅ (7/8 deployadas)
| Função | Estado | Evidência |
|---|---|---|
| health | ✅ deployada (PR #664) | GET sem JWT → 401 gateway; com service_role → `{"status":"ok",...}` |
| mcp | ✅ deployada (PR #664) | responde `{"error":"oauth configuration error"}` (config OAuth pendente — sem ação) |
| metrics | ✅ deployada (PR #664) | expõe métricas Prometheus reais (`# HELP zapp_webhook_events_total`) |
| nps-scheduler | ✅ deployada (PR #664) | `{"error":"method_not_allowed"}` (viva, precisa CRON_SECRET) |
| sicoob-outbox-consumer | ✅ deployada (PR #664) | atrás da allowlist + `requireServiceRoleOrCron` |
| talkx-add-recipients | ✅ deployada (PR #664) | `{"error":"Unauthorized: user session required"}` (fail-closed correto) |
| talkx-control | ✅ deployada (PR #664) | idem |
| migrate-helper | ❌ **NÃO deployada (correto)** | função com ACCESS_KEY comprometida; removida do repo (PR #666) e do volume — 0 residual |

**Volume final: 127 funções** no self-hosted (era 122 no snapshot + 7 novas − 2 fixtures removidas). Repo `supabase/functions/` mantém 130 entradas (inclui specs/artefatos históricos).

## E31 — Fluxo SICOOB ⚠️ (parcial — depende de 2 credenciais externas)
**Confirmado funcionando:**
- Trigger `trg_sicoob_reply` ativo em todas as partições `evo.evolution_messages_*` (AFTER INSERT, from_me + contact_id) → `fn_notify_sicoob_on_reply()` → `net.http_post` para `/functions/v1/sicoob-bridge-reply` com service_role
- `sicoob-bridge-reply` na allowlist + testada: responde corretamente (passa o gateway, exige config)
- `sicoob-outbox-consumer` deployada, atrás da allowlist, `requireServiceRoleOrCron` ativo
- Outbox: `zapp.outbox_events` = **0 eventos** (sem backlog acumulado)

**Bloqueio:** `SICOOB_GIFTS_URL` + `SICOOB_GIFTS_BRIDGE_SECRET` **não existem** no env do stack 35, no vault do self-hosted, nem no vault do cloud. Teste real:
```
POST /functions/v1/sicoob-bridge-reply (com service_role) →
{"error":"SICOOB_GIFTS_URL or SICOOB_GIFTS_BRIDGE_SECRET not configured"}
```
**Ação pendente (manual):** Joaquim fornecer os 2 valores → adicionar como env no stack 35 (Portainer) → redeploy. Sem cron de drain criado propositalmente (outbox vazio; evita ruído).

## E32 — Remover migrate-helper e fixtures ✅
- Repo: `migrate-helper` removido (PR #666), `e2e-fixtures` + `e2e-webhook-fixture` removidos (este PR). No lado do cliente/CI: workflow `e2e-evolution-vps.yml` descontinua `webhook-providers-parity`, docs `e2e.md` marca a spec como histórica, inventário `EDGE_FUNCTIONS.md` atualizado. (Nota: o config.toml nunca teve seções `[functions.e2e-*]` — nada a limpar lá.)
- Volume self-hosted: 0 residuais (127 funções, nenhuma `e2e-*`/`migrate-helper`) — 127 é a contagem do **volume de produção**; `supabase/functions/` no repo tem 130 entradas (inclui artefatos de teste mantidos como referência)
- Validação externa: e2e-fixtures → 404, e2e-webhook-fixture → 404, migrate-helper → 401 (gateway; função inexistente)

## E33 — Desligar Lovable Cloud ⚠️ (requer painel)
- `sicoob-outbox-drain` cron: **já não existe** no cloud (verificado via `cron.job` — só `purge_query_telemetry_daily`; 30.117 runs históricos do job 2)
- `migrate-helper` no cloud: **VIVO** com ACCESS_KEY estática comprometida (prefixo `7bdebc20...` registrado apenas no contexto de rotação; valor completo circula no histórico do repo `bb6a6960a` e no código do cloud). Confirmado por probe GET → resposta da função; ação `credentials` expõe SERVICE_ROLE_KEY/DB_URL
- **Ação pendente (manual):** no painel Supabase Cloud (`uqysyzndkfiwfztbqvsl`): (1) deletar função `migrate-helper`, (2) rotacionar SERVICE_ROLE_KEY/ANON_KEY, (3) desligar/despublicar projeto Lovable. Sem acesso via MCP — documentado para o operador.

## E34 — config.toml header ✅ (feito no PR #666)
Ref ativo `uqysyzndkfiwfztbqvsl` + aviso explícito de que o runtime self-hosted NÃO lê `verify_jwt` (fonte de verdade = allowlist no main/index.ts).
