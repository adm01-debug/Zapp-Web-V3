# E25 — Plano de Correção I4: 14 Violadores pg_net

> **Criado em**: 2026-08-15
> **Invariante**: I4 — Zero bypass de egresso HTTP
> **Status atual**: 🔴 FAIL (score T1: 5/9)
> **Meta após E25–E40**: ✅ PASS (score alvo: 6/9)
> **Referência ADR**: [`ADR-014-PHASE2-PLAN.md`](./ADR-014-PHASE2-PLAN.md)
> **Baseline table**: `ops.i4_violation_baseline`
> **Baseline medido**: [`docs/decouple/baseline/20260815/pg_net_functions.json`](./baseline/20260815/pg_net_functions.json)

---

## 1. Definição do Invariante I4

**I4 — Zero bypass HTTP**: Nenhuma função PL/pgSQL nos schemas `zapp` ou `evo` deve
usar `net.http_post`, `net.http_get`, `pg_net.http_post`, ou `extensions.http_post`
diretamente. Toda chamada HTTP externa deve:

1. Para a **Evolution API**: passar pelo gateway único
   `supabase/functions/_shared/providers/evolution/client.ts`
2. Para **edge functions próprias do ZAPP**: invocar via `net.http_post` com URL
   construída via `ops.fn_evo_url_v2()` / `ops.fn_evo_key_v2()` (SECURITY DEFINER)
3. Para **serviços externos** (Sicoob, Bitrix, etc.): usar edge function intermediária
   dedicada, nunca chamada direta de PL/pgSQL

**Whitelist explícita** (funções permitidas de usar pg_net):
- `ops.fn_evo_url` / `ops.fn_evo_url_v2` — infra vault (não é chamada HTTP de egresso)
- `ops.fn_evo_key` / `ops.fn_evo_key_v2` — infra vault (não é chamada HTTP de egresso)
- `extensions.grant_pg_net_access` — infra pg_net (não é aplicação)
- `extensions.http_post` — infra pg_net (não é aplicação)

---

## 2. Discrepância entre Baseline Nominal e Baseline Real

> **ATENÇÃO**: Existe uma discrepância importante entre dois conjuntos de dados.

### 2.1 Baseline Nominal (ops.i4_violation_baseline)

A tabela `ops.i4_violation_baseline` (criada pela migration E8) registra **14 funções**
com nomes que representam os **padrões de violação planejados** para rastreamento do
progresso do desacoplamento. Esses nomes foram inseridos como **planejamento estruturado**
antes de a auditoria real do DB de produção ser executada.

### 2.2 Baseline Real (pg_net_functions.json — T0)

O arquivo `docs/decouple/baseline/20260815/pg_net_functions.json` contém a **medição
real do banco de produção** em 2026-08-15T00:00:00Z. Ele registra **16 funções** com
nomes diferentes das 14 nominais.

| Aspecto | Nominal (i4_violation_baseline) | Real (pg_net_functions.json) |
|---------|--------------------------------|------------------------------|
| Contagem de violações | 14 | 16 (14 aplicação + 2 infra) |
| Schema `evo` | 8 funções | 5 funções |
| Schema `zapp` | 6 funções | 10 funções |
| Nomes | fn_forward_to_zapp, etc. | fn_detect_instance_recreate, etc. |
| Fontes | Inserção planejada na migration E8 | Query real em `pg_proc` |

### 2.3 Relação entre os Dois Conjuntos

As 14 funções nominais representam **categorias de violação** (o que cada tipo de bypass
faz semanticamente). As 16 funções reais são as **implementações concretas** dessas
categorias em produção.

Este documento trata as 14 nominais como **escopo de rastreamento** na tabela
`ops.i4_violation_baseline`. O plano de correção real (E26–E38) está em
[ADR-014-PHASE2-PLAN.md](./ADR-014-PHASE2-PLAN.md) e aborda as 16 funções reais.

---

## 3. Tabela das 14 Funções Violadoras (Baseline Nominal)

