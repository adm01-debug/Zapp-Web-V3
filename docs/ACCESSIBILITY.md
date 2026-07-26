# Guia de Acessibilidade - ZAPP WEB

## Visão Geral

Padrões de acessibilidade seguindo WCAG 2.1 nível AA.
Foco em usuários com deficiência visual, motora, auditiva e cognitiva.

## Princípios (POUR)

1. **Perceptível** - Informação apresentada de forma que usuários possam perceber
2. **Operável** - Interface operável por todos
3. **Compreensível** - Informação e operação compreensíveis
4. **Robusto** - Compatível com tecnologias assistivas

## Checklist de Implementação

### 1. Semântica HTML

```tsx
// ✅ CORRETO: Usa elementos nativos
<button onClick={handleClick}>Enviar</button>
<nav>
  <ul>
    <li><a href="/inbox">Inbox</a></li>
  </ul>
</nav>

// ❌ INCORRETO: divs clicáveis sem semântica
<div onClick={handleClick}>Enviar</div>
<div className="nav">
  <span onClick={goTo}>Inbox</span>
</div>
```

### 2. ARIA Labels

```tsx
// ✅ Aria-label para contexto
<button aria-label="Fechar modal" onClick={onClose}>
  <X className="h-4 w-4" />
</button>

// ✅ Aria-labelledby referenciando heading
<div role="dialog" aria-labelledby="modal-title">
  <h2 id="modal-title">Confirmar exclusão</h2>
</div>

// ✅ Aria-describedby para descrição
<input
  aria-describedby="email-help"
  type="email"
/>
<span id="email-help">Use seu email corporativo</span>
```

### 3. Keyboard Navigation

```tsx
// ✅ Foco visível
<button className="focus-visible:ring-2 focus-visible:ring-primary">
  Ação
</button>

// ✅ Tab order lógico (sem tabindex > 0)
<input tabIndex={0} />
<input tabIndex={0} />
<input tabIndex={0} />

// ❌ Evitar tabindex > 0 (anti-pattern)
<input tabIndex={5} /> // Ordem imprevisível
```

### 4. Screen Reader Support

```tsx
// ✅ Live regions para notificações
<div aria-live="polite" aria-atomic="true">
  {notification}
</div>

// ✅ aria-live="assertive" para erros críticos
<div role="alert" aria-live="assertive">
  Erro ao enviar mensagem
</div>

// ✅ Hidden para screen readers only
<span className="sr-only">
  Carregando mensagens
</span>
```

### 5. Color Contrast

```css
/* Contraste mínimo WCAG AA: 4.5:1 para texto normal */
.text-primary {
  color: hsl(220 90% 50%); /* Ratio 7.2:1 com branco */
}

/* Contraste 3:1 para texto grande (18pt+) */
.text-large {
  color: hsl(220 80% 60%); /* Ratio 4.8:1 */
}
```

### 6. Focus Management

```tsx
// ✅ Salvar e restaurar foco em modais
const Modal = ({ isOpen, onClose }) => {
  const previousFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      previousFocus.current = document.activeElement as HTMLElement;
      // Focus first focusable element in modal
      modalRef.current?.querySelector<HTMLElement>('button')?.focus();
    } else {
      previousFocus.current?.focus();
    }
  }, [isOpen]);
};
```

### 7. Skip Links

```tsx
// ✅ Permite pular para conteúdo principal
<a href="#main-content" className="sr-only focus:not-sr-only">
  Pular para conteúdo principal
</a>

<main id="main-content" tabIndex={-1}>
  ...
</main>
```

### 8. Form Accessibility

```tsx
// ✅ Label associado ao input
<label htmlFor="email">Email</label>
<input id="email" type="email" required />

// ✅ Fieldset para grupos
<fieldset>
  <legend>Tipo de notificação</legend>
  <input type="checkbox" id="email-notif" />
  <label htmlFor="email-notif">Email</label>
</fieldset>

// ✅ Mensagens de erro acessíveis
<input
  aria-invalid={hasError}
  aria-errormessage="email-error"
/>
{hasError && (
  <span id="email-error" role="alert">
    Email inválido
  </span>
)}
```

## Componentes Acessíveis Já Implementados

O ZAPP WEB já possui:

