#!/bin/sh
# zapp-health-guard v2 — sondas backend/frontend (v1) + KPIs do pipeline Evolution (auditoria 04/07/2026)
# KPIs: pipeline_lag, edge_error_rate, ghost_events, mirror_freshness, rabbitmq_backlog
# Reconstruido 2026-08-05: o base64 gzip embutido no compose do stack 165 estava truncado
# (gunzip: crc error -> /tmp/mon.sh corrompido -> exit 2). Este arquivo e a fonte canônica;
# gere o base64 com: python -c "import gzip,base64;print(base64.b64encode(gzip.compress(open('mon_health.sh','rb').read(),9)).decode())"
# Requisitos no container (postgres:15-alpine): apk add curl jq + psql (imagem postgres) + getent
set -u
: "${CHECK_INTERVAL:=60}"; : "${FAIL_THRESHOLD:=3}"; : "${FE_EVERY:=15}"; : "${KPI_EVERY:=5}"; : "${ALERT_WEBHOOK_URL:=}"
: "${ANON:?anon requerida}"; : "${SUPA:=https://supabase.atomicabr.com.br}"
: "${FE:=https://zapp-web-v3.vercel.app}"; : "${EXPECT_HOST:=supabase.atomicabr.com.br}"
export PGCONNECT_TIMEOUT=8

if [ -r /run/secrets/supabase_db_password_v1 ]; then
  PGPASSWORD="$(cat /run/secrets/supabase_db_password_v1)"; export PGPASSWORD; DB_OK=1
else DB_OK=0; echo "[health-guard] WARN: secret db ausente -> persistencia off"; fi

PG_EVO=""; [ -r /run/secrets/pg_evolution_url_n8n_app_v1 ] && PG_EVO="$(cat /run/secrets/pg_evolution_url_n8n_app_v1)"
RUSER=""; RPASS=""
if [ -r /run/secrets/rabbitmq_url_evolution_v2 ]; then
  RURI="$(cat /run/secrets/rabbitmq_url_evolution_v2)"
  RUSER=$(printf '%s' "$RURI" | sed -E 's|amqps?://([^:]+):.*|\1|')
  RPASS=$(printf '%s' "$RURI" | sed -E 's|amqps?://[^:]+:([^@]+)@.*|\1|')
fi

ts() { date -Iseconds; }
db_ensure() { [ "$DB_OK" = 1 ] || return 0
  psql -h db -p 5432 -U postgres -d postgres -tA -c "CREATE SCHEMA IF NOT EXISTS ops; CREATE TABLE IF NOT EXISTS ops.uptime_log(id bigserial primary key, at timestamptz not null default now(), probe text not null, event text not null, http_code text, detail text);" >/dev/null 2>&1 && echo "[health-guard] ops.uptime_log pronta" || echo "[health-guard] WARN: falha ao garantir ops.uptime_log"; }
db_log() { [ "$DB_OK" = 1 ] || return 0; D=$(printf '%s' "$4" | sed "s/'/''/g")
  psql -h db -p 5432 -U postgres -d postgres -tA -c "INSERT INTO ops.uptime_log(probe,event,http_code,detail) VALUES('$1','$2','$3','$D');" >/dev/null 2>&1 || true; }
notify() { echo "[health-guard] *** $2 *** $(ts) probe=$1 code=$3 :: $4"; db_log "$1" "$2" "$3" "$4"
  [ -n "$ALERT_WEBHOOK_URL" ] || return 0
  curl -s -m 10 -X POST -H 'Content-Type: application/json' -d "{\"service\":\"$1\",\"event\":\"$2\",\"http_code\":\"$3\",\"detail\":\"$4\",\"at\":\"$(ts)\"}" "$ALERT_WEBHOOK_URL" >/dev/null 2>&1 || true; }
supa_q() { psql -h db -p 5432 -U postgres -d postgres -tA -c "$1" 2>/dev/null; }
evo_q() { [ -n "$PG_EVO" ] && psql "$PG_EVO" -tA -c "$1" 2>/dev/null; }

