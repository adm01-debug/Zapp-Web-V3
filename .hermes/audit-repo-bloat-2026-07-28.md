# AUDITORIA DE REPOSITORY BLOAT — zapp-web-v3-fix
**Data:** 2026-07-28  
**Repositório:** `/opt/data/zapp-web-v3-fix`  
**Métricas gerais:** 2.1 GB em disco (inclui node_modules) | 138K objetos git | 0.61 GB blob descomprimido | 72.58 MB git pack

---

## 🔴 CRITICAL (P0) — Risco de Segurança Imediato

### 1. `.env` comitado com chave Supabase real
- **Arquivo:** `.env`
- **Commit:** `a7e12c113` ("Changes")
- **Removido em:** `5949e03c6` ("🔒 R-001: Remove .env from repo (security fix)")
- **Conteúdo vazado:**
  - `VITE_SUPABASE_PROJECT_ID="allrjhkpuscmgbsnmjlv"`
  - `VITE_SUPABASE_PUBLISHABLE_KEY="eyJhbG...HA74"` (truncado mas presente)
  - `VITE_SUPABASE_URL="https://allrjhkpuscmgbsnmjlv.supabase.co"`
- **Severidade:** 🔴 CRÍTICA — Chave publishable do Supabase exposta permanentemente no histórico git
- **Ação necessária:** Rotacionar a chave publishable do Supabase IMEDIATAMENTE. O histórico git é imutável e qualquer clone contém essas credenciais.

### 2. `.env.staging` RASTREADO no git (NÃO ignorado corretamente)
- **Arquivo:** `.env.staging` (1044 bytes)
- **Status:** **ATIVAMENTE TRACKED** — `git ls-files --cached` confirma
- **Causa:** `.gitignore` tem `.env.*` (linha 9) e `.env.staging` (linha 17), mas o arquivo já estava tracked antes das regras serem adicionadas
- **Severidade:** 🔴 CRÍTICA — Variáveis de ambiente de staging versionadas
- **Ação necessária:** `git rm --cached .env.staging` e verificar se contém secrets

### 3. Arquivos de credenciais em texto plano
- **Arquivos:**
  - `Credencias - Lalamove.txt` (493 bytes, 2 versões)
  - `Credenciais - Lalamove - API - Turbo.txt` (375 bytes, 2 versões)
- **Severidade:** 🔴 CRÍTICA — Arquivos explicitamente nomeados como credenciais
- **Ação:** Remover do histórico (BFG/git-filter-repo) e rotacionar credenciais Lalamove

---

## 🔴 CRITICAL (P0) — Bloat Massivo no Histórico Git

### 4. `src/integrations/supabase/types.ts` — 90.08 MB (1,851 versões)
- **Maior blob individual:** 2.68 MB
- **Blobs >2 MB:** 4 versões (10.02 MB)
- **Causa:** Arquivo auto-gerado pelo Supabase CLI (`supabase gen types`). Cada alteração de schema gera uma nova versão de ~2 MB.
- **Severidade:** 🔴 CRÍTICA — Maior fonte de bloat do repositório. 90 MB para um arquivo gerado.
- **Mitigação:** Já está versionado como fonte. Considerar gerar em CI e não commitar, ou usar git LFS.

### 5. `.dist-backups/` — 74.77 MB (4,593 arquivos, 6 releases)
- **Releases:** 6 snapshots de build (`release-2026-05-04T22:30:22Z` até `release-2026-05-05T00:29:17Z`)
- **Maiores arquivos:** `assets/index-*.js` (~5.2 MB cada), versões `.br`/`.gz` também
- **Status atual:** ✅ `.gitignore` linha 189 tem `.dist-backups/` | ✅ Removido do tracking em `2024148f4`
- **Mas:** 74.77 MB PERMANENTEMENTE no histórico git
- **Severidade:** 🔴 CRÍTICA — Build artifacts de releases antigas ocupando espaço permanentemente

### 6. `lalamove_order_history_full.json` — 21.5 MB
- **Maior blob individual do repositório**
- **Commit:** `c53079896` ("Add files via upload")
- **Removido em:** `2fe9a207d` ("🧹 cleanup: remove lalamove_order_history_full.json from root (21MB!)")
- **Severidade:** 🔴 CRÍTICA — Dump de dados JSON de 21.5 MB permanentemente no histórico

### 7. Arquivos Lalamove — 23.35 MB total (23 objetos)
- `lalamove_order_history_full.json` — 21.5 MB
- `lalamove_documentacao_completa.md.pdf` — 1.73 MB (2 versões)
- `lalamove_api_docs_v3.md.pdf` — 711 KB
- `lalamove_documentacao_completa.html` — 75 KB
- `lalamove_bundle_import.json` — 73 KB
- + `.docx`, `.py`, `.sh`, `.md` files
- **Status:** PDFs removidos em `69ee7977e` / `b43979abe`
- **Severidade:** 🔴 CRÍTICA — Dados de vendor (PDFs, JSON) que nunca deveriam estar no repo

