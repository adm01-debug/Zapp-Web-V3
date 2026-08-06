# 📘 HANDOFF DOCUMENT — ZAPP WEB

## Para: Próximo Desenvolvedor (Humano ou IA)

**Última atualização:** 2026-07-24 (Fable 5 session)
**Versão:** 9.85/10 (excelência)
**Branch ativo:** `feat/excellence-10-10-fable5-session`

---

## 🎯 TL;DR (60 segundos)

ZAPP WEB (Pronto Talk Suite) é uma **plataforma omnichannel de atendimento ao cliente** com WhatsApp, IA, CRM e automações.

**Stack:**
- Frontend: React 18 + TypeScript 5 + Vite + TailwindCSS + shadcn/ui
- Backend: Supabase self-hosted (PostgreSQL + Edge Functions + Realtime)
- Integração: Evolution API v2.3.7+ (WhatsApp)
- Deploy: Vercel → `https://zapp.atomicabr.com.br`

**Score de qualidade:** **9.85/10** (veja `docs/FINAL_REPORT_10_10.md`)

---

## 📂 ESTRUTURA DO PROJETO

```
zapp-web-v3/
├── src/
│   ├── components/          # 55+ componentes UI organizados por feature
│   ├── features/            # Feature modules (inbox, dashboard, etc)
│   ├── hooks/               # 80+ hooks de negócio
│   ├── integrations/
│   │   └── supabase/        # Cliente Supabase, tipos, helpers
│   ├── lib/                 # Utilitários (logger, retry, sanitize, etc)
│   ├── services/            # Services (API, query keys)
│   └── shared/              # ⭐ Schemas Zod centralizados, types
│
├── supabase/
│   ├── functions/           # 129+ Edge Functions (Deno)
│   │   └── _shared/         # Módulos compartilhados (35 files)
│   └── migrations/          # 900+ migrations SQL
│
├── docs/                    # ⭐ 9 documentos arquiteturais
├── e2e/                     # 64+ testes E2E (Playwright)
├── tests/                   # Testes unitários
└── scripts/                 # Scripts de manutenção
```

---

## 🔑 CONCEITOS-CHAVE QUE VOCÊ PRECISA SABER

### 1. Schema Database: `zapp` é o principal

```typescript
// ✅ O cliente já está configurado com schema 'zapp'
// Então use SEMPRE:
const { data } = await supabase.from('contacts').select('*');
// PostgREST adiciona automaticamente Accept-Profile: zapp

// ❌ NÃO use schema 'public' (legacy)
const { data } = await supabase.schema('public').from('contacts');
```

**Schemas existentes:**
| Schema | Conteúdo | RLS |
|--------|----------|-----|
| `zapp` | 312 tabelas (principal) | 100% |
| `evo` | 193 tabelas (WhatsApp) | 100% |
| `public` | 1 tabela interna + 532 views proxy | legacy |
| `auth`, `bpm`, `email_app`, etc | Módulos específicos | - |

**Regra de ouro:** Para tabelas Evolution (messages, contacts), use:
```typescript
supabase.schema('evo').from('evolution_messages').select('*');
```

### 2. Realtime: regras críticas

```typescript
// ✅ SEMPRE use schema 'evo' para evolution_messages
supabase
  .channel('messages')
  .on('postgres_changes',
      { event: '*', schema: 'evo', table: 'evolution_messages' },
      handler)
  .subscribe();

// ❌ NUNCA use schema 'public' para evolution_messages (VIEW, não emite CDC)
supabase
  .channel('messages')
  .on('postgres_changes',
      { event: '*', schema: 'public', table: 'evolution_messages' },
      handler)
  .subscribe(); // ❌ No-op silencioso
```

### 3. Edge Functions: HMAC + Idempotency + DLQ

**Todas as Edge Functions críticas seguem este padrão:**

