# 🚀 Guia de Deploy — Zapp Web v3 em Produção

## Status Atual do Projeto

| Componente               | Status                                       |
| ------------------------ | -------------------------------------------- |
| Repositório clonado      | ✅ `zapp-web-v3/`                            |
| Git configurado          | ✅ `adm01 <adm01@debug.com>`                 |
| Dependências (Bun)       | ✅ 1149 pacotes                              |
| Build de produção        | ✅ `dist/` gerado (6416 módulos)             |
| Erros TypeScript         | ⚠️ 1507 (dívida técnica, não bloqueia build) |
| MCP Evolution            | ✅ Online (200)                              |
| MCP Portainer            | ✅ Online (acessível sem headers)            |
| MCP Supabase Cloud       | ✅ Online (401 = aguarda OAuth)              |
| MCP Supabase Self-hosted | ✅ Online (token na URL)                     |

---

## Arquitetura de Produção

```
                    ┌─────────────────────────────┐
                    │     VPS (atomicabr.com.br)   │
                    │                              │
  zapp.atomicabr ──▶│  Traefik (HTTPS/Let's Encrypt)│
                    │    │                         │
                    │    ▼                         │
                    │  Portainer (Docker Swarm)    │
                    │    │                         │
                    │    ▼                         │
                    │  zapp-web container          │
                    │  (nginx + dist/ estático)    │
                    │                              │
                    │  ┌──────────────────────┐    │
                    │  │ supabase.atomicabr   │◀───│ Evolution API
                    │  │ (self-hosted, BD     │    │ (evolution.atomicabr)
                    │  │  canônico)           │    │
                    │  └──────────────────────┘    │
                    └─────────────────────────────┘
```

---

## Passo a Passo do Deploy

### 1. Preencher `.env.production`

Edite [`zapp-web-v3/.env.production`](.env.production) com os valores reais:

```bash
# Valores OBRIGATÓRIOS:
VITE_SUPABASE_ANON_KEY=<anon key do supabase.atomicabr.com.br>
EVOLUTION_API_KEY=<api key do evolution.atomicabr.com.br>
SELFHOSTED_SUPABASE_MCP_TOKEN=<token do MCP self-hosted>
```

**Como obter a anon key:**

- Acesse o container do Supabase na VPS
- Leia o arquivo `.env` do compose do Supabase
- Procure por `ANON_KEY`

### 2. Build da Imagem Docker (na VPS)

```bash
# Na VPS, no diretório do projeto:
cd /workspace/repos/zapp-web-v3

# Copiar .env.production para .env
cp .env.production .env

# Build da imagem
docker compose build

# Ou build manual com args:
docker build \
  --build-arg VITE_SUPABASE_URL=https://supabase.atomicabr.com.br \
  --build-arg VITE_SUPABASE_ANON_KEY=SUA_ANON_KEY \
  -t zapp-web:latest .
```

### 3. Deploy via Portainer

1. Acesse o Portainer na VPS
2. Vá em **Stacks** → **Add stack**
3. Cole o conteúdo do [`docker-compose.yml`](docker-compose.yml)
4. Configure as variáveis de ambiente (ou use o `.env`)
5. Certifique-se de que a rede `atomicabr` existe:
   ```bash
   docker network create atomicabr 2>/dev/null || true
   ```
6. Clique em **Deploy the stack**

### 4. Verificar o Deploy

```bash
# Health check
curl https://zapp.atomicabr.com.br/healthz
# Esperado: ok

# Versão
curl https://zapp.atomicabr.com.br/version.json
```

### 5. Configurar MCPs no VS Code

Os MCPs já estão definidos em [`.mcp.json`](.mcp.json). Para conectá-los:

1. **Evolution MCP** — já acessível (200 ✅)
2. **Portainer MCP** — já acessível sem headers, conectar via VS Code MCP panel
3. **Supabase Cloud MCP** — requer OAuth (clique em "Authenticate")
4. **Supabase Self-hosted MCP** — já configurado com token na URL (sem header Bearer)

---

## Conectividade dos Serviços

| Serviço              | URL                                             | Status                   |
| -------------------- | ----------------------------------------------- | ------------------------ |
| App (produção)       | https://zapp.atomicabr.com.br                   | ⏳ Pendente deploy       |
| Supabase             | https://supabase.atomicabr.com.br               | ✅ Online                |
| Evolution API        | https://evolution.atomicabr.com.br              | ✅ Online                |
| Portainer MCP        | https://portainer-mcp.atomicabr.com.br/mcp      | ✅ Online                |
| Evolution MCP        | https://evolution-mcp.adm01.workers.dev/mcp     | ✅ Online                |
| Supabase MCP (cloud) | https://mcp.supabase.com/mcp                    | ✅ Online (OAuth)        |
| Supabase MCP (self)  | https://supabase-mcp.atomicabr.com.br/s-***/mcp | ✅ Online (token na URL) |
| GitHub MCP           | https://github-mcp-server.adm01.workers.dev/mcp | ✅ Online                |

---

## Rollback

```bash
# Voltar para imagem anterior no Portainer:
# Stacks → zapp-web → Editor → alterar ZAPP_WEB_IMAGE para tag anterior

# Ou via CLI:
docker service update --image zapp-web:PREVIOUS_TAG zapp-web
```

---

## Próximos Passos Recomendados

1. **Preencher `.env.production`** com credenciais reais
2. **Conectar MCPs** no VS Code (Portainer + Supabase + Evolution)
3. **Build + Deploy** via Portainer ou CLI na VPS
4. **Validar** healthz e funcionalidades principais
5. **Corrigir erros TypeScript** incrementalmente (1507 erros, não bloqueia produção)
