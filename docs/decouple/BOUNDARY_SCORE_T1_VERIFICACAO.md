# BOUNDARY_SCORE_T1_VERIFICACAO — placar monotônico (E63)

**Data:** 2026-08-16 | **Etapa:** E63 | **Método:** medição ao vivo `ops.fn_boundary_audit()` em produção

## Evolução do placar

| Invariante | T0 (15/08) | T5 (15/08 23:44) | T1 (16/08 12:12) | Agora (16/08 12:38) | Veredito |
|---|---|---|---|---|---|
| I1 fns evo citando zapp | 64 | 66 | 4 | **0** | ✅ melhorou |
| I2 fns zapp citando evo | 12 | 40 | 1 | **0** | ✅ melhorou |
| I3 FKs cruzadas | 6 | 0 | 0 | **0** | ✅ estável |
| I4 tabelas fora de evo | 3 | 3 | 0 | **0** | ✅ melhorou (Rota A) |
| I5 grants authenticated em evo | parcial | 0 | 0 | **0** | ✅ estável |
| I8 pg_net fora do gateway | não | 14 | 0 | **0** | ✅ melhorou |
| aux search_path evo com zapp | — | 0 | 0 | **0** | ✅ estável |
| aux triggers zapp com fn evo | 26 | 0 | 0 | **0** | ✅ estável |
| aux phys_refs (aceitas por design) | 148 | 148 | 148 | 145 | ✅ estável (bridge views) |

## Veredito

**Placar monotônico: NENHUM invariante piorou entre T0→T1.** Todos os mensuráveis estão no nível meta (0) ou melhoraram. As 3 pendências (I6, I7, I9) são de formalização (repos/gates/ensaio), não de regressão de dado.

**E63 ✅ CONCLUÍDO** — evidência: medições ao vivo registradas em `BOUNDARY_SCORE_T1.json` + este documento.
