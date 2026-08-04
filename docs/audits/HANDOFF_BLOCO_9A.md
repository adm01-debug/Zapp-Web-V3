# HANDOFF — Bloco 9A (etapas 81-85): Resiliência e edge cases

**Repo:** `adm01-debug/zapp-web-v3` · **branch:** `main` · **HEAD:** `99a4d82ba` (2026-08-02)
**Sessão anterior:** fechou Tema 14 (Bloco 8 SLA/BPM, 17 achados F8-01..F8-17) em `e05f763f3`.
**Missão desta sessão:** executar **etapas 81-85 do PLANO_QA_ANALISE_100** com profundidade cheia, popular **Tema 15 parcial** no PLANO_IMPLEMENTACAO com achados `F9-01..F9-N`, commitar.

Bloco 9B (etapas 86-90) fica para a sessão seguinte — não misturar.

---

## 1. Modelo mental — LEIA ANTES DE MEDIR

Três documentos vivos, cada um com papel específico. **Não confundir:**

| Arquivo | Papel |
|---|---|
| `docs/audits/PLANO_QA_ANALISE_100.md` | **Roteiro fixo**, 100 etapas, sua bússola. NÃO editar. |
| `docs/audits/PLANO_IMPLEMENTACAO_100.md` | **Documento vivo** que você popula com achados reais. Formato Origem/Evidência/Ação/Aceite. Convenção `F<bloco>-<seq>` (F9-01, F9-02, …). |
| `docs/audits/RELATORIO_EXECUCAO_ANALISE.md` | Resumo executivo por bloco. Atualizar ao final. |

**Regra dura da sessão anterior (que precisou ser reforçada):** para cada etapa você deve produzir **os 7 itens medidos abaixo**. Achado sem medição = achado inválido. Se não tem 7 itens, não registra.

### Padrão de profundidade obrigatório por etapa

Para cada tabela, cron, função ou página tocada pela etapa, mandatoriamente:

1. **`describe_table`** — schema completo (colunas, PK/FKs, constraints, índices)
2. **`SELECT COUNT(*)` real** (não estimated) + **`SELECT * LIMIT 5`** (amostra factual)
3. **`list_policies`** + **`list_triggers`**
4. Para cada função referenciada (trigger/RLS/default): **`pg_get_functiondef` inteiro**
5. Para cada cron do escopo: **última execução, próximas 20 execuções em `cron.job_run_details`, corpo do comando SQL**
6. **Grep no frontend** (via container Claude Code): `grep -rn "<termo>" /workspace/repos/zapp-web-v3/src/`
7. Se houver query top-N envolvendo a tabela: **`EXPLAIN (ANALYZE, BUFFERS)`** (corrigindo a lacuna sistêmica da Etapa 17)

**Sem esses 7 itens medidos, achado `F9-XX` não é registrado.**

Achados cross-bloco que você perceber (ex.: constraint `uq_msg_msgid_instance` que impacta F4-XX) vão pro PLANO como `Origem="Etapa <N> (Bloco 9) — cross-ref F4-XX"`.

---

## 2. Escopo — as 5 etapas do Bloco 9A

Copiadas verbatim do PLANO_QA_ANALISE_100.md:

- **81. Rede offline durante envio** — Service Worker enfileira, sincroniza ao voltar (`useOnlineStatus`).
- **82. Rede intermitente** — perda de 30% de pacotes, retry exponencial no supabase-js.
- **83. Supabase down + reconexão** — banner de status, jitter no reconnect, filas locais.
- **84. Evolution API 401 sustentado** — cron `evo-detect-401-bursts` (jobid **173**), instância marcada `disconnected`, alerta.
- **85. Fila cheia (DLQ)** — crons `route-failed-webhooks-to-dlq` (**87**), `dlq-poison-guard` (**146**), `monitor-dlq-health` (**91**).

### Estimativa de custo (para dimensionar)

Medições estimadas: ~31 tool calls só para baseline factual do 9A.
Achados esperados: 8-12 no Tema 15 parcial (F9-01..F9-12 aprox).

---

## 3. Cross-refs já mapeadas (evita retrabalho)

A sessão anterior já registrou achados que tocam etapas 84-85. **Não duplicar.** Registrar novos F9-* como **complementares** apontando pro F<N>-XX pré-existente:

