# Migração: workspace volume → ghcr image

**Status:** 🔄 Em progresso (aguardando primeiro build do CI)

**Data início:** 2026-07-22

---

## O que mudou

### Antes (arquitetura antiga)
```yaml
image: nginx:alpine
volumes:
  - claude-code_workspace:/workspace:ro
command: >
  cp /workspace/repos/zapp-web-v3/nginx-prod.conf /etc/nginx/conf.d/default.conf &&
  nginx -g 'daemon off;'
```

**Problema:** A disponibilidade do ZAPP em produção dependia do volume `claude-code_workspace`
(ferramenta de dev). Um rebuild/limpeza do claude-code derrubava o site de produção junto.

### Depois (arquitetura nova)
```yaml
image: ghcr.io/adm01-debug/zapp-web-v3/zapp-web:production-latest
# sem volumes (dist/ está baked na imagem pelo Dockerfile multi-stage)
```

**Vantagem:** Imagem self-contained. Build reproduzível. Zero dependência de ferramentas de dev.
Healthcheck correto em `/healthz` (não mais `/health` via SPA fallback).

---

## Estado atual (2026-07-22)

| Componente | Status |
|-----------|--------|
| Stack Portainer #157 (spec) | ✅ Atualizado para ghcr image |
| Container em execução | ⚠️ Ainda nginx:alpine (rollback automático) |
| Motivo do rollback | Imagem ghcr não existia no momento do update |
| GitHub Actions (build) | 🔄 Buildando... (trigger: push a main) |
| Quando migração completa? | Automaticamente após primeiro build bem-sucedido |

---

## Como completar a migração

Opção A — **Automática** (preferida):
1. Aguardar `build-and-push` job completar no GitHub Actions
2. Verificar que `ghcr.io/adm01-debug/zapp-web-v3/zapp-web:production-latest` existe
3. O workflow fará o deploy via SSH automaticamente

Opção B — **Manual via Portainer**:
```bash
# No Portainer, atualizar stack #157 com pullImage=true
# O stack já está com a spec correta — basta re-aplicar
```

Opção C — **Manual via Hermes**:
```
"Hermes, atualize o stack zapp-web-prod no Portainer puxando a imagem mais recente"
```

---

## Segredos necessários no GitHub Environment `production`

Para o build funcionar com as variáveis corretas, os seguintes secrets devem
estar configurados em **Settings → Environments → production**:

| Secret | Obrigatório para build | Obrigatório para deploy |
|--------|----------------------|------------------------|
| `VITE_SUPABASE_URL` | ✅ | — |
| `VITE_SUPABASE_ANON_KEY` | ✅ | — |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Opcional (fallback para ANON_KEY) | — |
| `VITE_EXTERNAL_SUPABASE_URL` | ✅ | — |
| `VITE_EXTERNAL_SUPABASE_ANON_KEY` | ✅ | — |
| `VITE_ZAPPWEB_SUPABASE_URL` | ✅ | — |
| `VITE_ZAPPWEB_SUPABASE_ANON_KEY` | ✅ | — |
| `VITE_SENTRY_DSN` | Opcional | — |
| `VPS_HOST` | — | ✅ |
| `VPS_USER` | — | ✅ |
| `VPS_SSH_KEY` | — | ✅ |

---

## Verificação pós-migração

```bash
# Container novo deve usar a imagem ghcr
docker service ps zapp-web-prod_web

# Healthcheck deve responder em /healthz (não /health)
curl https://zapp.atomicabr.com.br/healthz
# Esperado: "ok"

# Versão atual
curl https://zapp.atomicabr.com.br/version.json
```

---

_Documento gerado automaticamente pelo agente de processo em 2026-07-22_
