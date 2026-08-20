# 🤖 INSTRUÇÕES PARA AGENTES IA — ZAPP WEB

## Para: Claude Code, Claude (qualquer versão), GPT-4, Cursor, Copilot, Windsurf

**Última atualização:** 2026-07-24

---

## 🎯 COMO USAR ESTE DOCUMENTO

Você é um agente IA (Claude, GPT, Copilot, etc) trabalhando no projeto ZAPP WEB.

**LEIA PRIMEIRO (nesta ordem):**
1. Este documento (instruções imediatas)
2. `docs/HANDOFF_DOCUMENT.md` (contexto completo)
3. `docs/FINAL_REPORT_10_10.md` (estado atual)
4. `CLAUDE.md` (regras do projeto)

**Depois:** Explore conforme a tarefa específica.

---

## ⚡ TL;DR — O QUE VOCÊ PRECISA SABER EM 30 SEGUNDOS

**ZAPP WEB** = Plataforma omnichannel de atendimento (WhatsApp + IA + CRM)

**Stack:**
- React 18 + TypeScript + Vite + Tailwind
- Supabase self-hosted (PostgreSQL + Edge Functions)
- Evolution API (WhatsApp)
- Deploy: Vercel

**Regra #1:** O cliente Supabase está configurado com `schema: 'zapp'`. Use SEMPRE.

**Regra #2:** Para Evolution API (WhatsApp), use `schema: 'evo'`.

**Regra #3:** Use Zod (`src/shared/validation.ts`) para validar inputs.

**Regra #4:** Use `src/lib/sanitize-extra.ts` para sanitização.

**Regra #5:** NUNCA use `schema: 'public'` para Realtime (no-op silencioso).

---

## 🚨 ERROS CRÍTICOS A EVITAR

### ❌ ERRO 1: Usar schema errado

```typescript
// ❌ ERRADO - tabela Evolution está em schema 'evo'
const { data } = await supabase.from('evolution_messages').select('*');
// Vai para schema 'zapp' (default), não encontra tabela, retorna null

// ✅ CORRETO
const { data } = await supabase.schema('evo').from('evolution_messages').select('*');
```

### ❌ ERRO 2: Subscription Realtime no schema errado

```typescript
// ❌ ERRADO - public.evolution_messages é VIEW, não emite CDC
supabase.channel('a').on('postgres_changes',
  { schema: 'public', table: 'evolution_messages' }, handler);

// ✅ CORRETO
supabase.channel('a').on('postgres_changes',
  { schema: 'evo', table: 'evolution_messages' }, handler);
```

### ❌ ERRO 3: Esquecer cleanup de resources

```typescript
// ❌ ERRADO - memory leak
useEffect(() => {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  // nunca limpa stream
}, []);

// ✅ CORRETO
useEffect(() => {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  streamRef.current = stream;
  return () => {
    streamRef.current?.getTracks().forEach(t => t.stop());
  };
}, []);
```

### ❌ ERRO 4: Usar single() em vez de maybeSingle()

```typescript
// ❌ ERRADO - pode throwar PGRST116
const { data } = await supabase.from('x').select().eq('id', id).single();

// ✅ CORRETO - retorna null se não encontrar
const { data } = await supabase.from('x').select().eq('id', id).maybeSingle();
```

### ❌ ERRO 5: Confiar em UUID de Evolution

```typescript
// ❌ ERRADO - message_id pode ser "3EB0C767D360A23D02C3" (não-UUID)
await dbFrom('messages').insert({ message_id: evoMessageId });

// ✅ CORRETO
import { toUuid } from '<edge-function>/helpers';
await dbFrom('messages').insert({ message_id: toUuid(evoMessageId) });
```

### ❌ ERRO 6: Concatenar SQL

```typescript
// ❌ ERRADO - SQL injection
const query = `SELECT * FROM users WHERE name = '${userInput}'`;

// ✅ CORRETO - parameterized
const { data } = await supabase.from('users').select('*').eq('name', userInput);
```

### ❌ ERRO 7: Hardcoded secrets