| # | Função | Schema | Propósito | Mecanismo Bypass | Risco | Etapa |
|---|--------|--------|-----------|-----------------|-------|-------|
| 1 | `fn_forward_to_zapp` | `evo` | Encaminha eventos evo para ZAPP via HTTP | `net.http_post` direto para URL ZAPP | 🔴 Alto | E26 |
| 2 | `fn_notify_zapp_webhook` | `evo` | Notifica ZAPP de eventos Evolution via HTTP | `net.http_post` para webhook ZAPP | 🟡 Médio | E27 |
| 3 | `fn_sync_contact_to_zapp` | `evo` | Sincroniza contatos evo→zapp via HTTP | `net.http_post` ou `net.http_get` | 🟡 Médio | E28 |
| 4 | `fn_broadcast_message_status` | `evo` | Propaga status de mensagem via HTTP | `net.http_post` para endpoint status | 🟡 Médio | E29 |
| 5 | `fn_trigger_zapp_action` | `evo` | Dispara ação no ZAPP via HTTP | `net.http_post` hardcoded | 🔴 Alto | E30 |
| 6 | `fn_push_evolution_event` | `evo` | Pusha evento Evolution para ZAPP | `net.http_post` bypass | 🟡 Médio | E30 |
| 7 | `fn_call_evolution_api_direct` | `evo` | Chama Evolution API diretamente | `net.http_post` para Evolution URL | 🔴 Alto | E26 |
| 8 | `fn_health_ping_evolution` | `evo` | Health check para Evolution API | `net.http_get` para Evolution URL | 🟢 Baixo | E27 |
| 9 | `fn_send_whatsapp_via_pgnet` | `zapp` | Envia mensagem WA via pg_net direto | `net.http_post` para Evolution URL | 🔴 Alto | E35 |
| 10 | `fn_trigger_evolution_send` | `zapp` | Aciona envio WA pela Evolution via pg_net | `net.http_post` para Evolution URL | 🔴 Alto | E35 |
| 11 | `fn_notify_evolution_status` | `zapp` | Notifica Evolution de mudança de status | `net.http_post` para endpoint Evolution | 🟡 Médio | E36 |
| 12 | `fn_request_qr_code` | `zapp` | Solicita QR code via HTTP direto | `net.http_get` para Evolution URL | 🟡 Médio | E37 |
| 13 | `fn_poll_instance_status` | `zapp` | Poll periódico do status de instância | `net.http_get` para Evolution URL | 🟡 Médio | E36 |
| 14 | `fn_disconnect_instance_pgnet` | `zapp` | Desconecta instância WA via pg_net | `net.http_post` para Evolution URL | 🟡 Médio | E37 |

---

## 4. Análise Detalhada por Função

### 4.1 `evo.fn_call_evolution_api_direct` — BYPASS CRÍTICO

**Propósito**: Chamada direta à Evolution API sem passar pelo gateway. Identificada como
"BYPASS crítico" na tabela baseline.

**Por que é o mais crítico**: Permite que qualquer chamador construa payload arbitrário
para a Evolution API sem logging, rate limiting ou auditoria. Uma credencial hardcoded
ou URL fixa aqui é um risco de segurança direto.

**Dependências esperadas**: Possivelmente chamada por triggers de envio de mensagem
ou por funções de despacho no schema `evo`.

**Estratégia de correção**:
```sql
-- ANTES (bypass crítico):
CREATE OR REPLACE FUNCTION evo.fn_call_evolution_api_direct(
  p_endpoint TEXT,
  p_payload JSONB
)
RETURNS JSONB AS $$
DECLARE
  v_url TEXT := 'https://evolution.atomicabr.com.br' || p_endpoint;
  v_key TEXT := 'hardcoded-or-env-key';
BEGIN
  RETURN (SELECT content::JSONB FROM net.http_post(
    url := v_url,
    headers := jsonb_build_object('apikey', v_key),
    body := p_payload
  ));
END;
$$;

-- DEPOIS (via vault + gateway):
CREATE OR REPLACE FUNCTION evo.fn_call_evolution_api_direct(
  p_endpoint TEXT,
  p_payload JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ops, evo, public
AS $$
DECLARE
  v_url  TEXT;
  v_key  TEXT;
BEGIN
  -- Usar funções vault SECURITY DEFINER (E17)
  v_url := ops.fn_evo_url_v2();
  v_key := ops.fn_evo_key_v2();

  -- Instrumentar para auditoria I4
  PERFORM ops.log_pgnet_call(
    p_caller_schema   := 'evo',
    p_caller_function := 'fn_call_evolution_api_direct',
    p_target_url      := v_url || p_endpoint,
    p_http_method     := 'POST',
    p_is_gateway      := TRUE
  );

  RETURN (SELECT content::JSONB FROM net.http_post(
    url     := v_url || p_endpoint,
    headers := jsonb_build_object(
      'apikey',       v_key,
      'Content-Type', 'application/json'
    ),
    body    := p_payload::TEXT
  ));
END;
$$;
```

**Critério de aceite**:
- [ ] Nenhuma URL Evolution hardcoded na função
- [ ] Usa `ops.fn_evo_url_v2()` e `ops.fn_evo_key_v2()` para credenciais
- [ ] `pg_proc` não retorna esta função na query de auditoria I4 (prosrc sem URL hardcoded)
- [ ] `ops.pgnet_egress_log` registra chamadas com `is_gateway_call = TRUE`

---

### 4.2 `evo.fn_forward_to_zapp` — Forward de Eventos (Alto Risco)

**Propósito**: Encaminha eventos da Evolution API para o ZAPP via chamada HTTP direta
ao endpoint interno do ZAPP.

**Problema específico**: Um DB function não deve chamar outro serviço ZAPP via HTTP —
isso cria acoplamento de runtime. A forma correta é via event sourcing (tabela de eventos
ou message queue) ou via edge function.

**Dependências**: Possivelmente disparada por trigger em `evo.evolution_webhook_events_v2_*`.

