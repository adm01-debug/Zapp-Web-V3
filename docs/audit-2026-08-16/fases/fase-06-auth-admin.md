# FASE 6 — AUTH E ADMIN

## Etapa 51 — Blindar bypass do papel `dev` com whitelist de ambiente
**Objetivo:** Impedir que `user_roles='dev'` conceda acesso irrestrito a rotas protegidas fora de ambientes autorizados.
**Base:** 04-features-auth.md A7 L511-520 (findings-02.md:34); A5 L498-505 (findings-02.md:35).
### Subetapas
- [ ] 51.1 Levantar todos os pontos onde `dev` é tratado como bypass (ProtectedRoute, useUserRole, usePermissions, route_permissions) e documentar o contrato atual de autorização.
- [ ] 51.2 Definir whitelist de ambientes (ex.: `import.meta.env.MODE`/`VITE_APP_ENV` ∈ {development, staging}) em que o bypass `dev` é permitido; produção exige permissões explícitas via role_permissions/route_permissions.
- [ ] 51.3 Implementar utilitário `isDevBypassAllowed()` com leitura única de ambiente e teste unitário parametrizado (dev/staging/prod/test).
- [ ] 51.4 Aplicar o guard em ProtectedRoute: em produção, role `dev` passa a exigir a mesma checagem RBAC/permissão dos demais papéis.
- [ ] 51.5 Aplicar o mesmo guard em useUserRole/usePermissions e em qualquer consulta a `user_roles` usada para autorização (eliminar bypass fora de ProtectedRoute).
- [ ] 51.6 Corrigir safety net 10s (A5): adicionar `pathname !== '/auth'` no redirect `navigate('/auth?reason=timeout')` + teste anti-loop (montagem de ProtectedRoute sobre /auth não causa loop).
- [ ] 51.7 Registrar em `log_security_event` (evento `dev_bypass_used`, RPC L236) qualquer tentativa de bypass bloqueada em produção — reutilizar o uso existente (04 L203/L205).
- [ ] 51.8 Teste de contrato RBAC: usuário `dev` em modo produção sem permissão recebe redirect/403; em dev recebe acesso — parametrizado por ambiente.
- [ ] 51.9 Avaliar e documentar (ADR curto) restrição de atribuição da role `dev` no banco (apenas admin/whitelist), sem alterar schema sem evidência prévia.
- [ ] 51.10 Validação runtime em produção (browser + Supabase MCP): login com conta de teste `dev` → bloqueio em prod e liberação em dev; registrar evidência.
### Critério de conclusão (checklist da etapa)
- [ ] Em produção, usuário com role `dev` sem permissão explícita não acessa rotas protegidas (evidência de runtime).
- [ ] Em dev/staging o bypass continua funcionando (não quebra desenvolvimento).
- [ ] Teste anti-loop da safety net 10s existe e passa (ProtectedRoute sobre /auth não entra em loop).
- [ ] Tentativa de bypass em produção gera `log_security_event` com `dev_bypass_used`.
- [ ] Suíte de testes do módulo auth (36 arquivos) roda verde com os novos guards.

