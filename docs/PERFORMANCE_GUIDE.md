# Guia de Performance - ZAPP WEB

## Visão Geral

Padrões e otimizações de performance aplicadas no ZAPP WEB para garantir
experiência fluida mesmo com milhares de conversas ativas.

## Princípios Fundamentais

### 1. Bounded Operations
Todas as operações têm limite superior de tempo/recurso.

```typescript
// ✅ CORRETO: Fetch com timeout
const SUPABASE_FETCH_TIMEOUT_MS = 12_000;
const controller = new AbortController();
setTimeout(() => controller.abort(), SUPABASE_FETCH_TIMEOUT_MS);

// ❌ INCORRETO: Fetch sem timeout
const data = await fetch(url); // Pode pendurar indefinidamente
```

### 2. Retry com Backoff Exponencial
Retry não deve amplificar falhas.

```typescript
// ✅ CORRETO: Backoff + jitter
const backoff = baseBackoffMs * 2 ** (attempt - 1);
const jitter = Math.floor(Math.random() * 100);
await sleep(backoff + jitter);

// ❌ INCORRETO: Retry sem backoff (thundering herd)
for (let i = 0; i < retries; i++) {
  await fetch(url);
}
```

### 3. Idempotency Keys
Requisições duplicadas não devem causar efeitos colaterais.

```typescript
// ✅ CORRETO: SHA-256 fingerprint do conteúdo
const idemKey = await buildSendIdempotencyKeyFromFingerprint({
  contactId, messageType, content, mediaUrl
});

// ❌ INCORRETO: Sem idempotency
await sendMessage(content); // Retry envia duplicado
```

## Otimizações de Banco

### 1. Indexes Críticos

```sql
-- Evolution messages (mais acessada)
CREATE INDEX idx_evolution_messages_remote_jid_created 
  ON evo.evolution_messages(remote_jid, created_at DESC);

-- Conversations
CREATE INDEX idx_conversations_contact_status
  ON zapp.conversations(contact_id, status);

-- Audit logs
CREATE INDEX idx_audit_logs_entity_created
  ON zapp.audit_logs(entity_type, entity_id, created_at DESC);

-- Webhook events
CREATE INDEX idx_webhook_events_processed_instance
  ON zapp.webhook_events_processed(instance_name, created_at DESC);
```

### 2. Cursor-based Pagination
Pagination por offset degrada com volume.

```sql
-- ✅ CORRETO: Keyset pagination
SELECT * FROM contacts
WHERE (created_at, id) > ($1, $2)
ORDER BY created_at, id LIMIT 50;

-- ❌ INCORRETO: OFFSET (linear com volume)
SELECT * FROM contacts ORDER BY created_at LIMIT 50 OFFSET 10000;
```

### 3. Particionamento
Tabelas grandes são particionadas por instância/data.

```sql
-- Evolution messages particionadas por instância
CREATE TABLE evolution_messages_wpp2 PARTITION OF evo.evolution_messages
  FOR VALUES IN ('wpp2');

CREATE TABLE evolution_messages_comercial_01 PARTITION OF evo.evolution_messages
  FOR VALUES IN ('comercial_01');
```

## Otimizações de Frontend

### 1. React Query Cache
Cache em camadas reduz requests.

```typescript
// staleTime: quanto tempo os dados são considerados "frescos"
useQuery({
  queryKey: queryKeys.contacts.list(),
  queryFn: fetchContacts,
  staleTime: 30_000, // 30s sem refetch automático
});

// gcTime: quanto tempo manter em cache após desuso
useQuery({
  queryKey: queryKeys.messages.thread(id),
  gcTime: 5 * 60_000, // 5 min
});
```

### 2. Realtime com Batching
Updates de realtime em batch reduzem renders.

```typescript
// ✅ CORRETO: Batcher para mensagens
const batcher = useMessageUpdateBatcher(
  conversationsRef,
  commitConversations,
  hydrateConversationForMessage
);

// ❌ INCORRETO: setState para cada update
channel.on('postgres_changes', payload => {
  setMessages(prev => [...prev, payload.new]); // 1 render por update
});
```

### 3. Virtualization
Listas longas usam virtual scroll.

```typescript
import { useVirtualizer } from '@tanstack/react-virtual';

// ✅ Renderiza apenas itens visíveis
const virtualizer = useVirtualizer({
  count: contacts.length,
  getScrollElement: () => parentRef.current,
  estimateSize: () => 60,
});
```

### 4. Debounce em Inputs
Evitar requests a cada keystroke.

```typescript
// ✅ CORRETO: Debounce de 300ms
const debouncedSearch = useDebounce(searchValue, 300);
const { data } = useQuery({
  queryKey: queryKeys.contacts.search(debouncedSearch),
  queryFn: () => searchContacts(debouncedSearch),
  enabled: debouncedSearch.length > 0,
});

// ❌ INCORRETO: Request a cada keystroke
useQuery({
  queryKey: queryKeys.contacts.search(searchValue),
  queryFn: () => searchContacts(searchValue),
});
```

### 5. Code Splitting
Lazy load de componentes pesados.

```typescript
// ✅ CORRETO: Lazy load
const InboxView = lazy(() => import('@/features/inbox/InboxView'));
const ReportsView = lazy(() => import('@/features/reports/ReportsView'));

// ❌ INCORRETO: Import estático
import { InboxView } from '@/features/inbox/InboxView';
```

