# 🔍 Sessão 5 — Auditoria exaustiva da conexão WPP2 - PRINCIPAL (11) 4637-5517 — 2026-07-04

> **Data:** 2026-07-04 (~10:45–11:10 UTC)
> **Escopo:** conexão `wpp2` na Evolution API (VPS), schema do banco (nativo PG14 +
> espelho `evo`/`zapp` no Supabase self-hosted), configuração e performance.
> **Relatórios anteriores:** sessões 3 e 4 de 2026-07-04 (`EVOLUTION_API_AUDIT_2026-07-04_*`).

---

## 0. Sumário executivo

| Área | Estado |
|---|---|
| 🔴 **Conexão wpp2** | **INCIDENTE ATIVO — instância fantasma.** O telefone (11) 4637-5517 está pareado numa instância criada por engano às 10:29 UTC de hoje, cujo *nome* é o UUID da wpp2 (`d8e07e44-…`). A wpp2 original está morta (`connecting`/401) e **o pipeline do Zapp não recebe nem envia mensagens da linha principal desde 03/07 16:40 UTC**. |
| ✅ Causa-raiz | Encontrada e **corrigida no código** neste PR (3 falhas encadeadas — ver §2). |
| ✅ Mitigação runtime | Aplicada nesta sessão: fantasma agora tem settings + webhook + RabbitMQ idênticos à wpp2 → eventos novos são capturados (partições `_default`) até o conserto definitivo. |
| 🟡 Conserto definitivo | **Requer o celular** (re-scan de QR) — runbook no §4. ~5 min. |
| ✅ Versão Evolution | v2.3.7 (última estável, verificada na sessão 4 de hoje), pinada por digest, container `healthy`, recursos ok. |
| ✅ Banco nativo (PG14 `evolution`) | Íntegro: 57 migrations Prisma aplicadas, 760 MB, autovacuum em dia, 0 índices inválidos, 28 conexões. |
| ✅ Espelho `evo` + `zapp` (PG15 Supabase) | Excelente: cache hit 98,65 %, bloat ~zero, sem seq-scan quente, partições por instância + DEFAULT funcionando. |
| 🟡 Crons | 4 jobs com falhas pontuais em 24 h (3/157, 2/288, 1/105, 1/288) — taxa < 2 %, monitorar. |

---

## 1. Linha do tempo do incidente "instância fantasma"

| Quando (UTC) | Evento | Evidência |
|---|---|---|
| 03/07 16:40 | wpp2 cai com **401 device_removed** (sessão removida no celular). Watchdog v8 corretamente **suprime restart** e pede re-scan. | `Instance.disconnectionReasonCode=401`; log watchdog |
| 04/07 ~01:15–02:00 | Sessão 4 gera QR para a wpp2 e entrega ao usuário; redeploys paralelos invalidam o QR. wpp2 segue `connecting/401`. | `EVOLUTION_API_EXECUCAO_2026-07-04_sessao4.md` §0.1 |
| 04/07 10:29:41 | Fluxo de reconexão do Zapp (usuário adm01 logado) dispara `action: connect` passando **`instance_id` (UUID `d8e07e44-…`) no lugar do `instance_name` (`wpp2`)**. | `zapp.qr_attempts` (connection "WPP2 - Principal", instance_id `d8e07e44-…`, requested_by adm01) |
| 04/07 10:29:42 | Evolution responde 404 ("does not exist") e a edge function `evolution-api` **auto-cria** instância nova com `instanceName = "d8e07e44-…"` e devolve QR. | Instância `f957389a-2cd7-40be-b9b3-a073b494a2e4` criada 10:29:42 com nome = UUID da wpp2 |
| 04/07 ~10:31 | Usuário escaneia o QR → **telefone pareia na fantasma**; history sync completo nos logs (progress 1→100 %). | logs container `evolution` 10:31–10:41 |
| 04/07 10:48 | `connection-health-check` re-aponta `whatsapp_connections."WPP2 - Principal".instance_id` para o id da fantasma e marca `connected`/`ok` → **painel mostra tudo verde**, mas o pipeline (chaveado pelo nome `wpp2`) está cego. | `zapp.whatsapp_connections` |
| 04/07 10:51–10:53 | **Esta sessão:** mitigação aplicada (settings/webhook/RabbitMQ na fantasma) + restart da instância para recarregar config. | §3 |

**Impacto:** mensagens recebidas/enviadas pela linha principal desde 03/07 16:40 não
entram no espelho `evo`/app Zapp (ficam só no celular e, a partir de 10:31, também no
banco nativo sob a fantasma — 5 mensagens até 10:57). **Envio pelo app está quebrado**
(conversas apontam para `wpp2`, que está morta); atendimento só pelo celular.

## 2. Causa-raiz — 3 falhas encadeadas (todas corrigidas neste PR)

