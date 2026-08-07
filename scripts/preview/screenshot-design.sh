#!/usr/bin/env bash
# screenshot-design.sh — Tira screenshot do app (via Chrome CDP compartilhado) e salva em scripts/preview/
cd /c/zapp-web-v3
OUT="scripts/preview/design-$(date +%H%M%S).png"
echo "📸 Capturando design do app..."
if curl -s -o /dev/null -w "%{http_code}" http://localhost:9222/json/version 2>/dev/null | grep -q 200; then
  # Usa aba existente no preview; se não houver, abre nova
  TAB=$(curl -s http://localhost:9222/json | python -c "
import json,sys
tabs=json.load(sys.stdin)
cands=[t['webSocketDebuggerUrl'] for t in tabs if t.get('type')=='page' and t.get('url','').startswith('http://localhost:8080')]
print(cands[0] if cands else '')
" 2>/dev/null)
  if [ -z "$TAB" ]; then
    TAB=$(curl -s -X PUT "http://localhost:9222/json/new?http://localhost:8080" | python -c "import json,sys; print(json.load(sys.stdin).get('webSocketDebuggerUrl',''))" 2>/dev/null)
    sleep 5
  fi
  node -e "
const ws = new WebSocket('$TAB');
ws.onopen = () => ws.send(JSON.stringify({id:1,method:'Page.captureScreenshot',params:{format:'png'}}));
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id===1 && m.result) {
    require('fs').writeFileSync('$OUT', Buffer.from(m.result.data,'base64'));
    console.log('OK $OUT');
    ws.close(); process.exit(0);
  }
};
setTimeout(()=>{console.log('TIMEOUT');process.exit(1)}, 15000);
" 2>/dev/null && echo "✅ Screenshot salvo: $OUT"
else
  echo "⚠️ Chrome CDP não encontrado na 9222 — abra http://localhost:8080 manualmente"
fi
