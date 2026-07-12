# SOP: Deploy Seguro do Watchdog Baileys

**Versão:** 1.0 | **Data:** 2026-07-05 | **Origem:** Post-mortem X02

## Por que este SOP existe

Em 05/07/2026, o watchdog v10 foi reliado com `replicas: 1` ANTES do
v11 (que desabilitava o gap-restart) ser deployado. O watchdog v10 ativou
imediatamente e triggerou um restart da Evolution por `gap=97min`. Esse restart
quebrou a sessão Baileys e expirou o WhatsApp (disconnectionReasonCode: 401),
resultando em QR re-scan manual necessário.

**Regra de Ouro:** _Nunca ative replicas antes de validar a lógica do script._

---

## Pré-requisitos

- Acesso ao Portainer (`portainer.atomicabr.com.br`)
- Stack ID do watchdog: `109` (watchdog-baileys)
- WhatsApp deve estar em `state=open` antes do deploy

---

## Procedimento (5 etapas)

### Etapa 1 — Verificar estado atual (2 min)

```bash
# Via EVO MCP ou curl:
curl -H 'apikey: <KEY>' https://evolution.atomicabr.com.br/instance/connectionState/wpp2
# Esperado: {"instance":{"state":"open"}}
```

⚠️ **SE state != open: PARAR. Não deployár até WhatsApp reconectar.**

### Etapa 2 — Preparar nova versão com `replicas: 0` (5 min)

No stack file, garantir:
```yaml
deploy:
  replicas: 0  # ← SEMPRE iniciar com 0 ao mudar lógica
```

Aplicar via Portainer > Stack 109 > Editor > Update.

### Etapa 3 — Validar o script sem executar (5 min)

Bash dry-run no script embutido:
```bash
# Verificar se o script tem a variável de gap-restart
grep -i 'gap_restart\|GAP_MIN\|gap.*restart' /watchdog.sh
# Verificar se não há restart por gap (v11+ não deve ter)
grep 'restart_service.*gap\|gap.*restart_service' /watchdog.sh && echo 'ALERTA: gap-restart ativo'
```

### Etapa 4 — Ativar com `replicas: 1` (2 min)

Somente após confirmar a lógica:
```yaml
deploy:
  replicas: 1  # Ativar apenas aqui
```

Aplicar via Portainer.

### Etapa 5 — Monitorar primeiro ciclo (5 min)

Acompanhar logs:
```
Portainer > Services > watchdog-baileys_watchdog > Logs
```

Esperado no primeiro log:
```
[INFO] watchdog vXX started | ...
[INFO] state=open last_event_age=Xmin
```

⚠️ Se aparecer `[ERROR] restart triggered` no primeiro ciclo: rollback imediato.

---

## Checklist de Validação Pós-Deploy

- [ ] `state=open` após 5 minutos
- [ ] Nenhum `restart triggered` no primeiro ciclo (5min)
- [ ] `device_removed` suprimido se reason=401
- [ ] GlitchTip recebeu evento `watchdog vXX started`
- [ ] `warroom_alerts` sem entradas de `WhatsApp instance unhealthy`

---

## Rollback

```
Portainer > Stack 109 > replicas: 0 > Update
```

---

## Leituras relacionadas

- `infra/stacks/watchdog-baileys/` (stack files versionados)
- Post-mortem: `warroom_alerts #842` (2026-07-05)
- Ticket de origem: X02 na validação 2026-07-05
