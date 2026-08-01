# Branch Protection — main (etapa 50)

**Estado verificado em 2026-08-01 (via API):**
```json
{
  "enabled": true,
  "required_status_checks": {
    "enforcement_level": "off",
    "contexts": [],
    "checks": []
  }
}
```
A proteção existe mas **não exige nenhum status check** — qualquer push direto em `main` passa.

## Ação necessária (1 clique na UI ou PUT com token)

Na UI do GitHub: `Settings → Branches → main → Edit`:
- [ ] Require a pull request before merging (1 review)
- [ ] Require status checks to pass before merging
- [ ] Selecionar: `edge-auth-smoke`, `edge-env-completeness`, `edge-schema-parity`, `DB Invariants`, `Migration Uniqueness Gate`, `schema-drift-guard`, `Quality Gate`
- [ ] Require conversation resolution
- [ ] Do not allow bypassing the above settings

Ou via API (requer token com escopo `repo`):
```bash
curl -X PUT -H "Authorization: token $GH_TOKEN" \
  https://api.github.com/repos/adm01-debug/zapp-web-v3/branches/main/protection \
  -d '{
    "required_status_checks": {
      "strict": true,
      "contexts": [
        "edge-auth-smoke", "edge-env-completeness", "edge-schema-parity",
        "DB Invariants", "Migration Uniqueness Gate", "schema-drift-guard",
        "Quality Gate"
      ]
    },
    "enforce_admins": true,
    "required_pull_request_reviews": {
      "required_approving_review_count": 1,
      "dismiss_stale_reviews": true
    },
    "restrictions": null,
    "allow_force_pushes": false,
    "allow_deletions": false
  }'
```

> **Importante**: os workflows `edge-*` (etapas 47-49) já existem e passaram no push do merge do PR-668
> (`Edge Env Completeness: success`, `Edge Schema Parity: success` em main).
> Ativar o enforcement agora é seguro — todos os checks exigidos já rodam.
