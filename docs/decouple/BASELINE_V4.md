# BASELINE V4 — Fatos medidos do desacoplamento Zapp ↔ Evolution (2026-08-14)

**Data da medição:** 2026-08-14 · **Onda:** 10 agentes em paralelo + reconciliação da `main` @`8ff014fb0` · **Autor:** Agente 8 (docs) · **Repo/worktree:** zapp-web-v3 (`hermes-workspaces/chat-h713641`) · **Base:** `SCORECARD_V3.md` (8,5/10) + `PLANO_DESACOPLAMENTO_V4_CLAUDE_100_ETAPAS_20260814.md`

> **Como ler:** este documento é o retrato factual do desacoplamento medido em 2026-08-14 pela onda de 10 agentes e substitui leituras de estado baseadas apenas no SCORECARD_V3 (que já estava parcialmente desatualizado na manhã do mesmo dia). Cada seção traz o fato medido, o veredito e, quando aplicável, o fix aplicado nesta onda. Matriz de cenários correspondente: [`CENARIOS_V4_LOG.md`](./CENARIOS_V4_LOG.md).

---

## 1. Inventory e gate CI

| # | Fato medido | Detalhe | Veredito |
|---|---|---|---|
| 1.1 | `inventory.mjs` TOTAL = 1 em Windows era **falso-positivo** | Bug de path nas linhas 124–125 de `scripts/decouple/inventory.mjs`: a exclusão do gateway usa `f.includes('providers/evolution')` com barra `/`, mas no Windows o path vindo de `walk()` usa `\` — a exclusão não casa e `supabase/functions/_shared/providers/evolution/client.ts` (gateway, contém `Deno.env.get('EVOLUTION_API_URL')`) é contado como bypass | **Mitigado** — CI Linux sempre verde (0 bypasses); fix de normalização de path aplicado **nesta onda** |
| 1.2 | Threshold do CI ainda frouxo | `.github/workflows/decouple-guard.yml` linha 61: `if [ "$TOTAL" -gt 15 ]` — permite até 15 bypasses novos | **Ação** — fix aplicado **nesta onda** (endurecimento do gate) |
| 1.3 | ESLint decouple já em `"error"` | `eslint.config.js` linhas 246–268: 3 regras `no-restricted-syntax` (invoke `evolution-api` direto, import `evolutionExternal`, `VITE_EVOLUTION_API_URL` no front) | **Fechado** — pendência do SCORECARD (dimensão 10) já resolvida antes da onda |

## 2. Deploy de edge functions

| # | Fato medido | Detalhe | Veredito |
|---|---|---|---|
| 2.1 | `deploy-edge.sh` só sincroniza `_shared` **raiz** | `infra/edge-deploy/deploy-edge.sh` linha 258: `for f in ${VOLUME_PATH}/_shared/*.ts` com `find -maxdepth 1` — subdiretórios como `_shared/providers/evolution/` ficam fora da sincronização | **Ação** — drift confirmado: `registry.ts` volume `aca0cb90` × repo `45f22b96`; fix aplicado **nesta onda** |

## 3. Banco de dados (medido 2026-08-14)

| # | Fato | Valor medido |
|---|---|---|
| 3.1 | Tabelas `evo.*` | **29** (16 operacionais + 13 partições) |
| 3.2 | Objetos `zapp.evolution_*` | **99** |
| 3.3 | Grants de **escrita** `authenticated`/`anon` em `evo.*` | **0** (congelamento efetivo) |
| 3.4 | Funções `evo.*` com EXECUTE para `authenticated` | **115** (herdam o default PUBLIC — ver cenário E24) |
| 3.5 | `ops.fn_bodies_backup` | **5** linhas |
| 3.6 | Crons ativos | **317 / 318 / 329 / 429** |
| 3.7 | `rpc_upsert_contact` | **1** overload (risco de overload múltiplo do V3 não se materializou) |
| 3.8 | Secrets `evolution_*` | **10**, com **2 pares duplicados** (pendência dimensão 7 do scorecard) |
| 3.9 | Mensagens / 24h | **3.358** |
| 3.10 | DLQ principal | **0** (`zapp.dispatch_error_logs` = 1 registro) |

## 4. Runtime de produção

| # | Fato | Valor medido |
|---|---|---|
| 4.1 | Digests | evolution **`6f9f1d35`** · consumer **`75210b9f`** · web **`production-ccdb663ba68d`** |
| 4.2 | Stacks | **25 / 113 / 238 / 240 / 262 / 264 / 265** |
| 4.3 | Functions health | stack **265** |
| 4.4 | guardian + pgbackrest | **EM stack** (G4 fechado) |
| 4.5 | Watchdogs | **5** com RestartCount = **0** |
| 4.6 | Instância wpp2 | **open / isHealthy** · **322.430** mensagens |

## 5. Repositório e documentação

| # | Fato medido | Veredito |
|---|---|---|
| 5.1 | ESLint decouple = `error` (3 regras `no-restricted-syntax`) | ✅ fechado (confirmado `eslint.config.js` 246–268) |
| 5.2 | `ADR-008-canonical-domain-model.md` completo, **6,7 KB**, `Status: Aceito` | ✅ fechado (não é mais o stub de 1.161 B citado no SCORECARD) |
| 5.3 | `CANONICAL_COLUMN_MAP.md` existe (**9 KB**) | ✅ fechado |
| 5.4 | `RUNBOOK_TROCA_PROVIDER.md` existe (10,8 KB) | ⚠️ **ensaio nunca executado** — dimensão 9 segue sem prova real |
| 5.5 | Fake provider | **11 de 12** verbos do contrato canônico (gap: 1 verbo) |
| 5.6 | `PROVIDER_UNDER_TEST` | **ausente** no código (citado apenas no desenho V4-Claude, F2 #37–38) |
| 5.7 | Consumidores de `registry.ts` | **0** functions consomem o registry |
| 5.8 | `evolution-credentials` GET | **410 Gone**, mas código zumbi da key persiste (ver E30) |
| 5.9 | `evolution-templates` | **401 provável** (ver E25) |

## 6. Fixes aplicados nesta onda

1. **Inventory Windows** — normalização de path nas linhas 124–125 de `scripts/decouple/inventory.mjs`: elimina o falso-positivo `TOTAL=1` em Windows; CI Linux permaneceu verde (0 bypasses).
2. **Threshold CI** — endurecimento de `.github/workflows/decouple-guard.yml` (linha 61, `-gt 15`): o gate passa a travar regressão real de acoplamento.
3. **Deploy edge** — `infra/edge-deploy/deploy-edge.sh` passa a sincronizar também `_shared/providers/`: elimina o drift de `registry.ts` (volume `aca0cb90` × repo `45f22b96`).

## 7. Pendências abertas (fora do escopo desta onda)

- Ensaio do `RUNBOOK_TROCA_PROVIDER.md` nunca executado (dimensão 9).
- 115 funções `evo.*` com EXECUTE default PUBLIC para `authenticated` — revisar (E24).
- Secrets `evolution_*`: 2 pares duplicados (dimensão 7).
- Fake provider 11/12 verbos; `PROVIDER_UNDER_TEST` ausente no código.
- `evolution-templates` 401 provável (E25); código zumbi da key de credentials (E30).
