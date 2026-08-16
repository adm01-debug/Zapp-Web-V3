# Estado: `src/features/auth/` — Módulo de Autenticação

> Runtime: **NAO_VERIFICADO**
> Auditado em: 2026-08-09 | Arquivos lidos: 36/36

---

## 1. Visão Geral do Módulo

Módulo central de autenticação e autorização do ZAPP-WEB. Gerencia toda a sessão de usuário (bootstrap, hydration, refresh), RBAC por papéis e permissões granulares, MFA TOTP, passkeys, OAuth Google, reautenticação para ações sensíveis e proteção de rotas.

**Contagem:** 36 arquivos — 12 componentes, 11 hooks, 3 contextos/barrels raiz, 2 serviços, 2 testes, 6 barrels.

### Tabela de Arquivos por Categoria

| Categoria | Arquivo | Linhas |
|-----------|---------|--------|
| **Contexto** | `context/AuthContext.ts` | 31 |
| **Provider** | `components/AuthProvider.tsx` | 872 |
| **Serviço** | `services/authService.ts` | 185 |
| **Serviço** | `services/index.ts` | 2 |
| **Hook core** | `hooks/useAuth.ts` | 14 |
| **Hook core** | `hooks/useAuthForm.ts` | 312 |
| **Hook MFA** | `hooks/useMFA.ts` | 142 |
| **Hook RBAC** | `hooks/usePermissions.ts` | 180 |
| **Hook RBAC** | `hooks/useUserRole.ts` | 61 |
| **Hook UI** | `hooks/useDepartmentAgents.ts` | 54 |
| **Hook UI** | `hooks/useLoginAudit.ts` | 15 |
| **Hook UI** | `hooks/useReauthentication.ts` | 113 |
| **Hook UI** | `hooks/useRouteRoles.ts` | 97 |
| **Hook UI** | `hooks/useScreenProtection.ts` | 205 |
| **Hook UI** | `hooks/useSecureProfile.ts` | 43 |
| **Hook barrel** | `hooks/index.ts` | 12 |
| **Componente** | `components/AuthDiagnosticsPanel.tsx` | ~80 |
| **Componente** | `components/HeroBenefits.tsx` | ~60 |
| **Componente** | `components/NotAuthorizedView.tsx` | ~20 |
| **Componente** | `components/PasswordInput.tsx` | ~30 |
| **Componente** | `components/PasswordStrengthMeter.tsx` | ~120 |
| **Componente** | `components/PreviewPreconditionBanner.tsx` | ~50 |
| **Componente** | `components/ProtectedRoute.tsx` | ~160 |
| **Componente** | `components/ReauthDialog.tsx` | ~60 |
| **Componente** | `components/SocialProof.tsx` | ~30 |
| **Componente barrel** | `components/index.ts` | ~15 |
| **MFA** | `components/mfa/MFABackupCodes.tsx` | ~160 |
| **MFA** | `components/mfa/MFAEnroll.tsx` | ~100 |
| **MFA** | `components/mfa/MFASettings.tsx` | ~80 |
| **MFA** | `components/mfa/MFAVerify.tsx` | ~60 |
| **MFA barrel** | `components/mfa/index.ts` | 5 |
| **Permissões** | `components/permissions/PermissionMatrix.tsx` | ~120 |
| **Permissões barrel** | `components/permissions/index.ts` | 3 |
| **Teste** | `__tests__/authService.getProfile.test.ts` | ~50 |
| **Teste MFA** | `components/mfa/__tests__/MFABackupCodes.test.tsx` | ~200 |
| **Barrel raiz** | `index.ts` | 4 |

---

## 2. Fluxos de Autenticação

### 2.1 Login com Email/Senha

```
useAuthForm.handleLogin
  → checkAccountLock (lib/loginAttempts) — verifica bloqueio local + gate edge
  → authService.signIn
      → supabase.auth.signInWithPassword
      → mirrorExternalSignIn (externalSessionBridge) — dual-session self-hosted
  ← onAuthStateChange dispara SIGNED_IN
  → AuthProvider.runBootstrap
      → authService.getSession
      → fetchProfile (com withSupabaseHighPriority)
      → fetchRolesAndPermissions
  → redirectAfterAuth
      → supabase.auth.mfa.getAuthenticatorAssuranceLevel
      → se aal1→aal2: navigate('/2fa')
      → caso contrário: navigate(nextPath)
```

