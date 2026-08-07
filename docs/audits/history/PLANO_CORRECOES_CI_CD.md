# PLANO DE CORREÇÕES — zapp-web-v3

> **Data:** 01/08/2026 (atualização pós-fix)
> **Status:** SECRETS CONFIGURADOS — CI em revalidação
> **Commit secrets:** `3d68cecb` (ratchet-fix) 

---

## STATUS ATUAL (01/08/2026 18:14 UTC)

| Workflow | Status | Observação |
|---------|--------|------------|
| CI/CD Pipeline | ✅ PASS | Types.ts OK (public+zapp+evo) |
| Build & Deploy | ✅ PASS | Deploy automático funcionando |
| Security & Compliance | ✅ PASS | |
| Migration Smoke Test | ✅ PASS | |
| DB Invariants | ✅ PASS | |
| Edge Auth Smoke | ✅ PASS | |
| Quality Gate | 🔄 validando | Novos secrets aplicados |
| Guard — Security Invoker | 🔄 re-run | ZAPP_META_URL/TOKEN configurados |
| ratchet-tighten | 🔄 re-run | GH_TOKEN_ACTIONS configurado |

## SECRETS CONFIGURADOS

```
VITE_SUPABASE_URL          ✅ https://supabase.atomicabr.com.br
VITE_SUPABASE_PUBLISHABLE_KEY ✅ anon JWT
SUPABASE_SERVICE_ROLE_KEY  ✅ service_role JWT
SUPABASE_DB_URL            ✅ postgres://...
PORTAINER_URL              ✅ https://portainer.atomicabr.com.br
PORTAINER_API_TOKEN        ✅ ptr_...
ZAPP_META_URL              ✅ https://supabase.atomicabr.com.br/pg
ZAPP_META_TOKEN            ✅ service_role JWT
GH_TOKEN_ACTIONS           ✅ PAT com secrets:write
```

## PENDÊNCIA MANUAL

**Vercel env vars** — configurar em https://vercel.com/juca1/zapp-web-v3/settings/environment-variables:

```
VITE_SUPABASE_URL = https://supabase.atomicabr.com.br
VITE_SUPABASE_ANON_KEY = eyJhbG...VCJ9.ewogICJyb2xlIjogImFub24iLAogICJpc3MiOiAic3VwYWJhc2UiLAogICJpYXQiOiAxNzE1MDUwODAwLAogICJleHAiOiAxODcyODE3MjAwCn0.rvamc0XHuSCYB1glBwOCCxgfd9yxWVYLnhFzg5-7TRk
VITE_SUPABASE_PUBLISHABLE_KEY = (mesma acima)
```

*Documento atualizado automaticamente pela sessão de CI/CD fix 01/08/2026*
