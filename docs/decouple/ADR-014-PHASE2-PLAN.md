# ADR-014 — Plano da Fase 2: Correções Críticas de Egresso HTTP

> **Status**: DRAFT · Criado em: 2026-08-15 · Autores: Time de Engenharia ZAPP
> **Fase**: 2 de 8 do Plano de Desacoplamento ZAPP×Evolution
> **Etapas**: E25–E40 (16 etapas)
> **Score alvo**: 6/9 (67%) — Nota C
> **Referência mestre**: [`docs/decouple/DECOUPLING.md`](./DECOUPLING.md)

---

## Contexto

A Fase 1 (E13–E24) estabeleceu a fundação documental e corrigiu apenas o invariante I8
(sql-gate fixture sincronizado). O score T1 medido é **4/9 (44%) — Nota D**, com as
seguintes violações ainda abertas:

| Invariante | Status T1 | Violações |
|-----------|-----------|-----------|
| I1 | 🔴 FAIL | 20 funções `zapp.*` com 82 refs a `evo.*` |
| I2 | 🔴 FAIL | 96 funções `evo.*` com refs a `zapp.*` |
| I3 | 🔴 FAIL | `.github/workflows/e2e-evolution-vps.yml` presente |
| I4 | 🔴 FAIL | 16 chamadas pg_net diretas em 15 funções de aplicação |
| I9 | 🔴 FAIL | 24 FKs cross-schema (6 grupos, todos `evo→zapp`) |

A Fase 2 não aborda I1/I2 (96 + 20 funções — volume alto, reservado para Fase 3) nem I9
(requer migração de dados com rollback planejado — Fase 3). O foco é **eliminar violações
de menor volume e alto impacto de runtime**: I3 (1 workflow) e I4 (15 funções pg_net).

### Baseline das violações I4 (do `docs/decouple/baseline/20260815/pg_net_functions.json`)

**Schema `evo` — 5 funções violadoras:**

| Função | Método pg_net |
|--------|--------------|
| `evo.fn_detect_instance_recreate` | `net.http_post` |
| `evo.fn_download_wa_status_media` | `net.http_post` |
| `evo.fn_notify_sicoob_on_reply` | `net.http_post` |
| `evo.fn_sync_lid_from_api` | `net.http_get` |
| `evo.fn_trigger_audio_transcription` | `net.http_post` |

**Schema `zapp` — 10 funções violadoras:**

| Função | Método pg_net |
|--------|--------------|
| `zapp.fn_check_license_heartbeat` | `net.http_get` |
| `zapp.fn_collect_restore_logs` | `net.http_get` |
| `zapp.fn_cookie_probe_dispatch` | `net.http_post` |
| `zapp.fn_cookie_real_probe` | `net.http_post` |
| `zapp.fn_escalate_critical_alerts` | `net.http_post` |
| `zapp.fn_outbound_dispatch` | `net.http_post` |
| `zapp.fn_reconcile_dispatch` | `net.http_get` |
| `zapp.fn_send_bitrix_alert` | `net.http_post` |
| `zapp.fn_validate_whatsapp_connection_url` | `net.http_get` |
| `zapp.notify_sicoob_on_reply` | `net.http_post` |

> Nota: `extensions.grant_pg_net_access` e `extensions.http_post` são linhas de infra
> pg_net (aceitas como exceção). Não constam no plano de correção.

---

## Decisão

Executar as etapas E25–E40 na seguinte ordem, priorizando I3 (remoção simples) seguido
de I4 na sequência `evo.*` → `zapp.*` (schemas da Evolution primeiro, depois ZAPP).

---

### E25 — Remover `.github/workflows/e2e-evolution-vps.yml` (I3)

**Entrega**: Arquivo `.github/workflows/e2e-evolution-vps.yml` removido do repositório.

**Rationale**: Este workflow conecta diretamente à VPS da Evolution API para E2E tests,
violando o invariante I3 (nenhum workflow de infra Evolution no repo ZAPP). O decouple-guard.yml
é o workflow legítimo de CI para o desacoplamento; o e2e-evolution-vps.yml é acoplamento
de teste que não pertence a este repo após a separação cirúrgica de 2026-08-12/13.

**Impacto em score**: I3 muda de FAIL → PASS. **Score: 4/9 → 5/9.**

**Critério de aceite**:
- Arquivo ausente em `.github/workflows/`
- CI green (decouple-guard.yml sem regressões)
- `boundary-audit.mjs` reporta I3 = PASS

---

### E26 — Corrigir `evo.fn_detect_instance_recreate` (I4 — prioridade crítica)

**Entrega**: Função `evo.fn_detect_instance_recreate` refatorada para usar o gateway
`ops.fn_evo_url_v2()` / `ops.fn_evo_key_v2()` em vez de `net.http_post` direto.

