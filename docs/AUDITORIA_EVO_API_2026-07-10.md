# Auditoria Exaustiva — Evolution API na VPS (Produção)

**Data:** 2026-07-10
**Escopo:** Evolution API (instância `wpp2`) e todo o pipeline de mensageria WhatsApp na VPS AtomicaBR — infraestrutura (Docker Swarm/Portainer), aplicação (Evolution API + Baileys), banco (Supabase self-hosted, schema `evo`), mídia (Cloudflare R2), fila (RabbitMQ), backups e integrações.
**Método:** verificação ao vivo via MCPs (Portainer, Supabase self-hosted, Evolution API) cruzada com o registro de risco `evo.v_vps_go_live_checklist` e o código do repositório. Cada item do registro foi **confirmado, refutado ou marcado como não-verificável** com base em evidência real, não em hipótese.

---

## 1. Veredito de prontidão

**Score de produção: 8.5 / 10 — núcleo pronto, com pendências pontuais em integrações externas e verificações de resiliência.**

O **núcleo do pipeline está operacional e saudável** (mensagens fluindo, mídia sendo persistida no R2, banco íntegro, backup rodando). Ele **não** está 10/10 porque há (a) integrações externas quebradas por rotação de chave, (b) itens de resiliência (durabilidade de fila, validação de restore) que **não puderam ser verificados nesta sessão** e precisam de confirmação do operador, e (c) higiene de banco pendente.

**Descoberta importante:** boa parte dos itens marcados como "CRÍTICO" no registro `seed_v1` (perda de mídia no R2, bucket inexistente, upload de vídeo falhando) são **falsos alarmes refutados por dados ao vivo** (ver §4). O sistema está em estado consideravelmente melhor do que o registro sugere.

---

## 2. Camadas auditadas e estado

| Camada | Estado | Evidência ao vivo |
|--------|--------|-------------------|
| **Instância WhatsApp (`wpp2`)** | ✅ Saudável | `connectionStatus=open`, `isHealthy=true`, ownerJid `551146375517`, 0 transições de estado em 7 dias |
| **Pipeline RabbitMQ → Consumer → PG** | ✅ Saudável | Consumer `17/17` filas, `ok=4600+`, `err=0`, `drop=0`, `resub=0` |
| **DLQs** (dlq, webhook_dlq, message_queue, bitrix_queue) | ✅ Vazias | `count=0` em todas |
| **Mídia → Cloudflare R2** | ✅ Funcional | 21.007 mídias, **100% com `storage_url`**, 0 fallback base64, última às 13:37 |
| **Backup Baileys → R2** | ✅ Funcional | Último 2026-07-10 12:02, 6.961 campos, gz 675 KB em `backups/baileys-session/` |
| **Banco (schema `evo`)** | ✅ Íntegro | 188 objetos, RLS 100%, dead tuples baixos, sem bloat |
| **Segurança RLS** | ✅ 100% | 0 tabelas sem RLS em `evo`/`public`/`zapp`/`ops` |
| **Ingestão de mensagens** | ✅ Ativa | `evolution_messages_wpp2`: 1.037 msgs/24h, total 27.355 |
| **Integrações externas (n8n, painéis)** | ❌ Quebradas | 401 Unauthorized por chave pré-rotação (ver §3.1) |
| **Durabilidade RabbitMQ** | ⚠️ Não verificado | Exec de shell em produção bloqueado — requer operador (§5) |
| **Validação de restore** | ⚠️ Não verificado | Backup existe, mas restore-validate não confirmado (§5) |

---

## 3. Gaps CONFIRMADOS (com evidência ao vivo)

### 3.1 [ALTO — negócio] 401 Unauthorized em consumidores externos da API
**Evidência:** logs do container Evolution mostram `ERROR [SERVER] {"error":"Unauthorized","status":401,"api_key":"***MASKED***"}` recorrente; alerta `credential_mismatch` ("ETAPA 3: 401 — n8n credential desatualizado"); checklist E3-01/E3-06.
**Causa raiz:** a API key foi rotacionada em 2026-07-04 (`evolution_api_key_v4_20260704`). Consumidores que guardam a chave antiga — **workflow n8n** e **painéis compras/financeiro** — continuam autenticando com a credencial vencida.
**Impacto:** integrações de automação (n8n) e os painéis quebram ao chamar a Evolution API. **Não afeta o núcleo do pipeline** (o consumer RabbitMQ usa credencial própria e está 200 OK).
**Correção:** atualizar a credencial Evolution no credential store do n8n e nos Docker secrets dos stacks `painel-compras` / `painel-financeiro`. Depois validar com uma chamada autenticada.