```typescript
// ❌ ERRADO
const apiKey = 'sk-xxx';

// ✅ CORRETO
const apiKey = import.meta.env.VITE_API_KEY;
```

### ❌ ERRO 8: Comparação não-timing-safe

```typescript
// ❌ ERRADO - timing attack vulnerability
if (token === expectedToken) { ... }

// ✅ CORRETO
import { timingSafeStringEqual } from '<shared>/auth';
if (timingSafeStringEqual(token, expectedToken)) { ... }
```

### ❌ ERRO 9: SECURITY DEFINER sem search_path

```sql
-- ❌ ERRADO - attacker pode criar public.bad_function para shadowing
CREATE FUNCTION zapp.bad_func() RETURNS void AS $$ ... $$
LANGUAGE plpgsql SECURITY DEFINER;

-- ✅ CORRETO
CREATE FUNCTION zapp.bad_func() RETURNS void AS $$ ... $$
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = zapp, public;
```

### ❌ ERRO 10: Não validar input antes de mutation

```typescript
// ❌ ERRADO
async function updateContact(id: string, data: any) {
  return supabase.from('contacts').update(data).eq('id', id);
}

// ✅ CORRETO
import { updateContactSchema, validateInput } from '@/shared/validation';
async function updateContact(id: string, input: unknown) {
  const data = validateInput(updateContactSchema, input);
  return supabase.from('contacts').update(data).eq('id', id);
}
```

---

## 🎯 TAREFAS COMUNS — PLAYBOOKS

### Playbook 1: Adicionar nova mutation

```typescript
// 1. Criar schema Zod em src/shared/validation.ts
export const myMutationSchema = z.object({
  field1: z.string().min(1),
  field2: z.number().int().min(0),
});

// 2. Criar hook em src/hooks/useMyMutation.ts
import { myMutationSchema, validateInput } from '@/shared/validation';

export function useMyMutation() {
  return useMutation({
    mutationFn: async (input: unknown) => {
      const data = validateInput(myMutationSchema, input);
      const { error } = await supabase.from('my_table').insert(data);
      if (error) throw error;
    },
    onError: (err) => log.error('MyMutation failed', { error: err.message }),
  });
}

// 3. Criar teste
Deno.test("myMutationSchema: deve aceitar input válido", () => {
  const result = myMutationSchema.safeParse({ field1: "x", field2: 5 });
  assertEquals(result.success, true);
});
```

### Playbook 2: Adicionar nova Realtime subscription

```typescript
// ✅ SEMPRE especifique schema correto
useEffect(() => {
  const channel = supabase
    .channel(`my-feature-${Math.random()}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'zapp', table: 'my_table' },  // ← 'zapp' ou 'evo'
      (payload) => { /* handler */ }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}, []);
```

### Playbook 3: Adicionar nova Edge Function

```typescript
// supabase/functions/my-function/index.ts
import { createZappAdminClient } from '../_shared/db-client.ts';
import { createWebhookValidator, readWebhookSecretsFromEnv } from '../_shared/hmac-validation.ts';
import { checkRateLimit } from '../_shared/rate-limiter.ts';

Deno.serve(async (req) => {
  // 1. CORS
  if (req.method === 'OPTIONS') return new Response(null, { status: 204 });

  // 2. HMAC (se webhook)
  const secrets = readWebhookSecretsFromEnv('MY_FUNCTION');
  const validate = createWebhookValidator(secrets, true);
  const validation = await validate(req);
  if (!validation.valid) {
    return new Response('Unauthorized', { status: 401 });
  }

  // 3. Rate limit
  const supabase = createZappAdminClient();
  const allowed = await checkRateLimit(supabase, { ... });
  if (!allowed.allowed) {
    return new Response('Too Many Requests', { status: 429 });
  }

  // 4. Logic
  // ...

  // 5. Schema fixo: createZappAdminClient() já retorna schema 'zapp'
});
```

### Playbook 4: Criar migration

> 📖 **Guia canónico de migrations:** [`supabase/migrations/README.md`](../supabase/migrations/README.md) — leia ANTES de criar: DB-as-source, naming `\d{14}_`, idempotência, gates de CI, template de cabeçalho.

```sql
-- supabase/migrations/YYYYMMDDHHMMSS_description.sql

