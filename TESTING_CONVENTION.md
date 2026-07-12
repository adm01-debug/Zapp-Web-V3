# Testing Convention — zapp-web-v3

## Convenção vigente (a partir de 2026-07-11)

### Localização de testes

| Tipo | Local | Padrão de arquivo |
|------|-------|-------------------|
| Unit / component | Co-localizado com o arquivo que está testando | `Button.test.tsx` ao lado de `Button.tsx` |
| Integration (feature-level) | `src/__tests__/` | `useAuth.test.ts` |
| End-to-end | `e2e/` ou `playwright-report/` | `*.spec.ts` |
| A11y | Executa via Playwright | `playwright.a11y.config.ts` |

### Diretórios legados (deprecados)

Os diretórios abaixo existiam antes da convenção e serão migrados gradualmente:

- `src/tests/` → migrar para co-located ou `src/__tests__/`
- `src/test/` → migrar para co-located ou `src/__tests__/`

Não criar novos arquivos nesses diretórios.

### Regras do vitest

```ts
// vitest.config.ts
include: [
  'src/**/*.{test,spec}.{ts,tsx}',  // Co-located (preferred)
  'src/__tests__/**/*.{test,spec}.{ts,tsx}',
  // DEPRECATED (migrar):
  'src/tests/**/*.{test,spec}.{ts,tsx}',
  'src/test/**/*.{test,spec}.{ts,tsx}',
]
```

### Padrão de nomes

- `ComponentName.test.tsx` para componentes React
- `hookName.test.ts` para hooks
- `serviceName.test.ts` para serviços/utils
- `feature.spec.ts` para testes de integração end-to-end

### Ferramentas

| Ferramenta | Uso |
|-----------|-----|
| `vitest` | Unit + component + integration |
| `playwright` | E2E, a11y, react testing |
| `@testing-library/react` | Render de componentes em vitest |
| `happy-dom` | DOM simulator para vitest |