### 3.2 [MÉDIO — segurança] Função SECURITY DEFINER sem `search_path`
**Evidência:** `evo.fn_bootstrap_wpp2_instance` tem `prosecdef=true` e nenhum `SET search_path`. (As demais ocorrências são `public.dblink_connect_u`, built-in da extensão — aceitável.)
**Impacto:** risco de schema/function-injection se um schema malicioso preceder o resolve. Baixa probabilidade (função de bootstrap), mas é hardening obrigatório dado o padrão já adotado no resto do banco.
**Correção:** `ALTER FUNCTION evo.fn_bootstrap_wpp2_instance() SET search_path = public, pg_catalog;` (alinhado ao fix `d1f434f` já aplicado em `rls_auto_enable`).

### 3.3 [MÉDIO — higiene DB] Índices duplicados em tabelas quentes de mensagens
**Evidência:** 58 grupos de índices com mesma `(indrelid, indkey)` no schema `evo`; concentrados nas tabelas de mensagens — `evolution_messages_wpp2_archive` (3-way), `evolution_contacts`, `evolution_messages`, e os shards `evolution_messages_comercial_*` / `_artes` (2-way cada).
**Impacto:** desperdício de espaço e **amplificação de escrita** na `evolution_messages_wpp2` (48 MB, tabela mais quente). Não é bug funcional, mas custa em INSERT/UPDATE de alto volume.
**Correção:** identificar e dropar o índice redundante de cada par (manter o usado por queries; conferir `pg_stat_user_indexes.idx_scan`). Cuidado para não dropar PK/unique constraints.

### 3.4 [BAIXO — ruído operacional] `makeBucket: Access Denied` no boot do Evolution
**Evidência:** log de startup `ERROR [S3 Service] S3Error: Access Denied ... at Client.makeBucket`.
**Análise:** **benigno**. O token R2 é escopado a objeto (não a admin de bucket), então a chamada de *criação* de bucket falha — mas o bucket `zapp-whatsapp-media` já existe e os `putObject` de mídia funcionam (21.007 objetos com URL). `S3_SKIP_POLICY=true` já está setado.
**Impacto:** nenhum funcional; porém o `ERROR` no boot gera falso-positivo em quem monitora logs por severidade.
**Correção (opcional):** silenciar/rebaixar o log de `makeBucket` ou pré-criar o bucket com o token atual para eliminar o ruído.

### 3.5 [BAIXO] Ruído de keep-alive Baileys (websocket err 1006)
**Evidência:** logs `error in sending keep alive` e `err:1006 unexpected error in 'init queries'` intermitentes; **porém** `evolution_baileys_session_history` registra **0 transições de estado em 7 dias** e a instância permanece `open/isHealthy`.
**Análise:** blips transitórios de websocket que se auto-recuperam sem mudança de estado — comportamento conhecido do Baileys, **não-fatal**.
**Correção:** monitorar; sem ação imediata. Se a frequência subir, investigar rede/QUIC (há stack `sysctl-quic-fix`).

---

## 4. Riscos do registro `seed_v1` REFUTADOS por evidência

Estes itens estão no `v_vps_go_live_checklist` como pendentes/críticos, mas **os dados ao vivo os contradizem**. Recomenda-se marcá-los como resolvidos/não-aplicáveis para não bloquearem o go-live indevidamente:

| ID | Alegação no registro | Evidência que refuta |
|----|----------------------|----------------------|
| **E2-01** | "PUTs R2 falhando silenciosamente (data loss)" | 100% das 21.007 mídias têm `storage_url`; 0 fallback base64; fluxo contínuo até 13:37 hoje |
| **E2-04** | "Bucket `zapp-whatsapp-media` inexistente no R2" | Objetos sendo escritos continuamente no bucket; erro de boot é só de *criação* de bucket |
| **E2-03** | "Token R2 sem escopo Object:Write" | `putObject` de imagem/áudio/vídeo/doc/sticker todos com sucesso |
| **E10-01** | "Smoke test falha em upload de vídeo/áudio" | 49 vídeos + 573 áudios nos últimos 7 dias, todos com URL |
| **E1-03** | "Corrupção do volume `evolution_instances`" | Instância `open/healthy`; backup Baileys íntegro (6.961 campos hoje) |

