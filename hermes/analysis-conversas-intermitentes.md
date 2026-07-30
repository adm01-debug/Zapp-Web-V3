# Análise: Conversas Carregam às Vezes e às Vezes Não

## Resumo Executivo

**SELECT queries (carregar conversas)** e **mutations (enviar/restart)** usam **edge functions DIFERENTES**. A falha 401 no `evolution-api` NÃO impede o carregamento de conversas — ele usa `external-db-proxy`. O comportamento intermitente é causado por **3 circuit breakers independentes + cache do react-query + cache cross-tab dedupe** que mascaram falhas temporárias.

---

## Arquitetura: 3 Caminhos Completamente Separados

### CAMINHO A — SELECT (Carregar Sidebar + Mensagens) ✅
```
useExternalConversations / useExternalMessages
  → evolutionFetchers.fetchRecentMessagesWindow()
    → queryExternalProxy()                   ← lib/externalProxy.ts
      → invokeViaFetch('external-db-proxy')  ← Edge Function DIFERENTE
        → Supabase PostgREST (evo.evolution_messages)
```
- **Não depende da Evolution API key**
- Usa conexão PostgREST direta ao banco externo
- **Se este caminho falha, o ChatPanel some** — `legacyConversation` fica null

### CAMINHO B — MUTATION (Envio, Restart, Status) ❌ (401)
```
useEvolutionApi().callApi()
  → supabase.functions.invoke('evolution-api/${action}')
    → Edge Function evolution-api/index.ts    ← usa EVOLUTION_API_KEY
      → proxyToEvolution(evolutionApiUrl, evolutionApiKey, ...)
        → fetch('https://evolution.atomicabr.com.br/...')
```
- **Depende da EVOLUTION_API_KEY** nas env vars da Edge Function
- Retorna 401 se a API key estiver inválida/expirada

### CAMINHO C — Auto-Reconnect (Polling 30s) ❌ (401)
```
useEvolutionAutoReconnect('wpp2')
  → checkStatus() a cada 30s
    → getInstanceStatus() → CAMINHO B
  → attemptSpecificReconnect()
    → connectInstance()/restartInstance() → CAMINHO B
```

---

## Os 4 Circuit Breakers

### 1. `external-db-proxy` circuit breaker (`externalProxyBreaker.ts`)
| Parâmetro | Valor |
|---|---|
| Threshold | 4 falhas consecutivas |
| Cooldown | 5 segundos (auto-recupera) |
| Auth lock (401/403) | 60 segundos |
| Retry | 3 tentativas com backoff exponencial |
| **Reset automático** | ✅ Sim — após cooldown |

### 2. `evolutionClient` circuit breaker (`evolutionClient.ts`)
| Parâmetro | Valor |
|---|---|
| Threshold | 3 falhas 401/403 consecutivas |
| Cooldown | 30 MINUTOS |
| **Reset automático** | ✅ Sim — após cooldown |

### 3. `useEvolutionAutoReconnect` — Credential guard (permanente)
| Parâmetro | Valor |
|---|---|
| Trigger | 1 único 401/403 no `checkStatus()` |
| **Duração** | **PERMANENTE** (até refresh da página) |
| Reset | Só reload da página |

### 4. `useEvolutionAutoReconnect` — Transient circuit (exponencial)
| Parâmetro | Valor |
|---|---|
| Threshold | 3 falhas consecutivas (5xx/network) |
| Base backoff | 2 minutos |
| Max backoff | 10 minutos |
| **Reset automático** | ✅ Sim — sucesso zera o contador |

---

## Por Que as Conversas Às Vezes Funcionam (Camada de Cache)

### React-Query (`useExternalConversations`)
- **`staleTime`**: `POLL_INTERVAL - 1000` ≈ **14 segundos**
- **`refetchInterval`**: `POLL_INTERVAL` = **15 segundos**
- `refetchOnWindowFocus: false`
- `refetchOnReconnect: false`
- ⚠️ **Efeito**: Se o fetch falha, o react-query SERVE DADO OBSOLETO por até 14s. O usuário vê conversas (velhas) e não percebe a falha.