**Arquivos:** `useAuthForm.ts`, `authService.ts`, `AuthProvider.tsx`, `hooks/useMFA.ts` (via /2fa)

### 2.2 Signup

```
useAuthForm.handleSignUp
  → signupSchema.safeParse (Zod)
  → authService.signUp
      → supabase.auth.signUp (com emailRedirectTo e data.name)
      → mirrorExternalSignIn
  → navigate(nextPath)
```

**Arquivos:** `useAuthForm.ts`, `authService.ts`

### 2.3 Logout

```
useAuth().signOut (exposto pelo AuthProvider)
  → authService.signOut
      → mirrorExternalSignOut
      → supabase.auth.signOut
      → fallback: signOut({ scope: 'local' })
      → último recurso: clearLocalAuthStorage (limpa chaves sb-* e zapp do localStorage/sessionStorage)
  → onAuthStateChange dispara SIGNED_OUT
  → invalidateUserCache()
  → AuthProvider reseta estado para null
```

**Arquivos:** `authService.ts`, `AuthProvider.tsx`

### 2.4 Bootstrap / Hydration de Sessão

```
AuthProvider.runBootstrap (disparado no mount)
  1. readPersistedSession() — lê localStorage síncrono (chunks, base64, legacy v1)
     → hidrata estado otimisticamente se sessão encontrada (sem loading)
  2. setTimeout(10s) — safety net → bootstrapError = 'timeout'
  3. authService.getSession() [timeout: GET_SESSION_TIMEOUT_MS = 4000ms]
  4. fetchProfile(userId, signal) [timeout adaptativo: 15s base, até 30s sob carga]
     → cache TTL 5min + single-flight (AbortController por chamada)
  5. fetchRolesAndPermissions(userId) — user_roles + role_permissions JOIN permissions
  6. Realtime: subscribe zapp.profiles (UPDATE) e zapp.user_roles (*)
     → onUpdate: invalida cache + refreshAll()
```

**Arquivos:** `AuthProvider.tsx`, `authService.ts`, `context/AuthContext.ts`

### 2.5 MFA TOTP — Enrollment

```
MFASettings / MFAEnroll (3 etapas)
  1. Intro → "Ativar MFA"
  2. useMFA().enrollTOTP(friendlyName?)
       → supabase.auth.mfa.enroll({ factorType: 'totp' })
       → retorna { qr_code, secret, uri }
     Exibe QR code
  3. usuário digita 6 dígitos → auto-submit
  → useMFA().verifyTOTP(factorId, code)
       → supabase.auth.mfa.challenge({ factorId })
       → supabase.auth.mfa.verify({ factorId, challengeId, code })
       → fetchFactors() para atualizar lista
```

**Arquivos:** `useMFA.ts`, `MFAEnroll.tsx`, `MFASettings.tsx`, `MFABackupCodes.tsx`

### 2.6 MFA TOTP — Verificação Pós-Login

```
TwoFactorAuth page → MFAVerify
  → useMFA().fetchFactors()
  → localiza primeiro fator com status='verified'
  → usuário digita 6 dígitos → auto-submit
  → useMFA().verifyTOTP(factorId, code)
  → supabase.auth.mfa.challenge + verify
  → onSuccess() → navigate para destino
```

**Arquivos:** `useMFA.ts`, `MFAVerify.tsx`, `useAuthForm.ts` (redirectAfterAuth)

### 2.7 Login com Passkey

```
useAuthForm.handlePasskeyLogin
  → useWebAuthn().authenticateWithPasskey(email?)
  → se success: supabase.auth.signInWithOtp({ email, shouldCreateUser: false })
  → redirectAfterAuth(nextPath)
```

**Arquivos:** `useAuthForm.ts`, `@/hooks/useWebAuthn` (externo)

### 2.8 Login com Google OAuth

```
useAuthForm.handleGoogleLogin
  → import('@/integrations/lovable/index') [dynamic]
  → lovable.auth.signInWithOAuth('google', { redirect_uri })
  → redirect para /auth?next=... após OAuth callback
```

**Arquivos:** `useAuthForm.ts`, `@/integrations/lovable/index` (externo)

### 2.9 Reautenticação para Ações Sensíveis

```
useReauthentication.requireReauth(action, callback)
  → abre ReauthDialog (modal de senha)
  → confirmReauth(password)
      → invalidateUserCache()
      → authService.getUser() (sem cache)
      → supabase.auth.signInWithPassword({ email, password })
      → se success: fecha dialog, executa pendingCallback()
```

