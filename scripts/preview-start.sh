#!/usr/bin/env bash
# preview-start.sh — Inicia preview com hot reload de forma robusta
# Resolve GAP-001 (porta errada), GAP-003 (zumbis), GAP-004 (health check), GAP-005 (network exposure)
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log()  { echo -e "${GREEN}[PREVIEW]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
err()  { echo -e "${RED}[ERROR]${NC} $1"; }

PROJECT_DIR="C:/zapp-web-v3"
CLOUDFLARED="C:/Program Files (x86)/cloudflared/cloudflared.exe"
MAX_RETRIES=3
HEALTH_CHECK_INTERVAL=30

# ── FASE 1: Limpeza de zumbis ──────────────────────────────
log "Limpando processos zumbis..."
taskkill //F //IM cloudflared.exe 2>/dev/null && log "  cloudflared antigos mortos" || true
# Mata Vite na porta 8080-8085
for port in 8080 8081 8082 8083 8084 8085; do
    pid=$(netstat -ano 2>/dev/null | grep ":$port " | grep LISTENING | awk '{print $5}' | head -1)
    if [ -n "$pid" ] && [ "$pid" != "0" ]; then
        taskkill //F //PID "$pid" 2>/dev/null && log "  Porta $port liberada (PID $pid)" || true
    fi
done

# ── FASE 2: Iniciar Vite com porta fixa ────────────────────
log "Iniciando Vite dev server na porta 5173..."
cd "$PROJECT_DIR"
bun run dev --host 127.0.0.1 --port 5173 > /tmp/vite-preview.log 2>&1 &
VITE_PID=$!

# Esperar Vite iniciar
for i in $(seq 1 15); do
    if curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:5173/ 2>/dev/null | grep -q 200; then
        log "  Vite iniciado na porta 5173 (PID $VITE_PID)"
        break
    fi
    if [ "$i" -eq 15 ]; then
        err "Vite não iniciou após 15 tentativas"
        exit 1
    fi
    sleep 1
done

# ── FASE 3: Criar tunnel Cloudflare ────────────────────────
log "Criando tunnel Cloudflare..."
for attempt in $(seq 1 $MAX_RETRIES); do
    "$CLOUDFLARED" tunnel --url http://127.0.0.1:5173 > /tmp/cf-tunnel.log 2>&1 &
    CF_PID=$!
    
    # Esperar URL aparecer
    for i in $(seq 1 20); do
        TUNNEL_URL=$(grep -oE 'https://[a-z-]+\.trycloudflare\.com' /tmp/cf-tunnel.log 2>/dev/null | head -1)
        if [ -n "$TUNNEL_URL" ]; then
            log "  Tunnel criado: $TUNNEL_URL"
            echo "$TUNNEL_URL" > /tmp/cf-active-url.txt
            break 2
        fi
        sleep 1
    done
    
    warn "  Tentativa $attempt falhou, retrying..."
    taskkill //F //PID "$CF_PID" 2>/dev/null || true
done

if [ -z "${TUNNEL_URL:-}" ]; then
    err "Não foi possível criar tunnel após $MAX_RETRIES tentativas"
    exit 1
fi

# ── FASE 4: Health check loop (background) ─────────────────
log "Iniciando health check (a cada ${HEALTH_CHECK_INTERVAL}s)..."
(
    while true; do
        sleep "$HEALTH_CHECK_INTERVAL"
        
        # Check Vite
        if ! curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:5173/ 2>/dev/null | grep -q 200; then
            warn "Vite DOWN! Tentando reiniciar..."
            cd "$PROJECT_DIR" && bun run dev --host 127.0.0.1 --port 5173 > /tmp/vite-preview.log 2>&1 &
        fi
        
        # Check tunnel
        if ! curl -s -o /dev/null --max-time 10 "$TUNNEL_URL" 2>/dev/null; then
            warn "Tunnel DOWN! Recriando..."
            taskkill //F //IM cloudflared.exe 2>/dev/null || true
            "$CLOUDFLARED" tunnel --url http://127.0.0.1:5173 > /tmp/cf-tunnel.log 2>&1 &
            sleep 12
            NEW_URL=$(grep -oE 'https://[a-z-]+\.trycloudflare\.com' /tmp/cf-tunnel.log 2>/dev/null | head -1)
            if [ -n "$NEW_URL" ]; then
                echo "$NEW_URL" > /tmp/cf-active-url.txt
                warn "  Nova URL: $NEW_URL"
            fi
        fi
    done
) &
HC_PID=$!

# ── FASE 5: Relatório ──────────────────────────────────────
echo ""
echo "=============================================="
echo "  PREVIEW INICIADO COM SUCESSO"
echo "=============================================="
echo "  Vite:    http://127.0.0.1:5173 (PID $VITE_PID)"
echo "  Tunnel:  $TUNNEL_URL (PID $CF_PID)"
echo "  Health:  PID $HC_PID (cada ${HEALTH_CHECK_INTERVAL}s)"
echo "  Logs:    /tmp/vite-preview.log"
echo "           /tmp/cf-tunnel.log"
echo "=============================================="
echo ""
echo "Para parar: kill $VITE_PID $CF_PID $HC_PID"
echo ""

# Manter script rodando (health check em background)
wait
