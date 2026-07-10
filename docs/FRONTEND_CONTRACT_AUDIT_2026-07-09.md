# Auditoria Front-End e Contratos — 2026-07-09

## Escopo executado

Esta auditoria revisou a superfície front-end React/Vite, rotas, shell responsivo, sanitização, logging, PWA/build e contratos de Edge Functions/webhooks. O foco foi procurar falhas práticas de UI/UX, performance, acessibilidade, segurança, manutenibilidade e consistência de payloads.

Comandos usados para inventário e simulação:

- `rg --files src | wc -l` — 1.604 arquivos sob `src/`.
- `rg --files src` — inventário de módulos, páginas, hooks, libs e componentes.
- `rg -n "TODO|FIXME|console\.log|dangerouslySetInnerHTML|aria-|role=|img |<img|React\.memo|lazy\(" src` — busca de hotspots de acessibilidade, XSS, performance e débito técnico.
- `DENO_NO_PACKAGE_JSON=1 npx deno test --no-config --allow-read=supabase/functions supabase/functions/_shared/__tests__/edge-contract-schemas.test.ts supabase/functions/_shared/webhook-contracts.test.ts` — 17 testes de contrato e schema.
- `git merge-tree --write-tree origin/main HEAD` — validação de merge limpo contra `origin/main`.

## Sumário executivo

O projeto possui boa base técnica: lazy loading em rotas, shell responsivo, PWA configurado, Sentry/Web Vitals, axe em desenvolvimento, sanitização centralizada e testes de contrato para webhooks/Edge Functions. A maior lacuna residual é que parte da validação ainda está centralizada em registry/testes e precisa ser progressivamente aplicada na entrada de todas as funções em runtime. No front-end, os riscos principais estão em HTML renderizado, logs com payloads arbitrários, volume de rotas/chunks, e cobertura e2e/a11y que precisa ser continuamente executada em CI.

## Problemas críticos priorizados

### P0 — Contratos existem, mas a adoção runtime ainda deve ser obrigatória em todos os handlers

**Evidência:** o registry central define schemas e helpers (`getContractSchema`, `getContractLifecycle`, `validateContractPayload`), mas handlers individuais ainda precisam chamar esse helper na fronteira HTTP para transformar validações em 422 padronizado.

**Impacto:** endpoints podem continuar aceitando payloads inválidos se não usarem o registry em runtime, mesmo com testes cobrindo o contrato esperado.

**Correção recomendada:** criar um wrapper padrão `withContractValidation(functionName, handler)` em `_shared`, aplicá-lo por endpoint e bloquear merge quando uma função com body não usar validação.

Exemplo:

```ts
const contract = await parseContractRequest(req, 'evolution-webhook', requestedVersion);
if (!contract.success) return contract.response; // 422 { code, message, fields }
return handler(contract.data);
```

### P0 — HTML de e-mail exige política única e auditável

**Evidência:** existem renderizações com `dangerouslySetInnerHTML` em componentes de e-mail. Uma delas usa `displayHtml`; outra usa `DOMPurify.sanitize(...)` diretamente no componente.

**Impacto:** qualquer regressão que permita HTML não sanitizado pode virar XSS em uma área de alto risco (e-mail, assinaturas, conteúdo externo).

**Correção recomendada:** proibir `dangerouslySetInnerHTML` fora de um componente único, por exemplo `SafeHtml`, e adicionar teste/lint que rejeite usos diretos.

Exemplo:

```tsx
<SafeHtml html={message.html} policy="email" maxHeight={500} />
```

### P1 — Logs podem receber objetos arbitrários em breadcrumbs/console

**Evidência:** o logger adiciona breadcrumbs ao Sentry serializando `args` e captura exceções com `extra: { args }`.

**Impacto:** risco de vazamento de PII/tokens em produção caso chamadas de log recebam payloads crus de integração.

**Correção recomendada:** inserir redator central no logger front-end, com padrões para e-mail, telefone, JWT, API keys e URLs sensíveis antes de `console`/Sentry.

### P1 — Bundle e rotas: aplicação grande, risco de regressão de performance

**Evidência:** o projeto tem 1.604 arquivos em `src/`, muitas rotas lazy-loaded, PWA, chunks manuais para libs pesadas e limite de chunk em 600KB.

