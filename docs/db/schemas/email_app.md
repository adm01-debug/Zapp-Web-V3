# Schema `email_app` — Integração Gmail / IMAP

**Dono:** time de integrações  
**Atualizado:** 27/07/2026

## Propósito

Integração com Gmail API e servidores IMAP/SMTP para módulo de e-mail do ZAPP Web.

## Estatísticas

| Objeto | Quantidade |
|---|---:|
| Tabelas | 33 |
| Triggers | 23 |

## Tabelas Principais

- `email_accounts` — contas de e-mail (Realtime desde `20260724000006`)
- `email_threads` — threads de e-mail (Realtime desde `20260724000005`)
- `email_messages` — mensagens individuais
- `gmail_accounts` — contas Gmail
- `gmail_threads` — threads Gmail
- `gmail_messages` — mensagens Gmail
- `gmail_health_logs` — logs de saúde das contas
- `imap_smtp_accounts` — contas IMAP/SMTP

## Atenção

`createZappAdminClient()` usa `db: 'zapp'` — tabelas `gmail_*` precisam de VIEW proxy em `zapp`. Criadas em `20260724000050`.

## Dependências

- **Consumido por:** `zapp` (via views proxy `20260724000050`)
- **Realtime:** `email_app.email_accounts` e `email_app.email_threads` na publication