✅ `SkipLinks` - Skip to main content
✅ `LiveRegion` - Anúncios para screen reader
✅ `GlobalKeyboardProvider` - Atalhos globais
✅ `ErrorBoundary` - role="alert"
✅ `Sonner` (toasts) - aria-live="polite"
✅ `Dialog` (Radix) - focus trap automático
✅ `Dropdown Menu` (Radix) - keyboard navigation
✅ `Tabs` (Radix) - arrow keys

## Testes de Acessibilidade

### Ferramentas

```bash
# axe-core (automatizado)
npm run test:a11y

# Lighthouse CI
lighthouse-ci https://zapp.atomicabr.com.br

# Pa11y
pa11y https://zapp.atomicabr.com.br

# WAVE
# https://wave.webaim.org/
```

### Manual Testing

```bash
# 1. Navegar apenas com teclado
# 2. Usar screen reader (VoiceOver, NVDA, JAWS)
# 3. Aumentar zoom para 200%
# 4. Testar com alto contraste
# 5. Desabilitar JavaScript (graceful degradation)
```

### Tests Playwright Existentes

```
e2e/auth-accessibility.spec.ts
e2e/auth-keyboard-navigation.spec.ts
e2e/chat-accessibility.spec.ts
e2e/visual-regression.spec.ts
```

## Atalhos de Teclado Globais

```typescript
// src/components/keyboard/GlobalKeyboardProvider.tsx

const SHORTCUTS = {
  // Navegação
  'g+i': 'Ir para Inbox',
  'g+c': 'Ir para Contacts',
  'g+d': 'Ir para Dashboard',
  'g+s': 'Ir para Settings',

  // Ações
  'ctrl+k': 'Buscar',
  'ctrl+enter': 'Enviar mensagem',
  'ctrl+shift+a': 'Atalhos disponíveis',
  'esc': 'Fechar modal',

  // Acessibilidade
  'alt+1': 'Pular para conteúdo',
  'alt+2': 'Pular para navegação',
};
```

## Reduced Motion

```typescript
// ✅ Respeita prefers-reduced-motion
const prefersReducedMotion = window.matchMedia(
  '(prefers-reduced-motion: reduce)'
).matches;

const animation = prefersReducedMotion
  ? { duration: 0 }
  : { duration: 300, ease: 'easeInOut' };
```

```css
/* CSS alternativo */
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

## High Contrast Mode

```css
/* Suporte para Windows High Contrast */
@media (forced-colors: active) {
  .button-primary {
    border: 2px solid ButtonText;
  }
}
```

## Recursos Adicionais

### Para Surdos (Comunicação Visual)

- ✅ Notificações visuais (toasts)
- ✅ Indicadores de status (badges, ícones)
- ❌ Falta: Legendas em vídeos (futuro)

### Para Cegos (Leitores de Tela)

- ✅ ARIA labels em todos os botões com só ícone
- ✅ Live regions para mudanças dinâmicas
- ✅ Estrutura semântica (headings, landmarks)
- ✅ Textos alternativos em imagens (quando aplicável)

### Para Mobilidade Reduzida

- ✅ Navegação por teclado completa
- ✅ Áreas de clique adequadas (min 44x44px)
- ✅ Atalhos de teclado
- ❌ Falta: Voice commands (futuro)

### Para Cognitivos

- ✅ Linguagem simples
- ✅ Mensagens de erro claras
- ✅ Estados de loading visíveis
- ❌ Falta: Modo de leitura fácil (futuro)

## Ferramentas Recomendadas

| Ferramenta | Tipo | Uso |
|------------|------|-----|
| **axe DevTools** | Browser extension | Auditoria rápida |
| **Lighthouse** | CI/CD | Score automatizado |
| **Pa11y** | CLI | Testes em CI |
| **VoiceOver** | macOS/iOS | Teste manual |
| **NVDA** | Windows | Teste manual |
| **WAVE** | Web | Análise visual |

## Métricas Alvo

| Métrica | Target |
|---------|--------|
| WCAG 2.1 AA | 100% |
| Lighthouse Accessibility Score | > 95 |
| axe-core violations | 0 critical |
| Keyboard navigable | 100% |
| Screen reader compatible | 100% |

## Recursos Externos

- [WCAG 2.1 Guidelines](https://www.w3.org/WAI/WCAG21/quickref/)
- [WAI-ARIA Authoring Practices](https://www.w3.org/WAI/ARIA/apg/)
- [Inclusive Components](https://inclusive-components.design/)
- [A11y Project Checklist](https://www.a11yproject.com/checklist/)

---

**Última atualização:** 2026-07-24
**Próxima auditoria:** 2026-08-24 (1 mês)
