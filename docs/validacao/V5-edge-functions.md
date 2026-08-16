# V5 — Validação adversarial de 36-backend-edge-functions.md

> Validado em: 2026-08-16 | Achados testados: 6/6 dirigidos + 7 colaterais | Sem banco, nada executado
> Alvo: `docs/estado/36-backend-edge-functions.md` (HEAD `aca8bec9d`)
> Postura: refutar. Todo veredito abaixo é releitura direta do arquivo citado, não do documento auditado.

---

## 1. Placar

| Veredito | Qtd | Quais |
|---|---|---|
| **CONFIRMADO** | 2 | #3 (`email-imap-bridge` STUB), #4 (`evolution-templates` 401) |
| **CONFIRMADO mas subdimensionado** | 2 | #2 (falsos-negativos do critério), #6 (funções fora do `ESTADO.md`) |
| **SUPERDIMENSIONADO** | 1 | #1 (A4b — "arquivar `login-attempts` quebraria o login") |
| **REFUTADO** | 1 | #5 (exclusividade da violação de gateway) |
| **REFUTADO (colateral, o mais grave)** | 1 | §3.1/§5.4/§7 — `evolution-group-sync` e `evolution-notification-dispatcher` **têm cron ativo em produção**, registrado no próprio repo |

**Saldo:** a direção dos achados é quase toda correta; a **calibragem** não é. O documento
erra sistematicamente no mesmo eixo: acerta que existe um problema, erra o tamanho dele —
para mais em `login-attempts`, para menos em gateway, grupo F e grupo B.

---

## 2. Veredito por achado

