# E42 — allowlist: 20260817000000_p23_ingest_ledger_rejected.sql

**Data:** 17/08/2026 · **Autor:** Hermes (PG14-HARDENING, etapa 23)

**O que faz:** `ALTER TABLE evo.ingest_ledger ADD COLUMN IF NOT EXISTS reject_reason text`
+ extensão do CHECK `ingest_ledger_outcome_check` para aceitar `'rejected'`
(hoje: `processed` | `processed_reaction`).

**Por que é regularização (não DDL novo arbitrário):**
- O DDL do `ingest_ledger` NÃO é versionado no repo (vive só no runtime PG15.8) — a
  migration materializa uma mudança já APLICADA em produção via MCP no mesmo dia
  (coluna verificada via information_schema antes do commit).
- Suporte ao novo outcome `rejected` (etapa 23): descartes da edge passam a ser
  registrados com `reject_reason` (HMAC inválido com assinatura presente, 422 de
  contrato, instance desconhecida, rate-limit, tipos não suportados etc.), fechando
  a 'rejeição invisível' do pipeline.
- Idempotente (`IF NOT EXISTS` + `DO $$` defensivo) — replay seguro.

**Revisado:** sim — fluxo da edge (23) e leitores do ledger (v_ingest_reconciliation)
não quebram com o novo outcome (GROUP BY outcome aceita valores novos).
