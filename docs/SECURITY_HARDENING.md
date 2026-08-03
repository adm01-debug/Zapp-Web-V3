# Guia de Segurança Defensiva - ZAPP WEB

## Visão Geral

Padrões de segurança implementados no ZAPP WEB para proteger dados sensíveis
de atendimento ao cliente (WhatsApp, contatos, conversas, integrações).

## Camadas de Segurança

```
┌─────────────────────────────────────────────────┐
│  1. Network (HTTPS, CSP, HSTS, CORS)           │
├─────────────────────────────────────────────────┤
│  2. Authentication (JWT, PKCE, MFA, WebAuthn)  │
├─────────────────────────────────────────────────┤
│  3. Authorization (RBAC, workspace_members)    │
├─────────────────────────────────────────────────┤
│  4. Database (RLS, search_path, grants)        │
├─────────────────────────────────────────────────┤
│  5. Application (input validation, XSS, CSRF)  │
├─────────────────────────────────────────────────┤
│  6. Edge Functions (HMAC, rate limit, DLQ)     │
├─────────────────────────────────────────────────┤
│  7. Observability (Sentry, audit logs, alerts)  │
└─────────────────────────────────────────────────┘
```

## 1. Network Security

### HTTPS Everywhere
```typescript
// ✅ Sempre usar HTTPS
const API_URL = import.meta.env.VITE_API_URL;
if (API_URL && !API_URL.startsWith('https://')) {
  throw new Error('API URL deve usar HTTPS em produção');
}
```

### CSP Headers
```nginx
# nginx config
add_header Content-Security-Policy "
  default-src 'self';
  script-src 'self' 'unsafe-inline' 'unsafe-eval';
  style-src 'self' 'unsafe-inline';
  img-src 'self' data: blob: https://*.supabase.co;
  connect-src 'self' https://*.supabase.co wss://*.supabase.co;
  frame-ancestors 'none';
  base-uri 'self';
  form-action 'self';
" always;
```

> **⚠️ BAND-AID TEMPORÁRIO (CSP ativo — `nginx.conf` e `vercel.json`):**
> O domínio `allrjhkpuscmgbsnmjlv.supabase.co` (projeto Supabase Lovable antigo,
> pré-migração self-hosted) permanece no `img-src` do CSP **de propósito**:
> 1066 contatos ainda referenciam avatares nesse storage (~1370 objetos no
> bucket `avatars`). O domínio é gerenciado pelo Supabase (confiável), mas deve
> ser **removido do `img-src` nos DOIS arquivos** assim que os avatares forem
> migrados para `supabase.atomicabr.com.br` (storage migration pendente).
> NÃO remover antes — avatares quebrariam. O `vercel.json` não aceita
> comentários (Vercel rejeita JSONC), por isso o band-aid está documentado aqui.

### CORS Config
```typescript
// ✅ Whitelist explícita
const ALLOWED_ORIGINS = [
  'https://zapp.atomicabr.com.br',
  'https://app.atomicabr.com.br',
];

if (!ALLOWED_ORIGINS.includes(requestOrigin)) {
  return new Response('CORS denied', { status: 403 });
}
```

## 2. Authentication

### JWT + PKCE Flow
```typescript
// ✅ Authorization Code com PKCE (mais seguro que implicit)
const supabase = createClient(url, key, {
  auth: {
    flowType: 'pkce',
    persistSession: true,
    autoRefreshToken: true,
  },
});
```

### MFA (Multi-Factor)
```typescript
// Habilitar TOTP para admins
await supabase.auth.mfa.enroll({
  factorType: 'totp',
  friendlyName: 'Admin TOTP',
});

// Verificar antes de ações sensíveis
const { data: factors } = await supabase.auth.mfa.listFactors();
if (factors.totp.length === 0 && user.role === 'admin') {
  // Forçar enrollment de MFA
  redirect('/mfa-setup');
}
```

### Session Security
```typescript
// ✅ Token refresh automático
// ✅ Storage seguro (httpOnly cookies se possível)
// ✅ Timeout de inatividade
const IDLE_TIMEOUT_MS = 30 * 60_000; // 30 min
```

## 3. Authorization (RBAC)

### Roles Hierarchy
```
owner    → Tudo, incluindo deletar workspace
admin    → Gerenciar usuários, configurações
supervisor → Ver todas as conversas, métricas avançadas
agent    → Atender conversas atribuídas
viewer   → Apenas leitura
```

