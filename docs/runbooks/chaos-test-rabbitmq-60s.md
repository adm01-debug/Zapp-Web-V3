# CHAOS TEST — RabbitMQ 60-Second Kill & Recovery

**Reference:** AUDITORIA_BACKEND_SENIOR_2026-07-11.md LOW-5  
**Severity gate:** Must pass before any production deployment that touches the  
message pipeline (`evolution-webhook`, `whatsapp-webhook`, queue bindings,  
consumer config).

---

## Objective

Verify that the Evolution v2 pipeline automatically resumes message ingestion
after a 60-second RabbitMQ outage — without data loss, without manual
intervention, and without binding corruption.

**Pass criteria:**

| Metric | Threshold |
|--------|-----------|
| Auto-reconnect | Consumer reconnects within **30 s** after RabbitMQ restarts |
| Message gap | `evo.evolution_messages_wpp2 MAX(created_at)` lag < **3 min** post-recovery |
| Binding integrity | All **17** source→queue bindings present |
| DLQ depth | No increase in `evolution.dlq.*` queues during or after test |
| Health score | `fn_system_health_score().score` ≥ **95** within **5 min** of recovery |
| pg_cron | No new FAILED/SKIPPED rows in `v_cron_health` during test window |

**Fail criteria (stop and escalate):**

- Consumer does not reconnect after 5 minutes
- Binding count drops below 17 and does not self-repair
- DLQ accumulates messages that do not drain within 10 minutes
- Messages are permanently lost (not requeued from DLQ)

---

## Prerequisites

1. **Notify team** — run only during low-traffic window (Mon–Fri 09:00–11:00 BRT  
   or Sat 06:00–08:00 BRT).
2. **Baseline snapshot** — run the following and save output:

```bash
# A. Binding count
rabbitmqctl list_bindings -p evolution source_name destination_name \
  | awk '$1=="evolution"' | wc -l
# Expected: 17

# B. Latest message timestamp (Supabase SQL)
SELECT NOW() - MAX(created_at) AS lag FROM evo.evolution_messages_wpp2;
# Expected: < 5 minutes

# C. Health score
SELECT fn_system_health_score();
# Expected: score >= 95

# D. DLQ depth
rabbitmqctl list_queues -p evolution name messages \
  | grep 'evolution\.dlq\.' | awk '{sum+=$2} END {print sum}'
# Expected: 0 (or stable low number)

# E. Cron health
SELECT jobname, health_status, last_run_at FROM public.v_cron_health
WHERE health_status != 'ok' ORDER BY jobname;
# Expected: 0 rows
```

3. **Observer terminal** — keep a separate session running continuous tailing:

```bash
# Watch consumer reconnect logs
docker logs -f <evolution_container_name> 2>&1 | grep -E 'amqp|rabbit|connect|channel'
```

---

## Test Steps

### Phase 1 — Kill (T=0)

```bash
# Stop RabbitMQ service (do NOT remove volumes/queues)
docker stop rabbitmq
echo "T=0 KILL: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
```

**Observe immediately:**
- Evolution logs show `AMQP connection error` or `channel closed`
- Supabase `evo.evolution_webhook_events_v2` may continue receiving if HTTP  
  webhooks are still active (ingestion ≠ delivery layer)
- `fn_system_health_score()` webhook_pipeline dimension should drop

---

### Phase 2 — 60-Second Window (T=0 to T=60s)

**Do NOT restart RabbitMQ yet.** During this window:

```bash
# Every 10 seconds, sample:
watch -n 10 'psql -c "SELECT NOW(), COUNT(*) as events_30s FROM evo.evolution_webhook_events_v2 WHERE created_at > NOW() - INTERVAL '\''30 seconds'\'';"'
```

Expected: ingestion-layer rows still arrive (webhook HTTP still works).  
Delivery-layer (`evolution_messages_wpp2`) should stall.

---

### Phase 3 — Restart (T=60s)

```bash
echo "T=60 RESTART: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
docker start rabbitmq

# Wait for management API to come up (~10s)
until curl -s -u guest:guest http://localhost:15672/api/healthchecks/node | grep -q '"status":"ok"'; do
  sleep 2
done
echo "RabbitMQ ready: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
```

---

### Phase 4 — Recovery Verification (T=60s to T=300s)

