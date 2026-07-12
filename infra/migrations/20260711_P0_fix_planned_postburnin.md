# P0 Fix Planejado — Pós Burnin (≥ 2026-07-14 12:00 UTC)

## Status: AGUARDANDO BURNIN

O teste exaustivo de validação (2026-07-11 ~14:30 UTC) identificou 3 regressões no Spec atual
do service `evolution_evolution` (label `auth-key-spec-env-2026-07-11`, Version.Index=12525240).

---

## Regressões Encontradas (Spec atual vs PreviousSpec)

### P0 — AUTHENTICATION_API_KEY em env plaintext
**Risco:** Exposta no `docker service inspect` — qualquer operador com acesso ao Portainer
pode ver o valor em texto claro.
**Evidência:**
```
"AUTHENTICATION_API_KEY=[REDACTED — valor exposto em histórico git; rotacionar via Evolution API]"
```
Presente em `Spec.TaskTemplate.ContainerSpec.Env`.
**Impacto funcional:** Zero (o entrypoint sobrepõe com o secret via `cat /run/secrets/... | tr -d`).
**Impacto de segurança:** Médio (exposição via docker inspect, requer acesso ao Portainer).

### P1 — T5a ausente no logpatch atual
**Evidência:** `/tmp/logpatch.cjs` tem 62 linhas; `T5a_in_logpatch: false`.
Logs do container mostram CACHE logs verbosos.
**Impacto:** Ruído de log — sem impacto funcional.

### P2 — T3 sem filtro `makeBucket`
**Evidência:** O T3 atual não tem `||e.message.includes("makeBucket")`.
**Impacto:** Erros de init do MinIO/R2 aparecem no Sentry — ruído, sem impacto funcional.

---

## Causa

O update de `13:53-13:57 UTC de 11/07/2026` aplicou o Spec com label
`auth-key-spec-env-2026-07-11`. Esse Spec contém:
- API key em plaintext em vez de exclusivamente via secret
- Versão do logpatch sem T5a
- T3 sem makeBucket

O PreviousSpec (`auth-key-secret-restore-20260711-r13-plaintext-env-removed`) tinha
T5a e `tr -d` corretos mas também não tinha T3+makeBucket.

---

## Fix Planejado

Aplicar `portainer_update_service` com o entrypoint definitivo correto **após** o burnin
concluir (~2026-07-14 12:00 UTC). O entrypoint correto está em:
`infra/evolution/docker-compose.evolution.yml` (commit ccdef3bc).

O entrypoint canônico tem:
- Sem `AUTHENTICATION_API_KEY` no env (usa apenas secret via `cat | tr -d`)
- T3 com `||e.message.includes("makeBucket")`
- T5a com remoção do CACHE log verboso
- `tr -d '\n\r'` em todos os secrets loading

### Procedimento de aplicação:
```bash
# Verificar Version.Index atual antes de aplicar
docker service inspect evolution_evolution --format '{{.Version.Index}}'

# Aplicar via portainer_update_service com:
# - Version.Index correto
# - Command do docker-compose.evolution.yml
# - Sem AUTHENTICATION_API_KEY no Env
# - Label: fix-p0-t3-t5a-postburnin-20260714

# Monitorar após restart:
# wpp2 reconnect deve ocorrer em <90s
# burnin já passou — sem risco de reset
```

### Validação pós-fix:
```bash
# Verificar que T5a foi aplicado:
grep 'T5a\|t5_src' /tmp/logpatch.cjs

# Verificar que API key não está em env:
docker service inspect evolution_evolution | grep AUTHENTICATION_API_KEY
# deve retornar vazio (apenas no secret)

# Verificar CACHE log sumiu dos logs:
docker service logs evolution_evolution 2>&1 | grep 'CACHE:'
# deve retornar vazio após alguns minutos

# Verificar score:
SELECT public.fn_system_health_score();
# deve ser 100.0/A+ (assumindo backup recente)
```

---

## Por que NÃO aplicar agora?

O burnin de 72h está em andamento:
- `burn_in_start: 2026-07-11T12:00:00Z`
- `elapsed: 3.6h`  
- `remaining: 68.4h`
- `worst_disconnect_so_far: 6s`

Um rolling restart do Evolution causa desconexão estimada de 90-150s do wpp2.
O threshold do burnin é 120s (`fn_burnin_disconnection_check`).
Risco de reset do contador de 72h → Não aplicar até o burnin passar.

---

## Status do Sistema Atual (sem o fix)

- wpp2: CONNECTED, isHealthy=true, uptime >1h
- T4 mascaramento: ATIVO (api_key=***MASKED*** nos logs)
- T1+T2 LGPD: ATIVOS
- T3 Sentry 401/DEVICE_REMOVED: ATIVO (sem makeBucket)
- T5a CACHE log: AUSENTE (ruído nos logs)
- Consumer v18: RUNNING, 88 eventos/30min, 0 erros
- Score: 97.5/A+ (degradação orgânica de backup_freshness)
