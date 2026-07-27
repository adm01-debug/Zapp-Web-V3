# ADR-DB-003 — Mover extensões de public para extensions schema

**Status:** DEFERIDO (HIGH RISK)
**Data:** 2026-07-16

---

## Avaliação de Risco

| Fator | Nível |
|-------|-------|
| Impacto | QUEBRARIA PostgREST, Supabase Auth, Realtime |
| Clientes afetados | Todos |
| Reversão | Complexa — requer dump/restore |
| Tracking | Não começou |

## Veredito

**ADIADO.** Mover extensões do schema `public` para `extensions` é uma mudança
estrutural de altíssimo impacto. Clientes existentes dependem de `public.extensions`.
Qualquer migração deve ser precededida de:

1. Staging completo com carga de produção simulada
2. Teste com todos os clientes PostgREST
3. Backup completo antes e depois
4. Janela de manutenção com downtime esperado

## Mitigação de curto prazo

Documentar todas as chamadas para `public.extensions` no código:
```
grep -r "public\." --include="*.sql" supabase/migrations/
grep -r "search_path" --include="*.sql" supabase/migrations/
```
