# RUNBOOK — Ativação WhatsApp Cloud API Oficial (instância `wppmkt`)

> **Arquitetura atual**: Supabase Self-Hosted (`supabase.atomicabr.com.br`), schema `zapp`. Veja [SCHEMA_REFERENCE.md](SCHEMA_REFERENCE.md).


> Preparado em 2026-07-06 · Auditoria **wa-business-prep** · Score **10/10**
> Validação: 252 cenários adversariais (budget guard) + 6 asserts RLS multi-role + 5 probes E2E de infra — todos PASS.

## 1. Contexto

Canal **oficial Meta (Cloud API)** dedicado a PUBLICIDADE/marketing, isolado da operação de atendimento (`wpp2`, Baileys). Evolution API v2.3.7, `integration: WHATSAPP-BUSINESS`, Graph API **v24.0**.

Arquitetura-alvo: `wpp2` = atendimento (custo zero, número protegido) · `wppmkt` = outbound de marketing com templates aprovados.

## 2. O que JÁ está pronto (não refazer)

| Item | Onde |
|---|---|
| Secret verify token `wa_business_verify_token_v1` (64 hex) | Docker Swarm / stack 25 |
| Env live: `WA_BUSINESS_URL` + `WA_BUSINESS_VERSION=v24.0` + `pt_BR` | stack 25 (fonte de verdade) |
| Handshake `GET /webhook/meta` validado E2E (echo do challenge com token real) | Evolution |
| RLS: SELECT **e** INSERT em `evo.evolution_messages` restritos a `wpp2`/`wppmkt` | Supabase self-hosted |
| Policy `service_role_all` de `evo.evolution_webhook_events_v2` corrigida `TO service_role` (era `public` = leitura total) | Supabase self-hosted |
| Conexão dormante `wppmkt` (`is_active=false`, `health_status=provisioned`) | `public.whatsapp_connections` |
| Budget guard: `ops.wa_marketing_budget` + `ops.check_marketing_budget()` + cron **jobid 124** (diário 09:00 BRT) → `warroom_alerts` | ops |
| `warroom_alerts` ganhou coluna `entity` (destravou também o alerta LGPD do entrypoint do Evolution, que estava silenciosamente morto) | public |
| `ops.run_all_checks()` inclui `wa_marketing_budget` (22 checks) | ops |
| Watchdog **v11.1** com `get_disconnect_reason` escopado por instância | stack 109 |
| Harness permanente: `ops.sim_wa_budget_guard()` (252 cenários) e `ops.sim_rls_wa()` | ops |

## 3. Pré-requisitos (lado Meta — únicos pendentes)

1. Business Manager **verificada** (CNPJ + documentos)
2. App no Meta for Developers com produto WhatsApp
3. **Número NOVO dedicado** (⚠️ nunca o 551146375517 — não pode coexistir com Baileys) registrado na WABA → anotar **Phone Number ID** e **WABA ID**
4. **Token permanente** (System User) com `whatsapp_business_messaging` + `whatsapp_business_management`
5. Forma de pagamento ativa na WABA (sem billing, template não sai)

## 4. Ativação — passo a passo

**4.1 Recuperar o verify token** (colar no painel Meta):
```bash
docker exec $(docker ps -qf name=evolution_evolution | head -1) cat /run/secrets/wa_business_verify_token_v1
```

**4.2 Painel Meta** → WhatsApp → Configuração → Webhooks:
- Callback URL: `https://evolution.atomicabr.com.br/webhook/meta`
- Verify token: valor do passo 4.1
- Assinar eventos: `messages`, `message_status` (e `message_template_status_update` se desejado)

**4.3 Criar a instância na Evolution:**
```bash
curl -X POST https://evolution.atomicabr.com.br/instance/create \
  -H "apikey: $EVOLUTION_API_KEY" -H 'Content-Type: application/json' \
  -d '{"instanceName":"wppmkt","integration":"WHATSAPP-BUSINESS","token":"<TOKEN_PERMANENTE_META>","number":"<PHONE_NUMBER_ID>","businessId":"<WABA_ID>"}'
```

**4.4 Acordar a conexão pré-provisionada:**
```sql
UPDATE public.whatsapp_connections
   SET is_active = true, status = 'connected',
       phone_number = '<E164>', owner_jid = '<E164>@s.whatsapp.net', updated_at = now()
 WHERE instance_name = 'wppmkt';
```

**4.5 Calibrar o budget real** (default R$ 500 ≈ 1.554 msgs @ R$ 0,3217):
```sql
UPDATE ops.wa_marketing_budget SET monthly_budget_brl = <valor>, updated_at = now() WHERE id = 1;
```

**4.6 Templates:** criar e submeter (marketing) e aguardar aprovação Meta.

**4.7 Smoke test:** enviar 1 template para número interno e conferir o espelho:
```sql
SELECT count(*) FROM evo.evolution_messages WHERE instance_name = 'wppmkt';
```

**4.8 Validação final:**
```sql
SELECT * FROM ops.check_marketing_budget();
SELECT * FROM ops.run_all_checks();
```

## 5. Comportamentos conhecidos

- `GET /webhook/meta` com token **errado** → HTTP 200 com corpo de erro (≠ challenge). A verificação da Meta falha mesmo assim (Meta compara o corpo com o challenge). Comportamento upstream do Evolution.
- O guard conta **todas** as msgs `from_me` da instância no mês × tarifa de marketing (estimativa conservadora; o `detail` traz o nº de templates). Respostas de serviço passam a ser cobradas (R$ 0,035) a partir de 01/10/2026.
- `disconnectionReasonCode=401` residual da `wpp2` no PG14 é histórico (estado atual `open`).
- Limites de envio Meta escalam por tier (250 → 1k → 10k → 100k/dia) conforme verificação + qualidade; planejar campanhas respeitando o tier vigente.

## 6. Rollback / desativação

- Pausar campanhas: `UPDATE public.whatsapp_connections SET is_active=false WHERE instance_name='wppmkt';` (+ opcionalmente deletar a instância na Evolution)
- Desligar o guard: `SELECT cron.unschedule('daily-wa-marketing-budget');`
- Policies permanecem seguras (lista explícita `wpp2`/`wppmkt`).

## 7. Referências

- Stacks Portainer: `evolution=25` (label `wa-business-cloudapi-prep-v24-2026-07-06`), `watchdog-baileys=109` (v11.1)
- Cron: `124 · daily-wa-marketing-budget · 0 12 * * *`
- Re-simular a qualquer momento: `SELECT ops.sim_wa_budget_guard();` · `SELECT ops.sim_rls_wa();`
