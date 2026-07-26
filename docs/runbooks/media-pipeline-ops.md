# Runbook: Pipeline de Mídia WhatsApp — Operação e Troubleshooting

**Última atualização:** 2026-07-26  
**Responsável:** Dev Sênior / Ops  
**Versão:** 2.0 (pós-correção completa)

---

## 1. Arquitetura do Pipeline (versão atual)

```
[WhatsApp] → [Evolution API] → [Webhook] → [Trigger: fn_rewrite_media_url]
                                                      ↓
                                         [Supabase Storage: bucket whatsapp-media (PUBLIC)]
                                                      ↓
                              [evo.evolution_messages_wpp2.media_url] (URL pública HTTPS)
                                                      ↓
                                         [Browser: <img src="..."> direto]
                                         (ZERO signed URL, ZERO POST extra)
```

Para mídias recebidas via webhook com `media_key` (criptografadas):
```
[Webhook] → [fn_auto_enqueue_media_download] → [zapp.media_download_queue]
                                                        ↓
                                          [Worker n8n: Evolution.getBase64]
                                                        ↓
                                   [Supabase Storage: upload + media_url atualizado]
```

---

## 2. Healthcheck Rápido

```sql
-- Rodar para verificar o estado do sistema (responde em <1s)
SELECT * FROM zapp.fn_media_pipeline_health_report() ORDER BY alert DESC, metric;
```

**Resultado esperado em produção normal:**
- Todos os `status` = 'ok' ou 'warning'
- `alert` = false em todos
- `kong_urls_*` = 0 (SEMPRE)
- `bucket_whatsapp_media_public` = 1 (SEMPRE)

---

## 3. Problemas Conhecidos e Soluções

### 3.1 URLs `kong:8000` voltaram a aparecer

**Sintoma:** `GET https://kong:8000/storage/... net::ERR_NAME_NOT_RESOLVED` no console  
**Diagnóstico:** `SELECT count(*) FROM evo.evolution_messages_wpp2 WHERE media_url LIKE '%kong%'`

**Causa:** Algum novo fluxo (n8n workflow, Edge Function) está gerando URLs com o hostname interno do Docker.

**Solução imediata (banco):**
```sql
-- Corrigir todas de uma vez
UPDATE evo.evolution_messages_wpp2 
SET media_url = replace(media_url, 'http://kong:8000', 'https://supabase.atomicabr.com.br')
WHERE media_url LIKE '%kong%';

UPDATE evo.evolution_media
SET storage_url = replace(storage_url, 'http://kong:8000', 'https://supabase.atomicabr.com.br')
WHERE storage_url LIKE '%kong%';

UPDATE evo.evolution_contacts
SET profile_picture_url = replace(profile_picture_url, 'http://kong:8000', 'https://supabase.atomicabr.com.br')
WHERE profile_picture_url LIKE '%kong%';
```

**Solução definitiva:** Identificar o fluxo que gera a URL e corrigir para usar `SUPABASE_PUBLIC_URL` em vez de `SUPABASE_URL`.

**Prevenção:** O trigger `trg_block_kong_url` + `evo.fn_block_internal_media_url` já bloqueiam novas inserções com hosts internos. Se a URL veio via `UPDATE` em coluna não monitorada, adicionar a coluna ao trigger.

---

### 3.2 Fila de mídia acumulando (worker parado)

**Sintoma:** `media_queue_stuck_pending > 0` no healthcheck  
**Diagnóstico:**
```sql
SELECT status, count(*), min(created_at), max(created_at) 
FROM zapp.media_download_queue 
GROUP BY status;
```

**Passos:**
1. Verificar o workflow n8n responsável pelo consumo da fila
2. Checar logs do n8n para erros de Evolution API
3. Se a Evolution API estiver fora: aguardar e re-processar manualmente
4. Para marcar jobs travados como retry:
```sql
UPDATE zapp.media_download_queue
SET status = 'retry', next_retry_at = now(), retry_count = retry_count + 1
WHERE status = 'pending' 
  AND created_at < now() - interval '4 hours'
  AND retry_count < max_retries;
```

---

### 3.3 Bucket `whatsapp-media` ficou privado

**Sintoma:** 403 ao tentar acessar `https://supabase.atomicabr.com.br/storage/v1/object/public/whatsapp-media/...`  
**Diagnóstico:** `SELECT public FROM storage.buckets WHERE name='whatsapp-media'`

**Solução:**
```sql
UPDATE storage.buckets SET public = true WHERE name = 'whatsapp-media';
```
**Referência:** ADR-002 — O bucket deve ser sempre público.

---

### 3.4 `[RealtimeContacts] Payload sem remote_jid` no console

**Sintoma:** Log persistindo após o fix  
**Diagnóstico:** Verificar se o arquivo `useRealtimeContacts.ts` está na versão corrigida (função `extractRow`)  
**Solução:** Re-deploy da aplicação com a branch `fix/media-realtime-perf-v2` mergeada.

---

### 3.5 Erro de áudio sem contexto (`[ERROR] [App] Audio error: <uuid>`)

**Sintoma:** Log com só o UUID, sem `MediaError.code`  
**Diagnóstico:** O componente está usando o player antigo em vez do `useAudioPlayer`  
**Solução:** Migrar o componente de player para usar `src/lib/audio/useAudioPlayer.ts`

---

## 4. Comandos de Emergência

```sql
-- Ver as últimas URLs processadas (confirmar que são corretas)
SELECT media_url, media_status, created_at 
FROM evo.evolution_messages_wpp2
WHERE media_url IS NOT NULL
ORDER BY created_at DESC LIMIT 10;

-- Forçar re-enfileiramento de mensagens sem mídia processada (últimas 24h)
INSERT INTO zapp.media_download_queue (
  message_id, message_uuid, remote_jid, instance_name, media_type, status
)
SELECT 
  message_id, id, remote_jid, instance_name, message_type, 'pending'
FROM evo.evolution_messages_wpp2
WHERE media_status IN ('unknown', 'failed')
  AND media_url IS NULL
  AND created_at > now() - interval '24 hours'
  AND message_id IS NOT NULL
ON CONFLICT (message_id) DO NOTHING;

-- Ver estado completo do pipeline
SELECT * FROM zapp.fn_media_pipeline_health_report();
```

---

## 5. Monitoramento Automático

O cron job `media_pipeline_health_check` roda a cada 4 horas e:
- Executa `fn_media_pipeline_health_report()`
- Grava alertas em `zapp.warroom_alerts` se `alert = true`

Para ver alertas recentes:
```sql
SELECT * FROM zapp.warroom_alerts 
WHERE source = 'cron:media_pipeline_health_check'
ORDER BY created_at DESC LIMIT 10;
```

---

## 6. Arquivos-chave do Frontend

| Arquivo | Responsabilidade |
|---------|-----------------|
| `src/lib/mediaUrl.ts` | Resolve URLs públicas, cache negativo, detecção de CDN WA |
| `src/lib/useMediaUrl.ts` | Hook React para resolver URL de mídia sem signed URLs |
| `src/lib/audio/useAudioPlayer.ts` | Player de áudio com `MediaError.code` + cache negativo |
| `src/features/inbox/hooks/realtime/useRealtimeContacts.ts` | Realtime com fix do `payload.new={}` em DELETEs |

---

## 7. Decisões Arquiteturais (ADRs)

- **ADR-001**: URL absoluta proibida no banco. Banco guarda `bucket + path`. URL é montada em runtime.
- **ADR-002**: Bucket `whatsapp-media` deve ser SEMPRE público. Zero `createSignedUrl` para leitura.
