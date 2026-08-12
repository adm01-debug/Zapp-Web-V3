"""Evolution → RabbitMQ → Supabase bridge — v7.
Melhorias vs v6 (REC-07-09/10 — perda permanente 0,06% do volume):
  - 4xx do gateway (body NÃO-JSON: 404 HTML/empty do Traefik) e 429 (rate
    limit) → nack+requeue com backoff exponencial, honrando Retry-After
    quando presente; teto de tentativas (MAX_DELIVERY) evita hot loop (S-09/S2)
  - drop definitivo APENAS para 4xx com body JSON (erro aplicativo da edge),
    discriminado por content-type/parse (S-09/S3)
  - stats['retry_by_reason']: motivo de cada requeue ('4xx:<status>')
  - drop por teto de tentativas contabilizado como '4xx:<status>:max_attempts'
  - persistência do snapshot [STATS] (30s) em evo.evolution_rabbit_consumer_stats
    (tabela criada pelo A1 em paralelo; ausência/erro → WARN, não quebra)
  - Demais comportamentos (HMAC, filas, resub, shadow, [STATS]/[DROP-REASONS])
    inalterados vs v6
"""
import pika, requests, os, json, time, sys, signal, logging, hmac, hashlib, socket

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
                    release='consumer@v7',
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

# v7 — backoff exponencial p/ 4xx transientes (gateway/429)
MAX_DELIVERY    = int(os.environ.get('MAX_DELIVERY','8'))     # teto de tentativas por mensagem
BACKOFF_BASE    = float(os.environ.get('BACKOFF_BASE','1.0')) # segundos na 1a tentativa
BACKOFF_FACTOR  = float(os.environ.get('BACKOFF_FACTOR','2.0'))
BACKOFF_MAX     = float(os.environ.get('BACKOFF_MAX','60.0')) # teto do delay por tentativa

EVENTS = ['messages.upsert','messages.update','messages.edited','messages.delete',
          'contacts.upsert','contacts.update','chats.upsert','chats.update',
          'connection.update','labels.edit','labels.association',
          'groups.upsert','groups.update','group-participants.update','call','qrcode.updated','logout.instance','send.message']
QUEUES = list(dict.fromkeys(f'{p}.{e}' for p in PREFIXES for e in EVENTS))

stats = {'ok':0,'shadow':0,'retry':0,'err':0,'drop':0,'pg_log_ok':0,'pg_log_err':0,'sentry_sent':0,'resub':0,
         'drop_by_reason': {}, 'retry_by_reason': {}, 'pg_stats_ok':0, 'pg_stats_err':0}
start = time.time()
running = True

# v7 — persistência de stats em evo.evolution_rabbit_consumer_stats (criada pelo A1 em paralelo)
REPLICA = socket.gethostname()
_STATS_TABLE = 'evo.evolution_rabbit_consumer_stats'
_STATS_COLS = {  # colunas conhecidas → placeholder SQL (intersectadas com o schema real)
    'collected_at': 'now()',
    'replica': '%s', 'ok': '%s', 'shadow': '%s', 'retry': '%s', 'drop': '%s', 'err': '%s',
    'pg_log_ok': '%s', 'pg_log_err': '%s', 'sentry_sent': '%s', 'resub': '%s',
    'drop_by': '%s', 'retry_by': '%s',
}
_stats_cols = None      # cache do schema real (None = tabela ausente/desconhecida)
_stats_cols_ts = 0.0

def _stats_schema(c):
    """Colunas reais da tabela de stats (cache 10min). None se a tabela não existe."""
    global _stats_cols, _stats_cols_ts
    now = time.time()
    if _stats_cols is not None and now - _stats_cols_ts < 600:
        return _stats_cols
    try:
        with c.cursor() as cur:
            cur.execute(
                "SELECT column_name FROM information_schema.columns "
                "WHERE table_schema='evo' AND table_name='evolution_rabbit_consumer_stats'")
            cols = {r[0] for r in cur.fetchall()}
        _stats_cols = cols if cols else None
        _stats_cols_ts = now
        return _stats_cols
    except Exception:
        return None

