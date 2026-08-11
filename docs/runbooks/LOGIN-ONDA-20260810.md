# Runbook — Incidente de Login ZAPP Web (2026-08-10)

> Severidade: **P1 (crítico)** — nenhum usuário conseguia logar pelo frontend.
> Resolvido em: ~4h (19:24 → 23:30). Causa raiz: **build do Vercel com service_role key rotacionada**.

## Sintomas (observados)

| Sintoma | Evidência |
|---|---|
| App fica em `/auth`; login por senha "nada acontece" | URL permanece `…/auth`, sem navegação |
| Botão Google retorna 400 | `{"code":400,"error_code":"validation_failed","msg":"Unsupported provider: provider is not enabled"}` |
| Console: `POST /functions/v1/login-attempts` com retries | `Wn.maxRetries` no stack — fetch completava mas login nunca avançava |
| **Nenhum** `/auth/v1/token` chegava ao GoTrue | Logs do serviço `supabase_auth` sem tentativas de senha |
| Conta travada com "Muitas tentativas" | `zapp.login_attempts`: `attempt_count=9`, `locked_until` 16 min (escala `2^(n-5)`) |

## Causa raiz (3 camadas)

1. **🔴 Chave do frontend desatualizada (causa raiz):**
   - O bundle de `www.zappweb.app.br` (Vercel) foi buildado com a **service_role key clássica** (payload `{"role":"service_role","iat":1715050800}`) em vez da anon key.
   - A service key foi **rotacionada para v3 em 05/08** (`iat 1785972617`); o Kong (DB-less, keyring regenerado no restart de 09/08) **removeu a key antiga do keyring**.
   - Resultado: `401 Unauthorized` do Kong em **todas as rotas com key-auth** (`/auth/v1/token`, `/rest/v1/*`, `/storage/v1/*`).
   - As rotas **abertas** (`/functions/v1` sem key-auth, `/auth/v1/authorize`) funcionavam — por isso o app "carregava" e o gate de login registrava tentativas.
2. **🟡 Lockout do gate `login-attempts` (efeito):**
   - Cada submit falho (401 no Kong) incrementava `zapp.login_attempts` (`record_failed`).
   - `MAX_ATTEMPTS=5` → lock exponencial `2^(attempts-5)` min; **o contador nunca reseta** sem login OK (que chama `clear`) — FIX 2026-07-16 proposital.
   - O frontend, ao ver `is_locked`, **bloqueia o submit antes do GoTrue** — sintoma "nada acontece".
3. **🟢 Janela de auth down no redeploy (agravante):**
   - Redeploy do stack 35 às 19:13 com `update_config.order: stop-first` → GoTrue fora do ar 19:13→19:21:38 (~8 min).
   - Logins nessa janela falhavam na **rede** (não por senha) e incrementavam o contador.

## Diagnóstico (receita)

```bash
# 1. A chave do bundle chega ao Kong?
curl -s -o /dev/null -w '%{http_code}\n' -H "apikey: <chave-do-bundle>" \
  https://supabase.atomicabr.com.br/auth/v1/health
# 401 = keyring não conhece a chave do frontend

# 2. Decodificar a chave do bundle (payload do JWT, parte do meio, base64url):
curl -s https://www.zappweb.app.br | grep -oP 'assets/index-[A-Za-z0-9_-]+\.js' | head -1 \
  | xargs -I{} curl -s "https://www.zappweb.app.br/{}" \
  | grep -oP 'Wr="(eyJ[A-Za-z0-9_.\-]{50,})"'
# payload role=service_role + iat antigo → build com chave errada

# 3. Keyring do Kong (consumers):
docker exec supabase_kong grep -A6 'username: anon' /tmp/kong.yml

# 4. Lockout:
SELECT email, attempt_count, locked_until FROM zapp.login_attempts ORDER BY updated_at DESC;
```

## Fix aplicado

| # | Ação | Evidência |
|---|---|---|
| 1 | `DELETE FROM zapp.login_attempts WHERE email='adm01@…'` (desbloqueio admin; `clear` exige sessão do próprio usuário — circular) | 0 linhas restantes |
| 2 | Reset de senha via SQL: `UPDATE auth.users SET encrypted_password = extensions.crypt('…', extensions.gen_salt('bf'))` | Login 200 via curl |
| 3 | Login E2E validado no app docker (`zapp.atomicabr.com.br` — bundle com anon key correta) | `GET /user` 200, dashboard carregado |
| 4 | `supabase_auth`: `update_config.order` → `start-first` + `GOTRUE_MAILER_EXTERNAL_HOSTS=supabase.atomicabr.com.br` | `UpdateStatus: update completed` |
| 5 | Limpeza de sessões fantasma do adm01 (17 → 9; só as de 10/08) + refresh_tokens revogados | `auth.sessions` sem itens pré-10/08 |
| 6 | Fix `getClientIP` na edge (hops confiáveis — ver PR) | `deno test` 10/10 |
| 7 | Remoção do botão Google (provider nunca habilitado — herança Lovable) | gates verdes |
| 8 | Kong: consistência keyring×secrets confirmada + backup `/tmp/kong-backup-20260810/` | MD5 anon == secret v2 |

## Pendências (após onda)

- [ ] **Vercel**: atualizar envs `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` (anon key correta) + redeploy — ver `VERCEL-ENV-FIX-20260810.md`. **Bloqueia o retorno do www.**
- [ ] Watchdog de lockout (cron) para alertar `locked_until > now()`.
- [ ] Decisão: habilitar Google OAuth de verdade (requer OAuth client no Google Cloud) vs manter removido.
