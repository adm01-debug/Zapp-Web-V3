#!/bin/sh
# ============================================================================
# docker-entrypoint.sh (evolution-api-custom)
# Entrypoint da imagem custom: NÃO executa logpatch — os patches T1-T6 são
# aplicados em BUILD-TIME (main.patched.js + libsignal).
# Exporta os secrets do Swarm com o MESMO mapeamento do entrypoint oficial
# (nomes de env esperados pela aplicação).
# Registra o boot em evo.evolution_logpatch_audit (A-8) — best-effort.
#
# etapa-27 (2026-08-08): usa evolution_app (menor privilégio) como conexão
# principal. O superuser (evolution_db_uri_v1) é carregado APENAS como
# fallback explícito e logado — nunca silencioso. RUNTIME_URI deixou de ser
# código morto.
# ============================================================================
set -e

# --- Conexão principal: evolution_app (SELECT/INSERT/UPDATE/DELETE; sem DDL) ---
if [ -f /run/secrets/evolution_db_uri_evolution_app_v1 ]; then
  _app_uri="$(cat /run/secrets/evolution_db_uri_evolution_app_v1 | tr -d '\n\r')"
  if [ -n "$_app_uri" ]; then
    export DATABASE_CONNECTION_URI="$_app_uri"
    echo "[entrypoint] DATABASE_CONNECTION_URI = evolution_app (least-privilege)" >&2
  fi
fi

# --- Fallback: superuser (apenas se evolution_app não disponível) ---
# Não deve ser necessário em produção. Logado explicitamente para auditoria.
if [ -z "$DATABASE_CONNECTION_URI" ]; then
  if [ -f /run/secrets/evolution_db_uri_v1 ]; then
    export DATABASE_CONNECTION_URI="$(cat /run/secrets/evolution_db_uri_v1 | tr -d '\n\r')"
    echo "[entrypoint] WARN: DATABASE_CONNECTION_URI = superuser fallback (evolution_app secret ausente)" >&2
  fi
fi

[ -f /run/secrets/evolution_api_key_v4_20260704 ] && export AUTHENTICATION_API_KEY="$(cat /run/secrets/evolution_api_key_v4_20260704 | tr -d '\n\r')"
[ -f /run/secrets/r2_s3_access_key_v2 ]           && export S3_ACCESS_KEY="$(cat /run/secrets/r2_s3_access_key_v2 | tr -d '\n\r')"
[ -f /run/secrets/r2_s3_secret_key_v2 ]           && export S3_SECRET_KEY="$(cat /run/secrets/r2_s3_secret_key_v2 | tr -d '\n\r')"
[ -f /run/secrets/rabbitmq_url_evolution_v1 ]      && export RABBITMQ_URI="$(cat /run/secrets/rabbitmq_url_evolution_v1 | tr -d '\n\r')"
[ -f /run/secrets/metrics_password_v2 ]            && export METRICS_PASSWORD="$(cat /run/secrets/metrics_password_v2 | tr -d '\n\r')"
[ -f /run/secrets/wa_business_verify_token_v1 ]    && export WA_BUSINESS_TOKEN_WEBHOOK="$(cat /run/secrets/wa_business_verify_token_v1 | tr -d '\n\r')"
# v4 (2026-08-10): CACHE_REDIS_URI vem de secret (ACL do Redis com senha) —
# nunca no env do stack (evita senha em claro no Portainer).
[ -f /run/secrets/evolution_cache_redis_uri_v1 ]   && export CACHE_REDIS_URI="$(cat /run/secrets/evolution_cache_redis_uri_v1 | tr -d '\n\r')"

# --- A-8: auditoria de boot (best-effort; nunca quebra o boot) ---
if [ -f /run/secrets/supabase_service_key_v1 ]; then
  _aud_key="$(cat /run/secrets/supabase_service_key_v1 | tr -d '\n\r')"
  if [ -n "$_aud_key" ]; then
    _aud_digest="$(cat /proc/self/mountinfo 2>/dev/null | grep -o 'sha256:[a-f0-9]\{64\}' | head -1 || true)"
    _aud_version="$(node -e "console.log(require('/evolution/package.json').version)" 2>/dev/null || echo unknown)"
    _aud_ts="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    _aud_payload="{\"instance_name\":\"wpp2\",\"booted_at\":\"$_aud_ts\",\"image_digest\":\"$_aud_digest\",\"evolution_version\":\"$_aud_version\",\"logpatch_status\":\"ok\",\"logpatch_detail\":{\"mode\":\"build-time\",\"db_role\":\"evolution_app\",\"note\":\"patches T1-T6 build-time; etapa-27 least-privilege\"}}"
    if command -v curl >/dev/null 2>&1; then
      curl -sS -o /dev/null -m 10 -X POST \
        "https://supabase.atomicabr.com.br/rest/v1/evolution_logpatch_audit" \
        -H "apikey: $_aud_key" \
        -H "Authorization: Bearer $_aud_key" \
        -H "Content-Type: application/json" \
        -H "Prefer: return=minimal" \
        --data-binary "$_aud_payload" >/dev/null 2>&1 || true
    else
      wget -q -O /dev/null --timeout=10 \
        --header="apikey: $_aud_key" \
        --header="Authorization: Bearer $_aud_key" \
        --header="Content-Type: application/json" \
        --header="Prefer: return=minimal" \
        --post-data "$_aud_payload" \
        "https://supabase.atomicabr.com.br/rest/v1/evolution_logpatch_audit" >/dev/null 2>&1 || true
    fi
  fi
fi

# Patches são build-time — nada de logpatch.cjs aqui.
# Entrypoint termina com exec para passar sinais corretamente ao processo Node.
exec "$@"