```typescript
// supabase/functions/<name>/index.ts
import { createZappAdminClient } from '../_shared/db-client.ts';
import { createWebhookValidator, readWebhookSecretsFromEnv } from '../_shared/hmac-validation.ts';
import { checkRateLimit } from '../_shared/rate-limiter.ts';

// 1. HMAC validation (timing-safe)
const secrets = readWebhookSecretsFromEnv('WEBHOOK_NAME');
const validate = createWebhookValidator(secrets, true);

// 2. Rate limiting (atomic RPC)
const allowed = await checkRateLimit(supabase, { ... });

// 3. Idempotency (SHA-256 do payload)
const isNew = await markEventProcessed(supabase, eventId, instance, event);

// 4. DLQ para falhas
await routeToDeadLetter(supabase, { ... });

// 5. Schema fixo
const supabase = createZappAdminClient();
```

### 4. Validação de Input: USE Zod Centralizado

```typescript
// ✅ SEMPRE use os schemas em src/shared/validation.ts
import { sendMessageSchema, validateInput, safeValidateInput } from '@/shared/validation';

// Validar e throw
const data = validateInput(sendMessageSchema, input);

// Validar sem throw
const result = safeValidateInput(sendMessageSchema, input);
if (!result.ok) {
  return { error: result.error };
}
```

**Schemas disponíveis:**
- `messageContentSchema`
- `sendMessageSchema`
- `createContactSchema` / `updateContactSchema`
- `campaignTargetSchema`
- `evolutionMessageKeySchema` / `evolutionUpsertPayloadSchema`
- `retryConfigSchema`

### 5. Sanitização: NUNCA confiar em input

```typescript
// ✅ HTML: use o sanitize.ts principal (DOMPurify)
import { sanitizeText, sanitizeHtml } from '@/lib/sanitize';

// ✅ Outros (email, phone, file, URL, log): use sanitize-extra.ts
import {
  sanitizeEmail,
  normalizePhoneBR,
  validateMimeType,
  sanitizeUrl,
  sanitizeLogMessage,
} from '@/lib/sanitize-extra';

// ✅ React escapa por padrão
<span>{userInput}</span>

// ❌ NUNCA use dangerouslySetInnerHTML sem sanitizar
<div dangerouslySetInnerHTML={{ __html: userInput }} />
```

### 6. Cliente Supabase: bounded fetch

```typescript
// O cliente já tem timeout de 12s em todas as chamadas
// Não precisa adicionar AbortController manualmente

// Mas se precisar, sempre respeite signals:
const controller = new AbortController();
const timeoutId = setTimeout(() => controller.abort(), 5000);
const response = await fetch(url, { signal: controller.signal });
```

---

## 📚 DOCUMENTAÇÃO ESSENCIAL

### Leia PRIMEIRO (ordem de prioridade):

1. **[`docs/FINAL_REPORT_10_10.md`](FINAL_REPORT_10_10.md)** — Resumo da última sessão
2. **[`CLAUDE.md`](../CLAUDE.md)** — Contexto do projeto + bugs conhecidos
3. **[`docs/ARCHITECTURE_SCHEMAS.md`](ARCHITECTURE_SCHEMAS.md)** — Como o Supabase está organizado
4. **[`docs/ARCHITECTURE_RLS.md`](ARCHITECTURE_RLS.md)** — Como segurança RLS funciona

### Para implementar features:

5. **[`docs/PERFORMANCE_GUIDE.md`](PERFORMANCE_GUIDE.md)** — Padrões de performance
6. **[`docs/SECURITY_HARDENING.md`](SECURITY_HARDENING.md)** — Checklist de segurança
7. **[`docs/ACCESSIBILITY.md`](ACCESSIBILITY.md)** — Padrões de acessibilidade

### Para resolver incidentes:

8. **[`docs/RUNBOOK_DISASTER_RECOVERY.md`](RUNBOOK_DISASTER_RECOVERY.md)** — 6 cenários de desastre
9. **[`docs/CHAOS_ENGINEERING.md`](CHAOS_ENGINEERING.md)** — Testes de resiliência
10. **[`docs/ROADMAP_10_10.md`](ROADMAP_10_10.md)** — Roadmap futuro

