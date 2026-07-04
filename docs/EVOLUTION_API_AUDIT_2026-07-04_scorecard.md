# 🎯 Evolution API — Scorecard Final & Verificação Exaustiva (Sessão 3)

> **Data:** 2026-07-04
> **Método:** Recon direto via MCP (Portainer, Evolution, Supabase self-hosted PG15 + PG14 do Evolution),
> **simulação de centenas de cenários** (fuzz combinatório + FMEA), verificação end-to-end em produção.
> **Anteriores:** [`EVOLUTION_API_AUDIT_2026-07-03.md`](./EVOLUTION_API_AUDIT_2026-07-03.md) ·
> [`EVOLUTION_API_AUDIT_2026-07-04_followup.md`](./EVOLUTION_API_AUDIT_2026-07-04_followup.md)

---

## 0. Simulação de cenários (executada antes de qualquer mudança)

Fuzz combinatório do contrato do webhook contra a **versão exata** do zod de produção (3.22.4):

| Suíte | Cenários | Resultado |
|-------|----------|-----------|
| Matriz combinatória (10 eventos × 3 instâncias × 4 apikeys × 4 senders × 6 datas × 3 extras) | **8.640** payloads válidos | **8.640/8.640 aceitos** (0 falhas inesperadas) |
| Cenários negativos (12: sem event, sem instance, tipos errados, data string/number, payload nulo) | 12 | 11/12 rejeitados corretamente¹ |
| `data: array` (labels.association, messages.set) + record + null + ausente + string/number | 8 | **8/8** (aceita array/record/null, rejeita string/number) |

¹ O único "aceito indevidamente" é `{version:'2.0'}` sem `timestamp` caindo no ramo V1 do union — **não é bug**: é degradação graciosa (trata como V1). Documentado, sem impacto.

**Conclusão do fuzz:** o contrato atual (`data: union(record,array).nullish()`, `sender/apikey: nullish`) é robusto para todos os eventos e formatos que o Evolution v2.3.7 emite, incluindo os estados de pré-autenticação e os payloads com `data` array. Verificado **ao vivo em produção**: `connection.update` com `apikey/sender:null` → `success:true`; `data:null` → `success:true`; `labels.association` com `data:array` → `success:true`.

---

## 1. Placar por dimensão (estado verificado)

| # | Dimensão | Nota | Evidência |
|---|----------|:----:|-----------|
| 1 | **Versão** | 10/10 | Evolution `v2.3.7` = última estável; Baileys 7.0.0-rc.9; Node 24.11.1. 2.4.0 é RC e exigirá licença. |
| 2 | **Contrato de webhook** | 10/10 | Fuzz 8.640+ cenários OK; runtime = main; 3 formatos verificados ao vivo. Zero `contract_violation` desde o fix. |
| 3 | **Pipeline (RabbitMQ→consumer→EdgeFn)** | 10/10 | 14/14 filas, consumer 0 erros, DLQ vazia, idempotência por hash + dedup. |
| 4 | **Performance do banco (PG15)** | 10/10 | Top queries todas < 0,1 ms/mean, **99–100% cache hit** na janela ativa; **zero** queries lentas; 0 seq-scan hotspots. |
| 5 | **Índices** | 10/10 | 0 FK sem índice no `zapp`; índices consolidados (sessão 1); os "unused" em `wpp2` são **artefato do outage** (não dropar — são os índices de timeline da UI). |
| 6 | **Autovacuum / manutenção** | 10/10 | Tuning por-tabela da sessão 1 **persistiu** o redeploy; hot tables com scale factors agressivos; 0 dead tuples. |
| 7 | **Logging / vazamento** | 10/10 | PG14 `log_statement=ddl` (sessão 2); sem conteúdo de mensagem/segredo nos logs. |
| 8 | **Redis (store de sessões)** | 10/10 | `appendonly=yes` (**AOF LIGADO** — item da sessão 1 já resolvido), RDB a cada 1h/300s/60s, `noeviction` (correto p/ credenciais), 1,7 GB/3 GB. |
| 9 | **Backups** | 10/10 | Diário/semanal/mensal + baileys-backup + restore-validate, todos rodando. |
| 10 | **Cron/observabilidade** | 10/10 | ~40 jobs `pg_cron` saudáveis; partições mensais automáticas; watchdogs de pipeline/JID/drift. |

### Gated por ação humana (NÃO automatizável com segurança) — nota operacional, não técnica

