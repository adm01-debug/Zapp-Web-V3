# Arquitetura de Sanitização — Quando usar cada módulo

> Contexto: o projeto tem dois módulos de sanitização com APIs **incompatíveis**.
> Este documento é a fonte de verdade sobre quando usar cada um.

---

## `src/lib/sanitize.ts` — **Módulo principal (use na maioria dos casos)**

### Quando usar
- Renderização de campos de texto de contatos (`full_name`, `email`, `company`...)
- Sanitização de URLs
- Filtros de busca no banco (PostgREST)
- Qualquer sanitização de texto simples ou HTML em campos de formulário
- Componentes de inbox, chat, contatos

### API
```ts
import {
  sanitizeText,           // Input → string sem HTML
  sanitizeHtml,           // HTML parcialmente confiável → string HTML seguro
  sanitizeContactFields,  // Record → Record com todos campos sanitizados
  sanitizeUrl,            // URL → string ou '' (bloqueia javascript:, data:)
  sanitizeForSearch,      // Input → string segura para query LIKE
  sanitizePostgrestFilter, // Input → string segura para .or() do PostgREST
  truncateText,           // text + maxLen → string com ellipsis
} from '@/lib/sanitize';

// Retorno: sempre string
const safe: string = sanitizeHtml(userInput);
```

### Implementação
- Usa **DOMPurify** (biblioteca testada, auditada, OWASP A03:2021)
- Estável em browser real
- Pode ter comportamento inconsistente em happy-dom/jsdom (ambientes de teste)

---

## `src/lib/sanitize-v2.ts` — **Módulo DOM-nativo (somente para EmailChatBubble)**

### Quando usar
- Renderização de conteúdo de e-mail (`EmailChatBubble*`)
- Contextos onde DOMPurify tem comportamento inconsistente entre happy-dom e browser
- Quando precisar do objeto `SanitizeResult` com `{ success, html, sanitized, error }`
- Casos que exigem pipeline completo: NFKC normalization → entity decode → control char detection

### API
```ts
import {
  sanitizeHtml,           // ATENÇÃO: retorno diferente!
  sanitizeHtmlWithHooks,  // HTML com tabnabbing prevention
  sanitizeHtmlWithHookCleanup,
} from '@/lib/sanitize-v2';
import type { SanitizeResult } from '@/lib/sanitize-v2';

// Retorno: SanitizeResult (não string!)
const result: SanitizeResult = sanitizeHtml(emailHtml);
if (result.success) {
  // usar result.html
}

// Forma mais simples (retorna string diretamente)
const safe: string = sanitizeHtmlWithHooks(emailHtml);
```

### Implementação
- Usa `document.implementation.createHTMLDocument` (DOM nativo)
- Determinístico em browser real **e** em happy-dom/jsdom
- Pipeline adicional: NFKC normalization → entity decoding → control char detection → DOM sanitize
- Não usa DOMPurify (sem hooks mutáveis globais)

---

## ⚠️ Gotcha: Nomes iguais, tipos diferentes

AMBOS os módulos exportam uma função chamada `sanitizeHtml`, mas com **tipos de retorno diferentes**:

```ts
// sanitize.ts
export function sanitizeHtml(html: unknown): string  // → string

// sanitize-v2.ts
export function sanitizeHtml(html: unknown, opts?): SanitizeResult  // → objeto
```

Se você trocar o import de um para o outro, o TypeScript **não vai reclamar** nos lugares
onde o retorno é usado como any (ex: `dangerouslySetInnerHTML={{ __html: sanitizeHtml(...) }}`)
porque `SanitizeResult.html` existe mas é o campo html do resultado, não o resultado em si.

**Regra:** não trocar os imports sem ler os tipos de retorno.

---

## Decisão futura: consolidar?

Opção A — Manter os dois módulos separados (status atual — doc acima é suficiente)

Opção B — Unificar em `sanitize.ts` com overloads:
```ts
// Overload imaginário
function sanitizeHtml(html: unknown): string;
function sanitizeHtml(html: unknown, opts: { strict: true }): SanitizeResult;
```
Opção B tem maior cobertura mas requer migração de todos os chamadores de `sanitize-v2.ts`.

**Status atual:** Opção A (sem ação necessária além desta documentação).
