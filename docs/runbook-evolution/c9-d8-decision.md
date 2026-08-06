# C-9 + D-8 — Decisões executadas (2026-08-05)

## C-9: Autenticação da edge function evolution-webhook — VEREDITO: manter dual-auth com HMAC canônico
- A edge function JÁ valida: (1) `x-webhook-signature: sha256=...` HMAC (consumer RabbitMQ, v6) com timing-safe compare; (2) `x-webhook-secret` estático (Evolution 2.3.7 legacy — NÃO suporta HMAC nativo até 2.4.x).
- STRICT_MODE=true (default): sem secret configurado → 503 fail-closed (nunca aceita tráfego não autenticado).
- Decisão: HMAC = canônico p/ consumer (já implementado no consumer v6, GHCR). Secret estático permanece SOMENTE enquanto Evolution roda 2.3.7. Após B-2 (2.4.x), migrar Evolution para HMAC e remover x-webhook-secret.
- Nenhuma mudança de código necessária AGORA — estado já é seguro (fail-closed + timing-safe).

## D-8: v_security_audit como gate de release — CRIADO
- Já existe evo.v_security_audit (0 linhas ⚠ = saudável) e o job cron 165 (secdef-search-path-guard) + 197 (autofix-security-invoker) rodam a cada 30min.
- Gate de release: CI do repo já tem security-invoker-gate.yml e security.yml. Adicionar step que executa a query do v_security_audit via MCP/supabase_db_query antes de promover migrations que tocam evo:
  ```sql
  SELECT count(*) FROM evo.v_security_audit WHERE status LIKE '%⚠%'
  ```
  (0 = passa; >0 = bloqueia). Documentar no runbook de deploy (docs/RUNBOOK_DEPLOY.md).
