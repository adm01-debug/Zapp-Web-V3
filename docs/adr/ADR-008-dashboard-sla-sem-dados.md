# ADR-008: Comportamento do dashboard SLA com zero dados

**Data:** 2026-08-02
**Status:** Decidido
**Decisor:** Abner (Joaquim)

## Contexto

O dashboard SLA (`SLAMetricsDashboard.tsx`) usa fallbacks `: 100` em `useSLAMetrics.ts` (linhas 95 e 125) quando não há dados, exibindo "100% de SLA" mesmo sem dados reais. Isso é enganoso — o painel parece saudável quando na verdade não tem medição nenhuma.

## Decisão

**Mostrar "Sem dados" explicitamente** quando não houver medições:
1. Substituir fallback `: 100` por indicador visual de "sem dados" (ex.: "—" ou "N/A")
2. Ocultar gráficos/barras quando não houver dados (evitar gráfico vazio ou 100% falso)
3. Exibir mensagem: "Nenhuma medição de SLA disponível para o período selecionado"

## Consequências

- ✅ Fecha o achado: **F8-07**
- 🔧 Tarefa de implementação na Etapa 18 (Admin)
- 🎨 Impacto visual: SLAMetricsDashboard e componentes relacionados

## Achados resolvidos por esta decisão

| Achado | Status |
|--------|--------|
| F8-07 | RESOLVIDO POR DECISÃO — fallback removido, mostrar "sem dados" |