# track <VAR_FALHAS> <VAR_ESTADO> <ok:1|0> — contador de falhas consecutivas + maquina
# de estados (up/down). Transicao up->down so apos FAIL_THRESHOLD falhas consecutivas;
# down->up no primeiro sucesso. Resultado em $TRANS: down|recovered|""
TRANS=""
track() {
  fvar="$1"; svar="$2"; ok="$3"
  TRANS=""
  eval "f=\${$fvar}"; eval "s=\${$svar}"
  if [ "$ok" -eq 1 ]; then
    eval "$fvar=0"
    if [ "$s" != "up" ]; then eval "$svar=up"; TRANS="recovered"; fi
  else
    f=$((f + 1)); eval "$fvar=$f"
    if [ "$s" != "down" ] && [ "$f" -ge "$FAIL_THRESHOLD" ]; then eval "$svar=down"; TRANS="down"; fi
  fi
}

as_int() { v="$1"; case "$v" in ''|*[!0-9-]*) echo 0;; -*) echo 0;; *) echo "$v";; esac; }

trap 'echo "[health-guard] encerrando $(ts)"; exit 0' TERM INT

# diagnostico de boot: binarios e DNS
for C in curl jq psql getent sed; do
  command -v "$C" >/dev/null 2>&1 || echo "[health-guard] WARN: binario '$C' ausente"
done
getent hosts db >/dev/null 2>&1 || echo "[health-guard] WARN: DNS 'db' nao resolve"

# tabela de webhook events ativa: particao mensal mais recente com linhas (2026_07 hoje)
EVO_TBL="evolution_webhook_events_v2_2026_07"
if [ -n "$PG_EVO" ]; then
  for T in $(supa_q "SELECT tablename FROM pg_tables WHERE schemaname='evo' AND tablename LIKE 'evolution_webhook_events_v2_2026_%' ORDER BY tablename DESC;"); do
    N=$(supa_q "SELECT count(*) FROM evo.${T};")
    case "$N" in ''|*[!0-9]*) N=0;; esac
    if [ "$N" -gt 0 ] 2>/dev/null; then EVO_TBL="$T"; break; fi
  done
fi

echo "[health-guard] boot v2 $(ts) | backend=$SUPA/rest/v1/ | fe=$FE | interval=${CHECK_INTERVAL}s kpi_every=${KPI_EVERY} | pg_evo=$([ -n "$PG_EVO" ] && echo yes || echo no) rmq=$([ -n "$RUSER" ] && echo yes || echo no) evo_tbl=$EVO_TBL"
db_ensure

BE_FAILS=0; BE_STATE=up; FE_FAILS=0; FE_STATE=up; ITER=0
LAG_F=0; LAG_S=up; ERR_F=0; ERR_S=up; GHO_F=0; GHO_S=up; MIR_F=0; MIR_S=up; RMQ_F=0; RMQ_S=up
LAG_V="-"; ERR_V="-"; GHO_V="-"; MIR_V="-"; RMQ_V="-"