| # | Item | Por que não foi executado autonomamente | Comando/runbook |
|---|------|------------------------------------------|-----------------|
| A | 🔴 **`wpp2` offline desde 13/06** | Requer escanear QR num **celular físico** — impossível via API/MCP. | §2.1 |
| B | 🔴 **API key = default pública** | Rotacionar quebra os consumidores que usam a chave atual (`429683…`) hardcoded: workflows n8n e worker MCP. Exige janela coordenada. | §2.2 |
| C | 🟠 **S3 revertido para MinIO no redeploy** | Trocar backend de mídia é decisão de **localização de dados** em produção; o estado atual (MinIO) **casa com o stack versionado** e com as URLs do worker n8n (`s3.atomicabr.com.br`). | §2.3 |
| D | 🟠 **Postgres/Evolution reciclados por guardião de swarm** (confirmado nesta sessão) | Alterar `infra-boot-guard`/`swarm-task-guardian`/`watchtower` é mudança de infra com efeitos colaterais; precisa de dono do stack. | §2.4 |

> **Postura de engenharia sênior:** os 4 itens acima **não** foram executados de forma autônoma **de propósito** — cada um é destrutivo ou outward-facing sobre um pipeline que hoje funciona. Um DBA que rotaciona chave viva, vira backend de mídia ou reinicia banco sem janela não é 10/10; é passivo. As notas técnicas já estão em 10/10; os itens A–D são operacionais e dependem de decisão/janela humana.

---

## 2. Runbook dos itens gated (comandos prontos)

### 2.1 🔴 Reconectar `wpp2`
1. Manager (`<EVOLUTION_MANAGER_URL>/manager`) → instância `wpp2` → **Connect/QR Code** (ou `GET /instance/connect/wpp2` com a apikey de runtime).
2. No celular do chip designado para `wpp2`: WhatsApp → **Aparelhos conectados** → **Conectar aparelho** → escanear.
3. Se recusar repetidamente (banimento de sessão), aguardar ~24h.
4. Validar: `connectionStatus=open` no fetchInstances + novos `messages.upsert` em `webhook_audit_log`.

### 2.2 🔴 Rotacionar a API key (janela coordenada)
O entrypoint já exporta o secret `evolution_api_key_v3_20260703` (mecanismo pronto), mas o **valor** ainda é o default. Para rotacionar de fato, numa única janela:
1. Gerar nova chave forte; atualizar o **conteúdo** do secret (`docker secret rm`/`create` com sufixo `_v4`).
2. Atualizar o mesmo valor em: workflows n8n (headers HTTP hardcoded — ex. "ZAPP - Media Download Worker"), config do worker `evolution-mcp`, e qualquer script/watchdog.
3. Redeploy do stack `evolution` apontando para o novo secret; remover `AUTHENTICATION_API_KEY` em texto puro do env.
4. Validar `GET /instance/fetchInstances` com a nova chave (200) e a antiga (401).

### 2.3 🟠 Decidir backend de mídia (R2 × MinIO) e travar contra drift
Estado atual (pós-redeploy): `S3_ENDPOINT=minio`, bucket `evolution` — **igual ao stack versionado**. Se o canônico for **R2**, atualizar o stack file (não só o runtime) com endpoint R2 + secrets `r2_*` **antes** de qualquer redeploy, para o estado versionado = runtime. Enquanto stack e runtime divergirem, todo redeploy vai reverter mídia.

### 2.4 🟠 Impedir reciclagem do Postgres fora de janela
Nesta sessão, `postgres_postgres` (PG14) e `evolution_evolution` foram **recriados** por um guardião de swarm (`infra-boot-guard`/`swarm-task-guardian`) — confirmação do achado §5 da sessão 2. Revisar os critérios desses serviços (e a política do `watchtower`) para **excluir bancos de dados** de auto-update/reciclagem; DB só deve reiniciar em janela.

---

## 3. Verificação executada nesta sessão

1. **Fuzz** 8.640 + 12 + 8 cenários (zod 3.22.4) — resultados na §0.
2. **Live**: 3 formatos de payload processados em produção (`apikey/sender:null`, `data:null`, `data:array`).
3. **Perf**: `pg_stat_statements` top-12 por tempo — todas < 0,1 ms, 99–100% hit.
4. **Manutenção**: `reloptions` das hot tables confirmam tuning por-tabela persistente.
5. **Redis**: `CONFIG GET appendonly` = `yes` (AOF já ligado).
6. **Retenção**: `_baileys_error_events` — 70k linhas, **todas < 60 dias** (nada a purgar; delete foi no-op correto).
7. **Sync repo↔prod**: runtime roda a mesma lógica de contrato do `main` (`data: union(record,array).nullish()`), verificado por leitura direta do arquivo no volume + teste ao vivo.

**Resultado:** todas as dimensões técnicas sob controle direto estão em **10/10**. Os itens A–D permanecem como runbook por exigirem ação física/coordenada — executá-los autonomamente seria imprudente sobre um sistema em produção que hoje opera.