#### 4.1 Binding integrity (T+15s after restart)

```bash
rabbitmqctl list_bindings -p evolution source_name destination_name \
  | awk '$1=="evolution"' | wc -l
# Must be: 17
```

If < 17: bindings were lost. Execute  
`docs/runbooks/evolution-restart-rabbitmq-bindings.md` Section "Recuperação de bindings".

#### 4.2 Consumer reconnect (T+30s)

```bash
# Check Evolution logs for successful channel open
docker logs <evolution_container> --since 90s | grep -E 'amqp|channel|reconnect'
```

Expected: `AMQP channel open` or `connected to broker`.

```bash
# Verify queue consumers count
rabbitmqctl list_queues -p evolution name consumers \
  | grep '^wpp2\.' | awk '{sum+=$2} END {print sum}'
# Expected: >= 17 (one consumer per queue)
```

#### 4.3 Message flow resumption (T+90s)

```sql
-- Run in Supabase SQL editor
SELECT
  NOW() - MAX(created_at)           AS delivery_lag,
  COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '2 minutes') AS msgs_2m
FROM evo.evolution_messages_wpp2;
-- Pass: delivery_lag < 3 min AND msgs_2m > 0 (if traffic exists)
```

#### 4.4 DLQ drain verification (T+120s)

```bash
rabbitmqctl list_queues -p evolution name messages \
  | grep 'evolution\.dlq\.' | awk '{sum+=$2} END {print sum}'
# Must equal or be less than baseline (no accumulation)
```

Messages queued during outage should drain automatically via DLQ retry consumer.

#### 4.5 Health score recovery (T+300s / 5 min)

```sql
SELECT
  (fn_system_health_score()->>'score')::numeric AS score,
  fn_system_health_score()->'breakdown'->'webhook_pipeline' AS pipeline,
  fn_system_health_score()->'breakdown'->'cron_health' AS cron;
-- Pass: score >= 95
```

#### 4.6 Cron health check (T+300s)

```sql
SELECT jobname, health_status, minutes_since_last_run, failures_1h
FROM public.v_cron_health
WHERE alert_needed
ORDER BY jobname;
-- Pass: 0 rows (no jobs missed their window due to broker outage)
```

---

## Results Template

Copy and fill in after running the test:

```
Chaos Test — RabbitMQ 60s Kill
Date: ____________________
Operator: ________________
Environment: staging / production

Phase 1 — Kill
  T=0 timestamp: ____________
  Evolution log error: [ ] YES  [ ] NO

Phase 3 — Restart
  T=60 timestamp: ____________
  RabbitMQ ready timestamp: __________

Phase 4 — Recovery
  Binding count at T+15s: ____  (pass >= 17)
  Consumer reconnect at T+30s: [ ] YES  [ ] NO (logs confirm channel open)
  Consumer count at T+30s: ____ (pass >= 17)
  Delivery lag at T+90s: ____  (pass < 3 min)
  msgs_2m at T+90s: ____
  DLQ depth post-test: ____  (pass <= baseline)
  Health score at T+5min: ____ (pass >= 95)
  v_cron_health alert_needed at T+5min: ____ (pass = 0)

OVERALL RESULT: [ ] PASS  [ ] FAIL
Notes: _______________________________________________
```

---

## Rollback / Escalation

If the test **fails** at any phase:

1. **Bindings missing**: run `evolution-restart-rabbitmq-bindings.md`.
2. **Consumer not reconnecting after 5 min**: restart Evolution container  
   (`docker restart <evolution>`); verify bindings again.
3. **DLQ accumulating and not draining**: inspect DLQ consumer status;  
   check `rpc_dlq_retry_now()` manual trigger.
4. **Health score stuck below 90**: check `fn_system_health_score()` breakdown  
   for the failing dimension; follow per-dimension runbooks.
5. **Escalate** if not resolved within 15 minutes: alert on-call via Slack  
   `#infra-alerts`.

---

## Related Runbooks

- `evolution-restart-rabbitmq-bindings.md` — full binding recovery procedure
- `OPERATIONS_CALENDAR.md` — scheduled maintenance windows
- `validation-battery-2026-07-11.md` — full regression battery

---

*Last updated: 2026-07-12 — LOW-5 AUDITORIA_BACKEND_SENIOR_2026-07-11*
