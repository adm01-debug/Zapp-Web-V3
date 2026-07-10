# API_CONTRACT.md — Contrato de Interface Frontend → Banco

> **Atualizado em:** 2026-07-05  
> **Relacionado a:** [DECISION.md](./DECISION.md) — ADR-001

Este documento descreve as regras de contrato que o **frontend** (e qualquer integração) DEVE respeitar ao escrever dados nas tabelas do `zapp` self-hosted.

---

## 1. Resolução de Schema pelo PostgREST

O PostgREST expõe o schema `public` como camada API. O `authenticated` role usa:

```
search_path = evo, public, extensions
pgrst.db_schemas = public, storage, graphql_public, artes, vendas, financeiro, zapp, bpm, email_app, ai, evo
```

**Implicação:** RPCs chamadas via `.rpc('nome')` resolvem no schema `public`. As **views** `public.*` são bridges para as tabelas `zapp.*`. O frontend **nunca acessa `zapp` diretamente**.

---

## 2. Enums do Cloud Disponíveis via `public`

Os 4 enums originários do Cloud estão presentes no schema `public` e acessíveis via `search_path`:

| Enum | Valores comuns | Usado em |
|---|---|---|
| `channel_type` | whatsapp, email, sms, ... | `zapp.channel_connections`, `zapp.channel_routing_rules` |
| `ai_provider_type` | openai, anthropic, ... | — |
| `app_role` | admin, agent, supervisor, ... | — |
| `service_account_type` | gmail, outlook, ... | — |

---

## 3. Colunas NOT NULL sem DEFAULT — Contrato Obrigatório

Para as tabelas abaixo, o frontend **DEVE** sempre enviar os campos listados. Omiti-los causa `null value in column violates not-null constraint`.

### 3.1 `whatsapp_official_credentials` (WhatsApp Cloud API)

Todos os 6 campos são obrigatórios sem default. O frontend deve enviar um objeto completo:

```typescript
interface WhatsAppOfficialCredentials {
  connection_id:      string;   // uuid
  access_token:       string;   // token de longa duração do Meta
  app_secret:         string;   // app secret do Meta App
  phone_number_id:    string;   // ID do número de telefone do Meta
  graph_api_version:  string;   // ex: "v18.0"
  verify_token:       string;   // token customizado para verificação de webhook
}
```

### 3.2 `conversation_transfers`

```typescript
interface ConversationTransfer {
  source_instance: string;   // nome da instância de origem
  target_instance: string;   // nome da instância de destino
  remote_jid:      string;   // JID do contato (@s.whatsapp.net ou @g.us)
  reason:          string;   // motivo da transferência
  ticket_number:   string;   // número do ticket
  // Opcionais: priority, created_at, updated_at
}
```

### 3.3 `failed_messages`

```typescript
interface FailedMessage {
  instance_name: string;   // nome da instância
  retry_count:   number;   // contador de tentativas (int4)
  max_retries:   number;   // máximo de tentativas (int4)
  status:        string;   // status atual
}
```

### 3.4 `instance_registry`

```typescript
interface InstanceRegistry {
  instance_name: string;   // nome único da instância
  display_name:  string;   // nome de exibição
  department:    string;   // departamento responsável
}
```

### 3.5 `qr_attempts`

```typescript
interface QrAttempt {
  instance_id: string;   // uuid da instância
  status:      string;   // status do QR code
}
```

### 3.6 `transfer_comments`

```typescript
interface TransferComment {
  transfer_id:    string;   // uuid da transferência
  agent_id:       string;   // uuid do agente
  author_name:    string;   // nome do autor
  author_instance: string;  // instância do autor
  content:        string;   // conteúdo do comentário
}
```

### 3.7 `team_message_receipts`

```typescript
interface TeamMessageReceipt {
  message_id:  string;   // uuid da mensagem
  profile_id:  string;   // uuid do perfil
}
```

### 3.8 `stickers`

```typescript
interface Sticker {
  image_url: string;   // URL da imagem do sticker
  // name tem NOT NULL mas tem default? Verificar
}
```

### 3.9 `connection_alert_preferences`

```typescript
interface ConnectionAlertPreference {
  user_id:    string;   // uuid do usuário
  alert_type: string;   // tipo de alerta
}
```

---

## 4. Regras de Validação TypeScript (CI Guard)

### 4.1 Proibido: casts que mascaram drift de contrato

```typescript
// ❌ PROIBIDO — mascara incompatibilidade de tipos
(supabase as any).from('tabela').select()
supabase.rpc('nome' as never, params)

// ✅ CORRETO — usar os tipos gerados
supabase.from('tabela').select()    // tipos verificados pelo TS
supabase.rpc('nome', params)        // assinatura validada
```

**ESLint rule:** `@typescript-eslint/no-explicit-any` (error) + rule customizada para `.rpc(... as never)`.

### 4.2 Geração de tipos

Tipos DEVEM ser gerados do **VPS self-hosted**, não do Cloud:

```bash
# ✅ VPS (correto)
npx supabase gen types typescript \
  --db-url "postgresql://postgres:${SUPABASE_DB_PASS}@supabase.atomicabr.com.br:5432/postgres" \
  --schema public,zapp,evo \
  > src/integrations/supabase/types.ts

# ❌ Cloud (stale — proibido)
# npx supabase gen types typescript --project-id uqysyzndkfiwfztbqvsl
```

---

## 5. Checklist de Validação Pré-Deploy

Antes de qualquer deploy de frontend:

- [ ] `SELECT * FROM ops.run_all_checks()` — todos OK
- [ ] `SELECT * FROM ops.fn_regression_tests()` — RT01→RT15 PASS
- [ ] `SELECT * FROM ops.check_mirror_integrity()` — MI-01→MI-07 OK
- [ ] Tipos TypeScript gerados do VPS (não do Cloud)
- [ ] Nenhum `as any` ou `as never` em chamadas Supabase (ESLint clean)
- [ ] Edge functions deployadas verificadas em `ops.edge_function_registry`

---

*Documento gerado automaticamente pela auditoria de espelhamento 2026-07-05.*  
*Manter sincronizado com o estado do banco via `ops.check_mirror_integrity()`.*