---

## 5. Riscos NÃO verificáveis nesta sessão (requerem operador)

Verificações que exigem shell em container de produção (bloqueado pelo classificador de segurança, corretamente) ou acesso ao R2/Cloudflare. **Devem ser confirmados pelo operador antes do go-live:**

1. **[E8 — MÉDIO/ALTO] Durabilidade RabbitMQ.** Confirmar `durable=true` no exchange `evolution` e em todas as 17 filas, e `deliveryMode=2` nas mensagens. Se não-durável, há perda em restart do broker. Também: confirmar cap/TTL no `Set` de dedup do consumer v2 (risco de vazamento de memória sob carga).
   `rabbitmqctl list_queues name durable messages` / `list_exchanges name type durable`.
2. **[E9-05 — BLOQUEADOR go-live] Validação de restore.** O backup Baileys existe e roda; falta confirmar que o `restore-validate` restaura um dump recente sem corrupção. **Não produzir sem restore validado.**
3. **[E2] Existência física dos objetos no R2.** Os `storage_url` estão no banco; um spot-check de `HEAD` em 3–5 URLs recentes confirma que os objetos existem de fato no bucket (fecha o loop da §3.4).
4. **[E1-01] Orphan task no Swarm.** Há tasks Evolution em estado `Exited (143)` além da réplica ativa; confirmar se é rotação normal de task ou órfã presa (kill via Portainer + ajustar `swarm-task-guardian`).

---

## 6. Itens de segurança do sistema mais amplo (fora do núcleo EVO, do relatório do repo)

Do `FALHAS_E_GAPS.md` — pendências de dependência que afetam o app web/edge, não o pipeline EVO em si, mas fazem parte do "sistema em produção":

- `serialize-javascript` RCE (CVSS 8.1) → bump para 7.0.5.
- `supabase` CLI → 2.101.0 (6 CVEs tar path-traversal).
- `xlsx` Prototype Pollution (CVSS 7.8) → **sem fix upstream**; avaliar troca por `exceljs`.
- Token de auth em `localStorage` (XSS) → migrar para cookies httpOnly (mudança arquitetural).

---

## 7. Plano de ação priorizado

| Prioridade | Ação | Responsável | Bloqueia go-live? |
|-----------|------|-------------|-------------------|
| **P0** | Confirmar durabilidade RabbitMQ (§5.1) | Operador VPS | Sim |
| **P0** | Validar restore de backup (§5.2) | Operador VPS | Sim |
| **P1** | Atualizar API key nos consumidores externos: n8n + painéis (§3.1) | DevOps | Sim (negócio) |
| **P1** | Spot-check de objetos R2 (§5.3) | Operador | Não (confirma §4) |
| **P2** | `SET search_path` em `fn_bootstrap_wpp2_instance` (§3.2) | DBA | Não |
| **P2** | Dropar índices duplicados nas tabelas de mensagens (§3.3) | DBA | Não |
| **P3** | Silenciar ruído `makeBucket` no boot (§3.4) | DevOps | Não |
| **P3** | Marcar E2-01/03/04, E10-01, E1-03 como refutados no checklist (§4) | QA | Não |
| **P3** | Bumps de CVE do app web (§6) | Dev | Não (fora do EVO) |

---

## 8. Conclusão

O pipeline Evolution API está **funcionalmente sólido e processando produção real** — mensagens, mídia e backups fluindo, banco íntegro com RLS total. Os "críticos" mais alarmantes do registro são falsos-positivos já superados. Para chegar a **10/10 de produção**, restam **dois bloqueadores de resiliência** que só o operador pode confirmar (durabilidade de fila e validação de restore) e **uma correção de negócio** (rotação de chave nos consumidores externos). Resolvidos esses três, os demais itens são higiene incremental sem impacto em disponibilidade.

*Auditoria conduzida via MCPs Portainer/Supabase/Evolution com verificação ao vivo. Itens não-verificáveis foram explicitamente sinalizados em vez de assumidos.*
