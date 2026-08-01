# PLANO DE EXECUÇÃO MESTRE — Correção da Auditoria ZAPP Self-Hosted

**Origem:** `.hermes/plans/AUDITORIA-ZAPP-SELFHOSTED-2026-08-01.md`
**Gerado por:** Claude Code (claude -p) em 2026-08-01
**Worktree:** `C:/c/tmp/wt-audit` · branch `hermes-auditfix-20260801`

## Blocos
- B0 — Pré-voo: snapshots (pg_policies, storage.buckets, cron.job, compose 35)
- B1 — Contenção P0: etapas 1, 2, 3, 4, 5, 9, 10
- B2 — Banco fase 1: etapas 7, 8
- B3 — Integridade: etapas 23, 24, 25, 26, 27, 32
- B4 — Secrets/env: etapas 11–17
- B5 — Edge Functions/SICOOB: etapas 18–22
- B6 — Storage/LGPD: etapa 6 (front primeiro, gate de mídia)
- B7 — RLS lotes 1–5: etapas 33–40
- B8 — Governança: etapas 41–46
- B9 — CI: etapas 47–50 (50 é a última)

## PRs esperados
PR-1 fix(edge) allowlist+JWT_SECRET_FILE · PR-2 docs(config.toml) · PR-3 feat(db) RLS 15 tabelas+trigger · PR-4 feat(db) integridade · PR-5 feat(db) dedup contatos · PR-6 feat(infra) stack35 env · PR-7 feat(edge) deploy fns · PR-8 feat(storage) buckets privados · PR-9 feat(db) RLS lotes · PR-10 feat(db) SECDEF · PR-11 docs(arquitetura) · PR-12 ci gates · PR-13 feat(db) retenção · PR-14 chore(infra) restart_policy

## Decisões que alteram a auditoria literal
1. Etapa 6 colide com BUG-38 (audio-messages público deliberado 2026-07-27): front primeiro, bucket depois, gate de teste manual de mídia
2. Etapa 26 app_role: NO-GO (cosmético, colide com regra 1) → documentar
3. Etapa 20 SICOOB: elo 5 bloqueado por credencial → consumer DRY_RUN + cron desagendado + backlog medido
4. Etapa 1: preferir cron active=false (preserva definição p/ etapa 45)
5. Etapa 41 triggers artes: requer aprovação do dono; sem aprovação → DOCUMENTAR-APENAS + issue

## Critérios de aceite (resumo)
- VERIFY_JWT=[true]; JWT_SECRET md5 == GoTrue
- 97 fns 401 sem token, 23 allowlist != 401
- policies qual=true authenticated ≤ 43 (era 464)
- 15 tabelas segurança: 0 USING(true)
- diff env = 0 ausentes; diff repo↔deployadas vazio
- 4 UNIQUEs indisvalid; enum warroom criado; buckets 7/7
- tsc=0; bun run test verde; 14 PRs mergeados