## Etapa 52 — MFA pós-login fail-closed: remover catch silencioso
**Objetivo:** Garantir que falha de rede/GoTrue na checagem AAL nunca contorne o segundo fator (fail-closed).
**Base:** 04-features-auth.md A8 L522-536 (findings-02.md:27); `useAuthForm.ts:95-100` (catch silencioso).
### Subetapas
- [ ] 52.1 Mapear o fluxo AAL1→AAL2 (redirect pós-login, getAuthenticatorAssuranceLevel, useAuthForm.ts:95-100) e documentar os estados possíveis: sem MFA / MFA pendente / MFA verificado / erro.
- [ ] 52.2 Remover o `catch` silencioso: falha de rede/GoTrue na checagem AAL exibe erro explícito com retry e NUNCA prossegue como AAL2.
- [ ] 52.3 Introduzir estado `mfaStatus: 'unknown' | 'no_mfa' | 'pending' | 'verified' | 'error'` no fluxo pós-login, com tratamento explícito de `'error'` (tela de erro + tentar novamente).
- [ ] 52.4 Validar no banco vivo (Supabase MCP) as tabelas do GoTrue `auth.mfa_sessions`, `auth.mfa_challenges`, `auth.mfa_factors` (existência, RLS/grants) e registrar baseline.
- [ ] 52.5 Teste de contrato do redirect pós-login: mock de `getAuthenticatorAssuranceLevel` falhando (network error) → usuário NÃO avança; sucesso → avança conforme regra.
- [ ] 52.6 Testes de regressão dos 3 cenários: sem MFA (login direto), MFA verificado (redirect normal), MFA pendente + falha de rede (bloqueado com retry).
- [ ] 52.7 Garantir que estado `'error'` não persista sessão parcial: cleanup local/forçar logout se AAL não confirmado dentro do fluxo.
- [ ] 52.8 Telemetria: registrar `log_security_event` em erro de AAL e em qualquer tentativa de prosseguir sem AAL2 (substituir o silêncio atual).
- [ ] 52.9 Revisar MFAVerify/MFAEnroll (L436-438) para consistência do novo estado e remover outros `catch` que engulam erro de 2FA (grep no módulo auth).
- [ ] 52.10 Validação runtime: DevTools offline no passo 2FA em produção → usuário permanece bloqueado com mensagem de erro; registrar evidência.
### Critério de conclusão (checklist da etapa)
- [ ] Falha de rede/GoTrue no passo 2FA bloqueia o login (fail-closed) com tela de erro e retry — evidência runtime.
- [ ] Baseline de `auth.mfa_sessions`/`mfa_challenges`/`mfa_factors` registrado (banco vivo).
- [ ] Testes de contrato cobrem os 3 cenários AAL (sem MFA / verificado / pendente+erro).
- [ ] Nenhum `catch {}` silencioso restante no fluxo de MFA (grep).
- [ ] Evento de auditoria registrado em falha/erro de AAL.

## Etapa 53 — Backup codes MFA com persistência no banco
**Objetivo:** Persistir backup codes no banco para recuperação segura de 2FA sem depender de cópia manual única.
**Base:** 04-features-auth.md A2 L474-476 (findings-02.md:28) — códigos gerados no frontend, exibidos 1x, irrecuperáveis.
### Subetapas
- [ ] 53.1 Desenhar schema `zapp.mfa_backup_codes` (user_id FK, code_hash, used_at, created_at) com decisão de hash documentada em migration.
- [ ] 53.2 Migration SQL: tabela + índices + RLS (dono lê/usa os próprios; service_role administra) + grants mínimos; aplicar via Supabase MCP e versionar no repo.
- [ ] 53.3 RPCs SECURITY DEFINER com search_path fixo: `mfa_backup_codes_generate` (10 códigos, hash, retorno único), `mfa_backup_codes_list` (metadados sem hash), `mfa_backup_codes_use` (valida+invalida atomicamente), `mfa_backup_codes_regenerate`.
- [ ] 53.4 Frontend (MFABackupCodes L439): substituir geração CSPRNG local pela RPC; exibição 1x com aviso de cópia e confirmação de salvamento.
- [ ] 53.5 Fluxo de uso: opção "usar backup code" na MFAVerify chamando `mfa_backup_codes_use`; se válido, registrar AAL2 — verificar viabilidade com GoTrue e documentar fallback via admin se necessário.
- [ ] 53.6 Testes de contrato das RPCs: geração (10 códigos, hash únicos), uso único (reuso bloqueado), código inválido, RLS (A não lê códigos de B), concorrência (uso simultâneo → 1 vencedor).
- [ ] 53.7 Testes de frontend: regeneração invalida códigos antigos; aviso "copie agora" impede navegação sem confirmação.
- [ ] 53.8 Auditoria: registrar geração/uso/regeneração em `audit_logs`/`log_security_event`.
- [ ] 53.9 Atualizar docs de estado (04-features-auth.md) e types.ts gerado com tabela/RPCs novas.
- [ ] 53.10 Validação runtime: conta de teste com MFA perde acesso ao email → recupera via backup code em produção; registrar evidência.
### Critério de conclusão (checklist da etapa)
- [ ] Tabela `zapp.mfa_backup_codes` + 4 RPCs aplicadas e versionadas (migration no repo).
- [ ] RLS comprovada via teste (SET ROLE): usuário só acessa os próprios códigos.
- [ ] Código usado não é reutilizável (teste de uso duplo concorrente).
- [ ] UI exibe códigos 1x com confirmação e regeneração funcional (teste automatizado).
- [ ] Runtime validado: recuperação de 2FA via backup code em produção.

