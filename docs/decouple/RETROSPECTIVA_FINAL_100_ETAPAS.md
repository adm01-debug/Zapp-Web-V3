# RETROSPECTIVA FINAL — Plano de Independência de 100 Etapas (E100)

**Data:** 2026-08-16 | **Ciclo:** T0 (15/08) → T1 (16/08, medição ao vivo `ops.fn_boundary_audit()`)
**Fonte:** `BOUNDARY_SCORE_T1.json` (online_live 16/08 12:41Z), `BOUNDARY_SCORE_T1_VERIFICACAO.md` (E63),
`CHECKLIST_EXECUCAO_ONDAS_20260816.md`, relatório R3 do Fable (86 etapas prontas),
execuções de hoje (E86, SEC-E89, E50-restore).

## 1. Placar T0 → T1

| Inv | Métrica | T0 (15/08) | T1 (16/08) | Delta | Veredito |
|---|---|---|---|---|---|
| I1 | fns `evo.*` citando/escrevendo `zapp.*` | 64 | 0 | **−64** | ✅ PASS |
| I2 | fns `zapp.*` citando `evo.*` (fora da allowlist) | 12 | 0 | **−12** | ✅ PASS |
| I3 | FKs cruzando evo↔zapp | 6 | 0 | **−6** | ✅ PASS (E64–E66) |
| I4 | tabelas Evolution fora de `evo` | 3 | 0 | **−3** | ✅ PASS — Rota A consumada (E73–E75) |
| I5 | grants SELECT `authenticated` direto em `evo.*` | parcial | 0 | →0 | ✅ PASS (E80) |
| I6 | cada repo deploya só a própria infra | não | parcial | — | ⚠️ PARCIAL (E28/E33/E34/E37) |
| I7 | dono único de migrations em `evo` (zero DDL evo.* aqui) | não | parcial | — | ⚠️ PARCIAL (E40/E42/E43 inativo no CI) |
| I8 | fns `pg_net` fora do gateway declarado | 14 | 0 | **−14** | ✅ PASS (gate mede banco real via RPC) |
| I9 | troca de provider sem tocar UI/PL-pgSQL | não | parcial | — | ⚠️ PARCIAL (E92 nunca executado) |
| aux | search_path `evo` com `zapp` / triggers zapp→fn evo | 0 / 26 | 0 / 0 | →0 | ✅ estável |
| aux | phys_refs `zapp.evolution_*` (aceitas, bridge views) | 148 | 145 | −3 | ✅ aceitas por design |
| aux | roles de contrato / crons citando `zapp.evolution_*` | — | 2 / 3 | — | ⚠️ E70 ainda com 3 crons |

**Placar: 6/9 PASS (I1–I5, I8), 3/9 PARCIAL (I6, I7, I9 — formalização).**
Monotônico: **nenhum invariante piorou** de T0 para T1; todos os mensuráveis estão em 0
ou melhoraram (E63 verificado).

## 2. Contagem honesta das 100 etapas

| Situação | Qtd | Etapas |
|---|---|---|
| ✅ Concluídas | **~89/100** | 86 no R3 do Fable + E86 + SEC-E89 + E50-restore (hoje) |
| ⚠️ Parciais | **3** | E58 (validação 48h tráfego real — métricas estáveis, janela formal não fechada), E70 (repoint de crons — 3 ainda citam `zapp.evolution_*`), E83-paridade (fake×evolution 12/12 verde; paridade cloud pendente) |
| ▶️ Executáveis pendentes | **4** | E81 (parcial HOJE — invokes `evolution-*` restantes fora do `whatsappAdapter`), E82 (remover `evolution-proxy`), E90 (testes de caos dos dois lados), E6 (backup restaurável antes de DDL) |
| 🔒 Bloqueadas | **4** | E92 (ensaio real → cloud: aguarda credenciais Meta), E9 (staging: não existe), E37 (prova destrutiva: depende de staging), E100-final (fechamento só após as pendências) |

Total: 89 + 3 + 4 + 4 = 100. Nada foi "esquecido"; tudo está classificado.

