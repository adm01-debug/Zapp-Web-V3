# Simulação de falhas — Auth completo (sessões / convites / reset de senha)

> Executor do worktree `wt-o4` (Etapas 55–57 do PLANO-100-ETAPAS). Documento de
> simulação ANTES da edição: cada cenário de falha mapeado para o comportamento
> esperado do código, validado contra o banco vivo (MCP) e o GoTrue self-hosted
> (fonte `supabase/auth@master` + supabase-js 2.110.8 / auth-js).

## Fatos verificados (banco vivo / fontes)

- `auth.sessions` existe (15 colunas; NUNCA expor `refresh_token_hmac_key` /
  `refresh_token_counter`). `auth.refresh_tokens.session_id` existe → revogação
  real = DELETE sessão + `revoked=true` nos refresh tokens.
- **GoTrue self-hosted NÃO tem admin list/delete de sessões** (roteiro admin em
  `internal/api/api.go`: users/factors/passkeys/generate_link/SSO/OAuth —
  sem `/sessions`). Única via de revogação real: SQL em `auth.sessions` via RPC
  SECURITY DEFINER. `supabase.auth.admin.signOut` só aceita JWT do próprio user.
- `zapp.is_admin_or_supervisor`, `zapp.log_security_event`, `zapp.store_reset_token`
  existem no banco vivo. **Não existe tabela de convites** (só
  `department_invitations`, outro domínio) e **não existem RPCs de sessões** →
  migration nova obrigatória.
- `approve-password-reset` gera o link mas **nunca envia email** (gap documentado
  na Etapa 55: "notificação"); o painel diz "Email de reset enviado" sem enviar.

## Cenários simulados e decisões

| # | Falha | Comportamento implementado |
|---|-------|----------------------------|
| 1 | Sem JWT em `zapp-auth-sessions`/`zapp-auth-invite` | 401 via `requireUser`/`requireAdminOrSupervisor` (antes de qualquer validação de body) |
| 2 | JWT válido mas role < admin em ação admin | 403 (RPC revalida por defesa em profundidade → 42501 vira 403 no handler) |
| 3 | Rate-limit (convite 5/min/IP; sessões 30/min/IP) | 429 com mensagem explícita |
| 4 | RPC de sessões ausente/falhou (drift repo×DB) | 503 explícito "sessions RPC unavailable" — fail-closed, sem lista vazia falsa |
| 5 | Revogar sessão já revogada | Idempotente: `{ revoked: 0 }` com 200 (DELETE não acha a linha) |
| 6 | Revogar sessão de OUTRO usuário sem ser admin | RPC nega (42501) → handler 403; nunca 200 silencioso |
| 7 | Convidar email já registrado | 409 "Email already registered" (createUser retorna erro; sem duplicar) |
| 8 | Resend de convite para email inexistente | 404 explícito |
| 9 | Email (Resend) falha no convite | Rollback do usuário criado (`admin.deleteUser`) + 502 — sem órfão sem senha |
| 10 | Email (Resend) falha no approve-password-reset | Aprovação permanece (token único já gerado) → 200 com `emailSent:false` + `resetLink` para fallback manual (copiar link) |
| 11 | RESEND_API_KEY ausente | Mesmo que #10 (`emailSent:false`, motivo explícito) — nunca 500 |
| 12 | Token de convite expirado/inválido no aceite | `verifyOtp` falha → página mostra erro + botão "solicitar novo convite" |
| 13 | Senha fraca no aceite/reset | Bloqueada client-side (PasswordStrengthMeter + zod) e rejeitada pelo GoTrue |
| 14 | `is_admin_or_supervisor` RPC indisponível | `requireAdminOrSupervisor` já trata → 500 "Authorization check failed" |
| 15 | GET /admin/users por email (checagem pré-criação) falha | Não bloqueia: tenta createUser e trata "already registered" como 409 |
| 16 | Revogar TODAS as sessões (inclui a atual) | Permitido com confirmação (UI) — força re-login; refresh tokens revogados |
| 17 | `store_reset_token` falha após generateLink | 500 (já existia); token ÓRFÃO do GoTrue expira em 1h — sem vazamento |

## Contratos novos

- `zapp-auth-sessions@v1` — `{ action: 'list'|'revoke'|'revoke_all', userId?, sessionIds? }`
  → 200 `{ sessions?, currentSessionId?, revoked? }`.
- `zapp-auth-invite@v1` — `{ action: 'invite'|'resend', email, name?, role? }`
  → 200 `{ invited: true, email }` / `{ resent: true }`. Role whitelist
  (admin/supervisor/manager/agent — `dev` fora do convite).
- `approve-password-reset` ganha `emailSent`/`emailError`/`resetLink` na resposta.