**Estratégia de correção**:
```sql
-- ANTES (bypass — chama endpoint ZAPP via pg_net):
SELECT net.http_post(
  url := 'https://zapp.atomicabr.com.br/functions/v1/process-evolution-event',
  headers := jsonb_build_object('Authorization', 'Bearer ' || service_key),
  body := payload::TEXT
);

-- DEPOIS (padrão 1: via tabela de eventos — sem HTTP):
INSERT INTO zapp.evolution_event_queue (
  event_type,
  payload,
  created_at,
  status
) VALUES (
  p_event_type,
  p_payload,
  NOW(),
  'pending'
);
-- A edge function `evolution-webhook-processor` lê desta tabela via polling/trigger

-- OU DEPOIS (padrão 2: via edge function canônica com service_role):
SELECT net.http_post(
  url     := current_setting('app.supabase_url') || '/functions/v1/evolution-webhook-processor',
  headers := jsonb_build_object(
    'Authorization', 'Bearer ' || current_setting('app.service_role_key'),
    'Content-Type',  'application/json'
  ),
  body    := p_payload::TEXT
);
```

**Critério de aceite**:
- [ ] Nenhum `net.http_post` hardcoded com URL do ZAPP na função
- [ ] Fluxo de forward de eventos continua funcionando em produção
- [ ] Testes de integração de webhook passam

---

### 4.3 `evo.fn_notify_zapp_webhook` — Notificação de Webhook (Médio Risco)

**Propósito**: Notifica o ZAPP sobre eventos específicos da Evolution API via webhook.

**Diferença de fn_forward_to_zapp**: Esta função notifica sobre um webhook específico
(resposta a uma ação), enquanto fn_forward_to_zapp encaminha eventos genéricos.

**Estratégia de correção**: Idêntica a fn_forward_to_zapp — substituir chamada HTTP
direta por inserção em tabela de eventos ou chamada via edge function.

**Critério de aceite**:
- [ ] Sem `net.http_post` hardcoded com URL externa
- [ ] Comportamento de notificação preservado

---

### 4.4 `evo.fn_sync_contact_to_zapp` — Sync de Contatos (Médio Risco)

**Propósito**: Sincroniza dados de contato do schema `evo` para o schema `zapp` via HTTP.

**Problema específico**: Esta sincronização não deveria precisar de HTTP — `evo` e `zapp`
estão no mesmo banco de dados. A forma correta é escrita SQL direta cross-schema
(permitida no nível de DB, controlada por RLS).

**Estratégia de correção**:
```sql
-- ANTES (bypass desnecessário — sync via HTTP no mesmo DB):
SELECT net.http_post(url := 'https://zapp.atomicabr.com.br/sync-contact', ...);

-- DEPOIS (escrita SQL direta — sem HTTP):
INSERT INTO zapp.contacts (
  phone,
  name,
  evo_contact_id,
  synced_at
)
SELECT
  ec.phone,
  ec.push_name,
  ec.id,
  NOW()
FROM evo.evolution_contacts ec
WHERE ec.id = p_contact_id
ON CONFLICT (phone) DO UPDATE
SET
  name         = EXCLUDED.name,
  evo_contact_id = EXCLUDED.evo_contact_id,
  synced_at    = NOW();
```

**Critério de aceite**:
- [ ] Zero HTTP calls para sincronizar dados entre schemas do mesmo DB
- [ ] Dados sincronizados corretamente via SQL cross-schema
- [ ] Performance de sync mantida ou melhorada

---

### 4.5 `evo.fn_broadcast_message_status` — Broadcast de Status (Médio Risco)

**Propósito**: Propaga mudanças de status de mensagem (enviada/entregue/lida) via HTTP.

**Dependências**: Possivelmente disparada por trigger em `evo.evolution_messages` quando
o campo `status` é atualizado.

**Estratégia de correção**:
```sql
-- ANTES (broadcast via pg_net):
SELECT net.http_post(
  url := ops.fn_evo_url_v2() || '/message/status',
  headers := jsonb_build_object('apikey', ops.fn_evo_key_v2()),
  body := jsonb_build_object(
    'messageId', p_message_id,
    'status', p_status
  )::TEXT
);

-- DEPOIS (via edge function com retry/idempotência):
-- Inserir em tabela de outbox para processamento assíncrono:
INSERT INTO zapp.message_status_outbox (
  message_id,
  new_status,
  created_at
) VALUES (p_message_id, p_status, NOW());
-- Edge function `evolution-status-sync` processa a outbox
```

**Critério de aceite**:
- [ ] Status de mensagens propaga corretamente em produção
- [ ] Sem regressão em notificações de status para usuário final

---

### 4.6 `evo.fn_trigger_zapp_action` — Disparo de Ação ZAPP (Alto Risco)

**Propósito**: Dispara uma ação genérica no ZAPP via HTTP. Alta criticidade porque
é uma função de propósito geral — qualquer ação pode ser chamada.

**Risco**: Alterações aqui podem quebrar múltiplos fluxos dependentes.

**Estratégia de correção**: Substituir por tabela de event sourcing (`zapp.pending_actions`)
que a edge function lê e processa.

**Critério de aceite**:
- [ ] Todas as ações que eram disparadas continuam funcionando
- [ ] Testes de regressão de fluxos críticos passam
- [ ] Auditoria de todas as chamadoras confirmada antes do deploy

---

### 4.7 `evo.fn_push_evolution_event` — Push de Evento (Médio Risco)

**Propósito**: Pusha eventos específicos da Evolution para processamento no ZAPP.

**Diferença de fn_forward_to_zapp**: Foco em um tipo específico de evento, não em
encaminhamento genérico.

**Estratégia de correção**: Igual ao padrão de fn_forward_to_zapp — via tabela de outbox
ou chamada a edge function com service_role key.