### 8. `design-system-audit.*` — 11.28 MB (78 versões)
- `design-system-audit.html` — 709 KB (múltiplas versões, ~20+)
- `design-system-audit.md` — 173 KB (múltiplas versões, ~50+)
- **Status:** ✅ `.gitignore` linhas 216-217 tem ambas extensões
- **Severidade:** 🔴 CRÍTICA — Relatórios de auditoria gerados versionados dezenas de vezes

---

## 🟠 HIGH (P1) — Problemas de Higiene Git

### 9. `.tsbuildinfo` — 1.2 MB em disco (não rastreado)
- **Arquivo:** `.tsbuildinfo` (1,252,041 bytes)
- **Status:** ✅ `.gitignore` linha 110 tem `*.tsbuildinfo` | ✅ NÃO está tracked no git
- **Severidade:** 🟠 HIGH — Arquivo de cache do TypeScript ocupando 1.2 MB em disco. Seguro deletar.

### 10. PDFs no repositório — 2.49 MB (10 objetos)
- `lalamove_documentacao_completa.md.pdf` — 1.73 MB
- `lalamove_api_docs_v3.md.pdf` — 711 KB
- `docs/audit/DOSSIA_AUDITORIA_ENTERPRISE_V5.pdf` — 57 KB (múltiplas versões)
- `docs/audit/ENTERPRISE_AUDIT_REPORT_V6.pdf` — 37 KB (múltiplas versões)
- **Severidade:** 🟠 HIGH — Binários desnecessários. Documentação deveria estar em Markdown.

### 11. `.env.staging` ativamente rastreado
- **Ver também:** Item #2 acima
- **Conteúdo:** 1044 bytes de configuração de staging
- **Ação:** Remover do tracking e adicionar ao `.gitignore`

---

## 🟡 MEDIUM (P2) — Melhorias Recomendadas

### 12. `.gitignore` — Entradas faltantes
| Padrão | Presente? | Notas |
|--------|-----------|-------|
| `.dist-backups/` | ✅ Linha 189 | OK |
| `*.tsbuildinfo` | ✅ Linha 110 | OK |
| `coverage/` | ✅ Linha 115 | OK |
| `*.log` | ✅ Linha 58 | OK |
| `node_modules` | ✅ Linha 74 | OK |
| `dist/` | ✅ Linha 94 | OK |
| `build/` | ✅ Linha 96 | OK |
| `.npm-cache/` | ❌ | Adicionar por segurança |
| `.env.staging` | ⚠️ Linha 17 | Regra existe mas arquivo já estava tracked |
| `*.pdf` | ❌ | PDFs grandes foram commitados; considerar adicionar |

### 13. Estatísticas gerais do repositório
- **Tamanho em disco:** 2.1 GB (inclui `node_modules` local)
- **Git pack (comprimido):** 72.58 MB
- **Blobs descomprimidos totais:** ~0.61 GB (41,978 blobs)
- **Objetos totais:** ~138,068
- **Maior blob:** `lalamove_order_history_full.json` — 21.5 MB
- **Top 3 fontes de bloat:**
  1. `supabase/types.ts` — 90.08 MB (1,851 versões)
  2. `.dist-backups/` — 74.77 MB (4,593 arquivos)
  3. `lalamove_*` files — 23.35 MB (23 objetos)

---

## 📋 Resumo Executivo

| Categoria | Issues | Bloat Total |
|-----------|--------|-------------|
| 🔴 Secrets expostos | 3 | `.env` + `.env.staging` + credenciais Lalamove |
| 🔴 Bloat crítico | 5 | ~201 MB (types.ts + dist-backups + lalamove + design-audit) |
| 🟠 High | 3 | `.tsbuildinfo` (disco) + PDFs + `.env.staging` tracking |
| 🟡 Medium | 2 | `.gitignore` gaps + métricas gerais |

**Ação imediata mais crítica:** Rotacionar a Supabase publishable key exposta no commit `a7e12c113`.

**Maior ganho de espaço:** Rodar `git-filter-repo` ou `BFG Repo-Cleaner` para remover do histórico:
1. `.dist-backups/` (74.77 MB)
2. `lalamove_order_history_full.json` + PDFs (23.35 MB)
3. `design-system-audit.*` (11.28 MB)
4. `Credencia*` files (segurança)

**Nota sobre `supabase/types.ts` (90 MB):** Este é um caso especial — é um arquivo gerado mas útil para type-safety. Avaliar migração para git LFS ou geração em CI.