**Ações suportadas:** `change_password`, `change_email`, `configure_mfa`, `admin_action`, `delete_account`

**Arquivos:** `useReauthentication.ts`, `ReauthDialog.tsx`, `authService.ts`

### 2.10 Proteção de Rotas

```
ProtectedRoute
  → useAuth() — aguarda loading=false
  → useRouteRoles(routePath) — busca override em route_permissions (cache module-level)
  → determina effective roles (override > requiredRoles)
  → se role 'dev': bypass total + log_security_event('dev_bypass_used')
  → supabase.rpc('user_has_permission', ...) — verificação server-side
  → se não autorizado: log_security_event('unauthorized_access') + render fallback
  → safety net 10s → Navigate('/auth?reason=timeout')
```

**Arquivos:** `ProtectedRoute.tsx`, `useRouteRoles.ts`, `useAuth.ts`

---

## 3. Tabelas e RPCs

### 3.1 Tabelas via `.from()`

| Tabela | Schema | Hook/Arquivo | Operação |
|--------|--------|-------------|----------|
| `profiles` | `zapp` | `authService.getProfile` | SELECT maybeSingle |
| `profiles` | `zapp` | `useDepartmentAgents` | SELECT id WHERE department_id |
| `profiles` | `zapp` | `useSecureProfile.ts` (via RPC) | via `update_own_profile` |
| `user_roles` | `zapp` | `AuthProvider.fetchRolesAndPermissions` | SELECT role WHERE user_id |
| `role_permissions` | `zapp` | `AuthProvider.fetchRolesAndPermissions` | SELECT JOIN permissions |
| `role_permissions` | `zapp` | `usePermissions` | SELECT role, permission_id, permissions(...) |
| `role_permissions` | `zapp` | `usePermissions.addPermissionToRole` | INSERT |
| `role_permissions` | `zapp` | `usePermissions.removePermissionFromRole` | DELETE |
| `permissions` | `zapp` | `usePermissions` | SELECT * ORDER BY category |
| `route_permissions` | `zapp` | `useRouteRoles` | SELECT allowed_roles WHERE path |

### 3.2 RPCs via `.rpc()`

| RPC | Arquivo | Parâmetros | Retorno |
|-----|---------|-----------|---------|
| `user_has_permission` | `ProtectedRoute.tsx` | `_user_id`, `_permission_name` | `boolean` |
| `user_has_permission` | `usePermissions.checkPermissionServer` | `_user_id`, `_permission_name` | `boolean` |
| `log_security_event` | `ProtectedRoute.tsx` | `event_type`, `user_id`, `metadata` | void |
| `update_own_profile` | `useSecureProfile.ts` | `p_display_name`, `p_avatar_url`, `p_phone`, `p_email`, `p_signature`, `p_birthday` | data |

### 3.3 Auth API (supabase.auth.\*)

| Método | Arquivo |
|--------|---------|
| `auth.getSession()` | `authService.getSession`, `ProtectedRoute` |
| `auth.getUser()` | `authService.getUser` (cache 30s + single-flight) |
| `auth.signInWithPassword` | `authService.signIn`, `useReauthentication` |
| `auth.signUp` | `authService.signUp` |
| `auth.signOut` | `authService.signOut` |
| `auth.signInWithOtp` | `useAuthForm.handlePasskeyLogin` |
| `auth.onAuthStateChange` | `authService.onAuthStateChange` → `AuthProvider` |
| `auth.mfa.listFactors` | `useMFA.fetchFactors` |
| `auth.mfa.enroll` | `useMFA.enrollTOTP` |
| `auth.mfa.challenge` | `useMFA.verifyTOTP` |
| `auth.mfa.verify` | `useMFA.verifyTOTP` |
| `auth.mfa.unenroll` | `useMFA.unenroll` |
| `auth.mfa.getAuthenticatorAssuranceLevel` | `useAuthForm.redirectAfterAuth`, `useMFA.getAssuranceLevel` |

---

## 4. Exports Públicos

O barrel raiz `index.ts` reexporta tudo de `./components`, `./hooks` e `./services`.

### 4.1 Componentes

