# Configuração do Email Chat — Outlook / Office 365

> **Arquitetura atual**: Supabase Self-Hosted (`supabase.atomicabr.com.br`), schema `zapp`. Veja [SCHEMA_REFERENCE.md](SCHEMA_REFERENCE.md).


## Método: Microsoft Graph API (sem IMAP TCP)

O ZAPP WEB integra com Outlook via **Microsoft Graph API OAuth2**, que é 100% HTTP — sem necessidade de IMAP TCP ou proxy externo.

---

## Pré-requisitos

1. Uma conta no [Microsoft Azure](https://portal.azure.com) (gratuita)
2. Acesso ao [Supabase Dashboard](https://app.supabase.com) do projeto

---

## Passo a Passo

### 1. Criar Azure AD App

1. Acesse [portal.azure.com](https://portal.azure.com)
2. Vá em **Azure Active Directory → App registrations → New registration**
3. Preencha:
   - **Name**: `ZAPP WEB Email`
   - **Supported account types**: Accounts in any organizational directory and personal accounts
   - **Redirect URI**: `Web` → `https://[SEU_PROJETO].supabase.co/functions/v1/outlook-oauth`
4. Clique **Register**

### 2. Configurar Permissões

1. Na App criada, vá em **API permissions → Add a permission → Microsoft Graph → Delegated**
2. Adicione:
   - `Mail.ReadWrite`
   - `Mail.Send`
   - `offline_access`
   - `openid`, `profile`, `email`
3. Clique **Grant admin consent**

### 3. Criar Client Secret

1. Vá em **Certificates & secrets → Client secrets → New client secret**
2. Defina uma expiração (24 meses recomendado)
3. **Copie o Value imediatamente** (não será exibido novamente)

### 4. Configurar Env Vars no Supabase

No Supabase Dashboard → **Settings → Edge Functions → Secrets**:

```
MICROSOFT_CLIENT_ID     = [Application (client) ID da App Azure]
MICROSOFT_CLIENT_SECRET = [Secret Value copiado no passo anterior]
MICROSOFT_REDIRECT_URI  = https://[SEU_PROJETO].supabase.co/functions/v1/outlook-oauth
```

### 5. Ativar no ZAPP WEB

1. Acesse **Configurações → Email Chat → Aba Outlook**
2. Clique **Conectar Outlook**
3. Faça login com sua conta Microsoft
4. Autorize as permissões solicitadas

---

## Funcionamento

```
Usuário → startOAuth() → Microsoft Login → Code
Code → outlook-oauth Edge Function → access_token + refresh_token
Tokens armazenados em imap_smtp_accounts (criptografados)
syncInbox() → Graph API /me/mailFolders/inbox/messages → Mensagens
sendEmail() → Graph API /me/sendMail → Envio
Token refresh automático → 5 min antes de expirar
```

---

## Provedores Suportados

| Provedor | Método | Status |
|---|---|---|
| Gmail / Google Workspace | OAuth2 (Google API) | ✅ Suportado |
| Outlook / Office 365 | OAuth2 (Microsoft Graph API) | ✅ Suportado |
| Yahoo Mail | IMAP + App Password | ⏳ Worker externo |
| Servidor SMTP/IMAP | IMAP + credenciais | ⏳ Worker externo |

---

## Troubleshooting

### "MICROSOFT_CLIENT_ID não configurado"
→ Verifique as env vars no Supabase Dashboard

### "Popup bloqueado"
→ Permita popups no navegador para o domínio do ZAPP WEB

### "Falha ao autenticar com Microsoft"
→ Verifique se o redirect URI está correto no Azure AD
→ Certifique-se que as permissões foram concedidas com admin consent