### Cross-Tab Dedupe (`crossTabDedupe.ts`)
- **`resultTtl`**: `POLL_INTERVAL - 500` ≈ **14.5 segundos** (sidebar)
- **`lockTtl`**: 8 segundos
- Cache em localStorage + IndexedDB
- ⚠️ **Efeito**: Outra aba pode ter feito o fetch com sucesso e compartilhado via BroadcastChannel. O resultado fica em cache mesmo se a aba atual falhou.

### External Proxy Circuit Breaker (`externalProxyBreaker.ts`)
- Após 4 falhas consecutivas → abre por **5 segundos**
- Depois de 5s → fecha automaticamente → nova tentativa no próximo poll (15s)
- ⚠️ **Efeito**: Cria janelas de ~5s onde SELECTs falham, mas o usuário raramente percebe por causa do cache do react-query.

---

## Diagnóstico: Cenários de Intermitência

### Cenário 1: API Key da Evolution inválida (MAIS PROVÁVEL)
```
evolution-api edge function → 401 em TODAS mutations
external-db-proxy edge function → ✅ funciona (não usa mesma key)
```
- **Conversas CARREGAM** ✅ (caminho A funciona)
- **Envio de mensagens FALHA** ❌ (caminho B falha)
- **Auto-reconnect PÁRA** ❌ (caminho C trava permanentemente)
- ChatPanel aparece normalmente, mas não consegue enviar

### Cenário 2: JWT do Supabase expirou
```
Todos edge functions → 401 (gateway rejeita)
```
- **Conversas NÃO carregam** ❌
- **Mutations FALHAM** ❌
- ChatPanel mostra `InboxEmptyChat` (legacyConversation = null)
- Solução: refresh da página ou re-login

### Cenário 3: Falha transitória no `external-db-proxy` (rede/banco)
```
external-db-proxy → 5xx → circuit breaker abre por 5s → fecha
```
- **Conversas falham por 5s**, react-query serve cache velho
- Parece que "carregou" (cache) ou "não carregou" (pós-cache)
- **Mutations podem funcionar** (caminho B independente)

### Cenário 4: Múltiplas abas (cross-tab dedupe)
- Tab A faz SELECT com sucesso → salva em localStorage
- Tab B faz SELECT (falha) → **usa cache da Tab A**
- Parece que "funcionou" mesmo com falha

---

## Recomendações

### 1. Diagnosticar a raiz: validar EVOLUTION_API_KEY
```bash
# Testar diretamente a Evolution API
curl -H "apikey: $EVOLUTION_API_KEY" \
  https://evolution.atomicabr.com.br/instance/connectionState/wpp2
```
Verificar se a key nas env vars da edge function `evolution-api` está correta.

### 2. Aumentar visibilidade da falha
O `evolution-api` edge function retorna 401 silenciosamente — o `eventBus.emit('connection:credential-error')` não mostra toast pro usuário. Adicionar:
```typescript
eventBus.on('connection:credential-error', () => {
  toast.error('API da Evolution com problema — tente recarregar');
});
```

### 3. Melhorar feedback quando ChatPanel não aparece
Hoje `{inbox.legacyConversation ? <ChatPanel /> : <InboxEmptyChat />}` — quando `conversations=[]` por falha, o usuário vê tela vazia sem explicação. Mostrar um banner de erro: "Não foi possível carregar conversas — [tentar novamente]"

### 4. Reset do credential guard no auto-reconnect
O `credentialErrorRef.current = true` é permanente até refresh. Considerar expiração (ex.: 5 min) ou botão "Tentar novamente" que reseta.

### 5. Telemetria: diferenciar os 401s
Adicionar log distinto para 401 do Supabase Gateway (JWT inválido) vs 401 da Evolution API (key inválida) — ajuda debug rápido.
