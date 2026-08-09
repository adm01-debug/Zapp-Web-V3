# 🧹 POLÍTICA ANTI-RESÍDUOS — EVO API (Configs, Secrets, Imagens, Deploys)

**Projeto:** EVO API · VPS AtomicaBR · **Fase E — etapa 98** · **Vigência:** a partir de 08/08/2026
**Âmbito:** stack 25 (evolution), 35 (supabase), 113 (consumer), 124 (backup), 126 (purge),
195/225/226/229/230/231 (monitores), 220 (volume-backup) e demais stacks do Swarm.
**Autor:** agente de governança (execução) · **Revisão:** auditoria mensal (`AUDITORIA_MENSAL.md`)

---

## 1. Objetivo e definição

**Resíduo = qualquer artefato que não é referenciado por nenhum spec ativo** (spec atual OU
PreviousSpec de rollback) e não tem função operacional documentada.

Contexto real que motiva esta política (medido em 08/08/2026):
- **~5GB** de imagens Docker órfãs (4× `evolution-api-custom` 1.29GB + zapp-web antigas + traefik + postgres sem tag)
- **3 secrets** órfãos (`evolution_db_uri_v1`, `minio_s3_access_key_v1/secret_v1`)
- **16 configs** órfãos (`purge_v8/v9`, `guardrail_script_v1/v2`, `watchdog_canary_v1`,
  `zapp_watchdog_sh_v1–v6`, `zapp_health_guard_script_v4–v6`, `traefik_401_collector_v1`, `wal_slot_guard_v12`, …)
- Purge v9 100% quebrado por 2 dias **sem nenhum alerta** (DELETE LIMIT inválido + coluna inexistente
  + logs de sucesso falsos — lição: validação e observabilidade do ciclo são obrigatórias)

---

## 2. Regras

### R1 — Ciclo de vida de configs/secrets: criar → atualizar → verificar → remover (≤ 48h)

Todo artefato novo **versionado** (R2). Toda troca de versão segue a ordem OBRIGATÓRIA:

```
1. CRIAR o canônico novo (docker config create / secret create)
2. ATUALIZAR o stack (Portainer) apontando para o novo
3. VERIFICAR task nova saudável + logs do 1º ciclo (critério de aceite do artefato)
4. REMOVER o antigo em ≤ 48h após a verificação
```

**Prazos (SLO):**

| Artefato | Detecção de órfão | Remoção | Exceção |
|---|---|---|---|
| Config | no deploy seguinte ou auditoria | **≤ 48h** | se for PreviousSpec de rollback (manter até estabilizar 72h) |
| Secret | no deploy seguinte ou auditoria | **≤ 48h** | se passphrase de backup ativa (nunca remover antes de os backups antigos expirarem) |
| Imagem | `docker images` vs Spec+PreviousSpec | **≤ 48h** | se é anchor de rollback local (re-tagar via `ensure_ref_tags`) |
| Migração SQL/tabelas | após merge/deploy | **≤ 48h** | — |

> **Proibido inverter a ordem:** atualizar o stack antes de criar o novo artefato = deploy falha
> (`secret not found` / `config not found`) e o serviço fica com spec quebrado.
> **Proibido remover antes de verificar:** o Swarm bloqueia `secret rm`/`config rm` enquanto
> QUALQUER spec referencia (mesmo scale=0) — use o bloqueio como double-check, nunca force.

### R2 — Nomes versionados (obrigatório)

Todo config/secret de script ou segredo **deve** carregar versão + data no nome:

| Padrão | Exemplos reais |
|---|---|
| `purge_v<N>_YYYYMMDD` | `purge_v10_20260808` ✅ (v8/v9 órfãos — remover) |
| `traefik_401_collector_v<N>` | `traefik_401_collector_v3` ✅ |
| `guardrail_script_v<N>` | `guardrail_script_v4` ✅ |
| `realtime_keepalive_v<N>` | `realtime_keepalive_v2` ✅ |
| `evolution_api_key_v<N>_YYYYMMDD` | `evolution_api_key_v6_20260808` ✅ |
| `supabase_evolution_webhook_secret_v<N>` | `_v1` ativo (rotação p/ `_v2` em andamento) |

**Proibido:** sobrescrever o artefato ativo com o mesmo nome (impossibilita rollback),
nomes sem versão (`guardrail.sh`), sufixos sem data para artefatos rotativos.

### R3 — Configs grandes sempre via gzip (limite 500KB do Swarm)

```bash
# scripts > ~450KB (ou qualquer script, por padrão):
gzip -c purge-v10.sh | base64 -w0        # → conteúdo para docker config create
docker config create purge_v10_20260808 /tmp/purge-v10.sh   # a partir do arquivo no host
```
- O compose monta o config em `/tmp/<nome>` com `mode: 0444` e `entrypoint: exec sh /tmp/<nome>`.
- **Proibido:** base64 inline gigante dentro do compose (quebra diff/review — lição do evo-reconcile, etapa 96).

