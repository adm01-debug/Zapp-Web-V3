# Rotina Trimestral de Reconciliação Doc × Banco (E99)

**Data de criação:** 2026-08-16 | **Periodicidade:** trimestral (1ª semana de cada trimestre) | **Owner:** Joaquim (ou agente delegado)

## Procedimento

1. **Medir:** `SELECT ops.fn_boundary_audit();` no banco de produção (ou via CI `measure-invariants.yml`).
2. **Comparar:** placar medido vs `docs/decouple/BOUNDARY_SCORE_T1.json` (baseline corrente).
3. **Publicar:** atualizar a seção "Desacoplamento" do `ESTADO.md` com o placar e a data.
4. **Ratchet:** se melhorou → gerar `BOUNDARY_SCORE_T{n+1}.json` e torná-lo o novo baseline (nunca piorar).
5. **Docs a revisar** (topologia): `CLAUDE.md`, `docs/decouple/DECOUPLING.md`, `docs/decouple/schema-registry/*.json`, `docs/SCHEMA_REFERENCE.md`, READMEs dos 3 repos (zapp-web-v3, evolution-stack, atomica-platform).
6. **Gates:** confirmar que E42/E43/E97 estão ativos e sem exceções novas na allowlist sem justificativa.
7. **Provider:** reavaliar E92 (troca real de provider) — se credenciais cloud existirem, executar ensaio.

## Checklist de saída

- [ ] Placar medido e publicado no ESTADO.md
- [ ] Baseline atualizado (se melhorou)
- [ ] Docs sem contradição com o banco
- [ ] Nenhum gate desligado/allowlist injustificada

## Automação opcional

- Cron mensal (pg_cron ou GitHub Action `schedule`) rodando apenas o passo 1 e alertando se algum invariante piorou.
