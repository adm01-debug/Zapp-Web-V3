# ADR-007: Bloqueio de impressão mantido

**Data:** 2026-08-02
**Status:** Decidido
**Decisor:** Abner (Joaquim)

## Contexto

O app bloqueia globalmente a impressão via `@media print` injetado dinamicamente em `src/features/auth/hooks/useScreenProtection.ts:155`. Isso impede a impressão de qualquer página, incluindo transcrições de chat.

O achado F10-08 questiona se isso é proteção de PII deliberada ou defeito.

## Decisão

**Manter o bloqueio de impressão**, com as seguintes condições:
1. O bloqueio é proteção de PII (dados sensíveis de clientes não devem ser impressos)
2. Adicionar aviso ao usuário quando tentar imprimir: "Impressão bloqueada por política de segurança"
3. Se no futuro for necessária exportação, criar funcionalidade dedicada com redação de dados sensíveis (fora do escopo atual)

## Consequências

- ✅ Fecha o achado: **F10-08**
- 📝 Adicionar aviso ao usuário (tarefa adicional na Etapa 16 — Auth)
- 🔮 Exportação com redação fica como funcionalidade futura

## Achados resolvidos por esta decisão

| Achado | Status |
|--------|--------|
| F10-08 | RESOLVIDO POR DECISÃO — bloqueio é proteção, não defeito |
