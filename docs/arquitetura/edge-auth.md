# Autenticação de Edge Functions no Edge Runtime Self-Hosted

- **Data da auditoria:** 2026-08-01
- **Ambiente:** Supabase self-hosted — supabase.atomicabr.com.br (Docker Swarm)
- **Repositório:** adm01-debug/zapp-web-v3 (worktree `C:/c/tmp/wt-audit`)
- **Escopo:** auth do edge-runtime self-hosted; divergência repo vs volume deployado

---

## 1. Resumo executivo

1. O edge-runtime **self-hosted** (`supabase/edge-runtime`) **NÃO honra o `config.toml`** quando `supabase/functions/main/index.ts` é o entrypoint. As diretivas `verify_jwt` e os limites por função (memória/timeout) definidos no `config.toml` não se aplicam nesse modelo — isso está declarado no próprio cabeçalho do `main/index.ts` do repo.
2. **Fonte de verdade** para autenticação = env **`VERIFY_JWT`** (nível container/serviço) + allowlist **`PUBLIC_FNS`** em `supabase/functions/main/index.ts`.
3. A allowlist contém **23 funções públicas** (tabela na seção 4) — chamadas **sem JWT mesmo com `VERIFY_JWT=true`**.
4. **Pitfall documentado:** valor `VERIFY_JWT='"false"'` **com aspas literais** — a comparação estrita no código faz a verificação JWT ficar **desligada silenciosamente** (seção 6).

---

## 2. Por que o config.toml não vale aqui

Cabeçalho do `supabase/functions/main/index.ts` (repo):

> "o config.toml (verify_jwt, limites de memória/timeout por função) NÃO é honrado pelo runtime edge self-hosted (supabase/edge-runtime) quando este arquivo é o entrypoint. Esta allowlist (PUBLIC_FNS) é a FONTE DE VERDADE: funções listadas aqui são chamadas SEM JWT mesmo com VERIFY_JWT=true; qualquer outra função exige Authorization: Bearer *** válido."

**Implicação operacional:** mudanças de autenticação se fazem exclusivamente por:

- env `VERIFY_JWT` no serviço/stack do edge-runtime; e
- deploy da versão atualizada do `main/index.ts` no volume `/home/deno/functions/main/`.

---

## 3. Fonte de verdade: env + allowlist

| Item | Onde | Comportamento |
|---|---|---|
| `VERIFY_JWT` | env do container | Lido no boot: `Deno.env.get('VERIFY_JWT') === 'true'` (comparação **estrita**) |
| `JWT_SECRET` | env direto | Segredo usado na verificação JWT (`jose.jwtVerify`) |
| `JWT_SECRET_FILE` | caminho de arquivo montado | Alternativa ao env (ex.: `/run/secrets/jwt_secret` em Docker Swarm); conteúdo lido com `.trim()` |
| Fail-fast | boot | `VERIFY_JWT=true` sem `JWT_SECRET`/`JWT_SECRET_FILE` → recusa iniciar (`JWT_SECRET required when VERIFY_JWT is enabled`) |
| Guard `MISSING__` | boot | Env não resolvida (chega como `MISSING__<NOME>`) → apenas `console.warn`, não bloqueia o boot |
| `PUBLIC_FNS` | `main/index.ts` (linha 15) | `Set` com 23 nomes de funções; `PUBLIC_FNS.has(service_name)` define isenção de JWT |

---

## 4. Tabela das 23 funções públicas (PUBLIC_FNS)

