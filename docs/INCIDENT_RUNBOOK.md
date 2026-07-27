# 🚨 Runbook de Incidentes — ZAPP WEB

## Severidades
- **S1 (Crítico)**: Sistema fora do ar, impossibilidade de enviar/receber mensagens.
- **S2 (Alto)**: Funcionalidade principal lenta ou instável (ex: delay > 10s no WhatsApp).
- **S3 (Médio)**: Bug em funcionalidade secundária (ex: relatório não gera).
- **S4 (Baixo)**: Bug cosmético ou dúvida.

## Cenários Comuns

### 1. WhatsApp não conecta / Mensagens não chegam
- **Verificação**: Checar `v_webhook_health` no banco.
- **Ação**: Reiniciar instância na Evolution API via Painel Admin.
- **Audit**: Ver logs da função `evolution-webhook`.

### 2. Erros de Autenticação (JWT)
- **Verificação**: Tentar login em aba anônima.
- **Ação**: Verificar se `LOVABLE_API_KEY` ou secrets de auth foram alterados.
- **Rollback**: Reverter última migration de auth se aplicável.

### 3. FATOR X Lento
- **Verificação**: Rodar `fn_zapp_web_smoke_test_v2()`.
- **Ação**: Verificar `pg_stat_activity` para queries travadas.
- **Escalação**: Contactar suporte do banco externo se latência persistir > 2s.

### 4. Áudio (.ogg/.webm) não toca — HTTP 400 na URL de áudio (BUG-38)
**Sintoma:** Console mostra `Audio error: <uuid>` + requests com status 400 para `/storage/v1/object/public/audio-messages/`.
**Diagnóstico rápido:**
```sql
-- Via supabase-mcp ou psql (container supabase_db):
SELECT name, public, allowed_mime_types
FROM storage.buckets
WHERE name IN ('audio-messages', 'whatsapp-media');
```
**Matriz de decisão:**

| Resultado | Causa-raiz | Correção (via supabase-mcp) |
|-----------|-----------|------------------------------|
| `public = false` | Bucket privado, endpoint público falha | `UPDATE storage.buckets SET public = true WHERE name = 'audio-messages';` |
| `allowed_mime_types = null ou缺少ogg` | Mimetype não listado | `UPDATE storage.buckets SET allowed_mime_types = ARRAY['audio/ogg','audio/webm','audio/mpeg','audio/mp3','audio/aac','audio/mp4','application/ogg'] WHERE name = 'audio-messages';` |
| Sem policy `anon_read_audio_messages` | RLS nega acesso anônimo | `CREATE POLICY anon_read_audio_messages ON storage.objects FOR SELECT TO anon USING (bucket_id = 'audio-messages');` |

**Verificação pós-correção:**
```bash
# Testar URL pública direta (sem auth)
curl -I "https://supabase.atomicabr.com.br/storage/v1/object/public/audio-messages/audio/<nome.ogg>"
# Esperado: HTTP 200 + Content-Type: audio/ogg
```

**Nota de segurança:** `audio-messages` contém mensagens de voz do WhatsApp (PTT). São dados de conversa de BAIXA sensibilidade (vs. comprovantes financeiros). O bucket público para LEITURA é aceitável. UPLOAD permanece autenticado (`auth_write_audio_msgs` policy).

### 5. Imagens bloqueadas pelo browser (CSP/ad-blocker)
**Sintoma:** Console mostra `Refused to load image... blocked by CSP` — dezenas de violações.
**Diagnóstico:** Verificar se há CSP header/meta tag ativo em produção:
```bash
curl -sI https://zapp.atomicabr.com.br/ | grep -i "content-security"
# Se vazio → CSP NÃO está em produção (bloqueios vêm de extensões de browser/ad-blocker)
# Se presente → CSP restritivo demais, verificar nginx.conf ou meta tag no build
```
**Ação:** Se CSP em produção está OK e bloqueios persistem, são extensões de browser do USUÁRIO — não há ação do time. Documentar e encerrar.

## Contatos de Emergência
- Infra: @dev-ops
- Backend: @senior-dev
- Stakeholder: @manager
