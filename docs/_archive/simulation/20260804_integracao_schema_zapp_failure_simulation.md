# Simulação de Falhas — Correção Integração Schema `zapp` × Front-end
**Data:** 2026-08-04 · **Total de cenários: 1474** · **Grounded:** pg_catalog real + grep src/ (worktree h856108)

## Breakdown por severidade
| Severidade | Qtd |
|---|---|
| MEDIO | 506 |
| ALTO | 418 |
| CRITICO | 352 |
| BAIXO | 198 |
| **Total** | **1474** |

## Breakdown por categoria
- **F04_evo_zapp**: 308 cenários
- **CROSS**: 308 cenários
- **F01F02_wrappers**: 220 cenários
- **F05_realtime**: 220 cenários
- **F03_grants**: 176 cenários
- **F06_drift**: 132 cenários
- **I01_I02_infra**: 110 cenários

## Top 20 cenários mais arriscados
1. [CRITICO] (F01F02_wrappers) REVOKE ALL FROM PUBLIC esquecido no wrapper -> anon executa bootstrap e vaza profiles/roles/permissions
    - Evidência: default PUBLIC execute
2. [CRITICO] (F01F02_wrappers) REVOKE ALL FROM PUBLIC esquecido no wrapper -> anon executa bootstrap e vaza profiles/roles/permissions [timing: deploy pico]
    - Evidência: default PUBLIC execute
3. [CRITICO] (F01F02_wrappers) REVOKE ALL FROM PUBLIC esquecido no wrapper -> anon executa bootstrap e vaza profiles/roles/permissions [timing: boot concorrente]
    - Evidência: default PUBLIC execute
4. [CRITICO] (F01F02_wrappers) REVOKE ALL FROM PUBLIC esquecido no wrapper -> anon executa bootstrap e vaza profiles/roles/permissions [timing: janela manutenção]
    - Evidência: default PUBLIC execute
5. [CRITICO] (F01F02_wrappers) REVOKE ALL FROM PUBLIC esquecido no wrapper -> anon executa bootstrap e vaza profiles/roles/permissions [timing: pós-restart]
    - Evidência: default PUBLIC execute
6. [CRITICO] (F01F02_wrappers) REVOKE ALL FROM PUBLIC esquecido no wrapper -> anon executa bootstrap e vaza profiles/roles/permissions [runner: CI linux]
    - Evidência: default PUBLIC execute
7. [CRITICO] (F01F02_wrappers) REVOKE ALL FROM PUBLIC esquecido no wrapper -> anon executa bootstrap e vaza profiles/roles/permissions [runner: Windows local]
    - Evidência: default PUBLIC execute
8. [CRITICO] (F01F02_wrappers) REVOKE ALL FROM PUBLIC esquecido no wrapper -> anon executa bootstrap e vaza profiles/roles/permissions [runner: swarm task 2]
    - Evidência: default PUBLIC execute
9. [CRITICO] (F01F02_wrappers) REVOKE ALL FROM PUBLIC esquecido no wrapper -> anon executa bootstrap e vaza profiles/roles/permissions [runner: browser mobile]
    - Evidência: default PUBLIC execute
10. [CRITICO] (F01F02_wrappers) REVOKE ALL FROM PUBLIC esquecido no wrapper -> anon executa bootstrap e vaza profiles/roles/permissions [data: 1M linhas]
    - Evidência: default PUBLIC execute
11. [CRITICO] (F01F02_wrappers) REVOKE ALL FROM PUBLIC esquecido no wrapper -> anon executa bootstrap e vaza profiles/roles/permissions [data: uuid inválido]
    - Evidência: default PUBLIC execute
12. [CRITICO] (F01F02_wrappers) REVOKE ALL FROM PUBLIC esquecido no wrapper -> anon executa bootstrap e vaza profiles/roles/permissions [data: unicode/emoji]
    - Evidência: default PUBLIC execute