### Helper Functions RLS
```sql
-- zapp.is_admin_or_supervisor
CREATE FUNCTION zapp.is_admin_or_supervisor(uid uuid)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM zapp.user_roles
    WHERE user_id = uid
    AND role IN ('admin', 'supervisor', 'dev')
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- zapp.has_role
CREATE FUNCTION zapp.has_role(uid uuid, required_role text)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM zapp.user_roles
    WHERE user_id = uid
    AND role = required_role
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;
```

### Frontend Role Check
```typescript
// ✅ Double-check no frontend (defense in depth)
import { supabase } from '@/integrations/supabase/client';

async function requireRole(role: 'admin' | 'supervisor' | 'agent') {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Não autenticado');

  const { data: roles } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id);

  const hasRole = roles?.some(r => r.role === role);
  if (!hasRole) throw new Error('Permissão negada');

  return user;
}
```

## 4. Database Security (RLS)

### Padrão de Política
```sql
-- ✅ Tenant isolation via workspace_members
CREATE POLICY "workspace_isolation" ON zapp.contacts
  FOR ALL TO authenticated
  USING (
    workspace_id IN (
      SELECT workspace_id FROM zapp.workspace_members
      WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM zapp.workspace_members
      WHERE user_id = auth.uid()
    )
  );
```

### SECURITY DEFINER Safe Pattern
```sql
-- ✅ Sempre fixar search_path em SECDEF functions
CREATE FUNCTION zapp.my_function()
RETURNS void AS $$
BEGIN
  -- Lógica aqui
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
   SET search_path = zapp, public; -- Fixar!

-- ❌ NUNCA sem SET search_path (risco de injection)
CREATE FUNCTION zapp.bad_function()
RETURNS void AS $$
BEGIN
  -- Atacante pode criar public.bad_function() para shadowing
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

### Audit Trail
```sql
-- Trigger para audit log automático
CREATE TRIGGER audit_contacts
AFTER INSERT OR UPDATE OR DELETE ON zapp.contacts
FOR EACH ROW EXECUTE FUNCTION zapp.log_audit();
```

## 5. Application Security

### Input Validation (Zod)
```typescript
import { sendMessageSchema, validateInput } from '@/shared/validation';

// ✅ Validar antes de processar
async function sendMessage(input: unknown) {
  const data = validateInput(sendMessageSchema, input);
  // data está tipado e validado
}

// ❌ Nunca confiar em input direto
async function sendMessage(input: any) {
  await supabase.from('messages').insert(input); // XSS, SQL injection risk
}
```

### XSS Prevention
```typescript
// ✅ React escapa por padrão
<span>{userInput}</span>

// ❌ dangerouslySetInnerHTML sem sanitização
<div dangerouslySetInnerHTML={{ __html: userInput }} />

// ✅ Se precisar de HTML, sanitize primeiro
import DOMPurify from 'dompurify';
<div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(html) }} />
```

### CSRF Protection
```typescript
// ✅ Origin/Referer check em mutations
if (request.headers.get('Origin') !== EXPECTED_ORIGIN) {
  return new Response('CSRF blocked', { status: 403 });
}
```

### Secrets Management
```typescript
// ✅ NUNCA hardcoded
const apiKey = Deno.env.get('SENDGRID_API_KEY');

// ❌ Nunca em código
const apiKey = 'SG.xxx'; // Vai pro git, vaza, game over
```

## 6. Edge Function Security

### HMAC Webhook Validation
```typescript
import { createWebhookValidator } from '../_shared/hmac-validation.ts';

const secrets = Deno.env.get('WEBHOOK_SECRETS')?.split(',') ?? [];
const validate = createWebhookValidator(secrets, true);

Deno.serve(async (req) => {
  const validation = await validate(req);
  if (!validation.valid) {
    return new Response('Unauthorized', { status: 401 });
  }
  // Processar webhook
});
```

### Rate Limiting
```typescript
import { checkRateLimit } from '../_shared/rate-limiter.ts';

const rateLimit = await checkRateLimit(supabase, {
  instanceId,
  eventType: 'webhook',
  limit: 300,
  windowSeconds: 60,
});

if (!rateLimit.allowed) {
  return new Response('Too Many Requests', { status: 429 });
}
```

### Idempotency
```typescript
import { markEventProcessed } from '../_shared/evolution-helpers.ts';