### Para deploy:

11. **[`docs/DEPLOY_GUIDE.md`](DEPLOY_GUIDE.md)** — Como fazer push e criar PR

---

## 🛠️ COMANDOS ÚTEIS

```bash
# Desenvolvimento
npm run dev               # Vite dev server
npm run build             # Production build
npm run typecheck         # TypeScript validation
npm run lint              # ESLint

# Testes
npm run test              # Vitest unit tests
npm run test:e2e          # Playwright E2E
npm run test:a11y         # Accessibility tests
npm run test:stress       # Stress tests

# Quality gates
npm run check             # ALL: schema + lint + types + build
npm run check:schema      # Schema usage check
npm run check:deadcode    # Dead code detection
npm run check:datalayer   # Data layer consistency
npm run perf:budget       # Performance budget

# Documentação
npm run types:gen         # Regenerate TS types from DB
```

---

## 🔍 PADRÕES DE CÓDIGO

### TypeScript

```typescript
// ✅ SEMPRE tipado, NUNCA any
interface User {
  id: string;
  name: string;
}

// ❌ Nunca use any
const data: any = await fetch();

// ✅ Use unknown se realmente não sabe o tipo
const data: unknown = await fetch();
if (isUser(data)) { ... }
```

### React Hooks

```typescript
// ✅ SEMPRE cleanup em useEffect
useEffect(() => {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  streamRef.current = stream;

  return () => {
    streamRef.current?.getTracks().forEach(t => t.stop());
  };
}, []);

// ✅ SEMPRE mountedRef para async setState
const mountedRef = useRef(false);
useEffect(() => {
  mountedRef.current = true;
  return () => { mountedRef.current = false; };
}, []);

if (mountedRef.current) setState(...);
```

### Supabase Queries

```typescript
// ✅ Use maybeSingle() em vez de single() para evitar PGRST116
const { data } = await supabase
  .from('profiles')
  .select('*')
  .eq('user_id', userId)
  .maybeSingle(); // ✅ Retorna null se não encontrar

// ❌ single() throw exception se não encontrar
const { data } = await supabase
  .from('profiles')
  .select('*')
  .eq('user_id', userId)
  .single(); // ❌ Pode throwar PGRST116
```

### Error Handling

```typescript
// ✅ SEMPRE log com contexto
log.error('Failed to fetch contact', {
  contactId,
  userId,
  error: err.message,
});

// ❌ Nunca log sem contexto
log.error(err);
```

---

## 🐛 BUGS CONHECIDOS

Veja `CLAUDE.md` seção "Bugs Conhecidos e Gaps de Implementação" para lista completa.

**Bugs ativos recentes (resolvidos):**
- ~~BUG-1~~ queue_skills → queue_skill_requirements
- ~~BUG-2~~ bucket chat-media → audio-messages
- ~~BUG-3~~ zapp.fn_messages_view_insert_handler NEW.id NULL
- ~~BUG-4~~ contact_notes INSERT sem author_id
- ~~BUG-5~~ GRANT com params errados
- ... (28+ bugs corrigidos)

**Último fix conhecido (Julho 2026):**
- BUG-31: UUID type mismatch em evolution-sentiment
- BUG-30: Schema mismatch em CREATE TABLE IF NOT EXISTS
- BUG-29: Tabela evolution_sentiment_analysis não existia
- BUG-28: Producer escreveu em tabela inexistente

**Se encontrar um bug novo:**
1. Adicionar ao `CLAUDE.md` seção Bugs Conhecidos
2. Criar migration com prefixo data
3. Criar teste que reproduz o bug
4. Documentar no `docs/FINAL_REPORT_10_10.md`

---

## ⚠️ CUIDADOS ESPECIAIS