**Impacto:** regressões podem aumentar TTI/LCP em rotas críticas sem serem percebidas se budgets não rodarem no CI.

**Correção recomendada:** tornar `npm run perf:budget` obrigatório no pipeline, publicar artefatos de bundle visualizer e definir budgets por rota crítica (`/`, `/inbox`, `/admin/*`).

### P1 — Conflito remoto da PR depende de atualização da branch remota

**Evidência:** localmente `git merge-tree --write-tree origin/main HEAD` gera tree limpa, mas a branch remota antiga ainda estava em SHA diferente.

**Impacto:** GitHub continuará exibindo conflito enquanto o remoto não receber o HEAD rebased.

**Correção recomendada:** publicar a branch corrigida com credenciais GitHub válidas; após push, revalidar a UI da PR.

## Gaps e melhorias recomendadas

### Acessibilidade

- Já existem `SkipLinks`, `LiveRegion`, landmarks `main`, `role=status`, labels e axe em desenvolvimento.
- Gap: transformar axe/a11y em job CI com Playwright para rotas críticas.
- Gap: validar navegação 100% por teclado nos módulos Inbox, Admin, Contacts e Email.
- Gap: gerar snapshots de contraste para temas claro/escuro/high-contrast.

### Segurança front-end

- Consolidar renderização HTML em `SafeHtml`.
- Redigir logs antes de console/Sentry.
- Adicionar teste que falhe para `dangerouslySetInnerHTML` fora de allowlist.
- Garantir que URLs externas passem por `sanitizeUrl` ou helper equivalente.

### Performance

- Manter lazy loading, mas medir rotas principais com budgets.
- Monitorar chunks `vendor-mapbox`, `vendor-charts`, `vendor-pdf`, `vendor-sip`, `vendor-sentry`, `vendor-motion`.
- Garantir que SW não sirva `index.html` obsoleto após deploy; a configuração NetworkFirst para navegação já reduz esse risco.

### Manutenibilidade

- O registry de contratos deve ser a fonte única, mas precisa ficar ligado ao runtime.
- Criar teste de arquitetura para impedir nova Edge Function sem schema e sem wrapper runtime.
- Documentar lifecycle de contrato em changelog/API docs.

### UX/responsividade

- O shell já possui `MobileShell`, swipe navigation e modo zen.
- Gap: e2e visual/mobile para Inbox, ChatPopup, Contacts, Admin dashboards e fluxos de erro/offline.
- Gap: estados de carregamento e erro por rota devem ser padronizados em componentes reutilizáveis.

## Validação de contratos implementada

A suíte atual cobre:

- Registry espelhando diretórios reais de Edge Functions.
- Presença de schema v1 em todos os endpoints registrados.
- Compatibilidade v1/v2 para webhooks.
- Metadata de depreciação/sunset para v1.
- Rejeição de versões não suportadas.
- Casos de campos ausentes, tipos incorretos e valores vazios.
- Caminhos de erro determinísticos para webhooks críticos.
- Mais de 500 simulações de payloads malformados.
- Formato único 422 com `code`, `message`, `fields` e `details`.

## Riscos remanescentes

1. **Validação não aplicada em runtime por todos os handlers** — risco de divergência entre contrato testado e comportamento real.
2. **HTML externo em e-mail** — risco de XSS se algum fluxo contornar sanitização.
3. **PII em logs** — risco de vazamento para console/Sentry.
4. **Branch remota desatualizada** — risco operacional de PR continuar mostrando conflito mesmo com local limpo.
5. **Cobertura e2e/a11y insuficiente para todos os fluxos reais** — risco de regressão em teclado/mobile/offline.

## Plano de ação 10/10

1. Criar `parseContractRequest`/`withContractValidation` e aplicar em webhooks críticos.
2. Substituir usos diretos de `dangerouslySetInnerHTML` por `SafeHtml`.
3. Adicionar redator de PII no logger front-end.
4. Promover axe/Playwright a CI obrigatório para rotas críticas.
5. Tornar `perf:budget` obrigatório e publicar relatório de bundles.
6. Criar check arquitetural: nova Edge Function sem schema/wrapper falha no CI.
7. Documentar lifecycle v1/v2 e sunset nos docs de API.
8. Executar smoke e2e mobile/desktop nas rotas críticas antes de release.