## Etapa 54 — Passkey/WebAuthn autônomo (sem OTP email)
**Objetivo:** Tornar o login por passkey autônomo, eliminando a dependência de `signInWithOtp` após WebAuthn OK.
**Base:** 04-features-auth.md A3 L478-487 (findings-02.md:30); `useAuthForm.ts:255-270`.
### Subetapas
- [ ] 54.1 Diagnosticar o fluxo atual (useAuthForm.ts:255-270): por que WebAuthn OK dispara signInWithOtp e quais limitações do GoTrue self-hosted justificam o comportamento.
- [ ] 54.2 Validar no banco vivo `auth.webauthn_challenges` e `auth.passkey_credentials` (existência, RLS/grants, uso real) e registrar baseline.
- [ ] 54.3 Verificar suporte do GoTrue self-hosted + versão do supabase-js para passkey direto (signInWithPasskey ou equivalente); documentar versão/limitação em ADR curto.
- [ ] 54.4 Implementar caminho passkey autônomo: WebAuthn → sessão AAL2 direta, sem disparar OTP; manter OTP apenas como fallback explícito ("usar email").
- [ ] 54.5 Gerenciar desafios WebAuthn: limpeza de `webauthn_challenges` expirados (cron/RPC) e retry com novo challenge em falha.
- [ ] 54.6 Enroll de passkey com validação de origin/relier party por ambiente (whitelist de origins).
- [ ] 54.7 Teste de contrato do fluxo WebAuthn: sucesso → sessão autônoma sem chamada a signInWithOtp; falha de challenge → mensagem clara; origin inválida → bloqueio.
- [ ] 54.8 Testes de regressão: fallback OTP continua funcionando; combinação passkey+2FA.
- [ ] 54.9 Atualizar docs de estado (04-features-auth.md §2.7 L158-167) e types.ts.
- [ ] 54.10 Validação runtime: passkey cadastrado em produção faz login sem tocar no email (sessão criada, nenhum OTP enviado); registrar evidência.
### Critério de conclusão (checklist da etapa)
- [ ] Login por passkey em produção não dispara signInWithOtp (evidência runtime/network).
- [ ] `webauthn_challenges`/`passkey_credentials` auditadas no banco vivo com baseline.
- [ ] Teste de contrato prova que falha de challenge não abre caminho inseguro.
- [ ] Fallback OTP funciona (teste de regressão).
- [ ] ADR com limitações do GoTrue self-hosted registrado.

