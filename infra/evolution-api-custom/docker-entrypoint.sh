#!/bin/sh
# ============================================================================
# docker-entrypoint.sh (evolution-api-custom)
# Entrypoint da imagem custom: NÃO executa logpatch — os patches T1-T5 são
# aplicados em BUILD-TIME (main.patched.js + libsignal).
# Exporta os secrets do Swarm com o MESMO mapeamento do entrypoint oficial
# (nomes de env esperados pela aplicação).
# Registra o boot em evo.evolution_logpatch_audit (A-8) — best-effort.
# ============================================================================
set -e

[ -f /run/secrets/evolution_db_uri_v1 ] && export DATABASE_CONNECTION_URI="$(cat /run/secrets/evolution_db_uri_v1 | tr -d '\n\r')"
RUNTIME_URI=""
[ -f /run/secrets/evolution_db_uri_evolution_app_v1 ] && RUNTIME_URI="$(cat /run/secrets/evolution_db_uri_evolution_app_v1 | tr -d '\n\r')"
[ -f /run/secrets/evolution_api_key_v4_20260704 ] && export AUTHENTICATION_API_KEY="$(cat /run/secrets/evolution_api_key_v4_20260704 | tr -d '\n\r')"
[ -f /run/secrets/r2_s3_access_key_v2 ] && export S3_ACCESS_KEY="$(cat /run/secrets/r2_s3_access_key_v2 | tr -d '\n\r')"
[ -f /run/secrets/r2_s3_secret_key_v2 ] && export S3_SECRET_KEY="$(cat /run/secrets/r2_s3_secret_key_v2 | tr -d '\n\r')"
[ -f /run/secrets/rabbitmq_url_evolution_v1 ] && export RABBITMQ_URI="$(cat /run/secrets/rabbitmq_url_evolution_v1 | tr -d '\n\r')"
[ -f /run/secrets/metrics_password_v2 ] && export METRICS_PASSWORD="$(cat /run/secrets/metrics_password_v2 | tr -d '\n\r')"
[ -f /run/secrets/wa_business_verify_token_v1 ] && export WA_BUSINESS_TOKEN_WEBHOOK="$(cat /run/secrets/wa_business_verify_token_v1 | tr -d '\n\r')"

# --- A-8: auditoria de boot (best-effort; nunca quebra o boot) ---
if [ -f /run/secrets/supabase_service_key_v1 ]; then
  _aud_key="$(cat /run/secrets/supabase_service_key_v1 | tr -d '\n\r')"
  if [ -n "$_aud_key" ]; then
    _aud_digest="$(cat /proc/self/mountinfo 2>/dev/null | grep -o 'sha256:[a-f0-9]\{64\}' | head -1 || true)"
    _aud_version="$(node -e "console.log(require('/evolution/package.json').version)" 2>/dev/null || echo unknown)"
    _aud_ts="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    _aud_payload="{\"instance_name\":\"wpp2\",\"booted_at\":\"$_aud_ts\",\"image_digest\":\"$_aud_digest\",\"evolution_version\":\"$_aud_version\",\"logpatch_status\":\"ok\",\"logpatch_detail\":{\"mode\":\"build-time\",\"note\":\"patches T1-T5 aplicados em build (Dockerfile VERIFY fail-closed)\"}}"
    # Imagem base Alpine: NAO tem curl — usar wget (busybox) com --post-data.
    wget -q -O /dev/null -T 10 \
      --header "apikey: $_aud_key" \
      --header "Authorization: Bearer $_aud_key" \
      --header "Content-Type: application/json" \
      --post-data "$_aud_payload" \
      "https://supabase.atomicabr.com.br/rest/v1/evolution_logpatch_audit" >/dev/null 2>&1 || true
  fi
fi

# Patches são build-time — nada de logpatch.cjs aqui.
exec node dist/main.js