### R4 — Housekeeping com gates (nunca prune cego)

Regras de ouro validadas em 08/08 (`higiene/HIGIENE_EXEC.sh` + skill `docker-swarm-housekeeping-safety`):

1. **NUNCA `docker image prune` / `prune -a`** — o prune não conhece PreviousSpec do Swarm e
   remove anchors de rollback em ≤1h silenciosamente. Usar **rmi por ref explícita** (`repo:tag` completo,
   nunca short-ID — colisão real `e1a210286b42` em evolution E zapp-web).
2. **`ensure_ref_tags` antes de qualquer prune/rmi** (re-tagar Spec+PreviousSpec existentes localmente).
3. **Gates por imagem**: candidata no Spec ATUAL → aborta tudo; `evolution-api-custom:*` no PreviousSpec
   → aborta tudo (anchor 1.29GB); `zapp-web:production-*` no PreviousSpec → skip da imagem.
4. **Pausar housekeeping periódico durante a janela** (`docker service scale <svc>=0`, trap restaura).
5. **Sempre DRY_RUN primeiro**: `DRY_RUN=1 docker exec docker:28-cli bash /tmp/HIGIENE_EXEC.sh`.
6. **OCI index**: em pacotes buildx, NUNCA `delete-only-untagged-versions: true` (apaga filhos do index
   → `docker pull <tag>` falha com `manifest unknown` — rollback quebrado).
7. Ordem de remoção segura: **configs → secrets → imagens** (1×1, maior→menor).

### R5 — Checklist pós-deploy (obrigatório em todo deploy)

```
[ ] Artefato novo criado ANTES do update (config/secret versionado)
[ ] Deploy aplicado via Portainer (maestro) — 1 mudança = 1 verificação
[ ] 1º ciclo validado (logs sem erro, saída coerente) — critério de aceite do artefato
[ ] Nome antigo identificado e agendado para remoção ≤ 48h
[ ] Grep de referências FORA do Swarm (compose files versionados, crontab, runbooks, monitors/*.sh)
    — ref fora do Swarm ao "órfão" quebra o próximo deploy a partir do FILE
[ ] Rollback documentado (compose anterior / digest anterior) e possível
[ ] Linha no relatório de auditoria mensal
```

---

## 3. Inventário atual de resíduos (08/08/2026 — pendências)

| Tipo | Itens | Ação | Prazo |
|---|---|---|---|
| Imagens | `evolution-api-custom:71778fcc8d6e`, `:e1a210286b42` (2×1.29GB) | HIGIENE_EXEC.sh (gate duro: aborta se PreviousSpec) | ≤ 48h do deploy |
| Imagens | `zapp-web:production-60ed90e0fe29`, `:e1a210286b42`, `:6e368fa229e7` (~350MB) | HIGIENE_EXEC.sh (soft: skip se PreviousSpec — `ae7ac980742c` MANTER se PREV) | ≤ 48h |
| Secrets | `minio_s3_access_key_v1`, `minio_s3_secret_key_v1` | `docker secret rm` | ≤ 48h |
| Configs | 16 itens (lista em `higiene/HIGIENE_README.md` §1) | `docker config rm` | ≤ 48h |
| Migrações | schema `evo` (~40 tabelas vazias) | `db/SCHEMA_EVO_DROP_FINAL.sql` (DETACH+DROP com checklist) | ciclo C |
| Edge fns | `.backup*`/`.bak*` residuais (105 STALE) | sync etapa B2 | ciclo B |

**Protegidos (NUNCA remover):** `purge_v10_20260808` (ativo), `realtime_keepalive_v2` (ativo),
`evolution_api_key_*` (ativos), `rabbitmq_url_evolution_v1` (stack 25), `supabase_evolution_webhook_secret_v1`
(stack 35 — até rotação HMAC concluir), passphrases de backup vigentes.

---

## 4. Responsabilidades e cadência

| Papel | Responsabilidade |
|---|---|
| **Operador/agente** | Detecta resíduos, prepara planos com gates, valida DRY_RUN |
| **Maestro** | Executa deploys e remoções; 1 mudança = 1 verificação |
| **Auditoria mensal** | Verifica inventário, prazos ≤48h, 0 resíduos novos (`AUDITORIA_MENSAL.md`) |
| **Todos** | Grep de refs fora do Swarm antes de qualquer remoção; documentar divergência se plano-fonte não existir |

**Regra final:** se um artefato não tem spec ativo, não é PreviousSpec, não está em compose/crontab/
runbook e não é recriável a partir de fonte versionada → é resíduo → **remover em ≤ 48h**.
Tudo é recriável: imagens vivem no GHCR (pull por `tag@sha256:<digest>`), secrets/configs são texto
recriável a partir dos compose files versionados.
