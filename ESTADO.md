# ESTADO.md — Registro do que esta LIGADO

> Fonte unica de verdade sobre **estado operacional**, nao sobre arquitetura.
> Uma pergunta por componente: **esta ligado? quem chama?**
> Nao adicione secao de arquitetura, plano ou roadmap aqui. Isso morre em `docs/`.

Ultima verificacao: **2026-08-08** | Pendencias: P1 reconciliada, P2 resolvido, P4/P5/P6 abertas | Storage 28 GB -> 19 GB

## Como foi medido

Chamador = invocacao real: `invoke('nome')` ou `functions/v1/nome`.
Mencao em teste, doc ou migration historica **nao** conta como chamador.

Fontes cruzadas nesta verificacao:

| Fonte | Resultado |
|---|---|
| Arquivos do repo escaneados | 2.911 |
| Edge functions encontradas | 107 |
| pg_cron jobs no banco | 162 (apenas `nps-daily-trigger` chama edge fn) |
| Workflows N8N | 254 (138 ativos) — **nenhum** chama edge fn |
| Cloudflare Workers | nao verificado nesta rodada |

## Resumo

| Grupo | Qtd | Acao |
|---|---|---|
| A — chamada pelo front | 72 | manter |
| B — chamada por outra edge fn | 3 | manter |
| C — chamada por cron ativo | 0 | manter |
| D — infra/chamador externo por design | 10 | manter |
| E — VERIFICAR antes de decidir | 4 | investigar |
| F — SEM CHAMADOR identificado | 18 | candidata a arquivar |

**22 de 107 funcoes sem chamador confirmado.**

---

## F — SEM CHAMADOR identificado (candidatas a arquivar)

Nenhum chamador em: front, outra edge function, cron ativo, N8N.
Decisao de arquivar e do responsavel — esta lista e diagnostico, nao sentenca.

| Funcao | Mencoes em teste | Mencoes em doc |
|---|---|---|
| `ai-auto-tag` | 0 | 0 |
| `auto-close-conversations` | 0 | 0 |
| `cleanup-rate-limit-logs` | 0 | 0 |
| `client-observability` | 0 | 0 |
| `contact-media` | 0 | 0 |
| `db-health-monitor` | 0 | 0 |
| `email-health` | 0 | 1 |
| `evolution-bitrix-sync` | 0 | 0 |
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