**Rationale**: Esta função detecta quando uma instância WhatsApp foi recriada e notifica
o ZAPP via pg_net direto. É crítica porque dispara via cron e trigger — erros aqui
impactam diretamente a reconexão de instâncias.

**Padrão de refatoração**:
```sql
-- ANTES (bypass):
SELECT net.http_post(url := 'https://evolution.atomicabr.com.br/...', ...);

-- DEPOIS (via gateway):
SELECT net.http_post(
  url := ops.fn_evo_url_v2() || '/endpoint',
  headers := jsonb_build_object('apikey', ops.fn_evo_key_v2()),
  ...
);
```

**Critério de aceite**:
- Nenhuma string hardcoded de URL Evolution na função
- `pg_proc` não retorna esta função na query de auditoria I4
- Testes de integração de reconexão passam

---

### E27 — Corrigir `evo.fn_download_wa_status_media` (I4)

**Entrega**: Função `evo.fn_download_wa_status_media` refatorada para usar
`ops.fn_evo_url_v2()` em vez de `net.http_post` direto.

**Rationale**: Faz download de mídia de status WhatsApp via HTTP direto. O destino
pode mudar se o provider Evolution for trocado — o gateway garante portabilidade.

**Critério de aceite**: Função auditada limpa em `pg_net_functions.json` T2.

---

### E28 — Corrigir `evo.fn_notify_sicoob_on_reply` (I4)

**Entrega**: Função `evo.fn_notify_sicoob_on_reply` no schema `evo` refatorada.

**Rationale**: Notifica sistema Sicoob via HTTP direto. Atenção: existe função homônima
`zapp.notify_sicoob_on_reply` (schema diferente) — são funções distintas, devem ser
tratadas em etapas separadas (esta etapa = schema `evo`).

**Critério de aceite**: Schema `evo` sem referências a `net.http_post` hardcoded nesta função.

---

### E29 — Corrigir `evo.fn_sync_lid_from_api` (I4)

**Entrega**: Função `evo.fn_sync_lid_from_api` refatorada. Aparece 2 vezes no baseline
(usa `net.http_get` em dois pontos distintos da implementação).

**Rationale**: Sincroniza LID (identificador de link de contato) via API Evolution.
Função de alto volume — chamada frequentemente por triggers de mensagens.

**Critério de aceite**: Zero ocorrências de `net.http_get` hardcoded na função;
ambas as ocorrências do baseline resolvidas.

---

### E30 — Corrigir `evo.fn_trigger_audio_transcription` (I4)

**Entrega**: Função `evo.fn_trigger_audio_transcription` refatorada.

**Rationale**: Aciona transcrição de áudio via HTTP externo. Altamente sensível
a mudanças de endpoint — o gateway garante single point of configuration.

**Critério de aceite**: Função limpa no schema `evo`; zero instâncias `net.http_post`
direto após refatoração.

> **Marco intermediário**: Após E30, todas as 5 funções `evo.*` foram corrigidas.
> O invariante I4 permanece FAIL até E38 (restam 10 funções `zapp.*`).

---

### E31 — Corrigir `zapp.fn_check_license_heartbeat` (I4)

**Entrega**: Função `zapp.fn_check_license_heartbeat` refatorada.

**Rationale**: Heartbeat de validação de licença via `net.http_get`. Esta função
é chamada periodicamente por cron — URL hardcoded cria dependência frágil.

**Critério de aceite**: Função usa configuração via `ops.*` ou variável de ambiente;
sem `net.http_get` hardcoded.

---

### E32 — Corrigir `zapp.fn_collect_restore_logs` (I4)

**Entrega**: Função `zapp.fn_collect_restore_logs` refatorada.

**Rationale**: Coleta logs de restore via HTTP GET. Pode apontar para endpoint
externo de monitoring — configuração deve passar por ops.* para mutabilidade.

**Critério de aceite**: Zero `net.http_get` direto na função.

---

### E33 — Corrigir `zapp.fn_cookie_probe_dispatch` e `zapp.fn_cookie_real_probe` (I4)

**Entrega**: Ambas as funções refatoradas em uma única migration (padrão similar).

**Rationale**: Par de funções de probe de cookie — dispatch enfileira, real_probe
executa. Têm estrutura idêntica de egresso HTTP e podem ser corrigidas juntas.

**Critério de aceite**: Ambas limpas no baseline I4; total de violações `zapp.*`
cai de 10 para 8.

---

### E34 — Corrigir `zapp.fn_escalate_critical_alerts` (I4)

**Entrega**: Função `zapp.fn_escalate_critical_alerts` refatorada.

**Rationale**: Escalada de alertas críticos via HTTP — potencialmente webhook de
Slack/PagerDuty. Alta criticidade operacional; refatoração deve manter
comportamento exato, apenas roteando pelo gateway.

