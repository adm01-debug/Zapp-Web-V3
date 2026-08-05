"""Evolution → RabbitMQ → Supabase bridge — v6.
Melhorias vs v5 (B-6 do runbook — instrumentação de drops):
  - stats['drop_by_reason']: dict contabilizando o motivo de cada drop
    ('no_event_type', '4xx:<status>') — elimina perda silenciosa
  - helper drop_reason(reason): incrementa drop e o motivo em uma chamada
  - Sentry: alerta 4xx apenas para status fora de (404, 422) — reduz ruído
  - STATS periódico inclui drop_by_reason serializado (compacto)
  - log.info extra quando drop > 0 no ciclo, com os motivos
  - Demais comportamentos (HMAC, filas, resub, shadow) inalterados vs v5
"""
import pika, requests, os, json, time, sys, signal, logging, hmac, hashlib

try:
    import psycopg2
    from psycopg2.extras import Json
    PG_AVAIL = True
except ImportError:
    PG_AVAIL = False

try:
    import sentry_sdk
    SENTRY_AVAIL = True
except ImportError:
    SENTRY_AVAIL = False

SENTRY_DSN = os.environ.get('SENTRY_DSN', '')
if SENTRY_DSN and SENTRY_AVAIL:
    sentry_sdk.init(dsn=SENTRY_DSN, traces_sample_rate=0.0,
                    release='consumer@v6',
                    environment=os.environ.get('ENVIRONMENT', 'production'))

logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s', datefmt='%H:%M:%S')
log = logging.getLogger('consumer')

RABBIT_URL      = os.environ['RABBITMQ_URL']
SUPABASE_URL    = os.environ['SUPABASE_URL']
WEBHOOK_SECRET  = os.environ.get('WEBHOOK_SECRET','') or open('/run/secrets/supabase_webhook_secret_v1').read().strip()
SHADOW          = os.environ.get('SHADOW_MODE','true').lower() == 'true'
PREFIXES        = [p for p in os.environ.get('INSTANCE_PREFIX','wpp2').split() if p]
PG_URL          = os.environ.get('PG_EVOLUTION_URL','')
RESUB_INTERVAL  = int(os.environ.get('RESUB_INTERVAL','60'))

EVENTS = ['messages.upsert','messages.update','messages.edited','messages.delete',
          'contacts.upsert','contacts.update','chats.upsert','chats.update',
          'connection.update','labels.edit','labels.association',
          'groups.upsert','groups.update','group-participants.update','call','qrcode.updated','logout.instance']
QUEUES = list(dict.fromkeys(f'{p}.{e}' for p in PREFIXES for e in EVENTS))

stats = {'ok':0,'shadow':0,'retry':0,'err':0,'drop':0,'pg_log_ok':0,'pg_log_err':0,'sentry_sent':0,'resub':0,
         'drop_by_reason': {}}
start = time.time()
running = True

def drop_reason(reason):
    """Contabiliza um drop com motivo estruturado (stats['drop'] e drop_by_reason)."""
    stats['drop'] += 1
    stats['drop_by_reason'][reason] = stats['drop_by_reason'].get(reason, 0) + 1

def _stop(*_):
    global running
    running = False
    log.info('shutdown signal — encerrando gracefully')
signal.signal(signal.SIGTERM, _stop)
signal.signal(signal.SIGINT, _stop)

_pg_conn = None
def pg_conn():
    global _pg_conn
    if not PG_URL or not PG_AVAIL: return None
    if _pg_conn is None or _pg_conn.closed:
        try:
            _pg_conn = psycopg2.connect(PG_URL, connect_timeout=5)
            _pg_conn.autocommit = True
        except Exception as e:
            log.warning(f"pg_conn error: {e}")
            return None
    return _pg_conn

