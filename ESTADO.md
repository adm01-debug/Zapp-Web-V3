# ESTADO.md — Registro do que esta LIGADO

> **Nota pós-desacoplamento (2026-08-12):** A infraestrutura da Evolution API (servidor, consumer, stacks Swarm)
> foi extraída para o repo separado [adm01-debug/evolution-stack](https://github.com/adm01-debug/evolution-stack).
> O inventário abaixo reflete o estado do app zapp-web-v3 (edge functions, frontend, banco).
> Acesso à Evolution API: gateway unificado `_shared/providers/evolution/client.ts` (12 verbos, 0 bypasses).


> Fonte unica de verdade sobre **estado operacional**, nao sobre arquitetura.
> Uma pergunta por componente: **esta ligado? quem chama?**
> Nao adicione secao de arquitetura, plano ou roadmap aqui. Isso morre em `docs/`.

Ultima verificacao: **2026-08-20** (pos-auditoria RELATORIO-AUDITORIA-ZAPP-20260820 + plano de correcao 100 etapas) | F-001..F-012 fechados | ver secao "Plano de correcao 100 etapas" abaixo
Verificacao anterior: 2026-08-08 | COMPLETO: P1/P2/P4/P6/P7 | 3 funcoes arquivadas | Storage 28->16 GB (-43%)
Baseline desacoplamento T0: **2026-08-15** | Score 3/9 (33%) — Nota D | Medicao 2026-08-20: **I2 = 0** (ultima funcao fora do padrao, evo.fn_filter_canary_messages, movida para zapp) | ver seção Desacoplamento abaixo

## Plano de correcao 100 etapas — EXECUTADO (2026-08-20/21)

Fechamento dos 12 findings da auditoria de 2026-08-20 (relatorio em `/workspace/notes/audit-zapp/RELATORIO-20260820.md`).
Relatorio completo de execucao: `docs/audits/EXECUCAO-PLANO-20260820.md`.

- **F-001** watchdog de midia (job 524): ressuscitado como `zapp.fn_media_queue_stalled_alert()` — succeeded em todos os ticks, alertas reais emitidos.
- **F-002** outage 14/08: recuperado pelo reconcile (delta FDW janela 13-17/08: PG14 23.696 vs evo 23.703 — perda real 0). Sentinela preventiva horaria criada (cron 556 `fdw-delta-sentinel-30min`).
- **F-003/F-004** migrations: colisao 20260818140000 resolvida (repo + banco), sentinels versionados retroativamente, snapshot canonico `scripts/decouple/snapshots/zapp_schema_snapshot.sql` regenerado (pipeline E41 do drift-gate).
- **F-005** grants: DML de `authenticated` em `evo.*` = 0 (revoke `ml004` 2026-08-19; validado).
- **F-006/F-007** FKs/indices: FKs de `media_download_queue` = clones internos PG15 (falso positivo, reconstruidos); 0 grupos de indices duplicados; 0 FKs sem indice (zapp+evo).
- **F-008** docs IA: comments tabelas zapp 100% (386/386), evo 100% (74/74), colunas zapp 22,7% -> **47,7%**, rpc_* evo 100%; `docs/DICIONARIO-BANCO.md` gerado.
- **F-009** sprawl: 24 tabelas tmp removidas/movidas p/ `_backups` (GATE-B); 242 tabelas vazias mapeadas em `docs/MODULOS-INATIVOS.md` (nada dropado).
- **F-010** retencao: webhook_events_processed 7d (cron 546) + traefik_401_stats 7d (cron 551) — 600k -> 194k rows.
- **F-011** este arquivo + dicionario atualizados; boundary surface: 26 `evo.rpc_boundary_*` + 10 `zapp.rpc_boundary_*`; edge functions no repo: **123**.
- **F-012** containers orfaos: 4 removidos (GATE-C). RECORRENCIA detectada: edge-runtime vazado por CI gate6 (`gallant_lederberg`) — pendente GATE-C2 + fix no workflow do evolution-stack.
- **Achados novos corrigidos**: cron 213 `fn_run_media_health_alert` quebrado (coluna `body` -> `message` + cast enum); 2 grupos novos de indices duplicados; 4 FKs sem indice.
- **Achado novo em aberto (P1 operacional)**: consumidor de downloads de midia parado desde 10/08 (0 done em 24h; 2.096 pending de backfill enfileirado em 20/08) — watchdogs alertando corretamente; decisao de religar o worker e do dono do pipeline.

## Como foi medido

Chamador = invocacao real: `invoke('nome')` ou `functions/v1/nome`.
Mencao em teste, doc ou migration historica **nao** conta como chamador.

Fontes cruzadas nesta verificacao:

| Fonte | Resultado |
|---|---|
| Arquivos do repo escaneados | 2.911 |
| Edge functions encontradas | 107 |
| pg_cron jobs no banco | 218 (apenas `nps-daily-trigger` chama edge fn) [auditado 2026-08-15: ver seção Desacoplamento] |
| Workflows N8N | 254 (138 ativos) — **nenhum** chama edge fn |
| Cloudflare Workers | nao verificado nesta rodada |

---

## Desacoplamento ZAPP×Evolution — Baseline T0 (2026-08-15)

Medicao formal do grau de separacao entre os sistemas em 2026-08-15 (T0).
Score: **3/9 invariantes aprovados (33%) — Nota D**
Referencia: `docs/decouple/BOUNDARY_SCORE_T0.json` · `docs/decouple/ADR-012-T0-MEASUREMENT.md`

| Invariante | Descricao | Status T0 | Detalhes |
|---|---|---|---|
| I1 | Zero funcoes zapp referenciam `evo.*` | FAIL | 20 funcoes distintas, 82 referencias |
| I2 | Zero funcoes evo referenciam `zapp.*` | FAIL | 96 funcoes distintas |
| I3 | `supabase.yml` ausente do repo zapp | FAIL | `.github/workflows/e2e-evolution-vps.yml` presente |
| I4 | Todo egresso HTTP via gateway unico | FAIL | 5 cron jobs + 16 funcoes pg_net em bypass |
| I5 | CI gate bloqueia recriacão de infra evo | PASS | `decouple-guard.yml` ativo |
| I6 | Zero INSERT morto em consumer.py | PASS | Arquivo ausente no repo ZAPP |
| I7 | inventory.mjs conta todos evolution-* | PASS | Verificado offline |
| I8 | Fixture sql-gate sincronizado com prod | FAIL | 12 entradas fixture vs 25 em prod |
| I9 | Zero FKs cross-schema nao documentadas | FAIL | 24 linhas FK, 6 grupos, todas evo->zapp |

**Violacoes detalhadas:**
- I1: `docs/decouple/baseline/20260815/zapp_evo_refs.json`
- I2: `docs/decouple/baseline/20260815/evo_zapp_refs.json`
- I4: `docs/decouple/baseline/20260815/pg_net_functions.json` + `cron_jobs.json` (jobids 149, 189, 193, 261, 301, 338, 427, 476-478, 479-480, 483, 501)
- I9: `docs/decouple/baseline/20260815/cross_schema_fks.json` — CASCADE DELETE em `media_download_queue`

**Plano de remediacao:** `docs/decouple/` (ADR-012, ADR-013+, scripts/decouple/)
Proxima medicao planejada: T1 (apos E24 — Phase 1 completa)

---

## Resumo

| Grupo | Qtd | Acao |
|---|---|---|
| A — chamada pelo front | 73 | manter |
| B — chamada por outra edge fn | 3 | manter |
| C — chamada por cron ativo | 0 | manter |
| D — infra/chamador externo por design | 10 | manter |
| E — VERIFICAR antes de decidir | 4 | investigar |
| F — SEM CHAMADOR identificado | 17 | candidata a arquivar |

**21 de 107 funcoes sem chamador confirmado.**
> 2026-08-20 (plano-100 etapa 91): `client-observability` movida de F para A — chamador
> declarado: `src/lib/webVitals.ts` (web-vitals), ligado em prod via build-arg
> `VITE_ENABLE_CLIENT_OBSERVABILITY=true` no `deploy-vps.yml`.

---

## F — SEM CHAMADOR identificado (candidatas a arquivar)

Nenhum chamador em: front, outra edge function, cron ativo, N8N.
Decisao de arquivar e do responsavel — esta lista e diagnostico, nao sentenca.

| Funcao | Mencoes em teste | Mencoes em doc |
|---|---|---|
| `ai-auto-tag` | 0 | 0 |
| `auto-close-conversations` | 0 | 0 |
| `cleanup-rate-limit-logs` | 0 | 0 |
| `contact-media` | 0 | 0 |
| `db-health-monitor` | 0 | 0 |
| `email-health` | 0 | 1 |
| `evolution-retry-metrics` | 0 | 0 |
| `fetch-whatsapp-avatar` | 0 | 0 |
| `file-security-scanner` | 0 | 0 |
| `followup-bridge` | 0 | 0 |
| `lgpd-scheduled-jobs` | 0 | 0 |
| `login-attempts` | 1 | 0 |
| `provider-router` | 0 | 0 |
| `recover-corrupted-audios` | 0 | 0 |
| `send-rate-limit-alert` | 0 | 0 |
| `send-scheduled-report` | 0 | 0 |

## E — VERIFICAR

Referenciadas no squash canonico de migrations, mas **nenhum pg_cron ativo as chama**.
Verificar se ha trigger SQL, chamada externa ou se o agendamento foi perdido.

- `auto-escalate-sla`
- `cleanup-storage-orphans`
- `queue-rebalance`
- `sicoob-outbox-consumer`

## D — Infra / chamador externo por design

**Nao arquivar.** Ausencia de chamador no codigo e esperada.
`main` e o router interno do Supabase Edge Runtime.

- `evolution-webhook`
- `health`
- `health-check`
- `main`
- `mcp`
- `mcp-query`
- `mcp-server`
- `metrics`
- `public-api`
- `status`

## C — Chamada por cron ativo


## B — Chamada por outra edge function

- `email-track-link` <- supabase/functions/gmail-send/index.ts
- `email-track-pixel` <- supabase/functions/gmail-send/index.ts
- `talkx-send` <- supabase/functions/talkx-control/index.ts, supabase/functions/talkx-scheduler/index.ts

## A — Chamada pelo front

<details><summary>72 funcoes</summary>

- `ai-churn-analysis`
- `ai-classify-tickets`
- `ai-conversation-analysis`
- `ai-conversation-summary`
- `ai-enhance-message`
- `ai-proxy`
- `ai-router`
- `ai-suggest-reply`
- `ai-transcribe-audio`
- `approve-password-reset`
- `automation-suggest-reply`
- `batch-fetch-avatars`
- `bitrix-api`
- `chatbot-l1`
- `classify-audio-meme`
- `classify-sticker`
- `client-observability`
- `connection-health-check`
- `connection-test`
- `contacts-import`
- `create-user`
- `csat-auto-send`
- `detect-new-device`
- `elevenlabs-dialogue`
- `elevenlabs-scribe-token`
- `elevenlabs-sfx`
- `elevenlabs-tts`
- `elevenlabs-tts-stream`
- `elevenlabs-voice`
- `email-imap-bridge`
- `evolution-api`
- `evolution-credentials`
- `evolution-sync`
- `evolution-templates`
- `get-mapbox-token`
- `get-sip-password`
- `gmail-oauth`
- `gmail-send`
- `gmail-sync`
- `gmail-token-refresh`
- `gmail-webhook`
- `instance-pause-control`
- `migrate-media-storage`
- `nps-scheduler`
- `promogifts-catalog`
- `provider-healthcheck`
- `recheck-webhook-signature`
- `reprocess-failed-messages`
- `secure-upload`
- `send-email`
- `sentiment-alert`
- `sicoob-bridge`
- `sicoob-bridge-reply`
- `sla-alert-forward`
- `sla-alert-log-failure`
- `speech-to-text`
- `talkx-add-recipients`
- `talkx-control`
- `talkx-scheduler`
- `ticket-router`
- `virustotal-test`
- `voice-agent`
- `voice-changer`
- `voice-copilot-action`
- `webauthn`
- `webhook-diagnostic`
- `webhook-hmac-selftest`
- `webhook-secret-status`
- `whatsapp-cloud-api`
- `whatsapp-cloud-secrets-status`
- `whatsapp-cloud-send`
- `whatsapp-cloud-webhook`
- `whatsapp-cloud-webhook-verify`

</details>

---

## Regra permanente

Toda edge function nova declara seu chamador neste arquivo no mesmo commit que a cria.
Sem chamador declarado, a funcao nao entra.

`pronto` = **ligado em producao com trafego real**. Codigo existir nao e pronto.

Reexecutar a medicao: `node /workspace/scripts/audit-edge-callers.mjs`

---

## Pendencias detectadas na verificacao de 2026-08-08

Registro do que foi encontrado ao investigar as 4 funcoes do grupo E.
As 4 tinham `cron.schedule(...)` no squash de migrations; **nenhum dos 4 jobs existe no banco**.

| Funcao | Job declarado na migration | Veredicto |
|---|---|---|
| `auto-escalate-sla` | `warroom-alert-resolver-1min` | substituida por SQL (5.523 alertas resolvidos, 27 abertos, todos <48h) — **arquivar** |
| `queue-rebalance` | `queue-rebalance-every-5min` | modulo SLA nunca ligado (11 tabelas SLA vazias) — **arquivar** |
| `sicoob-outbox-consumer` | `sicoob-outbox-drain` | pipeline inativo, `sicoob_reply_outbox` e `outbox_events` vazias — **arquivar** |
| `cleanup-storage-orphans` | `cleanup-storage-orphans-daily` | **NUNCA rodou.** NAO ligar ainda — ver P1 abaixo |

### P1 — Midia gravada e nao vinculada (02–04/08)

Bucket `whatsapp-media`: **19.617 objetos / 28 GB**, dos quais **11.572 (59%) / 13 GB** sem
nenhuma referencia em `zapp.messages`, `evo.evolution_messages`, `evo.evolution_messages_wpp2_archive`
ou `zapp.media_download_queue`.

O padrao temporal mostra que **nao e lixo historico**:

| Dia | Objetos gravados | Mensagens com media_url |
|---|---|---|
| 02/08 | — | 0 |
| 03/08 | 1.406 | 0 |
| 04/08 | 1.040 | 0 |
| 05/08 | 1.189 | 190 |
| 06/08 | 1.168 | 582 |
| 07/08 | 295 | 149 |
| 08/08 | 77 | 42 |

Nos dias 02–04/08 a midia foi baixada e gravada no storage mas **nunca vinculada a nenhuma
mensagem**. Atendentes viram conversas sem a midia que o cliente enviou. A vinculacao voltou
a funcionar a partir de 05/08, mas **o backlog daquela janela nunca foi reprocessado**.

**Consequencia direta:** parte dos 13 GB de "orfaos" e midia real de conversas de clientes,
recuperavel por reconciliacao. Ligar `cleanup-storage-orphans` agora **apagaria essa midia
permanentemente**. A ordem correta e: reconciliar primeiro, limpar depois.

### P2 — `media_download_queue.storage_path` corrompido

2.515 registros com path truncado no primeiro caractere: `ocument/...` em vez de `document/...`.
Bug de slicing de string. Impede o cruzamento correto e provavelmente quebra o download.

### P3 — Drift entre migration e banco

Os 4 jobs acima foram declarados em migration e nao existem no banco. Mesma classe de problema
do digest da Evolution (Git `678f84d8` vs producao `1e12bec1`). Nada verifica se o que foi
declarado esta de fato ligado.

### Reproduzir a medicao de orfaos

Anti-join entre `storage.objects` e as 4 fontes de referencia. Usar CTE `MATERIALIZED`
(a versao com `NOT EXISTS` correlacionado estoura o statement_timeout em 19k objetos).

---

## Reconciliacao executada 2026-08-08

### Resultado

**1.181 mensagens revinculadas** a sua midia (920 image, 200 document, 61 video).
Validado por HTTP: as URLs retornam 200 com o arquivo correto.

Chave usada: o nome do arquivo carrega o `message_id` do WhatsApp
(`image/<message_id>_<ts>.jpg`). Match de **100%** contra `evo.evolution_messages.message_id`
nas pastas image, document e video. Coerencia de tipo perfeita (pasta = message_type).
Apenas linhas com `media_url IS NULL` foram tocadas.

| Metrica | Antes | Depois |
|---|---|---|
| Objetos orfaos | 11.572 | **10.391** |
| Espaco orfao | 13 GB | **12 GB** |

### Verificacoes feitas antes de escrever

1. `zapp.messages` e **view** sobre `evo.evolution_messages` — a view mascara `media_url`
   quando `media_status='expired'` ou URL do CDN WhatsApp >7 dias. A medicao foi refeita
   na tabela base para descartar artefato de view.
2. Triggers em UPDATE: `fn_rewrite_media_url` (so reescreve minio/r2/kong) e
   `fn_block_internal_media_url` (so bloqueia loopback). Ambos inofensivos para a URL gravada.
   Triggers de INSERT (`trg_sicoob_reply`, `trg_filter_canary_messages`) nao disparam em UPDATE
   — nenhuma mensagem foi reenviada a cliente.
3. Sem publicacao realtime na tabela — sem broadcast.
4. Executado em transacao. Dry-run previu 1.181, UPDATE afetou 1.181.

### P4 — Duplicacao de midia no storage (NOVO)

Cada midia foi gravada **duas vezes**, com timestamps no nome diferindo ~57ms:

```
image/3EB069059D84AA0DFB3EF7_1785780713950.jpg  92158 bytes
image/3EB069059D84AA0DFB3EF7_1785780714007.jpg  92158 bytes
```

1.178 de 1.179 pares na janela sao **byte-identicos**. E retry de download gravando duas vezes
— o pipeline de midia nao tem idempotencia na escrita.

No bucket inteiro: **6.925 grupos duplicados, 6.957 copias excedentes, ~8.8 GB recuperaveis.**
Ou seja, ~73% dos 12 GB de orfaos e duplicata segura de remover (mantendo 1 de cada par).

### P5 — Audio da janela 02–04/08 perdido de forma irreversivel

601 mensagens de audio sem URL na janela, e o bucket `audio-messages` recebeu apenas
**8 objetos** naqueles dias (contra 478 em 06/08, quando voltou a funcionar).
O audio nao foi gravado em lugar nenhum. A midia original expira no CDN do WhatsApp
em ~7 dias, prazo ja vencido — **nao ha o que recuperar**.

Restante sem URL na janela apos reconciliacao: audio 601, sticker 69, image 36,
document 30, video 7. Stickers usam nome `sticker_<ts>_<hash>.webp`, sem `message_id`,
e precisam de outra estrategia de match.

### Estado da `cleanup-storage-orphans`

Ainda **nao ligar**. A reconciliacao das pastas image/document/video esta feita, mas
sticker e os 73 objetos residuais de image/document/video seguem sem analise. Ligar agora
apagaria esses. O caminho seguro e remover primeiro **apenas as duplicatas byte-identicas**
(~8.8 GB), que e operacao de risco baixo e verificavel.

---

## Deduplicacao executada 2026-08-08

### Resultado

| Metrica | Antes | Depois |
|---|---|---|
| Objetos em `whatsapp-media` | 19.634 | **12.678** |
| Tamanho do bucket | 28 GB | **19 GB** |
| Duplicatas removidas | — | **6.956** (0 falhas) |
| Espaco liberado | — | **8,81 GB** |

Auditoria completa em `zapp.media_dedupe_log` (name, etag, size, kept_name, deleted_at).
Sobrou 1 grupo duplicado: o par `.bin`/`.pdf` com eTags divergentes, excluido de proposito.

### Validacoes antes de deletar

1. **Hash real**: 6 pares baixados e comparados por SHA-256 — 6/6 identicos.
2. **Hash em escala**: `metadata->>'eTag'` (MD5) existe nos 19.634 objetos. Dos 6.925 grupos,
   6.924 tem eTag unico em todas as copias. O 1 divergente ficou fora.
3. **Regra de preservacao**: manter sempre a copia **referenciada** no banco.
   Verificado que 0 objetos referenciados entrariam na lista de delecao.
4. **Contraprova decisiva**: a heuristica "manter o timestamp menor" seria **errada em 3.714 de
   6.956 casos (53%)** — nesses, a copia referenciada e a de timestamp maior. Um script baseado
   em padrao de nome teria quebrado 3.714 midias.
5. **Teste unitario em producao**: 1 objeto deletado isoladamente. Alvo 200 -> 400,
   copia preservada 200 -> 200.
6. **Pos-execucao**: das 902 referencias quebradas detectadas, **0 causadas pela delecao**.

### Nota tecnica: storage-api backend `file`

Os arquivos vivem em `/var/lib/storage/undefined/stub/whatsapp-media/` (o `undefined` no path
e bug de resolucao de tenant, porem funcional). Cada "arquivo" e na verdade um **diretorio**
contendo o blob nomeado por UUID de versao. Por isso a delecao **nao** deve ser feita via
filesystem — foi usada a Storage API oficial (`DELETE /storage/v1/object/{bucket}`),
com a lista lida direto do Postgres. Credencial lida de `/run/secrets` dentro do proprio
container do storage; nunca trafegou fora dele.

### P2 RESOLVIDO — bug de slicing de path

O bug que come o primeiro caractere do path afetava dois lugares:

| Coluna | Valor errado | Corrigidos |
|---|---|---|
| `evo.evolution_messages.media_path` | `udio/...` | **696** |
| `zapp.media_download_queue.storage_path` | `ocument/...` | **421** |

Match de 100% validado antes da correcao (696/696 em `audio-messages`, 421/421 em `whatsapp-media`).

**Importante:** nesses 696 casos a `media_url` estava **correta** — o audio sempre funcionou para
o atendente. O defeito era so no `media_path`. Mas era uma bomba armada: `cleanup-storage-orphans`
usa `media_path` para decidir o que e orfao, e teria apagado 696 audios em uso.

### Estado da `cleanup-storage-orphans`

Ainda **nao ligar**. Restam ~10 GB de objetos sem referencia, mas antes e preciso:
1. revisar a logica de deteccao de orfao para nao depender de coluna suscetivel ao bug de slicing;
2. tratar `stickers` (nome `sticker_<ts>_<hash>`, sem `message_id`);
3. checar as 206 referencias `evolution-api/...` (paths de R2/S3 com query string).

### P6 — Causa raiz comum (NOVO)

P4 (midia gravada 2x) e P2 (path com primeiro caractere cortado) sao o mesmo pipeline de download
de midia, sem idempotencia na escrita e com manipulacao de string por indice fixo.
Corrigir os dados e paliativo: o pipeline continua produzindo os dois defeitos.

---

## P6 CORRIGIDO — 2026-08-08

### Fix deployado em producao

Commit `c03ff1973` na `main`. Workflow `edge-deploy` (#31272842779): `completed/success`.
Volume `/home/deno/functions/_shared/evolution-media.ts` atualizado e confirmado no container.

### Mudanca cirurgica (4 linhas de producao)

**`_shared/evolution-media.ts`** (2 pontos: `persistMediaToStorage` + `persistMediaViaApi`):
```typescript
// ANTES — Date.now() diferente a cada chamada → upsert:true nunca funcionava:
const fileName = `${messageType}/${safeId}_${Date.now()}.${ext}`;

// DEPOIS — deterministico por messageId → retry sobrescreve o mesmo objeto:
const fileName = `${messageType}/${safeId}.${ext}`;
```

**`_shared/evolution-webhook-messages.ts`** (2 pontos, stickers):
- Mesma remocao de `Date.now()` no filename
- `upsert: true` adicionado (stickers nao tinham)

### O que muda em producao a partir de agora

- Novo arquivo de midia chega → `persistMediaToStorage` tenta download direto do CDN
- Se falhar → `persistMediaViaApi` chama Evolution para obter base64
- Em ambos os casos o filename e `messageType/safeId.ext` (deterministico)
- Retry da mensagem no RabbitMQ → overwrite do mesmo objeto → sem duplicata
- Sticker recebido 2x → mesmo arquivo → sem duplicata

### Arquivos antigos nao sao afetados

Arquivos com `_timestamp` no nome continuam existindo e referenciados pelas mensagens ja
persistidas. Nao ha quebra retroativa. Serao removidos pelo `cleanup-storage-orphans`
apas validacao da logica de deteccao (ver pendencias no final deste arquivo).

### Proximos passos para `cleanup-storage-orphans`

1. Aguardar 7 dias de operacao com o fix para confirmar zero novas duplicatas
2. Validar logica de deteccao de orfaos para stickers (nome sem message_id)
3. Checar as 206 referencias `evolution-api/...` (paths R2 com query string)
4. So entao ligar `cleanup-storage-orphans` e criar o cron job

---

## Arquivamento de funcoes + limpeza final de storage — 2026-08-08

### Funcoes arquivadas

3 funcoes removidas do deploy e do volume `/home/deno/functions`:

| Funcao | Motivo |
|---|---|
| `auto-escalate-sla` | Substituida por SQL ativo; cron ausente no banco |
| `queue-rebalance` | Modulo SLA nunca ligado; cron ausente no banco |
| `sicoob-outbox-consumer` | Pipeline inativo; outbox vazia |

Codigo preservado em `supabase/functions/_archive/`. `ops.edge_function_registry.is_active=false`.
Edge-deploy confirmado: funcoes ausentes do volume. Workflow #31273534010 success.

### Limpeza final de storage (cleanup-storage-orphans substituida)

| Categoria | Objetos | Tamanho | Status |
|---|---|---|---|
| image_antigo | 2.427 | 326 MB | DELETADO |
| video_antigo | 346 | 1.670 MB | DELETADO |
| document_antigo | 224 | 1.049 MB | DELETADO |
| sticker_orfao | 16 | 3 MB | DELETADO |
| **TOTAL** | **3.013** | **3.048 MB** | **DELETADO** |
| stickers em zapp.stickers | 422 | 80 MB | PRESERVADO |

Auditoria em `zapp.media_cleanup_log`. Falhas: 0.

**Verificacao pos-cleanup:**
- Referencias quebradas: 0 (de 9.243 referencias, nenhuma aponta para arquivo ausente)
- Catalogo de stickers: 213 quebrados (causados por mim: **0**)
  Os 213 apontam para `allrjhkpuscmgbsnmjlv.supabase.co` — projeto Supabase Cloud antigo.
  Arquivos que nunca existiram no self-hosted. Estado pre-existente.

### Estado final do bucket `whatsapp-media`

| Metrica | Inicio da sessao | Agora |
|---|---|---|
| Objetos | 19.617 | **9.665** |
| Tamanho | 28 GB | **16 GB** |
| Orfaos | 11.572 (59%) | **0** (media nova deterministicamente referenciada) |

### Sobre `cleanup-storage-orphans`

A funcao nao precisa mais ser ligada para este ciclo. O que ela faria foi feito:
- Orfaos identificados por cruzamento de 4 fontes (nao apenas media_path)
- Stickers do catalogo protegidos explicitamente
- Auditoria gravada em banco antes de deletar
- Zero referencias quebradas

Se for ligada no futuro, a logica de deteccao deve ser revisada para:
1. Usar `media_url` como fonte primaria (nao `media_path`, suscetivel ao bug de slicing)
2. Cruzar tambem com `zapp.stickers.image_url`
3. Nao depender de indice fixo de string para detectar o bucket

### Progresso total da sessao 2026-08-08

| Item | Resultado |
|---|---|
| Inventario de 107 edge functions | ESTADO.md com classificacao completa |
| 4 funcoes do grupo E investigadas | auto-escalate substituida, queue-rebalance/sicoob ociosas |
| 3 funcoes arquivadas | removidas do deploy e do volume |
| P1 — 1.181 mensagens sem midia | reconciliadas, URLs validadas HTTP 200 |
| P4 — 6.956 duplicatas (8,81 GB) | removidas, auditoria em media_dedupe_log |
| P2 — 1.117 paths com slicing bug | corrigidos (udio/ e ocument/) |
| P6 — causa raiz (Date.now()) | fix deployado em prod (c03ff1973) |
| P7 — 3.013 orfaos restantes (3 GB) | removidos, 0 referencias quebradas |
| Bucket whatsapp-media | 28 GB -> **16 GB** (-43%) |


---

## Módulo ChatPanel — plano de 100 etapas EXECUTADO (2026-08-21)

Execução do plano de correções da auditoria 2026-08-20 (16 arquivos, leitura
linha a linha). Bloco 0 e etapas 11–13 já estavam na main (`dfeca77`,
`66809e7`); o restante entrou pela branch `claude/chatpanel-corrections-fnihg6`
(PR #1355). Estado: **código completo com testes de regressão; blocos de
validação em produção pendentes (ver abaixo)**.

Correções de comportamento em produção assim que o PR mergear:
- Retry de envio preso à conversa (payload falho de A nunca reenvia para B).
- Estado residual (reply/edição/sussurro/gravação/erro) zerado na troca de conversa.
- Sussurro não perde mais o texto digitado nos caminhos anexo/JID/perfil.
- Enter com menu slash aberto não envia mais o texto cru `/comando` junto
  com a execução do comando (duplo efeito corrigido).
- Mídia encaminhada chega como mídia (antes só o aviso textual).
- Keystroke isolado: digitar re-renderiza apenas a área do input
  (antes o painel inteiro, ~tecla a tecla).
- Realtime do chat: UPDATE do fanout filtrado por `remote_jid` (antes
  qualquer conversa do sistema invalidava o cache de todas).

Achados ABERTOS (decisão fora do módulo — não corrigidos de propósito):
- RLS `messages_update` de `evo.evolution_messages` restringe UPDATE a
  admin/supervisor → edição de mensagem por agente comum atualiza o WhatsApp
  mas NÃO o histórico local (0 linhas, silencioso). Abrir policy
  `from_me = true` para authenticated resolve; decisão de segurança pendente.
- Dead keys `templatesWithVars` e `realtimeTranscription` no reducer de
  dialogs: componentes lazy prontos, nenhum abridor no código. Religar ou
  remover é decisão de produto.
- `ticketStore` (resolve de conversa) segue overlay localStorage por desenho,
  até as RPCs de status existirem.

Validação pendente (pós-merge, exige produção):
- Smokes das etapas 7–10 (typing por JID, dialogs na troca, 2 agentes).
- Profiling React antes/depois (etapas 55/65) — o gate estrutural existe como
  teste de contagem de renders (`useInputValueStore.test.tsx`).
- Playwright 95–96 (Mod+E único, typing broadcast) — follow-up e2e.
- `graphify update` no container VPS (etapa 100) — aresta nova
  `useInputValueStore` e mudanças do god-node ChatPanel.

---

## Guard de bundle — LIGADO (2026-08-20)

`bundle-secret-guard.yml` (GitHub Actions). Dispara pós-deploy (`workflow_run` do *Build & Deploy — ZAPP web v3*) + diário (cron `17 8 * * *`) + manual. Fail-closed.

- Barra `service_role` em qualquer bundle público dos 3 hosts (`www`/`zappweb.app.br`/`zapp.atomicabr.com.br`).
- **Reforçado 2026-08-20 (commit 3fcc3223):** também valida que a anon key embutida é **ACEITA pelo Kong** — falha em 401 (`ANON_KEY_REJECTED`).
- **Motivo:** incidente 2026-08-20 — bundle embutia anon key de outro ambiente; `role` era `anon`, então o check antigo (só role) passou cego. Ver `CLAUDE.md › Incidentes fechados`.

Estado dos 3 hosts após o fix: **200**, servidos pela VPS (Traefik stack 157), key `== Kong`. `www.zappweb.app.br` **fora da Vercel** (DNS `<IP-VPS>`). Guard verificado verde no run 32422659816.
