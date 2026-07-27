# Runbook: Pipeline de Mídia WhatsApp — Operação e Troubleshooting

**Última atualização:** 2026-07-26  
**Responsável:** Dev Sênior / Ops  
**Versão:** 3.0 (pós-correção completa + monitoramento WAL)

---

## 1. Arquitetura do Pipeline (versão atual)

```
[WhatsApp] → [Evolution API] → [Webhook] → [fn_rewrite_media_url (trig)]
                                                       ↓
                                        [supabase.atomicabr.com.br/storage]
                                             (bucket: whatsapp-media PUBLIC)
                                                       ↓
                               [evolution_messages_wpp2.media_url] (URL pública)
                                                       ↓
                                       [Browser: <img src="..."> direto]
                                       ✅ ZERO signed URL, ZERO POST extra
```

Para mídias com `mediaKey` (criptografadas pelo WhatsApp):
```
[Webhook INSERT] → [fn_auto_enqueue_media_download (trig)]
                           ↓
               [zapp.media_download_queue (pending)]
                           ↓
           [Worker n8n: Evolution.getBase64 + decrypt]
                           ↓
   [Supabase Storage: upload → media_url → media_status=ready]
```

---

## 2. Healthcheck Rápido (roda em <1 segundo)

```sql
SELECT * FROM zapp.fn_media_pipeline_health_report() ORDER BY alert DESC, status, metric;
```

### Estado esperado em produção normal:
- `alert = false` em TODOS os registros
- `kong_urls_*` = 0 (SEMPRE — se > 0: incidente imediato)
- `bucket_whatsapp_media_public` = 1 (SEMPRE)
- `wal_logflare_lag_mb` < 300 (warning abaixo de 500, crítico acima)
- `messages_media_unknown_status` = 0

---

## 3. Problemas Conhecidos e Soluções

### 3.1 URLs `kong:8000` voltaram

**Sintoma:** `GET https://kong:8000/... net::ERR_NAME_NOT_RESOLVED` no console  
**Diagnóstico:**
```sql
SELECT count(*) FROM evo.evolution_messages_wpp2 WHERE media_url LIKE '%kong%';
```

**Solução imediata:**
```sql
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

**Causa raiz:** Identificar o workflow/Edge Function que usa `SUPABASE_URL` (interno) em vez de `SUPABASE_PUBLIC_URL`.

---

### 3.2 Fila acumulando (worker parado)

**Sintoma:** `media_queue_stuck_pending > 0` no healthcheck  
**Diagnóstico:**
```sql
SELECT status, count(*), min(created_at), max(created_at) 
FROM zapp.media_download_queue GROUP BY status;
```

**Passos:**
1. Verificar workflow n8n
2. Fazer retry manual:
```sql
UPDATE zapp.media_download_queue
SET status='retry', next_retry_at=now(), retry_count=retry_count+1
WHERE status='pending' AND created_at < now()-interval '4h' AND retry_count < max_retries;
```

---

### 3.3 Bucket `whatsapp-media` ficou privado

**Sintoma:** 403 ao carregar mídia  
**Solução:**
```sql
UPDATE storage.buckets SET public=true WHERE name='whatsapp-media';
```

---

### 3.4 WAL Slot Logflare acumulando (⚠️ RISCO DE DISCO)

**Diagnóstico:**
```sql
SELECT slot_name, active, 
       pg_wal_lsn_diff(pg_current_wal_lsn(), restart_lsn)/1048576 AS lag_mb
FROM pg_replication_slots ORDER BY lag_mb DESC;
```

**Situação atual:** O slot `cainophile_nwl2ry0m` (Logflare) está acumulando WAL lentamente.  
**Acção se > 500 MB:** Dropar o slot (Logflare não é crítico para operação):

```bash
# Via Docker (precisa acesso ao servidor):
docker exec -it supabase-db psql -U postgres -c "
  SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE query LIKE '%cainophile%';
  SELECT pg_drop_replication_slot('cainophile_nwl2ry0m');
"
```

**Via Portainer (terminal no container supabase-db):**
```sql
SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE query LIKE '%cainophile%';
SELECT pg_drop_replication_slot('cainophile_nwl2ry0m');
```

**Alternativa — aguardar consumer reconectar:** O slot é `active=true` (consumer conectado mas lento). Pode se auto-resolver quando o servidor Logflare processar o backlog.

---

### 3.5 Realtime DELETE sem `remote_jid`

**Sintoma:** `[RealtimeContacts] Payload sem remote_jid` no console  
**Diagnóstico:** Verificar se `useRealtimeContacts.ts` tem função `extractRow()`  
**Solução:** Re-deploy com branch mergeada.

---

### 3.6 Erro de áudio sem contexto

**Sintoma:** `[ERROR] [App] Audio error: <uuid>` sem code  
**Diagnóstico:** Componente usando player antigo  
**Solução:** Migrar para `src/lib/audio/useAudioPlayer.ts`

---

## 4. Comandos de Emergência

```sql
-- Estado completo em 1 comando
SELECT * FROM zapp.fn_media_pipeline_health_report();

-- Forçar re-enfileiramento de mídias sem processamento
INSERT INTO zapp.media_download_queue (
  message_id, message_uuid, remote_jid, instance_name, media_type, status
)
SELECT message_id, id, remote_jid, instance_name, message_type, 'pending'
FROM evo.evolution_messages_wpp2
WHERE media_status IN ('unknown', 'failed')
  AND media_url IS NULL
  AND created_at > now()-interval '24h'
  AND message_id IS NOT NULL
ON CONFLICT (message_id) DO NOTHING;

-- Verificar slots WAL
SELECT slot_name, active,
       pg_wal_lsn_diff(pg_current_wal_lsn(), restart_lsn)/1048576 AS lag_mb
FROM pg_replication_slots ORDER BY lag_mb DESC;
```

---

## 5. Monitoramento Automático

- **Cron Job #213** (`media_pipeline_health_check`) — a cada 4h
- Grava em `zapp.warroom_alerts` quando `alert=true`
- Ver alertas: `SELECT * FROM zapp.warroom_alerts WHERE source LIKE 'cron%' ORDER BY created_at DESC LIMIT 10;`

---

## 6. Decisões Arquiteturais

| ADR | Decisão | Motivo |
|-----|---------|--------|
| ADR-001 | URL absoluta proibida no banco | URL contendo host interno falha em browser |
| ADR-002 | Bucket `whatsapp-media` sempre público | Elimina ~450 POSTs de signed URL por page load |

---

## 7. Arquivos-chave do Frontend

| Arquivo | Responsabilidade |
|---------|-----------------|
| `src/lib/mediaUrl.ts` | Resolve URLs, cache negativo |
| `src/lib/useMediaUrl.ts` | Hook React sem signed URLs (buckets públicos) |
| `src/lib/audio/useAudioPlayer.ts` | Player com MediaError.code |
| `src/features/inbox/hooks/realtime/useRealtimeContacts.ts` | Realtime com fix DELETE |
