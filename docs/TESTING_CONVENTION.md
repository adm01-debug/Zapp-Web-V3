# Convenção de Testes — zapp-web-v3

## Regra Principal

**Nenhum arquivo de teste pode importar de barrel exports (`index.ts`) que carreguem side-effects pesados.** Isso causa:
- Timeout de inicialização do happy-dom
- Vazamento de estado entre testes
- Falhas flaky em ambiente CI

## Estrutura de Imports em Testes

```typescript
// ✅ CORRETO — import direto do módulo
import { useMessages } from '@/hooks/useMessages';
import { formatDate } from '@/lib/utils/date';

// ❌ ERRADO — import via barrel que carrega outros hooks
import { useMessages } from '@/hooks'; // carrega todos os hooks = side-effects
```

## Arquivos Que Não Devem Ser Importados em Testes

- `src/hooks/index.ts` — carrega subscriptions Realtime
- `src/lib/supabase.ts` — inicializa cliente Supabase
- `src/integrations/supabase/client.ts` — idem

## Padrão Para Mocks

```typescript
// vitest.setup.ts ou no próprio teste
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: vi.fn(), rpc: vi.fn() }
}));
```

## Timeouts

- Default: 5000ms (vitest.config.ts)
- Para testes de UI: 10000ms
- Para testes de integração: 30000ms
- NUNCA usar `waitFor` sem timeout explícito

## Naming

- `*.test.ts` — testes unitários
- `*.test.tsx` — testes de componente React
- `*.spec.ts` — testes de integração
- `e2e/*.spec.ts` — testes E2E (Playwright)

## Coverage

Floors configurados em `vitest.config.ts`:
- lines: 25%
- functions: 18%
- branches: 15%
- statements: 24%

Nunca baixar os floors. Só subir.
