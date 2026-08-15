# E25 — Plano de Remoção do `e2e-evolution-vps.yml` (Invariante I3)

**Data:** 2026-08-15
**Etapa do plano:** E25 (FASE 2 — Soberania de plataforma)
**Invariante alvo:** I3 — `e2e-evolution-vps.yml` ausente deste repo
**Status atual:** FAIL
**Status esperado após execução:** PASS

---

## 1. Análise do Workflow

### 1.1 Metadados

| Atributo | Valor |
|----------|-------|
| Arquivo | `.github/workflows/e2e-evolution-vps.yml` |
| Trigger | `workflow_dispatch` (manual; **nunca** auto-disparo em push/PR) |
| Runner | `["self-hosted","vps-zapp","playwright"]` ou `ubuntu-latest` |
| Timeout | 45 minutos |
| Chamadas externas | `validate-e2e-user.yml` (reusable workflow) |

### 1.2 O que o workflow faz

O workflow executa um subconjunto de specs Playwright rotulados como "Evolution E2E" contra a VPS de produção (`https://zapp.atomicabr.com.br`). Mais precisamente:

1. **Valida o usuário E2E** via `validate-e2e-user.yml`, que chama a RPC `rpc_e2e_validate_user()` no Supabase.
2. **Instala Playwright** (`npx playwright install --with-deps chromium`).
3. **Roda 6 specs** em paralelo com `--config=playwright.e2e.config.ts`.
4. **Opcionalmente** inclui `voice-changer-integration.spec.ts` se `E2E_INCLUDE_VOICE=1`.
5. **Publica** relatório HTML, JSON e log em `playwright-evolution.log`.

### 1.3 Specs incluídas

| Spec | O que realmente testa | Evolution API real? |
|------|-----------------------|---------------------|
| `admin-evolution-api-smoke.spec.ts` | UI ZAPP Admin; queries `evolution_instance_credentials`, `evolution_retry_metrics`, `evolution_health_logs` via Supabase bridge | **Não** — usa views Supabase |
| `evolution-retry-failure.spec.ts` | Lógica de retry do frontend ZAPP | **Não** — `page.route('**/functions/v1/evolution-api/**', mock)` |
| `evolution-media-retry-failure.spec.ts` | Retry de mídia no frontend ZAPP | **Não** — mock via `page.route()` |
| `whatsapp-connection.spec.ts` | UI de conexão WA com QR codes fake | **Não** — mock via `page.route('**/functions/v1/evolution-api**', mock)` |
| `whatsapp-reactions-realtime.spec.ts` | Reações em tempo real entre dois contextos | **Não** — Realtime puro ZAPP |
| `whatsapp-reactions-advanced.spec.ts` | Reações avançadas; mock de `message_reactions` | **Não** — mock `**/rest/v1/message_reactions*` |

**Conclusão crítica:** Nenhum dos 6 specs faz chamadas reais à Evolution API. Todos testam **comportamento do frontend ZAPP** usando mocks Playwright. O nome "Evolution E2E" é enganoso — são testes ZAPP com mocks Evolution.

---

## 2. Dependências Identificadas

### 2.1 Cobertura de specs (impacto na remoção)

| Spec | Coberta por outro workflow? | Evidência |
|------|-----------------------------|-----------|
| `admin-evolution-api-smoke.spec.ts` | **Sim** | `e2e-admin-vps.yml` lista este spec explicitamente |
| `evolution-retry-failure.spec.ts` | Via nightly | `e2e-nightly-full.yml` roda `test:e2e:full` (todos os specs) |
| `evolution-media-retry-failure.spec.ts` | Via nightly | idem |
| `whatsapp-connection.spec.ts` | Via nightly | idem |
| `whatsapp-reactions-realtime.spec.ts` | Via nightly | idem |
| `whatsapp-reactions-advanced.spec.ts` | Via nightly | idem |

O script `scripts/check-e2e-spec-coverage.mjs` confirma: se `e2e-nightly-full.yml` existe e contém `test:e2e:full`, **zero specs ficam órfãos**. O check passará após a remoção do workflow.

### 2.2 Referências ao arquivo no repositório

| Local | Tipo | Impacto |
|-------|------|---------|
| `.github/workflows/measure-invariants.yml` | Verifica **ausência** do arquivo (I3) | Desejado — passa após remoção |
| `.github/workflows/decouple-guard.yml` | Não guarda contra `e2e-evolution*.yml` | Gap de segurança — deve ser corrigido |
| `scripts/run-e2e-evolution-vps.sh` | Script local equivalente ao workflow | Deve ser removido ou renomeado |
| `docs/decouple/AUDITORIA_INDEPENDENCIA_20260815.md` | Menciona o arquivo como coupling | Referência documental — sem ação necessária |

### 2.3 Dependências de infraestrutura

- **Runner `["self-hosted","vps-zapp","playwright"]`**: Representa acoplamento de infra ao VPS. Remover o workflow elimina esta dependência do CI.
- **`validate-e2e-user.yml`**: Reusable workflow chamado por este e outros workflows E2E. **Não deve ser removido** — outros workflows o usam.
- **RPC `rpc_e2e_validate_user()`**: Função Supabase chamada pela validação. Permanece ativa para outros workflows.