## Etapa 55 — Reset de senha ponta a ponta (solicitação→aprovação→redefinição)
**Objetivo:** Completar o fluxo de reset de senha (público + admin) com EF `approve-password-reset`, realtime e triggers de segurança religados.
**Base:** 04-features-auth.md A26 (🤔 INFERIDO, findings-02.md:44); pendencias-consolidadas.md:241 (PasswordResetRequestsPanel + EF approve-password-reset + realtime); :957 (2 triggers de segurança em password_reset_requests não religados).
### Subetapas
- [ ] 55.1 Mapear o fluxo atual: ResetPassword.tsx (L364), PasswordResetRequestsPanel, EF approve-password-reset, realtime — listar o que existe vs o que falta (solicitação, aprovação, execução, notificação).
- [ ] 55.2 Decidir e documentar o fluxo-alvo em ADR curto: solicitação por email → token com TTL → aprovação admin (se aplicável) → nova senha → notificação.
- [ ] 55.3 Verificar no banco vivo e religar os 2 triggers de segurança em `password_reset_requests` (PARIDADE 07-04); migration versionada se recriação necessária.
- [ ] 55.4 Endurecer/validar a EF `approve-password-reset`: contrato zod de entrada/saída, service_role, idempotência, retry; caminho público de solicitação com rate-limit.
- [ ] 55.5 Realtime: confirmar que `password_reset_requests` está na publication `supabase_realtime` (painel admin recebe INSERT/UPDATE); corrigir se ausente.
- [ ] 55.6 Frontend público: fluxo "esqueci minha senha" → email → token → nova senha (PasswordStrengthMeter L429 integrado) com estados de erro explícitos.
- [ ] 55.7 Frontend admin: PasswordResetRequestsPanel com aprovação/rejeição e auditoria via `log_security_event`.
- [ ] 55.8 Testes de contrato: EF (token válido/expirado/revogado, usuário inexistente), solicitação (rate-limit, email inexistente não vaza existência), triggers (INSERT/UPDATE/DELETE corretos).
- [ ] 55.9 Testes de UI: fluxo completo com mocks (solicitar → aprovar → redefinir → login com nova senha) + senha fraca bloqueada.
- [ ] 55.10 Validação runtime: solicitar reset para conta de teste, aprovar no painel admin, redefinir e logar em produção; registrar evidência.
### Critério de conclusão (checklist da etapa)
- [ ] Fluxo completo funcional em produção (solicitar→aprovar→redefinir→login) com evidência.
- [ ] 2 triggers de segurança de `password_reset_requests` presentes no banco vivo (verificação SQL).
- [ ] EF approve-password-reset com contrato zod e testes (válido/expirado/revogado).
- [ ] Realtime do painel admin operante (publication inclui password_reset_requests).
- [ ] Solicitação com email inexistente não revela existência de conta (teste).

## Etapa 56 — Gestão e revogação de sessões ativas
**Objetivo:** Permitir ao usuário e ao admin listar e revogar sessões ativas (ausência total hoje).
**Base:** 04-features-auth.md A27 (🤔 INFERIDO, findings-02.md:45) — nenhum arquivo/hook de listagem/revogação de sessões no doc.
### Subetapas
- [ ] 56.1 Confirmar ausência atual (grep por listagem/revogação de sessões no módulo auth/admin) e mapear APIs do GoTrue self-hosted (admin listSessions/deleteSession, signOut por scope).
- [ ] 56.2 Validar no banco vivo `auth.sessions` (existência, colunas, retenção) e registrar baseline.
- [ ] 56.3 Backend: RPCs SECURITY DEFINER com search_path fixo — `sessions_list_own`/`sessions_revoke` (próprias) e `admin_sessions_list`/`admin_sessions_revoke` (supervisor/whitelist) + grants mínimos.
- [ ] 56.4 Integrar revogação real via GoTrue admin API (service_role deleteSession), idempotente e com erro explícito.
- [ ] 56.5 Frontend usuário: painel "Sessões ativas" (dispositivo, IP, último uso, sessão atual marcada) com revogar individual/ todas.
- [ ] 56.6 Frontend admin: listagem de sessões por usuário no AdminUsersTable (L591) com revogação remota e auditoria.
- [ ] 56.7 Fluxo "log out de todos os dispositivos" com confirmação, incluindo mirror de sessão externa se aplicável (A28, dep L332).
- [ ] 56.8 Testes de contrato das RPCs: dono só lista/revoga as próprias; supervisor revoga de outros; sem permissão → 403; idempotência.
- [ ] 56.9 Testes de UI: revogar sessão atual força reautenticação; sessão revogada some da lista (realtime/refetch).
- [ ] 56.10 Validação runtime: 2 sessões (aba normal + incógnito) → revogar a do incógnito e verificar logout forçado; registrar evidência.
### Critério de conclusão (checklist da etapa)
- [ ] Painel de sessões ativas funcional para o usuário (listar/revogar) em produção.
- [ ] Revogação remota por admin comprovada (evidência runtime com 2 sessões).
- [ ] RLS/RPCs testadas (dono vs admin vs 403).
- [ ] Baseline de `auth.sessions` registrado (banco vivo).
- [ ] Docs 04-features-auth.md atualizados (A27 sai de INFERIDO).

