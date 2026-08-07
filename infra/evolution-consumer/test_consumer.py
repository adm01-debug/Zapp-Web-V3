"""Testes do consumer v7 — 100% stdlib, sem dependências externas.

Roda:  python test_consumer.py   (ou: python -m unittest test_consumer)

Cobre a lógica do fix v7 (REC-07-09/10, S-09):
  - 429 (rate limit) -> nack+requeue com backoff, honrando Retry-After
  - 4xx do gateway (body NÃO-JSON: HTML/empty) -> nack+requeue (transiente)
  - 4xx com body JSON (erro aplicativo da edge) -> drop definitivo
  - teto MAX_DELIVERY -> drop com reason '4xx:<status>:max_attempts' (sem hot loop)
  - 2xx/5xx mantêm o comportamento v6 (ack / nack+requeue)
"""
import json
import os
import sys
import types
import unittest
from pathlib import Path

# --- stubs p/ importar consumer.py sem dependências externas nem efeitos ---
def _stub(modname, **attrs):
    m = types.ModuleType(modname)
    for k, v in attrs.items():
        setattr(m, k, v)
    sys.modules[modname] = m
    return m

_stub('pika',
      URLParameters=lambda u: types.SimpleNamespace(heartbeat=60, connection_attempts=3, retry_delay=5),
      BlockingConnection=lambda p: None)
_stub('requests', post=lambda *a, **k: None)
_stub('psycopg2')
_stub('psycopg2.extras', Json=lambda x: x)
_stub('sentry_sdk', init=lambda **k: None,
      push_scope=lambda: types.SimpleNamespace(
          __enter__=lambda s: s, __exit__=lambda *a: None))

os.environ.update({
    'RABBITMQ_URL': 'amqp://guest:guest@localhost:5672/%2f',
    'SUPABASE_URL': 'http://localhost:8000',
    'WEBHOOK_SECRET': 'test-secret',
    'SHADOW_MODE': 'false',
    'INSTANCE_PREFIX': 'wpp2',
    'BACKOFF_BASE': '0',    # testes rápidos (delay 0)
    'BACKOFF_MAX': '0',
    'BACKOFF_FACTOR': '2',
    'MAX_DELIVERY': '4',    # teto baixo p/ exercitar o cap
    'RESUB_INTERVAL': '9999',
})

_SRC = Path(__file__).parent.joinpath('consumer.py').read_text(encoding='utf-8')
assert _SRC.rstrip().endswith('main()'), 'consumer.py deve terminar com main()'
ns = {}
exec(compile(_SRC[:_SRC.rstrip().rfind('main()')], 'consumer.py', 'exec'), ns)


class FakeResp:
    def __init__(self, status, text='', headers=None):
        self.status_code = status
        self.text = text
        self.headers = headers or {}


class FakeCh:
    def __init__(self):
        self.acks = []
        self.nacks = []

    def basic_ack(self, delivery_tag=None, **k):
        self.acks.append(delivery_tag)

    def basic_nack(self, delivery_tag=None, requeue=False, **k):
        self.nacks.append((delivery_tag, requeue))


class FakeMethod:
    def __init__(self, tag=1, rk='wpp2.messages.upsert', redelivered=False):
        self.delivery_tag = tag
        self.routing_key = rk
        self.redelivered = redelivered


def make_props(deaths=None):
    headers = {}
    if deaths is not None:
        headers['x-death'] = deaths
    return types.SimpleNamespace(headers=headers or None)


class TestBodyIsJson(unittest.TestCase):
    def test_empty_body(self):
        self.assertFalse(ns['body_is_json'](FakeResp(404, '')))

    def test_gateway_404_text_plain(self):
        # fingerprint Traefik do REC-07-09: '404 page not found'
        self.assertFalse(ns['body_is_json'](
            FakeResp(404, '404 page not found', {'Content-Type': 'text/plain; charset=utf-8'})))

    def test_gateway_html(self):
        self.assertFalse(ns['body_is_json'](
            FakeResp(502, '<html><body>Bad Gateway</body></html>', {'Content-Type': 'text/html'})))

    def test_edge_json_ct(self):
        self.assertTrue(ns['body_is_json'](
            FakeResp(400, '{"error":"bad"}', {'Content-Type': 'application/json'})))

    def test_edge_json_sem_ct(self):
        self.assertTrue(ns['body_is_json'](FakeResp(422, '{"error":"x"}')))

    def test_texto_plano_sem_json(self):
        self.assertFalse(ns['body_is_json'](FakeResp(404, 'not found', {'Content-Type': 'text/plain'})))