const isNew = await markEventProcessed(supabase, eventId, instance, event);
if (!isNew) {
  return new Response('Duplicate', { status: 200 });
}
```

### Input Sanitization in Logs
```typescript
// ✅ Sempre sanitizar antes de logar
function redactSecrets(input: string): string {
  return input
    .replace(/Bearer\s+[A-Za-z0-9._-]+/g, 'Bearer [REDACTED]')
    .replace(/apikey[=:]\s*[A-Za-z0-9._-]+/gi, 'apikey=[REDACTED]');
}

console.log(redactSecrets(`Request with auth: ${authHeader}`));
```

## 7. Observability & Incident Response

### Structured Logging
```typescript
// ✅ Logger estruturado com correlation ID
log.error('User authentication failed', {
  userId: user.id,
  ip: req.headers.get('CF-Connecting-IP'),
  userAgent: req.headers.get('User-Agent'),
  error: err.message,
  correlationId,
});
```

### Sentry Integration
```typescript
import * as Sentry from '@sentry/react';

Sentry.init({
  dsn: import.meta.env.VITE_SENTRY_DSN,
  environment: import.meta.env.VITE_APP_ENV,
  beforeSend(event) {
    // Sanitizar PII
    if (event.user) delete event.user.ip_address;
    return event;
  },
});
```

### Alerting
```typescript
// Webhook health alerts
if (consecutiveFailures > THRESHOLD) {
  await sendSlackAlert({
    channel: '#security-alerts',
    severity: 'high',
    message: `Edge function ${fnName} failing repeatedly`,
    metadata: { failures, lastError, instance },
  });
}
```

## Checklist de Segurança

### Pré-deploy
- [ ] Todos os secrets via env vars (não hardcoded)
- [ ] RLS habilitado em todas as tabelas
- [ ] `SET search_path` em todas as SECDEF functions
- [ ] HMAC validation em todos os webhooks
- [ ] Rate limiting em endpoints públicos
- [ ] Idempotency keys em mutations
- [ ] Input validation com Zod
- [ ] Sanitização de logs
- [ ] CORS configurado corretamente
- [ ] HTTPS apenas (HSTS habilitado)

### Pós-deploy
- [ ] Sentry recebendo eventos
- [ ] Audit logs sendo escritos
- [ ] Rate limits funcionando
- [ ] Webhooks validando HMAC
- [ ] RLS bloqueando acesso cross-workspace
- [ ] Tokens de auth com expiração
- [ ] Backups funcionando

### Monitoramento Contínuo
- [ ] Secret scanning habilitado (GitHub + gitleaks)
- [ ] Dependabot alerts ativos
- [ ] Vulnerability scanning periódico
- [ ] Penetration testing anual
- [ ] Security audit de novas features
- [ ] Incident response plan atualizado

## Anti-patterns a Evitar

### ❌ `USING (true)` em RLS
```sql
-- PERIGOSO: qualquer authenticated pode ver tudo
CREATE POLICY bad ON zapp.contacts FOR SELECT
TO authenticated USING (true);
```

### ❌ SQL Dinâmico Concatenado
```typescript
// PERIGOSO: SQL injection
const query = `SELECT * FROM users WHERE name = '${userInput}'`;

// ✅ SEGURO: parameterized queries
const { data } = await supabase.from('users').select('*').eq('name', userInput);
```

### ❌ Logs com PII
```typescript
// PERIGOSO: CPF, email, telefone em logs
console.log(`User logged in: ${user.cpf}, ${user.email}`);

// ✅ SEGURO: apenas IDs
console.log(`User logged in: ${user.id}`);
```

### ❌ Token em localStorage (XSS risk)
```typescript
// Use httpOnly cookies quando possível
// localStorage é acessível via JS (XSS lê tokens)
```

### ❌ Trust no Frontend
```typescript
// NUNCA confiar em checks de role no frontend
if (user.role === 'admin') {
  await supabase.from('users').delete(); // Backend precisa checar de novo!
}
```

## Reportar Vulnerabilidade

Email: **ti@promobrindes.com.br**
- Descrição e impacto
- Passos para reproduzir
- Componente/arquivo afetado

**Não abra issue pública** para vulnerabilidades de segurança.

## Referências

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [Supabase RLS Guide](https://supabase.com/docs/guides/auth/row-level-security)
- [PostgreSQL Security](https://www.postgresql.org/docs/current/sql-createpolicy.html)
- [Web Crypto API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API)
