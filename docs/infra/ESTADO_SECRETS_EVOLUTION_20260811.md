# Estado dos Secrets da Evolution — API Key (AUTHENTICATION_API_KEY)

**Data:** 2026-08-11 (auditoria read-only — NADA foi rotacionado/criado/removido)
**Escopo:** secret Swarm `evolution_api_key_*`, consumidores da chave de API da Evolution (wpp2), vault Supabase.
**Método:** exec no container via Portainer MCP, `portainer_inspect_service`, grep no repo `zapp-web-v3`, SQL no Supabase (vault).

---

## 1. Secret Swarm atual: `evolution_api_key_v6_20260808`

| Atributo | Valor |
|---|---|
| SecretName | `evolution_api_key_v6_20260808` |
| SecretID | `o3hee45x456ki7yll7ij6e6ts` |
| Tamanho | 36 bytes (sem newline — compatível com `tr -d '\n\r'`) |
| md5 do valor (idêntico nos 2 containers verificados) | `1b6b0a6190b4791a3db534bb8b136289` |
| Permissões no container | `-r--r--r--` root:root (mode 292 = 0444) |

> ⚠️ NUNCA imprimir o valor — apenas hash acima.

### Arquivos montados por container (exec real)

**Container `evolution_evolution`** (id `6934f08e37b2`, up 18min healthy):
```
-r--r--r--  1 root root  36  Aug 11 15:54  evolution_api_key_v4_20260704
md5sum: 1b6b0a6190b4791a3db534bb8b136289  /run/secrets/evolution_api_key_v4_20260704
```

**Container `supabase_functions`** (id `bbaab1f82ea5`):
```
-r--r--r--  1 root root  36  Aug 11 18:03  evolution_api_key_v6_20260808
md5sum: 1b6b0a6190b4791a3db534bb8b136289  /run/secrets/evolution_api_key_v6_20260808
```

**Conclusão do item (1)+(2):** o container evolution monta o arquivo com **nome v4** mas o **conteúdo é o v6** (mesmo SecretID `o3hee45x456ki7yll7ij6e6ts` usado em todos os serviços; hashes idênticos). Ou seja: **mismatch confirmado é de NOMENCLATURA (não de valor)** — spec declara `SecretName=evolution_api_key_v6_20260808` com `File.Name=evolution_api_key_v4_20260704` (target/alias legado preservado para compatibilidade com o entrypoint).

---

## 2. Serviços que montam a chave (runtime — Portainer inspect)

| Serviço | SecretName (declarado) | File.Name (montado) | Uso no container |
|---|---|---|---|
| `evolution_evolution` | `evolution_api_key_v6_20260808` | **`evolution_api_key_v4_20260704`** ⚠️ alias legado | `docker-entrypoint.sh:35` → `export AUTHENTICATION_API_KEY="$(cat /run/secrets/evolution_api_key_v4_20260704 \| tr -d '\n\r')"` |
| `supabase_functions` | `evolution_api_key_v6_20260808` | `evolution_api_key_v6_20260808` | entrypoint → `export EVOLUTION_API_KEY=$(cat /run/secrets/evolution_api_key_v6_20260808)` → edge functions |
| `whatsapp-watchdog_canary` | `evolution_api_key_v6_20260808` | `evolution_api_key_v6_20260808` | `EVO_KEY_FILE=/run/secrets/evolution_api_key_v6_20260808` → header `apikey` (health/restart) — label `A1.3-key-v6` |
| `whatsapp-watchdog_baileys-watchdog` | `evolution_api_key_v6_20260808` | `evolution_api_key_v6_20260808` | `EVO_KEY_FILE=...` → `EVO_KEY` → header `apikey` em `/instance/connectionState/wpp2` |

**Não-consumidores verificados:** `evolution-rabbit-consumer_consumer` (monta rabbitmq/pg/webhook/sentry secrets — NÃO monta a API key), `mcp-health-monitor` (consumidor em 06/08 com a v5; **serviço não existe mais** — 404 no inspect).

### Drift repo × runtime

| Arquivo do repo | Declarado | Runtime | Verdict |
|---|---|---|---|
| `infra/evolution/docker-compose.evolution.yml` (linhas 15, 43-44, 80, 175) | source `evolution_api_key_v6_20260808` → target v4 | v6 ✓ | **OK** (comentário da rotação v5→v6 presente) |
| `infra/evolution-api-custom/docker-compose.yml` | idem v6 → target v4 | v6 ✓ | OK (cópia do stack evolution) |
| `infra/supabase/docker-compose.supabase.yml` (linhas 87, 96-97, 556) | source **`evolution_api_key_v5_20260805`** → target v4; `EVOLUTION_API_KEY=$(cat .../v4)` | v6 | 🔴 **DEFASADO (v5)** — redeploy a partir deste arquivo regride o `supabase_functions` para a chave v5 (ou falha se o secret v5 já foi removido) |
| `infra/evolution-api-custom/docker-entrypoint.sh:35` | lê `/run/secrets/evolution_api_key_v4_20260704` | arquivo v4 contém v6 | ⚠️ funcional hoje, mas trava o nome de arquivo v4 — a rotação p/ v7 exige atualizar este caminho |

---

## 3. Consumidores da chave de API (visão completa)