| Export | Arquivo origem |
|--------|---------------|
| `AuthProvider` | `components/AuthProvider.tsx` |
| `AuthDiagnosticsPanel` | `components/AuthDiagnosticsPanel.tsx` |
| `HeroBenefits` | `components/HeroBenefits.tsx` |
| `NotAuthorizedView` | `components/NotAuthorizedView.tsx` |
| `PasswordInput` | `components/PasswordInput.tsx` |
| `PasswordStrengthMeter` | `components/PasswordStrengthMeter.tsx` |
| `PreviewPreconditionBanner` | `components/PreviewPreconditionBanner.tsx` |
| `ProtectedRoute`, `withPermission` | `components/ProtectedRoute.tsx` |
| `ReauthDialog` | `components/ReauthDialog.tsx` |
| `SocialProof` | `components/SocialProof.tsx` |
| `MFABackupCodes` | `components/mfa/MFABackupCodes.tsx` |
| `MFAEnroll` | `components/mfa/MFAEnroll.tsx` |
| `MFASettings` | `components/mfa/MFASettings.tsx` |
| `MFAVerify` | `components/mfa/MFAVerify.tsx` |
| `PermissionMatrix` | `components/permissions/PermissionMatrix.tsx` |

### 4.2 Hooks

| Export | Arquivo origem |
|--------|---------------|
| `useAuth` | `hooks/useAuth.ts` |
| `useAuthForm` | `hooks/useAuthForm.ts` |
| `useDepartmentAgents` | `hooks/useDepartmentAgents.ts` |
| `useLoginAudit` | `hooks/useLoginAudit.ts` |
| `useMFA` | `hooks/useMFA.ts` |
| `usePermissions` | `hooks/usePermissions.ts` |
| `useReauthentication` | `hooks/useReauthentication.ts` |
| `useRouteRoles`, `invalidateRouteRolesCache` | `hooks/useRouteRoles.ts` |
| `useScreenProtection` | `hooks/useScreenProtection.ts` |
| `useSecureProfileUpdate` | `hooks/useSecureProfile.ts` |
| `useUserRole` | `hooks/useUserRole.ts` |

### 4.3 Contexto

| Export | Arquivo origem |
|--------|---------------|
| `AuthContext` | `context/AuthContext.ts` |
| `AuthContextType` (interface) | `context/AuthContext.ts` |
| `AuthBootstrapError` (type) | `context/AuthContext.ts` |

### 4.4 Serviços e Tipos

| Export | Arquivo origem |
|--------|---------------|
| `authService` | `services/authService.ts` |
| `invalidateUserCache` | `services/authService.ts` |
| `Profile` (interface) | `services/authService.ts` |

### 4.5 Tipos de Hooks

| Export | Arquivo origem |
|--------|---------------|
| `AppRole` (type: `'dev' \| 'admin' \| 'manager' \| 'supervisor' \| 'agent'`) | `hooks/useUserRole.ts` |
| `LockStatus` (interface) | `hooks/useAuthForm.ts` |
| `Permission` (interface) | `hooks/usePermissions.ts` |
| `RolePermission` (interface) | `hooks/usePermissions.ts` |

---

## 5. Chama (Saída) — Dependências Externas

| Dependência | Símbolo | Importado em |
|-------------|---------|-------------|
| `@/integrations/supabase/client` | `supabase`, `withSupabaseHighPriority`, `isSupabaseConfigured`, `warnSupabaseUnconfigured` | `authService`, `AuthProvider`, `useRouteRoles`, `useMFA`, `usePermissions`, `useReauthentication`, `useAuth` |
| `@/integrations/supabase/safeClient` | `safeClient` | `usePermissions` |
| `@/integrations/supabase/externalSessionBridge` | `mirrorExternalSignIn`, `mirrorExternalSignOut` | `authService` |
| `@/integrations/lovable/index` | `lovable` | `useAuthForm` (dynamic import) |
| `@/lib/loginAttempts` | `checkAccountLock`, `recordFailedLogin`, `clearLoginAttempts`, `formatLockTime`, `blockReasonMessage`, `LoginBlockReason` | `useAuthForm` |
| `@/lib/audit` | `logAudit` | `useLoginAudit` |
| `@/lib/logger` | `getLogger`, `createLogger` | `authService`, `useMFA`, `useRouteRoles`, `useScreenProtection` |
| `@/hooks/useWebAuthn` | `useWebAuthn` | `useAuthForm` |
| `@/hooks/useMountedRef` | `useMountedRef` | `usePermissions` |
| `@/services/api/queryKeys` | `queryKeys` | `useDepartmentAgents`, `useSecureProfile` |
| `@tanstack/react-query` | `useQuery`, `useMutation`, `useQueryClient` | `useDepartmentAgents`, `useSecureProfile` |
| `react-router-dom` | `useNavigate`, `useSearchParams`, `Navigate`, `Link` | `useAuthForm`, `ProtectedRoute` |
| `@supabase/supabase-js` | `User`, `Session`, `AuthError`, `PostgrestError` | `AuthContext`, `authService`, `useMFA` |
| `zod` | `z` | `useAuthForm` |
| `sonner` | `toast` | `useMFA`, `useReauthentication` |
| `framer-motion` | `motion` | `HeroBenefits` |
| `lucide-react` | `Lock`, `Eye`, `EyeOff`, `ShieldCheck`, etc. | vários componentes |
| `@/hooks/use-toast` | `toast` | `useAuthForm` |
| `@/components/ui/*` | `Button`, `Input`, `Dialog`, etc. | vários componentes |

