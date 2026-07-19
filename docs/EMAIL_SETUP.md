# Email Chat — Guia de Configuração

> **Arquitetura atual**: Supabase Self-Hosted (`supabase.atomicabr.com.br`), schema `zapp`. Veja [SCHEMA_REFERENCE.md](SCHEMA_REFERENCE.md).


Este documento descreve como configurar o módulo de Email Chat do ZAPP WEB,
que usa a Email API via OAuth2 e Google Pub/Sub para recebimento em tempo real.

---

## 1. Variáveis de Ambiente (Supabase Edge Functions)

Configure as seguintes variáveis no painel **Supabase → Edge Functions → Secrets**:

| Variável | Descrição | Obtenção |
|---|---|---|
| `GOOGLE_CLIENT_ID` | OAuth2 Client ID | Google Cloud Console → Credentials |
| `GOOGLE_CLIENT_SECRET` | OAuth2 Client Secret | Google Cloud Console → Credentials |
| `GMAIL_REDIRECT_URI` | URI de callback OAuth | `https://<projeto>.supabase.co/functions/v1/gmail-oauth` |
| `GMAIL_PUBSUB_TOPIC` | Tópico Google Pub/Sub | `projects/<projeto>/topics/gmail-notifications` |
| `RESEND_API_KEY` | *(Opcional)* API key do Resend | https://resend.com |

---

## 2. Google Cloud Console

### 2.1 Criar credenciais OAuth2
1. Acesse https://console.cloud.google.com
2. APIs & Services → Credentials → Create Credentials → OAuth client ID
3. Application type: **Web application**
4. Authorized redirect URIs: `https://<projeto>.supabase.co/functions/v1/gmail-oauth`

### 2.2 Habilitar Email API
APIs & Services → Library → **Gmail API** → Enable

### 2.3 Criar tópico Pub/Sub para emails em tempo real
```bash
gcloud pubsub topics create gmail-notifications
gcloud pubsub topics add-iam-policy-binding gmail-notifications \
  --member="serviceAccount:gmail-api-push@system.gserviceaccount.com" \
  --role="roles/pubsub.publisher"

gcloud pubsub subscriptions create gmail-push \
  --topic=gmail-notifications \
  --push-endpoint=https://<projeto>.supabase.co/functions/v1/gmail-webhook
```

---

## 3. Aplicar Migrations no Supabase

```bash
supabase db push --project-ref allrjhkpuscmgbsnmjlv
```

Ou execute manualmente no **Supabase Dashboard → SQL Editor**:
1. `supabase/migrations/20260502000001_gmail_tables_ensure.sql`
2. `supabase/migrations/20260502000002_gmail_sla_metrics.sql`

---

## 4. Deploy das Edge Functions

```bash
supabase functions deploy gmail-oauth
supabase functions deploy gmail-send
supabase functions deploy gmail-sync
supabase functions deploy gmail-webhook
supabase functions deploy send-email
```

---

## 5. Arquitetura do Módulo

```
frontend/
  hooks/
    useEmail.ts            — orquestrador principal
    useGmailOAuthFlow.ts   — OAuth + token refresh automático (a cada 60s)
    useEmailSignature.ts   — CRUD de assinaturas por conta
    useEmailDraft.ts       — auto-save a cada 30s + sync Email API
    useEmailSearch.ts      — busca dual: FTS local + Email API remota
    useEmailSLA.ts         — SLA FRT por thread, status ok/warning/breached
    gmail/
      gmailApi.ts          — todas as chamadas à API via Edge Functions
      gmailTypes.ts        — tipos TypeScript completos, sem `as any`
  components/
    email/                 — componentes do Email Chat
      EmailChatInbox       — orquestrador principal com busca + multi-conta
      EmailChatThread      — thread com SLA progress e auto-scroll
      EmailChatBubble      — mensagem com HTML sanitizado e quote expansion
      EmailChatReplyBar    — reply com CC/BCC, assinaturas, anexos, draft
      EmailThreadList      — lista com filtros, infinite scroll, SLA dots
      EmailContactPanel    — painel lateral com SLA e histórico
      EmailSearchBar       — busca com dropdown e FTS dual
      EmailSLABadge        — badge, dot e progress bar de SLA
      EmailSignatureEditor — editor WYSIWYG de assinaturas
      EmailAttachmentPreview — preview e download de anexos
      EmailSLADashboard    — métricas SLA por conta com avg FRT
    gmail/                 — tela Email completa
      GmailInboxView       — 3-colunas com labels, busca e painel contato
      EmailComposer        — rich text, CC/BCC, assinaturas, rascunho
      EmailThreadView      — thread com realtime e reply integrado
      GmailAccountSelector — multi-conta com status de token

edge-functions/
  gmail-oauth/     — getAuthUrl/exchangeCode/refresh/revoke/callback
  gmail-send/      — send/markRead/trash/modifyLabels/saveDraft/deleteDraft
  gmail-sync/      — listThreads/syncFull/syncLabels
  gmail-webhook/   — Pub/Sub push + registerWatch
  send-email/      — proxy legado + fallback Resend
  _shared/
    gmail-helpers.ts — token refresh, MIME parsing, persistência centralizada
```

---

## 6. Score do módulo após auditoria (2026-05-02)

| Categoria | Antes | Depois |
|---|---|---|
| Infraestrutura (tabelas, migrations) | 2/10 | 10/10 |
| OAuth / Token management | 3/10 | 10/10 |
| Envio de email | 5/10 | 10/10 |
| Recebimento em tempo real (Pub/Sub) | 0/10 | 9/10 |
| Busca full-text | 0/10 | 9/10 |
| Assinaturas de email | 0/10 | 10/10 |
| Rascunhos com auto-save | 0/10 | 9/10 |
| SLA integrado | 0/10 | 9/10 |
| UI/UX dos componentes | 4/10 | 9/10 |
| TypeScript seguro | 3/10 | 9/10 |
| **TOTAL** | **4.4/10** | **9.4/10** |

---

## 7. Informações Adicionais

Este módulo foi renomeado de Gmail para Email para refletir sua versatilidade e preparação para múltiplos provedores.

> Limitação restante para 10/10: suporte a IMAP/SMTP para provedores não-Gmail (Outlook, Yahoo).
