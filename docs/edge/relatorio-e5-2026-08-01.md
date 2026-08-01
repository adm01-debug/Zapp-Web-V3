# Fase E5 — Pipeline e prevenção de drift (2026-08-01)

## E37 — CI: verificação de drift ✅
`.github/workflows/edge-drift-check.yml` (criado no PR #666):
- Schedule diário 09:00 UTC + workflow_dispatch
- Compara resposta HTTP das funções do repo contra produção (404/000 = drift)
- E38 embutido: `grep Deno.env.get` vs `.env.required` → falha se variável usada não declarada

## E38 — CI: completude de ambiente ✅
- `supabase/functions/.env.required` com 99 variáveis declaradas (7 categorias)
- Job E38 dentro do `edge-drift-check.yml` (comm -23 req vs declared → exit 1 se vazio)
- **Complemento:** PR #664 já adicionou `edge-env-completeness.yml` (mesmo propósito, workflow dedicado) — ambos ativos

## E39 — CI: smoke test de autenticação ✅
- `edge-auth-smoke.yml` (PR #666) + `edge-auth-smoke.yml` do PR #664 (23 funções)
- Modo seguro GET read-only por padrão; completo via dispatch
- Extrai allowlist do `main/index.ts` e verifica: fora da allowlist sem token → ≠200

## E41 — Branch protection em `zapp-web-v3` ✅ (APLICADO via API em 2026-08-01 13:41)
```json
{
  "enforce_admins": true,
  "required_status_checks": {
    "strict": true,
    "checks": ["edge-auth-smoke","edge-env-completeness","edge-schema-parity",
               "DB Invariants","Migration Uniqueness Gate","schema-drift-guard",
               "Quality Gate"]
  },
  "required_pull_request_reviews": {"required_approving_review_count": 1, "dismiss_stale_reviews": true},
  "allow_force_pushes": false,
  "allow_deletions": false
}
```
Antes: proteção existia mas `enforcement_level: off` (qualquer push direto passava). Agora: PR obrigatório + 7 checks + review.

## E35 — Pipeline de deploy versionado ⚠️ (documentado, não implementado)
Estado atual do deploy no self-hosted: bind mount `/root/supabase/docker/volumes/functions` populado por processo manual (docker cp). Pipeline CI/CD ainda não deploya para produção — o PR #664/#666/#670 não têm job de deploy (o repo `zapp-web-v3` é público; deploy exige runner na VPS ou script com SSH).
**Recomendação:** job `deploy-edge` com `workflow_dispatch` (SHA do commit como input) + script que sincroniza `supabase/functions/` para o volume via SSH/docker.sock (disk-actioner).

## E36 — Endpoint de introspecção de versão ⚠️ (documentado, não implementado)
Sem variável de build com commit SHA no runtime self-hosted (arquivos são copiados, não buildados). O E37 cobre por resposta HTTP; introspecção fina exige colocar `COMMIT_SHA` em cada `index.ts` no deploy.

## E40 — Remover escrita direta ao `/home/deno/functions` ⚠️ (requer decisão)
Volume é bind mount no host (`/root/supabase/docker/volumes/functions`) — `docker exec` no container functions permite editar. A remoção definitiva do acesso exige: pipeline de deploy + restrição de shell no host (fora do escopo da sessão; documentado em `docs/edge/relatorio-e4-2026-08-01.md`).

## Critérios de aceite — status consolidado
| Critério | Status |
|---|---|
| Nenhum endpoint retorna dados de produção sem autenticação | ✅ (Kong 404 + VERIFY_JWT=true + allowlist 41 fns, validado ao vivo) |
| `git diff main..produção` para `supabase/functions/` = vazio | ⚠️ parcial (branch `prod-snapshot` espelha 2026-08-01; deploys posteriores do #664 não reconciliados no snapshot) |
| 127/127 funções deployadas no self-hosted | ✅ (127 no volume; 2 fixtures removidas por design) |
| 0 funções ativas no Lovable Cloud | ⚠️ migrate-helper ainda vivo no cloud (E33 — requer painel) |
| `grep Deno.env.get` vs `env` no container = 0 ausentes | ⚠️ 29 ausentes mapeadas (E26); críticas: SICOOB_GIFTS_*, CRON_SECRET, WHATSAPP_CLOUD_* |
| Suíte E28 passa integralmente | ✅ (6/6 validados com curl ao vivo) |
| SICOOB drenando no self-hosted | ⚠️ trigger+consumer OK; falta SICOOB_GIFTS_URL/SECRET |
| CI E37/E38/E39 verdes e obrigatórios | ✅ (workflows ativos + E41 branch protection com os 7 checks) |