### 2.4 O que NÃO precisa migrar para `evolution-stack`

Os specs testam o **ZAPP**, não a Evolution API. Portanto:
- Os 6 arquivos `.spec.ts` **permanecem em `zapp-web-v3`**
- Nenhuma migração para `evolution-stack` é necessária
- Os specs serão cobertos explicitamente via realocação (ver Seção 3)

---

## 3. Plano de Migração (Pré-remoção)

### 3.1 Ações necessárias antes de remover o workflow

#### Passo M1 — Adicionar 5 specs ao workflow `e2e-inbox-vps.yml` (ou equivalente)

O spec `admin-evolution-api-smoke.spec.ts` já está em `e2e-admin-vps.yml`. Os 5 restantes precisam de cobertura explícita além da nightly para garantir feedback rápido em PRs:

Adicionar ao `e2e-inbox-vps.yml` (ou criar `e2e-whatsapp-vps.yml`):
```yaml
# Specs atualmente somente no e2e-evolution-vps.yml (exceto admin-smoke, já em e2e-admin-vps.yml)
- e2e/evolution-retry-failure.spec.ts
- e2e/evolution-media-retry-failure.spec.ts
- e2e/whatsapp-connection.spec.ts
- e2e/whatsapp-reactions-realtime.spec.ts
- e2e/whatsapp-reactions-advanced.spec.ts
```

> **Nota:** Este passo é **recomendado, não bloqueante**. O invariante I3 passa apenas com a remoção do arquivo. A nightly garante cobertura. Este passo apenas melhora o feedback em PRs.

#### Passo M2 — Atualizar `decouple-guard.yml` para guardar contra regressão

Adicionar ao job `infra-regression` o check de ausência de `e2e-evolution*.yml`:

```yaml
- name: Verificar ausência de workflows Evolution E2E neste repo
  run: |
    if ls .github/workflows/e2e-evolution*.yml 2>/dev/null; then
      echo "ERRO: workflows e2e-evolution* pertencem ao evolution-stack, não ao zapp-web."
      exit 1
    fi
```

Este passo **deve ser executado junto com a remoção** para fechar o gap de segurança identificado.

#### Passo M3 — Remover ou arquivar `scripts/run-e2e-evolution-vps.sh`

O script local é o equivalente manual do workflow. Deve ser removido para evitar confusão:
```bash
git rm scripts/run-e2e-evolution-vps.sh
```

Alternativamente, renomear e adaptar para executar os specs como parte de `run-e2e-vps.sh` (se existir).

---

## 4. Plano de Remoção Segura

### 4.1 Pré-condições

- [ ] `e2e-nightly-full.yml` está ativo e executando `test:e2e:full` (confirmado: existe)
- [ ] `admin-evolution-api-smoke.spec.ts` está em `e2e-admin-vps.yml` (confirmado: está)
- [ ] Branch de trabalho: `claude/evolution-zapp-separation-analysis-29lixd`

### 4.2 Sequência de remoção

```bash
# 1. Checkout da branch correta
git checkout claude/evolution-zapp-separation-analysis-29lixd
git pull origin claude/evolution-zapp-separation-analysis-29lixd

# 2. Remover o workflow
git rm .github/workflows/e2e-evolution-vps.yml

# 3. Remover o script local equivalente
git rm scripts/run-e2e-evolution-vps.sh

# 4. Atualizar decouple-guard.yml (adicionar check de e2e-evolution*.yml)
# [editar .github/workflows/decouple-guard.yml conforme Seção 3 - Passo M2]

# 5. (Opcional mas recomendado) Mover specs para e2e-inbox-vps.yml
# [editar .github/workflows/e2e-inbox-vps.yml conforme Seção 3 - Passo M1]

# 6. Verificar cobertura localmente
node scripts/check-e2e-spec-coverage.mjs

# 7. Commit
git add -A
git commit -m "feat(decouple): E25 — remove e2e-evolution-vps.yml, fecha I3 [skip-e46]"

# 8. Push
git push origin claude/evolution-zapp-separation-analysis-29lixd
```

### 4.3 Verificação pós-remoção

```bash
# Confirmar que o arquivo sumiu
ls .github/workflows/e2e-evolution-vps.yml 2>/dev/null && echo "AINDA EXISTE" || echo "OK — arquivo removido"

# Confirmar cobertura de specs (deve retornar "Nenhum spec órfão")
node scripts/check-e2e-spec-coverage.mjs

# Simular check do measure-invariants (I3)
if [ -f ".github/workflows/e2e-evolution-vps.yml" ]; then
  echo "I3: FAIL"
else
  echo "I3: PASS"
fi
```

### 4.4 Plano de rollback

Se houver regressão crítica após a remoção:

```bash
# Restaurar o arquivo removido a partir do commit anterior
git show HEAD~1:.github/workflows/e2e-evolution-vps.yml > .github/workflows/e2e-evolution-vps.yml
git show HEAD~1:scripts/run-e2e-evolution-vps.sh > scripts/run-e2e-evolution-vps.sh
git add .github/workflows/e2e-evolution-vps.yml scripts/run-e2e-evolution-vps.sh
git commit -m "revert(decouple): rollback E25 — restaura e2e-evolution-vps.yml temporariamente"
git push origin claude/evolution-zapp-separation-analysis-29lixd
```

**Condições que justificam rollback:**
- Falha crítica de cobertura E2E não detectada pelo nightly
- Quebra do `validate-e2e-user.yml` que afete outros workflows (improvável — não usa este workflow)
- Regressão em comportamento de retry/connection não coberta por outros specs

**Condições que NÃO justificam rollback:**
- Invariante I3 passar para FAIL (esse é o objetivo da remoção, não um problema)
- `check-e2e-spec-coverage.mjs` reportar orphans (verificar: se nightly existe, não haverá orphans)

---

## 5. Critério de Aceite

### 5.1 Invariante I3 — Definição formal (`measure-invariants.yml`)

```bash
# I3 — e2e-evolution-vps.yml ausente deste repo
if [ -f ".github/workflows/e2e-evolution-vps.yml" ]; then
  echo "I3_STATUS=FAIL"
  echo "I3_DETAIL=arquivo .github/workflows/e2e-evolution-vps.yml presente (deve estar em evolution-stack)"
else
  echo "I3_STATUS=PASS"
  echo "I3_DETAIL=arquivo ausente"
fi
```

### 5.2 Checklist de aceite

| Critério | Como verificar | Status |
|----------|----------------|--------|
| `e2e-evolution-vps.yml` removido do repo | `ls .github/workflows/e2e-evolution-vps.yml` → "No such file" | Pendente |
| I3 em `measure-invariants.yml` = PASS | Executar workflow ou simular o script acima | Pendente |
| `check-e2e-spec-coverage.mjs` sem orphans | `node scripts/check-e2e-spec-coverage.mjs` → "Nenhum spec órfão" | Pendente |
| `decouple-guard.yml` atualizado | Job `infra-regression` verifica ausência de `e2e-evolution*.yml` | Pendente |
| `scripts/run-e2e-evolution-vps.sh` removido | `ls scripts/run-e2e-evolution-vps.sh` → "No such file" | Pendente |
| Nightly continua executando todos os specs | `e2e-nightly-full.yml` via `test:e2e:full` | Já ativo |
| `admin-evolution-api-smoke.spec.ts` coberto explicitamente | `e2e-admin-vps.yml` já o lista | Já ativo |

### 5.3 Impacto no PLANO_INDEPENDENCIA (FASE 2)

Este item fecha especificamente a rubrica de acoplamento de CI identificada na auditoria de 2026-08-15:

> "e2e-evolution-vps.yml cria acoplamento de CI: runner VPS rotulado como 'vps-zapp', timeout 45min, secrets Evolution vinculados ao runner de infra do Evolution. Remove coupling de infraestrutura observável no histórico do repositório."

Após a conclusão, a FASE 2 pode prosseguir para os itens E26–E38 sem esta pendência de CI.

---

## 6. Observações Adicionais

### 6.1 Distinção importante sobre "I3"

Existem **duas definições de "I3"** neste projeto — não confundir:

| Contexto | I3 = | Status atual |
|----------|------|--------------|
| `measure-invariants.yml` (CI) | Ausência de `e2e-evolution-vps.yml` | FAIL (arquivo presente) |
| `PLANO_INDEPENDENCIA_100_ETAPAS_20260815.md` (DB) | Ausência de FKs cross-schema | FAIL (6 FKs existem — E64–E66) |

Este plano trata **exclusivamente** do I3 de CI. O I3 de DB (FKs) é trabalho separado das etapas E64–E66.

### 6.2 Por que os specs permanecem em `zapp-web-v3`

Os 6 specs testam o **ZAPP** (frontend, lógica de retry, UI de conexão, reações) usando mocks que simulam respostas da Evolution API. Eles **não integram** com a Evolution API real. Portanto:

- Pertencem ao repo `zapp-web-v3` (testam código deste repo)
- Não devem ser migrados para `evolution-stack`
- O acoplamento era no *workflow* (nome, runner, agrupamento), não nos specs

### 6.3 Gap de segurança no `decouple-guard.yml`

O guard atual (job `infra-regression`) verifica:
- Ausência de `infra/evolution*`
- Ausência de `publish-evolution*.yml`

**Não verifica** ausência de `e2e-evolution*.yml`. O Passo M2 do plano fecha este gap. Sem essa correção, um futuro commit poderia recriar `e2e-evolution-vps.yml` sem ser bloqueado pelo guard.

---

*Documento gerado em 2026-08-15 como parte do plano de independência Evolution/ZAPP.*
*Referência: `docs/decouple/PLANO_INDEPENDENCIA_100_ETAPAS_20260815.md` — E25 (FASE 2)*
