#!/bin/bash
echo "========================================"
echo "  📋 MEMORY LIMITS RECOMENDADOS"
echo "========================================"
echo ""
echo "Serviço                    | Limit     | Risk if OOM"
echo "---------------------------+-----------+--------------------"
echo "evolution_evolution        | 1024M     | 🔴 Perda de msgs WhatsApp"
echo "rabbitmq_rabbitmq          | 512M      | 🔴 Perda de filas"
echo "redis_redis                | 256M      | 🔴 Cache reset"
echo "n8n_n8n_editor             | 512M      | 🟡 Workflows offline"
echo "n8n_n8n_webhook            | 512M      | 🟡 Webhooks perdidos"
echo "supabase_db                | 2048M     | 🔴 DB outage"
echo "supabase_studio            | 256M      | 🟢 UI offline"
echo "zapp-web-prod_web          | 512M      | 🟡 App offline"
echo "traefik_traefik            | 256M      | 🔴 Site offline"
echo ""
echo "Exemplo docker-compose.yml:"
echo 'services:'
echo '  evolution:'
echo '    deploy:'
echo '      resources:'
echo '        limits:'
echo '          memory: 1024M'