| Etapa 9A | Achado(s) já registrado(s) no PLANO | Nota |
|---|---|---|
| 84 | `F6-19` — `evo.evolution_ip_watch` = 0 rows total, pipeline VPS→DB de detecção 401 morto | Cron 173 é uma variante; investigar se compartilha a mesma cegueira |
| 84 | `F6-20` — `fn_detect_401_bursts` documenta próprio "monitoring gap" | Provavelmente cron 173 chama essa função ou uma irmã |
| 85 | `F4-14` — `zapp.failed_messages` insert silent-fail | DLQ pode ter mesmo padrão |
| 85 | `F4-23` — cron `retry-stuck-messages` opera em tabela vazia | Verificar se DLQ tem drift de tabela similar |

**Para cada etapa 9A, comece checando o F<N>-XX pré-existente e decida:** confirma/refuta/expande. Registrar apenas informação nova.

---

## 4. Ambiente de trabalho

### Repositório local no container Claude Code (VPS)

```
/workspace/repos/zapp-web-v3   (branch main, HEAD 99a4d82ba, working tree limpa)
```

### MCPs autorizados para esta sessão

Todos já conectados. Não peça permissão — use direto:

- **`SUPABASE - PROMO LUX - MCP`** (ou `SUPABASE SELF HOSTED - MCP`) — banco `supabase.atomicabr.com.br`, schema principal `zapp`
- **`CLAUDE CODE - VPS - MCP`** — filesystem do repo, `code_exec`, `code_git`, `code_write_note`, `code_commit`
- **`GITHUB - MCP - FOREVER`** — OAuth do usuário, para operações via GitHub API (não usa PAT)

### Regras de uso de tools

- **`code_git`** bloqueia caracteres `; & | \` $ ( ) { }`. Se precisar deles, use `code_exec` com `working_dir`.
- **`code_commit`** faz stage-all + commit + push. Husky pre-commit foi restaurado (`99a4d82ba`) e vai tentar rodar `bun` — se falhar, desabilite temporariamente com `mv .husky/pre-commit .husky/pre-commit.disabled_temp` antes do commit e restaure depois no mesmo comando.
- **Push authentication**: cred store do container está com PAT expirado. Se `git push` falhar com "Invalid username or token", **pare e peça o PAT** — não invente credenciais. O usuário rotaciona PATs manualmente e passa quando necessário.
- **`code_write_note`** aceita `content` grande (UTF-8) direto como parâmetro — use para gerar o Tema 15 antes de anexar ao PLANO. Não perca tempo com base64 heredoc.

### 4.1 Rotina canônica de merge Tema 15 → PLANO_IMPLEMENTACAO_100

**Esta é a fonte única de verdade da rotina de merge.** Outras seções (§6 Passo 3) referenciam este bloco. Se editar, edite aqui.

1. Escrever `/workspace/notes/tema15.md` via `code_write_note` (conteúdo UTF-8 direto)
2. Atualizar header do PLANO via `sed`:
   ```
   sed -i 's|172\*\* (... + 17 Bloco 8)\.|<NOVO_TOTAL>** (... + 17 Bloco 8 + <N_9A> Bloco 9A).|' docs/audits/PLANO_IMPLEMENTACAO_100.md
   ```
3. Anexar tema15: `printf '\n\n' >> ...PLANO... && cat /workspace/notes/tema15.md >> ...PLANO...`
4. Verificar contagem: `grep -c "^### F" ...PLANO...` deve bater com novo total
5. Commit: `code_commit` com mensagem no padrão `docs(audit): PLANO — Tema 15 parcial (Bloco 9A, N achados F9-01..F9-N)`

---

## 5. Convenções de escrita dos achados F9-*

Formato canônico (copiado dos F8-*):

```markdown
### F9-XX — <SEVERIDADE> (<Pn>): <título curto e específico>

- **Origem:** Etapa <N> (Bloco 9A).
- **Evidência:** <query executada + saída resumida | grep resultado | pg_get_functiondef trecho relevante | schedule + últimas N execuções do cron>. Ser cirúrgico: 3-6 linhas de evidência tangível.
- **Ação:**
  1. <passo concreto de correção>
  2. <passo 2>
  3. <passo 3 se necessário>
- **Aceite:** <critério mensurável — comando SQL, teste vitest, grep count, EXPLAIN plan>. Um único critério objetivo.
```

**Severidades usadas no PLANO:**
- `CRÍTICO (P0)` — bug em produção, LGPD/segurança, dado corrompido, feature morta
- `ALTO (P0)` — funcionalidade quebrada mas não crítica de segurança
- `MÉDIO (P1)` — dead code, redundância estrutural, drift de schema não crítico
- `BAIXO (P1)` — higienização, ruído semântico, oportunidade de refactor

**Cross-ref quando aplicável:** primeira linha após título, entre parênteses: `(cross-ref: F6-19, F6-20)`.