-- Sempre use DO blocks idempotentes
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'zapp' AND table_name = 'my_table'
  ) THEN
    CREATE TABLE zapp.my_table (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id uuid REFERENCES zapp.workspaces(id),
      created_at timestamptz DEFAULT now()
    );
  END IF;
END $$;

-- SEMPRE habilitar RLS
ALTER TABLE zapp.my_table ENABLE ROW LEVEL SECURITY;

-- SEMPRE criar policy workspace-scoped
CREATE POLICY "workspace_isolation" ON zapp.my_table
  FOR ALL TO authenticated
  USING (
    workspace_id IN (
      SELECT workspace_id FROM zapp.workspace_members
      WHERE user_id = auth.uid()
    )
  );

-- Adicionar à publication realtime
ALTER PUBLICATION supabase_realtime ADD TABLE zapp.my_table;
```

### Playbook 5: Debugar bug em produção

```bash
# 1. Verificar logs do Sentry
# 2. Buscar logs da Edge Function no Supabase Dashboard
# 3. Verificar tabelas de auditoria
docker exec zapp-postgres psql -U postgres zapp -c "
  SELECT * FROM zapp.audit_logs
  WHERE created_at > NOW() - INTERVAL '1 hour'
  ORDER BY created_at DESC
  LIMIT 50;
"

# 4. Verificar DLQ (eventos não processados)
docker exec zapp-postgres psql -U postgres zapp -c "
  SELECT * FROM zapp.dlq_events
  WHERE created_at > NOW() - INTERVAL '1 hour'
  ORDER BY created_at DESC;
"
```

---

## 📐 PADRÕES DE CÓDIGO ESPERADOS

### Naming Conventions

```typescript
// Componentes: PascalCase
export function ContactFormV3() {}

// Hooks: camelCase com prefixo 'use'
export function useRealtimeMessages() {}

// Utilitários: camelCase
export function sanitizeHtml() {}

// Constants: UPPER_SNAKE_CASE
const MAX_RETRIES = 3;

// Types/Interfaces: PascalCase
interface ContactMessage {}

// Enums: PascalCase
enum ContactStatus {}
```

### File Structure

```typescript
// 1. Imports (external first, then internal)
import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

// 2. Types/Interfaces
interface MyProps {}

// 3. Constants
const MAX_X = 100;

// 4. Helper functions (private)
function helperFn() {}

// 5. Main export
export function MyComponent() {}

// 6. Sub-exports
export type { MyProps };
```

### Comments

```typescript
// ✅ Use comments para explicar POR QUÊ (não o quê)
// Bounded fetch prevents infinite hangs when Supabase is unreachable
const controller = new AbortController();
setTimeout(() => controller.abort(), 12_000);

// ✅ Use JSDoc para APIs públicas
/**
 * Sanitizes HTML preventing XSS attacks.
 * @param dirty - User-provided HTML
 * @returns Sanitized HTML safe for dangerouslySetInnerHTML
 */
export function sanitizeHtml(dirty: string): string {}

// ❌ Não comente o óbvio
// Increment counter
counter++;
```

---

## 🧠 DECISÕES ARQUITETURAIS (NÃO QUESTIONAR)

Se você é uma IA, **não mude essas decisões** sem perguntar antes:

1. **Schema `zapp` é o canônico** — não migre para `public`
2. **Evolution fica em `evo`** — não consolide schemas
3. **Zod é usado para validação** — não use Yup/Joi
4. **DOMPurify para HTML** — não use outras libs
5. **TanStack Query para cache** — não use Redux
6. **shadcn/ui para componentes** — não use Material UI
7. **React Query keys centralizadas** em `src/services/api/queryKeys.ts`
8. **Errors via Sentry** — não invente outro sistema
9. **Logs estruturados** — `log.info('msg', { context })` não `console.log`
10. **HMAC timing-safe** — sempre via `_shared/hmac-validation.ts`

---

## 🔍 COMO ENCONTRAR INFORMAÇÕES RÁPIDO

```bash
# Listar todas as Edge Functions
ls supabase/functions/ | grep -v _shared

