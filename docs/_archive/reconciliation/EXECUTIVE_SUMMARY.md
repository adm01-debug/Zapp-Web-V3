# Resumo Executivo — Auditoria de Reconciliação AtomicaBR (2026-08-04)

**Status geral: 🟢 AMBIENTE OPERACIONAL — 0 P0 ativos · 27 P1 · 28 P2 · nenhuma intervenção de emergência necessária.**

## Contagens

- **Checagens consolidadas:** 102 (8 seções × ~12 checagens, extraídas das etapas 1–92)
- **Status:** ✅ OK 54 · ⚠️ WARN 27 · ❌ FAIL 21
- **Severidade:** 🔴 P0 **0** · 🟠 P1 **27** · 🟡 P2 **28** · ⚪ P3 **7**
- **Por dimensão:** CONFIG 15 · VERSÃO 14 · ARTEFATO 7 · SEGREDO 19 · DADO 10 · MIGRAÇÃO 11 · REDE 15 · SAÚDE 11

## P0 — verificação independente (10/10 OK)

JWT secret idêntico em todos os serviços · schemas expostos existem no banco · containers essenciais UP · **backup de hoje (143,7 MB, legível, R2 offsite)** · DB URL do edge correto · anon key válida (HMAC verificado, exp 2029) · meta sem crash ativo · cron worker ativo · WAL slots ativos · zero segredo hardcoded.

## Top P1 (corrigir em dias)

1. **Schema `evo` usado pelas edges mas não exposto** (PGRST106/406 em `evolution_messages` a cada webhook).
2. **~30 segredos ausentes no env do functions** → Gmail, WhatsApp Cloud/legado, Resend, Bitrix, SICOOB, IMAP e Outlook quebrados; `health/metrics` sem auth (exposição).
3. **Realtime: `messages` subscrita pelo front não publicada** — eventos de mensagens não chegam; duplicidade `public.*` vs `zapp.*`.
4. **supabase_meta: OOM 137 recorrente** (heap 400 MB / cgroup 512 MB) — subir para 1 GB.
5. **Migração 3-way desalinhada** (88 sem arquivo, 4 sem registro, colisão de versão, canonical <9% dos objetos).
6. **Edge functions:** 5 STALE (disk≠repo) + 2 sub-rotas `evolution-api` ausentes (404 em status/stories).
7. **Google OAuth não configurado** (login Gmail indisponível).
8. **Stack file divergente do runtime** (kong 3.9.1 vs 3.9.3+rate-limiting; segredos antigos em claro) — **bloqueia `docker stack deploy`** até alinhar.

## Recomendação de execução

1. **Implantar o guardrail contínuo** (spec na seção 7 da matriz) — custo zero, detecta regressão antes de virar incidente.
2. **Executar P1-01 e P1-02** (schema evo + memória do meta) na primeira janela off-peak — contrato REST e estabilidade de infra.
3. **Iniciar P1-04** (segredos do functions) imediatamente, começando por `HEALTH_SECRET`/`METRICS_SCRAPE_TOKEN` (exposição) e coletando as credenciais 3º (Google/Meta/Resend/Bitrix/SICOOB).
4. **Aplicar os SQLs reversíveis** (P1-05/06/07/08/11) em lote fora de pico — todos com rollback documentado.
5. **P0-03:** alinhar o compose ao runtime antes de QUALQUER `docker stack deploy` (evita P0 induzido).
6. **P2:** lote de higiene em semanas (purge de fila, MIME de áudio, VAULT_ENC_KEY, buckets, healthchecks).

> Detalhes completos: `RECONCILIATION_MATRIX.md` (matriz, evidências, plano com comandos/rollback) · `reconciliation.json` (dados estruturados) · `reconciliation.csv` (planilha).