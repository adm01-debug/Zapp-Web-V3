# Sessao de Execucao — Auditoria Evolution API → 10/10 (2026-07-11)

## Status final validado (11:17 UTC)
- **Score: 100.0/A+** com R13 ativo (desmascaramento honesto — self-heal comprovado: 98.8→100.0 por expiracao natural da janela 1h)
- wpp2: connected/ok · bindings 17/17 · DLQ 0 · audit fluindo · R2 100% · key APENAS em Docker secret

## Executado nesta sessao
1. **R13 health score**: mascaramento `NOT LIKE '%does not exist%'` removido (escondia 114 falhas do incidente pink + 48 do probe e2e quebrado); score = falhas 1h sem filtro; failures_24h informativo; indice parcial `idx_jrd_failed_start`; A/B perf: identica ao R12.
2. **fn_contacts_view_insert**: default de instancia `wpp_pink_test` (morta) → `wpp2` — bug funcional real (contatos novos caiam em instancia inexistente).
3. **Registry**: pink `is_active=false` (status re-sincronizado p/ 'disconnected' pelo sync — ok).
4. **Crons dedup**: 155 (==177) e 134 (==169) removidos; 62 removido por sessao paralela.
5. **R2 validado com sentinela real**: put/stat/remove/list OK — `makeBucket AccessDenied` do boot e BENIGNO.
6. **Consumer v1**: rollback deliberado da sessao paralela; codigo IDENTICO via config `evolution_consumer_v5_2`; sem acao.
7. **Exit 137 do edge-runtime**: NAO era OOM — SIGKILL do stop-first no update do stack supabase; host com 47% RAM livre, PSI=0.
8. **401 */5min**: origem determinada por captura tcp6 diferencial — cliente EXTERNO via Traefik (peer 10.0.1.102 na janela exata). Perfil = uptime monitor com key antiga ou healthcheck em endpoint autenticado. ACAO HUMANA (1 min): revisar painel do monitor de uptime; apontar p/ `/` (publico) ou atualizar key. Evolution rejeita corretamente; risco funcional zero.
9. **Key plaintext removida da Spec.Env** (regressao de 2026-07-10 21:04 revertida). Provado: entrypoint SEMPRE carregou a key do secret corretamente ("entrypoint bug" era diagnostico incorreto dos mesmos 401 externos). Pos-restart: env 0 ocorrencias, secret→200, sem key→401, bindings 17/17.

## ⚠️ ALERTA DE COORDENACAO MULTI-SESSAO
Duas sessoes de agente operaram o mesmo sistema simultaneamente em 10-11/07:
- 21:04 (10/07): force update evolution (auth-key-fix) → colisao AE do exchange → **outage 12min do pipeline v2** (corrigido: exchange redeclarado limpo + policy + 17 bindings).
- 10:31-10:57 (11/07): fixes paralelos (probe e2e, cron 62/175) MAS **sobrescrita do R13** (lost update — reescrita canonica a partir de base desatualizada). R13 re-aplicado 10:58.

**REGRA NOVA**: antes de reescrever `fn_system_health_score`, verificar `position('failures_1h' IN prosrc) > 0` — se true, a base canonica e o R13 (esta migration), nao o R12. Backups de todas as versoes em `ops._fn_backups`.

## Follow-ups (nao bloqueantes)
- Handler de webhook push carrega `health_status=degraded` na transicao final connecting→connected (dado normalizado manualmente; corrigir handler em janela sem sessoes paralelas).
- Detectores 401 do banco sao cegos (dependem de `evolution_ip_watch` que ninguem alimenta) — observabilidade teatral; ligar ao access log do Traefik quando habilitado.
- MCP `evo_status` reporta versao do worker (4.2.0), nao da Evolution (2.3.7) — corrigir label no worker.
- Endpoint `/rabbitmq/set` quebrado na Evolution v2.3.7 (500 'events' undefined) — workaround documentado no runbook.
- consumer-prebuilt:v1 (base 05/05) mais antiga que v2 (06/07) — codigo vem do config; atualizar base em janela de manutencao.