### 5.1 Exemplo âncora — calibra o "gosto" antes de escrever

Este é um F9-XX fictício mas seguindo exatamente o padrão dos F8-* aprovados. Use como termômetro: se o seu achado real tem esse mesmo nível de concretude, está bom. Se está mais vago, volte e meça mais.

```markdown
### F9-04 — ALTO (P0): cron `route-failed-webhooks-to-dlq` (87) opera em tabela sem índice em `retry_count`, forçando seq scan a cada minuto
(cross-ref: F4-14)

- **Origem:** Etapa 85 (Bloco 9A).
- **Evidência:**
  - `SELECT schedule, command FROM cron.job WHERE jobid=87` → `* * * * *` executando `SELECT evo.fn_route_failed_to_dlq(50)`.
  - `SELECT COUNT(*) FROM evo.evolution_webhook_failed` = 14.223 rows, mas apenas 87 com `retry_count >= 5`.
  - `describe_table evo.evolution_webhook_failed` → sem índice em `retry_count`; apenas PK e FK em `instance_id`.
  - `EXPLAIN (ANALYZE, BUFFERS) SELECT ... WHERE retry_count >= 5 AND status='pending' LIMIT 50` → **Seq Scan** em 14.223 rows, 87ms, 412 buffers hit. Custo total: cron roda 1440x/dia = ~2 min CPU/dia desperdiçados.
  - `SELECT COUNT(*) FILTER (WHERE start_time > NOW()-INTERVAL '24h') FROM cron.job_run_details WHERE jobid=87` = 1440 execuções, 100% succeeded, mas 1353 (94%) processaram 0 rows.
- **Ação:**
  1. `CREATE INDEX CONCURRENTLY idx_evo_webhook_failed_retry_pending ON evo.evolution_webhook_failed (retry_count, status) WHERE status='pending'`.
  2. Reduzir frequência do cron de `* * * * *` para `*/5 * * * *` (94% no-op não justifica minuto).
  3. Adicionar `early return` na função se `COUNT(*) WHERE status='pending'` = 0 (evita EXPLAIN scan mesmo com índice).
- **Aceite:** `EXPLAIN (ANALYZE) SELECT ... WHERE retry_count >= 5 AND status='pending' LIMIT 50` retorna `Index Scan using idx_evo_webhook_failed_retry_pending`, execution time < 5ms.
```

**Por que este exemplo funciona como âncora:**
- Evidência tem número (14.223 rows, 87ms, 94% no-op) — não "muitas linhas" ou "lento".
- Ação é executável hoje (comandos SQL exatos, não "otimizar índice").
- Aceite é binário verificável (plan node muda de `Seq Scan` para `Index Scan`, tempo cai de 87ms → <5ms).
- Cross-ref aponta para F4-14 sem duplicar seu conteúdo.

Se ao escrever um F9 real você não consegue produzir Evidência com números, Ação com comandos, e Aceite com verificação binária — **volte a medir**.

---

## 6. Playbook de execução — passo a passo

### Passo 0 — Sanidade inicial

```bash
cd /workspace/repos/zapp-web-v3
git status --short          # deve estar limpo
git log --oneline -3        # confirmar HEAD 99a4d82ba
grep -c "^### F" docs/audits/PLANO_IMPLEMENTACAO_100.md   # deve retornar 172
grep "Total de achados" docs/audits/PLANO_IMPLEMENTACAO_100.md  # deve dizer "172"
```

Se algo divergir, **pare e reporte** antes de medir. Veja também §8.1 (critérios de aborto).

### Passo 1 — Baseline factual das 5 etapas (~31 tool calls)

Execute na ordem. Registre resultados brutos em `/workspace/notes/bloco9a-baseline.md` conforme mede — não deixe pra depois.

**Etapa 81 — Rede offline**
- `grep -rn "useOnlineStatus\|navigator.onLine\|online.*offline" src/` (contar hits, identificar arquivos)
- `grep -rn "serviceWorker\|workbox\|vite-plugin-pwa" src/ vite.config.ts`
- Verificar `zapp.outbound_message_queue` (COUNT + amostra) — cross-ref F4-23

**Etapa 82 — Rede intermitente**
- `grep -rn "retry\|backoff\|exponential" src/lib/supabase*` (config do cliente)
- Verificar existência de wrapper com retry em `src/services/`

**Etapa 83 — Supabase down + reconexão**
- `grep -rn "NetworkStatus\|SupabaseStatus\|connection.*status" src/components/`
- `grep -rn "jitter\|reconnect" src/`
- Verificar filas locais em `useMessageQueue.ts` (cross-ref F4-10, F4-11)