def log_event(evt, source, status_code, latency_ms, error=None):
    c = pg_conn()
    if not c: return
    try:
        summary = {}
        instance_id = None
        if isinstance(evt, dict):
            summary['event'] = evt.get('event')
            data = evt.get('data') or {}
            if isinstance(data, dict):
                k = data.get('key') or {}
                if isinstance(k, dict):
                    summary['keyId'] = k.get('id'); summary['remoteJid'] = k.get('remoteJid')
                summary['messageType'] = data.get('messageType')
                instance_id = data.get('instanceId') or evt.get('instance')
        with c.cursor() as cur:
            cur.execute("""
                INSERT INTO public.evolution_webhook_events
                  (instance_id, event_type, source, status_code, latency_ms, error_message, payload_summary)
                VALUES (%s,%s,%s,%s,%s,%s,%s)
            """, (instance_id, (evt.get('event') if isinstance(evt,dict) else None),
                  source, status_code, latency_ms, error, Json(summary)))
        stats['pg_log_ok'] += 1
    except Exception as e:
        stats['pg_log_err'] += 1
        if stats['pg_log_err'] < 5: log.warning(f"pg log err: {e}")

def report_to_sentry(exc=None, msg=None, extras=None):
    if not (SENTRY_DSN and SENTRY_AVAIL): return
    try:
        with sentry_sdk.push_scope() as scope:
            if extras:
                for k,v in extras.items(): scope.set_extra(k, v)
            if exc: sentry_sdk.capture_exception(exc)
            elif msg: sentry_sdk.capture_message(msg)
        stats['sentry_sent'] += 1
    except Exception as e:
        log.warning(f"sentry err: {e}")

def resolve_endpoint(evt, method):
    ev = evt.get('event','') if isinstance(evt,dict) else ''
    if not ev:
        rk = method.routing_key or ''
        for p in PREFIXES:
            if rk.startswith(f'{p}.'):
                ev = rk[len(p)+1:]; break
        else:
            ev = rk
    return ev.replace('.', '-') if ev else None

def handle(ch, method, properties, body):
    tag = method.delivery_tag
    rk = method.routing_key or 'unknown'
    t0 = time.time()
    try:
        evt = json.loads(body)
        endpoint_path = resolve_endpoint(evt, method)
        if not endpoint_path:
            ch.basic_ack(delivery_tag=tag)
            drop_reason('no_event_type')
            log_event(evt, 'rabbitmq-consumer', None, None, 'no_event_type'); return
        url = f"{SUPABASE_URL.rstrip('/')}/{endpoint_path}"
        if SHADOW:
            stats['shadow']+=1; ch.basic_ack(delivery_tag=tag)
            log_event(evt, 'rabbitmq-consumer-shadow', None, int((time.time()-t0)*1000)); return
        body_bytes = json.dumps(evt, separators=(',',':')).encode()
        sig = hmac.new(WEBHOOK_SECRET.encode(), body_bytes, hashlib.sha256).hexdigest()
        headers={'Content-Type':'application/json','x-webhook-signature':f'sha256={sig}'}
        r = requests.post(url, data=body_bytes, headers=headers, timeout=30)
        latency_ms = int((time.time()-t0)*1000)
        if 200 <= r.status_code < 300:
            ch.basic_ack(delivery_tag=tag); stats['ok']+=1
            log_event(evt, 'rabbitmq-consumer', r.status_code, latency_ms)
            if stats['ok'] % 100 == 0: log.info(f"[OK {r.status_code}] {endpoint_path} ok={stats['ok']}")
        elif 400 <= r.status_code < 500:
            ch.basic_ack(delivery_tag=tag)
            drop_reason(f'4xx:{r.status_code}')
            log_event(evt, 'rabbitmq-consumer', r.status_code, latency_ms, r.text[:200])
            log.warning(f"[DROP {r.status_code}] {endpoint_path} reason=4xx:{r.status_code} body[:150]={r.text[:150]}")
            if r.status_code not in (404, 422):
                report_to_sentry(msg=f"[4xx] {r.status_code} {endpoint_path}", extras={'body': r.text[:500], 'rk': rk})
        else:
            ch.basic_nack(delivery_tag=tag, requeue=True); stats['retry']+=1
            log_event(evt, 'rabbitmq-consumer', r.status_code, latency_ms, '5xx will retry')
            log.warning(f"[RETRY {r.status_code}] {endpoint_path}")
            if stats['retry'] in (1, 10, 50, 100):
                report_to_sentry(msg=f"[5xx] {r.status_code} {endpoint_path} retry#{stats['retry']}", extras={'body': r.text[:500]})
            time.sleep(0.5)
    except json.JSONDecodeError as e:
        ch.basic_ack(delivery_tag=tag); stats['err']+=1
        log.error(f"[BAD JSON] rk={rk}: {e}")
        report_to_sentry(exc=e, extras={'rk': rk, 'body_head': body[:300].decode('utf-8','replace') if body else ''})
    except Exception as e:
        try: ch.basic_nack(delivery_tag=tag, requeue=True)
        except Exception: pass
        stats['retry']+=1
        log.error(f"[EXC] rk={rk}: {type(e).__name__}: {e}")
        report_to_sentry(exc=e, extras={'rk': rk})
        time.sleep(1)

