# Auditoria Sênior — Hermes Agent v3.0

**Data:** 2026-07-28 | **Repo:** zapp-web-v3 | **Analista:** Hermes AtomicaBR (DeepSeek v4 Pro)

---

## Sumário Executivo

Analisados **19,140 commits**, **2,058 arquivos fonte**, **132 Edge Functions**, **1,018 migrations SQL**, **37 workflows CI/CD**. Acionados **3 subagentes paralelos** para análise profunda.

---

## 🔴 CRÍTICOS (9)

### Segurança

| # | Gap | Impacto |
|---|-----|---------|
| 1 | `.env` commitado 4× no histórico (a7e12c1, 7e256fd, d89ab38, 5949e03) | API keys Supabase expostas permanentemente |
| 2 | `Credencias - Lalamove.txt` + `Credenciais - Lalamove - API - Turbo.txt` | Credenciais em texto plano |
| 3 | `.env.staging` rastreado (1044 bytes) | Config de staging exposto |

### Bloat

| # | Gap | Tamanho |
|---|-----|---------|
| 4 | `types.ts` 1,851 versões no histórico | 90 MB |
| 5 | `.dist-backups/` 6 releases, 4,593 arquivos | 75 MB |
| 6 | `lalamove_order_history_full.json` | 21.5 MB |
| 7 | Arquivos Lalamove totais (JSON, PDF, HTML, DOCX, Python) | 23.35 MB |
| 8 | `design-system-audit.*` 78 versões | 11.28 MB |

### Integridade

| # | Gap |
|---|-----|
| 9 | `types.ts` (9,407 linhas) sem schemas `zapp` e `evo` — apenas `public` |

---

## 🟠 ALTO (5)

| # | Gap | Evidência |
|---|-----|-----------|
| 10 | 40 arquivos >500 linhas — `ai-router/index.ts` (4,195 linhas) o pior | Necessita refatoração urgente |
| 11 | 3,027 blocos de código duplicado — 7 Edge Functions AI compartilham 50+ linhas idênticas | Extrair para `_shared/ai-setup.ts` |
| 12 | 282 arquivos com >10 imports | Alta acoplagem |
| 13 | 7 `console.log` em production Edge Functions | Log sensível em produção |
| 14 | Cobertura de testes: 20.3% geral — `src/pages` em 1.3% | Crítico para reliability |

---

## 🟡 MÉDIO (4)

| # | Gap |
|---|-----|
| 15 | 1,718 redundâncias `?: Type \| null` em `types.ts` (artefato do gerador) |
| 16 | `@ts-nocheck` em `types-manual.ts` suprime erros reais |
| 17 | 23 TODOs não resolvidos |
| 18 | 2 componentes `class` legados |

---

## 🟢 BAIXO (4)

| # | Gap |
|---|-----|
| 19 | 33 `: any` no código (aceitável para 2k+ arquivos) |
| 20 | `detectSessionInUrl: false` — configurado corretamente |
| 21 | Zero FIXME/HACK comments — boa disciplina |
| 22 | 27 `var` statements (Edge Functions Deno) |

---

## 📊 Métricas

| Métrica | Valor |
|---|---|
| **Commits totais** | 19,140 |
| **80% auto-gerados** | 15,294 por `gpt-engineer-app[bot]` (Lovable AI) |
| **Commits Hermes** | 24 |
| **PRs históricos** | 375 |
| **LOC total** | ~383K em 1,881 arquivos |
| **Tamanho do repo** | 2.1 GB em disco (77 MB .git, 1.2 GB node_modules) |
| **Bloat removível** | ~201 MB (types.ts 90MB + dist-backups 75MB + lalamove 23MB + design-audit 11MB) |

---

## Ações Imediatas Recomendadas

1. **🔴 P0: Rotacionar chave publishable do Supabase** — exposta no commit a7e12c113
2. **🔴 P0: Rotacionar credenciais Lalamove** — expostas em texto plano
3. **🔴 P0: Remover `.env.staging` do tracking** — ✅ corrigido nesta auditoria
4. **🟠 P1: Adicionar lalamove ao .gitignore** — ✅ corrigido nesta auditoria
5. **🟠 P1: Executar `git filter-branch` ou BFG** para remover ~201 MB do histórico
6. **🟡 P2: Regenerar `types.ts`** com schemas `zapp` e `evo`
7. **🟡 P2: Extrair boilerplate AI** das 7 Edge Functions para `_shared/ai-setup.ts`
8. **🟢 P3: Aumentar cobertura de testes** em `src/pages` (1.3% → 50%+)

---

## Histórico de Alterações

- 2026-07-28: Auditoria sênior completa. PR #615 (v1) merged. PR #616 (v2) aberta.
- 3 subagentes paralelos executados com sucesso.