**Critério de aceite**: Função refatorada com zero impacto em alertas de prod;
testes de integração de alertas passam.

---

### E35 — Corrigir `zapp.fn_outbound_dispatch` (I4)

**Entrega**: Função `zapp.fn_outbound_dispatch` refatorada.

**Rationale**: Função central de dispatch outbound — possível alto tráfego.
Refatoração deve ser feita com cuidado: verificar se a função está em uso ativo
em crons ou triggers antes de alterar.

**Critério de aceite**: Função refatorada; smoke test de mensagem outbound passa.

---

### E36 — Corrigir `zapp.fn_reconcile_dispatch` (I4)

**Entrega**: Função `zapp.fn_reconcile_dispatch` refatorada.

**Rationale**: Dispatch de reconciliação via `net.http_get`. Parte do loop de
reconciliação de mensagens — crítica para consistência de entrega.

**Critério de aceite**: Função limpa; sem regressão no fluxo de reconciliação.

---

### E37 — Corrigir `zapp.fn_send_bitrix_alert` e `zapp.fn_validate_whatsapp_connection_url` (I4)

**Entrega**: Ambas as funções refatoradas em uma migration.

**Rationale**:
- `fn_send_bitrix_alert`: integração com CRM Bitrix24 via HTTP POST
- `fn_validate_whatsapp_connection_url`: valida URL da conexão WhatsApp via HTTP GET

Funções independentes agrupadas por conveniência de etapa.

**Critério de aceite**: Ambas limpas; total `zapp.*` cai de 4 para 2.

---

### E38 — Corrigir `zapp.notify_sicoob_on_reply` (I4 — última função)

**Entrega**: Função `zapp.notify_sicoob_on_reply` (schema `zapp`, sem prefixo `fn_`)
refatorada.

**Rationale**: Homônima de `evo.fn_notify_sicoob_on_reply` (já corrigida em E28),
mas no schema `zapp`. Última violação I4 do baseline.

**Nota**: Esta função usa o nome sem o prefixo `fn_` — atenção ao procurar em
migrations e referências de código.

**Critério de aceite**: Zero funções `zapp.*` com `net.http_post` hardcoded;
baseline I4 de `zapp.*` = 0 violações.

> **Marco**: Após E38, todas as 15 funções de aplicação I4 foram corrigidas
> (5 `evo.*` + 10 `zapp.*`).

---

### E39 — Validar I4 = PASS e documentar

**Entrega**:
1. Execução de `boundary-audit.mjs` contra DB de prod confirma I4 = PASS
2. Registro `ops.i4_correction_log` (ou insert em `ops.pgnet_egress_log`) documentando
   todas as 15 correções com hash de migration e timestamp
3. Atualização de `docs/decouple/DECOUPLING.md` com I4 = PASS no score T2
4. Arquivo `docs/decouple/baseline/20260815/pg_net_functions.json` marcado como
   `"status": "resolved_in_phase2"` com referência às etapas E26–E38

**Critério de aceite**:
- `SELECT COUNT(*) FROM pg_proc JOIN pg_namespace ON pronamespace=oid WHERE nspname IN ('zapp','evo') AND (prosrc ILIKE '%net.http_post%' OR prosrc ILIKE '%net.http_get%')` retorna 0 funções de aplicação
- I4 muda de FAIL → PASS
- **Score: 5/9 → 6/9**

---

### E40 — Medir T2 e documentar score

**Entrega**:
1. Execução completa de `boundary-audit.mjs` contra DB de prod
2. Arquivo `docs/decouple/BOUNDARY_SCORE_T2.json` gerado
3. Atualização do `docs/decouple/DECOUPLING.md` com score T2
4. Tag git `decouple-t2-20260815` (ou data real da conclusão)
5. Entrada no histórico de `docs/CHANGELOG_SESSIONS.md`

**Score T2 esperado: 6/9 (67%) — Nota C**

```
Passou  (6): I3, I4, I5, I6, I7, I8
Falhou  (3): I1 (20 funções zapp→evo), I2 (96 funções evo→zapp), I9 (24 FKs)
```

**Critério de aceite**:
- Score T2 ≥ 6/9
- Zero regressões nos invariantes I5, I6, I7, I8 (que já estavam PASS)
- I3 e I4 confirmados PASS pelo boundary-audit

---

## Critérios de Aceite da Fase 2 (global)

