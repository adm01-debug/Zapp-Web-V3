# Fronteira de Credenciais — ZAPP × Evolution API

**Versão:** 1.0  
**Data:** 2026-08-15  
**Tipo:** Documento de Controle de Segurança

---

## Princípio Fundamental

> As credenciais de cada sistema devem ser **privadas e exclusivas** ao sistema que as detém.
> Nenhum sistema deve deter credenciais do outro.

---

## Mapa de Credenciais

### Evolution API (proprietário: `adm01-debug/evolution-stack`)

| Credencial | Onde Fica | Quem Acessa | Método de Acesso Permitido |
|-----------|-----------|-------------|---------------------------|
| `EVOLUTION_API_URL` | Vault Supabase (self-hosted) | Somente `ops.fn_evo_url()` | Via função PL/pgSQL de leitura do vault |
| `EVOLUTION_API_KEY` | Vault Supabase (self-hosted) | Somente `ops.fn_evo_key()` | Via função PL/pgSQL de leitura do vault |
| Docker secrets (evolution-stack) | VPS `/opt/evolution-stack/.env` | Docker compose da Evolution | Nunca exposta ao ZAPP web |
| PostgreSQL credentials da Evolution | VPS (pg14 interno) | Container PostgreSQL evolution | Nunca exposta ao ZAPP web |

### ZAPP web v3 (proprietário: `adm01-debug/zapp-web-v3`)

| Credencial | Onde Fica | Quem Acessa | Método de Acesso Permitido |
|-----------|-----------|-------------|---------------------------|
| `SUPABASE_SERVICE_ROLE_KEY` | Edge Functions Deno env | Edge Functions do ZAPP | `createZappAdminClient()` |
| `SUPABASE_ANON_KEY` | Frontend env (`VITE_SUPABASE_ANON_KEY`) | Cliente React | `createClient()` no frontend |
| `SUPABASE_URL` | Frontend env + Edge Functions | Ambos | Via env vars de build/runtime |
| JWT secrets Supabase | Supabase self-hosted internal | Supabase auth internamente | Nunca exposto externamente |
| `VITE_SUPABASE_ANON_KEY` | `.env` do frontend | Build Vite | Público (anon key pode ser exposta) |

---

## Regras de Acesso Cross-Sistema

### ZAPP → Evolution (permitido via gateway)

```
ZAPP edge function
  ↓ chama
ops.fn_evo_url() → lê vault.decrypted_secrets['evolution_api_url']
ops.fn_evo_key() → lê vault.decrypted_secrets['evolution_api_key']
  ↓ monta
supabase/functions/_shared/providers/evolution/client.ts
  ↓ faz
HTTP request para Evolution API
```

**Proibido:**
- `EVOLUTION_API_URL` diretamente em qualquer arquivo TypeScript/Edge Function
- `EVOLUTION_API_KEY` diretamente em qualquer arquivo TypeScript/Edge Function
- `Deno.env.get('EVOLUTION_API_URL')` em qualquer edge function (exceto `connection-health-check`)
- `process.env.EVOLUTION_API_URL` em qualquer código frontend

### Evolution → ZAPP (permitido via webhook)

```
Evolution API
  ↓ POST
Webhook endpoint do ZAPP (edge function `evolution-webhook`)
  ↓ processa
Tabelas do schema `evo` (via acesso direto ao Supabase compartilhado)
```

**Proibido:**
- Evolution API deter `SUPABASE_SERVICE_ROLE_KEY` do ZAPP
- Evolution API fazer queries diretas ao schema `zapp`
- Evolution API chamar edge functions privadas do ZAPP

---

## Vault Supabase — Secrets Cadastrados

Os seguintes secrets **devem** existir em `vault.secrets` do Supabase self-hosted:

| Secret Name | Proprietário | Acesso via |
|-------------|-------------|-----------|
| `evolution_api_url` | Evolution API | `ops.fn_evo_url()` |
| `evolution_api_key` | Evolution API | `ops.fn_evo_key()` |

### Verificação de Existência

```sql
-- Verificar se os secrets de evolution existem no vault
SELECT name, created_at, updated_at
FROM vault.secrets
WHERE name IN ('evolution_api_url', 'evolution_api_key');
```

**Saída esperada:** 2 linhas com timestamps.