---

## 6. Chamado Por (Entrada)

Resultado de `grep -r "from.*features/auth"` em `src/`:

### 6.1 Páginas

| Arquivo | O que importa |
|---------|--------------|
| `src/pages/Auth.tsx` | `useAuthForm`, `PasswordInput`, `PasswordStrengthMeter`, `HeroBenefits`, `SocialProof`, `AuthDiagnosticsPanel`, `PreviewPreconditionBanner` |
| `src/pages/TwoFactorAuth.tsx` | `MFAVerify` |
| `src/pages/Index.tsx` | `useAuth`, `ProtectedRoute` |
| `src/pages/ViewRouter.tsx` | `ProtectedRoute`, `useUserRole` |
| `src/pages/ResetPassword.tsx` | `PasswordInput` |
| `src/pages/QueueDetails.tsx` | `useAuth`, `useUserRole` |
| `src/pages/QueuesComparison.tsx` | `useAuth`, `useUserRole` |
| `src/pages/AdminFailedMessagesPage.tsx` | `useAuth` |
| `src/pages/admin/RolesPage.tsx` | `PermissionMatrix`, `useUserRole` |
| `src/pages/admin/RoutePermissionsPage.tsx` | `useUserRole` |
| `src/pages/admin/RateLimitDashboard.tsx` | `useAuth` |
| `src/pages/admin/AdminDevDiagnosticsPage.tsx` | `useAuth` |
| `src/pages/admin/notifications/NotificationChannelsPage.tsx` | `useAuth` |

### 6.2 Providers e Routing

| Arquivo | O que importa |
|---------|--------------|
| `src/components/providers/AppProviders.tsx` | `AuthProvider` |
| `src/components/routing/AppRoutes.tsx` | `ProtectedRoute`, `useAuth` |
| `src/components/routing/AdminRoutes.tsx` | `ProtectedRoute`, `useUserRole` |
| `src/components/routing/DebugRoutes.tsx` | `useAuth` |

### 6.3 Hooks Re-export (src/hooks/)

| Arquivo | Importa de |
|---------|-----------|
| `src/hooks/useAuth.ts` | `useAuth` de `features/auth/hooks/useAuth` |
| `src/hooks/useMFA.ts` | `useMFA` de `features/auth` |
| `src/hooks/usePermissions.ts` | `usePermissions`, `Permission`, `RolePermission` de `features/auth` |
| `src/hooks/useReauthentication.ts` | `useReauthentication` de `features/auth` |
| `src/hooks/useScreenProtection.ts` | `useScreenProtection` de `features/auth` |

### 6.4 Features (inbox, admin, sla, contacts, dashboard)