def subscribe(conn, q):
    """Canal dedicado por fila. Declare passivo→ativo idempotente. Retorna canal ou None."""
    try:
        ch = conn.channel()
        ch.basic_qos(prefetch_count=5)
        try:
            ch.queue_declare(queue=q, passive=True)
        except Exception:
            ch = conn.channel(); ch.basic_qos(prefetch_count=5)
            ch.queue_declare(queue=q, durable=True, arguments={'x-queue-type':'quorum'})
            log.info(f"  + criada {q}")
        ch.basic_consume(queue=q, on_message_callback=handle)
        return ch
    except Exception as e:
        log.error(f"  ✗ {q}: {type(e).__name__}: {e}")
        report_to_sentry(exc=e, extras={'queue': q})
        return None

def main():
    log.info(f"consumer v6 | SHADOW={SHADOW} | prefixes={PREFIXES} | queues={len(QUEUES)} | "
             f"PG_LOG={'on' if PG_URL and PG_AVAIL else 'off'} | SENTRY={'on' if SENTRY_DSN and SENTRY_AVAIL else 'off'}")
    log.info(f"target={SUPABASE_URL}")
    while running:
        conn = None
        try:
            params = pika.URLParameters(RABBIT_URL); params.heartbeat=60
            params.connection_attempts=3; params.retry_delay=5
            conn = pika.BlockingConnection(params)
            channels = {}
            for q in QUEUES:
                ch = subscribe(conn, q)
                if ch: channels[q] = ch; log.info(f"  ✓ {q}")
            log.info(f"ready — {len(channels)}/{len(QUEUES)} filas vivas")
            last_stats = time.time(); last_resub = time.time()
            while running:
                conn.process_data_events(time_limit=1)
                now = time.time()
                if now - last_resub > RESUB_INTERVAL:
                    dead = [q for q in QUEUES if q not in channels or channels[q].is_closed]
                    for q in dead:
                        ch = subscribe(conn, q)
                        if ch:
                            channels[q] = ch; stats['resub'] += 1
                            log.info(f"  ↻ ressuscitada {q}")
                    last_resub = now
                if now - last_stats > 30:
                    vivas = sum(1 for c in channels.values() if not c.is_closed)
                    log.info(f"[STATS] up={int(now-start)}s ok={stats['ok']} shadow={stats['shadow']} "
                             f"retry={stats['retry']} drop={stats['drop']} err={stats['err']} "
                             f"filas={vivas}/{len(QUEUES)} resub={stats['resub']} "
                             f"pg_log_ok={stats['pg_log_ok']} pg_log_err={stats['pg_log_err']} "
                             f"sentry_sent={stats['sentry_sent']} "
                             f"drop_by={json.dumps(stats['drop_by_reason'], separators=(',',':'))}")
                    if stats['drop'] > 0:
                        log.info(f"[DROP-REASONS] drop={stats['drop']} "
                                 f"drop_by={json.dumps(stats['drop_by_reason'], separators=(',',':'))}")
                    last_stats = now
            try: conn.close()
            except Exception: pass
            log.info('conexão fechada — bye')
        except pika.exceptions.AMQPConnectionError as e:
            log.error(f"AMQP err: {e}. retry 10s")
            report_to_sentry(exc=e, extras={'phase': 'amqp_connect'})
            time.sleep(10)
        except Exception as e:
            log.error(f"unexpected {type(e).__name__}: {e}. retry 10s")
            report_to_sentry(exc=e, extras={'phase': 'main_loop'})
            time.sleep(10)

main()