def persist_stats():
    """Snapshot [STATS] → evo.evolution_rabbit_consumer_stats (INSERT por ciclo, replica hostname).

    Tabela criada pelo A1 em paralelo — se ausente ou com schema incompatível,
    contabiliza pg_stats_err e loga WARN (nunca quebra o consumo).
    """
    if not PG_URL or not PG_AVAIL:
        return
    c = pg_conn()
    if not c:
        return
    cols = _stats_schema(c)
    if not cols:
        stats['pg_stats_err'] += 1
        if stats['pg_stats_err'] <= 3 or stats['pg_stats_err'] % 20 == 0:
            log.warning(f"stats table {_STATS_TABLE} ausente — snapshot não persistido")
        return
    ins = [k for k in _STATS_COLS if k in cols]
    if not ins:
        return
    values = {
        'replica': REPLICA,
        'ok': stats['ok'], 'shadow': stats['shadow'], 'retry': stats['retry'],
        'drop': stats['drop'], 'err': stats['err'],
        'pg_log_ok': stats['pg_log_ok'], 'pg_log_err': stats['pg_log_err'],
        'sentry_sent': stats['sentry_sent'], 'resub': stats['resub'],
        'drop_by': Json(stats['drop_by_reason']),
        'retry_by': Json(stats['retry_by_reason']),
    }
    try:
        sql = (f"INSERT INTO {_STATS_TABLE} ({','.join(ins)}) "
               f"VALUES ({','.join(_STATS_COLS[k] for k in ins)})")
        params = [values[k] for k in ins if k != 'collected_at']
        with c.cursor() as cur:
            cur.execute(sql, params)
        stats['pg_stats_ok'] += 1
    except Exception as e:
        stats['pg_stats_err'] += 1
        if stats['pg_stats_err'] <= 3 or stats['pg_stats_err'] % 20 == 0:
            log.warning(f"stats persist err: {e}")

def drop_reason(reason):
    """Contabiliza um drop com motivo estruturado (stats['drop'] e drop_by_reason)."""
    stats['drop'] += 1
    stats['drop_by_reason'][reason] = stats['drop_by_reason'].get(reason, 0) + 1

def retry_reason(reason):
    """Contabiliza um requeue com motivo estruturado (stats['retry'] e retry_by_reason)."""
    stats['retry'] += 1
    stats['retry_by_reason'][reason] = stats['retry_by_reason'].get(reason, 0) + 1

def delivery_attempts(method, properties):
    """Nº de tentativas de entrega da mensagem (1 = primeira).

    Usa o header x-death do RabbitMQ (incrementado a cada requeue) e cai
    para o flag redelivered quando o header não existe (1a entrega).
    """
    try:
        deaths = (properties.headers or {}).get('x-death') or []
        total = 0
        for d in deaths:
            if isinstance(d, dict):
                total += int(d.get('count', 1) or 1)
        if total:
            return total + 1
    except Exception:
        pass
    return 2 if getattr(method, 'redelivered', False) else 1

def parse_retry_after(r):
    """Retry-After em segundos (RFC 7231). HTTP-date → None (usa backoff computado)."""
    try:
        ra = r.headers.get('Retry-After')
    except Exception:
        return None
    if not ra:
        return None
    try:
        return max(0, int(str(ra).strip()))
    except (TypeError, ValueError):
        return None

def backoff_delay(attempts, retry_after=None):
    """Delay do requeue: exponencial com teto, dominado por Retry-After quando presente."""
    delay = min(BACKOFF_BASE * (BACKOFF_FACTOR ** (attempts - 1)), BACKOFF_MAX)
    if retry_after is not None:
        delay = max(delay, retry_after)
    return delay

