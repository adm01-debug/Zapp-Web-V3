# FASE 4 (parte 1) — Reconciliação de artefatos: front image × repo e edge functions on-disk × repo

**Data:** 2026-08-04 (janela de auditoria ~17:34Z–18:12Z)
**Modo:** READ-ONLY (exec apenas para leitura/hashes; sem git; sem escrita além deste arquivo)
**Repo local:** `C:\zapp-web-v3` — branch `main`, HEAD local = `a1d01703d1ce4ff3c8b47c3f07f5d3e78fdc1c45`
**Ferramentas:** Portainer MCP (containers em Swarm, endpoint 1), `sha256sum`/`grep` no disk dos containers e no repo local.

---

## 51) Imagem do front (container `zapp-web-prod_web`) × repo

O serviço `zapp-web-prod_web` é uma task efêmera do Swarm e foi **redeployado DUAS vezes durante a janela de auditoria** (~35 min). Duas observações registradas:

| Observação | Task (container) | Imagem (tag) | Digest | Status | Criado |
|---|---|---|---|---|---|
| T0 (~17:34Z) | `zapp-web-prod_web.1.w52czlqkss94fbzhdfzui7zij` (id `bdf9b0e26f86`) | `ghcr.io/adm01-debug/zapp-web-v3/zapp-web:**production-a1d01703d1ce**` | `sha256:42e35536e65b…` | Up 35 min (healthy) | — |
| T1 (~18:09Z) | `zapp-web-prod_web.1.dcspci16x04o4uqmp5ysdumpp` (id `9f97b1ec2667`) | `ghcr.io/adm01-debug/zapp-web-v3/zapp-web:**production-b58d2575f778**` | `sha256:f6cec90954ba…` | Up ~1 min (healthy, healthcheck ok) | 2026-08-04T18:09:06Z |

**Comparação com SHAs:**
- T0: tag `production-a1d01703d1ce` **== HEAD local do repo** (`a1d01703d1ce4ff3c8b47c3f07f5d3e78fdc1c45`) → imagem exatamente no commit auditado. ✅
- T1 (atual): tag `production-b58d2575f778` **≠ HEAD local** → imagem **À FRENTE** do checkout local (build de commit mais novo, provavelmente `origin/main` não sincronizado no checkout local; não verificável sem git — regra 2).
- Auditoria anterior observou `082e770bd` (imagem antiga) → **prod NÃO está mais stale**; foi redeployado e hoje está em/à frente do HEAD.

**Veredito 51 — prod stale?** ❌ **NÃO** (vs. HEAD local `a1d01703d1ce`; na T0 estava byte-exato). ⚠️ Imagem atual (`b58d2575f778`) não é reproduzível no checkout local — **recomendado `git fetch`** para alinhar a auditoria com o commit efetivamente deployado. Pipeline de deploy está ATIVO (2 builds em ~35 min).

## 52) Env baked no bundle (exec no container web)

Comandos executados em `/usr/share/nginx/html/assets` (nginx oficial, healthcheck `/healthz` ok, IP `10.0.1.253`):

- `grep -rho 'supabase\.atomicabr\.com\.br' … | head -5` → **5 ocorrências exibidas; total = 44 ocorrências** → `SUPABASE_URL` self-hosted (`https://supabase.atomicabr.com.br`) **embutido no bundle**. ✅
- `grep -rho 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9' … | head -3` → **prefixo JWT HS256 presente** (3+ ocorrências) → anon/service key embutida (apenas prefixo inspecionado, conforme regra — valor completo NÃO extraído). ✅

**Veredito 52:** env aponta para o self-hosted; sem resquício de URL Lovable/cloud no assets (nenhuma ocorrência de outro domínio na amostra).

## 53) Nomes de invoke/rpc no bundle (opcional, executado)

`grep -rhoE '\.invoke\("[^"]+'` no bundle → **60 nomes distintos** (head -60), incluindo **5 sub-rotas de evolution-api**: `find-status-messages`, `get-media-base64`, `get-webhook`, `send-chat-presence`, `set-webhook`. Todos os top-level têm função correspondente no disk (ver 55).