| # | Consumidor | Onde | Chave usada | Mecanismo |
|---|---|---|---|---|
| 1 | **Evolution API server** (`evolution_evolution`) | infra/evolution-api-custom/docker-entrypoint.sh:35 | Swarm v6 (arquivo v4) | `AUTHENTICATION_API_KEY` exportada no entrypoint |
| 2 | **Edge runtime** (`supabase_functions`) | infra/supabase/docker-compose.supabase.yml:87 (runtime = v6) | Swarm v6 | env `EVOLUTION_API_KEY` → EFs chamam a API |
| 3 | **EF `evolution-templates`** | supabase/functions/evolution-templates/index.ts:33-40 | **VAULT `evolution_api_key`** (criado 2026-05-03; descrição: "rotacionada 2026-07-04") | `fn_get_vault_secret('evolution_api_key')` (zapp schema, service_role only — grants OK) |
| 4 | **whatsapp-watchdog_canary** | Spec service (env `EVO_KEY_FILE`) | Swarm v6 | header `apikey` nas chamadas de canário |
| 5 | **whatsapp-watchdog_baileys-watchdog** | Spec service (env `EVO_KEY_FILE`) | Swarm v6 | header `apikey` em `connectionState` |
| 6 | **UI IntegrationsHub (front)** | src/components/integrations/EvolutionApiIntegrationView.tsx:230 | chave digitada pelo usuário (não Swarm) | form → EF `evolution-credentials` → tabela `evolution_instance_credentials`; teste usa EF `evolution-api` (que usa #2) |
| 7 | ~~mcp-health-monitor~~ | — | (v5 em 06/08) | **removido** — não é mais consumidor |

### Vault Supabase (`vault.secrets` ILIKE '%evolution%' — 10 registros)

| name | created_at | key_id | Observação |
|---|---|---|---|
| `evolution_foundation_license_key` | 2026-08-11 | null | license key (não é API key) |
| `evolution_instance_token_wpp2` | 2026-08-11 | null | token de instância (separado) |
| **`evolution_api_key_v2`** | **2026-08-09** | null | "criado via vault.create_secret() em 2026-08-09" — **sem nenhuma referência no repo** (órfão ou consumido fora do repo) |
| `evolution_api_key` | 2026-05-03 | null | usado pela EF evolution-templates — descrição cita rotação 07/04 (v4); **estado do valor desconhecido, precisa validação** |
| `evolution_pg_password` / `webhook_secret_evolution` / `evolution_webhook_secret` / `evolution_postgres_dsn` / `evolution_instance_name` / `evolution_api_url` | 05-07/2026 | null | referência/config, não API key |

> `vault.decrypted_secrets` retornou rows com `key_id=null` — leitura dos NOMES funcionou sem permissão de decrypt; não foi possível comparar o VALOR do vault com o Swarm (de propósito, sem imprimir nada).

---

## 4. Recomendação — rotação futura segura (v6 → v7)

**Ordem obrigatória (nunca o inverso):** criar v7 → migrar TODOS os consumidores → validar → só então remover v6.

1. **Criar** `evolution_api_key_v7_$(date +%Y%m%d)` (36 bytes, `echo -n | docker secret create ... -`).
2. **Migrar consumidores (deploy coordenado em janela única):**
   - `evolution_evolution`: source v7; **atualizar `infra/evolution-api-custom/docker-entrypoint.sh:35`** para ler o novo nome de arquivo (ou manter target v4 e atualizar `AUTHENTICATION_API_KEY_FILE` no compose `infra/evolution/docker-compose.evolution.yml:80`); alinhar também `infra/evolution-api-custom/docker-compose.yml` (cópia espelhada).
   - `supabase_functions`: source v7; **primeiro corrigir o drift** `infra/supabase/docker-compose.supabase.yml` (ainda declara v5!) para v6 → depois v7.
   - `whatsapp-watchdog_canary` e `whatsapp-watchdog_baileys-watchdog`: source v7 (env `EVO_KEY_FILE` aponta para o arquivo — manter nome de arquivo estável ou atualizar env junto).
3. **Vault:** decidir o dono da verdade. A EF `evolution-templates` lê `evolution_api_key` do **vault** (não do Swarm) — rotacionar o Swarm NÃO a afeta. Se a EF continuar no vault, atualizar `evolution_api_key` (e avaliar `evolution_api_key_v2` órfão: usar ou apagar). Ideal de médio prazo: EF passar a usar a env `EVOLUTION_API_KEY` (vinda do Swarm) e aposentar a leitura do vault.
4. **Validar antes de remover v6:** healthcheck do evolution OK; canário/baileys sem 401 (`connectionState` responde com a nova chave); 1 chamada de EF (ex.: `evolution-api` list-instances) OK; sem burst 401 nos watchdogs (ver runbook 401 de 06/08).
5. **Remover v6 apenas após janela de observação** (recomendado ≥ 7 dias ou após 1 ciclo completo de watchdogs). Remover também v5/v4 antigos e o `evolution_api_key` stale do vault se confirmado não-usado.
6. **Nunca:** `docker secret rm` de chave ainda montada por serviço ativo (Swarm bloqueia com 409 se em uso por task ativa — mas o erro não protege contra regressão via stack file defasado).

---

## 5. Pendências de segurança anotadas (fora do escopo desta auditoria)

- 🔴 Drift `infra/supabase/docker-compose.supabase.yml` (v5) — risco de regressão num redeploy.
- 🟠 `evolution_api_key` do vault possivelmente stale (desde 07/04) mas consumida pela EF evolution-templates.
- 🟠 `evolution_api_key_v2` do vault (09/08) sem consumidor identificado no repo — confirmar uso externo (n8n/worker MCP) ou remover.
- ⚪ Histórico git com chaves expostas já documentado em `docs/infra/git-secrets-rotation.md`.