- [ ] E25: `.github/workflows/e2e-evolution-vps.yml` removido — I3 = PASS
- [ ] E26–E30: 5 funções `evo.*` sem `net.http_*` hardcoded — baseline `evo.*` limpo
- [ ] E31–E38: 10 funções `zapp.*` sem `net.http_*` hardcoded — baseline `zapp.*` limpo
- [ ] E39: I4 = PASS confirmado por `boundary-audit.mjs` em prod
- [ ] E40: Score T2 ≥ 6/9 documentado em `BOUNDARY_SCORE_T2.json`
- [ ] Zero regressões: I5, I6, I7, I8 permanecem PASS
- [ ] CI de medição de invariantes (E23) atualiza score em todo PR

---

## Alternativas Consideradas

### Alternativa A: Corrigir I1/I2 antes de I4

**Rejeitada**: I1/I2 somam 116 funções com referências cross-schema. Volume excessivo
para uma única fase. Cada função requer análise individual de dependência para substituir
refs diretas por views de contrato (risco de quebra silenciosa). I4 tem apenas 15 funções,
padrão de correção uniforme (substituir URL hardcoded por ops.fn_evo_url_v2()) e impacto
de runtime maior (egresso HTTP é mais frágil que referência SQL).

### Alternativa B: Corrigir cron jobs cross-schema da lista I4

**Descartada para Fase 2**: Os 5 cron jobs com HTTP direto (jobids 261, 427, 476, 477, 478
— violação `I4_net_http` e `I4_extensions_http`) têm padrão diferente das funções pg_net.
São queries SQL inline nos schedules do pg_cron, não funções PL/pgSQL refatoráveis. Requerem
análise de dependência de agendamento e possível migração para edge functions. Reservados
para Fase 3 (E37–E52 do plano mestre).

### Alternativa C: Remover FKs cross-schema I9 na Fase 2

**Rejeitada**: As 24 FKs (6 grupos, todos `evo→zapp`) incluem `CASCADE DELETE` em
`media_download_queue` — remoção sem migração de dados pode causar perda de registros.
Requer plano de rollback detalhado e janela de manutenção. Reservado para Fase 3.

### Alternativa D: Não corrigir I3 (manter workflow E2E)

**Rejeitada**: O workflow `e2e-evolution-vps.yml` representa acoplamento de teste com
a infraestrutura Evolution. Após a separação dos repos, testes E2E da Evolution pertencem
ao repo `evolution-stack`. Remoção é simples, sem impacto funcional no ZAPP, e entrega
ganho de score imediato (FAIL → PASS).

---

## Sequência de Etapas e Impacto de Score

```
T1 (início Fase 2): 4/9 — I5 ✅ I6 ✅ I7 ✅ I8 ✅
         │
    E25  │  Remove e2e-evolution-vps.yml → I3 PASS
         ▼
       5/9  —  I3 ✅ I5 ✅ I6 ✅ I7 ✅ I8 ✅
         │
  E26-E30 │  Corrigem 5 funções evo.* I4 (baseline evo.* → 0)
         │
  E31-E38 │  Corrigem 10 funções zapp.* I4 (baseline zapp.* → 0)
         │
    E39  │  Valida I4 = PASS (15/15 funções corrigidas)
         ▼
       6/9  —  I3 ✅ I4 ✅ I5 ✅ I6 ✅ I7 ✅ I8 ✅
         │
    E40  │  Mede T2, gera BOUNDARY_SCORE_T2.json, tag git
         ▼
       T2: 6/9 (67%) — Nota C
```

---

## Consequências

### Positivas
- I4 corrigido elimina o risco de downtime por mudança de URL/key da Evolution API
  (qualquer mudança de credencial agora requer atualização em único lugar: `ops.*`)
- I3 corrigido encerra acoplamento de CI entre os dois repos
- Score sobe de 44% (D) para 67% (C) — melhora objetiva mensurável
- Padrão de refatoração I4 documentado serve de template para Fase 3

### Negativas / Trade-offs
- I1/I2 continuam com 116 funções cross-schema (Fase 3)
- I9 continua com 24 FKs (Fase 3) — risco de `CASCADE DELETE` permanece
- Custo de refatoração de 15 funções pode introduzir bugs sutis se URLs ou
  headers diferem entre funções; cada migration deve ter teste de smoke

---

## Referências

- [DECOUPLING.md](./DECOUPLING.md) — Plano mestre (E25–E36 originais mapeados)
- [ADR-012-T0-MEASUREMENT.md](./ADR-012-T0-MEASUREMENT.md) — Medição formal T0
- [ADR-013-PHASE1-PLAN.md](./ADR-013-PHASE1-PLAN.md) — Plano da Fase 1 (E13–E24)
- [BOUNDARY_SCORE_T0.json](./BOUNDARY_SCORE_T0.json) — Baseline JSON T0
- [baseline/20260815/pg_net_functions.json](./baseline/20260815/pg_net_functions.json) — Lista completa violações I4
- [baseline/20260815/cron_jobs.json](./baseline/20260815/cron_jobs.json) — Cron jobs e violações HTTP