## Etapa 57 — Convites de usuário + criação via invoke (sem fetch raw)
**Objetivo:** Implementar fluxo de convite por email e corrigir a criação de usuário que usa fetch raw em vez de `supabase.functions.invoke`.
**Base:** 04-features-auth.md A29 (🤔 INFERIDO, findings-02.md:47); 05-features-admin.md A16 L753-756 (findings-02.md:85); A4 L489-496 (`isSpecialAgent: false` sempre, findings-02.md:137).
### Subetapas
- [ ] 57.1 Mapear fluxo atual: única criação via EF create-user (05 L391) + uso em useAdminData (fetch raw, A16) — documentar lacunas do fluxo de convite.
- [ ] 57.2 Corrigir B30: substituir fetch raw por `supabase.functions.invoke('create-user')` em useAdminData (headers automáticos, retry, 401 com refresh).
- [ ] 57.3 Backend de convite: EF/RPC `invite_user` (email, papel, token com TTL, reenvio) com validação zod e rate-limit; verificar no banco vivo se tabela de convites existe antes de criar migration.
- [ ] 57.4 RLS/grants de convites: apenas admin/supervisor cria; convidado lê o próprio token; tokens expirados inválidos.
- [ ] 57.5 Frontend admin: dialog "Convidar usuário" (email + papel) no AdminUsersTable com estados de sucesso/erro/reenvio.
- [ ] 57.6 Frontend convidado: página de aceite (token) → signup com senha forte (PasswordStrengthMeter L429) → ativação da conta.
- [ ] 57.7 Limpeza do código morto `isSpecialAgent` (04 A4 L489-496, sempre `false`): remover ou documentar decisão; ajustar testes afetados.
- [ ] 57.8 Testes de contrato: invite (token válido/expirado/reenvio, rate-limit, RLS), create-user via invoke (401/retry), aceite (token já usado).
- [ ] 57.9 Testes de UI: fluxo completo convite→aceite→login; admin vê status do convite (pendente/aceito/expirado).
- [ ] 57.10 Validação runtime: convidar conta de teste, aceitar, logar; criação via invoke sem 401; registrar evidência.
### Critério de conclusão (checklist da etapa)
- [ ] Fluxo de convite completo funcionando em produção (evidência runtime).
- [ ] useAdminData usa `supabase.functions.invoke` (grep comprova ausência de fetch raw).
- [ ] RLS de convites testada (não-admin não cria; convidado só lê o próprio token).
- [ ] `isSpecialAgent` removido ou decisão documentada.
- [ ] Docs 04/05 atualizados (A29 sai de INFERIDO).