**Etapa 84 — Evolution API 401 sustentado**
- `SELECT * FROM cron.job WHERE jobid = 173` (schedule + command)
- `pg_get_functiondef('evo.fn_detect_401_bursts'::regproc)` (ou nome real da função chamada)
- `SELECT * FROM cron.job_run_details WHERE jobid = 173 ORDER BY start_time DESC LIMIT 20`
- `SELECT COUNT(*), MIN(created_at), MAX(created_at) FROM evo.evolution_ip_watch` (validar F6-19)
- `grep -rn "fn_detect_401\|evolution_ip_watch" src/ supabase/functions/`

**Etapa 85 — Fila cheia (DLQ)**
- 3 crons de uma vez:
  ```sql
  SELECT jobid, jobname, schedule, command, active
  FROM cron.job WHERE jobid IN (87, 146, 91);
  ```
- Para cada função chamada por esses 3 crons: `pg_get_functiondef`
- `SELECT COUNT(*), COUNT(*) FILTER (WHERE status='succeeded') FROM cron.job_run_details WHERE jobid IN (87,146,91) AND start_time > NOW() - INTERVAL '7 days'`
- Identificar tabela DLQ real (provavelmente `evo.evolution_webhook_dlq` ou `zapp.dead_letter_queue`) → `describe_table` + COUNT + amostra + policies + triggers
- `grep -rn "dlq\|dead.letter\|dead_letter" src/ supabase/functions/`

### Passo 2 — Interpretação e escrita dos F9-*

Só depois do baseline completo. Regra: se em 3 minutos você não consegue escrever Evidência + Ação + Aceite tangíveis para um achado candidato, **não é achado ainda** — volte a medir. Calibre pelo exemplo âncora em §5.1.

**Sinal claro de achado real** (padrão observado nos F8-*):
- Divergência entre documentação/handoff e realidade medida
- Tabela 0 rows onde código assume dados
- Função stub com `BEGIN RETURN NEW; END;`
- Cron rodando N vezes/dia mas sempre no-op ou early-return
- RLS `USING(true)` em tabela sensível
- Fallback silencioso que mascara ausência de dados (like F8-07 `overallRate=100`)
- Hardcode que impede escalar (like F6-06 `wpp2` hardcoded)
- Smoke test data em produção há semanas
- Search_path fragil com resolução implícita via views

### Passo 3 — Commit + push

**Siga a rotina canônica em §4.1.** Não duplico aqui para evitar drift entre as duas cópias.

Resumo dos gates:
- Contagem `grep -c "^### F"` bate com novo total antes de commitar
- Header do PLANO atualizado (172 → 172+N)
- `code_commit` com mensagem `docs(audit): PLANO — Tema 15 parcial (Bloco 9A, N achados F9-01..F9-N)`
- Se `git push` falhar por auth → **pare e peça PAT novo ao usuário** (§8.1)

### Passo 4 — Atualizar RELATORIO_EXECUCAO_ANALISE

Adicionar seção Bloco 9A com resumo executivo (5-10 linhas): quantos achados, quais P0, principais surpresas, cross-refs. **Não copiar Ação/Aceite** — só evidência agregada. Commit separado ou junto, seu critério.

---

## 7. Contexto operacional do produto (para calibrar severidade)

- Empresa: **Promo Brindes** — produtos promocionais, ~50 pessoas, canal principal WhatsApp via **Evolution API v2.3.7** (instância `wpp2`, ~20k contatos, 17.5k mensagens em `wpp2`, 2.9k em `wpp_pink_test`).
- Stack: React + Supabase self-hosted (`supabase.atomicabr.com.br`, schema principal `zapp`), Docker Swarm, Traefik, Portainer.
- Módulo BPM em `bpm.*` (41 tabelas) está **totalmente vazio em produção** (F8-02) — provavelmente hibernando.
- Cron manager: `pg_cron`. `cron.job_run_details` tem histórico de 7 dias.
- Status geral: v3 em produção, este audit visa fechar "Excelência 10/10" para gate de release.

---

## 8. O que NÃO fazer