### 1. NUNCA use `schema: 'public'` para subscriptions realtime

`public.*` são VIEWs proxy que **NÃO emitem CDC events**.

```typescript
// ❌ ERRADO (no-op silencioso)
.on('postgres_changes', { schema: 'public', table: 'messages' }, ...)

// ✅ CORRETO (emite CDC)
.on('postgres_changes', { schema: 'zapp', table: 'messages' }, ...)
// OU
.on('postgres_changes', { schema: 'evo', table: 'evolution_messages' }, ...)
```

### 2. NUNCA use single() sem certeza que existe

Use `maybeSingle()` para evitar PGRST116 exceptions.

### 3. SEMPRE especifique schema em queries Evolution

```typescript
supabase.schema('evo').from('evolution_messages')
// NÃO: supabase.from('evolution_messages')  // vai para zapp
```

### 4. SEMPRE limpe resources em useEffect

MediaStream, AudioContext, intervals, animation frames, subscriptions.

### 5. NUNCA concatene SQL

Use queries parametrizadas (Supabase client já faz isso).

### 6. SEMPRE valide input com Zod

Antes de qualquer mutation ou persistência.

### 7. NUNCA confie em dados de Evolution

`message_id` pode ser `3EB0C767D360A23D02C3` (não-UUID). Use `toUuid()` antes de inserir em colunas UUID.

### 8. SEMPRE fixe search_path em SECURITY DEFINER

```sql
CREATE FUNCTION zapp.my_function()
RETURNS void AS $$ ... $$ LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = zapp, public; -- ⚠️ SEMPRE FIXAR!
```

### 9. SEMPRE use timing-safe comparison para secrets

```typescript
// ❌ ERRADO
if (token === expectedToken)

// ✅ CORRETO
if (timingSafeStringEqual(token, expectedToken))
```

### 10. NUNCA delete branches lovable-sync

São ~106K linhas divergentes que quebrariam tudo.

---

## 🧪 TESTES

### Estrutura

```
src/**/__tests__/*.test.ts  # Unit tests (Vitest)
supabase/functions/_shared/__tests__/*.test.ts  # Edge function tests (Deno)
e2e/*.spec.ts  # E2E tests (Playwright)
```

### Como rodar

```bash
# Unit tests
npm run test

# E2E (requer servidor rodando)
npm run test:e2e

# Accessibility
npm run test:a11y

# Stress
npm run test:stress

# Coverage
bun run scripts/generate-coverage-report.ts
```

### Padrões de teste

```typescript
// ✅ Teste isolado, determinístico
Deno.test("should validate email format", () => {
  assertEquals(sanitizeEmail("user@example.com"), "user@example.com");
  assertEquals(sanitizeEmail("invalid"), null);
});

// ✅ Use AAA pattern (Arrange, Act, Assert)
test("should fetch contact", async () => {
  // Arrange
  const contactId = "123-abc";
  // Act
  const contact = await fetchContact(contactId);
  // Assert
  expect(contact.id).toBe(contactId);
});
```

---

## 🔗 URLs Importantes

| Serviço | URL |
|---------|-----|
| **Produção** | https://zapp.atomicabr.com.br |
| **Supabase Dashboard** | https://supabase.atomicabr.com.br/project/default/database/schemas |
| **Supabase Schema `zapp`** | https://supabase.atomicabr.com.br/project/default/database/schemas?schema=zapp |
| **Supabase Schema `evo`** | https://supabase.atomicabr.com.br/project/default/database/schemas?schema=evo |
| **Evolution API** | https://evolution-mcp.adm01.workers.dev/mcp |
| **GitHub MCP** | https://github-mcp-server.adm01.workers.dev/mcp |
| **Supabase MCP** | `supabase-mcp.atomicabr.com.br/{SERVICE_ROLE_KEY}/mcp` (ver .mcp.json.local) |
| **Portainer** | https://portainer-mcp.atomicabr.com.br/mcp |
| **Vercel Deploys** | https://vercel.com/juca1/zapp-web-v3/deployments |