13. [CRITICO] (F01F02_wrappers) REVOKE ALL FROM PUBLIC esquecido no wrapper -> anon executa bootstrap e vaza profiles/roles/permissions [data: NULLs]
    - Evidência: default PUBLIC execute
14. [CRITICO] (F01F02_wrappers) REVOKE ALL FROM PUBLIC esquecido no wrapper -> anon executa bootstrap e vaza profiles/roles/permissions [retry: 3 retries]
    - Evidência: default PUBLIC execute
15. [CRITICO] (F01F02_wrappers) REVOKE ALL FROM PUBLIC esquecido no wrapper -> anon executa bootstrap e vaza profiles/roles/permissions [retry: timeout 12s]
    - Evidência: default PUBLIC execute
16. [CRITICO] (F01F02_wrappers) REVOKE ALL FROM PUBLIC esquecido no wrapper -> anon executa bootstrap e vaza profiles/roles/permissions [retry: 429 cooldown]
    - Evidência: default PUBLIC execute
17. [CRITICO] (F01F02_wrappers) REVOKE ALL FROM PUBLIC esquecido no wrapper -> anon executa bootstrap e vaza profiles/roles/permissions [network: latência 200ms]
    - Evidência: default PUBLIC execute
18. [CRITICO] (F01F02_wrappers) REVOKE ALL FROM PUBLIC esquecido no wrapper -> anon executa bootstrap e vaza profiles/roles/permissions [network: drop 5%]
    - Evidência: default PUBLIC execute
19. [CRITICO] (F01F02_wrappers) REVOKE ALL FROM PUBLIC esquecido no wrapper -> anon executa bootstrap e vaza profiles/roles/permissions [network: TLS renegociação]
    - Evidência: default PUBLIC execute
20. [CRITICO] (F01F02_wrappers) REVOKE ALL FROM PUBLIC esquecido no wrapper -> anon executa bootstrap e vaza profiles/roles/permissions [network: DNS fail]
    - Evidência: default PUBLIC execute

## Gaps pré-execução detectados (ajustes ao plano do auditor)
1. **GAP-A (F-05 retry metrics):** plano dizia `schema:'zapp'` p/ `evolution_retry_metrics`, mas tabela FÍSICA é `evo.*` (zapp só view). Fix correto: `schema:'evo'` (publicação tem evo.evolution_retry_metrics; policy auth_read p/ authenticated CONFIRMADA).
2. **GAP-B (F-05 voice_conversion_queue):** comentário no código diz 'physical in public' — FALSO: física é zapp.voice_conversion_queue (relkind r, NA publicação). Fix: `schema:'zapp'` + corrigir comentário stale.
3. **GAP-C (F-04 credenciais):** plano mandava 'edge fn p/ leitura', mas view zapp.evolution_instance_credentials (security_invoker, SEM api_key) já serve leitura. Escritas exigem estender edge fn `evolution-credentials` (GET-only) com actions save/delete.
4. **GAP-D (health_logs):** hook insere em zapp.evolution_health_logs (view SEM triggers) — INSERT falharia. Criar trigger INSTEAD OF INSERT (padrão contacts/messages) ou rotear via edge fn.
5. **GAP-E (I-01):** supabase_meta JÁ remediado (recriado hoje 12:09, mem 512MB, healthy, RestartCount=0) — etapa vira VERIFICAÇÃO.
6. **GAP-F (I-02):** PGRST_DB_SCHEMAS inalterado (documentar recomendação; NÃO remover artes/vendas/financeiro sem aprovação — outros apps dependem).
7. **GAP-G (F-04 transcrição):** subscription L61 schema:'evo' em evolution_messages (particionada) está CORRETA — não mexer.
8. **GAP-H (secdef guard):** ANTES do grant de import_user_data e fn_safe_audit_log, confirmar checagem interna — senão P0.
9. **GAP-I (types):** view sem api_key ≠ types.ts com api_key nullable → ajuste consciente, não regenerar cegamente.
10. **GAP-J (CI):** audit-contract.mjs precisa de secrets DB no GH Actions — senão gate nasce quebrado.
