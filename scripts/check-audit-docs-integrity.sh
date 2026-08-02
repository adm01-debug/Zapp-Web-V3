#!/usr/bin/env bash
# ==========================================================================
# INTEGRIDADE DOS DOCUMENTOS DE AUDITORIA — bloqueante
# ==========================================================================
# Motivo: o PR #712 chegou com uma versao de PLANO_IMPLEMENTACAO_100.md
# cortada de um estado anterior a Etapa 1 — 155 achados em vez de 200, sem
# nenhum campo `Sev:`, e sem os blocos F8, F9 e F10 inteiros. Nada no CI
# reprovava isso; so o conflito de merge do git segurou por acidente.
#
# A regra do plano e explicita: achado nunca e deletado nem renumerado.
# Este script transforma essa regra em gate.
# ==========================================================================
set -uo pipefail

PLANO="docs/audits/PLANO_IMPLEMENTACAO_100.md"
FALHAS=0

falhar() {
  echo "::error title=Integridade do plano::$1"
  FALHAS=$((FALHAS + 1))
}

if [ ! -f "$PLANO" ]; then
  falhar "$PLANO nao existe."
  exit 1
fi

TOTAL_ACHADOS=$(grep -c "^### F" "$PLANO" || true)
TOTAL_SEV=$(grep -c "^- \*\*Sev:\*\*" "$PLANO" || true)

[ "$TOTAL_ACHADOS" -eq 200 ] || falhar "esperado 200 achados (^### F), encontrado $TOTAL_ACHADOS."
[ "$TOTAL_SEV" -eq 200 ] || falhar "esperado 200 campos Sev (^- **Sev:**), encontrado $TOTAL_SEV."

# Contagem por bloco — pega o caso em que o total bate mas um bloco sumiu.
esperado_por_bloco="F1:14 F2:13 F3:12 F4:24 F5:30 F6:30 F7:32 F8:17 F9:19 F10:9"
for par in $esperado_por_bloco; do
  bloco="${par%%:*}"
  esperado="${par##*:}"
  real=$(grep -c "^### ${bloco}-" "$PLANO" || true)
  [ "$real" -eq "$esperado" ] || falhar "bloco ${bloco}: esperado ${esperado} achados, encontrado ${real}."
done

# O indice e derivado dos dois planos. Se ficar desatualizado, o agente de
# correcao le uma foto velha do backlog — foi exatamente o que aconteceu no PR #712.
if command -v node >/dev/null 2>&1; then
  node scripts/gerar-indice-achados.mjs --check || falhar "INDICE_ACHADOS.md desatualizado. Rode: node scripts/gerar-indice-achados.mjs"
else
  echo "::notice title=Integridade do plano::node ausente — sincronia do INDICE_ACHADOS.md nao verificada."
fi

if [ "$FALHAS" -gt 0 ]; then
  echo ""
  echo "O plano de auditoria perdeu conteudo. Achado nao se deleta nem se renumera —"
  echo "marque como ~~OBSOLETO~~ com a linha de revalidacao, no padrao das Etapas 1-2."
  echo "Se a mudanca for legitima (novo achado incorporado ao backlog), atualize os"
  echo "numeros esperados neste script no MESMO commit, com justificativa."
  exit 1
fi

echo "Integridade do plano OK: 200 achados, 200 Sev, blocos ${esperado_por_bloco}."