**Critério de aceite**:
- [ ] Eventos continuam sendo processados corretamente
- [ ] Zero `net.http_post` direto na função

---

### 4.8 `evo.fn_health_ping_evolution` — Health Check (Baixo Risco)

**Propósito**: Verifica se a Evolution API está respondendo via HTTP GET de saúde.

**Risco baixo**: Função de monitoramento — uma falha aqui não impacta fluxo de negócio,
apenas observabilidade.

**Estratégia de correção**:
```sql
-- ANTES (health ping direto):
SELECT net.http_get(
  url := 'https://evolution.atomicabr.com.br/health',
  headers := jsonb_build_object('apikey', 'hardcoded-key')
);

-- DEPOIS (via vault):
DECLARE
  v_url TEXT := ops.fn_evo_url_v2();
  v_key TEXT := ops.fn_evo_key_v2();
BEGIN
  RETURN (SELECT status FROM net.http_get(
    url     := v_url || '/health',
    headers := jsonb_build_object('apikey', v_key)
  ));
END;
```

**Critério de aceite**:
- [ ] Health check continua funcionando
- [ ] Usa vault em vez de URL/key hardcoded

---

### 4.9 `zapp.fn_send_whatsapp_via_pgnet` — Envio WA (Alto Risco)

**Propósito**: Envia mensagem WhatsApp via Evolution API diretamente de PL/pgSQL.

**Por que é crítico**: Função de envio de mensagem — caminho crítico de produção. Qualquer
interrupção impacta entrega de mensagens aos clientes.

**Estratégia de correção**:
```sql
-- ANTES (envio direto bypass):
SELECT net.http_post(
  url     := 'https://evolution.atomicabr.com.br/message/sendText/' || p_instance,
  headers := jsonb_build_object(
    'apikey',       'hardcoded-or-fetched-key',
    'Content-Type', 'application/json'
  ),
  body    := jsonb_build_object(
    'number',  p_phone,
    'textMessage', jsonb_build_object('text', p_message)
  )::TEXT
);

-- DEPOIS (via edge function evolution-api — gateway canônico):
-- Opção A: Inserir em fila de despacho (preferencial para alta volumetria):
INSERT INTO zapp.message_dispatch_queue (
  instance_name,
  recipient_phone,
  message_text,
  priority,
  created_at
) VALUES (p_instance, p_phone, p_message, 'normal', NOW());
-- Edge function fn_outbound_dispatch lê a fila e chama evolution-api

-- Opção B: Chamar edge function diretamente (para envios síncronos):
SELECT net.http_post(
  url     := current_setting('app.supabase_url') || '/functions/v1/evolution-api',
  headers := jsonb_build_object(
    'Authorization', 'Bearer ' || current_setting('app.service_role_key'),
    'Content-Type',  'application/json',
    'x-evolution-action', 'sendText'
  ),
  body    := jsonb_build_object(
    'instanceName', p_instance,
    'number',       p_phone,
    'text',         p_message
  )::TEXT
);
```

**Critério de aceite**:
- [ ] Mensagens WhatsApp continuam sendo enviadas sem interrupção
- [ ] Smoke test de envio de mensagem em produção passa
- [ ] Zero URL Evolution hardcoded na função

---

### 4.10 `zapp.fn_trigger_evolution_send` — Trigger de Envio (Alto Risco)

**Propósito**: Aciona o envio de mensagem pela Evolution API via pg_net.

**Diferença de fn_send_whatsapp_via_pgnet**: Esta pode ser a função de trigger (chama a
evolution diretamente), enquanto fn_send_whatsapp_via_pgnet pode ser a construção do payload.

**Dependências prováveis**: Chamada pelo pipeline de despacho (`fn_outbound_dispatch`
ou similar) ou por trigger de tabela `zapp.messages`.

**Estratégia de correção**: Igual ao padrão Opção A/B acima — via fila ou edge function.

**Critério de aceite**:
- [ ] Pipeline de despacho continua enviando mensagens
- [ ] Nenhuma regressão em testes de envio

---

### 4.11 `zapp.fn_notify_evolution_status` — Notificação de Status (Médio Risco)

**Propósito**: Notifica a Evolution API sobre mudanças de status no lado do ZAPP.

**Exemplo**: Quando usuário marca conversa como resolvida, notifica Evolution para
atualizar o estado da instância.

**Estratégia de correção**:
```sql
-- DEPOIS (via ops.fn_evo_url_v2 + ops.fn_evo_key_v2):
DECLARE
  v_base_url TEXT := ops.fn_evo_url_v2();
  v_api_key  TEXT := ops.fn_evo_key_v2();
BEGIN
  PERFORM net.http_post(
    url     := v_base_url || '/instance/connectionState/' || p_instance,
    headers := jsonb_build_object(
      'apikey',       v_api_key,
      'Content-Type', 'application/json'
    ),
    body    := jsonb_build_object('status', p_new_status)::TEXT
  );
END;
```

**Critério de aceite**:
- [ ] Notificações de status chegam à Evolution corretamente
- [ ] Sem URL hardcoded; usa vault via ops.*_v2

---

### 4.12 `zapp.fn_request_qr_code` — Solicitar QR Code (Médio Risco)