## Otimizações de Memória

### 1. Cleanup de Resources
Todo recurso alocado deve ser liberado.

```typescript
// ✅ CORRETO: useEffect com cleanup completo
useEffect(() => {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  streamRef.current = stream;

  return () => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    if (audioContextRef.current) audioContextRef.current.close();
    cancelAnimationFrame(animationFrameRef.current);
    clearInterval(intervalRef.current);
  };
}, []);
```

### 2. WeakRef para Cache
Cache não deve prevenir garbage collection.

```typescript
// ✅ WeakRef permite GC
const cache = new Map<string, WeakRef<LargeData>>();

// ❌ StrongRef mantém em memória para sempre
const cache = new Map<string, LargeData>();
```

## Otimizações de Network

### 1. HTTP/2 Multiplexing
Múltiplas requisições em paralelo.

```typescript
// ✅ CORRETO: Promise.all para paralelo
const [contacts, messages] = await Promise.all([
  fetchContacts(),
  fetchMessages(),
]);

// ❌ INCORRETO: Sequential
const contacts = await fetchContacts();
const messages = await fetchMessages();
```

### 2. Request Coalescing
Dedup de requisições idênticas.

```typescript
// ✅ CORRETO: Coalescer requests duplicados
const inflightRef = useRef(new Map<string, Promise<unknown>>());

if (inflightRef.current.has(key)) {
  return inflightRef.current.get(key)!;
}

const promise = callApi(...).finally(() => {
  inflightRef.current.delete(key);
});
inflightRef.current.set(key, promise);
```

### 3. Compression
Gzip/Brotli para payloads grandes.

```typescript
// Vite config
import compression from 'vite-plugin-compression2';

export default defineConfig({
  plugins: [
    compression({
      algorithm: 'gzip',
      threshold: 1024, // > 1KB
    }),
  ],
});
```

## Web Vitals

### Targets de Performance

| Metric | Target | Crítico |
|--------|--------|---------|
| **LCP** (Largest Contentful Paint) | < 2.5s | < 4s |
| **FID** (First Input Delay) | < 100ms | < 300ms |
| **CLS** (Cumulative Layout Shift) | < 0.1 | < 0.25 |
| **TTFB** (Time to First Byte) | < 800ms | < 1.8s |
| **INP** (Interaction to Next Paint) | < 200ms | < 500ms |

### Monitoramento

```typescript
// webVitals report
import { onLCP, onFID, onCLS, onINP, onTTFB } from 'web-vitals';

onLCP(metric => sendToAnalytics(metric));
onFID(metric => sendToAnalytics(metric));
onCLS(metric => sendToAnalytics(metric));
```

## Performance Budget

| Asset | Limite |
|-------|--------|
| Initial JS bundle | < 500KB gzip |
| CSS inicial | < 100KB gzip |
| Imagens acima da dobra | < 200KB |
| Font files | < 150KB total |
| Total page weight | < 1.5MB |

## Profiling

### Chrome DevTools

1. **Performance tab**: Capture de 5-10 segundos de uso real
2. **Memory tab**: Heap snapshots antes/depois de interações
3. **Coverage tab**: Identificar JS/CSS não utilizado
4. **Network tab**: Waterfall de requisições

### Supabase Dashboard

1. **Database > Query Performance**: Top 50 queries lentas
2. **Database > Connections**: Connection pool saturation
3. **Logs > API Logs**: P95/P99 latência por endpoint
4. **Realtime > Active Channels**: Número de subscriptions ativas

## Checklist de Performance

- [ ] Bounded fetch timeouts em todas as chamadas
- [ ] Retry com backoff exponencial + jitter
- [ ] Idempotency keys em mutations
- [ ] Indexes em colunas de queries frequentes
- [ ] Cursor-based pagination em listas
- [ ] React Query com staleTime apropriado
- [ ] Debounce em inputs de busca
- [ ] Code splitting de rotas pesadas
- [ ] Cleanup de resources em useEffect
- [ ] HTTP/2 + compression
- [ ] Web Vitals monitorados
- [ ] Performance budget enforced

## Anti-patterns Comuns

### ❌ N+1 Queries
```typescript
// RUIM: 1 query por contato
for (const contact of contacts) {
  const messages = await fetchMessages(contact.id);
}

// BOM: 1 query batch
const messages = await fetchMessagesForContacts(contacts.map(c => c.id));
```

### ❌ Memory Leaks
```typescript
// RUIM: Sem cleanup
useEffect(() => {
  const interval = setInterval(() => {}, 1000);
  // nunca é limpo!
}, []);

// BOM: Com cleanup
useEffect(() => {
  const interval = setInterval(() => {}, 1000);
  return () => clearInterval(interval);
}, []);
```

### ❌ Sync Renders Bloqueantes
```typescript
// RUIM: Sync computation em cada render
function ExpensiveComponent({ data }) {
  const processed = data.map(heavyComputation); // Bloqueante
  return <List items={processed} />;
}

// BOM: useMemo
function ExpensiveComponent({ data }) {
  const processed = useMemo(
    () => data.map(heavyComputation),
    [data]
  );
  return <List items={processed} />;
}
```
