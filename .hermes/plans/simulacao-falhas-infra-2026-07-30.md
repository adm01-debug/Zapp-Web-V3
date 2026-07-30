# 📊 Simulação de Falhas de Infraestrutura — 30/07/2026

## 📋 Estado Atual (via Portainer MCP v2.39.5)

| Componente | Status |
|---|---|
| **Portainer** | v2.39.5, Instance UP |
| **Endpoint** | "primary" (tcp://tasks.agent:9001) — **UP** |
| **Docker Engine** | 28.1.1, Ubuntu 20.04.6 LTS |
| **Swarm** | Single-node: Node `bsihx70cz2r0fxxg2e29t8ipe` (AtomicaBR) |
| **Containers** | 81 — **81 running, 0 stopped, 0 paused** |
| **Stacks** | 64 stacks |
| **Serviços** | 71 (2 com 0 réplicas: minio, metabase) |
| **Volumes** | 34 volumes |
| **Imagens** | 71 (várias dangling: ~17 untagged 108.2MB de zapp-web build) |
| **CPU** | 12 vCPUs (Intel/AMD x86_64) |
| **RAM** | ~23.5 GiB total |
| **Redes** | 9 (AtomicaBRNet /24 overlay, ingress, clamav, glitchtip, etc.) |
| **Kernel** | 5.4.0-216-generic (Cgroup v1) |
| **Storage Driver** | overlay2 (extfs) |
| **Swap Limit** | ❌ **Desabilitado** — warning no swap limit support |

---

## 🔴 CENÁRIO 1: Disco da VPS Cheio → Containers Param

**Causa simulação:** Preenchimento de /var/lib/docker com logs, imagens dangling, ou upload massivo no Minio/Supabase Storage.

**Sintomas esperados:**
- Docker daemon para de aceitar novas gravações
- Containers que tentam escrever logs falham (write: no space left on device)
- Postgres entra em modo de erro (não consegue WAL)
- Backup containers travam silenciosamente
- Portainer não consegue salvar estado

**Impacto real:**
- 17 imagens dangling de ~108.2MB cada = ~1.8GB desperdiçados
- Volume `postgres_data`, `minio_data`, `supabase_db_config`, `rabbitmq_data` — todos críticos
- **docker-housekeeping** stack existe (imagem `docker:28-cli`) mas precisa ser verificado se roda auto-prune

**Mitigação existente:**
- ✅ Stack `host-disk-guard` (container monitor de disco)
- ✅ Stack `docker-housekeeping` (cleanup)
- ❌ Swap limit desabilitado no kernel

**Risco:** ⚠️ ALTO — sem swap limit e com dangling images acumulando

---

## 🔴 CENÁRIO 2: Memória RAM Esgotada → OOM Kill

**Causa simulação:** Evolução API consumindo RAM para instâncias WhatsApp, n8n com workflows pesados, OpenWebUI/Ollama carregando modelos.

**Recursos atuais:**
| Serviço | Tipo | Risco OOM |
|---|---|---|
| `evolution_evolution` | API WhatsApp (muitas instâncias) | 🔴 Alto |
| `openwebui_ollama` | LLMs locais | 🔴 Alto |
| `hermes_gateway` | Hermes Agent | 🟡 Médio |
| `supabase_db` | Postgres | 🟡 Médio |
| `n8n_*` (3 serviços) | Automação | 🟡 Médio |
| `rabbitmq_rabbitmq` | Mensageria | 🟢 Baixo |

**OOM Kill Priority:** Kernel OOM killer mata processos na ordem de maior consumidor. **Postgres** e **Evolution** são os primeiros candidatos a OOM.

**Verificação:** Docker info confirma `OomKillDisable: true` — containers podem desabilitar OOM killer individualmente, mas se RAM total acabar, o kernel mata processos host também.

**Risco:** ⚠️ ALTO — Ollama + Evolution + Postgres competem pela mesma RAM (~23.5GiB)

---

## 🔴 CENÁRIO 3: CPU 100% → Sistema Lento

**Causa simulação:** Workload massivo no n8n (muitos workflows), Evolution processando filas, build do zapp-web em loop, ou crawl do gmaps.

**Capacidade atual:** 12 vCPUs

**Sintomas esperados:**
- Latência em todos os serviços aumenta
- Health checks começam a falhar (timeout)
- Swarm marca tasks como failed → reinício constante
- Portainer MCP fica lento (já observamos timeout no MCP server)

**Observado:** Portainer MCP já apresentou instabilidade durante a verificação (`MCP server 'portainer' is unreachable after 3 consecutive failures`)

**Risco:** 🟡 MÉDIO — 12 vCPUs é bom, mas single-node significa contenção total

---

## 🔴 CENÁRIO 4: Rede Docker com Problema → Containers Isolados

**Estrutura de redes atual:**
| Rede | Driver | Subnet | Uso |
|---|---|---|---|
| `AtomicaBRNet` | overlay | 10.0.1.0/24 | Rede principal |
| `ingress` | overlay | 10.0.0.0/24 | Swarm ingress |
| `clamav_default` | overlay | 10.0.2.0/24 | ClamAV |
| `glitchtip_glitchtip-net` | overlay | 10.0.3.0/24 | GlitchTip |
| `vscode-mcp_internal` | overlay | 10.0.4.0/24 | VS Code MCP |

**Causas possíveis:**
- Overlay network com split-brain (single node, baixo risco)
- DNS resolver do Swarm (docker internal DNS) falha
- Firewall iptables bloqueia overlay (firewall backend: iptables)

**Risco:** 🟢 BAIXO — single node, overlay roda local. Se falhar, containers na mesma rede perdem comunicação entre si mas continuam funcionando individualmente.

---

## 🔴 CENÁRIO 5: Portainer Fora do Ar → Sem Gestão

**Causa simulação:** Container Portainer crasha, rede overlay isolada, ou banco do Portainer corrompe.

**Stack atual:** `portainer_portainer` (imagem portainer/portainer-ce:2.39.5) + `portainer_agent` (modo Global)

**Volume crítico:** `portainer_data` (criado em 2024-12-06)

**Sintomas:**
- Todo o MCP `mcp__portainer__` para de responder
- Swarm continua funcionando (Docker engine é independente)
- Perde-se visibilidade e gestão centralizada
- Stacks não podem ser atualizados via Portainer

**Observado durante teste:** Portainer MCP ficou inacessível após algumas chamadas consecutivas — pode indicar limitação de rate-limit ou timeout no servidor MCP.

**Mitigação existente:** ✅ Stack `portainer-state-backup` (faz backup do Portainer)

**Risco:** 🟡 MÉDIO — Portainer MCP já mostrou fragilidade; backup existe

---

## 🔴 CENÁRIO 6: Docker Swarm Node Cai → Serviços Migram

**Estrutura Swarm:**
- **1 único nó** (manager + worker)
- NodeID: `bsihx70cz2r0fxxg2e29t8ipe`
- IP: `209.142.67.51`
- **Sem nós workers adicionais**
- Raft: Single node (ElectionTick: 10, HeartbeatTick: 1)

**Impacto real:**
- ❌ **Não há failover** — services são Replicated=1, não Global
- ❌ **Não há migração possível** — não existe outro nó
- ❌ **Single node Raft perde quorum se cair** — Swarm inteiro precisa ser reinicializado
- ⏱️ Se o nó reiniciar, Docker Swarm pode restaurar (desde que Raft snapshot exista)

**TaskHistoryRetentionLimit:** 1 — apenas 1 histórico de task mantido

**Risco:** 🔴 **CRÍTICO** — infraestrutura single-node sem redundancy

---

## 🔴 CENÁRIO 7: Backup Não Rodou → Sem Restore

**Stacks de backup existentes:**
| Stack | Tipo | Imagem | Status |
|---|---|---|---|
| `postgres-backup-daily` | PostgreSQL → S3 | eeshugerman/postgres-backup-s3:14 | ✅ Ativo (1 réplica) |
| `postgres-backup-weekly` | PostgreSQL → S3 | eeshugerman/postgres-backup-s3:14 | ✅ Ativo (1 réplica) |
| `postgres-backup-monthly` | PostgreSQL → S3 | eeshugerman/postgres-backup-s3:14 | ✅ Ativo (1 réplica) |
| `supabase-backup` | Supabase (pg_dump) | postgres:15-alpine | ✅ Ativo (1 réplica) |
| `supabase-config-backup` | Config only | alpine:3.19 | ✅ Ativo (1 réplica) |
| `hermes-backup` | Config Hermes | alpine:3.19 | ✅ Ativo (1 réplica) |
| `baileys-backup` | Baileys sessions | node:20-alpine | ✅ Ativo (1 réplica) |
| `traefik-cert-backup` | TLS certs | alpine:3.19 | ✅ Ativo (1 réplica) |
| `portainer-state-backup` | Portainer DB | alpine:3.19 | ✅ Ativo (1 réplica) |
| `openclaw-backup` | OpenClaw data | openclaw | ✅ Ativo (1 réplica) |
| `openclaw-backup-guard` | Monitor backup | alpine:3.19 | ✅ Ativo (1 réplica) |

**Causas de falha:**
- 📌 Disco cheio → backup trava
- 📌 Minio (destino S3) com 0 réplicas atualmente
- 📌 Backup sem validação automática pós-restore
- 📌 Postgres WAL堆积 se backup não rodar → disco cheio → círculo vicioso

**Observação crítica:** O stack `minio` (que provavelmente serve como destino S3 dos backups) está com **0 réplicas** — serviço parado! Se o backup S3 do postgres-backup-s3 aponta para Minio, **os backups estão falhando silenciosamente**.

**Restore-validate:** Stack `restore-validate` existe (tipo 2 = standalone container) — indica que há procedimento manual de validação de restore.

**Risco:** 🔴 **CRÍTICO** — Minio parado significa que backups S3 (postgres-backup-*) podem estar sem destino real

---

## 📊 Matriz de Risco Consolidada

| # | Cenário | Risco | Impacto | Mitigação |
|---|---|---|---|---|
| 1 | **Disco cheio** | 🔴 Alto | Containers param, perda de dados | host-disk-guard, docker-housekeeping |
| 2 | **OOM Kill** | 🔴 Alto | Postgres/Evolution morrem | OomKillDisable: true (individual) |
| 3 | **CPU 100%** | 🟡 Médio | Lentidão generalizada | 12 vCPUs absorve bem |
| 4 | **Rede Docker** | 🟢 Baixo | Containers isolados | Single node, baixa prob. |
| 5 | **Portainer off** | 🟡 Médio | Sem gestão visual | portainer-state-backup existe |
| 6 | **Swarm node cai** | 🔴 **Crítico** | Perda total do cluster | **Sem failover** (single node) |
| 7 | **Backup falha** | 🔴 **Crítico** | Sem restore possível | Minio parado ⚠️ |

---

## 🚨 Achados Críticos Imediatos

1. **Minio com 0 réplicas** — backup S3 apontando para Minio não funciona!
2. **Swap limit desabilitado** — sem proteção contra OOM em picos de RAM
3. **Single-node Swarm** — zero resiliência se o nó cair
4. **17 imagens dangling** — ~1.8GB desperdiçados em /var/lib/docker
5. **Portainer MCP instável** — timeouts observados durante diagnóstico

## ✅ Recomendações

- [ ] Iniciar stack **minio** (scale para 1 réplica)
- [ ] Verificar logs dos backups diários (postgres-backup-daily)
- [ ] Rodar `docker image prune` via docker-housekeeping
- [ ] Considerar um segundo nó Swarm para HA
- [ ] Habilitar swap e/ou memory reservation nos containers críticos
- [ ] Implementar validação automática de restore
- [ ] Aumentar `TaskHistoryRetentionLimit` no Swarm (atualmente = 1)

---

*Relatório gerado via Portainer MCP em 30/07/2026 às 14:03 BRT*