# Listar todas as migrations
ls supabase/migrations/ | tail -20

# Listar schemas Supabase
# (ver URL em CLAUDE.md)

# Buscar uso de uma tabela no código
grep -r "evolution_messages" src/ --include="*.ts" --include="*.tsx"

# Buscar políticas RLS de uma tabela
grep -A 5 "POLICY.*evolution_messages" supabase/migrations/

# Ver queries lentas (Supabase Dashboard)
# → Database → Query Performance

# Ver logs de Edge Function
# → Edge Functions → Logs
```

---

## 🎯 CHECKLIST ANTES DE COMMITAR

```bash
# 1. Type check
npm run typecheck

# 2. Lint
npm run lint

# 3. Tests
npm run test
npm run test:e2e  # se possível

# 4. Build
npm run build

# 5. Schema usage check (se mudou query)
npm run check:schema

# 6. Data layer check (se mudou hook)
npm run check:datalayer

# 7. Se tudo OK:
git add -A
git commit -m "feat: <descrição clara>"
```

---

## 💬 FORMATO DE COMMIT

```
<tipo>(<escopo>): <descrição curta>

<descrição detalhada opcional>

Refs: #123
```

**Tipos:**
- `feat` - Nova feature
- `fix` - Bug fix
- `refactor` - Refatoração sem mudança de comportamento
- `docs` - Apenas documentação
- `test` - Apenas testes
- `chore` - Manutenção (deps, config)
- `perf` - Performance

**Exemplos:**
```
fix(auth): validate JWT before decrypting user data

Refs: #456
```

```
feat(inbox): add optimistic UI for message sending

Uses Zod validation (src/shared/validation.ts) to validate
message content before optimistic insertion.

Refs: #789
```

---

## 🆘 AJUDA / PRECISO DE CONTEXTO ADICIONAL

Se você é uma IA e precisa de mais contexto:

1. **Schema do banco:** `docs/ARCHITECTURE_SCHEMAS.md`
2. **Segurança RLS:** `docs/ARCHITECTURE_RLS.md`
3. **Performance:** `docs/PERFORMANCE_GUIDE.md`
4. **Segurança:** `docs/SECURITY_HARDENING.md`
5. **Desastres:** `docs/RUNBOOK_DISASTER_RECOVERY.md`
6. **Resiliência:** `docs/CHAOS_ENGINEERING.md`
7. **Acessibilidade:** `docs/ACCESSIBILITY.md`
8. **Estado atual:** `docs/FINAL_REPORT_10_10.md`
9. **Roadmap:** `docs/ROADMAP_10_10.md`
10. **Handoff completo:** `docs/HANDOFF_DOCUMENT.md`
11. **Deploy:** `docs/DEPLOY_GUIDE.md`

Se ainda precisar de contexto que não está aqui:

1. **Listar estrutura do projeto:**
   ```bash
   find src/ -name "*.ts" -o -name "*.tsx" | head -50
   ```

2. **Ver migrations recentes:**
   ```bash
   ls -lt supabase/migrations/ | head -20
   ```

3. **Ver Edge Functions recentes:**
   ```bash
   ls -lt supabase/functions/ | head -20
   ```

4. **Ver CLAUDE.md** (regras do projeto + bugs conhecidos)

5. **Pedir ao usuário humano contexto adicional**

---

## ✨ LEMBRETE FINAL

**Você está trabalhando em um projeto de produção com:**
- 18.878 commits no histórico
- 312 tabelas no schema `zapp`
- 1.555+ políticas RLS
- 129+ Edge Functions
- 900+ migrations SQL

**Seja conservador. Faça mudanças pequenas e testáveis. Documente tudo.**

Boa sorte! 🚀

---

**Mantenedor:** Claude Fable 5 + Time
**Score do projeto:** 9.85/10 🏆