def body_is_json(r):
    """Discrimina 4xx da edge (body JSON) de 4xx do gateway (HTML/empty — S-09/S3)."""
    try:
        ct = (r.headers.get('Content-Type') or '').lower()
    except Exception:
        ct = ''
    if 'json' in ct:
        return True
    if 'html' in ct:
        return False
    text = (r.text or '').strip()
    if not text:
        return False
    try:
        json.loads(text)
        return True
    except Exception:
        return False

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
            attempts = delivery_attempts(method, properties)
            # (a) 429 = rate limit → sempre transiente (retry, honra Retry-After)
            # (b) 4xx com body NÃO-JSON (HTML/empty do gateway) → transiente
            if r.status_code == 429 or not body_is_json(r):
                if attempts >= MAX_DELIVERY:
                    # teto de tentativas atingido — drop definitivo p/ evitar hot loop (S-09/S2)
                    ch.basic_ack(delivery_tag=tag)
                    drop_reason(f'4xx:{r.status_code}:max_attempts')
                    log_event(evt, 'rabbitmq-consumer', r.status_code, latency_ms,
                              f'max_attempts={attempts} body_head={r.text[:200]!r}')
                    log.error(f"[DROP {r.status_code}] {endpoint_path} reason=4xx:{r.status_code}:max_attempts "
                              f"attempts={attempts}/{MAX_DELIVERY} body[:150]={r.text[:150]!r}")
                    report_to_sentry(msg=f"[4xx:max_attempts] {r.status_code} {endpoint_path} attempts={attempts}",
                                     extras={'body': r.text[:500], 'rk': rk})
                else:
                    retry_after = parse_retry_after(r)
                    delay = backoff_delay(attempts, retry_after)
                    retry_reason(f'4xx:{r.status_code}')
                    log_event(evt, 'rabbitmq-consumer', r.status_code, latency_ms,
                              f'retry attempt {attempts}/{MAX_DELIVERY}')
                    log.warning(f"[RETRY {r.status_code}] {endpoint_path} "
                                f"reason={'rate_limit' if r.status_code == 429 else 'gateway_non_json'} "
                                f"attempt={attempts}/{MAX_DELIVERY} delay={delay:.0f}s "
                                f"retry_after={retry_after} body[:150]={r.text[:150]!r}")
                    if r.status_code != 404 and attempts == 1:
                        report_to_sentry(msg=f"[4xx-transient] {r.status_code} {endpoint_path}",
                                         extras={'body': r.text[:500], 'rk': rk})
                    time.sleep(delay)  # backoff ANTES do requeue (pacing em todas as réplicas)
                    ch.basic_nack(delivery_tag=tag, requeue=True)
            else:
                # (c) 4xx com body JSON = erro aplicativo da edge → drop definitivo
                ch.basic_ack(delivery_tag=tag)
                drop_reason(f'4xx:{r.status_code}')
                log_event(evt, 'rabbitmq-consumer', r.status_code, latency_ms, r.text[:200])
                log.warning(f"[DROP {r.status_code}] {endpoint_path} reason=4xx:{r.status_code} "
                            f"(json edge) body[:150]={r.text[:150]!r}")
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
    log.info(f"consumer v7 | SHADOW={SHADOW} | prefixes={PREFIXES} | queues={len(QUEUES)} | "
             f"PG_LOG={'on' if PG_URL and PG_AVAIL else 'off'} | SENTRY={'on' if SENTRY_DSN and SENTRY_AVAIL else 'off'} | "
             f"MAX_DELIVERY={MAX_DELIVERY} | BACKOFF={BACKOFF_BASE}*{BACKOFF_FACTOR}^n cap={BACKOFF_MAX}s | "
             f"STATS_PG={_STATS_TABLE} ({'on' if PG_URL and PG_AVAIL else 'off'})")
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
                             f"drop_by={json.dumps(stats['drop_by_reason'], separators=(',',':'))} "
                             f"retry_by={json.dumps(stats['retry_by_reason'], separators=(',',':'))} "
                             f"pg_stats_ok={stats['pg_stats_ok']} pg_stats_err={stats['pg_stats_err']}")
                    if stats['drop'] > 0:
                        log.info(f"[DROP-REASONS] drop={stats['drop']} "
                                 f"drop_by={json.dumps(stats['drop_by_reason'], separators=(',',':'))}")
                    persist_stats()
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