`grep -rhoE '\.rpc\("[^"]+'` → 40 nomes distintos na amostra (head -40): `add_contacts_to_campaign`, `contacts_count_by_type`, `fn_increment_meme_use`, `fn_list_audio_memes_for_user`, `fn_log_reconnection_attempt`, `fn_safe_audit_log`, `fn_test_alert_channel`, `fn_toggle_user_meme_favorite`, `get_own_email_accounts`, `get_team_profiles`, `get_visible_agent_ids`, `is_within_business_hours`, `log_audit_event`, `log_security_event`, `reassign_absent_agents`, `reassign_overloaded_agents`, `record_voice_telemetry`, `rpc_dlq_abandon`, `rpc_dlq_bulk_abandon`, `rpc_dlq_list_audit`, `rpc_dlq_log_item_action`, `rpc_dlq_retry_now`, `rpc_dr_health_check`, `rpc_email_archive_thread`, `rpc_email_assign_thread`, `rpc_email_mark_thread_read`, `rpc_email_search_threads`, `rpc_email_star_thread`, `rpc_email_token_status`, `rpc_evolution_fallback_stats`, `rpc_get_active_integration_profile`, `rpc_get_contact`, `rpc_get_contact_summary_batch`, `rpc_get_email_health_summary`, `rpc_get_reactions_batch`, `rpc_get_whatsapp_mode`, `rpc_insert_message`, `rpc_instance_auth_event_summary`, `rpc_instance_auth_event_trend`, `rpc_list_contacts` (+ restante além do head-40). Confronto com objetos do DB fica para a parte 2 da Fase 4 (DB).

## 54) Edge functions on-disk (container `supabase_functions`, edge-runtime v1.74.0) × repo — **P1**

Método: `sha256sum index.ts` (12 chars) em `/home/deno/functions/*/` no container vs `supabase/functions/*/` no repo. **Total: 120 funções deployadas vs 121 no repo (sem `node_modules`) — 115 byte-idênticas.**

| Estado | Função | Hash disk | Hash repo |
|---|---|---|---|
| **STALE** | `ai-suggest-reply` | `d019faf7221a` | `fc37f846257b` |
| **STALE** | `elevenlabs-sts` | `ba2c5ad2a204` | `9473cc8347c4` |
| **STALE** | `elevenlabs-voice` | `2b7cb06054d6` | `6f725cfccb5d` |
| **STALE** | `gmail-token-refresh` | `d210a2e4c435` | `02bbdf8b7f14` |
| **STALE** | `public-api` | `22aa2c63dd32` | `959ea39a290b` |
| **MISSING** | `_test` | — (não deployada) | sem `index.ts` |
| **ORPHAN** | *(nenhuma)* | — | — |

Observações:
- **0 ORPHAN** — nada deployado sem correspondência no repo (higiene boa; auditoria anterior listava prod-only como `analyze-external-db`/`external-db-bridge` e junk `e2e-*` — hoje ausentes do disk ou do repo? não aparecem em nenhum dos lados).
- **1 MISSING**: `_test` — pasta de artefato de teste **sem `index.ts`** (não é função deployável); ausência no disk é o comportamento correto (não é gap de deploy).
- `_shared/` existe nos dois lados (sem `index.ts`); comparação byte-a-byte do `_shared` fica fora do escopo desta etapa (só `index.ts` por função).
- **`evolution-api` está byte-idêntico** (disk = repo = `d1aa75ca5633`, 19.565 B) — determinante para a etapa 56.

## 55) Cobertura: funções invocadas pelo front × disk do container

Fonte: `grep -rhoE "functions\.invoke\(\s*['\"][^'\"]+" src/` no repo (59 entradas) + extração do **bundle deployado** (etapa 53, 60 nomes).

- **55 funções top-level invocadas: TODAS existem no disk** (100% de cobertura). Inclui as 5 STALE — elas existem, apenas com hash divergente (`ai-suggest-reply`, `elevenlabs-voice`, `gmail-token-refresh`, `public-api`; `elevenlabs-sts` não é invocada pelo front).
- Sub-rotas `evolution-api/*` invocadas (bundle deployado): `find-status-messages`, `get-media-base64`, `get-webhook`, `send-chat-presence`, `set-webhook` → **3 com handler no router, 2 SEM** (ver 56).

**Veredito 55:** nenhuma função chamada pelo front está ausente do runtime. ✅ (ressalva: 2 sub-rotas do evolution-api quebram em runtime — abaixo).

## 56) Sub-rotas do `evolution-api` (repo × deployado)

Mecanismo do router (repo `supabase/functions/evolution-api/index.ts` L24-26, 90-91): `action = body.action || último segmento do pathname` (`pathAction`). Os call sites do front **não enviam campo `action`** → a sub-rota do path é a única fonte da action.

