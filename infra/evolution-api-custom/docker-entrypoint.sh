#!/bin/sh
# ============================================================================
# docker-entrypoint.sh (evolution-api-custom)
# Entrypoint da imagem custom: NÃO executa logpatch — os patches T1-T5 são
# aplicados em BUILD-TIME (main.patched.js + libsignal).
# Exporta os secrets do Swarm com o MESMO mapeamento do entrypoint oficial
# (nomes de env esperados pela aplicação).
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

# Patches são build-time — nada de logpatch.cjs aqui.
exec node dist/main.js
