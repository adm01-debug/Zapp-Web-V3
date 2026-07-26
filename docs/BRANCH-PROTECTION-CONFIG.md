# Configuração de Branch Protection — main

## Status atual

Branch protection ativo em `main` com `enforcement_level: "everyone"`.

## Required Status Checks recomendados (E18)

Para garantir que todos os gates de qualidade passem antes do merge, configurar os seguintes
checks como **obrigatórios** no GitHub:

### Como configurar

GitHub → Settings → Branches → Branch protection rules → main → Edit

Adicionar em **"Require status checks to pass before merging"** → "Search for status checks":

```
ci / lockfile           ← verifica bun.lock consistente
ci / quality            ← ESLint + TypeScript
ci / test               ← 2088 testes unitários (Vitest)
ci / build              ← vite build sem erros
quality-gate / quality-gate   ← gate geral de qualidade
```

Checks adicionais recomendados (quando workflows de segurança estiverem estáveis):

```
Secret Scan (gitleaks) / gitleaks          ← E6
Branch Protection Sentinel / check-quality ← E17
```

### Configuração atual (via script)

```bash
# Via GitHub CLI (gh auth login necessário)
gh api repos/adm01-debug/zapp-web-v3/branches/main/protection \
  --method PUT \
  --field required_status_checks='{"strict":true,"contexts":["ci / lockfile","ci / quality","ci / test","ci / build","quality-gate / quality-gate"]}' \
  --field enforce_admins=true \
  --field required_pull_request_reviews='{"dismiss_stale_reviews":true,"require_code_owner_reviews":false,"required_approving_review_count":1}' \
  --field restrictions=null \
  --field allow_force_pushes=false \
  --field allow_deletions=false
```

### Verificação diária

O workflow `branch-protection-sentinel.yml` roda via cron diário às 06h UTC
e emite warnings se a proteção foi alterada inesperadamente.

## Matriz de gates por tipo de mudança

| Tipo de mudança | Gates obrigatórios |
|---|---|
| Código TypeScript | ci/quality, ci/test, ci/build |
| Migrations SQL | migration-uniqueness, ci/build |
| Edge Functions (Deno) | deno-contract-tests, ci/build |
| Workflows CI | (somente syntax check automático) |
| Docs | (nenhum — aprovação manual suficiente) |
