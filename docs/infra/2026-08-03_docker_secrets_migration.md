# Docker Secrets Migration — supabase_functions
# Date: 2026-08-03
# Status: Secrets existem no Swarm, NÃO montados no serviço
# Ação: Adicionar ao docker-compose.yml da stack supabase

# 1. Adicionar secrets ao serviço supabase_functions:
#
# services:
#   functions:
#     secrets:
#       - supabase_db_password_v1
#       - supabase_jwt_secret_v1
#       - supabase_service_key_v1
#       - supabase_evolution_webhook_secret_v1
#       - deepseek_api_key_v2           # ← NOVO
#       - evolution_api_key_v4_20260704  # ← NOVO
#
# 2. Atualizar o entrypoint para exportar:
#    entrypoint: /bin/sh -c "
#      export DEEPSEEK_API_KEY=$(cat /run/secrets/deepseek_api_key_v2) &&
#      export EVOLUTION_API_KEY=$(cat /run/secrets/evolution_api_key_v4_20260704) &&
#      ... resto ...
#      exec edge-runtime start --main-service /home/deno/functions/main"
#
# 3. Remover do environment:
#    - DEEPSEEK_API_KEY=sk-a330...   ← REMOVER
#    - EVOLUTION_API_KEY=2D10...     ← REMOVER
#
# 4. Deploy: docker stack deploy -c docker-compose.yml supabase
# 5. Validar: curl -X POST .../functions/v1/ai-proxy → 401 (não 500)
#
# NOTA: SENTRY_DSN e SUPABASE_ANON_KEY são semi-públicos por design —
# permanecem como env vars (não são secrets).