## Etapa 58 — SicoobBridgeDashboard com dados reais (remover stub)
**Objetivo:** Substituir as seções hardcoded (`// DASHBOARD-13`) do dashboard Sicoob por dados reais da API Sicoob.
**Base:** 05-features-admin.md A2 L683-686 (findings-02.md:83) — SicoobBridgeDashboard.tsx:28-33; pendencias-consolidadas.md:484 (dependência da EF sicoob-bridge).
### Subetapas
- [ ] 58.1 Diagnosticar SicoobBridgeDashboard.tsx:28-33: identificar seções hardcoded (DASHBOARD-13) e qual API Sicoob deveria alimentá-las.
- [ ] 58.2 Mapear a ponte existente (EF `sicoob-bridge`/`sicoob-bridge-reply`) e o contrato da API Sicoob (auth, endpoints, rate-limit) — pendencias-consolidadas.md:484.
- [ ] 58.3 Backend: RPC/EF para dados reais (saldo, transações/extrato) com cache TTL, tratamento de erro e fail explícito — sem dados falsos silenciosos.
- [ ] 58.4 Frontend: substituir valores hardcoded por hook de consulta; estados loading/erro/vazio explícitos (padrão UnifiedEmptyState).
- [ ] 58.5 Falha da API Sicoob: exibir erro claro e NUNCA dados fictícios; proibir flag de "dados simulados" em produção.
- [ ] 58.6 Testes de contrato da RPC/EF: fixtures da API Sicoob (sucesso, 401, timeout, schema inválido via zod).
- [ ] 58.7 Testes de UI: dashboard renderiza com dados reais; falha mostra empty/erro (não números hardcoded).
- [ ] 58.8 Verificar credenciais Sicoob no vault/secrets (nunca no bundle do cliente) e procedimento de rotação.
- [ ] 58.9 Atualizar docs de estado (05-features-admin.md) e types.ts gerado.
- [ ] 58.10 Validação runtime: dashboard admin em produção carrega dados reais (evidência de payload/network).
### Critério de conclusão (checklist da etapa)
- [ ] Nenhum valor hardcoded DASHBOARD-13 restante no dashboard (grep).
- [ ] Dados reais carregam em produção (evidência network/payload).
- [ ] Falha da API Sicoob exibe erro explícito, sem dados fictícios (teste).
- [ ] Credenciais Sicoob ausentes do bundle do cliente (grep).
- [ ] Docs 05 atualizados (B28 sai de PARCIAL).

## Etapa 59 — XP de gamificação com escrita transacional (fim da race condition)
**Objetivo:** Eliminar a perda de XP por concorrência (leitura→cálculo→escrita sem transação) com RPC atômica server-side.
**Base:** 05-features-admin.md A9 L718-721 (findings-02.md:66) — gamification/mutations.ts.
### Subetapas
- [ ] 59.1 Diagnosticar gamification/mutations.ts: mapear leitura→cálculo→escrita de XP e os gatilhos de eventos simultâneos.
- [ ] 59.2 Projetar RPC `gamification_award_xp` (SECURITY DEFINER, search_path fixo): leitura com FOR UPDATE + cálculo + escrita em uma transação; payload validado por whitelist de eventos.
- [ ] 59.3 Migration SQL: RPC + índices + grants + RLS; aplicar no banco vivo e versionar no repo.
- [ ] 59.4 Migrar frontend: substituir sequência client-side pela RPC (retry em conflito); nível/achievements/streak derivados de forma consistente (re-hidratação).
- [ ] 59.5 Teste de concorrência: 2+ eventos simultâneos (Promise.all) → XP final = soma exata, zero perda.
- [ ] 59.6 Testes de contrato da RPC: evento válido/inválido, delta negativo bloqueado, RLS (usuário só pontua a si), duplicidade/idempotência.
- [ ] 59.7 Testes de regressão do levelUtils (L667) e componentes de gamificação (DashboardView, GamificationEffects).
- [ ] 59.8 Auditoria: registro de award de XP em audit_logs (quem/o quê/quando).
- [ ] 59.9 Atualizar docs de estado (05-features-admin.md §2.5) e types.ts.
- [ ] 59.10 Validação runtime: disparar 2 eventos concorrentes (conta de teste) e verificar XP exato em produção; registrar evidência.
### Critério de conclusão (checklist da etapa)
- [ ] RPC transacional aplicada e versionada; mutations.ts não faz mais leitura→cálculo→escrita client-side.
- [ ] Teste de concorrência prova soma exata (0 XP perdido).
- [ ] Whitelist de eventos valida payloads (teste de contrato).
- [ ] RLS testada (usuário só pontua a si).
- [ ] Runtime validado com eventos concorrentes reais.