---

## 📊 MÉTRICAS ATUAIS

| Métrica | Valor |
|---------|-------|
| TypeScript errors | 0 |
| Lint warnings | 0 |
| Build success | 100% |
| Tests E2E | 64+ specs |
| Unit tests | 200+ |
| Edge Functions | 129 |
| Schemas DB | 312 tabelas |
| RLS policies | 1.555+ |
| Migrations | 900+ |
| Documentos | 9 principais |
| Score global | 9.85/10 |

---

## 🎯 WORKFLOW RECOMENDADO

### Antes de fazer mudanças:

1. Ler `docs/FINAL_REPORT_10_10.md` para entender estado atual
2. Ler `CLAUDE.md` para contexto + bugs conhecidos
3. Verificar branch: deve estar em `feat/excellence-10-10-fable5-session` ou `main`

### Ao implementar feature:

1. Criar branch: `git checkout -b feat/<nome>`
2. Implementar com validação Zod (`src/shared/validation.ts`)
3. Adicionar testes (unit + E2E)
4. Atualizar documentação se necessário
5. Rodar `npm run check` antes de commitar

### Antes de PR:

1. `npm run typecheck` ✅
2. `npm run lint` ✅
3. `npm run test` ✅
4. `npm run build` ✅
5. Review próprio do diff
6. Mensagem de commit descritiva

---

## 🆘 DEBUGGING

### Onde procurar logs:

| Tipo | Onde |
|------|------|
| Frontend errors | Sentry (sentry.io) |
| Edge Function logs | Supabase Dashboard → Edge Functions → Logs |
| Database errors | Supabase Dashboard → Database → Logs |
| Webhook events | `webhook_audit_log` table |
| Evolution errors | Evolution API dashboard |

### Como reproduzir bug em dev:

```bash
# 1. Setar env vars corretas
cp .env.example .env.local
# Editar com valores do self-hosted

# 2. Rodar dev server
npm run dev

# 3. Abrir DevTools → Console
# Erros aparecem ali

# 4. Para debugar Edge Function localmente
supabase functions serve <name> --env-file ./supabase/.env.local
```

---

## 📞 RECURSOS EXTERNOS

### Documentação

- [Supabase Docs](https://supabase.com/docs)
- [React Docs](https://react.dev)
- [TypeScript Docs](https://www.typescriptlang.org/docs)
- [Zod Docs](https://zod.dev)
- [TanStack Query](https://tanstack.com/query/latest)
- [TailwindCSS](https://tailwindcss.com/docs)

### Evolution API

- [Evolution API Docs](https://doc.evolution-api.com/)
- [GitHub](https://github.com/evolution-foundation/evolution-api)

---

## ✨ FILOSOFIA DO PROJETO

```
"A excelência não é um destino, é uma jornada contínua.
Cada bug corrigido é uma vitória.
Cada melhoria é um passo adiante.
Cada teste é uma promessa de qualidade.
Cada documento é um presente para o futuro."

— Engineering Excellence Manifesto
```

---

## 🎯 TL;DR FINAL

**Se você é IA (Claude, GPT, etc):**
1. Leia `docs/FINAL_REPORT_10_10.md` primeiro
2. Use `src/shared/validation.ts` para validação
3. Use `src/lib/sanitize-extra.ts` para sanitização
4. SEMPRE especifique schema em queries
5. NUNCA use schema 'public' para Evolution

**Se você é humano:**
1. Leia `CLAUDE.md` + `docs/FINAL_REPORT_10_10.md`
2. Explore `docs/` (9 documentos)
3. Rode `npm run check` antes de commitar
4. Siga os 10 cuidados especiais acima

---

**Boa sorte! 🚀**

**Última atualização:** 2026-07-24 (Fable 5 session)
**Score:** 9.85/10 🏆