| # | afirmação | veredito | evidência verificada | nota |
|---|---|---|---|---|
| 1 | **A4b** — `login-attempts` é chamada pelo login e arquivá-la "**quebraria o fluxo de login**" | **SUPERDIMENSIONADO** | Cadeia completa: `src/pages/Auth.tsx:21,39` → `src/features/auth/hooks/useAuthForm.ts:9-15,164` → `src/lib/loginAttempts.ts:117-143`. Mas as 3 funções exportadas (`checkAccountLock`, `recordFailedLogin`, `clearLoginAttempts`) envolvem o `invoke` em `try/catch` e retornam `DEFAULT_LOCK_STATUS` (`:37-45`, `blocked:false`, `isLocked:false`) em qualquer erro | **Fail-open confirmado.** Com a função removida (404), `checkAccountLock` loga o erro e devolve "não bloqueado" → `useAuthForm.ts:181` chama `signIn` normalmente. **O login continua funcionando.** O que se perde: lockout de força-bruta (5 tentativas), blocklist de IP, whitelist de IP e geo-blocking (SEGURANCA-04/05) — silenciosamente. É uma **regressão de segurança grave, não uma quebra de autenticação**. A severidade ALTA se sustenta; a frase que a justifica, não |
| 2 | O critério do `ESTADO.md` não casa `invoke<T>('nome')` → **há mais falsos-negativos** na lista F | **CONFIRMADO e subdimensionado** | Varredura completa das 18 (§3): **4** das 18 têm `invoke` em `src/`, não 2 | O documento encontrou 2 e **fechou a porta**: "*`grep -rn "functions.invoke<" src/` retorna exatamente esses 2 casos — não há um terceiro escapando pelo mesmo motivo*" (§3.4). O grep está certo; a **conclusão está errada**. O genérico `<T>` é só *um* dos padrões de evasão. Os outros dois casos escapam por **variável** e por **template literal** — ver §3 |
| 3 | `email-imap-bridge` é STUB; o próprio código declara IMAP/SMTP inviável | **CONFIRMADO** | `supabase/functions/email-imap-bridge/index.ts:7-27` — docblock literal: "*NÃO implementado de verdade — Edge Functions são HTTP-only (sem TCP), então IMAP/SMTP real (fetchInbox/sendMessage) é INVIÁVEL aqui*". `fetchInbox`/`sendMessage` são anunciados em `:19-20` e caem no `return json({error: 'Ação desconhecida…'}, 400)` de `:293` | Citação de linha do doc (`:10-16`) está ~correta (o TODO é `:10-15`). **Ressalva:** a função **não é um stub vazio** — tem 4 ações reais implementadas (`getProviderConfig` `:100`, `saveCredentials` com AES-GCM `:113`, `testConnection` `:229`, `listProviders` `:277`). Ver rebaixamento de A2 em §5 |
| 4 | `evolution-templates` retorna **401 em 100%** das chamadas do browser — alegação de runtime feita por análise estática | **CONFIRMADO** (dedução estática **sólida**, não `NAO_VERIFICAVEL`) | `evolution-templates/index.ts:101` chama `requireServiceRoleOrCron(req)` **incondicionalmente**, antes de qualquer ramo de ação (só depois do preflight OPTIONS em `:98`). `_shared/auth.ts:185-195`: aceita **apenas** bearer == service-role key **ou** header `x-cron-secret` == `CRON_SECRET`; senão `401 "Unauthorized: internal endpoint"`. O único chamador é `src/hooks/useWhatsAppTemplates.ts:197` — `supabase.functions.invoke('evolution-templates', { method:'GET' })`, que envia JWT de usuário + apikey anon | Não precisa de runtime: o gate é total e o browser **não pode**, por construção, portar nenhum dos dois segredos. O 401 é consequência lógica do código, não extrapolação. Fallback silencioso no hook confirmado (`:190` documenta o 401; `:244` captura) |
| 5 | **Exatamente 1** violação de gateway (`connection-health-check`) | **REFUTADO** | **≥3 violações da mesma classe, provavelmente 5.** Ver §4 | O documento buscou só por `EVOLUTION_API_URL`. As outras resolvem a base URL pelo **vault** (`fn_get_vault_secret('evolution_api_url')`) e por isso escaparam do grep |
| 6 | 3 funções no disco ausentes do `ESTADO.md` (`evolution-proxy`, `evolution-group-sync`, `evolution-notification-dispatcher`) | **CONFIRMADO e já desatualizado** | As 3 existem (`index.ts` com 209/470/502 linhas, confere com o doc) e `rg` em `ESTADO.md` retorna **zero** ocorrências das 3 | **Hoje são 4.** `supabase/functions/evolution-consumer-stats/` (commit `59a4c53ba`, 2026-08-16 10:24:14) também está no disco e fora do `ESTADO.md`. O doc foi commitado (`81f3f7c04`) **8 segundos antes** — é corrida de merge, não erro de método, mas o cabeçalho "107/107" e o "109 diretórios" de §1 estão stale: hoje são **110 diretórios / 108 funções ativas** |

### 2.1 Refutação colateral — a mais grave de todas

O documento classifica `evolution-group-sync` e `evolution-notification-dispatcher` como
"**Nenhum** chamador" (§3.1), soma-as às candidatas a arquivar (§5.4, "19 candidatas") e
declara em §7 que "*se algum dos 218 `cron.job` chama [essas duas] … NAO_VERIFICADO*".

**Isso é refutável sem tocar no banco.** O próprio repositório contém o baseline de cron
de produção de 2026-08-15:

`docs/decouple/baseline/20260815/cron_jobs.json`

```
jobid 476  sync-groups-daily       active: true
           net.http_post(url := '…/functions/v1/evolution-group-sync', …)
jobid 477  check-whatsapp-numbers  active: true
           extensions.http_post(url := '…/functions/v1/evolution-group-sync', …)
jobid 478  notif-dispatcher        active: true
           extensions.http_post(url := '…/functions/v1/evolution-notification-dispatcher', …)
```

São **3 cron jobs ativos** apontando para as duas funções. O `ESTADO.md` **cita esses
mesmos jobids** na lista de violações do invariante I4 ("jobids … 476-478 …"), ou seja,
a evidência estava a um `rg` de distância, num arquivo referenciado pelo documento-fonte.

