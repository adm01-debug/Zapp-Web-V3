# E58 — Checklist de Fechamento (Janela 48h)

> Contexto: janela de observação pós-restore (S8). Fechamento em **2026-08-18 12:52 BRT (segunda)**.

## 1. Timeline

| Marco | Data/Hora |
|---|---|
| Restore do banco (início da janela) | 2026-08-16 15:52:26Z (12:52:26 BRT) |
| Migration `250007` aplicada (pós-restore) | 16/08 18:30Z |
| Migration `251000` aplicada (pós-restore) | 16/08 20:59Z |
| **Fechamento da janela E58 (48h)** | **2026-08-18 15:52:26Z = 12:52:26 BRT** |

## 2. Baseline (16/08, 5,3h pós-restore)

- **1702 eventos** processados — **100% responded**, **0 erros**
- **0 DLQ** (dead-letter)
- **113 msgs**
- **221 grupos** ativos

## 3. Checklist de fechamento (validar em 18/08 12:52 BRT)

- [ ] **Ingestão:** total de eventos na janela ≥ **15.000** (esperado p/ 48h; baseline 5,3h = 1702)
- [ ] **Responded:** 100% dos eventos com resposta (0 erros/timeouts)
- [ ] **DLQ:** 0 mensagens em dead-letter
- [ ] **Grupos:** 221 grupos OK — sem perda de presença/webhook (`@g.us`)
- [ ] **Migrações pós-restore incluídas na validação:** `250007` (18:30Z) e `251000` (20:59Z) registradas em `supabase_migrations.schema_migrations`, sem drift repo×DB

## 4. Como registrar o veredito

1. Coletar evidência no fechamento: contagens por query (eventos/responded/DLQ/msgs/grupos) + `select version, name from supabase_migrations.schema_migrations` cobrindo 250007/251000.
2. Gravar **`docs/decouple/E58_VEREDITO.md`** com: timestamp do fechamento (18/08 12:52 BRT), métricas da janela, PASS/FAIL por item do checklist, evidência (queries + resultados), veredito final.
3. **PASS** → arquivar e referenciar no scoreboard de decoupling. **FAIL** → estender a janela, registrar motivo e reabrir checklist.

> Regra: nenhum item pode ser marcado sem evidência colhida no próprio fechamento.