- **Não** rodar as etapas 86-90 (fica pro Bloco 9B).
- **Não** editar `PLANO_QA_ANALISE_100.md` (é roteiro fixo).
- **Não** registrar achado sem os 7 itens medidos.
- **Não** duplicar achados que apenas confirmam F6-19/F6-20/F4-14/F4-23. Crie novo F9-* apenas se traz informação **nova**; se apenas confirma, referencie na seção de cross-refs do Tema 15 (adicione um bullet no header do tema, sem número F).
- **Não** rodar `git push --force`, `git reset --hard origin/main`, `git rebase -i` — sessão anterior teve incidente catastrófico (memória do usuário: `departamento-pessoal-v2` perdeu 30k commits por force-push). Apenas commits normais + push simples.
- **Não** inventar credenciais. PAT expirado → pare, peça, espere.
- **Não** narrar dezenas de linhas de "vou medir X". Meça, registre, siga. Comunicação verbosa é overhead.

### 8.1 Critérios de aborto — sessão inteira interrompida

Diferente dos "pare e reporte" pontuais no playbook, estes critérios interrompem **a sessão como um todo**. Não tente contornar, não improvise, não meça nada além do necessário para confirmar o gatilho:

| Gatilho | Verificação | Ação |
|---|---|---|
| **HEAD divergente** | `git log --oneline -1` ≠ `99a4d82ba` | Pare. Reporte HEAD atual. Peça reconciliação antes de medir. |
| **Contagem de achados divergente** | `grep -c "^### F" docs/audits/PLANO_IMPLEMENTACAO_100.md` ≠ `172` | Pare. Reporte contagem real. Alguém editou o PLANO em paralelo. |
| **Working tree suja** | `git status --short` não vazio | Pare. Reporte arquivos modificados. Não commite por cima. |
| **Banco em recovery / read-only** | Qualquer `SELECT pg_is_in_recovery()` → `t`, ou `SHOW transaction_read_only` → `on` | Pare. Reporte estado do banco. Espera restauração antes de medir. |
| **Cron do escopo desaparecido** | `SELECT COUNT(*) FROM cron.job WHERE jobid IN (173, 87, 146, 91)` < 4 | Pare. Reporte quais IDs sumiram. Alguém dropou cron entre sessões. |
| **PAT expirado no push** | `git push` retorna `Invalid username or token` ou `403` | Pare. Peça PAT novo ao usuário. Não invente. Commit local está OK, só o push que trava. |
| **MCP Supabase respondendo `permission denied` sistemático** | Mais de 2 tools consecutivas com `permission denied for schema` | Pare. Reporte qual credencial. Provavelmente role revogado ou schema search_path mudou. |

**Regra geral:** melhor abortar cedo e reportar do que gerar achado F9-* baseado em premissa quebrada. Um handoff sujo custa muito mais que uma sessão pausada.

---

## 9. Definição de pronto para esta sessão

- [ ] Baseline factual completo das 5 etapas em `/workspace/notes/bloco9a-baseline.md`
- [ ] Tema 15 parcial com N achados F9-01..F9-N (N esperado: 8-12)
- [ ] PLANO_IMPLEMENTACAO_100.md com contador atualizado e Tema 15 parcial anexado
- [ ] Commit no origin/main via padrão `docs(audit): PLANO — Tema 15 parcial (Bloco 9A, N achados F9-01..F9-N)`
- [ ] RELATORIO_EXECUCAO_ANALISE.md atualizado com seção Bloco 9A (5-10 linhas)
- [ ] Cross-refs para F6-19/F6-20/F4-14/F4-23 explicitados quando aplicável

---

## 10. Handoff para Bloco 9B (próxima sessão)

> **Esta seção é registro passivo, não convite.** Nenhuma medição, nenhum achado F9-* pode nascer de escopo 86-90 durante o 9A. Se durante o 9A você esbarrar em algo relacionado ao 9B, **anote em uma linha aqui e siga**. Se está em dúvida se algo é 9A ou 9B, é 9B — ignore e siga.

Ao final, escreva no fim de `/workspace/notes/bloco9a-baseline.md` uma seção **"Deixado para 9B"** com:
- Escopo restante (86-90) e crons/tabelas já pré-identificados
- Descobertas laterais durante 9A que impactam 9B (ex.: se ao investigar DLQ você já mapeou parcialmente o guardian, registre uma linha só)
- Estimativa atualizada de medições para 9B

Bloco 9B abrange:
- **86** Deadman switch — crons `guardian-heartbeat-sync` (131), `guardian-db-heartbeat-resilient` (193), `check-guardian-alive` (188)
- **87** Race condition — constraint `uq_msg_msgid_instance`
- **88** Idempotência — `zapp.webhook_events_processed` (171k rows)
- **89** Timeout > 30s — `statement_timeout` no role PostgREST
- **90** Circuit breaker — edge functions Evolution

---

**FIM DO HANDOFF.** Boa medição. Comece pelo Passo 0.
