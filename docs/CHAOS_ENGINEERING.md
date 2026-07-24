# Guide de Chaos Engineering - ZAPP WEB

## Visão Geral

Princípios de Chaos Engineering aplicados para aumentar a resiliência do ZAPP WEB.
Baseado no método científico: **Hipotetizar → Experimentar → Aprender → Melhorar**.

## Filosofia

```
"A melhor forma de evitar que um sistema falhe em produção
é fazer ele falhar em ambientes controlados."

— Chaos Engineering Manifesto
```

## Princípios Fundamentais

### 1. Construir Hipótese em Estado Estável

Defina o comportamento "normal" antes de testar:
- Latência P95: < 500ms
- Error rate: < 0.1%
- Webhook success: > 99%
- Realtime connections ativas: ~500

### 2. Variar Eventos do Mundo Real

Simule falhas realistas:
- Latência de rede
- Servidor indisponível
- Disco cheio
- Rate limiting
- Auth expirado

### 3. Executar em Produção

Staging não captura complexidade real. Use:
- Feature flags para limitar blast radius
- Horários de baixo tráfego (madrugada)
- Kill switches automáticos

### 4. Automatizar Experimentos

Continuous chaos via CI/CD:
- Testes diários de chaos
- Alertas automáticos em degradação
- Rollback automático em falha severa

### 5. Minimizar Blast Radius

Comece pequeno:
- 1% de tráfego → 5% → 10% → 50% → 100%
- Pode reverter em < 1 minuto
- Métricas claras para parar experimento

---

## Experimentos de Chaos

### EXP-01: Latência no Supabase

**Hipótese:** Sistema degrada gracefully quando Supabase tem latência de 2s.

**Setup:**
```yaml
# chaos-mesh ou toxiproxy
experiment:
  type: latency
  target: supabase.atomicabr.com.br
  duration: 5m
  latency:
    min: 500ms
    max: 2000ms
  schedule:
    start: "02:00"
    days: [tuesday]
```

**Métricas a observar:**
- P95 latência API
- Error rate
- User complaints (Sentry)
- Session duration (analytics)

**Critério de parada:**
- Error rate > 5% sustained
- Sentry critical alert
- User-reported outage

**Resultado esperado:**
- Loading states aparecem corretamente
- Retry strategies funcionam
- Circuit breakers ativam se necessário

---

### EXP-02: Edge Function Crash

**Hipótese:** Sistema continua funcional se 1 edge function crashar.

**Setup:**
```bash
# Matar edge function crítica
docker kill zapp-edge-functions
# Esperar 1 minuto
# Verificar comportamento
```

**Métricas:**
- Frontend continua funcionando?
- Dados cached ainda acessíveis?
- Mensagens em fila são perdidas?

**Resultado esperado:**
- Frontend mostra estados de "temporariamente indisponível"
- Mensagens entram em retry queue
- Nenhum dado é perdido (idempotency + DLQ)

---

### EXP-03: Evolution API Offline

**Hipótese:** Webhooks enfileiram corretamente quando Evolution está offline.

**Setup:**
```bash
# Bloquear Evolution API
iptables -A OUTPUT -d evolution.atomicabr.com.br -j DROP

# Esperar 10 minutos
# Verificar DLQ
docker exec zapp-postgres psql -U postgres zapp -c "
  SELECT COUNT(*) FROM zapp.dlq_events 
  WHERE created_at > NOW() - INTERVAL '10 minutes';
"
```

**Resultado esperado:**
- Webhooks retornam 503 com Retry-After
- Eventos vão para DLQ automaticamente
- Quando Evolution volta, DLQ é reprocessado

---

### EXP-04: Rate Limit Saturado

**Hipótese:** Sistema não quebra com tráfego 10x acima do normal.

**Setup:**
```bash
# Simular 10x tráfego
ab -n 100000 -c 1000 https://zapp.atomicabr.com.br/api/inbox
```

**Métricas:**
- Latência P99
- Rate limit responses (429)
- Database connection pool
- Memory usage

**Resultado esperado:**
- Rate limit responde 429 rapidamente
- Frontend mostra "tente novamente em X segundos"
- Sistema não crasha

---

### EXP-05: Database Connection Pool Exhausted

**Hipótese:** Bounded fetch (12s timeout) previne travamentos.

**Setup:**
```sql
-- Limitar conexões disponíveis
ALTER SYSTEM SET max_connections = 5;
SELECT pg_reload_conf();
```

**Resultado esperado:**
- Requests lentos retornam 12s timeout
- Mensagens de erro amigáveis
- Pool se recupera quando conexões voltam

---

### EXP-06: Disk Full

**Hipótese:** Sistema continua funcional em modo degradado com disco cheio.

**Setup:**
```bash
# Encher disco
dd if=/dev/zero of=/tmp/bigfile bs=1M count=100000
```

**Métricas:**
- Logs funcionam?
- Audit logs são escritos?
- Uploads falham gracefully?

**Resultado esperado:**
- Logs vão para stderr (sem gravação)
- Audit logs têm retry
- Uploads retornam erro claro

---

### EXP-07: Cache Invalidation

**Hipótese:** Cache invalida corretamente quando dados mudam.

**Setup:**
```bash
# Invalidar todo cache
docker exec zapp-postgres psql -U postgres zapp -c "
  DELETE FROM zapp.app_settings WHERE key LIKE 'cache_%';
"
```

**Resultado esperado:**
- Frontend recarrega dados
- Sem telas em branco
- Performance retorna ao normal

---

### EXP-08: Network Partition

**Hipótese:** Frontend lida com perda de conexão.

**Setup:**
```javascript
// DevTools → Network → Offline
// Navegar no app por 5 minutos
```

