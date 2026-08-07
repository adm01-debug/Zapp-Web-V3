#!/usr/bin/env bash
# ciclov-completa.sh — Ciclo completo: health → typecheck → lint → build → screenshot
cd /c/zapp-web-v3
echo "🩺 1/5 Health check"
bash scripts/preview/health-check.sh
echo "🔍 2/5 Typecheck"
bunx tsc --noEmit > scripts/preview/logs/typecheck.log 2>&1 && echo "✅ Typecheck ok" || { echo "⚠️ Erros de tipo (veja logs/typecheck.log)"; grep -c "error TS" scripts/preview/logs/typecheck.log; }
echo "🧹 3/5 Lint"
bun run lint > scripts/preview/logs/lint.log 2>&1 && echo "✅ Lint ok" || { echo "⚠️ Lint com avisos"; tail -3 scripts/preview/logs/lint.log; }
echo "🔨 4/5 Build"
bun run build > scripts/preview/logs/build.log 2>&1 && echo "✅ Build ok" || { echo "❌ Build falhou"; tail -10 scripts/preview/logs/build.log; }
echo "📸 5/5 Screenshot"
bash scripts/preview/screenshot-design.sh
echo "🏁 Ciclo completo finalizado"
