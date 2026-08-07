# Templates de Prompt — Estúdio Lovable Local

## Template de DESIGN (visual)
```
Mudança de design no ZAPP Web (preview: http://localhost:8080):
- Elemento: [ex: botão de enviar mensagem]
- Mudança: [ex: cor de X para Y, tamanho, posição, animação]
- Inspiração: [ex: estilo WhatsApp, minimalista, cor da marca]
Após editar: rode bash scripts/preview/screenshot-design.sh e descreva o resultado.
```

## Template de CÓDIGO (lógica)
```
Mudança de código no ZAPP Web:
- Arquivo: [ex: src/components/Chat.tsx]
- Problema: [descrever em linguagem simples]
- Comportamento esperado: [ex: ao clicar X, deve acontecer Y]
Regras: typecheck e lint antes de finalizar. Não mexer em git/branches.
```

## Template de VERIFICAÇÃO (pós-mudança)
```
Verifique a mudança: [descrição]
1. bash scripts/preview/health-check.sh
2. Screenshot do design
3. Resumo do diff (git diff --stat)
4. Typecheck e lint
```
