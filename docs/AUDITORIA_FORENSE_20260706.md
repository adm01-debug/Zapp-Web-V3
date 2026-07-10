# AUDITORIA FORENSE — Validação Exaustiva (2026-07-06)

> Reauditoria adversarial de TODAS as correções/melhorias da sessão de maximização.
> Método: não confiar em "committed" anterior; re-testar do zero; caçar gaps ativamente; centenas de simulações.
> **Resultado: 3 gaps reais encontrados e corrigidos + 2 falsos-positivos de teste identificados.**

## 1. Gaps REAIS encontrados e corrigidos

### 🔴 GAP #1 — Cooldown de alerta suprimia WARN após CRIT
- **Sintoma:** teste E2E mostrou `warn.alerted=false` — um alerta WARN de disco NÃO era criado se um CRIT tivesse ocorrido nas últimas 3h.
- **Causa-raiz:** `ingest_host_disk` fazia cooldown por `source` apenas, não por `source + severidade`. CRIT e WARN compartilhavam a mesma janela.
- **Correção:** cooldown agora é por `(source, alert_type)` — WARN e CRIT têm trilhas independentes. Subir WARN→CRIT sempre alerta o CRIT; um WARN posterior a um CRIT também alerta.
- **Validação:** E2E `all_pass=true` (CRIT→critical, WARN→warning, OK→sem alerta).

### 🔴 GAP #2 — Simulações contaminavam config de produção (race condition)
- **Sintoma:** o coletor real gravou `status=CRIT` a 59% de uso. Investigação: `host_disk_config` estava em `warn=10/crit=20` (valores de teste), não `75/90`.
- **Causa-raiz:** `sim_disk_guard` e `sim_forensic_battery` (v1) **mutavam a tabela de config compartilhada** `host_disk_config` (id=1) que o coletor de produção lê a cada 5 min. Janela de corrida: se o coletor rodava durante a simulação, lia thresholds de teste e classificava errado. Pior: uma exceção no meio da sim v1 deixava a config presa nos valores de teste.
- **Correção:** refatoração para **dry-run isolado**. `ingest_host_disk` ganhou parâmetros opcionais `p_warn/p_crit/p_cooldown_min/p_persist`. As sims passam thresholds por parâmetro com `p_persist=false` — **zero contato com a config de produção, zero escrita no log**. Config de produção restaurada para 75/90.
- **Validação:** config idêntica antes/depois das sims (`75/90` → `75/90`); coletor real voltou a `status=OK`.

### 🔴 GAP #3 — Ambiguidade de overload ("is not unique")
- **Sintoma:** `SELECT ops.ingest_host_disk(55,'X','Y','Z','/','host')` → `ERROR: function is not unique`.
- **Causa-raiz:** ao criar a versão de 10 parâmetros (GAP #2), a versão antiga de 6 parâmetros permaneceu. Chamada de 6 args ficou ambígua entre as duas. **Isso quebraria o coletor de produção** (que chama com 6 args).
- **Correção:** `DROP FUNCTION` da versão de 6 params. A de 10 (com defaults) atende chamadas de 6 args.
- **Validação:** assinatura única; chamada de 6 args resolve para `{ok:true, warn:75, crit:90}`; coletor real confirmado no ciclo seguinte.

## 2. Falsos-positivos de teste identificados (o teste mentia, não o código)

### 🟡 FP #1 — Harness T4 quebrava a cadeia de console
- Primeiro stress-test do T4 reportou 7/12 FAIL, mas o output visual mostrava `***MASKED***` em todos. O bug: sobrescrever `console.log` para captura quebrava a composição com o wrapper do T4.
- Corrigido capturando `process.stdout.write` ANTES de aplicar o T4. Resultado real: **T4 = 12/12 PASS** (multi-chave, camelCase, espaçamento, rejeição de falsos-positivos).

### 🟡 FP #2 — Teste de cooldown media janela poluída
- Teste forense de cooldown falhava por contar alertas `critical` de OUTROS testes na mesma janela de 180min.
- Corrigido limpando a janela por severidade antes de medir.

## 3. Simulações executadas (total: 400+ cenários, todos PASS)

| Suíte | Cenários | Resultado |
|---|---|---|
| `sim_wa_budget_guard` | 252 | ✅ 252/252 |
| `sim_disk_guard` (v2 dry-run) | 126 | ✅ 126/126 |
| `sim_forensic_battery` (v2) | 8 blocos | ✅ 8/8 (SQL injection, INT_MAX, overflow, cooldown, dashboard, staleness, constraints, singleton) |
| `sim_disk_alert_e2e` | 3 severidades | ✅ all_pass |
| `sim_rls_wa` | 6 asserts | ✅ 6/6 |
| T4 stress (binário real) | 12 | ✅ 12/12 |
| Disk-guard resiliência (infra) | 5 | ✅ 5/5 (mount inexistente, host errado, valor corrompido) |

## 4. Higiene de segurança aplicada

- `REVOKE ALL FROM PUBLIC` em todas as 5 sim-functions + `ingest_host_disk` (estavam com `public_exec=true` por falta de revoke na recriação).
- `GRANT EXECUTE ... TO service_role` apenas onde necessário (`ingest_host_disk`, `fn_dashboard`).
- Confirmado: tabelas `ops.*` sem grant a `authenticated`/`anon` (acesso só via SECURITY DEFINER).

## 5. Estado final validado

- `ops.run_all_checks()` = **24 checks** (23 OK + 1 CLEAN)
- `check_host_disk` = OK (59%, config 75/90 correta)
- `check_marketing_budget` = OK (R$ 0 / R$ 500)
- Evolution: healthy, T4 ativo (12/12), wpp2 open (3.118 msgs, zero downtime)
- Coletor de disco: ciclo real confirmado com assinatura única e config correta

## 6. Lições institucionalizadas

1. **Simulações NUNCA devem mutar estado compartilhado de produção.** Usar dry-run + parâmetros, não snapshot/restore de tabela global (snapshot falha se houver exceção no meio).
2. **Overloads de função são armadilha.** Ao adicionar parâmetros, dropar a assinatura antiga explicitamente para evitar "is not unique".
3. **Um teste que passa não prova nada se o harness está errado.** Validar o próprio teste (o T4 "falhou" por bug no teste, não no código).
4. **Cooldown de alerta deve ser por severidade**, não só por origem.
