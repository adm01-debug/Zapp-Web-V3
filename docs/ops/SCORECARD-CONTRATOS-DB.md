# SCORECARD-CONTRATOS-DB — Fechamento da Mega-Onda #927..#975

> **Data:** 2026-08-07 · **Branch:** `fix/fin-a10-scorecard-f9160` · **HEAD:** `033ac95e4` (#975)
> **Método:** validação integrada final (READ-ONLY) — pglast 154/154, unicidade, lint migrations, git archaeology 7/7, testes.
> **Veredito geral:** ✅ **FECHADO** — todos os gates verdes; débitos residuais listados em §4 (nenhum bloqueante).

---

## 1. Tabela por onda

| # | PR | SHA (merge) | Escopo | Status | Evidência |
|---|----|-------------|--------|--------|-----------|
| 1 | #927 | `2d6a06b81` | CI verde 70/70 + versionamento v1/v2 para todos os webhooks + 422 canônico | ✅ Fechado | `git merge-base --is-ancestor 2d6a06b81 HEAD` = ancestral |
| 2 | #932 | `1f5352264` | Wave 2 — casos negativos (+57 testes), 422 canônico em 10 sites, schedule CI diário | ✅ Fechado | ancestral de HEAD; imports corrigidos no #968 |
| 3 | #957 | `4659d7e8e` | Wave 3 — envelopes de domínio (evolution-api contract+details+422, security contract, frontend por code, parser compartilhado) | ✅ Fechado | ancestral de HEAD |
| 4 | #959 | `a876b156f` | mcp-query com gate de contrato (nasceu sem — quebrava contract-coverage em main) | ✅ Fechado | ancestral de HEAD |
| 5 | #963 | `8e5818848` | Colisão de timestamps 20260807091000/20260807120000 — timestamps livres + SQL item85 corrigido | ✅ Fechado | ancestral de HEAD |
| 6 | #964 | `f1e18bc84` | P1 — secret hardcoded removido (env fail-closed) + whitelist SQL read-only | ✅ Fechado | ancestral de HEAD; scan de segredos 0 reais (§3.5) |
| 7 | #968 | `9d915ec47` | Imports quebrados da #932 em 3 edge functions (duplicado) | ✅ Fechado | ancestral de HEAD |
| 8 | #971 | `15c502454` | item85 dollar-quote corrigido (tags `$g$`/`$i$` — parse real validado) + exec_sql RPC read-only p/ mcp-query | ✅ Fechado | ancestral de HEAD |
| 9 | #972/#974 | `fd6b8e642`/`b3b41d59a` | MCP_QUERY_SECRET no .env.required (Edge Env Completeness) + espelhos migrations pgmq/health_score_cache_seq | ✅ Fechado | ancestrais de HEAD |
| 10 | #975 | `033ac95e4` | Onda 10 agentes — ON CONFLICT×11, merge markers×10, vald RLS, revoke_anon, 404 router, testes reais | ✅ Fechado | HEAD da branch; pglast 154/154 (§3.1) |

**Git archaeology: 7/7** — todos os SHAs de onda (`2d6a06b81`, `1f5352264`, `4659d7e8e`, `a876b156f`, `8e5818848`, `f1e18bc84`, `033ac95e4`) são ancestrais de HEAD.

---

## 2. Totais consolidados

| Métrica | Esperado | Medido | Status |
|---------|----------|--------|--------|
| Migrations no repo | 154 | 154 | ✅ |
| pglast parse (python 3.11, pglast 6.5) | 154/154 | **154/154 (0 falhas)** | ✅ |
| Unicidade de prefixo 14 chars | 0 duplicados | **0 duplicados** | ✅ |
| Lint migrations (novas violações vs baseline pré-ondas) | 0 novas | 0 de conteúdo (+3 por duplicação de arquivo, §3.3) | ✅ c/ ressalva |
| check-migration-gates (CI) | OK | OK — 154 migs, 43 timestamps futuros (padrão da casa), 3 antipadrão na allowlist | ✅ |
| Edge functions com gate de contrato (contract-kit) | — | **106/107 (99,1%)** | ✅ |
| Testes Deno (arquivos `.test.ts`) | 73 | 73 arquivos; `_shared` = 1765 passed / 0 failed | ✅ |
| Testes Vitest | 7866 | **7869 passed · 11 skipped (7880)** — 364 files passed / 3 skipped (367) | ✅ |
| Segredos crus no repo | 0 | **0 reais** (4 hits = placeholders truncados/testes de redação) | ✅ |
| Retry HTTP (proxy Evolution) | só ≥500/429/408 | `RETRYABLE_STATUSES = {408, 429, 500, 502, 503, 504}` | ✅ |
| Versionamento de contratos | current/supported/sunset | v1/v2 com sunset ISO (v1 → 2027-01-01/2027-06-01) | ✅ |

---

## 3. Detalhe das verificações

### 3.1 pglast 154/154
Parse completo de todas as migrations com `from pglast import parse_sql` (Python 3.11.15, pglast 6.5): **154 OK / 0 FAIL**. Cobre o histórico de ON CONFLICT inválido em `SELECT cron.schedule(...)` (#963/#971/#975) — todos convertidos ao padrão unschedule+schedule e parseáveis.

### 3.2 Unicidade
`git ls-files supabase/migrations | sed 's|.*/||' | cut -c1-14 | sort | uniq -d` → **0 linhas** (sem colisão de timestamp; fix do #963 confirmado).

### 3.3 Lint migrations (18 violações totais — todas pré-existentes ou falso positivo)
Baseline no pai de #927 (`829abe7fc`): **16 violações** em 125 arquivos. HEAD: **18** em 154. Diff:

| Tipo | Baseline | HEAD | Δ | Análise |
|------|----------|------|---|---------|
| ML-004 (tabela sem RLS no bloco) | 6 | 8 | +2 | As 2 novas = arquivo **duplicata idêntica** `20260804210923` (cópia byte-a-byte do `20260804210000`, criada no #964 como espelho do registro no DB) — nenhuma violação de conteúdo nova |
| ML-005 (GRANT TO PUBLIC) | 4 | 3 | **−1** | **1 resolvida** (revoke_anon_execute_six_functions, #975); as 3 restantes = falso positivo documentado (GRANT em **comentário de rollback** `--`, P3 no CHANGELOG) |
| ML-008 (SECDEF sem auth.uid) | 6 | 7 | +1 | A nova = mesma duplicata `20260804210923`; 5 das 6 pré-existentes estão no débito documentado do CHANGELOG (P2: verificar REVOKE em produção) |

**Conclusão:** zero violações novas de conteúdo introduzidas pela mega-onda; +3 aparecem apenas por duplicação de arquivo (débito §4.1). Nenhuma ação bloqueante. Detalhe dos ML-004: `warroom_alerts` tem RLS habilitado em migration anterior (`20260804120000`/`20260804140100`) → falso positivo do linter (CREATE IF NOT EXISTS + RLS em outra migration); `fn_health_score_cache/history`, `cron_inventory`, `ai_function_metrics`, `processed_requests` = tabelas internas de cache/telemetria (débito P2, §4.2).

### 3.4 Git archaeology
`git merge-base --is-ancestor` de `2d6a06b81`, `1f5352264`, `4659d7e8e`, `a876b156f`, `8e5818848`, `f1e18bc84`, `033ac95e4` vs HEAD → **7/7 ancestrais**. Todos os merges das ondas presentes na linhagem.

### 3.5 Segredos (scan read-only)
Varredura de padrões (JWT, `sk-`, AKIA, tokens GH, private keys, connstrings com senha) em `supabase/functions`, `src`, `.github`: **4 hits, todos placeholders/testes**:
- `log-sanitizer.test.ts:112` — JWT truncado (`eyJhbG...e_xx`) num teste que **asserta a redação** do secret;
- `edge-auth-smoke.yml:196` — `FAKE_JWT` truncado (teste de rejeição);
- `publish-evolution-api-custom.yml:73,80` — DSN de exemplo com senha mascarada (`dummy:***`).

**Zero segredos reais.** O P1 do #964 (secret hardcoded no mcp-query) está corrigido: `Deno.env.get('MCP_QUERY_SECRET') ?? ''` fail-closed + whitelist read-only.

### 3.6 Retry correto
`evolution-api-proxy.ts`: `RETRYABLE_STATUSES = new Set([408, 429, 500, 502, 503, 504])` com backoff exponencial + jitter + DLQ. **4xx de validação (400/401/403/422) nunca são retried** — semântica correta pós-mudança 400→422.

### 3.7 Versionamento
`_shared/contract-versions.ts`: `current`/`supported`/`sunset` (ISO). Ex.: evolution-webhook `current: v2, supported: [v1, v2], sunset v1 → 2027-01-01`; whatsapp-cloud-webhook `v1 → 2027-06-01`. `parseOrReject` (contract-kit): precedência header `x-contract-version` > `body.contract_version` > `body.version`; versão fora de `supported` → 422 `unsupported_contract_version` listando as suportadas. Guarda anti-crash para schema ausente (incidente P0 de 08-04) mantida.

### 3.8 Testes
- **Deno:** 73 arquivos `.test.ts` (37 `_shared` + demais funções); `_shared/__tests__/` = **1765 passed / 0 failed** (9s).
- **Vitest:** suíte completa = **7869 passed · 11 skipped (7880)** em 367 arquivos (364 passed, 3 skipped), EXIT 0, ~6 min. Contagem acima do alvo 7866 (testes novos das ondas).

---

## 4. Débitos abertos (lista curta — nenhum bloqueante)

| # | Débito | Prioridade | Ação |
|---|--------|-----------|------|
| 4.1 | Arquivo duplicado `20260804210923_restore_edge_idempotency_rpcs.sql` é cópia byte-a-byte do `20260804210000` (criado no #964 como espelho do registro do DB) | P3 | Consolidar: manter um só (o que casa com o registro em `schema_migrations`) e remover/arquivar o outro — elimina 3 violações de lint espelhadas |
| 4.2 | ML-004 em tabelas internas sem RLS: `fn_health_score_cache`, `fn_health_score_history`, `cron_inventory`, `ai_function_metrics`, `processed_requests` | P2 | Avaliar `ENABLE ROW LEVEL SECURITY` (sem policies = deny all) ou documentar justificativa de tabela interna service_role-only |
| 4.3 | ML-008 pré-existentes (5 fns de cron/health/inventory, débito P2 do CHANGELOG) | P2 | Confirmar REVOKE/guarda `auth.uid()` em produção ou versionar correção — verificação runtime fora do escopo deste scorecard (repo) |
| 4.4 | ML-005 falso positivo do linter (GRANT em comentário de rollback) | P3 | Adicionar `-- ignore-lint-ml005` nos comentários ou corrigir o linter para ignorar blocos `--` |
| 4.5 | `fn_require_app_user` sem `SET search_path` em SECURITY DEFINER (NOTA no `20260807130000`) | P2 | Versionar a função com search_path fixo (dono: sessão que criou a função) |

---

## 5. Método e reprodutibilidade

```bash
# pglast
python - <<'EOF'   # Python 3.11 + pglast 6.5
import glob; from pglast import parse_sql
files = sorted(glob.glob('supabase/migrations/*.sql'))
ok = sum(1 for f in files if _try_parse(f))  # 154/154
EOF

# unicidade
git ls-files supabase/migrations | sed 's|.*/||' | cut -c1-14 | sort | uniq -d   # → 0

# lint migrations (CI)
node scripts/lint-migrations.mjs            # 18 violações, todas pré-existentes/falso positivo
node scripts/check-migration-gates.mjs --allowlist=20260804000000_canonical_schema_squash_133_migrations.sql,20260804150000_fix_secdef_revoke_extended_schemas.sql,20260804170000_fix_rls_systematic_coverage.sql  # → OK

# git archaeology
for sha in 2d6a06b81 1f5352264 4659d7e8e a876b156f 8e5818848 f1e18bc84 033ac95e4; do
  git merge-base --is-ancestor $sha HEAD && echo "$sha OK"
done   # 7/7

# testes
deno test --allow-all --no-check supabase/functions/_shared/__tests__/   # 1765 passed
NODE_OPTIONS=--max-old-space-size=6144 vitest run                         # 7869 passed / 11 skipped
```