1. **Front-end passa UUID onde a API espera nome.** A Evolution roteia TODAS as rotas
   (`/instance/connect/{x}`, `/instance/restart/{x}`, envio) pelo **nome** da instância.
   `whatsapp_connections.instance_id` guarda o **UUID interno**. Pontos que enviavam
   `instance_id` como `instanceName`:
   - `src/components/layout/ConnectionStatusIndicator.tsx` (reconexão manual/em massa do topo do app) ← **gatilho provável do incidente**
   - `src/components/connections/ConnectionCard.tsx` (Reconectar / Verificar agora / Configurações / Integrações)
   - `src/hooks/useEvolutionAutoReconnect.ts` (auto-reconnect via Realtime)
   - `src/components/connections/DegradedQuickActions.tsx` (revalidação)
   - `src/features/connections/hooks/parts/useConnectionsActions.ts` (`deleteInstance`)
   **Fix:** novo helper `src/lib/evolutionInstance.ts` (`evolutionInstanceName()`), usado em
   todos os pontos acima; chamadas são bloqueadas com aviso quando só existe UUID.

2. **Edge function `evolution-api` auto-criava instância em `connect` 404 sem validar o
   nome.** Um nome-UUID virava instância nova ("fábrica de fantasmas" — e o próximo clique
   criaria outra, pois o health-check regrava `instance_id` com o UUID novo).
   **Fix:** guarda server-side em `connect` e `create-instance`: nome com formato UUID
   nunca é criado; em `connect` a função tenta **auto-heal** (resolve o UUID → nome real
   via `fetchInstances` e reconecta a instância certa); sem correspondência, retorna
   `422 INSTANCE_NAME_IS_UUID` com mensagem explicativa.

3. **Semântica ambígua de `instance_id`** no modelo de dados: o webhook faz match por
   nome (`.eq('instance_id', instance)`) enquanto o health-check grava o UUID — o mesmo
   campo com dois significados. O fix imediato é usar sempre `instance_name` nas rotas;
   recomendação de médio prazo no §6.

## 3. Ações executadas nesta sessão (runtime, todas reversíveis)

| # | Ação | Resultado |
|---|---|---|
| 1 | Settings da fantasma espelhando a wpp2 (`rejectCall=true` + msgCall padrão, `readStatus=true`, `readMessages=false`, `syncFullHistory=false`) | ✅ 201 — comportamento de negócio preservado (rejeição de chamadas com mensagem) |
| 2 | Webhook da fantasma = mesmo endpoint/eventos/secret da wpp2 (`…/functions/v1/evolution-webhook`, 15 eventos, byEvents) | ✅ 201 |
| 3 | RabbitMQ da fantasma = mesmos 15 eventos da wpp2 (payload aninhado `{rabbitmq:{…}}`, via node fetch dentro do container — MCP serializa objeto aninhado como string) | ✅ 201 |
| 4 | Restart da instância fantasma para recarregar config em memória (as mensagens 10:54–10:57 não geraram webhook porque a instância rodava com config anterior) | ✅ state `open` pós-restart |

**Efeitos colaterais esperados (aceitos e documentados):** eventos da fantasma entram
nas partições `_default` do espelho (`evo.evolution_messages_default` etc.) e podem
disparar os KPIs `ghost_events`/`rabbitmq_backlog` do `zapp-health-guard` — é visibilidade
honesta até o re-scan; limpar depois (§4 passo 5).

## 4. Runbook do conserto definitivo (~5 min, requer o celular da linha)

1. **No celular** (WhatsApp → Aparelhos conectados): remover o aparelho "Promo Brindes/Chrome"
   ativo (é a sessão da fantasma) — ou via API: `DELETE /instance/logout/d8e07e44-1aac-45a2-a1d9-bebe1deeb355`.
2. Com o **código deste PR deployado** (front + edge function `evolution-api`), abrir
   Conexões no Zapp → "WPP2 - Principal" → **Reconectar** → o QR gerado agora é da
   **wpp2 verdadeira** (o guard impede repetir o erro).
3. Escanear o QR. A wpp2 volta a `open` e o pipeline inteiro (espelho, watchdog,
   RabbitMQ `wpp2.*`, webhook) volta a funcionar sem qualquer outra mudança.
4. **Apagar a fantasma:** `DELETE /instance/delete/d8e07e44-1aac-45a2-a1d9-bebe1deeb355`
   (remove também webhook/rabbitmq/settings criados na mitigação). Purgar filas
   RabbitMQ `d8e07e44-….*` se tiverem acumulado.
5. **Backfill da janela cega:** mensagens 10:31→re-scan estão no PG14 sob a fantasma
   (`Instance.name LIKE 'd8e07e44%'`) e eventos pós-10:53 nas partições `_default` do
   espelho — copiar para as tabelas `_wpp2` via job de reconcile existente
   (`evolution_reconcile_jobs`) ou SQL pontual. Mensagens 03/07 16:40→04/07 10:31
   existem apenas no celular (histórico), parcialmente recuperáveis num sync de histórico.