| # | Função | Categoria |
|---|---|---|
| 1 | `evolution-webhook` | Webhook / integração externa |
| 2 | `whatsapp-webhook` | Webhook / integração externa |
| 3 | `whatsapp-cloud-webhook` | Webhook / integração externa |
| 4 | `whatsapp-cloud-webhook-verify` | Webhook / integração externa |
| 5 | `elevenlabs-webhook` | Webhook / integração externa |
| 6 | `gmail-webhook` | Webhook / integração externa |
| 7 | `email-track-pixel` | Webhook / integração externa |
| 8 | `email-track-link` | Webhook / integração externa |
| 9 | `bitrix-api` | Webhook / integração externa |
| 10 | `evolution-sync` | Webhook / integração externa |
| 11 | `evolution-sender` | Webhook / integração externa |
| 12 | `sentiment-alert` | Webhook / integração externa |
| 13 | `login-attempts` | Frontend sem sessão |
| 14 | `get-mapbox-token` | Frontend sem sessão |
| 15 | `connection-health-check` | Health / status |
| 16 | `evolution-health` | Health / status |
| 17 | `health-check` | Health / status |
| 18 | `status` | Health / status |
| 19 | `send-rate-limit-alert` | Infra / classificação |
| 20 | `cleanup-rate-limit-logs` | Infra / classificação |
| 21 | `classify-audio-meme` | Infra / classificação |
| 22 | `classify-emoji` | Infra / classificação |
| 23 | `classify-sticker` | Infra / classificação |

*(Categorias organizadas por conveniência de leitura; a fonte canônica é o `Set` em `main/index.ts`, linha 15.)*

---

## 5. Fluxo de verificação JWT

1. Requisição chega ao edge-runtime → rota `/functions/main` → executa `main/index.ts`.
2. `service_name` = primeiro segmento do `pathname`; validado contra regex `^[a-z][a-z0-9-]*$`, máximo 64 caracteres, e **`main` é rejeitado** (sem auto-invocação).
3. `isPublic = PUBLIC_FNS.has(service_name)`.
4. Se `VERIFY_JWT && !isPublic` e método **diferente de OPTIONS**:
   - exige header `Authorization: Bearer <jwt>` (`getAuthToken`);
   - valida com `jose.jwtVerify(jwt, JWT_SECRET)`;
   - falha → `401` com `{ "msg": "Invalid JWT" }` ou `{ "msg": "Authorization failed" }`.
5. **OPTIONS sempre passa** (CORS).
6. Funções na allowlist seguem **sem token**, mesmo com `VERIFY_JWT=true`.
7. Aprovado → worker criado via `EdgeRuntime.userWorkers.create` em `/home/deno/functions/<name>`, com `memoryLimitMb = 256`, `workerTimeoutMs = 5 * 60 * 1000` (5 min) e env do container repassado; falha de worker → `500`.

---

## 6. Pitfall: `VERIFY_JWT='"false"'` com aspas literais

- **Observado na auditoria:** valor configurado como `VERIFY_JWT='"false"'` — string **com aspas literais** incluídas no valor.
- **Código:** `const VERIFY_JWT = Deno.env.get('VERIFY_JWT') === 'true'` — comparação **estrita**.
- **Efeito:** `'"false"' !== 'true'` → `VERIFY_JWT` avalia como `false` → **verificação JWT desligada silenciosamente**. Todas as funções (inclusive fora da allowlist) ficam acessíveis sem token — **furo de segurança**.
- **Correto:** `VERIFY_JWT=false` **sem aspas** (ou `true` sem aspas quando a verificação deve estar ligada).
- **Verificação:** conferir o valor **efetivo no container** (env do serviço), não apenas no arquivo `.env`/compose — aspas podem ser introduzidas por escaping.

---

## 7. Estado do deploy (auditoria 2026-08-01)

- O volume `/home/deno/functions` roda `main/index.ts` **DESATUALIZADO**: versão antiga de **~90 linhas** vs versão do repo **melhorada (165 linhas)** — que adiciona a allowlist `PUBLIC_FNS`, suporte a `JWT_SECRET_FILE` e os guards de env não resolvida (`MISSING__`).
- **Ação pendente:** redeploy do `main` a partir do repo (ver também `edge-functions-inventory.md`).

---

## 8. Referências

- `supabase/functions/main/index.ts` (repo, 165 linhas — versão melhorada)
- `edge-functions-inventory.md` (inventário repo vs volume)
- `zapp-facade-layer.md` (camada de views consumida pelas functions)