**Propósito**: Solicita um QR code à Evolution API para conexão de instância WhatsApp.

**Dependências**: Possivelmente chamada pelo fluxo de onboarding/reconexão de instância.

**Estratégia de correção**:
```sql
-- DEPOIS (via vault):
DECLARE
  v_url TEXT := ops.fn_evo_url_v2() || '/instance/qrcode/' || p_instance_name;
  v_key TEXT := ops.fn_evo_key_v2();
BEGIN
  RETURN (
    SELECT content::JSONB
    FROM net.http_get(
      url     := v_url,
      headers := jsonb_build_object('apikey', v_key)
    )
  );
END;
```

**Critério de aceite**:
- [ ] QR code gerado corretamente no fluxo de onboarding
- [ ] Sem credenciais hardcoded

---

### 4.13 `zapp.fn_poll_instance_status` — Poll de Status (Médio Risco)

**Propósito**: Verifica periodicamente o status de uma instância WhatsApp.

**Dependências**: Provavelmente chamada por cron job de monitoramento de instâncias.

**Estratégia de correção**:
```sql
-- DEPOIS (via vault):
DECLARE
  v_url    TEXT := ops.fn_evo_url_v2() || '/instance/connectionState/' || p_instance;
  v_key    TEXT := ops.fn_evo_key_v2();
  v_status TEXT;
BEGIN
  SELECT (content::JSONB ->> 'state')
  INTO   v_status
  FROM   net.http_get(
    url     := v_url,
    headers := jsonb_build_object('apikey', v_key)
  );

  -- Atualizar tabela local de status
  UPDATE zapp.whatsapp_connections
  SET    connection_status = v_status,
         last_polled_at   = NOW()
  WHERE  instance_name    = p_instance;

  RETURN v_status;
END;
```

**Critério de aceite**:
- [ ] Status de instâncias atualizado corretamente
- [ ] Cron de polling continua funcionando

---

### 4.14 `zapp.fn_disconnect_instance_pgnet` — Desconectar Instância (Médio Risco)

**Propósito**: Desconecta uma instância WhatsApp via chamada HTTP à Evolution API.

**Dependências**: Chamada durante offboarding de workspace ou manutenção de instância.

**Estratégia de correção**:
```sql
-- DEPOIS (via vault):
DECLARE
  v_base_url TEXT := ops.fn_evo_url_v2();
  v_api_key  TEXT := ops.fn_evo_key_v2();
BEGIN
  PERFORM net.http_delete(
    url     := v_base_url || '/instance/logout/' || p_instance_name,
    headers := jsonb_build_object('apikey', v_api_key)
  );

  -- Registrar desconexão localmente
  UPDATE zapp.whatsapp_connections
  SET    connection_status = 'disconnected',
         disconnected_at  = NOW()
  WHERE  instance_name    = p_instance_name;
END;
```

**Critério de aceite**:
- [ ] Instâncias desconectadas corretamente
- [ ] Log de desconexão registrado em `zapp.whatsapp_connections`

---

## 5. Priorização por Risco e Impacto

### Grupo A — Prioridade Crítica (Corrigir primeiro: E26–E27)

| Função | Schema | Motivo da Prioridade |
|--------|--------|---------------------|
| `fn_call_evolution_api_direct` | `evo` | Bypass mais amplo — payload arbitrário sem auditoria |
| `fn_send_whatsapp_via_pgnet` | `zapp` | Caminho crítico de envio de mensagens |
| `fn_trigger_evolution_send` | `zapp` | Pipeline de despacho de mensagens |
| `fn_trigger_zapp_action` | `evo` | Ação genérica com dependências múltiplas desconhecidas |

### Grupo B — Prioridade Alta (E28–E31)

| Função | Schema | Motivo |
|--------|--------|--------|
| `fn_forward_to_zapp` | `evo` | Trigger de eventos entre schemas |
| `fn_notify_zapp_webhook` | `evo` | Notificação de webhook de alta frequência |
| `fn_sync_contact_to_zapp` | `evo` | Sync contínuo de dados — pode ser simplificado para SQL direto |
| `fn_push_evolution_event` | `evo` | Push de eventos do pipeline principal |

### Grupo C — Prioridade Média (E32–E37)

| Função | Schema | Motivo |
|--------|--------|--------|
| `fn_broadcast_message_status` | `evo` | Impacta UX de status de mensagem |
| `fn_notify_evolution_status` | `zapp` | Sincronização de status |
| `fn_poll_instance_status` | `zapp` | Cron de monitoramento |
| `fn_request_qr_code` | `zapp` | Fluxo de onboarding |
| `fn_disconnect_instance_pgnet` | `zapp` | Offboarding de instâncias |

### Grupo D — Prioridade Baixa (E38)

| Função | Schema | Motivo |
|--------|--------|--------|
| `fn_health_ping_evolution` | `evo` | Monitoramento — não impacta fluxo de negócio |

---

## 6. Template Padrão de Refatoração (Antes → Depois)

### 6.1 Padrão A — Chamada à Evolution API (URL hardcoded → vault)