6. Conferir: `qr_attempts.status`, `whatsapp_connections.instance_id` (voltará ao id da
   wpp2 `d8e07e44-…` via health-check) e chegada de eventos `instance='wpp2'` em
   `zapp.webhook_events_processed`.

## 5. Auditoria de configuração e infraestrutura

### 5.1 Evolution API (stack `evolution`, Swarm)
- **Versão:** v2.3.7 — última estável (verificada na sessão 4 de hoje), **pinada por digest**
  `sha256:6b1956…`; container `healthy`, up desde 01:40 UTC (redeploy da rotação de API key v4).
- **Env:** `DEL_INSTANCE=false` ✅ (fantasma não some sozinha — bom p/ forense),
  `QRCODE_LIMIT=30`, cache Redis (db 8) c/ `CACHE_REDIS_SAVE_INSTANCES=true`, S3→Cloudflare R2
  (mídia+vídeo) ✅, RabbitMQ por instância (global off) ✅, webhook global off ✅ (por instância),
  telemetria off, `LOG_LEVEL=ERROR,WARN`, logpatch LGPD v5.1 ativo, `CONFIG_SESSION_PHONE_VERSION`
  omitido de propósito (negociação automática de versão WA) ✅.
- **Recursos:** limites 2 CPU / 3 GB (reserva 0,5/1 GB); healthcheck HTTP 30 s; update
  `stop-first` c/ rollback — adequado.
- **Settings wpp2 (preservados e replicados na fantasma):** rejectCall ✅ c/ mensagem,
  groupsIgnore=false, alwaysOnline=false, readMessages=false, readStatus=true,
  syncFullHistory=false — coerentes com operação de atendimento.
- ⚠️ Logs em nível WARN ainda imprimem `CACHE:{updateKey…}` e stanzas de notificação
  (ruído, sem dado sensível de conteúdo) — cosmético.

### 5.2 Banco nativo (stack `postgres`, PG 14.22, database `evolution`)
- 57/57 migrations Prisma aplicadas (última 2025-12-16, compatível com a imagem 2025-12-05).
- 760 MB; `Message` 698 MB/179 k linhas (n_dead 729 — saudável), autovacuum em dia,
  **0 índices inválidos**, 28 conexões.
- Instâncias: `wpp2` (connecting/401, 158.139 msgs), `wpp_pink_test` (open, 20.824 msgs),
  fantasma (open, 5 msgs novas até 10:57, 3.335 contatos).
- Tabelas custom de observabilidade (`_baileys_error_events` 70 k, `_swarm_guardian_events`,
  `_audit_*`) presentes e com vacuum ok.

### 5.3 Espelho Supabase (PG 15.8, schemas `evo` 172 tabelas / `zapp` 148 tabelas)
- Banco 1,35 GB, cache hit **98,65 %**, 35 conexões (6 ativas), extensões corretas
  (pg_cron, pg_net, pgmq, pg_trgm, vector…).
- Particionamento por instância (`evolution_messages_wpp2` 32 MB/16,7 k, `…_conversations_wpp2`
  12,2 k) + partições DEFAULT e mensais (`webhook_events_v2_YYYY_MM` até 2027-06) ✅.
- **Bloat ~zero** (única exceção: `evolution_messages_wpp_pink_test` com 120 dead tuples — insignificante).
- **Nenhuma tabela quente com seq-scan dominante** (>10 k seq_scan e >5 k linhas): índices adequados.
- Espelho wpp2 congelado em 03/07 16:40 (consequência do incidente, não defeito do schema).
- Crons: 49 jobs; falhas 24 h: `message_pipeline_stalled_alert` 3/157, `evolution-jid-health-check-5min`
  2/288, `route-failed-webhooks-to-dlq` 1/105, `evolution-pipeline-health-check-bateria10` 1/288 (<2 % — monitorar).

## 6. Recomendações (além deste PR)

1. **Executar o runbook §4** — única pendência para a linha principal voltar 100 %.
2. Migração de dados: renomear/segregar a semântica de `whatsapp_connections.instance_id`
   (UUID Evolution) vs `instance_name` (roteável) e alinhar o handler `logout.instance`
   do webhook que hoje faz `.eq('instance_id', instance)` com o **nome** — funciona por
   coincidência histórica.
3. `connection-health-check`: ao re-apontar `instance_id` por match de número, **alertar**
   quando o nome da instância divergir do `instance_name` cadastrado (teria denunciado a
   fantasma às 10:48).
4. Pendências herdadas da sessão 4 (rotação de senha §1, drift dos stacks de backup PG14,
   aposentar `minio-offsite-mirror`) continuam válidas — exigem sessão supervisionada.
5. Considerar tratar `qr_attempts.status` (ficou `pending` para sempre) — job de expiração.

---

*Sessão 5 executada por auditoria automatizada (Claude Code) em 2026-07-04. Nenhum
segredo (API keys, tokens de instância, senhas) foi incluído neste documento.*
