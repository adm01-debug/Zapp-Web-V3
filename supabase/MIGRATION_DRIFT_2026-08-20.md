# Migration Drift — 2026-08-20 (Hermes)

## Resumo
- Runtime (`supabase_migrations.schema_migrations`): **770 versões aplicadas**.
- Repo (`supabase/migrations/*.sql`): **86 arquivos** (após squash canônico de 133 em 2026-08-04).
- **Drift: 684 versões no runtime SEM arquivo correspondente no repo.**

## Causa raiz
As 684 gaps foram aplicadas via `supabase_db_query` (MCP) durante as ondas de
auditoria/orquestração (sufixos `C01`, `G07B`, `A10001`, `FN01`, etc.), que gravam
em `schema_migrations` mas NÃO deixam arquivo de migration no repo. O squash
canônico `20260804000000_canonical_schema_squash_133_migrations.sql` colapsou as
133 primeiras; as 684 subsequentes nunca foram materializadas como arquivo.

## Ação (NÃO re-aplicar em prod)
- ⚠️ **Não criar DDL para as 684 gaps** — já estão aplicadas no runtime.
- Reaplicar via `supabase db push` causaria conflito de objeto existente.
- Próximas migrations devem SEMPRE ser arquivo em `supabase/migrations/` + apply
  via pipeline (`db-migrate.yml`), nunca via MCP direto.
- O livro de registro do repo foi fechado via
  `supabase/migrations/20260820000000_drift_version_stamps.sql` (somente
  `INSERT ... ON CONFLICT DO NOTHING` em `schema_migrations`, SEM DDL) para
  alinhar repo↔runtime sem alterar o banco.

## Evidência
- `C:/tmp/rt_versions.txt` (770 linhas do runtime)
- `C:/tmp/repo_versions.txt` (86 versões únicas do repo)
- Cruze: 0 pendentes de apply (tudo no repo já rodou); 684 dangling no runtime.

---

## Reconciliação 2026-08-20 (sessão de auditoria — verificação independente)

Auditoria cruzando GitHub `main`, Vercel, Supabase self-hosted (AtomicaBR) e
Portainer/Swarm. As etapas abaixo do `PLANO_MELHORIAS_100.md` foram **verificadas
ao vivo nesta sessão** (não só por commit), com a evidência medida:

| Etapa | Status | Evidência medida nesta sessão |
|---|---|---|
| 4/5 — rotação JWT secret + anon/service | ✅ RESOLVIDO | JWT secret ativo `d139ca…` (40c, não-demo) em `/run/secrets/supabase_jwt_secret_v1`; anon v2 (`iat 1715050800`) e service v3 (`iat 1785972617`) assinadas por ele. |
| 8 — Kong aceita anon canônica | ✅ RESOLVIDO | anon v2 → `REST /rest/v1/`=200 e `auth/v1/settings`=200; chaves de outro ambiente → 401. |
| 16/17/18 — env das edge functions | ✅ FALSO ALARME | `env len:0` era artefato de `exec` (shell novo). No **PID 1** do `supabase_functions`: `SUPABASE_SERVICE_ROLE_KEY`=v3, anon=v2, `JWT_SECRET`=40c. Nenhuma injeção necessária. |
| 64 — router `www.zappweb.app.br` | ✅ RESOLVIDO | router `zappweb-www` inline no stack 157 e no `deploy-vps.yml`; cert LE emitido; `www` serve o mesmo bundle (200). |
| 77/78/83 — hosting Vercel × VPS | ✅ RESOLVIDO | os 3 domínios (`www`/apex/`zapp.atomicabr`) servidos por **nginx na VPS** (`zapp-web-prod_web`), mesmo bundle; projetos Vercel `zapp-web`/`zapp-web-v2` `live:false`, sem esses domínios. |
| 1/3 — service_role fora do bundle Vercel | ⚠️ POR COMMIT | afirmado no commit de drift; a rotação (d139ca) já mata qualquer service_role antiga por assinatura. Bundle **servido** (VPS) confirmado sem service_role. |

### Incidente 2026-08-20 (anon quebrada em prod) — causa e fechamento
- **Causa raiz:** `VITE_SUPABASE_PUBLISHABLE_KEY` (GitHub Secret) trazia anon de
  outro ambiente; o build (`deploy-vps.yml`) a assava no bundle. Bundle servido às
  ~21:40 (`index-DMapReXq.js`) → `REST`/`auth`=401.
- **Fechado:** deploy do HEAD `3fcc3223` (21:49) trocou o bundle
  (`index-CX2piK04.js`) para a anon v2 → `REST`/`auth`=200 nos 3 hosts.
- **Blindagem na origem:** gate pré-`PUT stack` no `deploy-vps.yml` (extrai a anon
  do image buildado e valida contra o Kong antes de servir); `bundle-secret-guard`
  pós-deploy vira defesa-em-profundidade + drift diário.
- **Higiene de deploy:** `paths-ignore` (`**.md`, `docs/**`) no `on.push` — pushes
  docs-only (como este) não redeployam mais produção.
