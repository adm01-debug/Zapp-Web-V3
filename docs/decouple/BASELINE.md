# BASELINE — Desacoplamento Zapp ↔ Evolution API

**Data:** 2026-08-13 · **Branch:** feat/decouple-provider · **HEAD:** 6e4f67afe

## Digests de Produção

| Serviço | Digest / SHA | Stack |
|---|---|---|
| zapp-web (app) | production-b6a54a2bff23 | — |
| evolution API custom | 6f9f1d35 | stack 25 |
| evolution-rabbit-consumer | 75210b9f | 2 réplicas |
| evolution-stack repo | e531ef4 | adm01-debug/evolution-stack |

## Ponto de Rollback

Tag: `pre-decouple-v0` = commit `c8a4d4bc3` (início do Lote 1)

Para reverter ao estado pré-desacoplamento de schema:
```sql
-- Cada tabela: ALTER TABLE zapp.<nome> SET SCHEMA evo;
-- (operação de catálogo, instantânea, reversível)
```

## Critério de Abort

- Taxa de erro de envio de mensagem > 1%
- DLQ com > 0 entradas novas em 10 min
- Latência p95 de webhook > 2× baseline
- Gate reportando críticos > 0

## Estado em 2026-08-13 (pós-Lote 4)

- 30 tabelas em zapp (Lotes 1-4)
- Gate: 22 pendentes | 17 migrados | 0 críticos
- Agente A8 validou auditoria exaustiva pós-Lote 4: 25/25 tabelas + 0 regressões
