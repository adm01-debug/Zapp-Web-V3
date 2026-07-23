# Política de Segurança — ZAPP-WEB (Pronto Talk Suite)

## Versões suportadas
A branch `main` (produção) é a única com suporte de segurança ativo.

## Reportar uma vulnerabilidade
Envie para **ti@promobrindes.com.br** com:
- descrição e impacto,
- passos de reprodução,
- componente/arquivo afetado.
Não abra issue pública para vulnerabilidades.

---

## Postura atual (auditoria 2026-07-22)

- **Segredos em código:** nenhuma anon key/JWT hardcoded em `src/` — todas via `import.meta.env`.
- **CVEs de dependência:** `xlsx` fixado no tarball oficial SheetJS (mitiga Prototype Pollution CVSS 7.8).
- **Observabilidade:** Sentry (`@sentry/react`) captura exceções e replay em produção.
- **Headers HTTP (nginx):** `X-Frame-Options`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`.
- **Pre-commit:** `.gitleaks.toml` bloqueia commits com secrets detectados.
- **Edge Functions:** timing-safe secret comparison via `timingSafeStringEqual()` (PR #487).
- **RLS:** 100% de cobertura em schemas `zapp` e `evo`; `SECURITY DEFINER` com `search_path` fixo.

---

## Ações pendentes — operador obrigatório

### 🔴 CRÍTICO — Secret scanning GitHub (DESABILITADO)

O GitHub Secret Scanning e Push Protection estão **desabilitados** neste repositório.
O gitleaks (pre-commit local) é a única proteção atual. Sem a camada do GitHub,
um secret em histórico antigo ou num fork não seria detectado.

**Como habilitar (2 minutos, grátis para repos públicos):**

1. Ir para: `https://github.com/adm01-debug/zapp-web-v3/settings/security_analysis`
2. Em **"Secret scanning"** → clicar em **Enable**
3. Em **"Push protection"** → clicar em **Enable**

Ou via GitHub CLI (requer PAT com `admin:repo`):
```bash
gh api -X PATCH /repos/adm01-debug/zapp-web-v3 \
  -f 'security_and_analysis[secret_scanning][status]=enabled' \
  -f 'security_and_analysis[secret_scanning_push_protection][status]=enabled'
```

**Status:** `[ ]` Pendente

---

### 🔴 CRÍTICO — PAT com escopo read-only no workspace (issue #168)

O clone do repo em `claude-code_workspace` usa um PAT embutido na URL do remote
com escopo **somente leitura**. O token está exposto em texto claro na configuração git.

**Ações:**
1. **Revogar** o PAT atual em `https://github.com/settings/tokens`
2. Criar um **fine-grained token** com `contents: write` (mínimo necessário)
3. Reconfigurar o remote **sem embutir o token na URL**:
   ```bash
   # Na workspace (claude-code container):
   git remote set-url origin https://github.com/adm01-debug/zapp-web-v3.git
   # Usar GH_TOKEN via ~/.netrc ou credential manager
   ```
4. **Definir expiração** e lembrete de rotação

Ver issue #168 para contexto completo.

**Status:** `[ ]` Pendente

---

### 🟡 MÉDIO — Verificar histórico git por secrets

```bash
# Verificar se algum secret vazou em commits históricos
git log --all --full-history -- "*.env*"
git log -p --all -S "SUPABASE_SERVICE" | head -50
git log -p --all -S "service_role" | head -50

# Se encontrar: rotacionar imediatamente e usar git-filter-repo para limpar
```

**Status:** `[ ]` Não verificado

---

### 🟡 MÉDIO — Dependabot security updates

1. Ir para: `https://github.com/adm01-debug/zapp-web-v3/settings/security_analysis`
2. Em **"Dependabot security updates"** → Enable

**Status:** `[ ]` Pendente

---

## Itens em endurecimento (código)

- RLS: políticas com `USING (true)` / `WITH CHECK (true)` em revisão por tenant.
- `SECURITY DEFINER` sem `SET search_path` em correção (PR #487 corrige 12 funções).
- Token de auth em `localStorage` (padrão SPA + PKCE) — avaliar storage endurecido.

---

## Histórico de correções de segurança

| Data | Vulnerabilidade | PR/Commit | Status |
|------|----------------|-----------|--------|
| 2026-07-20 | Timing attack em 7+ edge functions (`===` para secrets) | PR #487 | 🔄 Aguarda rebase |
| 2026-07-20 | OAuth CSRF (state token sem HMAC) | PR #487 | 🔄 Aguarda rebase |
| 2026-07-20 | `email-track-link`: redirect `javascript:` URI injection | PR #487 | 🔄 Aguarda rebase |
| 2026-07-20 | `proxy-health`: endpoint público com dados de infra | PR #487 | 🔄 Aguarda rebase |
| 2026-07-17 | `rpc_dlq_*`: search_path inseguro + role check ausente | Commits diretos | ✅ Resolvido |
| 2026-07-17 | `search_contacts_cursor`: SQL injection via sort_direction | Commits diretos | ✅ Resolvido |