**Métricas:**
- Loading states aparecem?
- Mensagens offline enfileiram?
- Reconexão automática funciona?

**Resultado esperado:**
- Loading states visíveis
- Reconexão após voltar online
- Sem perda de dados

---

## Ferramentas de Chaos Engineering

### 1. Chaos Mesh (Kubernetes)

```yaml
apiVersion: chaos-mesh.org/v1alpha1
kind: NetworkChaos
metadata:
  name: network-delay
spec:
  action: delay
  mode: one
  selector:
    namespaces:
      - zapp
  delay:
    latency: "2s"
    jitter: "500ms"
  duration: "5m"
```

### 2. Toxiproxy

```bash
# Latency
toxiproxy-cli -h localhost:8474 toxic add \
  -t zapp-supabase -n latency -a latency=2000

# Bandwidth limit
toxiproxy-cli -h localhost:8474 toxic add \
  -t zapp-supabase -n bandwidth -a rate=100

# Connection drop
toxiproxy-cli -h localhost:8474 toxic add \
  -t zapp-supabase -n reset_peer -a timeout=0
```

### 3. AWS FIS / GCP Chaos Engineering

```yaml
# gcp-chaos
experiment:
  target: zapp-supabase
  actions:
    - type: network.partition
      duration: 5m
    - type: instance.reboot
      duration: 30s
```

### 4. Custom Scripts (Pequena Escala)

```typescript
// scripts/chaos-test.ts
// Injeta falhas em ambiente controlado

const CHAOS_SCENARIOS = {
  latency: (url: string, ms: number) => {
    // Adiciona latência artificial
    return new Promise(r => setTimeout(r, ms));
  },
  error: (rate: number) => {
    if (Math.random() < rate) {
      throw new Error('Chaos: simulated error');
    }
  },
  timeout: async (ms: number) => {
    await new Promise(r => setTimeout(r, ms));
    throw new Error('Chaos: timeout');
  },
};

// Em dev, substituir fetch por versão chaos
if (process.env.CHAOS_MODE === 'true') {
  globalThis.fetch = chaosFetch(globalThis.fetch);
}
```

---

## Métricas de Resiliência

### SLIs (Service Level Indicators)

| SLI | Target | Crítico |
|-----|--------|---------|
| **Availability** | 99.9% | 99.5% |
| **Latency P95** | < 500ms | < 2s |
| **Latency P99** | < 1s | < 5s |
| **Error Rate** | < 0.1% | < 1% |
| **MTTR** (Mean Time To Recovery) | < 30min | < 2h |
| **MTBF** (Mean Time Between Failures) | > 30 dias | > 7 dias |

### SLOs (Service Level Objectives)

```
Availability:    99.9% (43.2 min downtime/mês)
Latency P95:     500ms (95% das requests)
Error Budget:    0.1% (4.32 min de erros/mês)
```

### Error Budget Policy

```yaml
# Quando error budget é consumido:
- 50%: Alertas aumentados
- 75%: Rollouts pausados
- 90%: Rollback de mudanças recentes
- 100%: Feature freeze
```

---

## Game Days

### Estrutura

```
1. Briefing (15min)
   - Cenário
   - Hipótese
   - Critério de parada

2. Execução (45min)
   - Aplicar chaos
   - Observar métricas
   - Tomar notas

3. Debrief (30min)
   - O que funcionou
   - O que falhou
   - Action items

4. Follow-up (1 semana)
   - Implementar fixes
   - Validar com novo chaos test
```

### Próximo Game Day

**Data:** 2026-08-15 (3 semanas)
**Tema:** Evolution API offline + Webhook DLQ
**Participantes:** DevOps, Backend, Frontend Leads
**Local:** Sala de crise + Zoom

---

## Recuperação Automática (Self-Healing)

### Health Checks + Restart

```yaml
# docker-compose.yml
services:
  zapp-edge-functions:
    restart: always
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8000/health"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 30s
```

### Circuit Breakers

```typescript
// Já implementado em useEvolutionApiManagement
// Auto-reconnect com backoff exponencial
// Circuit breaker em 5xx sustained
```

### Auto-Scaling

```yaml
# Prometheus + KEDA
- name: cpu-scaler
  type: cpu
  metadata:
    type: Utilization
    value: "70"

- name: queue-scaler
  type: rabbitmq
  metadata:
    queueName: webhook-events
    mode: QueueLength
    value: "1000"
```

---

## Checklist de Chaos Engineering

### Antes do Experimento
- [ ] Hipótese clara definida
- [ ] Estado baseline medido
- [ ] Blast radius limitado
- [ ] Critério de parada definido
- [ ] Equipe notificada
- [ ] Rollback plan pronto
- [ ] Monitoramento ativo

### Durante o Experimento
- [ ] Métricas sendo observadas
- [ ] Comunicação em canal dedicado
- [ ] Logs sendo capturados
- [ ] Screenshots/vídeos gravados

### Após o Experimento
- [ ] Sistema restaurado ao baseline
- [ ] Métricas normalizadas
- [ ] Análise de impacto
- [ ] Lessons learned documentadas
- [ ] Action items criados
- [ ] Follow-up agendado

---

## Referências

- [Chaos Engineering Manifesto](https://principlesofchaos.org/)
- [Google SRE Book - Testing Reliability](https://sre.google/sre-book/testing-reliability/)
- [Netflix Chaos Monkey](https://netflix.github.io/chaosmonkey/)
- [AWS Fault Injection Simulator](https://aws.amazon.com/fis/)
- [Azure Chaos Studio](https://azure.microsoft.com/en-us/products/chaos-studio/)

---

**Última atualização:** 2026-07-24
**Próximo Game Day:** 2026-08-15
