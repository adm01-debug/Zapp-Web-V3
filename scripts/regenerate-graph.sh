#!/usr/bin/env bash
# regenerate-graph.sh — Regenera o grafo de conhecimento Graphify localmente
# Uso: bash scripts/regenerate-graph.sh [--force]
# Requer: Python 3.11+, pip, graphifyy[sql]

set -euo pipefail
cd "$(dirname "$0")/.."

FORCE="${1:-}"
GRAPH_DIR="graphify-out"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

echo "🕸️  Graphify Regenerator — zapp-web-v3"
echo "========================================="

# 1. Verificar dependências
echo ""
echo "[1/5] Verificando dependências..."
python -c "import graphify" 2>/dev/null || {
    echo "  ⚠️  graphifyy não encontrado. Instalando..."
    pip install "graphifyy[sql]" -q
}
echo "  ✅ graphifyy $(python -c 'import graphify; print(graphify.__version__)' 2>/dev/null || echo 'OK')"

# 2. Backup do grafo atual
echo ""
echo "[2/5] Backup do grafo atual..."
if [ -f "$GRAPH_DIR/graph.json" ]; then
    cp "$GRAPH_DIR/graph.json" "$GRAPH_DIR/graph.json.bak.$TIMESTAMP"
    echo "  ✅ Backup: graph.json.bak.$TIMESTAMP"
else
    echo "  ℹ️  Nenhum grafo anterior para backup"
fi

# 3. Extração AST (código + SQL)
echo ""
echo "[3/5] Extraindo entidades (AST)..."
python -c "
import json
from graphify.detect import detect
from graphify.extract import collect_files, extract
from pathlib import Path

result = detect(Path('.'))
print(f'  {result[\"total_files\"]} arquivos detectados')

code_files = []
for f in result['files']['code']:
    code_files.extend(collect_files(Path(f)) if Path(f).is_dir() else [Path(f)])
print(f'  {len(code_files)} code files para parsing')

extraction = extract(code_files, cache_root=Path('.'))
Path('$GRAPH_DIR/.graphify_ast.json').write_text(
    json.dumps(extraction, indent=2, ensure_ascii=False), encoding='utf-8')
print(f'  ✅ {len(extraction[\"nodes\"])} nodes, {len(extraction[\"edges\"])} edges')
"

# 4. Build + cluster + export
echo ""
echo "[4/5] Build, cluster, export..."
python -c "
import json
from graphify.build import build_from_json
from graphify.cluster import cluster, score_all
from graphify.analyze import god_nodes, surprising_connections, suggest_questions
from graphify.report import generate
from graphify.export import to_json
from graphify.detect import detect
from pathlib import Path

extraction = json.loads(Path('$GRAPH_DIR/.graphify_ast.json').read_text(encoding='utf-8'))
detection = detect(Path('.'))

# Merge with empty semantic
semantic = {'nodes':[],'edges':[],'hyperedges':[],'input_tokens':0,'output_tokens':0}
seen = {n['id'] for n in extraction['nodes']}
merged_nodes = list(extraction['nodes'])
merged_edges = extraction['edges'] + semantic['edges']
merged = {'nodes': merged_nodes, 'edges': merged_edges, 'hyperedges': [], 'input_tokens': 0, 'output_tokens': 0}

G = build_from_json(merged, root='.')
if G.number_of_nodes() == 0:
    print('  ❌ Grafo vazio!')
    raise SystemExit(1)

communities = cluster(G)
cohesion = score_all(G, communities)
gods = god_nodes(G)
labels = {cid: f'Community {cid}' for cid in communities}

# Export (atômico com validação para evitar corrupção por crash/SIGSEGV)
tmp_json = '$GRAPH_DIR/.graph.json.tmp'
to_json(G, communities, tmp_json)
# Valida que o JSON gerado é íntegro
import json as _j
_j.loads(Path(tmp_json).read_text(encoding='utf-8'))
# Renomeio atômico (Windows: remove destino primeiro)
_target = Path('$GRAPH_DIR/graph.json')
if _target.exists():
    _target.unlink()
Path(tmp_json).rename(_target)

# Report
tokens = {'input': 0, 'output': 0}
surprises = surprising_connections(G, communities)
report = generate(G, communities, cohesion, labels, gods, surprises, detection, tokens, '.')
tmp_report = '$GRAPH_DIR/.GRAPH_REPORT.tmp'
Path(tmp_report).write_text(report, encoding='utf-8')
_target_r = Path('$GRAPH_DIR/GRAPH_REPORT.md')
if _target_r.exists():
    _target_r.unlink()
Path(tmp_report).rename(_target_r)

print(f'  ✅ {G.number_of_nodes()} nodes, {G.number_of_edges()} edges, {len(communities)} communities')
print(f'  🏆 Top god: {gods[0][\"label\"]} ({gods[0][\"degree\"]}°)')
"

# 5. Limpeza
echo ""
echo "[5/5] Limpando arquivos temporários..."
rm -f "$GRAPH_DIR"/.graphify_*.json "$GRAPH_DIR/.graphify_python" "$GRAPH_DIR/.graphify_root"
echo "  ✅ Limpo"

echo ""
echo "========================================="
echo "✅ Grafo regenerado com sucesso!"
echo "   graph.html        → visualização interativa"
echo "   graph.json        → dados do grafo (JSON)"
echo "   GRAPH_REPORT.md   → relatório textual"
echo "   db_graph.json     → relacionamentos do banco"
echo "========================================="