class TestDeliveryAttempts(unittest.TestCase):
    def test_primeira_entrega(self):
        self.assertEqual(ns['delivery_attempts'](FakeMethod(), make_props()), 1)

    def test_redelivered_sem_xdeath(self):
        self.assertEqual(ns['delivery_attempts'](FakeMethod(redelivered=True), make_props()), 2)

    def test_xdeath_um_requeue(self):
        self.assertEqual(ns['delivery_attempts'](FakeMethod(), make_props([{'count': 1}])), 2)

    def test_xdeath_multiplos(self):
        self.assertEqual(ns['delivery_attempts'](FakeMethod(), make_props([{'count': 1}, {'count': 3}])), 5)

    def test_headers_none(self):
        self.assertEqual(ns['delivery_attempts'](FakeMethod(), types.SimpleNamespace(headers=None)), 1)


class TestBackoffDelay(unittest.TestCase):
    def setUp(self):
        self._base, self._max = ns['BACKOFF_BASE'], ns['BACKOFF_MAX']
        ns['BACKOFF_BASE'], ns['BACKOFF_MAX'] = 1.0, 60.0

    def tearDown(self):
        ns['BACKOFF_BASE'], ns['BACKOFF_MAX'] = self._base, self._max

    def test_exponencial(self):
        self.assertEqual(ns['backoff_delay'](1), 1)
        self.assertEqual(ns['backoff_delay'](2), 2)
        self.assertEqual(ns['backoff_delay'](3), 4)
        self.assertEqual(ns['backoff_delay'](4), 8)

    def test_cap(self):
        self.assertEqual(ns['backoff_delay'](10), 60)   # min(1*2^9, 60)

    def test_retry_after_domina(self):
        self.assertEqual(ns['backoff_delay'](1, retry_after=7), 7)
        self.assertEqual(ns['backoff_delay'](4, retry_after=3), 8)  # backoff maior vence


class TestParseRetryAfter(unittest.TestCase):
    def test_segundos(self):
        self.assertEqual(ns['parse_retry_after'](FakeResp(429, '', {'Retry-After': '30'})), 30)

    def test_ausente(self):
        self.assertIsNone(ns['parse_retry_after'](FakeResp(429, '')))

    def test_http_date_ignorado(self):
        self.assertIsNone(ns['parse_retry_after'](
            FakeResp(429, '', {'Retry-After': 'Thu, 01 Jan 2026 00:00:00 GMT'})))


class TestHandle(unittest.TestCase):
    def setUp(self):
        ns['stats'].update(ok=0, shadow=0, retry=0, err=0, drop=0,
                           pg_log_ok=0, pg_log_err=0, sentry_sent=0, resub=0,
                           drop_by_reason={}, retry_by_reason={})

    def _run(self, status, text='', headers=None, deaths=None, redelivered=False):
        ch = FakeCh()
        resp = FakeResp(status, text, headers)
        ns['requests'].post = lambda *a, **k: resp
        body = json.dumps({'event': 'messages.upsert',
                           'data': {'instanceId': 'wpp2'}}).encode()
        ns['handle'](ch, FakeMethod(redelivered=redelivered), make_props(deaths), body)
        return ch

    def test_2xx_ack(self):
        ch = self._run(200, '{}')
        self.assertEqual(ch.acks, [1])
        self.assertEqual(ch.nacks, [])
        self.assertEqual(ns['stats']['ok'], 1)

    def test_429_requeue_com_backoff(self):
        ch = self._run(429, '{"error":"rate_limit_exceeded"}', {'Content-Type': 'application/json'})
        self.assertEqual(ch.acks, [])
        self.assertEqual(len(ch.nacks), 1)
        self.assertTrue(ch.nacks[0][1])  # requeue=True
        self.assertEqual(ns['stats']['retry'], 1)
        self.assertEqual(ns['stats']['retry_by_reason'].get('4xx:429'), 1)

    def test_429_respeita_retry_after(self):
        ns['BACKOFF_BASE'], ns['BACKOFF_MAX'] = 1.0, 60.0
        delays = []
        orig_sleep = ns['time'].sleep
        ns['time'].sleep = lambda d: delays.append(d)
        try:
            ch = self._run(429, '{}', {'Retry-After': '7'})
        finally:
            ns['time'].sleep = orig_sleep
            ns['BACKOFF_BASE'], ns['BACKOFF_MAX'] = 0.0, 0.0
        self.assertEqual(len(ch.nacks), 1)
        self.assertGreaterEqual(delays[0], 7)

    def test_404_html_gateway_requeue(self):
        # REC-07-09: '404 page not found' do Traefik -> transiente
        ch = self._run(404, '404 page not found', {'Content-Type': 'text/plain; charset=utf-8'})
        self.assertEqual(ch.acks, [])
        self.assertEqual(len(ch.nacks), 1)
        self.assertTrue(ch.nacks[0][1])
        self.assertEqual(ns['stats']['retry_by_reason'].get('4xx:404'), 1)

    def test_404_empty_gateway_requeue(self):
        ch = self._run(404, '')
        self.assertEqual(ch.acks, [])
        self.assertEqual(len(ch.nacks), 1)
        self.assertTrue(ch.nacks[0][1])

    def test_404_json_edge_drop(self):
        # S-09/S3: 404 JSON da edge = endpoint inexistente -> drop definitivo
        ch = self._run(404, '{"error":"route not found"}', {'Content-Type': 'application/json'})
        self.assertEqual(ch.acks, [1])
        self.assertEqual(ch.nacks, [])
        self.assertEqual(ns['stats']['drop'], 1)
        self.assertEqual(ns['stats']['drop_by_reason'].get('4xx:404'), 1)

    def test_400_json_drop(self):
        ch = self._run(400, '{"error":"bad request"}', {'Content-Type': 'application/json'})
        self.assertEqual(ch.acks, [1])
        self.assertEqual(ns['stats']['drop'], 1)
        self.assertEqual(ns['stats']['drop_by_reason'].get('4xx:400'), 1)

    def test_max_attempts_ainda_requeue(self):
        # attempts=3 (x-death count=2) < MAX_DELIVERY=4 -> requeue
        ch = self._run(429, '{}', deaths=[{'count': 2}])
        self.assertEqual(ch.acks, [])
        self.assertEqual(len(ch.nacks), 1)

    def test_max_attempts_drop_definitivo(self):
        # attempts=4 (x-death count=3) >= MAX_DELIVERY=4 -> drop sem hot loop
        ch = self._run(429, '{}', deaths=[{'count': 3}])
        self.assertEqual(ch.acks, [1])
        self.assertEqual(ch.nacks, [])
        self.assertEqual(ns['stats']['drop_by_reason'].get('4xx:429:max_attempts'), 1)

    def test_5xx_requeue_preservado(self):
        ch = self._run(502, 'Bad Gateway')
        self.assertEqual(ch.acks, [])
        self.assertEqual(len(ch.nacks), 1)
        self.assertTrue(ch.nacks[0][1])
        self.assertEqual(ns['stats']['retry'], 1)