```sql
-- ============================================================
-- PADRÃO A: Substituir URL/key hardcoded por ops.fn_evo_*_v2()
-- Aplicável a: fn_call_evolution_api_direct, fn_health_ping_evolution,
--              fn_notify_evolution_status, fn_request_qr_code,
--              fn_poll_instance_status, fn_disconnect_instance_pgnet
-- ============================================================

-- ANTES (violação I4):
CREATE OR REPLACE FUNCTION evo.fn_exemplo_bypass()
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  PERFORM net.http_post(
    url     := 'https://evolution.atomicabr.com.br/endpoint',
    headers := jsonb_build_object('apikey', 'hardcoded-key-here'),
    body    := '{}'
  );
END;
$$;

-- DEPOIS (I4 compliant):
CREATE OR REPLACE FUNCTION evo.fn_exemplo_bypass()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ops, evo, public
AS $$
DECLARE
  v_url TEXT;
  v_key TEXT;
BEGIN
  -- Ler credenciais do vault via funções SECURITY DEFINER (E17)
  v_url := ops.fn_evo_url_v2();
  v_key := ops.fn_evo_key_v2();

  IF v_url IS NULL OR v_key IS NULL THEN
    RAISE EXCEPTION 'E01: credenciais Evolution não encontradas no vault';
  END IF;

  -- Instrumentar para auditoria I4
  PERFORM ops.log_pgnet_call(
    p_caller_schema   := 'evo',
    p_caller_function := 'fn_exemplo_bypass',
    p_target_url      := v_url || '/endpoint',
    p_http_method     := 'POST',
    p_is_gateway      := TRUE
  );

  PERFORM net.http_post(
    url     := v_url || '/endpoint',
    headers := jsonb_build_object(
      'apikey',       v_key,
      'Content-Type', 'application/json'
    ),
    body    := '{}'
  );
END;
$$;

COMMENT ON FUNCTION evo.fn_exemplo_bypass IS
  'Refatorada em E2X: usa ops.fn_evo_url_v2()/ops.fn_evo_key_v2() '
  'em vez de credenciais hardcoded. SECURITY DEFINER + search_path restrito. '
  'I4 compliant desde 2026-08-15.';
```

### 6.2 Padrão B — Sync de Dados Cross-Schema (HTTP → SQL direto)

```sql
-- ============================================================
-- PADRÃO B: Substituir HTTP por escrita SQL cross-schema
-- Aplicável a: fn_sync_contact_to_zapp (e similares)
-- Justificativa: evo e zapp estão no mesmo DB — HTTP é desnecessário
-- ============================================================

-- ANTES (sync via HTTP — violação I4 + overhead desnecessário):
CREATE OR REPLACE FUNCTION evo.fn_sync_contact_to_zapp(p_contact_id UUID)
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  PERFORM net.http_post(
    url  := 'https://zapp.atomicabr.com.br/api/sync-contact',
    body := jsonb_build_object('contact_id', p_contact_id)::TEXT
  );
END;
$$;

-- DEPOIS (sync via SQL cross-schema):
CREATE OR REPLACE FUNCTION evo.fn_sync_contact_to_zapp(p_contact_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = evo, zapp, public
AS $$
BEGIN
  INSERT INTO zapp.contatos (
    phone,
    nome,
    evo_contact_id,
    updated_at
  )
  SELECT
    ec.phone,
    COALESCE(ec.push_name, ec.notify, ec.phone),
    ec.id,
    NOW()
  FROM evo.evolution_contacts ec
  WHERE ec.id = p_contact_id
  ON CONFLICT (phone) DO UPDATE
  SET
    nome           = EXCLUDED.nome,
    evo_contact_id = EXCLUDED.evo_contact_id,
    updated_at     = NOW();
END;
$$;
```

### 6.3 Padrão C — Forward de Eventos (HTTP → Event Sourcing)

```sql
-- ============================================================
-- PADRÃO C: Substituir HTTP de notificação por event sourcing
-- Aplicável a: fn_forward_to_zapp, fn_notify_zapp_webhook,
--              fn_push_evolution_event, fn_trigger_zapp_action
-- ============================================================

-- ANTES (notificação via HTTP direto):
CREATE OR REPLACE FUNCTION evo.fn_forward_to_zapp(p_payload JSONB)
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  PERFORM net.http_post(
    url  := 'https://zapp.atomicabr.com.br/functions/v1/process-event',
    body := p_payload::TEXT
  );
END;
$$;

-- DEPOIS (event sourcing via tabela de outbox):
CREATE OR REPLACE FUNCTION evo.fn_forward_to_zapp(p_payload JSONB)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = evo, zapp, public
AS $$
BEGIN
  -- Inserir na tabela de outbox — edge function processa de forma assíncrona
  INSERT INTO zapp.evolution_event_outbox (
    event_type,
    payload,
    source_schema,
    created_at,
    status
  ) VALUES (
    p_payload ->> 'event',
    p_payload,
    'evo',
    NOW(),
    'pending'
  );
END;
$$;
-- Edge function `evolution-event-processor` lê e processa a outbox via cron
```

### 6.4 Padrão D — Envio de Mensagem (pg_net direto → fila de despacho)

