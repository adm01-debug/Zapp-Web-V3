# Simulação do Fluxo WhatsApp Multi-Atendimento

Execução: 2026-07-12T22:05:42.664Z
Cenários: **693** · Mensagens simuladas: **13860**

## KPIs agregados

| Métrica | Valor |
|---|---|
| Sent | 1919 (13.8%) |
| Failed | 6588 |
| Processed | 16116 |
| Orphan processing | 0 |
| Double sends | 0 |

## Violações de invariante (contagem por tipo)

| Violação | Ocorrências |
|---|---|
| `no-explicit-backoff-on-429` | 21 |

## Desempenho por modo de falha

| Falha | Runs | Sent | Failed | Avg attempts (sucesso) |
|---|---|---|---|---|
| `none` | 63 | 1079 | 58 | 1 |
| `http_401` | 63 | 0 | 1260 | 0 |
| `http_429` | 63 | 0 | 450 | 0 |
| `http_500` | 63 | 0 | 471 | 0 |
| `http_502` | 63 | 0 | 440 | 0 |
| `timeout` | 63 | 0 | 451 | 0 |
| `network` | 63 | 0 | 455 | 0 |
| `invalid_number` | 63 | 0 | 1260 | 0 |
| `flaky` | 63 | 840 | 420 | 1.33 |
| `vault_missing` | 63 | 0 | 63 | 0 |
| `duplicate_ack` | 63 | 0 | 1260 | 0 |

## Gaps e falhas detectadas

Os gaps abaixo foram derivados diretamente das violações agregadas acima e da leitura de `supabase/functions/evolution-sender/index.ts`.

### 🔴 Críticos

- **Ausência de fast-fail em erros de autenticação (HTTP 401).** Tokens inválidos consomem todas as tentativas antes de marcar `failed`. Um único incidente de credencial derrubada gera N× o volume normal de chamadas ao Evolution. Ação: classificar `http_status ∈ {400, 401, 403}` como não-retryáveis e ir direto para `failed`.
- **`req` não definido em `evolution-sender/index.ts`.** As chamadas a `handleCorsPreflight(req)` e `getCorsHeaders(req)` referenciavam variável inexistente (o handler recebe `request`). Isso quebrava toda resposta 200/500 e o preflight OPTIONS. **Corrigido nesta iteração.**
- **Sem circuit-breaker para falhas de configuração (`Vault secrets missing`).** Cada mensagem da fila consome retries individuais até esgotar `max_attempts`. Ação: detectar erro global (Vault/URL/key) e curto-circuitar o batch inteiro com uma pausa de N minutos, como já existe em `src/lib/externalProxy.ts` (`CONFIG_LOCK_MS`).

### 🟡 Importantes

- **Sem backoff exponencial explícito.** Retries só respeitam `SEND_DELAY_MS = 600ms` entre itens do batch; não há espaçamento por tentativa. Em cenários `http_429` isso mantém a pressão sobre o upstream. Ação: introduzir `next_attempt_at = now + base * 2^attempts + jitter` e filtrar por essa coluna no `SELECT` de pending.
- **Estado `processing` órfão.** Não há watchdog que reverta mensagens paradas em `processing` (ex.: crash entre o `UPDATE ... status=processing` e o `markSent/Failed/Pending`). Ação: cron auxiliar recuperando `processing` com `updated_at < now() - 5min` para `pending`.
- **`duplicate_ack` sem `messageId`.** Quando o Evolution responde 200 sem `key.id`, salvamos `whatsapp_message_id = null`. Isso quebra idempotência em retries e correlação de webhooks. Ação: exigir `messageId`; se ausente, tratar como falha transitória e permitir retry.
- **DLQ implícita.** Mensagens `failed` ficam na própria `evolution_message_queue`. Não há tabela ou visão dedicada para triagem manual. Ação: mover para `failed_messages` (já existe) via trigger `AFTER UPDATE`.

### 🔵 Observabilidade

- **`processQueue` não emite trace por mensagem.** O `metadata.errors` só guarda 5 amostras. Ação: enviar spans/métricas ao `query_telemetry` por `message_id`.
- **Sem métrica `retries_exhausted_total`.** Difícil detectar tendência de saturação. Ação: expor contador Prometheus em `evolution-retry-metrics`.

## Amostra dos piores cenários (top 10 por violações)

| ID | msg_type | falha | max_att | batch | conc | sent | failed | violations |
|---|---|---|---|---|---|---|---|---|
| S19 | text | http_429 | 1 | 5 | 1 | 0 | 20 | no-explicit-backoff-on-429 |
| S20 | text | http_429 | 1 | 10 | 1 | 0 | 20 | no-explicit-backoff-on-429 |
| S21 | text | http_429 | 1 | 25 | 1 | 0 | 20 | no-explicit-backoff-on-429 |
| S118 | image | http_429 | 1 | 5 | 1 | 0 | 20 | no-explicit-backoff-on-429 |
| S119 | image | http_429 | 1 | 10 | 1 | 0 | 20 | no-explicit-backoff-on-429 |
| S120 | image | http_429 | 1 | 25 | 1 | 0 | 20 | no-explicit-backoff-on-429 |
| S217 | audio | http_429 | 1 | 5 | 1 | 0 | 20 | no-explicit-backoff-on-429 |
| S218 | audio | http_429 | 1 | 10 | 1 | 0 | 20 | no-explicit-backoff-on-429 |
| S219 | audio | http_429 | 1 | 25 | 1 | 0 | 20 | no-explicit-backoff-on-429 |
| S316 | video | http_429 | 1 | 5 | 1 | 0 | 20 | no-explicit-backoff-on-429 |

## Próximos passos sugeridos (ordenados por impacto)

1. Introduzir classificação de erro (`retryable` vs `terminal`) no `evolution-sender`.
2. Adicionar coluna `next_attempt_at` + backoff exponencial + jitter em `evolution_message_queue`.
3. Cron watchdog para `processing` orfão (>5 min).
4. Circuit-breaker global para Vault/HTTP 5xx sustentado (janela de 5 min).
5. Trigger que copia rows `failed` para `failed_messages` (DLQ dedicada).
6. Métricas Prometheus: `sent_total`, `failed_total{reason}`, `retries_total`, `queue_depth`.