while true; do
  ITER=$((ITER + 1))

  # ---------- sonda backend: curl $SUPA/rest/v1/ com apikey (Bearer $ANON), espera 200 ----------
  CODE=$(curl -s -m 15 -o /dev/null -w '%{http_code}' -H "apikey: $ANON" -H "Authorization: Bearer $ANON" "$SUPA/rest/v1/" 2>/dev/null)
  if [ "$CODE" = 200 ]; then
    track BE_FAILS BE_STATE 1; [ "$TRANS" = "recovered" ] && notify backend RECOVERED 200 "backend voltou a responder"
  else
    track BE_FAILS BE_STATE 0; [ "$TRANS" = "down" ] && notify backend ALERT "${CODE:-000}" "backend fora (http ${CODE:-sem resposta})"
  fi

  # ---------- sonda frontend (a cada FE_EVERY iteracoes): host esperado + token JWT eyJ... no HTML ----------
  if [ $((ITER % FE_EVERY)) -eq 0 ]; then
    FCODE=$(curl -s -m 25 -o /dev/null -w '%{http_code}' "$FE" 2>/dev/null)
    if [ "$FCODE" = 200 ]; then
      HTML=$(curl -s -m 25 "$FE" 2>/dev/null)
      if printf '%s' "$HTML" | grep -q "$EXPECT_HOST"; then
        track FE_FAILS FE_STATE 1; [ "$TRANS" = "recovered" ] && notify frontend RECOVERED 200 "frontend ok (host presente)"
      else
        track FE_FAILS FE_STATE 0; [ "$TRANS" = "down" ] && notify frontend ALERT "${FCODE:-000}" "host esperado ausente no HTML"
      fi
    else
      track FE_FAILS FE_STATE 0; [ "$TRANS" = "down" ] && notify frontend ALERT "${FCODE:-000}" "frontend fora (http ${FCODE:-sem resposta})"
    fi
  fi

  # ---------- KPIs do pipeline Evolution (a cada KPI_EVERY iteracoes; exigem PG_EVO) ----------
  if [ $((ITER % KPI_EVERY)) -eq 0 ] && [ -n "$PG_EVO" ]; then

    # KPI-1 pipeline_lag: atraso (s) do ultimo evento; alerta se > 900s
    LAG_V=$(supa_q "SELECT COALESCE(EXTRACT(EPOCH FROM (now() - MAX(created_at)))::int, 0) FROM evo.${EVO_TBL};")
    if [ -z "$LAG_V" ]; then
      track LAG_F LAG_S 0; [ "$TRANS" = "down" ] && notify kpi_pipeline_lag ALERT 503 "evo_q sem resposta (fonte indisponivel)"
    else
      LAG_V=$(as_int "$LAG_V")
      if [ "$LAG_V" -le 900 ]; then track LAG_F LAG_S 1; [ "$TRANS" = "recovered" ] && notify kpi_pipeline_lag RECOVERED 200 "lag ${LAG_V}s <= 900s"
      else track LAG_F LAG_S 0; [ "$TRANS" = "down" ] && notify kpi_pipeline_lag ALERT 503 "lag ${LAG_V}s > 900s"; fi
    fi

    # KPI-2 edge_error_rate: % de eventos com status http >= 400 (ou erro) na ultima 1h; alerta se > 5%
    ERR_V=$(supa_q "SELECT COALESCE(round(100.0 * COUNT(*) FILTER (WHERE status ~ '^[45][0-9]{2}\$' OR lower(status) IN ('error','failed','rejected')) / NULLIF(COUNT(*), 0), 1), 0)::int FROM evo.${EVO_TBL} WHERE created_at > now() - interval '1 hour';")
    if [ -z "$ERR_V" ]; then
      track ERR_F ERR_S 0; [ "$TRANS" = "down" ] && notify kpi_edge_error_rate ALERT 503 "evo_q sem resposta (fonte indisponivel)"
    else
      ERR_V=$(as_int "$ERR_V")
      if [ "$ERR_V" -le 5 ]; then track ERR_F ERR_S 1; [ "$TRANS" = "recovered" ] && notify kpi_edge_error_rate RECOVERED 200 "erro ${ERR_V}% <= 5%"
      else track ERR_F ERR_S 0; [ "$TRANS" = "down" ] && notify kpi_edge_error_rate ALERT 503 "erro ${ERR_V}% > 5% (1h)"; fi
    fi

    # KPI-3 ghost_events: eventos com instance desconhecida na ultima 1h; alerta se > 20
    # LIMITACAO (regression review R7 2026-08-06): a checagem de instancia
    # desconhecida via NOT IN (evo.evolution_instances) foi removida porque a
    # tabela nao existe — hoje detecta apenas instance_name NULL/vazio.
    # Instancias fantasma com nome invalido (fora da fonte de verdade real)
    # nao disparam alerta. Mapear contra zapp.whatsapp_connections exige
    # normalizacao de nomes (instance da Evolution vs connection name do app)
    # e fica como melhoria; nao fazer aqui para evitar falso-positivo.
    GHO_V=$(supa_q "SELECT COUNT(*) FROM evo.${EVO_TBL} e WHERE e.created_at > now() - interval '1 hour' AND (e.instance_name IS NULL OR e.instance_name = '');")
    if [ -z "$GHO_V" ]; then
      track GHO_F GHO_S 0; [ "$TRANS" = "down" ] && notify kpi_ghost_events ALERT 503 "evo_q sem resposta (fonte indisponivel)"
    else
      GHO_V=$(as_int "$GHO_V")
      if [ "$GHO_V" -le 20 ]; then track GHO_F GHO_S 1; [ "$TRANS" = "recovered" ] && notify kpi_ghost_events RECOVERED 200 "ghosts ${GHO_V} <= 20"
      else track GHO_F GHO_S 0; [ "$TRANS" = "down" ] && notify kpi_ghost_events ALERT 503 "ghosts ${GHO_V} > 20 (1h)"; fi
    fi

    # KPI-4 mirror_freshness: idade (s) do ultimo evento em evolution_messages_wpp2; alerta se > 24h (86400s)
    MIR_V=$(supa_q "SELECT COALESCE(EXTRACT(EPOCH FROM (now() - MAX(created_at)))::int, 0) FROM evo.evolution_messages_wpp2;")
    if [ -z "$MIR_V" ]; then
      track MIR_F MIR_S 0; [ "$TRANS" = "down" ] && notify kpi_mirror_freshness ALERT 503 "evo_q sem resposta (fonte indisponivel)"
    else
      MIR_V=$(as_int "$MIR_V")
      if [ "$MIR_V" -le 86400 ]; then track MIR_F MIR_S 1; [ "$TRANS" = "recovered" ] && notify kpi_mirror_freshness RECOVERED 200 "mirror ${MIR_V}s <= 24h"
      else track MIR_F MIR_S 0; [ "$TRANS" = "down" ] && notify kpi_mirror_freshness ALERT 503 "mirror parado ha ${MIR_V}s > 24h"; fi
    fi

    # KPI-5 rabbitmq_backlog: API management http://rabbitmq:15672/api/queues (auth RUSER:RPASS) + jq;
    # alerta se fila nao-dlq com messages > 200 OU qualquer dlq com messages > 0
    RMQ_JSON=$(curl -s -m 12 -u "$RUSER:$RPASS" "http://rabbitmq:15672/api/queues" 2>/dev/null)
    case "$RMQ_JSON" in
      '['*)
        RMQ_V=$(printf '%s' "$RMQ_JSON" | jq '[.[] | select((( .name | test("dlq"; "i") ) and .messages > 0) or (( .name | test("dlq"; "i") | not ) and .messages > 200))] | length' 2>/dev/null)
        RMQ_V=$(as_int "$RMQ_V")
        if [ "$RMQ_V" -le 0 ]; then track RMQ_F RMQ_S 1; [ "$TRANS" = "recovered" ] && notify kpi_rabbitmq_backlog RECOVERED 200 "backlog ok (0 filas em alerta)"
        else track RMQ_F RMQ_S 0; [ "$TRANS" = "down" ] && notify kpi_rabbitmq_backlog ALERT 503 "backlog: ${RMQ_V} fila(s) em alerta (nao-dlq >200 msgs ou dlq >0)"; fi
        ;;
      *)
        RMQ_V="-"; track RMQ_F RMQ_S 0; [ "$TRANS" = "down" ] && notify kpi_rabbitmq_backlog ALERT 503 "api rabbitmq inacessivel ou auth falhou"
        ;;
    esac
  fi

  echo "[health-guard] iter=$ITER $(ts) be=$CODE fe=$FE_STATE lag=${LAG_V}s err=${ERR_V}% ghost=${GHO_V} mir=${MIR_V}s rmq=${RMQ_V}"
  sleep "$CHECK_INTERVAL"
done