## Etapa 60 — Saneamento final auth/admin: types, escape hatches, nomenclatura, testes P1-P4 e lockout fail-closed
**Objetivo:** Fechar as dívidas de engenharia do módulo admin e blindar o lockout (`login-attempts`) contra fail-open.
**Base:** 05-features-admin.md A15 L748-751 (findings-02.md:104), A1 L678-681 + A3 L688-691 (:105), A12 L733-736 (:103), A14 L742-746 (:68); pendencias-consolidadas.md:1026 (login-attempts fail-open, loginAttempts.ts:118-145).
### Subetapas
- [ ] 60.1 Levantamento consolidado: auditar os 5 pontos (drift types, escape hatches, 4 `use*`, P1-P4 sem testes, login-attempts fail-open) com evidência atualizada de código.
- [ ] 60.2 Lockout fail-closed: revisar loginAttempts.ts:118-145 e a EF `login-attempts` — se indisponível/arquivada, lockout/blocklist/geo NÃO podem ser desprotegidos silenciosamente; fail-closed com alerta e evento de auditoria.
- [ ] 60.3 Testes de contrato do lockout: EF down/500/timeout → comportamento fail-closed testado; decisão de arquivar a EF registrada (findings-12 grupo F, pendencias-consolidadas.md:478).
- [ ] 60.4 Regenerar types.ts via Supabase MCP (is_active ausente em queues/queue_members/profiles) e commitar.
- [ ] 60.5 Remover casts frágeis de agentRepository.ts:34-50 e useSupervisorConversations (04 A8 → 05 A8) usando os tipos regenerados.
- [ ] 60.6 Eliminar escape hatches `_rpc`/`ignore-audit`: useFailedMessages L37 e AdminView L231 (`as unknown as`) substituídos por tipos reais/validação zod; regra de lint proibindo o padrão em produção.
- [ ] 60.7 Renomear os 4 arquivos `use*` que não são hooks (usePlaybooksData, useInboxCustomScopesData, useSupervisorQueuesData, useCrisisRoomData) + atualizar importadores + lint rules-of-hooks.
- [ ] 60.8 Testes P1-P4: computePriority/sortByPriority com cobertura das regras documentadas (P1/P2 30min/15min, risco ≥80/≥60) e casos-limite (empates, valores inválidos).
- [ ] 60.9 Suíte completa: testes auth (36 arquivos) + admin (7 arquivos) + typecheck + lint verdes.
- [ ] 60.10 Validação final: runtime auth+admin em produção (login, 2FA, lockout, painel admin) + atualizar docs 04/05 + registrar evidência de fechamento da fase.
### Critério de conclusão (checklist da etapa)
- [ ] types.ts regenerado com `is_active`; zero casts `as unknown as` de _rpc/ignore-audit (grep).
- [ ] 4 arquivos renomeados sem prefixo `use`; rules-of-hooks lint ativo.
- [ ] computePriority/sortByPriority com testes cobrindo P1-P4 (incl. limites documentados).
- [ ] Lockout fail-closed comprovado com EF indisponível (teste de contrato).
- [ ] Suíte auth+admin verde + runtime validado em produção (evidência).

**Resumo da fase:** 10 etapas (51–60) cobrindo 15 pendências reais de findings-02/07/12/22: whitelist do bypass `dev` (A16+A17), MFA fail-closed (A9), backup codes persistidos (A10), passkey autônomo (A12), reset de senha ponta a ponta (A26+07), sessões (A27), convites (A29+B30), Sicoob real (B28), XP transacional (B11), e saneamento final (B48/B49/B50/B13+login-attempts). Segurança de auth primeiro; toda mudança exige teste de contrato e validação runtime em produção; nenhuma pendência inventada — todas citadas com finding:linha.


---