```sql
-- ============================================================
-- PADRÃO D: Substituir envio direto por fila de despacho
-- Aplicável a: fn_send_whatsapp_via_pgnet, fn_trigger_evolution_send
-- Justificativa: fn_outbound_dispatch (E35) já implementa a fila
-- ============================================================

-- ANTES (envio direto bypass):
CREATE OR REPLACE FUNCTION zapp.fn_send_whatsapp_via_pgnet(
  p_instance TEXT,
  p_phone    TEXT,
  p_message  TEXT
) RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  PERFORM net.http_post(
    url     := 'https://evolution.atomicabr.com.br/message/sendText/' || p_instance,
    headers := jsonb_build_object('apikey', 'key'),
    body    := jsonb_build_object(
      'number', p_phone,
      'textMessage', jsonb_build_object('text', p_message)
    )::TEXT
  );
END;
$$;

-- DEPOIS (via fila de despacho — fn_outbound_dispatch processa):
CREATE OR REPLACE FUNCTION zapp.fn_send_whatsapp_via_pgnet(
  p_instance TEXT,
  p_phone    TEXT,
  p_message  TEXT
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = zapp, public
AS $$
DECLARE
  v_dispatch_id UUID;
BEGIN
  -- Inserir na fila de despacho — fn_outbound_dispatch (cron */2min) processa
  INSERT INTO zapp.outbound_queue (
    instance_name,
    recipient_phone,
    message_payload,
    message_type,
    status,
    created_at
  )
  VALUES (
    p_instance,
    p_phone,
    jsonb_build_object('text', p_message),
    'text',
    'pending',
    NOW()
  )
  RETURNING id INTO v_dispatch_id;

  RETURN v_dispatch_id;
END;
$$;
```

---

## 7. Sequência de Correção E25–E40

> Esta sequência complementa o [ADR-014-PHASE2-PLAN.md](./ADR-014-PHASE2-PLAN.md)
> que aborda as 16 funções reais do `pg_net_functions.json`.

### Mapeamento Nominal → Real → Etapa

| # | Função Nominal (ops.i4_violation_baseline) | Função Real (pg_net_functions.json) | Padrão | Etapa ADR-014 |
|---|-------------------------------------------|-------------------------------------|--------|--------------|
| 1 | `evo.fn_call_evolution_api_direct` | `evo.fn_detect_instance_recreate` | A | E26 |
| 2 | `evo.fn_health_ping_evolution` | `evo.fn_download_wa_status_media` | A | E27 |
| 3 | `evo.fn_notify_zapp_webhook` | `evo.fn_notify_sicoob_on_reply` | C | E28 |
| 4 | `evo.fn_sync_contact_to_zapp` | `evo.fn_sync_lid_from_api` | B/A | E29 |
| 5 | `evo.fn_trigger_zapp_action` | `evo.fn_trigger_audio_transcription` | C | E30 |
| 6 | `evo.fn_forward_to_zapp` | — | C | E30 |
| 7 | `evo.fn_push_evolution_event` | — | C | E30 |
| 8 | `evo.fn_broadcast_message_status` | — | C | E30 |
| 9 | `zapp.fn_send_whatsapp_via_pgnet` | `zapp.fn_outbound_dispatch` | D | E35 |
| 10 | `zapp.fn_trigger_evolution_send` | `zapp.fn_reconcile_dispatch` | D | E35/E36 |
| 11 | `zapp.fn_notify_evolution_status` | `zapp.fn_escalate_critical_alerts` | A | E34 |
| 12 | `zapp.fn_request_qr_code` | `zapp.fn_validate_whatsapp_connection_url` | A | E37 |
| 13 | `zapp.fn_poll_instance_status` | `zapp.fn_check_license_heartbeat` | A | E31 |
| 14 | `zapp.fn_disconnect_instance_pgnet` | `zapp.fn_collect_restore_logs` | A | E32 |

> **Nota**: O mapeamento nominal→real é inferido semanticamente, não confirmado por
> inspeção de código das funções reais (que não existem nas migrations — foram criadas
> diretamente no DB de produção). As etapas do ADR-014 abordam as funções reais pelo
> nome real.

### Timeline de Execução

```
E25  [✅ CONCLUÍDO] Remover e2e-evolution-vps.yml (I3)
      │
E26  [⏳ PENDENTE] evo.fn_detect_instance_recreate → Padrão A
E27  [⏳ PENDENTE] evo.fn_download_wa_status_media → Padrão A
E28  [⏳ PENDENTE] evo.fn_notify_sicoob_on_reply   → Padrão C
E29  [⏳ PENDENTE] evo.fn_sync_lid_from_api        → Padrão B/A
E30  [⏳ PENDENTE] evo.fn_trigger_audio_transcription → Padrão C
      │
      ▼ Marco: 5 funções evo.* corrigidas (I4 ainda FAIL)
      │
E31  [⏳ PENDENTE] zapp.fn_check_license_heartbeat → Padrão A
E32  [⏳ PENDENTE] zapp.fn_collect_restore_logs    → Padrão A
E33  [⏳ PENDENTE] zapp.fn_cookie_probe_dispatch   → Padrão A
              zapp.fn_cookie_real_probe         → Padrão A
E34  [⏳ PENDENTE] zapp.fn_escalate_critical_alerts → Padrão A/C
E35  [⏳ PENDENTE] zapp.fn_outbound_dispatch        → Padrão D
E36  [⏳ PENDENTE] zapp.fn_reconcile_dispatch       → Padrão D
E37  [⏳ PENDENTE] zapp.fn_send_bitrix_alert        → Padrão C
              zapp.fn_validate_whatsapp_connection_url → Padrão A
E38  [⏳ PENDENTE] zapp.notify_sicoob_on_reply      → Padrão C
      │
      ▼ Marco: 15 funções zapp.* e evo.* corrigidas
      │
E39  [⏳ PENDENTE] Validar I4 = PASS + documentar
E40  [⏳ PENDENTE] Medir T2 + tag decouple-t2
```