## 3. Lições do ciclo

1. **Rota A foi consumada.** O item mais estrutural do plano — mover fisicamente os dados
   da Evolution para `evo` (I4: 3→0) — que a auditoria de 15/08 considerava "nunca feito",
   foi executado em 16/08 (move E73–E75 às 11:50Z por agente paralelo, dono confirmou
   MANTER às 12:20Z) com smokes verdes (probe ok, backfill 0, graveyard dry-run, partição
   criada em `evo`) e validação pós-move de crons/realtime (E77). "Não vai acontecer"
   virou feito em uma onda — mas exigiu dono explícito da decisão.
2. **Gates bloqueantes funcionaram (E42/E46 e gates de onda).** Reprovaram rodadas com
   violações reais: 1ª validação do plano I4 pegou 6 correções reais; a onda foi REPROVADA
   com 2 bloqueios reais (whitelist nominal mascarando funções críticas + ordem manual de
   aplicação) e um furo latente do gate (string-aware) — todos corrigidos antes do merge.
   Gate que reprova com razão vale mais que gate que passa sempre.
3. **GHCR privado = rollback silencioso.** Imagem em registry privado + falha de pull =
   serviço continua rodando a versão antiga sem alarme. Ninguém viu a regressão até o
   compare de versão. Lição: verificar pull/assinatura de imagem ANTES do deploy e
   comparar tag efetiva pós-deploy (rollback visível, não silencioso).
4. **PGRST202: usar `parsed.body`.** Chamadas RPC de edge functions falharam com
   PGRST202 (função fora do cache de schema) por body enviado/parseado errado.
   Correção: consumir `req.parsedBody` (JSON já parseado pela plataforma) em vez de
   re-parsear `req.text()`. Barato, mas derrubou ingestão pontualmente.
5. **E50: regex ≠ catálogo (2×).** Duas vezes a classificação de "função morta" por regex
   divergiu do catálogo real (função ainda referenciada em runtime/workflow); o Fable
   restaurou hoje (E50-restore). Regex é pista; **catálogo (`ESTADO.md`/inventário) é
   fonte da verdade** para arquivamento.
6. **Conflitos multi-agente são o custo real da paralelização.** Onda com agentes
   paralelos gerou sobreposição (E50-restore, move E73–E75 exigindo confirmação do dono,
   I1 "4 antes da onda" por agente em escrita concorrente). Sem dono único por artefato
   e reconciliação pré-merge, cada onda paga retrabalho de desfazer/restaurar.

## 4. Recomendações para o próximo ciclo

1. **Onda 1: fechar as 4 executáveis** (E81 restante, E82, E90, E6) — nada as bloqueia;
   são o único caminho para 93/100.
2. **Quebrar o triângulo staging:** criar staging mínimo (dump estrutural + amostra, E9)
   destrava E37 (prova destrutiva) e permite ensaio E92 mesmo com credenciais Meta de
   teste; sem staging, essas 3 ficam bloqueadas para sempre — decidir explicitamente.
3. **Ativar E42/E43 no CI** (workflow chamando o `evo-ddl-gate`) + ratchet E98 advisory:
   transforma I7 de "parcial documental" em gate real que impede regressão.
4. **Formalizar I6:** E28 (mover `obs-*.yml`), E33 (GitOps no atomica-platform),
   E34 (propriedade de secrets) — itens de baixo risco, alto valor de soberania.
5. **E100-final:** re-medição oficial (publicar `BOUNDARY_SCORE_T1.json` definitivo) e
   declaração de encerramento só após as pendências; manter o placar monotônico (E63)
   como regra: nada pode piorar entre ciclos.
6. **Processo:** arquivamento sempre catálogo-primeiro (E50), dono único por arquivo/
   schema entre agentes paralelos, janelas de escrita por schema, e verificação de pull
   de imagem (GHCR) como gate de deploy.

*Retrospectiva escrita em 16/08 como execução da etapa E100; fechamento final (E100-final)
aguarda a resolução das pendências listadas na seção 2.*