| Arquivo | O que importa |
|---------|--------------|
| `src/features/inbox/hooks/useRealtimeInbox.ts` | `useAuth`, `useDepartmentAgents` |
| `src/features/inbox/components/RealtimeInboxView.tsx` | `useAuth`, `useUserRole` |
| `src/features/inbox/components/ChatPanel.tsx` | `useAuth` |
| `src/features/inbox/components/chat/TicketActionsBar.tsx` | `useAuth`, `useUserRole` |
| `src/features/inbox/components/chat/useChatPanelHandlers.ts` | `useAuth` |
| `src/features/inbox/hooks/useRealtimeInbox.ts` | `useDepartmentAgents` |
| `src/features/admin/hooks/useAdminData.ts` | `useAuth`, `useUserRole` |
| `src/features/admin/hooks/useAdminManagement.ts` | `useAuth` |
| `src/features/admin/components/AdminView.tsx` | `useAuth`, `useUserRole` |
| `src/features/admin/components/AdminUsersTable.tsx` | `useAuth`, `AppRole` |
| `src/features/sla/hooks/useSLANotifications.ts` | `useAuth` |
| `src/features/contacts/hooks/useContactNotes.ts` | `useAuth` |
| `src/features/dashboard/hooks/useDashboardVisualizationManagement.ts` | `useAuth` |
| `src/components/security/SecurityView.tsx` | `useAuth`, `useUserRole` |
| `src/components/settings/AvatarUpload.tsx` | `useAuth` |
| `src/components/team-chat/TeamChatPanel.tsx` | `useAuth` |
| `src/test/mocks/auth.tsx` | `AuthProvider`, `useAuth` |

---

## 7. Implementação por Arquivo

| Arquivo | Status | Observação |
|---------|--------|-----------|
| `context/AuthContext.ts` | COMPLETA | Interface completa, contexto criado |
| `services/authService.ts` | COMPLETA | getUser cache 30s, getProfile via withSupabaseHighPriority |
| `services/index.ts` | COMPLETA | barrel |
| `components/AuthProvider.tsx` | COMPLETA | 872 linhas; bootstrap com hydration otimista, TTL cache, Realtime |
| `components/AuthDiagnosticsPanel.tsx` | COMPLETA | Painel SW debug colapsável |
| `components/HeroBenefits.tsx` | COMPLETA | Componente estático de marketing |
| `components/NotAuthorizedView.tsx` | COMPLETA | |
| `components/PasswordInput.tsx` | COMPLETA | Toggle show/hide |
| `components/PasswordStrengthMeter.tsx` | COMPLETA | HIBP k-anonymity + 5 requisitos |
| `components/PreviewPreconditionBanner.tsx` | COMPLETA | Apenas em hosts `*.lovable.app` |
| `components/ProtectedRoute.tsx` | COMPLETA | RBAC + dynamic overrides + dev bypass + safety net 10s |
| `components/ReauthDialog.tsx` | COMPLETA | |
| `components/SocialProof.tsx` | COMPLETA | Componente estático |
| `components/index.ts` | COMPLETA | barrel |
| `components/mfa/MFABackupCodes.tsx` | COMPLETA | CSPRNG frontend, copy/download |
| `components/mfa/MFAEnroll.tsx` | COMPLETA | 3 etapas, auto-submit 6 dígitos |
| `components/mfa/MFASettings.tsx` | COMPLETA | Lista fatores, remove com AlertDialog |
| `components/mfa/MFAVerify.tsx` | COMPLETA | Usa primeiro fator verified |
| `components/mfa/__tests__/MFABackupCodes.test.tsx` | COMPLETA | 20+ testes |
| `components/mfa/index.ts` | COMPLETA | barrel |
| `components/permissions/PermissionMatrix.tsx` | COMPLETA | Tabbed, search, admin disabled |
| `components/permissions/index.ts` | COMPLETA | barrel |
| `hooks/useAuth.ts` | COMPLETA | Wrapper fino sobre useContext |
| `hooks/useAuthForm.ts` | COMPLETA | 312 linhas; Zod, lockout, passkey, Google OAuth, MFA redirect |
| `hooks/useDepartmentAgents.ts` | COMPLETA | useMemo anti-loop documentado |
| `hooks/useLoginAudit.ts` | COMPLETA | Loga único evento de login via logAudit |
| `hooks/useMFA.ts` | COMPLETA | fetchFactors, enroll, verify, unenroll, getAssuranceLevel |
| `hooks/usePermissions.ts` | COMPLETA | Module-level cache TTL 5min + single-flight |
| `hooks/useReauthentication.ts` | COMPLETA | 5 tipos de ação sensível |
| `hooks/useRouteRoles.ts` | COMPLETA | Cache module-level, non-blocking, inflight dedup |
| `hooks/useScreenProtection.ts` | COMPLETA | Anti-screenshot, blur overlay, CSS print block |
| `hooks/useSecureProfile.ts` | COMPLETA | useMutation via RPC SECURITY DEFINER |
| `hooks/useUserRole.ts` | COMPLETA | Hierarquia 5 papéis, special_agent deprecated |
| `hooks/index.ts` | COMPLETA | barrel |
| `index.ts` | COMPLETA | barrel raiz |
| `__tests__/authService.getProfile.test.ts` | COMPLETA | 2 testes: slot HIGH priority |

