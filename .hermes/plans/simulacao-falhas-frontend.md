# SIMULAÇÃO DE FALHAS — FRONTEND ZAPP-WEB-V3

## Resumo Executivo

8 cenários de falha simulados e verificados contra o código-fonte, build atual e Supabase self-hosted (supabase.atomicabr.com.br). O achado **crítico** é que o build atual (dist/) foi gerado **SEM a ANON_KEY**, o que torna todas as queries Supabase inoperantes. Abaixo o detalhamento.

---

## 1. ANON_KEY ausente → PÁGINA EM BRANCO

**STATUS: FALHA CONFIRMADA no build atual**

- Nenhum arquivo `.env` ou `.env.local` existe no projeto (só `.env.example`).
- `vite.config.ts` define fallback `VITE_SUPABASE_ANON_KEY: ''` (string vazia).
- `client.ts` valida: `isValidSupabaseKey('')` retorna `false`.
- `isSupabaseConfigured = false` → cliente criado com `supabase-unconfigured.invalid` + `missing-anon-key`.
- **No build (dist/):** `Ym=""` → a chave foi embutida como vazia.
- **Efeito:** Todo `supabase.from(...)` retorna 401/403. O app mostra o loading spinner infinito (o fallback de 10s exibe "Isto está demorando mais que o esperado").
- **Mitigação:** Definir `VITE_SUPABASE_ANON_KEY` (ou `VITE_SUPABASE_PUBLISHABLE_KEY`) no ambiente de build (Vercel secrets, GitHub Actions) e reconstruir.

---

## 2. GoTrue offline → LOGIN FALHA

**STATUS: GoTrue online — 69 sessões ativas, 0 expiradas**

- Auth está rodando: `mcp__supabase__supabase_db_auth_cleanup` retornou dados de sessões normalmente.
- Fluxo PKCE configurado, autoRefreshToken habilitado.
- 263 refresh tokens no total (195 revogados, 68 ativos).
- **Risco:** Se GoTrue cair (indisponibilidade do self-hosted), login e auto-refresh param. Sem sessão, o app fica inacessível.
- **Proteção:** `boundedFetch` com 12s de timeout evita hangs infinitos.
- **Veredito:** Funcionando, mas sem fallback para GoTrue externo.

---

## 3. CORS bloqueia requisição → API INACESSÍVEL

**STATUS: CORS depende do backend self-hosted**

- `vercel.json` não define headers `Access-Control-Allow-Origin` — o app confia que o Supabase self-hosted em `supabase.atomicabr.com.br` já permite CORS.
- CSP no `vercel.json` já inclui `connect-src 'self' https://supabase.atomicabr.com.br wss://supabase.atomicabr.com.br ...`.
- **Risco:** Se o Supabase self-hosted perder a config CORS, o browser bloqueia todas as requisições. O app não tem fallback.
- **Nem toda origem no Vercel está coberta** — deploys em `zapp-web-v3-*.vercel.app` podem sofrer CORS se o self-hosted não listar esses domínios dinamicamente.

---

## 4. Cookie de sessão expira → USUÁRIO DESLOGADO

**STATUS: Usa localStorage, não cookies — depende de auto-refresh**

- Apesar do nome `cookieStorage.ts`, o armazenamento é `localStorage` (não httpOnly cookies). O SDK Supabase precisa de acesso JS aos tokens.
- `autoRefreshToken: true` — o SDK tenta refresh automático.
- `boundedFetch` com timeout 12s no fetch do Supabase.
- **Cenário de falha:** Se o refresh token expirar E o auto-refresh falhar (rede instável, GoTrue lento), a sessão é perdida. O usuário volta para a tela de login.
- **Proteção:** CSP rigoroso + JWTs de curta duração + rotação de refresh tokens.
- **Veredito:** Mecanismo padrão do Supabase. Risco baixo, mas existe.

---

## 5. Bundle JS muito grande → LOADING LENTO

**STATUS: Bundle grande — 1.5 MB de entry point principal**

| Chunk | Tamanho raw | Brotli |
|-------|-------------|--------|
| index-DTCWl18h.js (main) | **1.5 MB** | ~350 KB (estim.) |
| vendor-mapbox | 1.8 MB | 407 KB |
| vendor-react (React+Router) | 736 KB | 175 KB |
| vendor-charts (Recharts/D3) | 460 KB | 130 KB |
| vendor-pdf (jsPDF) | 414 KB | 136 KB |
| vendor-supabase (Supabase JS) | 211 KB | ~60 KB |
| vendor-sip | 221 KB | ~70 KB |
| **Total JS** | **~7 MB raw** | **~2 MB brotli** |

