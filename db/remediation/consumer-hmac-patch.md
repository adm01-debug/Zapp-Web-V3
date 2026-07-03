# Patch de referência — consumer RabbitMQ (fora deste repo)

> O consumer roda como Docker config na stack Portainer `evolution-rabbit-consumer` (id 113), **não** neste
> repositório. Este é o patch recomendado (INT401-2) para a correção definitiva do 401 no caminho canônico.

## Contexto

Hoje o consumer (`/app/consumer.py`) faz:

```python
headers = {"Content-Type": "application/json", "x-webhook-secret": WEBHOOK_SECRET}
r = requests.post(url, json=evt, headers=headers, timeout=30)
...
elif 400 <= r.status_code < 500:
    ch.basic_ack()          # 401 vira DROP silencioso (evento perdido, sem DLQ)
    stats["drop"] += 1
```

A Edge Function `evolution-webhook` deste PR já aceita o `x-webhook-secret` (shared-secret bearer), então o
consumer **volta a funcionar sem alteração**. Ainda assim, a correção de maior robustez é assinar HMAC e não
descartar 401 silenciosamente:

## Patch recomendado

```python
import hmac, hashlib, json, requests

# 1) Assinar o corpo EXATO enviado (não reserializar com json=)
body = json.dumps(evt, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
sig = hmac.new(WEBHOOK_SECRET.encode(), body, hashlib.sha256).hexdigest()
headers = {"Content-Type": "application/json", "x-webhook-signature": sig}
r = requests.post(url, data=body, headers=headers, timeout=30)

# 2) Não descartar auth-failures silenciosamente: 401/403 → DLQ (requeue=False p/ dead-letter), não DROP
if r.status_code in (401, 403):
    ch.basic_nack(delivery_tag=method.delivery_tag, requeue=False)  # roteia p/ DLQ
    stats["auth_fail"] += 1
elif 400 <= r.status_code < 500:
    ch.basic_ack(delivery_tag=method.delivery_tag)
    stats["drop"] += 1
```

## Consolidação (INT401-3)

Após o consumer assinar corretamente, **escolher um único caminho de entrega** e desabilitar o outro:

- Preferir `Evolution → RabbitMQ → consumer → Edge Function` (tem audit em PG, Sentry, retry/DLQ e dedup na edge).
- Desabilitar o **webhook nativo** (que hoje duplica a entrega) para estancar o flood, no PG do Evolution:

```sql
-- container postgres_postgres.1, db=evolution
UPDATE "Webhook" SET enabled = false WHERE url LIKE '%evolution-webhook%';
-- e remover a linha Webhook duplicada (2 linhas habilitadas hoje).
```

- Cobrir a instância `wpp_pink_test` no consumer (`INSTANCE_PREFIX=wpp2,wpp_pink_test`).
