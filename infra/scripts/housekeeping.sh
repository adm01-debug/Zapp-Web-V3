#!/bin/bash
set -euo pipefail
echo "========================================"
echo "  AtomicaBR Housekeeping $(date)"
echo "========================================"

echo ""
echo "📦 PASSO 1: Remover imagens Docker não utilizadas..."
docker image prune -a -f 2>&1 | tail -3

echo "📦 PASSO 2: Remover containers parados (exit 255 de deploys antigos)..."
docker container prune -f 2>&1 | tail -3

echo "📦 PASSO 3: Remover volumes órfãos (hash names)..."
docker volume ls -qf dangling=true | while read vol; do
  if [[ "$vol" =~ ^[a-f0-9]{64}$ ]]; then
    echo "  Removendo volume hash: ${vol::12}..."
    docker volume rm "$vol" 2>/dev/null || true
  fi
done

echo "📦 PASSO 4: Limpar cache do build Docker..."
docker builder prune -f 2>&1 | tail -3

echo "📦 PASSO 5: Limpar logs de containers (json-file)..."
for container in $(docker ps -aq); do
  logfile=$(docker inspect --format '{{.LogPath}}' "$container" 2>/dev/null || true)
  if [ -n "$logfile" ] && [ -f "$logfile" ]; then
    truncate -s 0 "$logfile"
    echo "  Log zerado: ${container::12}"
  fi
done

echo "📦 PASSO 6: Verificar espaço recuperado..."
df -h / | awk 'NR==2{print "  Usado:", $3, "| Livre:", $4, "| Uso:", $5}'
echo ""
echo "========================================"
echo "  ✅ Housekeeping concluído"
echo "========================================"
