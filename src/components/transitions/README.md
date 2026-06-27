# Page Transitions

Sistema centralizado de transições entre rotas, baseado em Framer Motion.
Respeita `prefers-reduced-motion` e usa apenas `transform` + `opacity`
(GPU-friendly).

## Setup

Já montado em `App.tsx`:

```tsx
<TransitionProvider defaultVariant="fade">
  <AppRoutes />
</TransitionProvider>
```

E em `AppRoutes.tsx`, `<Routes>` está envolto por `<PageTransition>`.

## Variants disponíveis

| Nome       | Efeito                                       |
| ---------- | -------------------------------------------- |
| `fade`     | Opacidade 0 → 1                              |
| `slide-x`  | Desliza horizontalmente (`direction` L/R)    |
| `slide-y`  | Desliza verticalmente (`direction` U/D)      |
| `zoom`     | Escala 0.96 → 1 com fade                     |
| `flip-x`   | Rotação no eixo X (perspective aplicada)     |
| `flip-y`   | Rotação no eixo Y                            |
| `parallax` | Translação Y + scale, estilo paralaxe        |

## Trocar variant em runtime

```tsx
const { setVariant } = usePageTransition();
setVariant('slide-x', { direction: 'right', duration: 0.4 });
navigate('/inbox');
```

## Override pontual por rota

```tsx
<PageTransition variant="zoom" overrides={{ duration: 0.5 }}>
  <MinhaPagina />
</PageTransition>
```

## Acessibilidade

Quando o usuário tem `prefers-reduced-motion: reduce`, todas as variants
degradam para um fade de 0.01s — mesmo padrão das view transitions do CSS.