| Sub-rota | Handler no repo | Handler no disk (deployado) | Front chama (onde) | Veredito |
|---|---|---|---|---|
| `find-status-messages` | ❌ ausente (0 matches) | ❌ ausente (`grep -c` = 0) | ✅ `whatsappStatusRepository.ts:84` → POST `{instanceName,page,offset}` (usado em `whatsappStatusService.ts:111`) | **QUEBRADO — 404 `Unknown action`** |
| `send-chat-presence` | ❌ ausente (0 matches) | ❌ ausente (`grep -c` = 0) | ✅ `whatsappStatusRepository.ts:91` → POST `{instanceName,number,presence:'paused',delay:0}` (usado em `whatsappStatusService.ts:112` e `useEvolutionApiManagement.ts:552`) | **QUEBRADO — 404 `Unknown action`** |
| `get-webhook` | ✅ L153 → `GET /webhook/find/{instance}` | ✅ mesma linha (arquivo idêntico) | ✅ `useMonitoringManagement.ts:369` (POST `{instanceName}`) | **OK** |
| `set-webhook` | ✅ L152 → `POST /webhook/set/{instance}` | ✅ mesma linha | ✅ `useMonitoringManagement.ts:396` (POST config) | **OK** |
| (bônus) `get-media-base64` | ✅ L156-161 | ✅ | ✅ bundle deployado | **OK** |

Evidência on-disk (exec no `supabase_functions`): `grep -c 'find-status-messages'` = **0**, `grep -c 'send-chat-presence'` = **0**, `get-webhook`/`set-webhook` presentes (L101/152/153), arquivo com 19.565 B (idêntico ao repo).

**Conclusão 56:** `evolution-api` deployado == repo byte-a-byte, e **ambos não implementam `find-status-messages` nem `send-chat-presence`**. As chamadas do front (WhatsApp Status/stories e presença de chat) caem no fallback final do router → **404 `{"error":"Unknown action"}`**. O código do front está *wired* (não é dead code: `whatsappStatusService.ts` L111-112 executa as duas em `Promise.all`). **Redeploy do repo NÃO resolve** — é preciso **adicionar os handlers** ao `evolution-api` do repo (ex.: `find-status-messages` → proxy `/chat/findStatus/{instance}`; `send-chat-presence` → proxy `/chat/sendPresence/{instance}` com `{number, presence, delay}`) e então deployar. Registrar como bug funcional da feature de status, fora da reconciliação A/B/C/D (é drift front↔função presente igual nos dois lados).

---

## Recomendações

1. **Front:** rodar `git fetch`/`git pull` no checkout local para alinhar com `b58d2575f778` (imagem em produção está à frente do HEAD auditado; pipeline de deploy ativo e saudável). Nenhuma ação de redeploy necessária no front.
2. **Edge functions STALE (5):** comparar `git diff` repo-vs-deployado de `ai-suggest-reply`, `elevenlabs-sts`, `elevenlabs-voice`, `gmail-token-refresh`, `public-api` antes de qualquer redeploy — decidir por função se produção (versão standalone/mais nova) ou repo (fix/hardening) vence, seguindo as regras da reconciliação (nunca deploy isolado sem reconciliar `_shared/`; verificar callers e schema antes de declarar B).
3. **`evolution-api`:** adicionar handlers `find-status-messages` + `send-chat-presence` (etapa 56) e deployar junto com o `_shared` correspondente — sem isso a feature de status retorna 404 no self-hosted.
4. **`_test`:** manter fora de deploy (arte-fato de teste, sem `index.ts`); candidata a limpeza no repo (balde D).
5. **Orphan cleanup:** nenhum (0 orphans) — manter.

## Evidências e limitações

- Portainer MCP teve janela de indisponibilidade (~18 s) e o container web é task efêmera do Swarm (redeploy no meio da auditoria) — por isso as duas observações de imagem (T0/T1); ambas registradas.
- Comparação de edge functions limitada a `index.ts` por função (escopo da etapa 54); `_shared/` e arquivos auxiliares não comparados byte-a-byte.
- Regra 2 (sem git) aplicada: `b58d2575f778` não foi verificado contra `origin`; assumido como commit mais novo do mesmo repo.
- Nenhum comando destrutivo executado; nenhuma escrita fora deste arquivo.