- 1.5 MB de entry point principal é **alto** para o primeiro paint.
- Code-splitting existe (manualChunks separa vendors), mas o chunk principal agrupa muitas libs.
- CSS principal: 242 KB.
- **Veredito:** Em conexão 3G, o carregamento pode levar 10-15s+. O fallback de loading existe (spinner com timeout de 10s), mas a UX sofre.

---

## 6. RLS bloqueia usuário legítimo → PERMISSÃO NEGADA

**STATUS: 701 policies RLS — risco de bloqueio**

- Schema `zapp` tem **701 RLS policies** (muitas), incluindo:
  - `service_role_only` — bloqueia anon/authenticated
  - `deny_all_lgpd_b64` — RESTRICTIVE policy com `false`, bloqueia todos
  - `authenticated_read` — libera SELECT para `authenticated`
  - Mistas com `auth.role() = 'service_role'`
- Com ANON_KEY ausente (build atual), o client envia `missing-anon-key` → JWT inválido → RLS rejeita TUDO.
- Mesmo com ANON_KEY válida: se o usuário não tiver a role correta (`authenticated`), policies restritivas podem negar acesso.
- **Veredito:** Risco real. 701 policies é difícil de auditar e manter.

---

## 7. Realtime desconecta → UPDATES EM TEMPO REAL PARAM

**STATUS: Realtime configurado, mas sem heartbeat/alert de desconexão**

- Publicação `supabase_realtime` ativa com dezenas de tabelas nos schemas `zapp`, `evo`, `email_app`, `financeiro`.
- Publicação `supabase_realtime_messages_publication` para mensagens diárias.
- **Reconnect configurado:** `reconnectAfterMs` com exponential backoff (1s, 2s, 4s, 8s, 16s, max 30s).
- `useRealtimeManagement.ts` monitora status `SUBSCRIBED` e loga warning se não for.
- **Risco:** Se o WebSocket cair (proxy, rede, reinicialização do servidor), as subscriptions perdem eventos. O app continua logando warnings, mas não há reconexão proativa além do backoff do SDK.
- Sem heartbeat visível para o usuário (não há indicador "Realtime desconectado").
- `useRealtimeMonitor.ts` só funciona com tabelas no schema `evo` (físico), não na view `zapp.messages`.

---

## 8. Service Worker cache stale → VERSÃO ANTIGA SERVIDA

**STATUS: SW push-only — excelente proteção anti-stale**

- `sw.js` é **push-only**: NUNCA faz cache do app shell.
- `activate` purgeia todos os caches.
- `stampSwVersionPlugin` (vite) injeta BUILD_ID no SW e adiciona listeners que:
  - Purgam caches Workbox legados no `install`.
  - Notificam todas as tabs com evento `SW_UPDATED` no `activate`.
- `buildVersion.ts` faz polling de `/version.json` a cada 5 min e força hard reload se detectar divergência.
- `useServiceWorker.ts`:
  - Registra SW com `updateViaCache: 'none'`.
  - Verifica updates a cada 5 min.
  - Dispara `sw-update-available` via CustomEvent.
  - Em preview/iframe/dev, desregistra qualquer SW automaticamente.
- `index.html` inline script: detecta e purga Workbox legado + unregister.
- **Veredito:** A proteção contra stale cache é robusta. Risco muito baixo.

---

## Tabela Resumo

| # | Cenário | Risco | Status Atual |
|---|---------|-------|-------------|
| 1 | ANON_KEY ausente | **ALTO** | ❌ Build atual sem ANON_KEY — app quebrado |
| 2 | GoTrue offline | MÉDIO | ✅ Online (69 sessões ativas) |
| 3 | CORS bloqueio | MÉDIO | ⚠️ Dependente do backend, sem fallback |
| 4 | Sessão expirada | BAIXO | ✅ Auto-refresh + CSP mitigam |
| 5 | Bundle grande | MÉDIO | ⚠️ 1.5 MB entry point, ~7 MB total |
| 6 | RLS bloqueio | **ALTO** | ⚠️ 701 policies — sem ANON_KEY, TUDO falha |
| 7 | Realtime offline | MÉDIO | ⚠️ Config ok, mas sem heartbeat visível |
| 8 | SW stale cache | BAIXO | ✅ Proteção robusta anti-stale |

---

## Ação Prioritária

1. **CRÍTICO — Configurar VITE_SUPABASE_ANON_KEY no ambiente de build** (Vercel/GitHub Secrets):
   - Acessar o VPS `supabase.atomicabr.com.br`, obter a anon key do `.env` do container Supabase.
   - Configurar como `VITE_SUPABASE_ANON_KEY` (ou `VITE_SUPABASE_PUBLISHABLE_KEY`) nas env vars do Vercel.
   - Rebuildar e redeploy.
2. **Revisar RLS policies**: 701 policies é número alto — consolidar e remover duplicatas/inativas.
3. **Monitorar Realtime**: Adicionar heartbeat visível ou indicador de conexão para o usuário.