### Validação das Funções Acessoras

```sql
-- Testar fn_evo_url
SELECT ops.fn_evo_url();
-- Deve retornar a URL sem expor o secret diretamente

-- Testar fn_evo_key
SELECT ops.fn_evo_key();
-- Deve retornar a API key sem expor o secret diretamente
```

---

## Superfície de Exposição: Análise de Risco

### Risco CRÍTICO (ação imediata necessária)

| Risco | Descrição | Status T0 | Plano |
|-------|-----------|-----------|-------|
| I4 bypass cron | 5 cron jobs invocam `net.http_*` diretamente com URL evolution | ❌ ATIVO | Rota via gateway (E13+) |
| I4 bypass pg_net | 16 funções SQL acessam evolution via pg_net sem gateway | ❌ ATIVO | Refatorar funções (E25+) |

### Risco ALTO (planejar correção)

| Risco | Descrição | Status T0 | Plano |
|-------|-----------|-----------|-------|
| I9 FKs cascade | FKs evo→zapp com CASCADE DELETE propagam deleções cross-schema | ❌ ATIVO | Migração E40+ |
| I1/I2 refs SQL | Funções SQL com acoplamento cross-schema (dados + lógica) | ❌ ATIVO | Refatoração E30+ |

### Risco BAIXO (monitorar)

| Risco | Descrição | Status T0 | Plano |
|-------|-----------|-----------|-------|
| I3 e2e workflow | Workflow de E2E acessa Evolution diretamente no CI | ⚠️ PRESENTE | Avaliar se é legítimo ou deve ser movido |
| I8 sql-gate gap | 13 funções evolution sem mapeamento no fixture | ⚠️ PRESENTE | Regenerar fixture (E20) |

---

## Procedimento de Rotação de Credenciais

### Rotação da Evolution API Key

1. **No evolution-stack:** Gerar nova API key no painel Evolution
2. **No Supabase vault:** `UPDATE vault.secrets SET secret = '...' WHERE name = 'evolution_api_key'`
3. **Verificar:** `SELECT ops.fn_evo_key()` deve retornar a nova key
4. **Teste de smoke:** Fazer uma chamada test via gateway
5. **Nenhuma mudança** necessária no código do ZAPP web (isolamento garantido)

### Rotação da Evolution API URL

1. **No Supabase vault:** `UPDATE vault.secrets SET secret = '...' WHERE name = 'evolution_api_url'`
2. **Verificar:** `SELECT ops.fn_evo_url()` deve retornar a nova URL
3. **Teste de smoke:** Verificar que edge functions ainda funcionam

**Vantagem do isolamento:** A rotação de credenciais da Evolution não exige deploy
de nenhum código ZAPP. Apenas um UPDATE no vault.

---

## Auditoria de Uso de Credenciais

### CI Check (decouple-guard.yml)

O CI já verifica:
```yaml
# decouple-guard.yml verifica:
- inventory.mjs: backendUrlBypass=0 (nenhuma edge fn lê EVOLUTION_API_URL diretamente)
- sql-gate: zero funções PL/pgSQL com egresso evolution sem usar ops.fn_evo_url/fn_evo_key
```

### Verificação Manual

```bash
# Verificar edge functions por acesso direto a credenciais evolution
grep -r 'EVOLUTION_API_URL\|EVOLUTION_API_KEY' supabase/functions/ \
  --include='*.ts' \
  --exclude-dir='connection-health-check' \
  --exclude-dir='_archive'
# Saída esperada: vazia (0 resultados)

# Verificar frontend
grep -r 'EVOLUTION_API_URL\|EVOLUTION_API_KEY' src/ \
  --include='*.ts' --include='*.tsx'
# Saída esperada: vazia (0 resultados, VITE_EVOLUTION_API_URL contado por inventory.mjs)
```

---

## Referências

- ADR-009: Gateway Pattern
- ADR-010: SQL Gateway
- ADR-011: Egress Gateway
- ADR-012: T0 Measurement
- `scripts/decouple/sql-gate.mjs`: Gate de egresso SQL
- `scripts/decouple/inventory.mjs`: Inventário de acoplamento frontend
- `supabase/functions/_shared/providers/evolution/client.ts`: Gateway HTTP único