Consequências:
- As duas não são "candidatas a grupo F" — são **grupo C (chamada por cron ativo), "manter"**.
- A afirmação do `ESTADO.md` de que "*apenas `nps-daily-trigger` chama edge fn*" entre os 218
  jobs é **falsa**, e o documento a repetiu como sustentação ("*o que sustenta — mas não prova —
  a ausência de chamador*", §5.4). Sustentava o oposto.
- Arquivar `evolution-notification-dispatcher` derrubaria o outbox de notificações; arquivar
  `evolution-group-sync` derrubaria o sync diário de grupos e o `check-whatsapp-numbers`.

Varredura exaustiva do mesmo baseline: os **únicos** três nomes de edge function alcançados
por cron/pg_net são `evolution-group-sync`, `evolution-notification-dispatcher` e
`nps-scheduler`. Nenhuma das 18 do grupo F aparece — nesse ponto o grupo F resiste.

---

## 3. Varredura das 18 funções do grupo F — quantas têm chamador real?

Método: para cada nome, `rg -F` em todo o repo (excluindo `docs/`, `node_modules/`,
`graphify-out/` e o próprio diretório da função), depois inspeção manual de cada hit
não-trivial. Complementado por: enumeração de **todas** as formas de `functions.invoke(`
em `src/` (literal, genérico, variável, template literal, multi-linha, aspas duplas) e por
`functions/v1/<nome>` em `src/`, `.github/`, `scripts/` e nos baselines de cron/pg_net.

| função | padrão que encontrei | tem chamador? |
|---|---|---|
| `ai-auto-tag` | só registries de contrato + `functionName:'ai-auto-tag'` como **rótulo de métrica** em `ai-router/index.ts:1271,1335,1540,1598` | **NÃO** — rótulo não é chamada |
| `auto-close-conversations` | contract-schemas + `main/index.ts:45` (`PUBLIC_FNS`) | **NÃO** |
| `cleanup-rate-limit-logs` | contract-schemas + `main:43` + `config.toml:52` + texto de doc de UI | **NÃO** |
| **`client-observability`** | **`src/lib/webVitals.ts:44`** `const OBS_FUNCTION = 'client-observability'` → **`:98`** `supabase.functions.invoke(OBS_FUNCTION, {…})` | **SIM** — evasão por **variável**. Wired em `src/main.tsx`. ⚠ gated por `VITE_ENABLE_CLIENT_OBSERVABILITY==='true'` (vazio em `.env.example:99`) → ativação em prod = **NAO_VERIFICADO** |
| `contact-media` | só contract-schemas/versions | **NÃO** |
| `db-health-monitor` | contract-schemas + `main:38` | **NÃO** |
| `email-health` | `src/pages/admin/email/useEmailHealthStatus.ts:56` diz **explicitamente** "*A edge `email-health` não existe (404 silencioso)*" e usa `emailHealthService`/RPC; `useGmailHealth.ts:8` é só uma **query key** react-query | **NÃO** — e o front já sabe disso |
| `evolution-bitrix-sync` | contract-schemas | **NÃO** |
| **`evolution-retry-metrics`** | **`src/features/admin/hooks/monitoring/useRetryMetrics.ts:75-76`** `supabase.functions.invoke(` ⏎ `` `evolution-retry-metrics?${params.toString()}` `` , `{method:'GET'}`) | **SIM** — evasão tripla: **multi-linha + template literal + query string**. Cadeia até a UI **completa e viva** (ver abaixo) |
| `fetch-whatsapp-avatar` | contract-schemas + `config.toml:82` | **NÃO** |
| `file-security-scanner` | contract-schemas, `validation.ts`, `src/lib/scanResponse.ts` — todos tratam o **envelope de erro emitido** por ela, nunca a invocam | **NÃO** |
| `followup-bridge` | `src/hooks/useFollowupBridge.ts:62-63` (genérico multi-linha) | **SIM no código, NÃO na UI** — doc acertou. Confirmado por `scripts/dead-code-allowlist.txt:181`, que já registrava o hook como "sem consumidor na UI atual" |
| `lgpd-scheduled-jobs` | contract-schemas + migration histórica | **NÃO** |
| **`login-attempts`** | `src/lib/loginAttempts.ts:88` (genérico) | **SIM** — doc acertou. Reforço: está em `main/index.ts:40` (`PUBLIC_FNS`) e tem `config.toml:92` `verify_jwt=false` |
| `provider-router` | contract-schemas + comentário no squash de migrations | **NÃO** |
| `recover-corrupted-audios` | contract-schemas | **NÃO** |
| `send-rate-limit-alert` | contract-schemas + `main:51` + `config.toml:49` | **NÃO** |
| `send-scheduled-report` | contract-schemas; `src/hooks/useScheduledReports.ts:2` chama de "**fio quebrado**" e só lê a tabela | **NÃO** |