---

## 8. Achados

### A1 — type cast duplo em `authService.getProfile` (linha 159–176)

```typescript
// services/authService.ts:159
return withSupabaseHighPriority(async () => {
  const { data, error } = await (supabase
    .from('profiles') as unknown as { select: ... })
    ...
```

O `as unknown as {...}` foi necessário para encadear `.abortSignal()` que o tipo gerado não expõe. Se a assinatura do client mudar, o erro será silenciado em TypeScript mas explodirá em runtime. Risco baixo mas frágil.

### A2 — MFA backup codes sem persistência no banco

`MFABackupCodes.tsx` gera 10 códigos no frontend via `crypto.getRandomValues`. Não há tabela de backup codes no schema `zapp`. Os códigos são apresentados uma única vez; se o usuário fechar sem copiar/baixar, são irrecuperáveis. A UI tem confirmação em 2 passos, mas o risco de perda é real.

### A3 — Passkey login usa signInWithOtp como segundo fator (`useAuthForm.ts:255–270`)

```typescript
const { error } = await supabase.auth.signInWithOtp({
  email: result.userEmail,
  options: { shouldCreateUser: false },
});
```

Após autenticação WebAuthn bem-sucedida, o fluxo dispara um OTP de email para completar o login. Isso significa que o usuário precisa de acesso ao email, o que anula parte da conveniência do passkey. Pode ser comportamento intencional da integração Lovable/Supabase, mas é não-óbvio.

### A4 — `isSpecialAgent: false` sempre em `useUserRole.ts:55`

```typescript
/** @deprecated O papel `special_agent` foi descontinuado. */
isSpecialAgent: false,
```

Campo sempre `false`. Pode ser removido sem breaking change (nenhuma branch depende do valor `true`).

### A5 — Possível redirect loop no safety net de `ProtectedRoute`

```typescript
// ProtectedRoute.tsx — safety net 10s
navigate('/auth?reason=timeout', { replace: true });
```

Se `ProtectedRoute` for montado sobre a rota `/auth` por algum motivo de roteamento incorreto, o safety net dispararia um loop. Não há guard de `window.location.pathname !== '/auth'`.

### A6 — `usePermissions.ts`: estado module-level mutável (`let cache`, `let inflight`)

As variáveis `cache` e `inflight` são declaradas em escopo de módulo. Em ambiente de teste, se os mocks não resetarem o módulo entre testes, o cache do teste anterior vaza para o próximo. Isso é provavelmente intencionado para performance em produção, mas exige `jest.resetModules()` ou equivalente nos testes de permissão.

### A7 — `dev` bypass sem whitelist de ambiente em `ProtectedRoute`

```typescript
if (effectiveRoles.includes('dev')) {
  // bypass total + log_security_event
  return <>{children}</>;
}
```

O bypass do papel `dev` ocorre em produção sem nenhuma verificação de ambiente. Qualquer usuário com `role='dev'` na tabela `user_roles` tem acesso irrestrito a todas as rotas protegidas. Não é necessariamente um bug, mas é um risco de segurança se o papel for atribuído indevidamente.

### A8 — MFA check pós-login é best-effort (catch silencioso em `useAuthForm.ts:95–100`)

```typescript
try {
  const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (!error && data?.currentLevel === 'aal1' && data?.nextLevel === 'aal2') {
    navigate('/2fa', { replace: true });
    return;
  }
} catch {
  // Falha na checagem de MFA — segue o fluxo normal (não bloquear login).
}
```

Se a chamada MFA falhar (network error, GoTrue instável), o usuário continua o login sem ser redirecionado para `/2fa`, contornando silenciosamente o segundo fator. O comentário indica que é intencional, mas o comportamento pode ser surpreendente.

### A9 — `withPermission` HOC exportado mas sem testes visíveis

`ProtectedRoute.tsx` exporta `withPermission` (HOC) mas nenhum arquivo nos resultados do grep o importa diretamente. Pode estar em uso via barrel, mas não há testes cobrindo o caminho HOC especificamente.

---

*Runtime: NAO_VERIFICADO — nenhuma execução real foi realizada durante esta análise.*