---

## 8. Critérios de Aceite por Função Nominal

Para cada uma das 14 funções nominais, o critério de aceite é:

### Critério Universal (aplicável a todas as 14)

1. **Auditoria SQL**: `SELECT prosrc FROM pg_proc JOIN pg_namespace ON pronamespace=oid WHERE nspname IN ('zapp','evo') AND proname = '<nome_funcao>'` não deve conter strings `net.http_post(`, `net.http_get(`, `extensions.http_post(` com URLs hardcoded.

2. **Vault usado**: A função usa `ops.fn_evo_url_v2()` e/ou `ops.fn_evo_key_v2()` quando precisa de credenciais Evolution.

3. **SECURITY DEFINER**: Funções refatoradas têm `SECURITY DEFINER` e `SET search_path` restrito.

4. **Instrumentação**: `ops.log_pgnet_call(...)` chamada com `p_is_gateway := TRUE` quando a função mantém uso de `net.http_*` (ex: lendo do vault e passando pelo gateway, não bypass).

5. **Tabela baseline atualizada**:
   ```sql
   UPDATE ops.i4_violation_baseline
   SET resolved_date = CURRENT_DATE,
       resolved_in   = 'migration 20260815XXXXXX_decouple_E2X_corrige_<nome>.sql'
   WHERE function_name = '<nome>'
     AND schema_name   = '<schema>';
   ```

6. **pg_net_functions.json T2**: Reexecução da query de auditoria não retorna a função.

### Critérios Específicos por Grupo

**Grupo A (chamadas Evolution via vault)**:
- [ ] `ops.fn_evo_url_v2()` retorna URL correta do vault
- [ ] `ops.fn_evo_key_v2()` retorna API key correta do vault
- [ ] Chamada HTTP ainda funciona via net.http_* mas com URL/key do vault

**Grupo B (sync cross-schema via SQL)**:
- [ ] Dados sincronizados corretamente sem HTTP
- [ ] Performance igual ou melhor que versão anterior
- [ ] Sem dependência de HTTP para dados que existem localmente

**Grupo C (event sourcing via outbox)**:
- [ ] Tabela de outbox recebe eventos corretamente
- [ ] Edge function processadora lê e processa a outbox
- [ ] Eventos não perdidos durante a transição

**Grupo D (envio via fila)**:
- [ ] Fila de despacho (`zapp.outbound_queue` ou equivalente) recebe mensagens
- [ ] `fn_outbound_dispatch` (cron */2min) processa a fila
- [ ] Taxa de entrega de mensagens mantida

---

## 9. Atualização da Tabela ops.i4_violation_baseline

Ao concluir cada etapa, executar:

```sql
-- Template de atualização — substituir valores conforme a etapa concluída
UPDATE ops.i4_violation_baseline
SET
  resolved_date = CURRENT_DATE,
  resolved_in   = 'E2X — migration 20260815XXXXXX_decouple_e2X_*.sql',
  notes         = notes || ' [CORRIGIDA em E2X — usa ' ||
                  CASE violation_type
                    WHEN 'pg_net' THEN 'ops.fn_evo_url_v2() + ops.fn_evo_key_v2()'
                    ELSE 'padrão via gateway'
                  END ||
                  '. I4 compliant.]'
WHERE function_name = '<nome_funcao>'
  AND schema_name   = '<schema>';

-- Verificar progresso após cada atualização:
SELECT * FROM ops.v_i4_correction_progress;
```

---

## 10. Referências

| Documento | Relevância |
|-----------|-----------|
| [`ADR-014-PHASE2-PLAN.md`](./ADR-014-PHASE2-PLAN.md) | Plano executivo E25–E40 (funções reais) |
| [`ADR-013-PHASE1-PLAN.md`](./ADR-013-PHASE1-PLAN.md) | Fundação Fase 1 (concluída) |
| [`DECOUPLING.md`](./DECOUPLING.md) | Documento mestre do desacoplamento |
| [`baseline/20260815/pg_net_functions.json`](./baseline/20260815/pg_net_functions.json) | Medição real T0 (16 funções) |
| [`ADR-012-T0-MEASUREMENT.md`](./ADR-012-T0-MEASUREMENT.md) | Score T0 completo (3/9) |
| `supabase/migrations/20260815010000_decouple_e8_pgnet_instrumentation.sql` | Migration que criou a tabela baseline |
| `supabase/migrations/20260815030000_decouple_e17_fn_evo_v2.sql` | Migration das funções vault v2 |
| `supabase/functions/_shared/providers/evolution/client.ts` | Gateway único (12 verbos) |

---

*Documento criado em E25 (2026-08-15) para preparação das correções I4 (E26–E38).*
*Atualizar `resolved_date` em `ops.i4_violation_baseline` conforme cada função for corrigida.*
