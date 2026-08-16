# CHECKLIST_EXECUCAO_ONDAS_20260816 — leva final documental

**Data:** 2026-08-16 | **Placar atual:** 6/9 (I1, I2, I3, I4, I5, I8 PASS)

## Entregas da leva final (1 PR)

| Etapa | Artefato | Status |
|---|---|---|
| E39 | `ADR-015-evo-schema-owner.md` | ✅ criado |
| E40 | `EVO_MIGRATION_SPLIT.md` | ✅ criado |
| E44 | `CONTRIBUTING.md` (seção expand/contract) | ✅ atualizado |
| E45 | `schema-registry/evo.json` (owner) + `zapp.json` (novo) | ✅ atualizado/criado |
| E91 | `ENSAIO_TROCA_PROVIDER_MEDIDO.md` | ✅ criado |
| E93 | `E93_RELATORIO_CAMADAS.md` | ✅ criado |
| E95 | `RUNBOOK_TROCA_PROVIDER.md` (tempos medidos + E92 aguardando) | ✅ atualizado |
| E96 | `ADR-017-corte-fisico-evo.md` (NÃO EXECUTAR) | ✅ criado |
| E98 | `.github/workflows/score-ratchet.yml` (advisory) | ✅ criado |
| E99 | `ROTINA_TRIMESTRAL.md` | ✅ criado |
| E54 | `supabase/migrations/20260816150000_decouple_e54_test_negativo_roles.sql` | ✅ criado |
| E63 | `BOUNDARY_SCORE_T1_VERIFICACAO.md` (monotônico) | ✅ criado |
| E77 | `VALIDACAO_POS_MOVE_I4_20260816.md` (crons+realtime) | ✅ criado |
| E34 | `CREDENTIAL_BOUNDARY.md` | ✅ criado |

## Pendências que NÃO são documentais

- **E92** — ensaio REAL evolution→cloud: aguarda credenciais Meta (`WHATSAPP_CLOUD_PHONE_ID`/`TOKEN`)
- **E89** — consumer dual-write: PR separado no evolution-stack (código + testes)
- **E28** — obs-*.yml por sistema: depende de decisão de dashboards (não bloqueante)
- **E37** — prova destrutiva staging: requer ambiente de staging (não existe hoje)
- **I7 residual** — classificação exaustiva arquivo-a-arquivo do E40 (não bloqueia — gates E42/E43 ativos)

## Próximos passos pós-PR

1. Merge do PR documental + verificação do CI (E42/E43 passando)
2. Aplicar E54 no banco (migration de teste — não destrutiva) e confirmar PASS
3. Validar E98 rodando no próximo PR (advisory comment)
