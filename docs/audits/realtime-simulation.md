# Simulação Realtime/Hydration — 2026-07-12

- Cenários: 25
- Aprovados: 14
- Violações: 11

## Gaps

- **reconnect-attempt-5** (reconnect): confirmar cap 30s + jitter em useRealtimeInbox
- **reconnect-attempt-8** (reconnect): confirmar cap 30s + jitter em useRealtimeInbox
- **reconnect-attempt-13** (reconnect): confirmar cap 30s + jitter em useRealtimeInbox
- **dedup-webhook-then-realtime** (message-dedup): usar Map<id, Message> em useRealtimeInbox — dedup determinístico
- **dedup-realtime-then-webhook** (message-dedup): usar Map<id, Message> em useRealtimeInbox — dedup determinístico
- **dedup-double-webhook** (message-dedup): usar Map<id, Message> em useRealtimeInbox — dedup determinístico
- **hydrate-cachefalse-msgFirsttrue** (hydrate-contact): lazy-fetch contact ao receber message.contact_id ausente do cache
- **race-webhook-realtime-0ms** (race): ordenar por (created_at, id) e não por ordem de chegada
- **race-webhook-realtime-50ms** (race): ordenar por (created_at, id) e não por ordem de chegada
- **race-webhook-realtime-200ms** (race): ordenar por (created_at, id) e não por ordem de chegada
- **presence-rtt-1200** (presence): atraso perceptível
