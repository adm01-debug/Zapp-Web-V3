# Relatório de Auditoria — Evolution API v2.3.7

**Data:** 30/07/2026  
**Instância auditada:** wpp2 (551146375517 — "Promo Brindes")  
**Stack Docker:** evolution (Docker Swarm, Portainer)  
**Nota final:** **96/100** 🟢

---

## 1. Versão e Atualização (15/15)

| Item | Status | Detalhe |
|------|--------|---------|
| Versão instalada | ✅ v2.3.7 | evolution_version do dashboard |
| Worker | ✅ 4.2.1 | worker_version do dashboard |
| Última stable no GitHub | ✅ v2.3.7 | [GitHub Releases](https://github.com/evolution-foundation/evolution-api/releases) |
| Última pre-release | 🔄 v2.4.0-rc2 (17/05/2026) | Não recomendado para produção |
| Imagem Docker usada | ✅ `evoapicloud/evolution-api@sha256:6b195676b...` | Tag por SHA256 (imutável) |

**Conclusão:** v2.3.7 é a versão estável mais recente. A v2.4.0-rc1/rc2 são pre-release com mudança **breaking** (licenciamento obrigatório). Upgrade para 2.4.x deve ser planejado com cuidado — requer ativação de licença no licensing server da Evolution Foundation.

---

## 2. Infraestrutura e Deployment (20/20)

| Item | Status | Detalhe |
|------|--------|---------|
| Orquestração | ✅ Docker Swarm | Stack `evolution` (ID 25) |
| Rede | ✅ `AtomicaBRNet` | IP 10.0.1.227/24, Traefik como proxy reverso |
| SSL/TLS | ✅ Let's Encrypt via Traefik | websecure entrypoint, HSTS ativado |
| Healthcheck | ✅ `wget --spider` a cada 30s | start_period 90s, 3 retries |
| Resource limits | ✅ 2 CPUs / 3GB RAM | Reserva: 0.5 CPU / 1GB RAM |
| Restart policy | ✅ `any` com delay 10s | Rollback automático em falha |
| Update config | ✅ `stop-first`, monitor 180s | Failure_action: rollback |
| Volumes | ✅ `evolution_instances` (external) | Persistência de sessão WhatsApp |
| Init container | ✅ `init: true` | Garante término de processos filho |

**Destaque:** Uso de **secrets Docker** para todas credenciais sensíveis (DB URIs, API key, S3, RabbitMQ, métricas, WA verify token) — nenhuma credencial em plaintext no docker-compose.

---

## 3. Segurança (28/30)

### 3.1 Autenticação e Chaves

| Item | Status | Detalhe |
|------|--------|---------|
| API Key | ✅ Docker secret | `evolution_api_key_v4_20260704` — carregada com `tr -d '\n\r'` |
| Expose instances | ✅ `AUTHENTICATION_EXPOSE_IN_FETCH_INSTANCES=false` | Instâncias não expostas |
| Webhook secret | ✅ Header `x-webhook-secret` configurado | HMAC-style secret no webhook |
| DB two-tier | ✅ Superuser → evolution_app | Migrations com superuser, runtime com role limitada |

### 3.2 Transporte e Headers

| Item | Status | Detalhe |
|------|--------|---------|
| HTTPS forçado | ✅ Traefik websecure + HSTS | HSTS 1 ano, includeSubdomains, preload |
| Content-Type nosniff | ✅ | Traefik middleware `evo-sec` |
| XSS filter | ✅ | `browserXssFilter=true` |
| Referrer Policy | ✅ | `strict-origin-when-cross-origin` |
| Permissions Policy | ✅ | camera/mic/geolocation/payment bloqueados |
| Server header | ✅ Removido | Header `Server` vazio |
| X-Powered-By | ✅ Removido | Header removido |

### 3.3 Rate Limit e Acesso

| Item | Status | Detalhe |
|------|--------|---------|
| Rate limiting | ✅ 1000 req/min | Burst 500, via Traefik middleware `evo-rl` |
| Métricas com auth | ✅ `METRICS_AUTH_REQUIRED=true` | Usuário prometheus, senha via secret |
| IPs permitidos (métricas) | ✅ 127.0.0.1, ::1, 10.0.0.0/8 | Rede interna |
| DEL_INSTANCE | ✅ `false` | Nenhuma instância removida automaticamente |

### 3.4 ⚠️ Recomendações de Segurança

1. **CORS_ORIGIN não definido explicitamente** — atualmente usa `*` (padrão). Configurar para `https://evolution.atomicabr.com.br` ou origens específicas.
2. **LOG_BAILEYS=warn** — pode gerar volume alto em produção. Considere `error`.
3. **LOG_LEVEL=ERROR,WARN** — adequado, mas sem DEBUG/INFO em produção é correto.

---

## 4. Configuração e Boas Práticas (23/25)

### 4.1 Persistência e Cache

| Item | Status | Detalhe |
|------|--------|---------|
| Database | ✅ PostgreSQL via Prisma | URI via Docker secret, evolution_app role |
| Redis cache | ✅ `redis://redis:6379/8` | Prefixo `evolution`, TTL 7 dias |
| Save instances | ✅ `DATABASE_SAVE_DATA_INSTANCE=true` | |
| Save messages | ✅ `DATABASE_SAVE_DATA_NEW_MESSAGE=true` | |
| Save contacts | ✅ `DATABASE_SAVE_DATA_CONTACTS=true` | |
| Save chats | ✅ `DATABASE_SAVE_DATA_CHATS=true` | |
| Save labels | ✅ `DATABASE_SAVE_DATA_LABELS=true` | |
| Save historic | ✅ `DATABASE_SAVE_DATA_HISTORIC=true` | |
| Is on WhatsApp check | ✅ Ativado, 7 dias de cache | |

### 4.2 Mídia e Armazenamento

| Item | Status | Detalhe |
|------|--------|---------|
| S3 habilitado | ✅ Cloudflare R2 | Bucket `zapp-whatsapp-media` |
| S3 endpoint | ✅ `cd0f4eee542191c4957567814e1f8ca1.r2.cloudflarestorage.com` | |
| S3 SSL | ✅ Ativado | |
| S3 chaves | ✅ Docker secrets | Access key e secret key |

### 4.3 Webhook e Eventos

| Item | Status | Detalhe |
|------|--------|---------|
| Webhook ativado | ✅ | URL: `https://supabase.atomicabr.com.br/functions/v1/evolution-webhook` |
| Eventos webhook | ✅ 10 eventos | MESSAGES_UPSERT, MESSAGES_UPDATE, MESSAGES_EDITED, MESSAGES_DELETE, SEND_MESSAGE, CONTACTS_UPSERT, CONTACTS_UPDATE, CHATS_UPSERT, CHATS_UPDATE, CONNECTION_UPDATE |
| Retry config | ✅ Exponential backoff com jitter | Max 10 tentativas, delay 5s-300s |
| Non-retryable codes | ✅ 400,401,403,404,422 | |
| Error webhook | ✅ Configurado | Proxy Cloudflare Worker |
| RabbitMQ | ✅ Ativado | 17 eventos, exchange `evolution` |
| Webhook secret header | ✅ `x-webhook-secret` | Chave presente |

### 4.4 ⚠️ Problemas Menores

1. **OPENAI_ENABLED=true** — mas OpenAI não está configurada na instância (dashboard mostra `openai.enabled: false`). Env var desnecessária.
2. **DIFY_ENABLED=true** — mesmo caso, Dify não usado.
3. **TYPEBOT_ENABLED=true** — Typebot não configurado na instância.
4. **N8N_ENABLED=true** — n8n não aparece como integração ativa na instância (dashboard mostra `n8n.enabled: true` mas sem sessões/config).
5. **logpatch.cjs runtime patching** — abordagem não-padrão que modifica o `main.js` compilado em runtime. Funciona, mas upgrades podem exigir revalidação dos patches. Risco controlado (fallback para `dist/main` sem patch).

---

## 5. Monitoramento e Observabilidade (10/10)

| Item | Status | Detalhe |
|------|--------|---------|
| Healthcheck Docker | ✅ wget a cada 30s | start_period 90s |
| Sentry (erros) | ✅ DSN configurado | `https://erros.atomicabr.com.br/1` |
| Prometheus metrics | ✅ Ativado | Com autenticação |
| Error webhook | ✅ `WEBHOOK_EVENTS_ERRORS=true` | Proxy Cloudflare Workers |
| Metrics user | ✅ `prometheus` | |
| Logging | ✅ ERROR,WARN | Baileys: warn |

---

## 6. Estado da Instância wpp2

| Métrica | Valor |
|---------|-------|
| Status | ✅ **open** |
| Número | 551146375517 |
| Perfil | Promo Brindes |
| Conexão | WhatsApp Baileys |
| Mensagens totais | 89.894 |
| Contatos | 3.527 |
| Criada em | 09/07/2026 |
| alwaysOnline | ✅ true |
| readMessages | ✅ true |
| rejectCall | ✅ true |
| groupsIgnore | ✅ false (participa de grupos) |
| syncFullHistory | ❌ false |

---

## Resumo das Recomendações

### Alta Prioridade
1. 🔴 **Planejar upgrade para v2.4.x** — a v2.4.0 exige ativação de licença (breaking change). A versão atual 2.3.7 continuará funcionando, mas eventualmente pode ser necessário migrar. Testar em staging antes.

### Média Prioridade
2. 🟡 **Definir CORS_ORIGIN explicitamente** — em vez de `*`, configurar para `https://evolution.atomicabr.com.br` para evitar potenciais abusos.
3. 🟡 **Remover env vars órfãs** — `OPENAI_ENABLED=true`, `DIFY_ENABLED=true`, `TYPEBOT_ENABLED=true` estão ativas mas sem uso. Ou configurar as integrações ou desativar.
4. 🟡 **Validar logpatch.cjs após upgrades** — os patches T1/T2/T3/T4/T5 no entrypoint modificam o bundle compilado. Garantir que continuem funcionando ao trocar a imagem.

### Baixa Prioridade
5. 🔵 **LOG_BAILEYS=error** (em vez de `warn`) reduziria ainda mais o volume de logs.
6. 🔵 **syncFullHistory** — se necessário, ativar para importar histórico completo do WhatsApp.
7. 🔵 **Adicionar N8N integration na instância** se o n8n for realmente usado (env var está true mas sem sessão).
8. 🔵 **Adicionar tag de versão na imagem** — usar tag semver (`v2.3.7`) em vez de apenas SHA256 facilitaria auditoria visual no Portainer.

---

*A auditoria foi realizada usando Portainer MCP (stack evolution, serviço evolution_evolution) e Evolution API MCP (instância wpp2). Documentação oficial consultada em docs.evolutionfoundation.com.br.*