class FakeCursor:
    def __init__(self, rows=None):
        self.rows = rows or []
        self.executed = []

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False

    def execute(self, sql, params=None):
        self.executed.append((sql, params))

    def fetchall(self):
        return self.rows


class FakeConn:
    def __init__(self, rows=None):
        self.cur = FakeCursor(rows)
        self.closed = False
        self.autocommit = False

    def cursor(self):
        return self.cur


class TestPersistStats(unittest.TestCase):
    def setUp(self):
        ns['PG_URL'] = 'postgresql://fake:fake@localhost/evolution'
        ns['_pg_conn'] = None
        ns['_stats_cols'] = None
        ns['_stats_cols_ts'] = 0.0
        ns['stats']['pg_stats_ok'] = 0
        ns['stats']['pg_stats_err'] = 0

    def tearDown(self):
        ns['PG_URL'] = ''

    def test_tabela_ausente_nao_quebra(self):
        # A1 cria a tabela em paralelo — sem ela, persist_stats só WARN (nunca crash)
        conn = FakeConn(rows=[])
        ns['psycopg2'].connect = lambda *a, **k: conn
        ns['persist_stats']()
        self.assertEqual(ns['stats']['pg_stats_err'], 1)
        self.assertEqual(ns['stats']['pg_stats_ok'], 0)
        self.assertTrue(all('INSERT INTO' not in (e[0] or '') for e in conn.cur.executed))

    def test_insert_com_intersecao_e_replica(self):
        cols = [('collected_at',), ('replica',), ('ok',), ('retry',), ('drop',),
                ('drop_by',), ('retry_by',)]
        conn = FakeConn(rows=cols)
        ns['psycopg2'].connect = lambda *a, **k: conn
        ns['stats'].update(ok=10, retry=2, drop=1, drop_by_reason={'4xx:400': 1},
                           retry_by_reason={'4xx:429': 2})
        ns['persist_stats']()
        self.assertEqual(ns['stats']['pg_stats_ok'], 1)
        sql, params = conn.cur.executed[-1]
        self.assertTrue(sql.startswith('INSERT INTO evo.evolution_rabbit_consumer_stats'))
        self.assertIn('collected_at', sql)          # now() inline
        self.assertIn('replica', sql)
        self.assertEqual(params[0], ns['REPLICA'])  # hostname da réplica
        self.assertIn(10, params)                   # ok

    def test_colunas_desconhecidas_ignoradas(self):
        # schema do A1 com coluna extra desconhecida: INSERT só com a interseção
        cols = [('collected_at',), ('replica',), ('ok',), ('instance',)]
        conn = FakeConn(rows=cols)
        ns['psycopg2'].connect = lambda *a, **k: conn
        ns['persist_stats']()
        self.assertEqual(ns['stats']['pg_stats_ok'], 1)
        sql, _ = conn.cur.executed[-1]
        self.assertNotIn('instance', sql)


if __name__ == '__main__':
    unittest.main(verbosity=2)
