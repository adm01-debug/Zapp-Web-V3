# Evolution API — Configurações (wpp2)

## Visão Geral

- Instância: `wpp2`
- Número: `+55 11 4637-5517`
- Versão: Evolution API 2.3.7 | Worker 4.2.1
- Conexão: `open` / `isHealthy: true`
- Total mensagens: 46.700+
- Contatos: 2.373

## Settings Atuais (22/07/2026)

| Parâmetro | Valor | Função |
|---|---|---|
| `alwaysOnline` | `true` | Mantém WebSocket ativo (evita reconexões) |
| `readMessages` | `true` | Marca msgs como lidas automaticamente |
| `readStatus` | `true` | Lê broadcasts de status |
| `rejectCall` | `true` | Rejeita chamadas automaticamente |
| `groupsIgnore` | `false` | Não ignora grupos |
| `syncFullHistory` | `false` | Não sincroniza histórico completo |

## Integrações

| Integração | Status | Notas |
|---|---|---|
| RabbitMQ | ✅ Ativo | 17 filas, 0 erros |
| Webhook | ❌ Desabilitado | Era apontado para webhook.site — removido |
| Typebot | ❌ Desabilitado | |
| OpenAI | ❌ Desabilitado | |
| Chatwoot | ❌ Desabilitado | |
| n8n | ❌ Desabilitado | |

## Pipeline

```
WhatsApp → wpp2 (Evolution) → RabbitMQ → Consumer → PostgreSQL (evo.evolution_messages_wpp2)
```

### Health
- Consumer: 17/17 filas, 0 erros, 0 drops, 0 retries
- DB: 41.089 mensagens armazenadas
- Pipeline health: probed a cada 15 min

## Observações

- O webhook foi desabilitado porque o endpoint webhook.site estava inacessível e gerava AxiosError no log
- Toda a mensageria é via RabbitMQ (mais resiliente)
- `alwaysOnline` + `readMessages` foram ativados em 22/07/2026 durante QA