### Resultado

**4 das 18** têm `invoke()` em `src/` — o dobro do que o documento reporta.
Recorte por consequência de arquivamento:

| função | o que quebra se arquivar |
|---|---|
| **`evolution-retry-metrics`** | **Quebra de verdade.** Cadeia viva e roteada: `src/pages/ViewRouter.tsx:138` (`'evolution-monitor'`) → `EvolutionMonitoringDashboard.tsx:189` → `MonitoringWebhookPanel.tsx:133` → `RetryMetricsPanel` → `useRetryMetrics:75`. O `queryFn` faz `if (error) throw error` (`:82`) — **sem fallback**. O painel de monitoria Evolution passa a erro permanente |
| `login-attempts` | **Não quebra** — fail-open (§2, #1). Degrada segurança silenciosamente |
| `client-observability` | Não quebra — circuit-breaker + `catch` em `webVitals.ts`; e provavelmente já está off por flag |
| `followup-bridge` | Não quebra — hook órfão |

**A ironia da calibragem:** o documento elegeu como caso-símbolo de A4b (severidade ALTA,
"quebraria o login") justamente a função que **fail-opens**, e deixou passar
`evolution-retry-metrics`, que é a única das quatro cujo arquivamento **realmente derruba
uma tela**.

### Recontagem de §5.4

"19 candidatas" → **15**. Aritmética: 18 do grupo F − `login-attempts` − `client-observability`
− `evolution-retry-metrics` = 15; `evolution-group-sync` e `evolution-notification-dispatcher`
**não entram** (grupo C, §2.1). `followup-bridge` permanece na lista.

---

## 4. Reteste da exclusividade da violação de gateway

Padrões testados em **todas** as funções não-teste de `supabase/functions/`:
`EVOLUTION_API_URL`, `fn_get_vault_secret('evolution_api_url')`, `getBaseUrl()`, `fetch(`,
`axios`, `callEvolutionApi`, e host literal do provider (`https?://…evo…`).

**Veredito: REFUTADO.** A violação não é exclusiva.

### 4.1 O que o documento acertou

- `connection-health-check:40,151,193` — violação real, exatamente como descrita.
- `callEvolutionApi` → **0 ocorrências**. Confirmado.
- `axios` → **0 ocorrências**. Nenhuma URL literal de provider hardcoded.
- Os 5 não-violadores de §4.2 (gateway, strings de erro, comentários, fixtures) — todos
  reconferidos e corretos, inclusive `connection-test`: seus 4 `fetch` vão para o Meta Graph
  e para funções do próprio projeto, nenhum para a Evolution.

### 4.2 As violações que o documento perdeu

**Classe 1 — bypass total (base URL resolvida fora do gateway, via vault + `fetch` cru).**
Mesma classe exata de `connection-health-check`; escaparam porque o grep foi por
`EVOLUTION_API_URL` e estas leem `evolution_api_url` **do vault**:

| Função | Evidência | Egresso |
|---|---|---|
| **`evolution-templates`** | `:53` `supabase.rpc("fn_get_vault_secret", {p_name:"evolution_api_url"})` → `:81` `fetch(\`${cfg.url}/message/sendText/${cfg.instance}\`)` | **Envio de mensagem WhatsApp em produção**, fora do gateway |
| **`evolution-notification-dispatcher`** | `:257` `getSecret('evolution_api_url')` → `:270` `fetch(\`${url}/message/sendText/${instance}\`)` | **Envio de WhatsApp promo**, fora do gateway — e esta roda por **cron ativo** (jobid 478) |

**Classe 2 — bypass parcial (usa `getBaseUrl()` do gateway só para resolver a URL, depois
`fetch` cru em vez dos 12 verbos).** Discutível como "violação", mas contraria literalmente
"12 verbos, 0 bypasses":

| Função | Evidência |
|---|---|
| `evolution-group-sync` | `:277`+`:281` `fetch(\`${baseUrl}/chat/whatsappNumbers/…\`)`; `:418`+`:423` `fetch(\`${baseUrl}/group/fetchAllGroups/…\`)` |
| `evolution-api` | `:249` `fetch(\`${evolutionApiUrl}/instance/connect/${instance}\`)`; `:259` `fetch(\`${evolutionApiUrl}/instance/create\`)` — fora do `proxyToEvolution` usado pelo resto da função |

**Nota de fundo:** o próprio transporte compartilhado `_shared/evolution-api-proxy.ts:170`
faz `fetch(fullUrl, …)` direto, sem passar por `_shared/providers/evolution/client.ts`.
Ou seja, o "0 bypasses" do `CLAUDE.md` já não é verdade na camada `_shared`.

### 4.3 Placar do reteste

| Contagem | Documento | Reteste |
|---|---|---|
| Violações classe 1 (bypass total) | 1 | **3** |
| Violações classe 2 (bypass parcial) | 0 | **2** |
| Chamadas HTTP de produção fora do gateway | 2 | **≥8** |

O achado **A1 deve subir de escopo**, não de severidade: continua ALTA, mas o título
"1 função" precisa virar "**3 funções em bypass total + 2 parciais**", e o pior caso não é
mais o detector de instância fantasma (leitura) — é `evolution-templates` e
`evolution-notification-dispatcher` **enviando mensagens WhatsApp** por fora do gateway.

---

## 5. Achados que eu rebaixaria

| ID | Rebaixamento | Motivo verificado |
|---|---|---|
| **A4b** | ALTA → **ALTA, com o enunciado corrigido** | O fato (falso-negativo sistemático) é ALTA. A justificativa ("quebraria o fluxo de login") é falsa: `loginAttempts.ts:120-123,130-133,140-142` fail-open. Trocar por: "*arquivar `login-attempts` desativa silenciosamente lockout de força-bruta, blocklist/whitelist de IP e geo-blocking, sem sintoma visível*". E o exemplo de "quebra real" deve passar a ser `evolution-retry-metrics` |
| **A2** | ALTA → **MÉDIA** | A parte factual (STUB declarado) é sólida. A parte que justifica a severidade ALTA — "*Front pode estar exibindo UI para uma capacidade inexistente*" — **eu testei e é falsa**: `src/hooks/email/useImapAccounts.ts` só invoca `getProviderConfig` (`:140`), `listProviders` (`:151`), `testConnection` (`:160`) e `saveCredentials` (`:172`) — as **4 ações implementadas**. `fetchInbox`/`sendMessage` **não aparecem em lugar nenhum de `src/`**. Não há UI para capacidade inexistente. Sobra: docblock enganoso e ausência de 501 explícito |
| **A7** | MÉDIA → **MÉDIA, número errado** | O documento corrige "3 declarados × 9 reais" e **também erra**. Enumerando `functions/v1/<nome>` em todas as funções não-teste, faltam pelo menos 3 relações: `health` → `metrics` (`health/index.ts:71-72`, `fetch` real), `connection-test` → `evolution-webhook` (`:343`) e `connection-test` → `whatsapp-cloud-webhook` (`:298`), ambas via `PROJECT_FUNCTIONS_BASE` (`:47`). Real ≥ **12**, não 9. (Descartei `evolution-credentials:157` → `evolution-proxy`: é só string na mensagem do 410, não é chamada — mesmo critério do documento) |
| **§5.4** | "19 candidatas" → **15** | Ver §3 |
| **§3.1** | "candidatas a grupo F" → **grupo C** | Ver §2.1 — 3 cron jobs ativos |
| **§7** | Remover 1 dos 5 itens | "*Se algum dos 218 `cron.job` chama `evolution-group-sync`/`evolution-notification-dispatcher`*" **não é** NAO_VERIFICÁVEL: está respondido em `docs/decouple/baseline/20260815/cron_jobs.json`, dentro do repo |
| **§1 / cabeçalho** | Stale | 110 diretórios / 108 funções ativas hoje (`evolution-consumer-stats`, commit `59a4c53ba`). "107/107" venceu 8 segundos após o commit do documento |

### Achados que eu **manteria** intactos

Reconferidos um a um e **sustentados**:

- **A3** (`evolution-templates` 401) — dedução estática sólida, ver §2 #4.
- **A5** (grupo E desatualizado) — `_archive/` contém exatamente as 3 funções; grupo E real = 1.
- **A6** (`main` sem `health`/`metrics`/`mcp*` em `PUBLIC_FNS`) — conferido em
  `main/index.ts:28-57`: o `Set` tem 21 entradas e **nenhuma** das 5; o comentário órfão
  "*health GET público (POST exige JWT)*" está em `:41`, entre `login-attempts` e o bloco de
  cron, sem função associada. Exatamente como descrito.
- **A8** (defasagem `evo.*` em comentários) — **6/6 confirmados**:
  `_shared/evolution-webhook-msg-handlers.ts:115`, `_shared/evolution-webhook-handlers.ts:386`,
  `evolution-group-sync/index.ts:247`, `public-api/index.ts:56`, `followup-bridge/index.ts:2`,
  `connection-health-check/index.ts:14`. E a ressalva do documento também procede: **zero**
  `.schema('evo')` em runtime (os 2 hits em `evolution-credentials:18,42` são comentários
  explicando que nunca funcionou).
- **A9** (`chat-bridge` cross-projeto) — `sicoob-bridge-reply/index.ts:105`; `chat-bridge` não
  existe neste repo. Confirmado.
- **A13** (hook órfão `useFollowupBridge`) — confirmado, e já estava catalogado em
  `scripts/dead-code-allowlist.txt:181`.
- **§4.3** (`callEvolutionApi` = 0 ocorrências) — confirmado.
- **§3.4**, sub-alegação mecânica: `functions.invoke<` em `src/` retorna **exatamente 2**.
  O grep está certo — só a inferência tirada dele é que não.

---

## 6. O que eu não consegui refutar nem confirmar

- Se `client-observability` está de fato ativa em produção: depende de
  `VITE_ENABLE_CLIENT_OBSERVABILITY` no ambiente de build, que não está no repo
  (`.env.example:99` vazio). O **chamador existe**; a **ativação** é NAO_VERIFICÁVEL aqui.
- Se as 15 candidatas remanescentes têm chamador externo (N8N, Cloudflare Workers, Bitrix).
  Herdo a mesma lacuna do documento.
- Deploy/compilação de qualquer função — fora do escopo, nada foi executado.
- Se os 3 cron jobs de §2.1 continuam ativos **hoje**: o baseline é de 2026-08-15 e diz
  `active: true`. É evidência documental de um dia atrás, não leitura do banco.
